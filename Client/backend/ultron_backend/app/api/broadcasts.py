"""UltrON — Broadcast Messages API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from typing import List
from pydantic import BaseModel

from app.database import get_db
from app.models.telemetry import Broadcast
from app.models.user import User
from app.core.logger import get_logger
from app.core.security import get_current_user

log = get_logger("ultron.broadcasts")
router = APIRouter(prefix="/broadcasts", tags=["Broadcasts"])


class BroadcastOut(BaseModel):
    id: int
    message: str
    severity: str
    is_active: bool
    created_at: datetime | None = None
    expires_at: datetime | None = None

    model_config = {"from_attributes": True}


class BroadcastCreate(BaseModel):
    message: str
    severity: str = "info"
    expires_at: datetime | None = None


@router.get("/", response_model=List[BroadcastOut])
async def list_active_broadcasts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all active, non-expired broadcast messages."""
    now = datetime.utcnow()
    result = await db.execute(
        select(Broadcast).where(
            Broadcast.is_active == True,
            (Broadcast.expires_at == None) | (Broadcast.expires_at > now),
        ).order_by(Broadcast.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=BroadcastOut)
async def create_broadcast(
    payload: BroadcastCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new broadcast message."""
    b = Broadcast(
        message=payload.message,
        severity=payload.severity,
        expires_at=payload.expires_at,
    )
    db.add(b)
    await db.commit()
    await db.refresh(b)
    log.info(f"Broadcast created: {b.message[:60]}")
    return b


@router.post("/{broadcast_id}/dismiss", response_model=BroadcastOut)
async def dismiss_broadcast(
    broadcast_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a broadcast as inactive (dismissed by client)."""
    result = await db.execute(select(Broadcast).where(Broadcast.id == broadcast_id))
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    b.is_active = False
    await db.commit()
    await db.refresh(b)
    return b
