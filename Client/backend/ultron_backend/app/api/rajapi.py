"""UltrON — RajAPI Sync Config API"""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from app.database import get_db
from app.models.rajapi import RajAPIConfig, RajAPIStationConfig
from app.models.station import Station
from app.schemas.rajapi import (
    RajAPIConfigSchema, RajAPIConfigUpdate,
    RajAPIStationConfigSchema, RajAPIStationBulkUpdate,
    RajAPITestResult,
)
from app.core.security import require_server_mgmt
from app.core.logger import get_logger
from app.config import settings

log = get_logger("ultron.api.rajapi")
router = APIRouter(prefix="/rajapi", tags=["RajAPI"])


@router.get("/config", response_model=List[RajAPIConfigSchema], dependencies=[Depends(require_server_mgmt)])
async def get_rajapi_config(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RajAPIConfig).options(selectinload(RajAPIConfig.stations)).order_by(RajAPIConfig.id)
    )
    configs = result.scalars().all()
    if not configs:
        return []

    # Enrich station names
    result_list = []
    for cfg in configs:
        cfg_dict = {
            "id": cfg.id,
            "auth_token": cfg.auth_token or "",
            "is_enabled": cfg.is_enabled,
            "created_at": cfg.created_at,
            "updated_at": cfg.updated_at,
            "stations": [],
        }
        for st in (cfg.stations or []):
            station_name = ""
            if st.station_id:
                s_res = await db.execute(select(Station.name).where(Station.id == st.station_id))
                s_name = s_res.scalar_one_or_none()
                station_name = s_name or ""
            cfg_dict["stations"].append({
                "station_id": st.station_id,
                "station_name": station_name,
                "enabled": st.enabled,
                "custom_station_id": st.custom_station_id or "",
                "username": st.username or "",
            })
        result_list.append(RajAPIConfigSchema(**cfg_dict))
    return result_list


@router.put("/config", response_model=RajAPIConfigSchema, dependencies=[Depends(require_server_mgmt)])
async def update_rajapi_config(config_in: RajAPIConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RajAPIConfig).options(selectinload(RajAPIConfig.stations)))
    config = result.scalars().first()

    if not config:
        config = RajAPIConfig()
        db.add(config)

    if config_in.auth_token is not None:
        config.auth_token = config_in.auth_token
    if config_in.is_enabled is not None:
        config.is_enabled = config_in.is_enabled

    await db.commit()
    await db.refresh(config)

    # Reload with stations for response
    result = await db.execute(
        select(RajAPIConfig).options(selectinload(RajAPIConfig.stations)).where(RajAPIConfig.id == config.id)
    )
    config = result.scalars().first()
    return await _config_to_schema(config, db)


@router.put("/stations", dependencies=[Depends(require_server_mgmt)])
async def update_rajapi_stations(update: RajAPIStationBulkUpdate, db: AsyncSession = Depends(get_db)):
    # Get or create config
    result = await db.execute(select(RajAPIConfig))
    config = result.scalars().first()
    if not config:
        config = RajAPIConfig()
        db.add(config)
        await db.commit()
        await db.refresh(config)

    # Clear existing station configs
    existing = await db.execute(
        select(RajAPIStationConfig).where(RajAPIStationConfig.config_id == config.id)
    )
    for old in existing.scalars().all():
        await db.delete(old)

    # Insert new station configs
    for st in update.stations:
        if not st.enabled:
            continue
        new_st = RajAPIStationConfig(
            config_id=config.id,
            station_id=st.station_id,
            enabled=st.enabled,
            custom_station_id=st.custom_station_id,
            username=st.username,
        )
        db.add(new_st)

    await db.commit()
    return {"detail": "Station configs updated"}


@router.post("/test", response_model=RajAPITestResult, dependencies=[Depends(require_server_mgmt)])
async def test_rajapi_connection(db: AsyncSession = Depends(get_db)):
    """Test connection to RajAPI with stored token."""
    result = await db.execute(select(RajAPIConfig))
    config = result.scalars().first()
    
    auth_token = config.auth_token if (config and config.auth_token) else settings.RAJAPI_API_KEY
    if not auth_token:
        raise HTTPException(status_code=400, detail="No auth token configured")

    try:
        from datetime import datetime, timezone
        import platform
        gateway_id = settings.RAJAPI_STATION_ID or "default"
        payload = {
            "gateway_id": gateway_id,
            "device_secret": auth_token,
            "version": settings.APP_VERSION,
            "heartbeat_ts": datetime.now(timezone.utc).isoformat(),
            "status": "online",
            "cpu_usage": 0.0,
            "ram_usage": 0.0,
            "disk_usage": 0.0,
            "internet": True,
            "vpn": False,
            "polling_active": False,
            "service_status": {},
            "hostname": platform.node(),
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(settings.RAJAPI_SYNC_URL, json=payload)
            if resp.status_code < 300:
                return RajAPITestResult(success=True, status_code=resp.status_code, message="Connection OK")
            else:
                return RajAPITestResult(success=False, status_code=resp.status_code, message=resp.text[:200])
    except Exception as e:
        return RajAPITestResult(success=False, status_code=0, message=str(e))


async def _config_to_schema(config: RajAPIConfig, db: AsyncSession) -> RajAPIConfigSchema:
    """Convert ORM model to schema with station names."""
    stations = []
    for st in (config.stations or []):
        station_name = ""
        if st.station_id:
            s_res = await db.execute(select(Station.name).where(Station.id == st.station_id))
            s_name = s_res.scalar_one_or_none()
            station_name = s_name or ""
        stations.append(RajAPIStationConfigSchema(
            station_id=st.station_id,
            station_name=station_name,
            enabled=st.enabled,
            custom_station_id=st.custom_station_id or "",
            username=st.username or "",
        ))
    return RajAPIConfigSchema(
        id=config.id,
        auth_token=config.auth_token or "",
        is_enabled=config.is_enabled,
        created_at=config.created_at,
        updated_at=config.updated_at,
        stations=stations,
    )

