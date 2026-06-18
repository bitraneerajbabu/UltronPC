"""
UltrON — RajAPI Central Sync Service

Runs silently in the background every 60 seconds.
Pushes live telemetry to https://rajapi.com/api/v1/tgpcb/ using the
RAJAPI_API_KEY configured in .env for this specific client installation.

NO UI configuration required. Completely invisible to the plant operator.
"""

import asyncio
import httpx
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models.telemetry import LiveData, Broadcast
from app.models.parameter import Parameter
from app.models.device import Device
from app.models.station import Station
from app.config import settings
from app.core.logger import get_logger
from app.services.lock_store import update_from_sync_response

log = get_logger("ultron.rajapi_sync")


async def push_to_rajapi():
    """
    Collect all live data points and push them to the RajAPI central server
    in the TGPCB JSON format the server already understands.
    """
    if not settings.RAJAPI_SYNC_ENABLED:
        return

    if not settings.RAJAPI_API_KEY:
        # No key configured — skip silently (not an error)
        return

    try:
        async with AsyncSessionLocal() as db:
            # Query: LiveData -> Parameter -> Device -> Station
            # LiveData has parameter_id FK
            # Parameter has device_id FK
            # Device has station_id FK
            stmt = (
                select(LiveData, Parameter, Device, Station)
                .join(Parameter, LiveData.parameter_id == Parameter.id)
                .join(Device, Parameter.device_id == Device.id)
                .join(Station, Device.station_id == Station.id)
                .where(Parameter.is_active == True)
            )
            result = await db.execute(stmt)
            rows = result.all()

        if not rows:
            log.debug("[RajAPI] No live data rows found — skipping sync.")
            return

        # Build TGPCB-format variables list
        variables = []
        for ld, param, device, station in rows:
            val = ld.value
            if val is not None:
                try:
                    val = round(float(val), 4)
                except (TypeError, ValueError):
                    val = None

            variables.append({
                "Variablename": param.tag_name,
                "Value": val if val is not None else "",
                "Unit": param.unit or "",
                "Flags": "",
            })

        # Use the most recent timestamp from the live data rows
        timestamps = [row[0].timestamp for row in rows if row[0].timestamp]
        latest_ts = max(timestamps) if timestamps else datetime.now(timezone.utc)

        payload = {
            "DeviceID": settings.RAJAPI_STATION_ID,
            "FunctionName": 53,
            "Datetime": latest_ts.strftime("%Y-%m-%d %H:%M:%S"),
            "Name": settings.RAJAPI_API_KEY,   # API key in the Name field
            "Password": "",
            "additionalInfo": {
                "SoftwareVersion": getattr(settings, "APP_VERSION", "1.04"),
            },
            "Variables": variables,
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(settings.RAJAPI_SYNC_URL, json=payload)
            if resp.status_code < 300:
                log.info(
                    f"[RajAPI] ✓ Synced {len(variables)} parameters "
                    f"to {settings.RAJAPI_SYNC_URL} (HTTP {resp.status_code})"
                )
                # Parse response for broadcast messages and lock status
                try:
                    sync_resp = resp.json()
                    # Store lock status from server
                    await update_from_sync_response(sync_resp)
                    # Handle broadcast messages from server
                    broadcasts = sync_resp.get("broadcasts") or sync_resp.get("broadcast")
                    if broadcasts:
                        async with AsyncSessionLocal() as sdb:
                            if isinstance(broadcasts, list):
                                for msg in broadcasts:
                                    text = msg.get("message", msg) if isinstance(msg, dict) else msg
                                    sev = msg.get("severity", "info") if isinstance(msg, dict) else "info"
                                    expires = None
                                    if isinstance(msg, dict) and msg.get("expires_at"):
                                        try:
                                            from datetime import datetime as dt2
                                            expires = dt2.fromisoformat(msg["expires_at"].replace("Z", "+00:00"))
                                        except: pass
                                    b = Broadcast(message=str(text), severity=sev, expires_at=expires)
                                    sdb.add(b)
                            elif isinstance(broadcasts, str):
                                sdb.add(Broadcast(message=broadcasts))
                            await sdb.commit()
                            log.info(f"[RajAPI] ✓ Stored {len(broadcasts) if isinstance(broadcasts, list) else 1} broadcast(s)")
                except Exception as parse_err:
                    log.debug(f"[RajAPI] Response parse (non-critical): {parse_err}")
            else:
                log.warning(
                    f"[RajAPI] ✗ Sync HTTP {resp.status_code}: "
                    f"{resp.text[:300]}"
                )

    except httpx.ConnectError:
        # Network offline — silently skip, will retry next minute
        log.debug("[RajAPI] Offline — sync skipped, will retry next cycle.")
    except Exception as e:
        log.warning(f"[RajAPI] Sync error: {type(e).__name__}: {e}")
