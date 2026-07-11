from datetime import datetime, timezone
from fastapi import Depends, HTTPException, Security, status, Header
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session
from typing import Optional
from app.db.database import get_db
from app.models.core import IndustrySite, Device
from app.core.config import settings

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=True)


def _validate_site(site: IndustrySite, status_code: int = 403):
    """Check site is active and AMC hasn't expired."""
    if not site.is_active:
        raise HTTPException(status_code=status_code, detail="Site is inactive")
    if site.amc_expiry and site.amc_expiry.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=status_code, detail="AMC has expired. Please contact support.")


class AuthContext:
    is_admin: bool
    site_id: Optional[int]
    auth_key: str

    def __init__(self, is_admin: bool, site_id: Optional[int], auth_key: str):
        self.is_admin = is_admin
        self.site_id = site_id
        self.auth_key = auth_key


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
    site = db.query(IndustrySite).filter(IndustrySite.api_key == x_admin_key).first()
    if site:
        _validate_site(site)
        return AuthContext(is_admin=False, site_id=site.id, auth_key=x_admin_key)

    # Check device-level key
    device = db.query(Device).filter(Device.api_key == x_admin_key).first()
    if device and device.site:
        _validate_site(device.site)
        return AuthContext(is_admin=False, site_id=device.site_id, auth_key=x_admin_key)

    raise HTTPException(status_code=403, detail="Invalid or missing admin key")


def get_current_site(
    api_key: str = Security(API_KEY_HEADER),
    db: Session = Depends(get_db)
) -> IndustrySite:
    site = db.query(IndustrySite).filter(IndustrySite.api_key == api_key).first()
    if site:
        _validate_site(site, status_code=status.HTTP_401_UNAUTHORIZED)
        return site

    device = db.query(Device).filter(Device.api_key == api_key).first()
    if device and device.site:
        _validate_site(device.site, status_code=status.HTTP_401_UNAUTHORIZED)
        return device.site

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Could not validate API Key")
