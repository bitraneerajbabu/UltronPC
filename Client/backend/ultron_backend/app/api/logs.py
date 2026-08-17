"""UltrON — System Logs API"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from typing import List, Optional
from app.database import get_db
from app.models.telemetry import SystemLog
from app.schemas.telemetry import SystemLogOut
from app.core.security import get_current_user, require_admin

router = APIRouter(
    prefix="/logs",
    tags=["Logs"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/", response_model=List[SystemLogOut])
async def list_logs(
    db: AsyncSession = Depends(get_db),
    log_type: Optional[str] = Query(None),         # comm | system | audit | alarm
    level: Optional[str] = Query(None),            # DEBUG | INFO | WARNING | ERROR
    source: Optional[str] = Query(None),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    limit: int = Query(500, le=10000),
):
    query = select(SystemLog).order_by(SystemLog.timestamp.desc())

    if log_type and isinstance(log_type, str):
        query = query.where(SystemLog.log_type == log_type)
    if level and isinstance(level, str):
        query = query.where(SystemLog.level == level)
    if source and isinstance(source, str):
        query = query.where(SystemLog.source.contains(source))
    if start and isinstance(start, datetime):
        query = query.where(SystemLog.timestamp >= start)
    if end and isinstance(end, datetime):
        query = query.where(SystemLog.timestamp <= end)

    lim_val = limit if isinstance(limit, int) else 500
    query = query.limit(lim_val)

    result = await db.execute(query)
    return result.scalars().all()


@router.delete("/purge", dependencies=[Depends(require_admin)])
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
