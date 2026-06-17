"""
UltrON Multi-Client Builder
============================
Run this ONE script to build a separate UltrON_Installer.exe for each client.
Each exe will have that client's RajAPI API key baked in silently.

HOW TO USE:
  1. Edit the CLIENT_LIST below — add name, api_key, station_id for each client
  2. Double-click this file OR run:  python build_all_clients.py
  3. Wait — each client's installer exe is saved to:
        client/backend/ultron_backend/dist/clients/UltrON_Installer_<name>.exe
  4. Send each exe to the corresponding client PC via remote access / TeamViewer

NO .env editing, NO manual steps, NO confusion. Just run and collect the exes.
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

# =============================================================================
# EDIT THIS LIST — one entry per client site
# Get api_key from rajapi.com dashboard (click the site, copy the key)
# =============================================================================
CLIENT_LIST = [
    {
        "name":       "Beger_Plaints",
        "api_key":    "uk_YDBPebBPokwBwYbnhYOKR671f_BDpmW3qkflY82_9Cs",
        "station_id": "beger_plaints",
    },
    {
        "name":       "ABD_AAQMS_1",
        "api_key":    "uk_MP4DjZ_ahg81TjI_nbvqr84exyUxbkVuy-wB20-HSzk",
        "station_id": "abd_aaqms_1",
    },
    {
        "name":       "ABD_AAQMS_2",
        "api_key":    "uk_Hh0APVVaE3Vj-3_Qs5Ys68GxT9VtQQkC1AxveR0CGRo",
        "station_id": "abd_aaqms_2",
    },
    {
        "name":       "ABD_CAAQMS_3",
        "api_key":    "uk__B5v8mIu5bzwP0vt_G9HwGRtFD2AlhnFqb8vJ4UL9pc",
        "station_id": "abd_caaqms_3",
    },
    {
        "name":       "Beger_AAQMS_1",
        "api_key":    "uk_FKgaMWnscxX18ia9dPwn_CNfQ59ML5mnVtKiKa1cSeg",
        "station_id": "beger_aaqms_1",
    },
]
# =============================================================================

# Paths (relative to this script which lives in client/)
SCRIPT_DIR     = Path(__file__).parent.resolve()
BACKEND_DIR    = SCRIPT_DIR / "backend" / "ultron_backend"
ENV_BAK        = BACKEND_DIR / ".env.bak"
ENV_FILE       = BACKEND_DIR / ".env"
ENV_ENC_FILE   = BACKEND_DIR / ".env.enc"
DIST_DIR       = BACKEND_DIR / "dist"
OUTPUT_DIR     = DIST_DIR / "clients"
PYTHON         = BACKEND_DIR / "venv" / "Scripts" / "python.exe"
BUILD_BAT      = SCRIPT_DIR / "build_exe.bat"


def read_env_template() -> str:
    if ENV_BAK.exists():
        return ENV_BAK.read_text(encoding="utf-8")
    raise FileNotFoundError(f"No .env.bak template found at {ENV_BAK}")


def write_env(api_key: str, station_id: str, template: str) -> None:
    """Write a fresh .env with this client's API key."""
    # Replace existing RAJAPI_API_KEY line or append it
    lines = template.splitlines()
    new_lines = []
    api_key_set = False
    station_set = False
    for line in lines:
        if line.startswith("RAJAPI_API_KEY="):
            new_lines.append(f"RAJAPI_API_KEY={api_key}")
            api_key_set = True
        elif line.startswith("RAJAPI_STATION_ID="):
            new_lines.append(f"RAJAPI_STATION_ID={station_id}")
            station_set = True
        else:
            new_lines.append(line)
    if not api_key_set:
        new_lines.append(f"RAJAPI_API_KEY={api_key}")
    if not station_set:
        new_lines.append(f"RAJAPI_STATION_ID={station_id}")

    ENV_FILE.write_text("\n".join(new_lines), encoding="utf-8")
    print(f"    ✓ .env written with key: {api_key[:20]}...")


def clean_enc() -> None:
    """Remove old .env.enc so build_exe.bat re-encrypts from fresh .env."""
    if ENV_ENC_FILE.exists():
        ENV_ENC_FILE.unlink()


def run_build() -> bool:
    """Run build_exe.bat and return True if successful."""
    result = subprocess.run(
        ["cmd", "/c", str(BUILD_BAT)],
        cwd=str(SCRIPT_DIR),
        capture_output=False,
    )
    return result.returncode == 0


def collect_installer(client_name: str) -> bool:
    """Copy the built UltrON_Installer.exe to clients/ folder with client name."""
    src = DIST_DIR / "UltrON_Installer.exe"
    if not src.exists():
        print(f"    ✗ UltrON_Installer.exe not found after build!")
        return False

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    dst = OUTPUT_DIR / f"UltrON_Installer_{client_name}.exe"
    shutil.copy2(src, dst)
    print(f"    ✓ Saved: {dst.name}  ({dst.stat().st_size // 1024} KB)")
    return True


def cleanup_env() -> None:
    """Remove .env after build — keep .env.enc only."""
    if ENV_FILE.exists():
        ENV_FILE.unlink()


def main():
    print("=" * 60)
    print("  UltrON Multi-Client Builder")
    print(f"  Building {len(CLIENT_LIST)} clients...")
    print("=" * 60)

    template = read_env_template()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    results = []
    for i, client in enumerate(CLIENT_LIST, 1):
        name       = client["name"]
        api_key    = client["api_key"]
        station_id = client["station_id"]

        print(f"\n[{i}/{len(CLIENT_LIST)}] Building: {name}")
        print(f"    Station ID: {station_id}")

        # 1. Write client-specific .env
        write_env(api_key, station_id, template)

        # 2. Remove old encrypted config so it re-encrypts
        clean_enc()

        # 3. Run the full build
        print(f"    Building exe (this takes ~2 min)...")
        success = run_build()

        # 4. Collect the installer
        if success:
            ok = collect_installer(name)
            results.append((name, ok))
        else:
            print(f"    ✗ Build FAILED for {name}")
            results.append((name, False))

        # 5. Clean up .env
        cleanup_env()

    # Final summary
    print("\n" + "=" * 60)
    print("  BUILD SUMMARY")
    print("=" * 60)
    for name, ok in results:
        status = "✓ OK" if ok else "✗ FAILED"
        print(f"  {status}  {name}")

    print(f"\n  Installers saved to: {OUTPUT_DIR}")
    print("  Send each installer to its corresponding client PC.")
    print("=" * 60)
    input("\nPress Enter to exit...")


if __name__ == "__main__":
    main()
