"""UltrON — Settings API (app-level configuration, user management, DB utilities)"""

from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user, require_admin, hash_password
from app.models.user import User
from app.models.plant_settings import PlantSettings
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, delete
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.database import get_db, engine, Base, AsyncSessionLocal
from app.models.station import Station, StationStatus, StationType
from app.models.device import Device, DeviceProtocol, DeviceType
from app.models.parameter import Parameter, RegisterType, DataType, ByteOrder, AlarmSeverity
from app.models.telemetry import LiveData, HistoricalData, Averages, Alarm, SystemLog, PendingUpload
from app.config import APP_DIR, settings
from app.core.logger import get_logger, get_audit_logger
import httpx
import socket
log = get_logger("ultron.settings")
audit = get_audit_logger()
router = APIRouter(
    prefix="/settings",
    tags=["Settings"],
    dependencies=[Depends(get_current_user)],
)


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


# ─── Network Info ──────────────────────────────────────────────────────────────
async def _get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"


async def _check_internet() -> bool:
    try:
        async with httpx.AsyncClient(verify=True, timeout=5) as client:
            resp = await client.get("https://clients3.google.com/generate_204")
            return resp.status_code == 204
    except Exception:
        return False


@router.get("/network-info")
async def network_info():
    lan_ip = await _get_lan_ip()
    internet_ok = await _check_internet()
    return {
        "lan_ip": lan_ip,
        "internet_connected": internet_ok,
        "hostname": socket.gethostname(),
        "timestamp": datetime.utcnow().isoformat(),
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

async def factory_reset_core(*, restart: bool = True):
    """
    Core factory reset logic — stops background tasks, drops all tables,
    recreates schema, re-seeds default admin user.

    Can be called from:
      - POST /settings/reset-all  (local UI button)
      - Remote command polling     (admin panel → factory_reset)

    If restart=True and running as a frozen PyInstaller EXE, spawns a new process
    and exits the current one (after a short delay for the HTTP response to flush).
    """
    import sys, os

    # 1. Gracefully stop background tasks to prevent DB conflicts
    try:
        from app.services.polling_engine import stop_polling
        await stop_polling()
        log.info("Polling engine stopped for factory reset")
    except Exception as e:
        log.warning(f"Could not stop polling engine: {e}")

    # 2. Drop and recreate all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    # 3. Re-seed default admin user (dropped with all other tables)
    async with AsyncSessionLocal() as seed_db:
        admin = User(
            username=settings.ADMIN_USERNAME,
            hashed_password=hash_password(settings.ADMIN_PASSWORD),
            role="admin",
            full_name="System Administrator",
            is_active=True,
            created_by="system",
        )
        seed_db.add(admin)
        await seed_db.commit()

    log.warning("Full database reset complete — all tables recreated, admin re-seeded")

    # 4. Auto-restart the process so background jobs start fresh
    if restart:
        try:
            if getattr(sys, "frozen", False):
                import threading, subprocess, time
                def _do_restart():
                    time.sleep(2)
                    try:
                        startup_info = None
                        if sys.platform == "win32":
                            startup_info = subprocess.STARTUPINFO()
                            startup_info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                        subprocess.Popen(
                            [sys.executable],
                            startupinfo=startup_info,
                            close_fds=True,
                        )
                    except Exception as e:
                        log.error(f"Restart spawn failed: {e}")
                    os._exit(0)
                threading.Thread(target=_do_restart, daemon=True).start()
        except Exception as e:
            log.error(f"Restart setup failed: {e}")


@router.post("/reset-all", dependencies=[Depends(require_admin)])
async def reset_all_data():
    """
    Drop and recreate all tables — full factory reset.
    WARNING: destroys ALL data including station/device/parameter config.
    The server auto-restarts after the reset to pick up the fresh DB.
    """
    audit.warning("Full database reset initiated via /settings/reset-all")
    await factory_reset_core(restart=True)
    return {"message": "Factory reset complete. Server restarting...", "success": True}


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


# ─── Restart UltrON Application ────────────────────────────────────────────────
@router.post("/restart-app", dependencies=[Depends(require_admin)])
async def restart_app():
    """
    Restart the UltrON desktop application (frozen PyInstaller exe only).
    Spawns a new process in the background, then exits the current one.
    """
    import sys, os, subprocess, threading

    if not getattr(sys, "frozen", False):
        raise HTTPException(status_code=400, detail="Restart is only supported in desktop (frozen) mode")

    def _do_restart():
        import time
        time.sleep(2)
        try:
            startup_info = None
            if sys.platform == "win32":
                startup_info = subprocess.STARTUPINFO()
                startup_info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            subprocess.Popen([sys.executable], startupinfo=startup_info, close_fds=True)
        except Exception as e:
            log.error(f"Restart spawn failed: {e}")
        os._exit(0)

    threading.Thread(target=_do_restart, daemon=True).start()
    audit.info("App restart initiated via /settings/restart-app")
    return {"success": True, "message": "Restarting UltrON…"}


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


# ─── Plant Settings (DB-backed) ──────────────────────────────────────────────
class PlantSettingsSchema(BaseModel):
    plantName: str
    plantAddress: str
    plantLogo: str

@router.get("/plant")
async def get_plant_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PlantSettings).limit(1))
    row = result.scalar_one_or_none()
    if row:
        return {
            "plantName": row.plant_name,
            "plantAddress": row.plant_address,
            "plantLogo": row.plant_logo,
        }
    return {
        "plantName": "UltrON Industrial Plant",
        "plantAddress": "Industrial Zone, Block A",
        "plantLogo": ""
    }

