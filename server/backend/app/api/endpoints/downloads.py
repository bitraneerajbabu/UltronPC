import os
import json
import urllib.request
import ssl
from fastapi import APIRouter
from fastapi.responses import FileResponse, RedirectResponse

router = APIRouter()

GITHUB_REPO = "bitraneerajbabu/UltronPC"
FALLBACK_VERSION = "v1.0.10"


def _get_latest_version() -> str:
    """Query GitHub releases API for the latest tag. Fall back to FALLBACK_VERSION on error."""
    ctx = ssl._create_unverified_context()
    url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "UltrON-Server/1.0", "Accept": "application/vnd.github.v3+json"},
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("tag_name", FALLBACK_VERSION)
    except Exception:
        return FALLBACK_VERSION


@router.get("/installer")
async def download_installer():
    """
    Serve the UltrON_Installer.exe directly from the server.
    URL: https://rajapi.com/api/v1/downloads/installer
    """
    installer_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "downloads", "UltrON_Installer.exe")
    installer_path = os.path.abspath(installer_path)
    if os.path.exists(installer_path):
        return FileResponse(installer_path, filename="UltrON_Installer.exe", media_type="application/octet-stream")
    version = _get_latest_version()
    github_installer = f"https://github.com/{GITHUB_REPO}/releases/download/{version}/UltrON_Installer.exe"
    return RedirectResponse(url=github_installer, status_code=302)


@router.get("/latest-client")
async def download_latest_client():
    """
    Redirect to the latest UltrON.exe on GitHub Releases.
    """
    version = _get_latest_version()
    url = f"https://github.com/{GITHUB_REPO}/releases/download/{version}/UltrON.exe"
    return RedirectResponse(url=url, status_code=302)


@router.get("/version")
async def get_latest_version():
    """Return the current latest version info for auto-update checks."""
    version = _get_latest_version()
    return {
        "version": version,
        "download_url": f"https://github.com/{GITHUB_REPO}/releases/download/{version}/UltrON.exe",
        "release_notes": f"Latest UltrON release {version}",
    }
