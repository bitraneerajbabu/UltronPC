from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import secrets
from datetime import datetime, timedelta, timezone
from app.db.database import get_db
from app.models.core import IndustrySite, TelemetryData, Parameter, Device
from app.schemas.api_models import SiteCreate, SiteResponse, DeviceResponse, DeviceCreate, LatestTelemetryPoint, LockUpdate
from app.api.deps import AuthContext, get_auth_context

router = APIRouter()

@router.get("/", response_model=List[SiteResponse])
def get_sites(db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if auth.is_admin:
        return db.query(IndustrySite).all()
    return db.query(IndustrySite).filter(IndustrySite.id == auth.site_id).all()

@router.post("/", response_model=SiteResponse)
def create_site(site: SiteCreate, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
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
def delete_site(site_id: int, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    """Delete a site and all its telemetry."""
    db_site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    db.delete(db_site)
    db.commit()
    return {"status": "deleted", "id": site_id}

@router.get("/{site_id}/devices", response_model=List[DeviceResponse])
def list_devices(site_id: int, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin and auth.site_id != site_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return db.query(Device).filter(Device.site_id == site_id).all()

@router.post("/{site_id}/devices", response_model=DeviceResponse)
def create_device(site_id: int, payload: DeviceCreate, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    db_site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    device = Device(site_id=site_id, name=payload.name, status=payload.status, api_key=f"uk_{secrets.token_urlsafe(32)}")
    db.add(device)
    db.commit()
    db.refresh(device)
    return device

@router.patch("/{site_id}/devices/{device_id}", response_model=DeviceResponse)
def update_device(site_id: int, device_id: int, payload: DeviceCreate, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    device = db.query(Device).filter(Device.id == device_id, Device.site_id == site_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    device.name = payload.name
    device.status = payload.status
    db.commit()
    db.refresh(device)
    return device

@router.post("/{site_id}/devices/{device_id}/renew-key", response_model=DeviceResponse)
def renew_device_key(site_id: int, device_id: int, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    device = db.query(Device).filter(Device.id == device_id, Device.site_id == site_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    device.api_key = f"uk_{secrets.token_urlsafe(32)}"
    db.commit()
    db.refresh(device)
    return device

@router.delete("/{site_id}/devices/{device_id}")
def delete_device(site_id: int, device_id: int, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    device = db.query(Device).filter(Device.id == device_id, Device.site_id == site_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    db.delete(device)
    db.commit()
    return {"status": "deleted", "id": device_id}

@router.put("/{site_id}/status", response_model=SiteResponse)
def update_site_status(site_id: int, is_active: bool, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    db_site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    db_site.is_active = is_active
    db.commit()
    db.refresh(db_site)
    return db_site

@router.post("/{site_id}/renew", response_model=SiteResponse)
def renew_site_amc(site_id: int, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
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

class SiteUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    amc_expiry: Optional[datetime] = None
    notes: Optional[str] = None

@router.patch("/{site_id}", response_model=SiteResponse)
def update_site(site_id: int, payload: SiteUpdate, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
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
    if payload.notes is not None:
        db_site.notes = payload.notes

    db.commit()
    db.refresh(db_site)
    return db_site


@router.get("/{site_id}/telemetry/latest", response_model=List[LatestTelemetryPoint])
def get_latest_telemetry(site_id: int, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin and auth.site_id != site_id:
        raise HTTPException(status_code=403, detail="Access denied")
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
               t.parameter_id AS id,
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
            id=r.id,
            tag_name=r.tag_name,
            name=r.param_name,
            unit=r.unit,
            value=r.value,
            quality=r.quality,
            timestamp=r.timestamp,
        )
        for r in rows
    ]


@router.get("/{site_id}/telemetry/history")
def get_telemetry_history(
    site_id: int,
    parameter_id: int,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    before: Optional[datetime] = None,
    limit: int = 500,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    if not auth.is_admin and auth.site_id != site_id:
        raise HTTPException(status_code=403, detail="Access denied")
    """
    Return telemetry history for a specific parameter.
    Automatically downsamples for long ranges to keep the Pi responsive.
      - ≤6h: raw data
      - ≤3d: 5‑minute buckets
      - ≤14d: hourly buckets
      - >14d: daily buckets
    Use `before` (ISO timestamp) for cursor‑based pagination.
    """
    from sqlalchemy import text

    site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    param = db.query(Parameter).filter(Parameter.id == parameter_id).first()
    if not param:
        raise HTTPException(status_code=404, detail="Parameter not found")

    now = datetime.now(timezone.utc)
    frm = from_date or (now - timedelta(days=30))
    to = to_date or now
    span = to - frm

    # Choose bucket width based on range
    if span.total_seconds() <= 21600:  # 6h
        bucket = None
    elif span.days <= 3:
        bucket = "5 min"
    elif span.days <= 14:
        bucket = "1 hour"
    else:
        bucket = "1 day"

    if bucket:
        if bucket == "5 min":
            ts_expr = "to_timestamp(floor(extract(epoch FROM t.timestamp) / 300) * 300)"
            bucket_sec = 300
        elif bucket == "1 hour":
            ts_expr = "date_trunc('hour', t.timestamp)"
            bucket_sec = 3600
        else:
            ts_expr = "date_trunc('day', t.timestamp)"
            bucket_sec = 86400

        before_clause = "AND t.timestamp < :before " if before else ""
        sql = text(f"""
            SELECT
                {ts_expr} AS ts,
                round(avg(t.value)::numeric, 2) AS value,
                bool_and(t.quality = 'good') AS quality_good
            FROM telemetry_data t
            WHERE t.site_id = :site_id
              AND t.parameter_id = :param_id
              AND t.timestamp >= :frm
              AND t.timestamp <= :to
              {before_clause}
            GROUP BY ts
            ORDER BY ts DESC
            LIMIT :lim
        """)
        params = {"site_id": site_id, "param_id": parameter_id, "frm": frm, "to": to, "lim": limit}
        if before:
            params["before"] = before
        rows = db.execute(sql, params).fetchall()

        # Fill in null-valued buckets for missing time slots to show gaps
        data_map = {r.ts: r for r in rows}
        filled = []
        bucket_delta = timedelta(seconds=bucket_sec)
        if before:
            ts_end = to
            ts_start = frm
        else:
            ts_start = frm
            ts_end = to
        t = ts_end
        while t >= ts_start and len(filled) < limit:
            r = data_map.get(t)
            if r:
                filled.append({"timestamp": r.ts, "value": r.value, "quality": "good" if r.quality_good else "avg"})
            else:
                filled.append({"timestamp": t, "value": None, "quality": "gap"})
            t -= bucket_delta
        return filled
    else:
        q = db.query(TelemetryData).filter(
            TelemetryData.site_id == site_id,
            TelemetryData.parameter_id == parameter_id,
            TelemetryData.timestamp >= frm,
            TelemetryData.timestamp <= to,
        )
        if before:
            q = q.filter(TelemetryData.timestamp < before)
        rows = q.order_by(TelemetryData.timestamp.desc()).limit(limit).all()
        return [
            {"id": r.id, "value": r.value, "quality": r.quality, "timestamp": r.timestamp}
            for r in rows
        ]


@router.delete("/{site_id}/telemetry/prune")
def prune_telemetry(site_id: int, keep_days: int = 7, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
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
def prune_all_telemetry(keep_days: int = 7, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
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


@router.put("/{site_id}/lock")
def update_lock(site_id: int, payload: LockUpdate, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    site.lock_status = payload.lock_status
    site.lock_reason = payload.lock_reason
    site.lock_updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "updated", "id": site_id, "lock_status": site.lock_status}


@router.get("/locks/summary")
def get_locks_summary(db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    sites = db.query(IndustrySite).all()
    return [
        {
            "id": site.id,
            "lock_status": site.lock_status or "unlocked",
            "lock_reason": site.lock_reason,
            "lock_updated_at": site.lock_updated_at.isoformat() if site.lock_updated_at else None
        }
        for site in sites
    ]


