"""
UltrON — Publish a new release
================================
Usage:
    python publish_release.py [--patch|--minor|--major] [--skip-build] [--dry-run]

Reads current version from client backend config.py (single source of truth),
bumps it, updates all files, builds frontend + EXE, tags, pushes, and creates
a GitHub release with both UltrON.exe and UltrON_Installer.exe attached.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
BACKEND_DIR = SCRIPT_DIR / "backend" / "ultron_backend"
CONFIG_PY = BACKEND_DIR / "app" / "config.py"
VERSION_INFO = BACKEND_DIR / "version_info.txt"
DIST_DIR = BACKEND_DIR / "dist"
EXE_PATH = DIST_DIR / "UltrON.exe"
INSTALLER_PATH = DIST_DIR / "UltrON_Installer.exe"
FRONTEND_DIR = SCRIPT_DIR / "frontend"
BUILD_BAT = SCRIPT_DIR / "build_exe.bat"
SERVER_DOWNLOADS_PY = SCRIPT_DIR.parent / "server" / "backend" / "app" / "api" / "endpoints" / "downloads.py"

REPO = "bitraneerajbabu/UltronPC"


# ─── Auth ────────────────────────────────────────────────────────────────────

def _get_token() -> str:
    tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not tok:
        tf = SCRIPT_DIR / "github_token.txt"
        if tf.exists():
            tok = tf.read_text().strip()
    if not tok:
        if "--ci" in sys.argv:
            return "dummy_token"
        print("Error: set GITHUB_TOKEN env var or create github_token.txt", file=sys.stderr)
        sys.exit(1)
    return tok

TOKEN = _get_token()


# ─── Version helpers ─────────────────────────────────────────────────────────

def read_current_version() -> str:
    text = CONFIG_PY.read_text(encoding="utf-8")
    m = re.search(r'APP_VERSION:\s*str\s*=\s*"([^"]+)"', text)
    if not m:
        print(f"Error: cannot find APP_VERSION in {CONFIG_PY}", file=sys.stderr)
        sys.exit(1)
    return m.group(1)


def write_config_version(version: str):
    text = CONFIG_PY.read_text(encoding="utf-8")
    updated = re.sub(
        r'(APP_VERSION:\s*str\s*=\s*)"([^"]+)"',
        lambda m: f'{m.group(1)}"{version}"',
        text,
    )
    CONFIG_PY.write_text(updated, encoding="utf-8")


def write_version_info(version: str):
    parts = tuple(int(x) for x in version.split("."))
    while len(parts) < 4:
        parts = (*parts, 0)
    text = VERSION_INFO.read_text(encoding="utf-8")
    updated = re.sub(r"filevers=\([^)]+\)", f"filevers={parts}", text)
    updated = re.sub(r"prodvers=\([^)]+\)", f"prodvers={parts}", updated)
    updated = re.sub(r"(FileVersion',\s*')[\d.]+\s*'", f"FileVersion', '{'.'.join(str(p) for p in parts)}'", updated)
    updated = re.sub(r"(ProductVersion',\s*')[\d.]+\s*'", f"ProductVersion', '{'.'.join(str(p) for p in parts)}'", updated)
    VERSION_INFO.write_text(updated, encoding="utf-8")


def write_server_downloads(version: str):
    if not SERVER_DOWNLOADS_PY.exists():
        return
    tag = f"v{version}"
    text = SERVER_DOWNLOADS_PY.read_text(encoding="utf-8")
    updated = re.sub(
        r'CURRENT_VERSION\s*=\s*"[^"]+"',
        f'CURRENT_VERSION = "{tag}"',
        text,
    )
    updated = re.sub(
        r'release_notes":\s*"[^"]*"',
        lambda m: f'release_notes": "UltrON {tag}"',
        updated,
    )
    SERVER_DOWNLOADS_PY.write_text(updated, encoding="utf-8")


def write_publish_script_tag(version: str):
    text = (SCRIPT_DIR / "publish_release.py").read_text(encoding="utf-8")
    tag = f"v{version}"
    updated = re.sub(
        r'^TAG\s*=\s*"[^"]*"',
        f'TAG = "{tag}"',
        text,
        flags=re.MULTILINE,
    )
    (SCRIPT_DIR / "publish_release.py").write_text(updated, encoding="utf-8")


_TAG = None

def tag() -> str:
    global _TAG
    if _TAG is None:
        _TAG = f"v{read_current_version()}"
    return _TAG


def bump_version(current: str, level: str) -> str:
    parts = [int(x) for x in current.split(".")]
    if level == "major":
        parts = [parts[0] + 1, 0, 0]
    elif level == "minor":
        parts = [parts[0], parts[1] + 1, 0]
    else:
        parts = [parts[0], parts[1], parts[2] + 1]
    return ".".join(str(p) for p in parts)


# ─── Build ────────────────────────────────────────────────────────────────────

def build_frontend():
    print("\n[build] Building frontend...")
    r = subprocess.run(
        ["npm", "run", "build"],
        cwd=str(FRONTEND_DIR),
        capture_output=True, text=True,
    )
    print(r.stdout)
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr)
        print("[build] Frontend build FAILED", file=sys.stderr)
        sys.exit(1)
    print("[build] Frontend built OK")


def build_exe():
    print("\n[build] Building EXE + Installer via build_exe.bat...")
    r = subprocess.run(
        ["cmd", "/c", str(BUILD_BAT)],
        cwd=str(SCRIPT_DIR),
        capture_output=True, text=True,
    )
    print(r.stdout[-3000:] if len(r.stdout) > 3000 else r.stdout)
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr)
        print("[build] EXE build FAILED", file=sys.stderr)
        sys.exit(1)
    if not EXE_PATH.exists():
        print(f"[build] {EXE_PATH} not found after build!", file=sys.stderr)
        sys.exit(1)
    print(f"[build] {EXE_PATH.name} built ({EXE_PATH.stat().st_size // 1024} KB)")


# ─── Git ──────────────────────────────────────────────────────────────────────

def git_commit_push(version: str):
    tag_name = f"v{version}"
    print(f"\n[git] Committing version bump to {version}...")
    subprocess.run(["git", "add", "-A"], cwd=str(SCRIPT_DIR.parent), check=True)
    subprocess.run(
        ["git", "commit", "-m", f"Bump version to {tag_name}"],
        cwd=str(SCRIPT_DIR.parent), check=True,
    )
    print("[git] Pushing to origin...")
    subprocess.run(["git", "push", "origin"], cwd=str(SCRIPT_DIR.parent), check=True)

    print(f"[git] Creating tag {tag_name}...")
    subprocess.run(
        ["git", "tag", "-a", tag_name, "-m", f"Release {tag_name}"],
        cwd=str(SCRIPT_DIR.parent), check=True,
    )
    subprocess.run(
        ["git", "push", "origin", tag_name],
        cwd=str(SCRIPT_DIR.parent), check=True,
    )
    print(f"[git] Tag {tag_name} pushed")


# ─── GitHub Release API ──────────────────────────────────────────────────────

def _make_request(url, method="GET", headers=None, data=None):
    if headers is None:
        headers = {}
    headers.update({
        "Authorization": f"Bearer {TOKEN}",
        "User-Agent": "UltrON-Publisher/2.0",
        "Accept": "application/vnd.github.v3+json",
    })
    req = urllib.request.Request(url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.reason}", file=sys.stderr)
        print(e.read().decode("utf-8"), file=sys.stderr)
        raise


def _delete_asset(release_id: int, name: str):
    for asset in _make_request(f"https://api.github.com/repos/{REPO}/releases/{release_id}/assets"):
        if asset["name"] == name:
            print(f"  Deleting old {name} (ID: {asset['id']})...")
            req = urllib.request.Request(
                f"https://api.github.com/repos/{REPO}/releases/assets/{asset['id']}",
                method="DELETE",
                headers={"Authorization": f"Bearer {TOKEN}", "User-Agent": "UltrON-Publisher/2.0"},
            )
            with urllib.request.urlopen(req) as _:
                pass
            print("  Done")


def _upload_asset(release_id: int, file_path: Path, asset_name: str):
    print(f"  Uploading {asset_name} ({file_path.stat().st_size // 1024} KB)...")
    file_size = file_path.stat().st_size
    headers = {
        "Content-Type": "application/octet-stream",
        "Content-Length": str(file_size),
    }
    upload_url = f"https://uploads.github.com/repos/{REPO}/releases/{release_id}/assets?name={asset_name}"
    with open(file_path, "rb") as f:
        data = f.read()
    result = _make_request(upload_url, method="POST", headers=headers, data=data)
    print(f"  OK: {result['browser_download_url']}")


def _get_git_log_since(tag: str) -> str:
    try:
        r = subprocess.run(
            ["git", "log", f"{tag}..HEAD", "--oneline", "--no-decorate"],
            cwd=str(SCRIPT_DIR.parent),
            capture_output=True, text=True, check=True,
        )
        lines = [l.strip() for l in r.stdout.strip().split("\n") if l.strip()]
        return "\n".join(lines[:50]) if lines else "(no changes)"
    except Exception:
        return "(see commit log)"


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def create_or_update_release(version: str):
    tag_name = f"v{version}"
    print(f"\n[release] Checking for existing release {tag_name}...")

    try:
        release = _make_request(f"https://api.github.com/repos/{REPO}/releases/tags/{tag_name}")
        print(f"  Found existing release (ID: {release['id']})")
        release_id = release["id"]
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        print(f"  Creating new release...")

        # Get git log for release notes
        prev_tag = _find_previous_tag(tag_name)
        changelog = _get_git_log_since(prev_tag) if prev_tag else "(initial release)"

        release = _make_request(
            f"https://api.github.com/repos/{REPO}/releases",
            method="POST",
            data=json.dumps({
                "tag_name": tag_name,
                "name": f"UltrON {tag_name}",
                "body": f"## Changes since {prev_tag or 'last release'}\n\n{changelog}",
                "draft": False,
                "prerelease": False,
            }).encode("utf-8"),
        )
        release_id = release["id"]
        print(f"  Created release (ID: {release_id})")

    # Generate checksums.json
    checksums = {}
    if EXE_PATH.exists():
        checksums["UltrON.exe"] = _sha256_file(EXE_PATH)
    if INSTALLER_PATH.exists():
        checksums["UltrON_Installer.exe"] = _sha256_file(INSTALLER_PATH)
    checksums_path = DIST_DIR / "checksums.json"
    checksums_path.write_text(json.dumps(checksums, indent=2), encoding="utf-8")
    print(f"  checksums.json generated ({len(checksums)} entries)")

    # Delete old assets, then upload new ones
    _delete_asset(release_id, "UltrON.exe")
    _delete_asset(release_id, "UltrON_Installer.exe")
    _delete_asset(release_id, "checksums.json")

    if EXE_PATH.exists():
        _upload_asset(release_id, EXE_PATH, "UltrON.exe")
    if INSTALLER_PATH.exists():
        _upload_asset(release_id, INSTALLER_PATH, "UltrON_Installer.exe")
    _upload_asset(release_id, checksums_path, "checksums.json")

    print(f"\n  Release URL: https://github.com/{REPO}/releases/tag/{tag_name}")


def _find_previous_tag(current_tag: str) -> str:
    try:
        r = subprocess.run(
            ["git", "tag", "--sort=-version:refname"],
            cwd=str(SCRIPT_DIR.parent),
            capture_output=True, text=True, check=True,
        )
        tags = [t.strip() for t in r.stdout.strip().split("\n") if t.strip()]
        seen = False
        for t in tags:
            if t == current_tag:
                seen = True
                continue
            if seen and re.match(r"^v?\d+\.\d+\.\d+$", t):
                return t
    except Exception:
        pass
    return ""


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Bump version, build, and publish UltrON release")
    parser.add_argument("--patch", action="store_true", help="Bump patch (default)")
    parser.add_argument("--minor", action="store_true", help="Bump minor")
    parser.add_argument("--major", action="store_true", help="Bump major")
    parser.add_argument("--set-version", help="Explicit version (e.g. 1.2.3) — skip bump")
    parser.add_argument("--skip-build", action="store_true", help="Skip frontend + EXE build")
    parser.add_argument("--ci", action="store_true", help="CI mode: bump version + push tag only. GitHub Actions builds and releases.")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be done without doing it")
    args = parser.parse_args()

    current = read_current_version()
    print(f"Current version (from config.py): {current}")

    if args.set_version:
        new_version = args.set_version.lstrip("v")
    else:
        level = "patch"
        if args.minor:
            level = "minor"
        elif args.major:
            level = "major"
        new_version = bump_version(current, level)

    new_tag = f"v{new_version}"
    print(f"New version: {new_tag}")

    if new_version == current and not args.set_version:
        print("Version unchanged. Use --patch/--minor/--major or --set-version to bump.")
        sys.exit(0)

    if args.dry_run:
        print("\n[Dry Run] Would do the following:")
        print(f"  - Update config.py: {current} -> {new_version}")
        print(f"  - Update version_info.txt")
        print(f"  - Update server downloads.py")
        print(f"  - Update publish_release.py TAG")
        if not args.skip_build and not args.ci:
            print(f"  - Build frontend + EXE + Installer")
        print(f"  - Git commit + push + tag {new_tag}")
        if args.ci:
            print(f"  - (CI mode: GitHub Actions will build + release)")
        else:
            print(f"  - Create/update GitHub release + upload assets")
        return

    # 1. Update all version files
    step = 1
    print(f"\n[{step}/4] Updating version files...")
    write_config_version(new_version)
    write_version_info(new_version)
    write_server_downloads(new_version)
    write_publish_script_tag(new_version)
    print(f"  config.py, version_info.txt, downloads.py, publish_release.py updated")

    if args.ci:
        # CI mode: bump + push tag only. GitHub Actions handles build + release.
        step = 2
        print(f"\n[{step}/4] CI mode: skipping local build (GitHub Actions will build)")
        step = 3
        print(f"\n[{step}/4] Committing and pushing to git...")
        git_commit_push(new_version)
        print(f"\n{'='*50}")
        print(f"  Tag {new_tag} pushed. GitHub Actions will build and release.")
        print(f"  https://github.com/{REPO}/actions")
        print(f"{'='*50}")
        return

    # 2. Build
    if not args.skip_build:
        step = 2
        print(f"\n[{step}/4] Building...")
        build_frontend()
        build_exe()
    else:
        print(f"\n[2/4] Skipping build (--skip-build)")

    # 3. Git commit + push + tag
    step = 3
    print(f"\n[{step}/4] Committing and pushing to git...")
    git_commit_push(new_version)

    # 4. Create/update GitHub release
    step = 4
    print(f"\n[{step}/4] Creating/updating GitHub release...")
    create_or_update_release(new_version)

    print(f"\n{'='*50}")
    print(f"  Release {new_tag} published!")
    print(f"  https://github.com/{REPO}/releases/tag/{new_tag}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
