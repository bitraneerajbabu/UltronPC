from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from sqlalchemy import func
import secrets
from datetime import datetime, timedelta, timezone
from app.db.database import get_db
from app.models.core import IndustrySite, TelemetryData, Parameter
from app.schemas.api_models import SiteCreate, SiteResponse, LatestTelemetryPoint, LockUpdate, LockSummary
from app.core.config import settings

router = APIRouter()

def _require_admin(x_admin_key: Optional[str] = Header(default=None)):
    if x_admin_key != settings.ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing admin key")

@router.get("/", response_model=List[SiteResponse])
def get_sites(db: Session = Depends(get_db)):
    # Fast simple query — last_sync is stored directly on the row
    return db.query(IndustrySite).all()

@router.post("/", response_model=SiteResponse)
def create_site(site: SiteCreate, db: Session = Depends(get_db), _: None = Depends(_require_admin)):
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

@router.delete("/{site_id}")
def delete_site(site_id: int, db: Session = Depends(get_db), _: None = Depends(_require_admin)):
    """Delete a site and all its telemetry."""
    db_site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    db.delete(db_site)
    db.commit()
    return {"status": "deleted", "id": site_id}

@router.put("/{site_id}/status", response_model=SiteResponse)
def update_site_status(site_id: int, is_active: bool, db: Session = Depends(get_db), _: None = Depends(_require_admin)):
    db_site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    db_site.is_active = is_active
    db.commit()
    db.refresh(db_site)
    return db_site

@router.post("/{site_id}/renew", response_model=SiteResponse)
def renew_site_amc(site_id: int, db: Session = Depends(get_db), _: None = Depends(_require_admin)):
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
def update_site_amc_expiry(site_id: int, payload: AmcExpiryUpdate, db: Session = Depends(get_db), _: None = Depends(_require_admin)):
    db_site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    db_site.amc_expiry = payload.amc_expiry
    db.commit()
    db.refresh(db_site)
    return db_site


class SiteUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    amc_expiry: Optional[datetime] = None

@router.patch("/{site_id}", response_model=SiteResponse)
def update_site(site_id: int, payload: SiteUpdate, db: Session = Depends(get_db), _: None = Depends(_require_admin)):
    """Update site name, location, or AMC expiry without changing the API key."""
    db_site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")

    if payload.name is not None:
        db_site.name = payload.name
    if payload.location is not None:
        db_site.location = payload.location
    if payload.amc_expiry is not None:
        db_site.amc_expiry = payload.amc_expiry

    db.commit()
    db.refresh(db_site)
    return db_site


@router.get("/{site_id}/telemetry/latest", response_model=List[LatestTelemetryPoint])
def get_latest_telemetry(site_id: int, db: Session = Depends(get_db)):
    """
    Returns the most recent telemetry value for every parameter/tag at the given site.
    Uses DISTINCT ON (PostgreSQL native) — much faster than the correlated-subquery approach
    on large telemetry tables.
    """
    from sqlalchemy import text

    site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    # Single-pass DISTINCT ON — PostgreSQL picks the latest row per parameter in one scan
    sql = text("""
        SELECT DISTINCT ON (t.parameter_id)
               p.tag_name,
               p.name       AS param_name,
               p.unit,
               t.value,
               t.quality,
               t.timestamp
        FROM   telemetry_data t
        JOIN   parameters     p ON p.id = t.parameter_id
        WHERE  t.site_id = :site_id
        ORDER  BY t.parameter_id, t.timestamp DESC
    """)
    rows = db.execute(sql, {"site_id": site_id}).fetchall()

    return [
        LatestTelemetryPoint(
            tag_name=r.tag_name,
            name=r.param_name,
            unit=r.unit,
            value=r.value,
            quality=r.quality,
            timestamp=r.timestamp,
        )
        for r in rows
    ]


@router.delete("/{site_id}/telemetry/prune")
def prune_telemetry(site_id: int, keep_days: int = 7, db: Session = Depends(get_db), _: None = Depends(_require_admin)):
    """
    Delete old telemetry rows for a site, keeping only the last `keep_days` days.
    Default: keep 7 days. Reduces DB size and speeds up all queries.
    Call periodically or after a client pushes too much data.
    """
    from sqlalchemy import text
    cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
    result = db.execute(
        text("DELETE FROM telemetry_data WHERE site_id = :sid AND timestamp < :cutoff"),
        {"sid": site_id, "cutoff": cutoff}
    )
    db.commit()
    return {"status": "pruned", "site_id": site_id, "deleted_rows": result.rowcount, "kept_days": keep_days}


@router.delete("/telemetry/prune-all")
def prune_all_telemetry(keep_days: int = 7, db: Session = Depends(get_db), _: None = Depends(_require_admin)):
    """
    Prune telemetry for ALL sites older than `keep_days` days.
    Run this to shrink the DB and speed up rajapi.com globally.
    """
    from sqlalchemy import text
    cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
    result = db.execute(
        text("DELETE FROM telemetry_data WHERE timestamp < :cutoff"),
        {"cutoff": cutoff}
    )
    db.commit()
    return {"status": "pruned_all", "deleted_rows": result.rowcount, "kept_days": keep_days}


@router.get("/locks/summary", response_model=List[LockSummary])
def get_locks_summary(db: Session = Depends(get_db)):
    return db.query(IndustrySite).with_entities(
        IndustrySite.id,
        IndustrySite.lock_status,
        IndustrySite.lock_reason,
        IndustrySite.lock_updated_at
    ).all()


@router.put("/{site_id}/lock")
def update_lock(site_id: int, payload: LockUpdate, db: Session = Depends(get_db), _: None = Depends(_require_admin)):
    site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    site.lock_status = payload.lock_status
    site.lock_reason = payload.lock_reason
    site.lock_updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "updated", "id": site_id, "lock_status": site.lock_status}

