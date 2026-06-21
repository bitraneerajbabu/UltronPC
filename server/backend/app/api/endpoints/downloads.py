import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, RedirectResponse

router = APIRouter()

# Current release version hosted on GitHub
CURRENT_VERSION = "v1.0.9"
GITHUB_RELEASE_URL = f"https://github.com/bitraneerajbabu/UltronPC/releases/download/{CURRENT_VERSION}/UltrON.exe"

@router.get("/installer")
async def download_installer():
    """
    Serve the UltrON_Installer.exe directly from the server.
    This is the bootstrapper — small EXE that downloads the latest UltrON.exe from GitHub.
    URL: https://rajapi.com/api/v1/downloads/installer
    """
    installer_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "downloads", "UltrON_Installer.exe")
    installer_path = os.path.abspath(installer_path)
    if os.path.exists(installer_path):
        return FileResponse(installer_path, filename="UltrON_Installer.exe", media_type="application/octet-stream")
    # Fallback: redirect to GitHub release asset
    github_installer = f"https://github.com/bitraneerajbabu/UltronPC/releases/download/{CURRENT_VERSION}/UltrON_Installer.exe"
    return RedirectResponse(url=github_installer, status_code=302)


@router.get("/latest-client")
async def download_latest_client():
    """
    Redirect to the latest UltrON.exe on GitHub Releases.
    """
    return RedirectResponse(url=GITHUB_RELEASE_URL, status_code=302)


@router.get("/version")
async def get_latest_version():
    """Return the current latest version info for auto-update checks."""
    return {
        "version": CURRENT_VERSION,
        "download_url": GITHUB_RELEASE_URL,
        "release_notes": "v1.0.9: LED username auth, hard refresh fix, static files, sleep prevention",
    }
