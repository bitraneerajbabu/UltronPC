"""
UltrON — LED Board LAN Endpoint

Provides a GET endpoint that LED control cards can poll directly on the LAN.
The card just needs its URL changed from the remote server to the PC's LAN IP.

Usage (paste this URL into the LED card's URL field):
  http://<PC-LAN-IP>:8000/api/v1/led?auth=menakshi&PCB=7005,7004,7003

Response format (exactly what the LED card expects):
  [
    {"listchannelData": [{"ChannelId": 7003, "ChannelName": "NOX",
                          "ChannelValue": "39", "StationName": "AAQMS",
                          "Units": "mg/Nm3"}]},
    ...
  ]

Auth token is configured in .env as LED_AUTH_TOKEN (default: "menakshi").
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
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
        "`http://<PC-LAN-IP>:8000/api/v1/led?auth=<token>&PCB=7005,7004,7003`"
    ),
)
async def get_led_data(
    auth: Optional[str] = Query(default=None, description="Auth token (set LED_AUTH_TOKEN in .env)"),
    PCB: Optional[str] = Query(default=None, description="Comma-separated PCB/ChannelId list, e.g. 7005,7004,7003"),
    db: AsyncSession = Depends(get_db),
):
    """
    LED card polls this endpoint. Returns the listchannelData JSON array.

    - **auth**: must match LED_AUTH_TOKEN in settings (default: menakshi)
    - **PCB**: comma-separated list of PCB channel IDs to include.
               Omit to return ALL active LED channels.
    """
    # ── Auth check ────────────────────────────────────────────────
    expected_token = settings.LED_AUTH_TOKEN
    if expected_token and auth != expected_token:
        log.warning(f"[LED] Unauthorized access attempt with auth='{auth}'")
        raise HTTPException(status_code=401, detail="Unauthorized — invalid auth token")

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
    from sqlalchemy import select
    from app.models.server_config import ServerConfig

    result = await db.execute(
        select(ServerConfig).filter(
            ServerConfig.is_active == True,
            ServerConfig.protocol == "led",
        )
    )
    led_servers = result.scalars().all()

    channels = [
        {
            "name": s.name,
            "channel_id": s.led_channel_id,
            "station_name": s.led_station_name,
        }
        for s in led_servers
    ]
    pcb_ids = ",".join(str(s.led_channel_id) for s in led_servers if s.led_channel_id)

    return {
        "endpoint": f"/api/v1/led?auth=<token>&PCB={pcb_ids or '...'}",
        "auth_required": bool(settings.LED_AUTH_TOKEN),
        "active_led_channels": channels,
        "hint": (
            "Paste the full URL into the LED card's URL field. "
            "Replace <PC-LAN-IP> with this machine's LAN IP address."
        ),
    }
