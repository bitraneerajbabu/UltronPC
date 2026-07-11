import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from app.db.database import get_db
from app.models.core import Broadcast, IndustrySite
from app.schemas.api_models import BroadcastCreate, BroadcastResponse
from app.api.deps import AuthContext, get_auth_context

router = APIRouter()

@router.get("/", response_model=List[BroadcastResponse])
def get_broadcasts(db: Session = Depends(get_db)):
    return db.query(Broadcast).order_by(Broadcast.created_at.desc()).all()

@router.get("/active", response_model=List[BroadcastResponse])
def get_active_broadcasts(
    site_id: Optional[int] = Query(default=None),
    api_key: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    q = db.query(Broadcast).filter(
        Broadcast.is_active.is_(True),
        (Broadcast.expires_at.is_(None)) | (Broadcast.expires_at > now)
    )
    # If a site is specified, only return broadcasts targeting that site
    if site_id is not None:
        q = q.filter(
            (Broadcast.target_all.is_(True)) | (Broadcast.target_site_id == site_id)
        )
    elif api_key is not None:
        site = db.query(IndustrySite).filter(IndustrySite.api_key == api_key).first()
        if site:
            q = q.filter(
                (Broadcast.target_all.is_(True)) | (Broadcast.target_site_id == site.id)
            )
    return q.order_by(Broadcast.created_at.desc()).all()

@router.post("/", response_model=BroadcastResponse)
def create_broadcast(payload: BroadcastCreate, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    if payload.target_site_id is not None:
        site = db.query(IndustrySite).filter(IndustrySite.id == payload.target_site_id).first()
        if not site:
            raise HTTPException(status_code=404, detail="Target site not found")
    bcast = Broadcast(
        message=payload.message,
        message_type=payload.message_type,
        expires_at=payload.expires_at,
        target_all=payload.target_all,
        target_site_id=payload.target_site_id if not payload.target_all else None
    )
    db.add(bcast)
    db.commit()
    db.refresh(bcast)
    return bcast

@router.put("/{broadcast_id}", response_model=BroadcastResponse)
def update_broadcast(broadcast_id: uuid.UUID, payload: BroadcastCreate, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    bcast = db.query(Broadcast).filter(Broadcast.id == broadcast_id).first()
    if not bcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    if payload.target_site_id is not None:
        site = db.query(IndustrySite).filter(IndustrySite.id == payload.target_site_id).first()
        if not site:
            raise HTTPException(status_code=404, detail="Target site not found")
    bcast.message = payload.message
    bcast.message_type = payload.message_type
    bcast.expires_at = payload.expires_at
    bcast.target_all = payload.target_all
    bcast.target_site_id = payload.target_site_id if not payload.target_all else None
    db.commit()
    db.refresh(bcast)
    return bcast

@router.delete("/{broadcast_id}")
def delete_broadcast(broadcast_id: uuid.UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    bcast = db.query(Broadcast).filter(Broadcast.id == broadcast_id).first()
    if not bcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    db.delete(bcast)
    db.commit()
    return {"status": "deleted", "id": broadcast_id}

@router.put("/{broadcast_id}/toggle")
def toggle_broadcast(broadcast_id: uuid.UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    bcast = db.query(Broadcast).filter(Broadcast.id == broadcast_id).first()
    if not bcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    bcast.is_active = not bcast.is_active
    db.commit()
    return {"status": "toggled", "id": broadcast_id, "is_active": bcast.is_active}
