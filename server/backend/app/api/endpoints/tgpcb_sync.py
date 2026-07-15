"""
TGPCB-format sync endpoint for RajAPI.

Accepts the exact JSON format that UltrON already sends to TGPCB servers,
so existing v1.02/v1.03 clients can push data to RajAPI without any software update.

The client just needs to add rajapi.com as a new TGPCB server in their 
UltrON > API Mappings screen:
  - Protocol: TGPCB (JSON HTTP)
  - Live URL: https://rajapi.com/api/v1/tgpcb/
  - api_id:   (any value, used for DeviceID)
  - api_name: (their site API key from rajapi.com)   <- KEY
  - api_password: (any value)

We use the 'Name' field from the TGPCB payload as the X-API-Key to identify the site.
This means the client sets their RajAPI api_key as the 'Site Name' (api_name) field.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional, Any, List
from pydantic import BaseModel
from app.db.database import get_db
from app.models.core import IndustrySite, TelemetryData, Parameter, Device, Broadcast

router = APIRouter()


class TgpcbVariable(BaseModel):
    Variablename: str
    Value: Optional[Any] = None
    Unit: Optional[str] = ""
    Flags: Optional[str] = ""


class TgpcbPayload(BaseModel):
    DeviceID: Optional[Any] = None
    FunctionName: Optional[int] = 53
    Datetime: Optional[str] = None
    Name: Optional[str] = ""        # We use this as the site API key
    Password: Optional[str] = ""
    additionalInfo: Optional[dict] = {}
    Variables: Optional[List[TgpcbVariable]] = []


def _get_or_create_param(db: Session, site: IndustrySite, tag_name: str, unit: str = "") -> Parameter:
    """Find or create a parameter for this site."""
    param = db.query(Parameter).filter(
        Parameter.tag_name == tag_name,
        Parameter.device.has(site_id=site.id)
    ).first()

    if not param:
        generic_device = db.query(Device).filter(
            Device.site_id == site.id,
            Device.name == "Default Sync Device"
        ).first()
        if not generic_device:
            generic_device = Device(site_id=site.id, name="Default Sync Device", status="online")
            db.add(generic_device)
            db.flush()

        param = Parameter(
            tag_name=tag_name,
            name=tag_name,
            unit=unit or "",
            device_id=generic_device.id
        )
        db.add(param)
        db.flush()

    return param


@router.post("/")
def tgpcb_sync(payload: TgpcbPayload, db: Session = Depends(get_db)):
    """
    Accept UltrON TGPCB-format push and store it as telemetry.

    Authentication: The 'Name' field in the payload must contain the site's api_key.
    This allows existing v1.02/v1.03 UltrON clients to push data without any update —
    they just configure the 'api_name' field in UltrON's API Mappings as their RajAPI key.
    """
    api_key = (payload.Name or "").strip()
    if not api_key:
        raise HTTPException(status_code=403, detail="Missing API key: set 'api_name' to your RajAPI site key")

    from app.api.deps import find_site_by_key, find_device_by_key

    # Try site-level key first, then device-level key
    site = find_site_by_key(db, api_key)
    if not site:
        device = find_device_by_key(db, api_key)
        if device and device.site:
            site = device.site
    if not site:
        raise HTTPException(status_code=403, detail="Invalid API key — site not found on RajAPI")
    if not site.is_active:
        site.last_error = "Site is inactive"
        site.last_error_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(status_code=401, detail="Site is inactive")

    now = datetime.now(timezone.utc)

    # Check AMC expiry
    if site.amc_expiry and site.amc_expiry.replace(tzinfo=timezone.utc) < now:
        site.last_error = "AMC expired"
        site.last_error_at = now
        db.commit()
        raise HTTPException(status_code=401, detail="AMC expired. Please contact support.")

    # Stamp last_sync and clear any previous error
    site.last_sync = now
    if site.last_error:
        site.last_error = None
        site.last_error_at = None

    # Extract client version from additionalInfo
    if payload.additionalInfo and isinstance(payload.additionalInfo, dict):
        ver = payload.additionalInfo.get("SoftwareVersion")
        if ver:
            site.client_version = str(ver)

    # Parse timestamp from payload
    ts = now
    if payload.Datetime:
        try:
            ts = datetime.strptime(payload.Datetime, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    # Store each variable as a telemetry point
    synced = 0
    for var in (payload.Variables or []):
        if not var.Variablename:
            continue
        try:
            val = float(var.Value) if var.Value not in (None, "", "NaN") else None
        except (TypeError, ValueError):
            val = None

        param = _get_or_create_param(db, site, var.Variablename, var.Unit or "")

        telemetry = TelemetryData(
            site_id=site.id,
            parameter_id=param.id,
            value=val,
            quality="good" if val is not None else "bad",
            timestamp=ts
        )
        db.add(telemetry)
        synced += 1

    db.commit()

    # Return active broadcasts targeted at this site
    active_bcasts = db.query(Broadcast).filter(
        Broadcast.is_active.is_(True),
        (Broadcast.expires_at.is_(None)) | (Broadcast.expires_at > now),
        (Broadcast.target_all.is_(True)) | (Broadcast.target_site_id == site.id)
    ).all()

    return {
        "status": "success",
        "synced_points": synced,
        "site": site.name,
        "broadcasts": [
            {"id": b.id, "message": b.message, "message_type": b.message_type, "expires_at": b.expires_at.isoformat() if b.expires_at else None}
            for b in active_bcasts
        ],
        "lock_status": site.lock_status or "unlocked",
        "lock_reason": site.lock_reason,
    }
