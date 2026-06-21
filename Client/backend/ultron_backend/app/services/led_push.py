"""
UltrON — LED Board LAN Service

Builds the payload that LED control cards expect when polling a URL:

  [
    {"listchannelData": [{"ChannelId": 7003, "ChannelName": "NOX",
                          "ChannelValue": "39", "StationName": "AAQMS",
                          "Units": "mg/Nm3"}]},
    ...
  ]

The LED card is configured with:
  http://<PC-LAN-IP>/api/v1/led?auth=username&PCB=1,2,3

Usage:
  from app.services.led_push import build_led_response
  payload = await build_led_response(db, channel_ids=[7005, 7004, 7003])
"""

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models.server_config import ServerConfig, ServerParameterMapping
from app.models.telemetry import LiveData
from app.core.logger import get_logger

log = get_logger("ultron.led_push")


async def build_led_response(db, channel_ids: list[int]) -> list[dict]:
    """
    Build the LED board JSON payload for the requested PCB channel IDs.

    Queries all active ServerConfig entries with protocol='led' whose
    led_channel_id is in channel_ids, then fetches current LiveData for
    each active parameter mapping and builds the response array.

    Args:
        db:          AsyncSession (injected by FastAPI dependency)
        channel_ids: list of integer PCB/ChannelId values from the ?PCB= query param
                     Pass an empty list to return ALL led servers.

    Returns:
        List of {"listchannelData": [{...}]} dicts — one entry per parameter.
    """
    # Fetch all active LED servers matching the requested channel IDs
    stmt = select(ServerConfig).filter(
        ServerConfig.is_active == True,
        ServerConfig.protocol == "led",
    )
    if channel_ids:
        stmt = stmt.filter(ServerConfig.led_channel_id.in_(channel_ids))

    result = await db.execute(stmt)
    led_servers: list[ServerConfig] = result.scalars().all()

    if not led_servers:
        log.debug(f"[LED] No active LED servers found for channel_ids={channel_ids}")
        return []

    server_ids = [s.id for s in led_servers]
    server_by_id = {s.id: s for s in led_servers}

    # Fetch all active parameter mappings for those servers
    map_stmt = (
        select(ServerParameterMapping)
        .options(selectinload(ServerParameterMapping.parameter))
        .filter(
            ServerParameterMapping.server_id.in_(server_ids),
            ServerParameterMapping.is_active == True,
        )
    )
    map_result = await db.execute(map_stmt)
    mappings: list[ServerParameterMapping] = map_result.scalars().all()

    if not mappings:
        log.debug(f"[LED] No active mappings for LED servers {server_ids}")
        return []

    payload = []

    for mapping in mappings:
        server = server_by_id.get(mapping.server_id)
        if not server:
            continue

        param = mapping.parameter

        # ── Channel ID ────────────────────────────────────────────
        channel_id = server.led_channel_id
        if channel_id is None:
            # Fall back to api_id if led_channel_id not set
            try:
                channel_id = int(mapping.api_id or 0)
            except (ValueError, TypeError):
                channel_id = 0

        # ── Channel Name (parameter label on LED display) ─────────
        channel_name = (
            mapping.led_channel_name
            or mapping.api_vname
            or (param.tag_name if param else "")
        )

        # ── Station Name ──────────────────────────────────────────
        station_name = (
            server.led_station_name
            or mapping.api_id
            or (
                param.device.station.name
                if param and hasattr(param, "device") and param.device and param.device.station
                else "Station"
            )
        )

        # ── Unit ─────────────────────────────────────────────────
        unit = (
            mapping.led_unit
            or mapping.api_unit
            or (param.unit if param else "")
            or ""
        )

        # ── Live Value ────────────────────────────────────────────
        ld_res = await db.execute(
            select(LiveData).where(LiveData.parameter_id == mapping.parameter_id)
        )
        live = ld_res.scalars().first()

        if live and live.value is not None:
            try:
                channel_value = str(round(float(live.value), 2))
                # Strip trailing zeros for cleaner display  (e.g. "39.00" → "39")
                if "." in channel_value:
                    channel_value = channel_value.rstrip("0").rstrip(".")
            except (ValueError, TypeError):
                channel_value = str(live.value)
        else:
            channel_value = "--"

        payload.append({
            "listchannelData": [
                {
                    "ChannelId": channel_id,
                    "ChannelName": channel_name,
                    "ChannelValue": channel_value,
                    "StationName": station_name,
                    "Units": unit,
                }
            ]
        })

    log.debug(f"[LED] Built {len(payload)} channel entries for PCBs {channel_ids}")
    return payload
