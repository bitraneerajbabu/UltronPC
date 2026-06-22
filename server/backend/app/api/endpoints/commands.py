from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.db.database import get_db
from app.models.core import IndustrySite
from app.core.config import settings
from app.services.mqtt_publisher import publish_command, SUPPORTED_COMMANDS

router = APIRouter()

class CommandRequest(BaseModel):
    action: str

def _require_admin(x_admin_key: Optional[str] = Header(default=None)):
    if x_admin_key != settings.ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing admin key")

@router.get("/supported")
def get_supported_commands():
    return {"commands": sorted(SUPPORTED_COMMANDS)}

@router.post("/sites/{site_id}/command")
async def send_command(site_id: int, payload: CommandRequest, db: Session = Depends(get_db), _: None = Depends(_require_admin)):
    site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    if not site.is_active:
        raise HTTPException(status_code=400, detail="Site is suspended")
    if payload.action not in SUPPORTED_COMMANDS:
        raise HTTPException(status_code=400, detail=f"Unsupported command. Supported: {sorted(SUPPORTED_COMMANDS)}")
    ok = await publish_command(site.api_key, payload.action)
    if not ok:
        raise HTTPException(status_code=502, detail="MQTT broker not connected")
    return {"status": "sent", "site_id": site_id, "action": payload.action, "station_id": site.api_key}
