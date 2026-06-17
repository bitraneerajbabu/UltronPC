from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from sqlalchemy import func
import secrets
from datetime import datetime, timedelta, timezone
from app.db.database import get_db
from app.models.core import IndustrySite, TelemetryData, Parameter
from app.schemas.api_models import SiteCreate, SiteResponse, LatestTelemetryPoint

router = APIRouter()

@router.get("/", response_model=List[SiteResponse])
def get_sites(db: Session = Depends(get_db)):
    # Fast simple query — last_sync is stored directly on the row
    return db.query(IndustrySite).all()

@router.post("/", response_model=SiteResponse)
def create_site(site: SiteCreate, db: Session = Depends(get_db)):
    # Generate a secure API key for this site
    api_key = f"uk_{secrets.token_urlsafe(32)}"
    
    expiry_date = site.amc_expiry if site.amc_expiry else (datetime.now(timezone.utc) + timedelta(days=365))
    
    db_site = IndustrySite(
        name=site.name,
        location=site.location,
        api_key=api_key,
        amc_expiry=expiry_date
    )
    db.add(db_site)
    db.commit()
    db.refresh(db_site)
    return db_site

@router.put("/{site_id}/status", response_model=SiteResponse)
def update_site_status(site_id: int, is_active: bool, db: Session = Depends(get_db)):
    db_site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    db_site.is_active = is_active
    db.commit()
    db.refresh(db_site)
    return db_site

@router.post("/{site_id}/renew", response_model=SiteResponse)
def renew_site_amc(site_id: int, db: Session = Depends(get_db)):
    db_site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    # Generate a completely new API key, revoking the old one
    db_site.api_key = f"uk_{secrets.token_urlsafe(32)}"
    db_site.is_active = True  # Automatically reactivate on renewal
    db_site.amc_expiry = datetime.now(timezone.utc) + timedelta(days=365)
    
    db.commit()
    db.refresh(db_site)
    return db_site

from pydantic import BaseModel

class AmcExpiryUpdate(BaseModel):
    amc_expiry: datetime

@router.put("/{site_id}/amc-expiry", response_model=SiteResponse)
def update_site_amc_expiry(site_id: int, payload: AmcExpiryUpdate, db: Session = Depends(get_db)):
    db_site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    db_site.amc_expiry = payload.amc_expiry
    db.commit()
    db.refresh(db_site)
    return db_site


@router.get("/{site_id}/telemetry/latest", response_model=List[LatestTelemetryPoint])
def get_latest_telemetry(site_id: int, db: Session = Depends(get_db)):
    """
    Returns the most recent telemetry value for every parameter/tag
    at the given site. Used by the live data panel in the dashboard.
    """
    site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    # Subquery: for each parameter, get the timestamp of its latest reading
    latest_ts_subq = (
        db.query(
            TelemetryData.parameter_id,
            func.max(TelemetryData.timestamp).label("max_ts")
        )
        .filter(TelemetryData.site_id == site_id)
        .group_by(TelemetryData.parameter_id)
        .subquery()
    )

    # Join back to get the full telemetry row for that latest timestamp
    rows = (
        db.query(TelemetryData, Parameter)
        .join(Parameter, TelemetryData.parameter_id == Parameter.id)
        .join(
            latest_ts_subq,
            (TelemetryData.parameter_id == latest_ts_subq.c.parameter_id) &
            (TelemetryData.timestamp == latest_ts_subq.c.max_ts)
        )
        .filter(TelemetryData.site_id == site_id)
        .order_by(Parameter.tag_name)
        .all()
    )

    result = []
    for td, param in rows:
        result.append(LatestTelemetryPoint(
            tag_name=param.tag_name,
            name=param.name,
            unit=param.unit,
            value=td.value,
            quality=td.quality,
            timestamp=td.timestamp,
        ))
    return result
