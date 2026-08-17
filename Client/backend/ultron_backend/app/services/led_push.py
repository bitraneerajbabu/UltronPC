"""
UltrON — LED Board LAN Service

Builds the payload that LED control cards expect when polling a URL:

  [
    {"listchannelData": [{"StationName": "AAQMS", "ChannelName": "NOX",
                          "ChannelValue": "39", "Units": "mg/Nm3",
                          "ChannelStatus": "online"}]},
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

    Queries all active ServerConfig entries with protocol='led',
    fetches current LiveData for each active parameter mapping
    and builds the response array.

    Args:
        db:          AsyncSession (injected by FastAPI dependency)
        channel_ids: list of integer PCB/ChannelId values from the ?PCB= query param
                     Pass an empty list to return ALL led servers.

    Returns:
        List of {"listchannelData": [{...}]} dicts — one entry per parameter.
    """
    # Fetch all active LED servers
    stmt = select(ServerConfig).filter(
        ServerConfig.is_active == True,
        ServerConfig.protocol == "led",
    )

    result = await db.execute(stmt)
    led_servers: list[ServerConfig] = result.scalars().all()

    if not led_servers:
        log.debug("[LED] No active LED servers found")
        return []

    server_ids = [s.id for s in led_servers]
    server_by_id = {s.id: s for s in led_servers}

    # Fetch all active parameter mappings for those servers
    from app.models.parameter import Parameter
    from app.models.device import Device

    map_stmt = (
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
    map_result = await db.execute(map_stmt)
    mappings: list[ServerParameterMapping] = map_result.scalars().all()

    if not mappings:
        log.debug(f"[LED] No active mappings for LED servers {server_ids}")
        return []

    # Filter mappings if specific channel_ids are requested (PCB parameter)
    if channel_ids:
        mappings = [m for m in mappings if m.parameter and m.parameter.id in channel_ids]

    if not mappings:
        log.debug(f"[LED] No active mappings matching channel_ids={channel_ids}")
        return []

    # Batch load all LiveData at once to avoid N+1 queries
    live_param_ids = [m.parameter_id for m in mappings]
    live_result = await db.execute(
        select(LiveData).where(LiveData.parameter_id.in_(live_param_ids))
    )
    live_by_param_id = {ld.parameter_id: ld for ld in live_result.scalars().all()}

    payload = []

    for mapping in mappings:
        server = server_by_id.get(mapping.server_id)
        if not server:
            continue

        param = mapping.parameter

        # ── Channel Name (parameter label on LED display) ─────────
        channel_name = (
            mapping.led_channel_name
            or mapping.api_vname
            or (param.tag_name if param else "")
        )

        # ── Station Name ──────────────────────────────────────────
        station_name = (
            param.device.station.name
            if param and hasattr(param, "device") and param.device and param.device.station
            else "Station"
        )

        # ── Unit ─────────────────────────────────────────────────
        unit = (
            mapping.led_unit
            or mapping.api_unit
            or (param.unit if param else "")
            or ""
        )

        # ── Live Value & Status ──────────────────────────────────
        live = live_by_param_id.get(mapping.parameter_id)
        quality = live.quality.value if live and live.quality else None

        if live and live.value is not None:
            try:
                channel_value = str(round(float(live.value), 2))
                if "." in channel_value:
                    channel_value = channel_value.rstrip("0").rstrip(".")
            except (ValueError, TypeError):
                channel_value = str(live.value)
        else:
            channel_value = "--"

        channel_status = "online" if quality == "U" else "offline"

        payload.append({
            "listchannelData": [
                {
                    "StationName": station_name,
                    "ChannelName": channel_name,
                    "ChannelValue": channel_value,
                    "Units": unit,
                    "ChannelStatus": channel_status,
                }
            ]
        })

    log.debug(f"[LED] Built {len(payload)} channel entries for PCBs {channel_ids}")
    return payload
