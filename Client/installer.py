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

# Use certifi for up-to-date CA certificates (bundled Mozilla CA bundle).
# Falls back to system defaults if certifi is unavailable.
def _get_ssl_context():
    try:
        import certifi
        cafile = certifi.where()
        ctx = ssl.create_default_context(cafile=cafile)
    except (ImportError, Exception):
        ctx = ssl.create_default_context()
    return ctx

def _urlopen(url):
    """Open a URL with SSL verification."""
    ctx = _get_ssl_context()
    return urllib.request.urlopen(url, context=ctx)

# Config — change this to match your repository
GITHUB_REPO = "bitraneerajbabu/UltronPC"
APP_NAME = "UltrON"
MAX_RELEASES_TO_SHOW = 20

# ─── EULA ────────────────────────────────────────────────────────────────────
EULA_SPEC = {
    "app_name": "UltrON",
    "publisher": "Sunshine Technologies",
    "window_title": "UltrON - License Agreement",
    "intro_text": (
        "Please read the following License Agreement carefully. You must accept "
        "the terms of this agreement before continuing with the installation of UltrON."
    ),
    "sections": [
        ("1. License Grant", "Sunshine Technologies grants you a non-exclusive, non-transferable license to install and use UltrON (Local Machine software and connected RajAPI services) on the facility/plant for which it was licensed. You may not copy, resell, sub-license, or reverse-engineer this software."),
        ("2. What This Software Does", "UltrON polls your Modbus-connected devices (TCP/RS485), stores readings locally in SQLite, computes CPCB-format averages and quality codes (U/O/E/N), and pushes this data to Sunshine Technologies' central server (RajAPI) for fleet dashboards, AMC management, and OTA updates."),
        ("3. Data Collection & Privacy", "This software collects device readings, timestamps, computed averages, device configuration metadata, and basic operational logs, and transmits them to RajAPI over a secured connection. Your data is not sold to third parties. Full details are in the Data Privacy & Processing Addendum provided with your service agreement."),
        ("4. Compliance Disclaimer", "UltrON is a monitoring and reporting tool only. It does not certify, calibrate, or guarantee your instruments' accuracy, and Sunshine Technologies is not a Pollution Control Board or certifying authority. You remain solely responsible for instrument calibration, data accuracy, and all statutory filings with CPCB/SPCB or any regulator."),
        ("5. Updates & Service Continuity", "This software may receive automatic OTA updates. Continued access to RajAPI-connected features (fleet dashboard, reports, remote support) requires an active AMC/subscription; access may be locked if payment lapses and restored on renewal."),
        ("6. Limitation of Liability", "Sunshine Technologies is not liable for inaccurate readings caused by faulty or uncalibrated client instruments, outages beyond its control, or regulatory penalties arising from your compliance obligations. Total liability is limited as set out in your Service & Installation Agreement."),
        ("7. Governing Law", "This Agreement is governed by the laws of India."),
    ],
    "checkbox_text": "I have read and agree to the terms of this License Agreement",
    "agree_label": "I Agree",
    "decline_label": "Cancel",
    "decline_message": "You must accept the License Agreement to install UltrON. Setup will now exit.",
}


def _machine_id():
    """Stable per-machine id: hashed Windows MachineGuid, fallback to MAC address."""
    import hashlib
    import uuid
    import winreg
    raw = ""
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
            raw, _ = winreg.QueryValueEx(key, "MachineGuid")
    except OSError:
        raw = str(uuid.getnode())
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def eula_body_text(spec=None):
    """Render the EULA into the plain text shown in the dialog."""
    spec = spec or EULA_SPEC
    parts = [spec["intro_text"], ""]
    for heading, body in spec["sections"]:
        parts.append(heading)
        parts.append("")
        parts.append(body)
        parts.append("")
    return "\n".join(parts)


def record_acceptance(version):
    """Write the acceptance record next to the installer's install dir."""
    import json
    from datetime import datetime, timezone
    record = {
        "app_name": EULA_SPEC["app_name"],
        "publisher": EULA_SPEC["publisher"],
        "version": version,
        "accepted_at_timestamp": datetime.now(timezone.utc).isoformat(),
        "user_machine_id": _machine_id(),
    }
    local_app_data = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~\\AppData\\Local")
    log_dir = Path(local_app_data) / APP_NAME
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "license_acceptance.json"
    with open(str(log_file), "w", encoding="utf-8") as f:
        json.dump(record, f, indent=2)


