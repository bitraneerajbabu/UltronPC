"""
UltrON — LED Board LAN Endpoint

Provides a GET endpoint that LED control cards can poll directly on the LAN.
The card just needs its URL changed from the remote server to the PC's LAN IP.

Usage (paste this URL into the LED card's URL field):
  http://<PC-LAN-IP>/api/v1/led?auth=username&PCB=1,2,3

Auth is validated against the logged-in user's username for simplicity.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.database import get_db
from app.models.user import User
from app.config import settings
from app.services.led_push import build_led_response
from app.core.logger import get_logger

log = get_logger("ultron.api.led")

router = APIRouter(prefix="/led", tags=["LED Board"])


@router.get(
    "/",
    summary="LED Board Data Feed",
    description=(
        "Serves live telemetry in the format LED control cards expect. "
        "Paste this URL into the LED card: "
        "`http://<PC-LAN-IP>/api/v1/led?auth=username&PCB=1,2,3`"
    ),
)
async def get_led_data(
    auth: Optional[str] = Query(default=None, description="Username of an active UltrON user"),
    PCB: Optional[str] = Query(default=None, description="Comma-separated channel IDs, e.g. 1,2,3"),
    db: AsyncSession = Depends(get_db),
):
    """
    LED card polls this endpoint. Returns the listchannelData JSON array.

    - **auth**: must match an active user's username
    - **PCB**: comma-separated list of channel IDs to include.
               Omit to return ALL active LED channels.
    """
    # ── Auth check ────────────────────────────────────────────────
    if not auth:
        raise HTTPException(status_code=401, detail="Auth parameter required — use ?auth=username")

    # 1. Check static token from .env first (backward compatible)
    if settings.LED_AUTH_TOKEN:
        if auth == settings.LED_AUTH_TOKEN:
            pass  # valid static token
        else:
            log.warning(f"[LED] Unauthorized access attempt with auth='{auth}'")
            raise HTTPException(status_code=401, detail="Unauthorized — invalid auth")
    else:
        # 2. Validate against active user usernames
        result = await db.execute(
            select(User).where(User.username == auth, User.is_active == True)
        )
        user = result.scalar_one_or_none()
        if not user:
            log.warning(f"[LED] Unauthorized access attempt with auth='{auth}'")
            raise HTTPException(status_code=401, detail="Unauthorized — invalid username")

    # ── Parse PCB channel IDs ──────────────────────────────────────
    channel_ids: list[int] = []
    if PCB:
        for part in PCB.split(","):
            part = part.strip()
            if part.isdigit():
                channel_ids.append(int(part))

    log.debug(f"[LED] Request — PCBs: {channel_ids or 'all'}")

    # ── Build and return payload ───────────────────────────────────
    try:
        payload = await build_led_response(db, channel_ids)
    except Exception as e:
        log.error(f"[LED] Failed to build LED payload: {e}")
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")

    # Return as JSON array (no wrapper — exactly what the LED card reads)
    return JSONResponse(content=payload)

@router.get(
    "/info",
    summary="LED Endpoint Info",
    description="Returns the LED endpoint URL and configured channels (no auth required).",
    include_in_schema=True,
)
async def get_led_info(db: AsyncSession = Depends(get_db)):
    """Returns a helpful summary of the LED endpoint URL and active channels."""
    from app.models.server_config import ServerConfig, ServerParameterMapping
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(ServerConfig).filter(
            ServerConfig.is_active == True,
            ServerConfig.protocol == "led",
        )
    )
    led_servers = result.scalars().all()
    server_ids = [s.id for s in led_servers]
    mappings = []
    if server_ids:
        from app.models.parameter import Parameter
        from app.models.device import Device
        map_res = await db.execute(
            select(ServerParameterMapping)
            .options(
                selectinload(ServerParameterMapping.parameter)
                .selectinload(Parameter.device)
                .selectinload(Device.station)
            )
            .filter(
                ServerParameterMapping.server_id.in_(server_ids),
                ServerParameterMapping.is_active == True,
            )
        )
        mappings = map_res.scalars().all()

    channels = [
        {
            "name": f"{m.led_channel_name or (m.parameter.tag_name if m.parameter else 'Param')}",
            "channel_id": m.parameter.id if m.parameter else 0,
            "station_name": (
                m.parameter.device.station.name
                if m.parameter and m.parameter.device and m.parameter.device.station
                else "Station"
            ),
        }
        for m in mappings
    ]

    pcb_ids = ",".join(str(m.parameter.id) for m in mappings if m.parameter)

    return {
        "endpoint": f"/api/v1/led/?auth=username&PCB={pcb_ids or '...'}",
        "auth_required": True,
        "active_led_channels": channels,
        "hint": (
            "Paste the full URL into the LED card's URL field. "
            "Replace <PC-LAN-IP> with this machine's LAN IP address, "
            "and 'username' with an active UltrON user name."
        ),
    }
