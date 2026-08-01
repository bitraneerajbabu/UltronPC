"""
UltrON v1.1 — GitHub Release Publisher
Generates checksums.json + creates a GitHub release with UltrON.exe and checksums.json

Usage:
    python release_publish.py --token <GITHUB_PAT> --version 1.1

GitHub PAT needs: repo (write) permissions
"""
import argparse
import hashlib
import json
import os
import sys
import urllib.request
import urllib.error

REPO = "bitraneerajbabu/UltronPC"
EXE_PATH = os.path.join(os.path.dirname(__file__), "dist", "UltrON.exe")


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def api_request(url: str, method: str = "GET", body=None, token: str = None, content_type: str = "application/json") -> dict:
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "UltrON-Release/1.0",
    }
    if token:
        headers["Authorization"] = f"token {token}"
    if body is not None:
        headers["Content-Type"] = content_type

    data = body if isinstance(body, bytes) else (json.dumps(body).encode() if body else None)
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"HTTP {e.code}: {error_body[:500]}")
        raise


def upload_asset(upload_url: str, asset_name: str, asset_path: str, token: str, content_type: str = "application/octet-stream"):
    """Upload asset to GitHub release upload URL."""
    # upload_url looks like: https://uploads.github.com/repos/.../releases/123/assets{?name,label}
    base_url = upload_url.split("{")[0]
    url = f"{base_url}?name={asset_name}"

    file_size = os.path.getsize(asset_path)
    print(f"  Uploading {asset_name} ({file_size / 1024 / 1024:.1f} MB)...")

    headers = {
        "Authorization": f"token {token}",
        "Content-Type": content_type,
        "Content-Length": str(file_size),
        "User-Agent": "UltrON-Release/1.0",
        "Accept": "application/vnd.github.v3+json",
    }
    with open(asset_path, "rb") as f:
        data = f.read()

    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            result = json.loads(resp.read().decode())
            print(f"  ✓ Uploaded: {result.get('browser_download_url')}")
            return result
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"  Upload failed HTTP {e.code}: {error_body[:500]}")
        raise


def main():
    parser = argparse.ArgumentParser(description="Publish UltrON release to GitHub")
    parser.add_argument("--token", required=True, help="GitHub Personal Access Token (repo scope)")
    parser.add_argument("--version", default="1.1", help="Version string e.g. 1.1")
    parser.add_argument("--draft", action="store_true", help="Create as draft (don't publish yet)")
    args = parser.parse_args()

    tag = f"v{args.version}"
    exe_path = EXE_PATH

    if not os.path.isfile(exe_path):
        print(f"ERROR: EXE not found at {exe_path}")
        print("Run: python -m PyInstaller UltrON.spec --noconfirm")
        sys.exit(1)

    # --- Compute checksums ---
    print(f"Computing SHA-256 for {exe_path}...")
    exe_sha256 = sha256_file(exe_path)
    print(f"  SHA-256: {exe_sha256}")

    checksums = {"UltrON.exe": exe_sha256}
    checksums_path = os.path.join(os.path.dirname(exe_path), "checksums.json")
    with open(checksums_path, "w") as f:
        json.dump(checksums, f, indent=2)
    print(f"  checksums.json written to {checksums_path}")

    # --- Create GitHub release ---
    print(f"\nCreating GitHub release {tag}...")
    release_body = {
        "tag_name": tag,
        "name": f"UltrON {tag}",
        "body": (
            "## UltrON v1.1 — Release Notes\n\n"
            "### New Features\n"
            "- **TNPCB OCEMS REST API** — Push ambient air quality data to Tamil Nadu PCB portal\n"
            "  - JSON payload grouped by Device ID to tnpcb.gov.in endpoint\n"
            "  - `Authorization: Basic <Base64 token>` header support\n"
            "  - 13-digit epoch-ms timestamps, 4-decimal float precision (0.0268 ppm)\n"
            "  - TNPCB Server Management tab in Server Config (URL + token fields, Test Push)\n"
            "\n"
            "### Improvements\n"
            "- **PDF Reports v2** — Portrait A4, Sunshine Technologies logo top-right, summary stats table\n"
            "- **Reports Preview** — Latest 30 rows with true float precision display\n"
            "- **Multi-Station Support** — AAQMS 1 (gas analyzers) + Weather Station (met sensors)\n"
            "- **CPCB/SPCB fixes** — DevicesScreen NaN bug fix, description overwrite fix\n"
            "- **AppContext** — editParameter/deleteParameter type comparison fixes\n"
            "\n"
            "### Bug Fixes\n"
            "- Numeric fields (scale_factor, offset, etc.) no longer lose negative sign mid-input\n"
            "- Parameter description no longer overwritten with station name on save\n"
            "\n"
            "### OTA Update\n"
            "Deployed UltrON instances will auto-update to v1.1 on next startup.\n"
            "SHA-256 checksum verified before swap.\n"
        ),
        "draft": args.draft,
        "prerelease": False,
    }

    try:
        release = api_request(
            f"https://api.github.com/repos/{REPO}/releases",
            method="POST",
            body=release_body,
            token=args.token,
        )
        print(f"✓ Release created: {release.get('html_url')}")
    except Exception as e:
        # Check if tag already has a release
        print(f"Failed to create release, checking if it already exists...")
        try:
            release = api_request(
                f"https://api.github.com/repos/{REPO}/releases/tags/{tag}",
                token=args.token,
            )
            print(f"Found existing release: {release.get('html_url')}")
        except Exception:
            print(f"Could not create or find release for {tag}")
            raise

    upload_url = release["upload_url"]

    # --- Upload assets ---
    print("\nUploading assets...")
    upload_asset(upload_url, "UltrON.exe", exe_path, args.token)
    upload_asset(upload_url, "checksums.json", checksums_path, args.token, content_type="application/json")

    if args.draft:
        print(f"\n✓ Draft release created at: {release.get('html_url')}")
        print("  Publish it from the GitHub UI when ready.")
    else:
        print(f"\n✓ Release published! OTA update will roll out automatically.")
        print(f"  URL: {release.get('html_url')}")
        print(f"  EXE SHA-256: {exe_sha256}")


if __name__ == "__main__":
    main()
