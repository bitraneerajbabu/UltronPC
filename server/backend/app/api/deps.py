from datetime import datetime, timezone
from fastapi import Depends, HTTPException, Security, status, Header
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session
from typing import Optional
from app.db.database import get_db
from app.models.core import IndustrySite, Device, Parameter
from app.core.config import settings

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=True)


def _validate_site(site: IndustrySite, status_code: int = 403):
    """Check site is active and AMC hasn't expired (generic message to prevent enumeration)."""
    if not site.is_active:
        raise HTTPException(status_code=status_code, detail="Could not validate API Key")
    if site.amc_expiry and site.amc_expiry.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=status_code, detail="Could not validate API Key")


import logging

logger = logging.getLogger(__name__)

def _get_or_create_param(
    db: Session,
    site: IndustrySite,
    tag_name: str,
    unit: str = "",
    std_limit: Optional[float] = None,
    station_name: Optional[str] = None
) -> Optional[Parameter]:
    """
    Find or create a parameter for this site.

    1. Reuse Existing: Checks if a parameter with matching tag_name already exists for this site/station.
       If found, updates metadata and returns it without creating a new row (prevents duplicates).
    2. Require Station for New Parameters: Before creating a new device/parameter, an explicit, non-empty
       station_name must be provided. If no station_name is specified, logs a warning and returns None.
    """
    clean_tag = tag_name.strip() if tag_name else ""
    if not clean_tag:
        return None

    clean_station = station_name.strip() if station_name else None

    # 1. Check if parameter already exists for this site (Duplicate Prevention)
    query = db.query(Parameter).filter(
        Parameter.tag_name == clean_tag,
        Parameter.device.has(site_id=site.id)
    )

    param = None
    if clean_station:
        param = query.filter(Parameter.station_name == clean_station).first()

    if not param:
        param = query.first()

    if param:
        # Parameter already exists — reuse existing row
        if not param.unit and unit:
            param.unit = unit
        if std_limit is not None:
            param.std_limit = std_limit
        if clean_station and not param.station_name:
            param.station_name = clean_station
        return param

    # 2. Require explicit station_name for auto-creation
    if not clean_station:
        logger.warning(
            f"[Sync Auto-Provisioning Guard] Skipped parameter auto-creation for tag_name='{clean_tag}' "
            f"on site '{site.name}' (ID: {site.id}): No explicit station specified in sync payload."
        )
        return None

    # 3. Find or create device linked to explicit station
    device_name = f"{clean_station} Device"
    device = db.query(Device).filter(
        Device.site_id == site.id,
        Device.name == device_name
    ).first()

    if not device:
        device = db.query(Device).filter(
            Device.site_id == site.id,
            Device.name == "Default Sync Device"
        ).first()

    if not device:
        device = Device(site_id=site.id, name=device_name, status="online")
        db.add(device)
        db.flush()

    # 4. Create new parameter with explicit station linkage
    param = Parameter(
        tag_name=clean_tag,
        name=clean_tag,
        unit=unit or "",
        std_limit=std_limit,
        station_name=clean_station,
        device_id=device.id
    )
    db.add(param)
    db.flush()

    logger.info(
        f"[Sync Auto-Provisioning] Created parameter '{clean_tag}' under station '{clean_station}' "
        f"for site '{site.name}' (ID: {site.id})."
    )
    return param


class AuthContext:
    is_admin: bool
    site_id: Optional[int]
    auth_key: str

    def __init__(self, is_admin: bool, site_id: Optional[int], auth_key: str):
        self.is_admin = is_admin
        self.site_id = site_id
        self.auth_key = auth_key


import hashlib

def find_site_by_key(db: Session, key: str) -> Optional[IndustrySite]:
    if not key:
        return None
    clean_key = key.strip()
    hashed_key = hashlib.sha256(clean_key.encode('utf-8')).hexdigest()
    # Support both plaintext matching (legacy) and SHA-256 hashed keys
    site = db.query(IndustrySite).filter(
        (IndustrySite.api_key == clean_key) | (IndustrySite.api_key == hashed_key)
    ).first()
    if site:
        return site
    return None


def find_device_by_key(db: Session, key: str) -> Optional[Device]:
    if not key:
        return None
    clean_key = key.strip()
    hashed_key = hashlib.sha256(clean_key.encode('utf-8')).hexdigest()
    device = db.query(Device).filter(
        (Device.api_key == clean_key) | (Device.api_key == hashed_key)
    ).first()
    if device:
        return device
    return None


def get_auth_context(
    x_admin_key: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> AuthContext:
    if not x_admin_key:
        raise HTTPException(status_code=403, detail="Missing authentication key")

    # Check admin key first
    if x_admin_key == settings.ADMIN_KEY:
        return AuthContext(is_admin=True, site_id=None, auth_key=x_admin_key)

    # Check site-level key
    site = find_site_by_key(db, x_admin_key)
    if site:
        _validate_site(site)
        return AuthContext(is_admin=False, site_id=site.id, auth_key=x_admin_key)

    # Check device-level key
    device = find_device_by_key(db, x_admin_key)
    if device and device.site:
        _validate_site(device.site)
        return AuthContext(is_admin=False, site_id=device.site_id, auth_key=x_admin_key)

    raise HTTPException(status_code=403, detail="Invalid or missing admin key")


def get_current_site(
    api_key: str = Security(API_KEY_HEADER),
    db: Session = Depends(get_db)
) -> IndustrySite:
    site = find_site_by_key(db, api_key)
    if site:
        _validate_site(site)
        return site

    device = find_device_by_key(db, api_key)
    if device and device.site:
        _validate_site(device.site)
        return device.site

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Could not validate API Key")
