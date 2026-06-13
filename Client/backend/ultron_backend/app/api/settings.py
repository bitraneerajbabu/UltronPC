"""UltrON — Settings API (app-level configuration, user management, DB utilities)"""

from fastapi import APIRouter, Depends, HTTPException
from app.core.security import require_admin
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, delete
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.database import get_db, engine, Base
from app.models.station import Station, StationStatus, StationType
from app.models.device import Device, DeviceProtocol, DeviceType
from app.models.parameter import Parameter, RegisterType, DataType, ByteOrder, AlarmSeverity
from app.models.telemetry import LiveData, HistoricalData, Averages, Alarm, SystemLog
from app.config import settings
from app.core.logger import get_logger, get_audit_logger

log = get_logger("ultron.settings")
audit = get_audit_logger()
router = APIRouter(prefix="/settings", tags=["Settings"])


# ─── App Info ─────────────────────────────────────────────────────────────────
@router.get("/info")
async def app_info(db: AsyncSession = Depends(get_db)):
    """Return app version, DB stats."""
    station_count = await db.execute(select(func.count(Station.id)))
    device_count  = await db.execute(select(func.count(Device.id)))
    param_count   = await db.execute(select(func.count(Parameter.id)))

    return {
        "app_name":    settings.APP_NAME,
        "version":     settings.APP_VERSION,
        "debug":       settings.DEBUG,
        "db_type":     settings.DB_TYPE,
        "stations":    station_count.scalar(),
        "devices":     device_count.scalar(),
        "parameters":  param_count.scalar(),
        "timestamp":   datetime.utcnow().isoformat(),
    }


# ─── Reset / Clear Telemetry Data ─────────────────────────────────────────────
@router.post("/reset-telemetry", dependencies=[Depends(require_admin)])
async def reset_telemetry(db: AsyncSession = Depends(get_db)):
    """
    Wipe all telemetry data (live_data, historical_data, averages, alarms)
    while keeping station / device / parameter configuration intact.
    """
    await db.execute(delete(LiveData))
    await db.execute(delete(HistoricalData))
    await db.execute(delete(Averages))
    await db.execute(delete(Alarm))
    await db.commit()
    audit.warning("Telemetry data reset via /settings/reset-telemetry")
    log.warning("All telemetry data wiped — live/historical/averages/alarms cleared")
    return {"message": "All telemetry data cleared", "success": True}


# ─── Full DB Reset (wipe everything) ──────────────────────────────────────────
@router.post("/reset-all", dependencies=[Depends(require_admin)])
async def reset_all_data(db: AsyncSession = Depends(get_db)):
    """
    Drop and recreate all tables — full factory reset.
    WARNING: destroys ALL data including station/device/parameter config.
    """
    audit.warning("Full database reset initiated via /settings/reset-all")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    log.warning("Full database reset complete — all tables recreated")
    return {"message": "Full database reset complete. All data removed.", "success": True}


