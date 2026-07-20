"""
SPCB-format sync endpoint for RajAPI.

Accepts the exact JSON format that UltrON already sends to SPCB servers,
so existing v1.02/v1.03 clients can push data to RajAPI without any software update.

The client just needs to add rajapi.com as a new SPCB server in their 
UltrON > API Mappings screen:
  - Protocol: SPCB (JSON HTTP)
  - Live URL: https://rajapi.com/api/v1/spcb/
  - api_id:   (any value, used for DeviceID)
  - api_name: (their site API key from rajapi.com)   <- KEY
  - api_password: (any value)

We use the 'Name' field from the SPCB payload as the X-API-Key to identify the site.
This means the client sets their RajAPI api_key as the 'Site Name' (api_name) field.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional, Any, List
from pydantic import BaseModel
from app.db.database import get_db
from app.api.deps import _get_or_create_param
from app.models.core import TelemetryData, Broadcast

logger = logging.getLogger(__name__)

router = APIRouter()


class SpcbVariable(BaseModel):
    Variablename: str
    Value: Optional[float] = None
    Unit: Optional[str] = ""
    Flags: Optional[str] = ""


class SpcbPayload(BaseModel):
    DeviceID: Optional[Any] = None
    FunctionName: Optional[int] = 53
    Datetime: Optional[str] = None
    Name: Optional[str] = ""        # We use this as the site API key
    Password: Optional[str] = ""
    additionalInfo: Optional[dict] = {}
    Variables: Optional[List[SpcbVariable]] = []


@router.post("/")
def spcb_sync(payload: SpcbPayload, db: Session = Depends(get_db)):
    """
    Accept UltrON SPCB-format push and store it as telemetry.

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
        logger.warning("Rejected SPCB sync: site %s (%s) is inactive", site.id, site.name)
        db.commit()
        raise HTTPException(status_code=403, detail="Invalid API key — site not found on RajAPI")

    now = datetime.now(timezone.utc)

    # Check AMC expiry
    if site.amc_expiry and site.amc_expiry.replace(tzinfo=timezone.utc) < now:
        site.last_error = "AMC expired"
        site.last_error_at = now
        logger.warning("Rejected SPCB sync: site %s (%s) AMC expired", site.id, site.name)
        db.commit()
        raise HTTPException(status_code=403, detail="Invalid API key — site not found on RajAPI")

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
            quality="U" if val is not None else "O",  # CPCB quality codes: U=Valid, O=Operational
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
