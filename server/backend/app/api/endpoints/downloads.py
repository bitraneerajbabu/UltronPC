import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, RedirectResponse

router = APIRouter()

# Current release version hosted on GitHub
CURRENT_VERSION = "v1.0.6"
GITHUB_RELEASE_URL = f"https://github.com/bitraneerajbabu/UltronPC/releases/download/{CURRENT_VERSION}/UltrON.exe"

@router.get("/latest-client")
async def download_latest_client():
    """
    Redirect to the latest UltrON.exe on GitHub Releases.
    Falls back to locally stored installer if the redirect fails (offline environments).
    """
    # Always redirect to GitHub — no need to host locally
    return RedirectResponse(url=GITHUB_RELEASE_URL, status_code=302)


@router.get("/version")
async def get_latest_version():
    """Return the current latest version info for auto-update checks."""
    return {
        "version": CURRENT_VERSION,
        "download_url": GITHUB_RELEASE_URL,
        "release_notes": "v1.0.6: Daily rotating CSV reader with date-based filename patterns",
    }