@router.post("/plant", dependencies=[Depends(require_admin)])
async def save_plant_settings(payload: PlantSettingsSchema, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(PlantSettings).limit(1))
        row = result.scalar_one_or_none()
        if row:
            row.plant_name = payload.plantName
            row.plant_address = payload.plantAddress
            row.plant_logo = payload.plantLogo
        else:
            db.add(PlantSettings(
                plant_name=payload.plantName,
                plant_address=payload.plantAddress,
                plant_logo=payload.plantLogo,
            ))
        await db.flush()
        return {"success": True, "data": payload.model_dump()}
    except Exception as e:
        log.error(f"Error saving plant settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save plant settings: {str(e)}")


# ─── General System Settings ────────────────────────────────────────────────────
class GeneralSettingsSchema(BaseModel):
    retentionDays: int = 90
    timezone: str = "Asia/Kolkata"
    pollingInterval: int = 60
    alarmCheckInterval: int = 30
    emailEnabled: bool = False
    smtpHost: str = ""
    smtpPort: int = 587
    smtpUser: str = ""
    alertRecipients: str = ""

@router.get("/general")
async def get_general_settings():
    import json
    settings_file = APP_DIR / "general_settings.json"
    if settings_file.exists():
        try:
            with open(settings_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log.error(f"Error reading general settings: {e}")
    return {
        "retentionDays": 90,
        "timezone": "Asia/Kolkata",
        "pollingInterval": 60,
        "alarmCheckInterval": 30,
        "emailEnabled": False,
        "smtpHost": "",
        "smtpPort": 587,
        "smtpUser": "",
        "alertRecipients": "",
    }

@router.post("/general", dependencies=[Depends(require_admin)])
async def save_general_settings(payload: GeneralSettingsSchema):
    import json
    try:
        settings_file = APP_DIR / "general_settings.json"
        APP_DIR.mkdir(parents=True, exist_ok=True)
        with open(settings_file, "w", encoding="utf-8") as f:
            json.dump(payload.model_dump(), f, ensure_ascii=False, indent=2)
        return {"success": True, "data": payload.model_dump()}
    except Exception as e:
        log.error(f"Error saving general settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save general settings: {str(e)}")


# ─── RajAPI Global Settings ───────────────────────────────────────────────────
class RajapiSettingsSchema(BaseModel):
    rajapi_api_key: str
    rajapi_station_id: str
    rajapi_sync_enabled: bool = True

@router.get("/rajapi")
async def get_rajapi_settings():
    return {
        "rajapi_api_key": settings.RAJAPI_API_KEY,
        "rajapi_station_id": settings.RAJAPI_STATION_ID,
        "rajapi_sync_enabled": settings.RAJAPI_SYNC_ENABLED,
    }

@router.post("/rajapi", dependencies=[Depends(require_admin)])
async def save_rajapi_settings(payload: RajapiSettingsSchema):
    try:
        # Update settings singleton dynamically
        settings.RAJAPI_API_KEY = payload.rajapi_api_key
        settings.RAJAPI_STATION_ID = payload.rajapi_station_id
        settings.RAJAPI_SYNC_ENABLED = payload.rajapi_sync_enabled
        
        # Write directly to .env
        def _write_env_var(key: str, val: str):
            env_path = APP_DIR / ".env"
            lines = []
            if env_path.is_file():
                with open(env_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()
            
            found = False
            for idx, line in enumerate(lines):
                if line.strip().startswith(f"{key}="):
                    lines[idx] = f"{key}={val}\n"
                    found = True
                    break
            if not found:
                if lines and not lines[-1].endswith("\n"):
                    lines[-1] += "\n"
                lines.append(f"{key}={val}\n")
                
            with open(env_path, "w", encoding="utf-8") as f:
                f.writelines(lines)

        _write_env_var("RAJAPI_API_KEY", payload.rajapi_api_key)
        _write_env_var("RAJAPI_STATION_ID", payload.rajapi_station_id)
        _write_env_var("RAJAPI_SYNC_ENABLED", "true" if payload.rajapi_sync_enabled else "false")
        
        audit.info("RajAPI settings updated via /settings/rajapi")
        return {"success": True}
    except Exception as e:
        log.error(f"Error saving RajAPI settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save RajAPI settings: {str(e)}")


# ─── Push Engine Status ────────────────────────────────────────────────────────
@router.get("/push-status")
async def push_engine_status():
    from app.services.server_push import _last_net_ok
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        pend_count = await db.execute(select(func.count(PendingUpload.id)))
    return {
        "internet_ok": _last_net_ok,
        "pending_uploads": pend_count.scalar() or 0,
    }


# ─── Firmware Update Check ────────────────────────────────────────────────────
GITHUB_REPO = "bitraneerajbabu/UltronPC"

@router.get("/firmware")
async def check_firmware():
    """
    Query the GitHub Releases API to find the latest UltrON release.
    Returns version, release notes, download URL, and whether an update is available.
    """
    current_version = settings.APP_VERSION

    try:
        async with httpx.AsyncClient(verify=True, timeout=10) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest",
                headers={"User-Agent": "UltrON-FirmwareChecker/1.0", "Accept": "application/vnd.github.v3+json"},
            )
            resp.raise_for_status()
            data = resp.json()

        latest_tag = data.get("tag_name", "").lstrip("v")
        release_name = data.get("name", latest_tag)
        body = data.get("body", "") or ""
        published_at = data.get("published_at", "")
        html_url = data.get("html_url", "")

        import sys
        import os
        current_exe_name = "UltrON.exe"
        if getattr(sys, "frozen", False):
            current_exe_name = os.path.basename(sys.executable)

        # Find the correct executable download URL from assets
        download_url = ""
        asset_size = 0
        for asset in data.get("assets", []):
            if asset.get("name") == current_exe_name:
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


def _do_firmware_download(custom_url: str | None = None) -> None:
    """Run in a background thread: download UltrON.exe from GitHub or a custom URL."""
    global _fw_download_state
    import urllib.request
    import ssl
    import sys
    import os

    _fw_download_state = {"state": "downloading", "percent": 0, "message": "Fetching release info…", "restart_required": False}

    try:
        from app.core.ssl_utils import urlopen_with_ssl_fallback

        if custom_url:
            download_url = custom_url
            tag_name = "custom"
            _fw_download_state["message"] = "Downloading from custom URL…"
        else:
            import json as _json
            url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
            req = urllib.request.Request(url, headers={"User-Agent": "UltrON-Updater/1.0", "Accept": "application/vnd.github.v3+json"})
            with urlopen_with_ssl_fallback(req, timeout=15) as resp:
                data = _json.loads(resp.read().decode("utf-8"))

            current_exe_name = "UltrON.exe"
            if getattr(sys, "frozen", False):
                current_exe_name = os.path.basename(sys.executable)

            download_url = ""
            for asset in data.get("assets", []):
                if asset.get("name") == current_exe_name:
                    download_url = asset["browser_download_url"]
                    break

            if not download_url:
                _fw_download_state = {"state": "error", "percent": 0, "message": f"{current_exe_name} not found in latest release assets.", "restart_required": False}
                return
            tag_name = data.get("tag_name", "unknown")
            _fw_download_state["message"] = f"Downloading {current_exe_name}…"

        _fw_download_state["percent"] = 10

        if getattr(sys, "frozen", False):
            install_dir = os.path.dirname(sys.executable)
        else:
            install_dir = os.getcwd()

        new_exe_name = "UltrON_new.exe"
        if getattr(sys, "frozen", False):
            base, ext = os.path.splitext(current_exe_name)
            new_exe_name = f"{base}_new{ext}"

        new_exe_path = os.path.join(install_dir, new_exe_name)
        flag_path = os.path.join(install_dir, "update_pending.flag")

        download_req = urllib.request.Request(download_url, headers={"User-Agent": "UltrON-Updater/1.0"})
        with urlopen_with_ssl_fallback(download_req, timeout=120) as resp:
            total = int(resp.getheader("Content-Length") or 0)
            downloaded = 0
            chunk_size = 65536
            with open(new_exe_path + ".part", "wb") as out:
                while True:
                    if _fw_download_state.get("state") == "cancelled":
                        _fw_download_state = {"state": "idle", "percent": 0, "message": "Download cancelled.", "restart_required": False}
                        os.remove(new_exe_path + ".part")
                        return
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    out.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = int(10 + (downloaded / total) * 85)
                        _fw_download_state["percent"] = pct
                        _fw_download_state["message"] = f"Downloading… {downloaded // 1024}KB / {total // 1024}KB"

        # Move .part → final (atomic)
        if os.path.exists(new_exe_path):
            os.remove(new_exe_path)
        os.rename(new_exe_path + ".part", new_exe_path)

        with open(flag_path, "w") as f:
            f.write(tag_name)

        _fw_download_state = {
            "state": "done",
            "percent": 100,
            "message": "Download complete. Restart UltrON to apply the update.",
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


@router.post("/firmware/download-url", dependencies=[Depends(require_admin)])
async def start_firmware_download_url(payload: dict):
    """
    Start a background download of UltrON.exe from a custom URL.
    Body: { "url": "https://..." }
    """
    global _fw_download_state
    custom_url = (payload.get("url") or "").strip()
    if not custom_url:
        raise HTTPException(status_code=400, detail="URL is required")
    if _fw_download_state.get("state") == "downloading":
        raise HTTPException(status_code=400, detail="A download is already in progress")
    t = _threading.Thread(target=_do_firmware_download, args=(custom_url,), daemon=True)
    t.start()
    audit.info(f"Firmware custom URL download started: {custom_url[:80]}")
    return {"state": "downloading", "percent": 0, "message": "Download started…", "restart_required": False}


@router.get("/firmware/download-status")
async def get_firmware_download_status():
    """Return current background firmware download state."""
    return _fw_download_state


@router.post("/firmware/cancel", dependencies=[Depends(require_admin)])
async def cancel_firmware_download():
    """Cancel an in-progress firmware download."""
    global _fw_download_state
    if _fw_download_state.get("state") != "downloading":
        return {"state": "idle", "message": "No download in progress."}
    _fw_download_state["state"] = "cancelled"
    audit.info("Firmware download cancelled by user")
    return {"state": "cancelled", "message": "Download cancelled."}
