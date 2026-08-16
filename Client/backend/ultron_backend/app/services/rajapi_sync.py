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
from app.config import settings
from app.core.logger import get_logger
from app.services.lock_store import update_from_sync_response
from app.services.validation_state import set_last_successful_validation, get_last_successful_validation
from app.services.grace_period import is_within_grace, grace_remaining

log = get_logger("ultron.rajapi_sync")


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
        async with httpx.AsyncClient(timeout=3.0, follow_redirects=True) as c:
            r = await c.get("http://clients3.google.com/generate_204")
            return r.status_code == 204
    except Exception:
        return False


async def _execute_command(cmd: dict):
    """Execute a remote command received from RajAPI."""
    cmd_type = cmd.get("type") or cmd.get("action", "")
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

        elif cmd_type in ("provision_device", "sync_parameters", "add_parameter"):
            async with AsyncSessionLocal() as sdb:
                tag_name = payload.get("tag_name") or payload.get("name")
                unit = payload.get("unit", "")
                st_id = payload.get("station_id")
                st_name = payload.get("station_name")
                dev_id = payload.get("device_id")
                if tag_name:
                    param = await _get_or_create_param(
                        sdb, tag_name=tag_name, unit=unit,
                        station_id=st_id, station_name=st_name, device_id=dev_id
                    )
                    if param:
                        await sdb.commit()

        elif cmd_type == "update_config":
            import os
            for key, val in payload.items():
                os.environ[key.upper()] = str(val)
            log.info(f"Config updated via remote command: {list(payload.keys())}")

        else:
            log.warning(f"Unknown remote command type: {cmd_type}")

    except Exception as e:
        log.error(f"Failed to execute command {cmd_type}: {e}")


from app.models.device import Device
from app.models.parameter import Parameter

async def _get_or_create_param(
    db,
    tag_name: str,
    unit: str = "",
    station_id: int | None = None,
    station_name: str | None = None,
    device_id: int | None = None,
    std_limit: float | None = None,
    register_address: int = 40001
) -> Parameter | None:
    """
    Client-side RajAPI Sync Auto-Provisioning Guard & Duplicate Prevention.

    1. Checks if a Parameter with matching tag_name already exists in local client database.
       If found, reuses existing Parameter row without duplicate creation.
    2. If creating a new Parameter, REQUIRES an explicit station (valid station_id or station_name).
       If no station is specified, logs a warning and skips creation (returns None) rather than
       creating an unassigned/dangling parameter.
    """
    clean_tag = tag_name.strip() if tag_name else ""
    if not clean_tag:
        return None

    clean_station = station_name.strip() if station_name else None

    # 1. Check if parameter already exists in local DB (Duplicate Prevention)
    stmt = select(Parameter).where(Parameter.tag_name == clean_tag)
    res = await db.execute(stmt)
    existing_params = res.scalars().all()

    if existing_params:
        # Prefer parameter linked to device_id if provided
        for p in existing_params:
            if device_id and p.device_id == device_id:
                if not p.unit and unit:
                    p.unit = unit
                return p
        param = existing_params[0]
        if not param.unit and unit:
            param.unit = unit
        return param

    # 2. Require explicit station before creating new device/parameter
    target_station_id = station_id
    if not target_station_id and clean_station:
        from app.models.station import Station
        stmt_st = select(Station).where(Station.name == clean_station)
        res_st = await db.execute(stmt_st)
        st_obj = res_st.scalar_one_or_none()
        if st_obj:
            target_station_id = st_obj.id

    if not target_station_id or target_station_id <= 0:
        log.warning(
            f"[Client Sync Auto-Provisioning Guard] Skipped parameter creation for tag_name='{clean_tag}': "
            f"No valid explicit station specified (station_id={station_id}, station_name='{station_name}')."
        )
        return None

    from app.models.station import Station
    stmt_verify = select(Station).where(Station.id == target_station_id)
    res_v = await db.execute(stmt_verify)
    st_record = res_v.scalar_one_or_none()
    if not st_record:
        log.warning(
            f"[Client Sync Auto-Provisioning Guard] Skipped parameter creation for tag_name='{clean_tag}': "
            f"Station ID {target_station_id} does not exist in local database."
        )
        return None

    # 3. Find or create device for this station
    target_device_id = device_id
    if not target_device_id:
        dev_name = f"{st_record.name} Sync Device"
        stmt_dev = select(Device).where(Device.station_id == target_station_id, Device.name == dev_name)
        res_dev = await db.execute(stmt_dev)
        dev_obj = res_dev.scalar_one_or_none()
        if not dev_obj:
            dev_obj = Device(
                station_id=target_station_id,
                name=dev_name,
                protocol="modbus_tcp"
            )
            db.add(dev_obj)
            await db.flush()
        target_device_id = dev_obj.id

    # 4. Create new Parameter linked to verified station & device
    from sqlalchemy import func as sa_func
    max_res = await db.execute(sa_func.max(Parameter.display_order).select())
    max_ord = max_res.scalar() or 0

    new_param = Parameter(
        device_id=target_device_id,
        name=clean_tag,
        tag_name=clean_tag,
        unit=unit or "",
        register_address=register_address or 40001,
        display_order=max_ord + 1
    )
    db.add(new_param)
    await db.flush()
    log.info(
        f"[Client Sync Auto-Provisioning] Created parameter '{clean_tag}' linked to station_id={target_station_id} "
        f"(device_id={target_device_id})."
    )
    return new_param


