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


def _get_or_create_param(db: Session, site: IndustrySite, tag_name: str, unit: str = "") -> Parameter:
    """Find or create a parameter for this site, optionally updating unit."""
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
    elif not param.unit and unit:
        param.unit = unit

    return param


class AuthContext:
    is_admin: bool
    site_id: Optional[int]
    auth_key: str

    def __init__(self, is_admin: bool, site_id: Optional[int], auth_key: str):
        self.is_admin = is_admin
        self.site_id = site_id
        self.auth_key = auth_key


def find_site_by_key(db: Session, key: str) -> Optional[IndustrySite]:
    if not key:
        return None
    # Exact match first
    site = db.query(IndustrySite).filter(IndustrySite.api_key == key).first()
    if site:
        return site
    # Backwards compatibility check for legacy prefixes
    if key.startswith("uk_") or key.startswith("in_"):
        random_part = key[3:]
        # Find key ending with _{random_part}
        site = db.query(IndustrySite).filter(IndustrySite.api_key.like(f"%_{random_part}")).first()
        if site:
            return site
    return None


def find_device_by_key(db: Session, key: str) -> Optional[Device]:
    if not key:
        return None
    # Exact match first
    device = db.query(Device).filter(Device.api_key == key).first()
    if device:
        return device
    # Backwards compatibility check for legacy prefixes
    if key.startswith("uk_") or key.startswith("in_"):
        random_part = key[3:]
        device = db.query(Device).filter(Device.api_key.like(f"%_{random_part}")).first()
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
