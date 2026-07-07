"""UltrON — Alarms API"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime, timedelta
from typing import List, Optional
from app.database import get_db
from app.models.telemetry import Alarm, AlarmState
from app.schemas.telemetry import AlarmOut, AlarmAck
from app.services.alarm_engine import alarm_engine
from app.core.security import get_current_user

router = APIRouter(
    prefix="/alarms",
    tags=["Alarms"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/", response_model=List[AlarmOut])
async def list_alarms(
    state: Optional[AlarmState] = None,
    severity: Optional[str] = None,
    parameter_id: Optional[int] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    limit: int = Query(100, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    query = select(Alarm).order_by(Alarm.triggered_at.desc())

    if state:
        query = query.where(Alarm.state == state)
    if severity:
        query = query.where(Alarm.severity == severity)
    if parameter_id:
        query = query.where(Alarm.parameter_id == parameter_id)
    if start:
        query = query.where(Alarm.triggered_at >= start)
    if end:
        query = query.where(Alarm.triggered_at <= end)

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/active-count")
async def active_count(db: AsyncSession = Depends(get_db)):
    count = await alarm_engine.get_active_count(db)
    return {"active_alarms": count}


@router.post("/acknowledge")
async def acknowledge_alarms(payload: AlarmAck, db: AsyncSession = Depends(get_db)):
    count = await alarm_engine.acknowledge(
        db, payload.alarm_ids, payload.acknowledged_by, payload.notes
    )
    return {"acknowledged": count}


@router.post("/{alarm_id}/clear")
async def clear_alarm(alarm_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alarm).where(Alarm.id == alarm_id))
    alarm = result.scalar_one_or_none()
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")
    alarm.state = AlarmState.cleared
    alarm.cleared_at = datetime.utcnow()
    return {"cleared": True, "alarm_id": alarm_id}
