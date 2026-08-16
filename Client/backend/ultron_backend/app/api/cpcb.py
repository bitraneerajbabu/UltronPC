"""UltrON — CPCB CAAQM Legacy Export API Routes"""

import os
from datetime import datetime, timedelta
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List
from pydantic import BaseModel

from app.database import get_db
from app.models.cpcb import CPCBStationConfig, CPCBParameterMapping, CPCBExportRecord, CPCBExportLog
from app.services.cpcb.validation_service import validate_station_name
from app.services.cpcb.mapping_service import (
    get_all_mappings, create_mapping, update_mapping, delete_mapping,
)
from app.services.cpcb.average_service import compute_15min_averages_for_station, get_cpcb_window
from app.services.cpcb.export_service import export_station_file, run_cpcb_export
from app.services.cpcb.backfill_service import run_backfill
from app.core.logger import get_logger
from app.core.security import get_current_user, require_admin, require_server_mgmt

log = get_logger("ultron.api.cpcb")
router = APIRouter(
    prefix="/cpcb",
    tags=["CPCB Export"],
    dependencies=[Depends(get_current_user), Depends(require_server_mgmt)],
)


# ─── Schemas ───────────────────────────────────────────────────────────────────

class StationConfigOut(BaseModel):
    id: int
    station_id: int
    station_name: str
    station_code: str | None
    export_enabled: bool
    export_path: str
    cpcb_enabled: bool
    timezone: str
    retention_count: int
    calibration_mode: bool = False
    maintenance_mode: bool = False

    class Config:
        from_attributes = True


class StationConfigCreate(BaseModel):
    station_id: int
    station_name: str
    station_code: str | None = None
    export_enabled: bool = True
    export_path: str = "C:\\Data"
    cpcb_enabled: bool = True
    timezone: str = "Asia/Kolkata"
    retention_count: int = 97
    calibration_mode: bool = False
    maintenance_mode: bool = False


class StationConfigUpdate(BaseModel):
    station_name: str | None = None
    station_code: str | None = None
    export_enabled: bool | None = None
    export_path: str | None = None
    cpcb_enabled: bool | None = None
    timezone: str | None = None
    retention_count: int | None = None
    calibration_mode: bool | None = None
    maintenance_mode: bool | None = None


class MappingOut(BaseModel):
    id: int
    internal_parameter: str
    cpcb_parameter: str
    unit: str
    conversion_factor: float
    enabled: bool

    class Config:
        from_attributes = True


class MappingCreate(BaseModel):
    internal_parameter: str
    cpcb_parameter: str
    unit: str = "ppm"
    conversion_factor: float = 1.0
    enabled: bool = True


class MappingUpdate(BaseModel):
    internal_parameter: str | None = None
    cpcb_parameter: str | None = None
    unit: str | None = None
    conversion_factor: float | None = None
    enabled: bool | None = None


class ExportLogOut(BaseModel):
    id: int
    station_name: str
    record_count: int
    status: str
    message: str | None
    execution_time_ms: int | None
    created_at: datetime

    class Config:
        from_attributes = True


class ExportResponse(BaseModel):
    success: bool
    message: str
    records_exported: int = 0


class BackfillRequest(BaseModel):
    station_name: str
    start_date: str  # DD-MM-YYYY
    end_date: str


class BackfillResponse(BaseModel):
    station: str
    records_created: int
    start: str
    end: str


class StatusResponse(BaseModel):
    enabled_stations: int
    total_mappings: int
    total_export_records: int
    last_log: ExportLogOut | None = None


# ─── Station Config ────────────────────────────────────────────────────────────

@router.get("/config", response_model=List[StationConfigOut])
async def list_configs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CPCBStationConfig).order_by(CPCBStationConfig.id))
    return result.scalars().all()


@router.get("/config/{station_id}", response_model=StationConfigOut)
async def get_config(station_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CPCBStationConfig).where(CPCBStationConfig.station_id == station_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="CPCB station config not found")
    return config