def show_eula_gui():
    """Show the License Agreement dialog. Returns True only if the user checked the box and clicked Agree."""
    import tkinter as tk
    from tkinter import ttk
    root = tk.Tk()
    root.title(EULA_SPEC["window_title"])
    root.geometry("620x560")
    root.minsize(560, 500)

    frame = ttk.Frame(root, padding=12)
    frame.pack(fill="both", expand=True)

    ttk.Label(frame, text=EULA_SPEC["intro_text"], wraplength=560, justify="left").pack(anchor="w", pady=(0, 8))

    text_frame = ttk.Frame(frame)
    text_frame.pack(fill="both", expand=True)
    text = tk.Text(text_frame, wrap="word", relief="solid", borderwidth=1, padx=8, pady=8)
    scrollbar = ttk.Scrollbar(text_frame, orient="vertical", command=text.yview)
    text.configure(yscrollcommand=scrollbar.set)
    scrollbar.pack(side="right", fill="y")
    text.pack(side="left", fill="both", expand=True)
    text.insert("1.0", eula_body_text())
    text.configure(state="disabled")

    agreed = tk.BooleanVar(value=False)
    ttk.Checkbutton(frame, text=EULA_SPEC["checkbox_text"], variable=agreed).pack(anchor="w", pady=(10, 4))

    buttons = ttk.Frame(frame)
    buttons.pack(fill="x", pady=(4, 0))
    accept = ttk.Button(buttons, text=EULA_SPEC["agree_label"], state="disabled", command=root.destroy)
    accept.pack(side="left", padx=(0, 8))
    ttk.Button(buttons, text=EULA_SPEC["decline_label"], command=root.destroy).pack(side="left")

    result = {"accepted": False}

    def on_check():
        accept.configure(state="normal" if agreed.get() else "disabled")
    agreed.trace_add("write", lambda *_: on_check())

    def on_accept():
        result["accepted"] = True
        root.destroy()
    accept.configure(command=on_accept)

    root.mainloop()
    return result["accepted"]


