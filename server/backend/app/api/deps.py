from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.core import IndustrySite

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=True)

def get_current_site(
    api_key: str = Security(API_KEY_HEADER),
    db: Session = Depends(get_db)
) -> IndustrySite:
    site = db.query(IndustrySite).filter(IndustrySite.api_key == api_key).first()
    if not site:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate API Key",
        )
    if not site.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Site is inactive",
        )
    
    from datetime import datetime, timezone
    if site.amc_expiry and site.amc_expiry.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="AMC has expired. Please contact support.",
        )
        
    return site
