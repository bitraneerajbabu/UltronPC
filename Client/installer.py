# -*- coding: utf-8 -*-
"""
UltrON — Bootstrapper Installer
Lets the user choose a production release of UltrON.exe from GitHub Releases,
installs it locally in AppData, creates a desktop shortcut, and runs it.
"""

import os
import sys
import urllib.request
import json
import subprocess
from pathlib import Path
import time
import ssl

# Disable SSL verification globally to prevent failures on machines with missing/outdated root certs or SSL proxy inspection
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except AttributeError:
    pass

# Config — change this to match your repository
GITHUB_REPO = "bitraneerajbabu/UltronPC"
APP_NAME = "UltrON"
MAX_RELEASES_TO_SHOW = 20


def _github_json(url):
    """Fetch JSON from the GitHub API with installer-friendly headers."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) UltrONInstaller/1.0",
            "Accept": "application/vnd.github.v3+json",
        }
    )
    ctx = ssl._create_unverified_context()
    with urllib.request.urlopen(req, context=ctx) as response:
        return json.loads(response.read().decode("utf-8"))


def _find_ultron_asset(release):
    """Return the UltrON.exe download URL from a GitHub release, if present."""
    for asset in release.get("assets", []):
        if asset.get("name") == "UltrON.exe":
            return asset.get("browser_download_url")
    return None


def get_installable_releases(repo, limit=MAX_RELEASES_TO_SHOW):
    """Fetch recent GitHub releases that contain an UltrON.exe asset."""
    url = f"https://api.github.com/repos/{repo}/releases?per_page={limit}"
    releases = []
    try:
        for release in _github_json(url):
            if release.get("draft"):
                continue
            download_url = _find_ultron_asset(release)
            if not download_url:
                continue
            releases.append({
                "tag": release.get("tag_name", "unknown"),
                "name": release.get("name") or release.get("tag_name", "unknown"),
                "published_at": (release.get("published_at") or "")[:10],
                "prerelease": bool(release.get("prerelease")),
                "download_url": download_url,
            })
    except Exception as e:
        print(f"[ERROR] Failed to query GitHub Releases API: {e}")
    return releases


def get_release_by_tag(repo, tag):
    """Fetch a specific GitHub release tag and return its UltrON.exe asset."""
    normalized = (tag or "").strip()
    if normalized and not normalized.startswith("v"):
        normalized = f"v{normalized}"

    url = f"https://api.github.com/repos/{repo}/releases/tags/{normalized}"
    try:
        release = _github_json(url)
        download_url = _find_ultron_asset(release)
        if not download_url:
            return None
        return {
            "tag": release.get("tag_name", normalized),
            "name": release.get("name") or release.get("tag_name", normalized),
            "published_at": (release.get("published_at") or "")[:10],
            "prerelease": bool(release.get("prerelease")),
            "download_url": download_url,
        }
    except Exception as e:
        print(f"[ERROR] Could not find release {normalized}: {e}")
        return None


def choose_release(releases):
    """Prompt the user to pick a release. Enter defaults to the newest release."""
    print()
    print("Available UltrON versions:")
    for idx, release in enumerate(releases, start=1):
        marker = " [pre-release]" if release["prerelease"] else ""
        published = f" - {release['published_at']}" if release["published_at"] else ""
        latest = " (latest)" if idx == 1 else ""
        print(f"  {idx}. {release['tag']}{latest}{marker}{published}")

    print()
    print("Press Enter for latest, type a number, or type an exact tag like v1.0.6.")
    choice = input("Install version: ").strip()
    if not choice:
        return releases[0]

    if choice.isdigit():
        index = int(choice)
        if 1 <= index <= len(releases):
            return releases[index - 1]
        print(f"[WARNING] Invalid selection '{choice}', using latest.")
        return releases[0]

    for release in releases:
        if release["tag"].lower() == choice.lower() or release["tag"].lower().lstrip("v") == choice.lower().lstrip("v"):
            return release

    print(f"[INFO] Looking up exact release tag: {choice}")
    return get_release_by_tag(GITHUB_REPO, choice)


def get_desktop_path() -> Path:
    """Dynamically get the correct Desktop path, respecting OneDrive or user redirection."""
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"
        )
        desktop_val, val_type = winreg.QueryValueEx(key, "Desktop")
        winreg.CloseKey(key)
        desktop_path = os.path.expandvars(desktop_val)
        if os.path.exists(desktop_path):
            return Path(desktop_path)
    except Exception as e:
        print(f"[WARNING] Registry lookup for Desktop failed: {e}")
    
    # Fallback 1: check common OneDrive folder path
    onedrive_desktop = Path(os.path.expanduser("~\\OneDrive\\Desktop"))
    if onedrive_desktop.exists():
        return onedrive_desktop
        
    onedrive_desktop_alt = Path(os.path.expanduser("~\\OneDrive - Personal\\Desktop"))
    if onedrive_desktop_alt.exists():
        return onedrive_desktop_alt

    # Fallback 2: default user profile Desktop
    return Path(os.path.expanduser("~\\Desktop"))


def create_desktop_shortcut(target_exe: str, shortcut_path: str):
    """Creates a desktop shortcut natively using Windows Script Host via PowerShell."""
    working_dir = os.path.dirname(target_exe)
    ps_command = (
        f"$wsh = New-Object -ComObject WScript.Shell; "
        f"$shortcut = $wsh.CreateShortcut('{shortcut_path}'); "
        f"$shortcut.TargetPath = '{target_exe}'; "
        f"$shortcut.WorkingDirectory = '{working_dir}'; "
        f"$shortcut.Save()"
    )
    try:
        subprocess.run(["powershell", "-Command", ps_command], capture_output=True, check=True)
    except Exception as e:
        print(f"[WARNING] Could not create desktop shortcut: {e}")


def main():
    print("==========================================================")
    print(f"       {APP_NAME} Bootstrapper Installer")
    print("==========================================================")
    print()

    # 1. Fetch version info and let the user choose what to install.
    requested_version = None
    for idx, arg in enumerate(sys.argv[1:]):
        if arg in ("--version", "-v") and idx + 2 <= len(sys.argv[1:]):
            requested_version = sys.argv[1:][idx + 1]
            break

    if requested_version:
        print(f"Checking GitHub for requested release {requested_version}...")
        selected_release = get_release_by_tag(GITHUB_REPO, requested_version)
    else:
        print("Checking available releases on GitHub...")
        releases = get_installable_releases(GITHUB_REPO)
        if not releases:
            selected_release = None
        else:
            selected_release = choose_release(releases)

    if not selected_release or not selected_release.get("download_url"):
        print("\n[ERROR] Could not find UltrON.exe for the selected GitHub release.")
        print(f"Please verify that a release exists in the repository '{GITHUB_REPO}'")
        print("and 'UltrON.exe' has been uploaded as a release asset.")
        print()
        input("Press Enter to exit...")
        sys.exit(1)

    download_url = selected_release["download_url"]
    version = selected_release["tag"]
    print(f"[OK] Selected version: {version}")

    # 2. Determine installation paths
    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        local_app_data = os.path.expanduser("~\\AppData\\Local")
        
    install_dir = Path(local_app_data) / APP_NAME
    install_dir.mkdir(parents=True, exist_ok=True)
    target_exe = install_dir / "UltrON.exe"

    print(f"Installing to: {install_dir}")

    # 3. Download the executable
    print(f"Downloading {APP_NAME}.exe ({version}) ...")
    try:
        # First, check if the file is currently running/locked
        if target_exe.exists():
            try:
                with open(str(target_exe), "ab"):
                    pass
            except PermissionError:
                print("\n[ERROR] Permission Denied: The application file is currently locked.")
                print("This means UltrON is currently running on this PC.")
                print("Please close UltrON (check Task Manager or system tray) and run the installer again.")
                print()
                input("Press Enter to exit...")
                sys.exit(1)

        import shutil
        ctx = ssl._create_unverified_context()
        req = urllib.request.Request(
            download_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with urllib.request.urlopen(req, context=ctx) as response, open(str(target_exe), "wb") as out_file:
            shutil.copyfileobj(response, out_file)
        print("[OK] Download complete!")
    except Exception as e:
        print(f"\n[ERROR] Failed to download application: {e}")
        input("Press Enter to exit...")
        sys.exit(1)

    # 4. Create Desktop Shortcut
    desktop = get_desktop_path()
    shortcut_path = desktop / f"{APP_NAME}.lnk"
    print(f"Creating Desktop shortcut at: {shortcut_path}")
    create_desktop_shortcut(str(target_exe), str(shortcut_path))

    # 5. Launch the application
    print(f"\n[OK] Installation complete! Launching {APP_NAME}...")
    try:
        subprocess.Popen([str(target_exe)], cwd=str(install_dir))
    except Exception as e:
        print(f"[ERROR] Failed to launch application: {e}")

    # Small delay so they can read the success message
    time.sleep(3)


if __name__ == "__main__":
    main()