def _github_json(url):
    """Fetch JSON from the GitHub API with installer-friendly headers."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) UltrONInstaller/1.0",
            "Accept": "application/vnd.github.v3+json",
        }
    )
    with _urlopen(req) as response:
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


def get_start_menu_path() -> Path:
    """Get the Start Menu Programs folder for the current user."""
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"
        )
        programs_val, _ = winreg.QueryValueEx(key, "Programs")
        winreg.CloseKey(key)
        programs_path = os.path.expandvars(programs_val)
        if os.path.exists(programs_path):
            return Path(programs_path)
    except Exception:
        pass
    return Path(os.path.expanduser("~\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs"))


def create_shortcut(target_exe: str, shortcut_path: str, description: str = ""):
    """Creates a Windows shortcut using WScript.Shell via PowerShell."""
    working_dir = os.path.dirname(target_exe)
    ps_command = (
        f"$wsh = New-Object -ComObject WScript.Shell; "
        f"$shortcut = $wsh.CreateShortcut('{shortcut_path}'); "
        f"$shortcut.TargetPath = '{target_exe}'; "
        f"$shortcut.WorkingDirectory = '{working_dir}'; "
        f"$shortcut.Description = '{description}'; "
        f"$shortcut.Save()"
    )
    try:
        subprocess.run(["powershell", "-Command", ps_command], capture_output=True, check=True)
    except Exception as e:
        print(f"[WARNING] Could not create shortcut '{shortcut_path}': {e}")


def register_add_remove_programs(target_exe: str, version: str):
    """Register in Windows Settings → Apps (Add/Remove Programs) under HKCU."""
    try:
        import winreg
        uninstall_key = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\UltrON"
        est_size = os.path.getsize(target_exe) // (1024 * 1024)  # MB
        install_dir = os.path.dirname(target_exe)
        today = time.strftime("%Y%m%d")

        # Uninstall command: remove registry key, shortcuts, install dir, and silent clean-up
        uninstall_ps = (
            f"powershell.exe -Command "
            f"\"$appDir = '{install_dir}'; "
            f"$lnkDir = [Environment]::GetFolderPath('Desktop'); "
            f"$lnk = Join-Path $lnkDir 'UltrON.lnk'; "
            f"if (Test-Path $lnk) {{ Remove-Item $lnk }}; "
            f"$smDir = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\\UltrON.lnk'; "
            f"if (Test-Path $smDir) {{ Remove-Item $smDir }}; "
            f"Remove-Item 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\UltrON' -Recurse -Force; "
            f"Start-Sleep -Milliseconds 500; "
            f"Remove-Item $appDir -Recurse -Force; "
            f"$null = [System.Windows.Forms.MessageBox]::Show('UltrON has been uninstalled.', 'UltrON Uninstaller', 'OK', 'Information')\""
        )

        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, uninstall_key)
        winreg.SetValueEx(key, "DisplayName", 0, winreg.REG_SZ, "UltrON")
        winreg.SetValueEx(key, "DisplayVersion", 0, winreg.REG_SZ, version.lstrip("v"))
        winreg.SetValueEx(key, "Publisher", 0, winreg.REG_SZ, "Neeraj")
        winreg.SetValueEx(key, "DisplayIcon", 0, winreg.REG_SZ, target_exe)
        winreg.SetValueEx(key, "InstallLocation", 0, winreg.REG_SZ, install_dir)
        winreg.SetValueEx(key, "InstallDate", 0, winreg.REG_SZ, today)
        winreg.SetValueEx(key, "EstimatedSize", 0, winreg.REG_DWORD, max(est_size, 1))
        winreg.SetValueEx(key, "URLInfoAbout", 0, winreg.REG_SZ, "https://sunshinetechno.com")
        winreg.SetValueEx(key, "HelpLink", 0, winreg.REG_SZ, "mailto:tst@sunshinetechno.com")
        winreg.SetValueEx(key, "DisplayVersion", 0, winreg.REG_SZ, version.lstrip("v"))
        winreg.SetValueEx(key, "UninstallString", 0, winreg.REG_SZ, uninstall_ps)
        winreg.SetValueEx(key, "QuietUninstallString", 0, winreg.REG_SZ, uninstall_ps)
        winreg.CloseKey(key)
        print("[OK] Registered in Settings → Apps (Add/Remove Programs)")
    except Exception as e:
        print(f"[WARNING] Could not register in Add/Remove Programs: {e}")


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
            selected_release = releases[0]

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

    # 1.5 License agreement — required before any installation proceeds
    if not show_eula_gui():
        print()
        print(EULA_SPEC["decline_message"])
        input("Press Enter to exit...")
        sys.exit(1)
    record_acceptance(version)
    print("[OK] License agreement accepted.")

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
        req = urllib.request.Request(
            download_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with _urlopen(req) as response, open(str(target_exe), "wb") as out_file:
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
    create_shortcut(str(target_exe), str(shortcut_path), "UltrON Industrial Monitoring Platform")

    # 5. Create Start Menu Shortcut (shows in Start → All Apps)
    start_menu = get_start_menu_path()
    start_menu_shortcut = start_menu / f"{APP_NAME}.lnk"
    print(f"Creating Start Menu shortcut at: {start_menu_shortcut}")
    create_shortcut(str(target_exe), str(start_menu_shortcut), "UltrON Industrial Monitoring Platform")

    # 6. Register in Add/Remove Programs
    print("Registering application with Windows...")
    register_add_remove_programs(str(target_exe), version)

    # 7. Launch the application
    print(f"\n[OK] Installation complete! Launching {APP_NAME}...")
    try:
        subprocess.Popen([str(target_exe)], cwd=str(install_dir))
    except Exception as e:
        print(f"[ERROR] Failed to launch application: {e}")

    # Small delay so they can read the success message
    time.sleep(3)


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        import json
        body = eula_body_text()
        assert all(heading in body for heading, _ in EULA_SPEC["sections"])
        assert len(_machine_id()) == 16
        record_acceptance("self-check")
        log_path = Path(os.environ["LOCALAPPDATA"]) / APP_NAME / "license_acceptance.json"
        assert log_path.is_file()
        rec = json.loads(log_path.read_text(encoding="utf-8"))
        assert rec["app_name"] == "UltrON" and rec["version"] == "self-check" and rec["user_machine_id"]
        print("self-check OK: eula text, machine id, acceptance record")
        sys.exit(0)
    main()
