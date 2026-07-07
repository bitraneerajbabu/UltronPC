"""
UltrON — RajAPI Autopilot Heartbeat Service

Sends a lightweight health heartbeat every 60 seconds to RajAPI.
RajAPI responds with pending commands and broadcasts — one request for everything.

This replaces the old full-data push mechanism.
"""

import asyncio
import httpx
import psutil
import platform
from datetime import datetime, timezone
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.telemetry import Broadcast
from app.config import settings, RAJAPI_SYNC_URL
from app.core.logger import get_logger
from app.services.lock_store import update_from_sync_response

log = get_logger("ultron.rajapi_sync")

IGNORED_PLACEHOLDER_BROADCASTS = {
    "scheduled maintenance tonight at 2 am": {"2026-07-05"},
}


def _is_ignored_placeholder_broadcast(message: str, expires_at: str | None = None) -> bool:
    normalized = " ".join((message or "").strip().lower().split())
    ignored_expiry_dates = IGNORED_PLACEHOLDER_BROADCASTS.get(normalized)
    if not ignored_expiry_dates or not expires_at:
        return False
    return any(str(expires_at).startswith(expiry_date) for expiry_date in ignored_expiry_dates)


async def _get_system_stats() -> dict:
    try:
        return {
            "cpu_usage": round(psutil.cpu_percent(interval=0.5), 1),
            "ram_usage": round(psutil.virtual_memory().percent, 1),
            "disk_usage": round(psutil.disk_usage("/").percent, 1),
        }
    except Exception:
        return {"cpu_usage": 0, "ram_usage": 0, "disk_usage": 0}


async def _check_internet() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get("http://clients3.google.com/generate_204")
            return r.status_code == 204
    except Exception:
        return False


async def _execute_command(cmd: dict):
    """Execute a remote command received from RajAPI."""
    cmd_type = cmd.get("type", "")
    payload = cmd.get("payload", {})
    log.info(f"Executing remote command: {cmd_type}")

    try:
        if cmd_type == "restart_polling":
            from app.services.polling_engine import restart_polling
            await restart_polling()

        elif cmd_type == "stop_polling":
            from app.services.polling_engine import stop_polling
            await stop_polling()

        elif cmd_type == "start_polling":
            from app.services.polling_engine import start_polling
            await start_polling()

        elif cmd_type == "restart_app":
            import os, sys
            os._exit(0)

        elif cmd_type == "factory_reset":
            async with AsyncSessionLocal() as db:
                from sqlalchemy import text
                for table in ["telemetry", "averages", "live_data", "parameters", "devices", "stations"]:
                    try:
                        await db.execute(text(f"DELETE FROM {table}"))
                    except Exception:
                        pass
                await db.commit()

        elif cmd_type == "enable_cpcb":
            settings.RAJAPI_SYNC_ENABLED = True
            log.info("CPCB push enabled via remote command")

        elif cmd_type == "disable_cpcb":
            settings.RAJAPI_SYNC_ENABLED = False
            log.info("CPCB push disabled via remote command")

        elif cmd_type == "show_toast":
            msg = payload.get("message", "Message from RajAPI")
            sev = payload.get("severity", "info")
            async with AsyncSessionLocal() as db:
                db.add(Broadcast(message=msg, severity=sev))
                await db.commit()

        elif cmd_type == "update_config":
            import os
            for key, val in payload.items():
                os.environ[key.upper()] = str(val)
            log.info(f"Config updated via remote command: {list(payload.keys())}")

        else:
            log.warning(f"Unknown remote command type: {cmd_type}")

    except Exception as e:
        log.error(f"Failed to execute command {cmd_type}: {e}")


async def send_heartbeat():
    """Send lightweight heartbeat to RajAPI and process response."""
    if not settings.GATEWAY_ID and not settings.RAJAPI_API_KEY:
        return

    stats = await _get_system_stats()
    internet = await _check_internet()

    from app.services.polling_engine import is_polling_active
    polling_active = is_polling_active()

    payload = {
        "gateway_id": settings.GATEWAY_ID or settings.RAJAPI_STATION_ID,
        "device_secret": settings.DEVICE_SECRET or settings.RAJAPI_API_KEY,
        "version": settings.APP_VERSION,
        "heartbeat_ts": datetime.now(timezone.utc).isoformat(),
        "status": "online" if internet else "offline",
        "cpu_usage": stats["cpu_usage"],
        "ram_usage": stats["ram_usage"],
        "disk_usage": stats["disk_usage"],
        "internet": internet,
        "vpn": True,
        "polling_active": polling_active,
        "service_status": {
            "polling": polling_active,
            "cpcb_push": settings.RAJAPI_SYNC_ENABLED,
        },
        "hostname": platform.node(),
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(RAJAPI_SYNC_URL, json=payload)

            if resp.status_code < 300:
                data = resp.json()

                # Update lock/AMC status
                await update_from_sync_response(data)

                # Handle broadcasts
                broadcasts = data.get("broadcasts") or data.get("broadcast", [])
                if broadcasts:
                    new_count = 0
                    if isinstance(broadcasts, list):
                        for msg in broadcasts:
                            text = msg.get("message", str(msg)) if isinstance(msg, dict) else str(msg)
                            expires_raw = msg.get("expires_at") if isinstance(msg, dict) else None
                            if _is_ignored_placeholder_broadcast(text, expires_raw):
                                log.info("[RajAPI] Ignored placeholder broadcast")
                                continue
                            sev = msg.get("severity", "info") if isinstance(msg, dict) else "info"
                            expires = None
                            if expires_raw:
                                try:
                                    expires = datetime.fromisoformat(str(expires_raw).replace("Z", "+00:00"))
                                except Exception:
                                    pass
                            async with AsyncSessionLocal() as sdb:
                                # Deduplication: skip if identical active message already exists
                                existing = await sdb.execute(
                                    select(Broadcast).where(
                                        Broadcast.message == text,
                                        Broadcast.is_active == True,
                                    )
                                )
                                if existing.scalar_one_or_none() is None:
                                    sdb.add(Broadcast(message=text, severity=sev, expires_at=expires))
                                    await sdb.commit()
                                    new_count += 1

                    if new_count > 0:
                        log.info(f"[RajAPI] Stored {new_count} new broadcast(s)")
                    else:
                        log.debug("[RajAPI] Broadcasts already up to date — no new entries")

                # Execute pending commands
                commands = data.get("commands", [])
                if commands:
                    log.info(f"[RajAPI] Received {len(commands)} command(s)")
                    for cmd in commands:
                        await _execute_command(cmd)

                log.debug(f"[RajAPI] Heartbeat OK — {len(commands)} cmd(s), {len(broadcasts) if isinstance(broadcasts, list) else 0} broadcast(s)")

            elif resp.status_code == 401:
                log.warning("[RajAPI] Heartbeat rejected (401) — check GATEWAY_ID and DEVICE_SECRET")
            else:
                log.warning(f"[RajAPI] Heartbeat HTTP {resp.status_code}")

    except httpx.ConnectError:
        log.debug("[RajAPI] Offline — heartbeat skipped")
    except Exception as e:
        log.debug(f"[RajAPI] Heartbeat error: {e}")


# Legacy alias — existing scheduler references this name
push_to_rajapi = send_heartbeat