async def _load_rajapi_config(db) -> tuple[str | None, str | None]:
    """Load auth token and station ID from DB config (fallback to env)."""
    central_key = getattr(settings, "CENTRAL_API_KEY", "")
    if central_key:
        return central_key, getattr(settings, "RAJAPI_STATION_ID", "default") or "default"
    from app.models.rajapi import RajAPIConfig
    result = await db.execute(select(RajAPIConfig).where(RajAPIConfig.is_enabled == True))
    config = result.scalars().first()
    if config and config.auth_token:
        return config.auth_token, settings.RAJAPI_STATION_ID or "default"
    # Fallback to env-based auth
    if settings.GATEWAY_ID and settings.DEVICE_SECRET:
        return None, settings.GATEWAY_ID
    if settings.RAJAPI_API_KEY:
        return settings.RAJAPI_API_KEY, settings.RAJAPI_STATION_ID
    return None, None


async def send_heartbeat():
    """Send lightweight heartbeat to RajAPI and process response."""
    async with AsyncSessionLocal() as db:
        token, station_id = await _load_rajapi_config(db)
    if not token and not (settings.GATEWAY_ID and settings.DEVICE_SECRET):
        return

    stats = await _get_system_stats()
    internet = await _check_internet()

    from app.services.polling_engine import is_polling_active
    polling_active = is_polling_active()

    payload = {
        "gateway_id": station_id or settings.RAJAPI_STATION_ID,
        "device_secret": token or settings.DEVICE_SECRET or settings.RAJAPI_API_KEY,
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
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            headers = {"Authorization": f"Bearer {token}"} if token and not settings.GATEWAY_ID else {}
            resp = await client.post(settings.RAJAPI_SYNC_URL, json=payload, headers=headers)

            if resp.status_code < 300:
                data = resp.json()

                # Update lock/AMC status
                await update_from_sync_response(data)

                # Phase 2: Record successful validation for license grace period
                await set_last_successful_validation()

                # ─── 1. Reconcile Server Broadcasts ─────────────────────────────────
                # RajAPI is authoritative. Synchronize incoming active broadcasts with local DB.
                # If a broadcast is deactivated or deleted on RajAPI, mark local active row as is_active=False.
                raw_broadcasts = data.get("broadcasts")
                if raw_broadcasts is None:
                    raw_broadcasts = data.get("broadcast", [])

                active_broadcast_payloads = raw_broadcasts if isinstance(raw_broadcasts, list) else []
                active_server_ids = set()
                active_server_texts = set()
                ws_broadcasts = []

                async with AsyncSessionLocal() as sdb:
                    # Query all current local active broadcasts
                    local_active_res = await sdb.execute(
                        select(Broadcast).where(Broadcast.is_active == True)
                    )
                    local_active_list = local_active_res.scalars().all()
                    local_by_server_id = {b.server_id: b for b in local_active_list if b.server_id}
                    local_by_text = {b.message: b for b in local_active_list if not b.server_id}

                    new_count = 0
                    for msg in active_broadcast_payloads:
                        s_id = str(msg.get("id")) if isinstance(msg, dict) and msg.get("id") is not None else None
                        text = msg.get("message", str(msg)) if isinstance(msg, dict) else str(msg)
                        sev = msg.get("message_type") or msg.get("severity", "info") if isinstance(msg, dict) else "info"
                        expires_raw = msg.get("expires_at") if isinstance(msg, dict) else None
                        expires = None
                        if expires_raw:
                            try:
                                expires = datetime.fromisoformat(str(expires_raw).replace("Z", "+00:00"))
                            except Exception:
                                pass

                        if s_id:
                            active_server_ids.add(s_id)
                        active_server_texts.add(text)

                        # Match by server_id or text
                        existing_bc = None
                        if s_id and s_id in local_by_server_id:
                            existing_bc = local_by_server_id[s_id]
                        elif not s_id and text in local_by_text:
                            existing_bc = local_by_text[text]
                        else:
                            # Also check DB for previously deactivated row to avoid duplicate creation
                            stmt = select(Broadcast)
                            if s_id:
                                stmt = stmt.where(Broadcast.server_id == s_id)
                            else:
                                stmt = stmt.where(Broadcast.message == text)
                            match_res = await sdb.execute(stmt)
                            existing_bc = match_res.scalars().first()

                        if existing_bc:
                            # Update fields and reactivate if necessary
                            existing_bc.message = text
                            existing_bc.severity = sev
                            existing_bc.expires_at = expires
                            existing_bc.is_active = True
                            if s_id:
                                existing_bc.server_id = s_id
                        else:
                            sdb.add(Broadcast(
                                server_id=s_id,
                                message=text,
                                severity=sev,
                                is_active=True,
                                expires_at=expires
                            ))
                            new_count += 1

                    # Reconcile: Mark local active broadcasts as inactive if not in active server list
                    deactivated_count = 0
                    for local_bc in local_active_list:
                        if local_bc.server_id:
                            if local_bc.server_id not in active_server_ids:
                                local_bc.is_active = False
                                deactivated_count += 1
                        else:
                            if local_bc.message not in active_server_texts:
                                local_bc.is_active = False
                                deactivated_count += 1

                    await sdb.commit()

                    # Fetch final reconciled active broadcasts for live WebSocket broadcast
                    now_utc = datetime.utcnow()
                    final_active_res = await sdb.execute(
                        select(Broadcast).where(
                            Broadcast.is_active == True,
                            (Broadcast.expires_at == None) | (Broadcast.expires_at > now_utc)
                        ).order_by(Broadcast.created_at.desc())
                    )
                    final_active_list = final_active_res.scalars().all()
                    ws_broadcasts = [
                        {
                            "id": b.id,
                            "server_id": b.server_id,
                            "message": b.message,
                            "severity": b.severity,
                            "is_active": b.is_active,
                            "created_at": b.created_at.isoformat() if b.created_at else None,
                            "expires_at": b.expires_at.isoformat() if b.expires_at else None,
                        }
                        for b in final_active_list
                    ]

                if new_count > 0 or deactivated_count > 0:
                    log.info(f"[RajAPI] Broadcasts reconciled: {new_count} new/reactivated, {deactivated_count} deactivated")

                # ─── 2. Live WebSocket Push to Connected UI Clients ──────────────────
                # Pushes updated lock_status, lock_reason, amc_expiry, and active broadcasts
                try:
                    from app.websocket_manager import ws_manager
                    await ws_manager.broadcast({
                        "type": "sync_update",
                        "lock_status": data.get("lock_status", "unlocked"),
                        "lock_reason": data.get("lock_reason"),
                        "amc_expiry": data.get("amc_expiry"),
                        "amc_expired": data.get("amc_expired", False),
                        "broadcasts": ws_broadcasts,
                    })
                except Exception as ws_err:
                    log.debug(f"[RajAPI] WS push skipped/error: {ws_err}")

                # Execute pending commands
                commands = data.get("commands", [])
                if commands:
                    log.info(f"[RajAPI] Received {len(commands)} command(s)")
                    for cmd in commands:
                        await _execute_command(cmd)

                log.debug(f"[RajAPI] Heartbeat OK — {len(commands)} cmd(s), {len(ws_broadcasts)} active broadcast(s)")

            elif resp.status_code == 401:
                log.warning("[RajAPI] Heartbeat rejected (401) — check GATEWAY_ID and DEVICE_SECRET")
            else:
                log.warning(f"[RajAPI] Heartbeat HTTP {resp.status_code}")

    except httpx.ConnectError:
        log.debug("[RajAPI] Offline — heartbeat skipped")
        # Phase 2: Check grace period when RajAPI is unreachable
        last_valid = await get_last_successful_validation()
        if last_valid is None:
            log.info("[RajAPI] No prior validation recorded — outside grace period")
        elif is_within_grace(last_valid):
            remaining = grace_remaining(last_valid)
            log.info(f"[RajAPI] Offline but within grace period ({remaining} remaining)")
        else:
            log.warning("[RajAPI] Offline and beyond grace period — license may be at risk")
    except Exception as e:
        log.debug(f"[RajAPI] Heartbeat error: {e}")
        last_valid = await get_last_successful_validation()
        if last_valid is None:
            log.info("[RajAPI] Heartbeat error, no prior validation recorded")
        elif not is_within_grace(last_valid):
            log.warning(f"[RajAPI] Heartbeat error and beyond grace period: {e}")


# Legacy alias — existing scheduler references this name
push_to_rajapi = send_heartbeat
