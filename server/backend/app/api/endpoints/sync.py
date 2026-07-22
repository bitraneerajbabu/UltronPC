from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional, List
from app.db.database import get_db
from app.schemas.api_models import ClientSyncPayload
from app.api.deps import get_current_site, _get_or_create_param
from app.models.core import IndustrySite, TelemetryData, Broadcast, PendingCommand

router = APIRouter()

@router.post("/")
def sync_telemetry(
    payload: ClientSyncPayload,
    db: Session = Depends(get_db),
    site: IndustrySite = Depends(get_current_site)
):
    # Stamp last_sync time on site (cheap column write, no subquery needed later)
    site.last_sync = datetime.now(timezone.utc)

    # Process the incoming points
    for point in payload.points:
        param = _get_or_create_param(db, site, point.tag_name, point.unit or "", std_limit=point.std_limit, station_name=point.station_name)

        telemetry = TelemetryData(
            site_id=site.id,
            parameter_id=param.id,
            value=point.value,
            quality=point.quality,
            timestamp=point.timestamp
        )
        db.add(telemetry)

    db.commit()

    now = datetime.now(timezone.utc)
    active_broadcasts = db.query(Broadcast).filter(
        Broadcast.is_active.is_(True),
        (Broadcast.expires_at.is_(None)) | (Broadcast.expires_at > now)
    ).all()

    amc_expired = False
    if site.amc_expiry and site.amc_expiry.replace(tzinfo=timezone.utc) < now:
        amc_expired = True

    return {
        "status": "success",
        "synced_points": len(payload.points),
        "broadcasts": [
            {"id": b.id, "message": b.message, "message_type": b.message_type, "expires_at": b.expires_at.isoformat() if b.expires_at else None}
            for b in active_broadcasts
        ],
        "lock_status": site.lock_status or "unlocked",
        "lock_reason": site.lock_reason,
        "amc_expired": amc_expired,
    }


# Heartbeat endpoint mapping to replace legacy Rust backend heartbeat
heartbeat_router = APIRouter()

class HeartbeatPayload(BaseModel):
    gateway_id: str
    device_secret: str
    version: Optional[str] = None
    status: Optional[str] = None
    cpu_usage: Optional[float] = None
    ram_usage: Optional[float] = None
    disk_usage: Optional[float] = None
    internet: Optional[bool] = None
    vpn: Optional[bool] = None
    polling_active: Optional[bool] = None
    hostname: Optional[str] = None

@heartbeat_router.post("/")
def heartbeat(
    payload: HeartbeatPayload,
    db: Session = Depends(get_db)
):
    from app.api.deps import find_site_by_key
    site = find_site_by_key(db, payload.device_secret)
    if not site:
        raise HTTPException(status_code=401, detail="Invalid API Key or Device Secret")

    now = datetime.now(timezone.utc)
    site.last_sync = now
    if payload.version:
        site.client_version = payload.version
    db.commit()

    # Get active broadcasts targeting either all sites or this specific site
    active_broadcasts = db.query(Broadcast).filter(
        Broadcast.is_active.is_(True),
        (Broadcast.expires_at.is_(None)) | (Broadcast.expires_at > now),
        (Broadcast.target_all.is_(True)) | (Broadcast.target_site_id == site.id)
    ).all()

    # Get pending commands
    pending_cmds = db.query(PendingCommand).filter(
        PendingCommand.site_id == site.id,
        PendingCommand.status == "pending"
    ).all()

    # Mark pending commands as delivered
    for cmd in pending_cmds:
        cmd.status = "delivered"
        cmd.delivered_at = now
    db.commit()

    amc_expired = False
    if site.amc_expiry and site.amc_expiry.replace(tzinfo=timezone.utc) < now:
        amc_expired = True

    return {
        "status": "success",
        "lock_status": site.lock_status or "unlocked",
        "lock_reason": site.lock_reason,
        "amc_expiry": site.amc_expiry.isoformat() if site.amc_expiry else None,
        "amc_expired": amc_expired,
        "broadcasts": [
            {"id": str(b.id), "message": b.message, "message_type": b.message_type, "expires_at": b.expires_at.isoformat() if b.expires_at else None}
            for b in active_broadcasts
        ],
        "commands": [
            {"id": c.id, "type": c.action, "action": c.action, "payload": {}}
            for c in pending_cmds
        ]
    }

