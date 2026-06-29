from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Optional
from app.db.database import get_db
from app.models.core import Alarm, IndustrySite
from app.api.deps import AuthContext, get_auth_context

router = APIRouter()


@router.get("/")
def list_alarms(
    from_date: Optional[datetime] = Query(default=None, alias="from"),
    to_date: Optional[datetime] = Query(default=None, alias="to"),
    site_id: Optional[int] = Query(default=None),
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    now = datetime.now(timezone.utc)
    frm = from_date or (now - timedelta(days=7))
    to = to_date or now

    q = db.query(Alarm).filter(Alarm.created_at >= frm, Alarm.created_at <= to)
    if site_id:
        q = q.filter(Alarm.site_id == site_id)
    if status:
        q = q.filter(Alarm.status == status)
    q = q.order_by(Alarm.created_at.desc())

    rows = []
    for a in q.all():
        site_name = db.query(IndustrySite.name).filter(IndustrySite.id == a.site_id).scalar()
        rows.append({
            "id": a.id,
            "site_id": a.site_id,
            "site_name": site_name,
            "parameter_id": a.parameter_id,
            "value": a.value,
            "quality": a.quality,
            "message": a.message,
            "status": a.status,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "acknowledged_at": a.acknowledged_at.isoformat() if a.acknowledged_at else None,
        })
    return rows


@router.get("/stats")
def alarm_stats(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    from sqlalchemy import func

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_active = db.query(func.count(Alarm.id)).filter(Alarm.status == "active").scalar() or 0
    total_today = db.query(func.count(Alarm.id)).filter(Alarm.created_at >= today_start).scalar() or 0

    by_severity = db.query(Alarm.quality, func.count(Alarm.id)).group_by(Alarm.quality).all()
    severity = {r[0]: r[1] for r in by_severity}

    return {
        "total_active": total_active,
        "total_today": total_today,
        "by_severity": severity,
    }


@router.post("/{alarm_id}/ack")
def acknowledge_alarm(
    alarm_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    alarm = db.query(Alarm).filter(Alarm.id == alarm_id).first()
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")

    alarm.status = "acknowledged"
    alarm.acknowledged_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "acknowledged", "id": alarm_id}