@router.post("/config", response_model=StationConfigOut, dependencies=[Depends(require_server_mgmt)])
async def create_config(payload: StationConfigCreate, db: AsyncSession = Depends(get_db)):
    valid, msg = validate_station_name(payload.station_name)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)
    existing = await db.execute(
        select(CPCBStationConfig).where(CPCBStationConfig.station_id == payload.station_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Config already exists for this station")
    config = CPCBStationConfig(**payload.model_dump())
    db.add(config)
    await db.flush()
    await db.commit()
    return config


@router.put("/config/{station_id}", response_model=StationConfigOut, dependencies=[Depends(require_server_mgmt)])
async def update_config(station_id: int, payload: StationConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CPCBStationConfig).where(CPCBStationConfig.station_id == station_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="CPCB station config not found")
    update_data = payload.model_dump(exclude_unset=True)
    if "station_name" in update_data:
        valid, msg = validate_station_name(update_data["station_name"])
        if not valid:
            raise HTTPException(status_code=400, detail=msg)
    for key, val in update_data.items():
        setattr(config, key, val)
    await db.flush()
    await db.commit()
    return config


@router.delete("/config/{station_id}", status_code=204, dependencies=[Depends(require_server_mgmt)])
async def delete_config(station_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CPCBStationConfig).where(CPCBStationConfig.station_id == station_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="CPCB station config not found")
    await db.delete(config)
    await db.commit()


# ─── Parameter Mappings ────────────────────────────────────────────────────────

@router.get("/mappings", response_model=List[MappingOut])
async def list_mappings(db: AsyncSession = Depends(get_db)):
    return await get_all_mappings(db)


@router.post("/mappings", response_model=MappingOut, dependencies=[Depends(require_server_mgmt)])
async def create_mapping_route(payload: MappingCreate, db: AsyncSession = Depends(get_db)):
    try:
        mapping = await create_mapping(
            db, payload.internal_parameter, payload.cpcb_parameter,
            payload.unit, payload.conversion_factor, payload.enabled
        )
        await db.commit()
        return mapping
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/mappings/{mapping_id}", response_model=MappingOut, dependencies=[Depends(require_server_mgmt)])
async def update_mapping_route(mapping_id: int, payload: MappingUpdate, db: AsyncSession = Depends(get_db)):
    try:
        mapping = await update_mapping(db, mapping_id, **payload.model_dump(exclude_unset=True))
        if not mapping:
            raise HTTPException(status_code=404, detail="Mapping not found")
        await db.commit()
        return mapping
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/mappings/{mapping_id}", status_code=204, dependencies=[Depends(require_server_mgmt)])
async def delete_mapping_route(mapping_id: int, db: AsyncSession = Depends(get_db)):
    deleted = await delete_mapping(db, mapping_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Mapping not found")
    await db.commit()


# ─── Status ────────────────────────────────────────────────────────────────────

@router.get("/status", response_model=StatusResponse)
async def get_status(db: AsyncSession = Depends(get_db)):
    configs = await db.execute(select(CPCBStationConfig).where(CPCBStationConfig.export_enabled == True))
    enabled_stations = len(configs.scalars().all())

    mappings = await db.execute(select(CPCBParameterMapping))
    total_mappings = len(mappings.scalars().all())

    records = await db.execute(select(CPCBExportRecord))
    total_export_records = len(records.scalars().all())

    last_log_result = await db.execute(
        select(CPCBExportLog).order_by(CPCBExportLog.created_at.desc()).limit(1)
    )
    last_log = last_log_result.scalar_one_or_none()

    return StatusResponse(
        enabled_stations=enabled_stations,
        total_mappings=total_mappings,
        total_export_records=total_export_records,
        last_log=last_log,
    )


# ─── Logs ──────────────────────────────────────────────────────────────────────

@router.get("/logs", response_model=List[ExportLogOut])
async def get_logs(limit: int = Query(default=100, le=500), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CPCBExportLog).order_by(CPCBExportLog.created_at.desc()).limit(limit)
    )
    return result.scalars().all()


# ─── Manual Export ─────────────────────────────────────────────────────────────

@router.post("/export", dependencies=[Depends(require_server_mgmt)])
async def trigger_export(db: AsyncSession = Depends(get_db)):
    try:
        result = await run_cpcb_export(db)
        await db.commit()
        return {"success": True, "message": f"Export complete: {result['total_records']} records", "records_exported": result["total_records"]}
    except Exception as e:
        await db.rollback()
        log.error(f"Manual export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


# ─── Backfill ──────────────────────────────────────────────────────────────────

async def _run_backfill_background(station_name: str, start_date: datetime, end_date: datetime):
    """Run backfill in the background with its own DB session."""
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            result = await run_backfill(db, station_name, start_date, end_date)
            await db.commit()
            log.info(f"Background backfill complete: {result}")
        except Exception as e:
            await db.rollback()
            log.error(f"Background backfill failed: {e}")


@router.post("/backfill", dependencies=[Depends(require_server_mgmt)])
async def trigger_backfill(
    payload: BackfillRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    try:
        start_date = datetime.strptime(payload.start_date, "%d-%m-%Y")
        end_date = datetime.strptime(payload.end_date, "%d-%m-%Y") + timedelta(days=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use DD-MM-YYYY")

    # Validate date range is at most 31 days
    if (end_date - start_date).days > 31:
        raise HTTPException(
            status_code=400,
            detail="Date range must not exceed 31 days"
        )

    background_tasks.add_task(_run_backfill_background, payload.station_name, start_date, end_date)
    return {"message": "Backfill started", "station": payload.station_name, "start": payload.start_date, "end": payload.end_date}


# ─── Download Generated File ───────────────────────────────────────────────────

@router.get("/download/{station_name}")
async def download_file(station_name: str, db: AsyncSession = Depends(get_db)):
    import re
    if not re.match(r"^[a-zA-Z0-9_-]+$", station_name):
        raise HTTPException(status_code=400, detail="Invalid station name")
    result = await db.execute(
        select(CPCBStationConfig).where(CPCBStationConfig.station_name == station_name)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Station config not found")
    safe_path = os.path.normpath(config.export_path)
    if not safe_path.startswith(os.path.normpath(config.export_path)):
        raise HTTPException(status_code=400, detail="Invalid export path")
    file_path = os.path.join(safe_path, f"{station_name}.txt")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Export file not found. Run export first.")
    from fastapi.responses import FileResponse
    return FileResponse(file_path, filename=f"{station_name}.txt", media_type="text/csv")

