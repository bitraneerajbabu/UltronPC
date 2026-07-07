from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.db.database import get_db
from app.schemas.api_models import ClientSyncPayload
from app.api.deps import get_current_site
from app.models.core import IndustrySite, TelemetryData, Parameter, Device, Broadcast

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
        # Check if parameter exists, create if not
        param = db.query(Parameter).filter(
            Parameter.tag_name == point.tag_name,
            Parameter.device.has(site_id=site.id)
        ).first()

        if not param:
            # Find or create a generic device for this site
            generic_device = db.query(Device).filter(
                Device.site_id == site.id,
                Device.name == "Default Sync Device"
            ).first()
            if not generic_device:
                generic_device = Device(site_id=site.id, name="Default Sync Device", status="online")
                db.add(generic_device)
                db.flush()

            param = Parameter(
                tag_name=point.tag_name,
                name=point.tag_name,
                device_id=generic_device.id
            )
            db.add(param)
            db.flush()

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
