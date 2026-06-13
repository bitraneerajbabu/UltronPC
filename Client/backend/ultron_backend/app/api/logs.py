"""UltrON — System Logs API"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from typing import List, Optional
from app.database import get_db
from app.models.telemetry import SystemLog
from app.schemas.telemetry import SystemLogOut

router = APIRouter(prefix="/logs", tags=["Logs"])


@router.get("/", response_model=List[SystemLogOut])
async def list_logs(
    log_type: Optional[str] = None,         # comm | system | audit | alarm
    level: Optional[str] = None,            # DEBUG | INFO | WARNING | ERROR
    source: Optional[str] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    limit: int = Query(500, le=10000),
    db: AsyncSession = Depends(get_db),
):
    query = select(SystemLog).order_by(SystemLog.timestamp.desc())

    if log_type:
        query = query.where(SystemLog.log_type == log_type)
    if level:
        query = query.where(SystemLog.level == level)
    if source:
        query = query.where(SystemLog.source.contains(source))
    if start:
        query = query.where(SystemLog.timestamp >= start)
    if end:
        query = query.where(SystemLog.timestamp <= end)

    query = query.limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.delete("/purge")
async def purge_logs(
    older_than_days: int = Query(30, ge=1),
    log_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Delete logs older than N days (admin operation)."""
    from datetime import timedelta
    from sqlalchemy import delete

    cutoff = datetime.utcnow() - timedelta(days=older_than_days)
    stmt = delete(SystemLog).where(SystemLog.timestamp < cutoff)
    if log_type:
        stmt = stmt.where(SystemLog.log_type == log_type)

    result = await db.execute(stmt)
    return {"deleted": result.rowcount, "cutoff": cutoff.isoformat()}
