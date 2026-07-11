from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from datetime import datetime, timezone
from app.db.database import get_db
from app.models.core import IndustrySite, PendingCommand
from app.api.deps import AuthContext, get_auth_context
from app.core.config import settings

router = APIRouter()

SUPPORTED_COMMANDS = {"restart_polling", "reboot_system", "factory_reset"}

class CommandRequest(BaseModel):
    action: str


def _find_site(db: Session, station_id: Optional[str]):
    if not station_id:
        return None
    return db.query(IndustrySite).filter(IndustrySite.api_key == station_id).first()


@router.get("/supported")
def get_supported_commands():
    return {"commands": sorted(SUPPORTED_COMMANDS)}

@router.post("/sites/{site_id}/command")
def send_command(site_id: int, payload: CommandRequest, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    if not site.is_active:
        raise HTTPException(status_code=400, detail="Site is suspended")
    if payload.action not in SUPPORTED_COMMANDS:
        raise HTTPException(status_code=400, detail=f"Unsupported command. Supported: {sorted(SUPPORTED_COMMANDS)}")

    cmd = PendingCommand(
        site_id=site.id,
        station_id=site.api_key,
        action=payload.action,
        status="pending",
    )
    db.add(cmd)
    db.commit()
    db.refresh(cmd)
    return {"status": "queued", "command_id": cmd.id, "site_id": site_id, "action": payload.action}

@router.get("/pending")
def get_pending_commands(
    x_station_id: Optional[str] = Header(default=None, alias="X-Station-Id"),
    x_admin_key: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    effective_station_id = x_station_id
    site = _find_site(db, effective_station_id)
    if not site and x_admin_key != settings.ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid station or admin key")

    lookup_key = site.api_key if site else effective_station_id
    cmds = db.query(PendingCommand).filter(
        PendingCommand.station_id == lookup_key,
        PendingCommand.status == "pending",
    ).order_by(PendingCommand.created_at.asc()).all()

    now = datetime.now(timezone.utc)
    for cmd in cmds:
        cmd.status = "delivered"
        cmd.delivered_at = now
    db.commit()

    return {
        "station_id": lookup_key,
        "commands": [{"id": c.id, "action": c.action, "created_at": c.created_at.isoformat()} for c in cmds],
    }

@router.post("/{command_id}/ack")
def ack_command(
    command_id: int,
    x_station_id: Optional[str] = Header(default=None, alias="X-Station-Id"),
    fail: Optional[bool] = Query(False),
    x_admin_key: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    cmd = db.query(PendingCommand).filter(PendingCommand.id == command_id).first()
    if not cmd:
        raise HTTPException(status_code=404, detail="Command not found")
    if x_admin_key == settings.ADMIN_KEY:
        eff_sid = cmd.station_id
    else:
        eff_sid = x_station_id
    site = _find_site(db, eff_sid) if eff_sid else None
    resolved_key = site.api_key if site else eff_sid
    if not resolved_key or cmd.station_id != resolved_key:
            raise HTTPException(status_code=403, detail="Invalid admin key or station_id")
    cmd.status = "failed" if fail else "completed"
    cmd.completed_at = datetime.now(timezone.utc)
    if fail:
        cmd.error = "Client reported execution failure"
    db.commit()
    return {"status": cmd.status}