# ─── System Health ────────────────────────────────────────────────────────────
@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Liveness / readiness probe endpoint."""
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return {
        "status":    "healthy" if db_ok else "degraded",
        "database":  "ok" if db_ok else "error",
        "db_type":   settings.DB_TYPE,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── Polling Engine Status ────────────────────────────────────────────────────
@router.get("/polling-status")
async def polling_status():
    """Return how many device poll loops are currently running."""
    from app.services import polling_engine
    active_tasks = len(polling_engine._device_tasks)
    running = polling_engine._running
    return {
        "running":          running,
        "active_poll_loops": active_tasks,
        "device_ids":       list(polling_engine._device_tasks.keys()),
    }


# ─── Reload Polling Engine ────────────────────────────────────────────────────
@router.post("/reload-polling", dependencies=[Depends(require_admin)])
async def reload_polling():
    """Stop and restart the entire polling engine (picks up newly added devices)."""
    from app.services import polling_engine
    await polling_engine.stop_polling()
    await polling_engine.start_polling()
    audit.info("Polling engine reloaded via /settings/reload-polling")
    return {
        "message": "Polling engine reloaded",
        "active_poll_loops": len(polling_engine._device_tasks),
    }


# ─── Plant Settings (Permanent) ───────────────────────────────────────────────
class PlantSettingsSchema(BaseModel):
    plantName: str
    plantAddress: str
    plantLogo: str

@router.get("/plant")
async def get_plant_settings():
    import json
    import os
    db_dir = os.path.dirname(settings.DB_PATH) or "."
    settings_file = os.path.join(db_dir, "plant_settings.json")
    if os.path.exists(settings_file):
        try:
            with open(settings_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log.error(f"Error reading plant settings: {e}")
    # Default fallback settings
    return {
        "plantName": "UltrON Industrial Plant",
        "plantAddress": "Industrial Zone, Block A",
        "plantLogo": ""
    }

@router.post("/plant", dependencies=[Depends(require_admin)])
async def save_plant_settings(payload: PlantSettingsSchema):
    import json
    import os
    try:
        db_dir = os.path.dirname(settings.DB_PATH) or "."
        settings_file = os.path.join(db_dir, "plant_settings.json")
        os.makedirs(db_dir, exist_ok=True)
        with open(settings_file, "w", encoding="utf-8") as f:
            json.dump(payload.model_dump(), f, ensure_ascii=False, indent=2)
        return {"success": True, "data": payload.model_dump()}
    except Exception as e:
        log.error(f"Error saving plant settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save plant settings: {str(e)}")


# ─── Firmware Update Check ────────────────────────────────────────────────────
GITHUB_REPO = "bitraneerajbabu/UltronPC"

@router.get("/firmware")
async def check_firmware():
    """
    Query the GitHub Releases API to find the latest UltrON release.
    Returns version, release notes, download URL, and whether an update is available.
    """
    import urllib.request
    import json as _json
    import ssl

    current_version = settings.APP_VERSION

    try:
        ctx = ssl._create_unverified_context()
        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "UltrON-FirmwareChecker/1.0",
                "Accept": "application/vnd.github.v3+json",
            }
        )
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            data = _json.loads(resp.read().decode("utf-8"))

        latest_tag = data.get("tag_name", "").lstrip("v")
        release_name = data.get("name", latest_tag)
        body = data.get("body", "") or ""
        published_at = data.get("published_at", "")
        html_url = data.get("html_url", "")

        # Find UltrON.exe download URL from assets
        download_url = ""
        asset_size = 0
        for asset in data.get("assets", []):
            if asset.get("name") == "UltrON.exe":
                download_url = asset.get("browser_download_url", "")
                asset_size = asset.get("size", 0)
                break

        # Naive semver comparison: split on '.' and compare tuples
        def _parse_ver(v: str):
            try:
                return tuple(int(x) for x in v.split("."))
            except Exception:
                return (0, 0, 0)

        update_available = _parse_ver(latest_tag) > _parse_ver(current_version)

        return {
            "current_version":  current_version,
            "latest_version":   latest_tag,
            "release_name":     release_name,
            "update_available": update_available,
            "release_notes":    body[:2000],          # trim very long changelogs
            "published_at":     published_at,
            "download_url":     download_url,
            "asset_size_bytes": asset_size,
            "release_url":      html_url,
            "repository":       GITHUB_REPO,
        }

    except Exception as e:
        log.warning(f"Firmware check failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Could not reach GitHub Releases API: {str(e)}"
        )


# ─── Trigger CPCB File Write Now ─────────────────────────────────────────────
@router.post("/trigger-cpcb", dependencies=[Depends(require_admin)])
async def trigger_cpcb_now():
    """
    Immediately run the CPCB flat-file write for all active CPCB/both servers.
    Useful for manual or UI-triggered file generation.
    """
    from app.services.server_push import run_server_push
    import asyncio
    try:
        await run_server_push("delay")  # delay mode writes CPCB files
        audit.info("Manual CPCB file write triggered via /settings/trigger-cpcb")
        return {"success": True, "message": "CPCB file write completed"}
    except Exception as e:
        log.error(f"Manual CPCB trigger failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Firmware Background Download ────────────────────────────────────────────
import threading as _threading

_fw_download_state: dict = {
    "state": "idle",
    "percent": 0,
    "message": "No download in progress",
    "restart_required": False,
}


def _do_firmware_download():
    """Run in a background thread: download latest UltrON.exe from GitHub."""
    global _fw_download_state
    import urllib.request
    import json as _json
    import ssl
    import sys
    import os
    import shutil

    _fw_download_state = {"state": "downloading", "percent": 0, "message": "Fetching release info…", "restart_required": False}

    try:
        ctx = ssl._create_unverified_context()
        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        req = urllib.request.Request(url, headers={"User-Agent": "UltrON-Updater/1.0", "Accept": "application/vnd.github.v3+json"})
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            data = _json.loads(resp.read().decode("utf-8"))

        download_url = ""
        for asset in data.get("assets", []):
            if asset.get("name") == "UltrON.exe":
                download_url = asset["browser_download_url"]
                break

        if not download_url:
            _fw_download_state = {"state": "error", "percent": 0, "message": "UltrON.exe not found in latest release assets.", "restart_required": False}
            return

        _fw_download_state["message"] = f"Downloading UltrON.exe…"
        _fw_download_state["percent"] = 10

        # Resolve install directory (next to running exe or cwd)
        if getattr(sys, "frozen", False):
            install_dir = os.path.dirname(sys.executable)
        else:
            install_dir = os.getcwd()

        new_exe_path = os.path.join(install_dir, "UltrON_new.exe")
        flag_path = os.path.join(install_dir, "update_pending.flag")

        download_req = urllib.request.Request(download_url, headers={"User-Agent": "UltrON-Updater/1.0"})
        with urllib.request.urlopen(download_req, context=ctx) as resp:
            total = int(resp.getheader("Content-Length") or 0)
            downloaded = 0
            chunk_size = 65536
            with open(new_exe_path, "wb") as out:
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    out.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = int(10 + (downloaded / total) * 85)
                        _fw_download_state["percent"] = pct
                        _fw_download_state["message"] = f"Downloading… {downloaded // 1024}KB / {total // 1024}KB"

        # Write pending flag
        with open(flag_path, "w") as f:
            f.write(data.get("tag_name", "unknown"))

        _fw_download_state = {
            "state": "done",
            "percent": 100,
            "message": f"Download complete. Restart UltrON to apply the update.",
            "restart_required": True,
        }

    except Exception as e:
        _fw_download_state = {"state": "error", "percent": 0, "message": str(e), "restart_required": False}


@router.post("/firmware/download", dependencies=[Depends(require_admin)])
async def start_firmware_download():
    """
    Start a background download of the latest UltrON.exe from GitHub Releases.
    After download, writes update_pending.flag so that the launcher can apply it.
    """
    global _fw_download_state
    if _fw_download_state.get("state") == "downloading":
        return _fw_download_state
    t = _threading.Thread(target=_do_firmware_download, daemon=True)
    t.start()
    audit.info("Firmware background download started")
    return {"state": "downloading", "percent": 0, "message": "Download started…", "restart_required": False}


@router.get("/firmware/download-status")
async def get_firmware_download_status():
    """Return current background firmware download state."""
    return _fw_download_state
