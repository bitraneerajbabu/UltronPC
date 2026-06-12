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
