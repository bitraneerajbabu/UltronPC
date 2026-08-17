import asyncio
import math
import time
from datetime import datetime
from typing import Dict, Optional

from app.config import settings
from app.core.logger import get_logger
from app.database import AsyncSessionLocal
from app.services.comm_manager import comm_manager
from app.services.config_cache import CachedDeviceSpec, config_cache
from app.services.data_quality import dq_engine
from app.services.live_cache import DeviceState
from app.services.telemetry_service import telemetry_service
from app.services.time_sync import get_utc_now
from app.websocket_manager import ws_manager

log = get_logger("ultron.polling_engine")

_running: bool = False
_device_tasks: Dict[int, asyncio.Task] = {}

# Backward-compatibility pool aliases (mapped to central CommManager transport pools)
_tcp_readers = comm_manager._tcp_readers
_rtu_readers = comm_manager._rtu_readers
_tcp_custom = comm_manager._tcp_custom
_udp_custom = comm_manager._udp_custom
_csv_watchers = comm_manager._csv_watchers
_serial_ascii = comm_manager._serial_ascii


async def _device_poll_loop(device_id: int, interval: int):
    """
    Per-device deterministic polling loop.
    Reads config from ConfigCache, executes I/O via CommManager,
    updates LiveCache in memory, and sleeps until next clock-aligned tick.
    Zero DB queries and zero disk writes inside this loop.
    """
    log.info(f"Poll loop started: device_id={device_id} interval={interval}s")
    loop_start = time.monotonic()
    cycle = 0

    telemetry_service.set_device_state(device_id, DeviceState.STARTING)

    while _running:
        cycle += 1
        device_spec = config_cache.get_device(device_id)

        if not device_spec or not device_spec.is_active:
            log.warning(f"Device {device_id} not active or removed from cache — stopping loop")
            telemetry_service.set_device_state(device_id, DeviceState.STOPPED)
            break

        active_params = [p for p in device_spec.parameters if p.is_active]

        try:
            # 1. Execute hardware read via CommunicationManager
            readings = await comm_manager.execute_poll(device_spec, active_params)

            # 2. Data Quality Check
            if readings:
                param_meta = {
                    p.id: {
                        "min_valid": p.min_valid,
                        "max_valid": p.max_valid,
                        "alarm_high": p.alarm_high,
                    }
                    for p in active_params
                }
                readings = dq_engine.bulk_check(readings, param_meta)

                # 3. Update LiveCache via TelemetryService (In-Memory, Zero Disk I/O)
                now = get_utc_now()
                live_points = []
                param_map = {p.id: p for p in active_params}

                for r in readings:
                    pid = r["parameter_id"]
                    param = param_map.get(pid)
                    pt = telemetry_service.record_reading(
                        parameter_id=pid,
                        tag_name=param.tag_name if param else f"PARAM_{pid}",
                        station_name=device_spec.station_name,
                        device_name=device_spec.name,
                        device_id=device_spec.id,
                        value=r.get("value"),
                        raw_value=r.get("raw_value"),
                        quality=r.get("quality", "U"),
                        unit=param.unit if param else "",
                        timestamp=now,
                    )
                    live_points.append(pt.to_dict())

                # 4. WebSocket Live Push & Periodic Reading Log
                if live_points:
                    await ws_manager.broadcast({
                        "type": "live_data",
                        "device_id": device_spec.id,
                        "data": live_points,
                        "ts": now.isoformat(),
                    })
                    
                    # Log to SystemLog (ultron.polling.read) for Device Reading Logs UI
                    if cycle % max(1, int(10 / max(1, interval))) == 0:
                        summary = ", ".join(f"{pt['tag_name']}={pt['value']}{pt['unit'] or ''}" for pt in live_points)
                        try:
                            from app.models.telemetry import SystemLog
                            async with AsyncSessionLocal() as log_db:
                                log_db.add(SystemLog(
                                    log_type="comm",
                                    level="INFO",
                                    source="ultron.polling.read",
                                    message=f"[{device_spec.name}] {summary}",
                                ))
                                await log_db.commit()
                        except Exception:
                            pass

        except asyncio.CancelledError:
            log.info(f"Device poll loop cancelled: device_id={device_id}")
            telemetry_service.set_device_state(device_id, DeviceState.STOPPED)
            break
        except Exception as e:
            log.error(f"Error in device poll loop (device {device_id}): {e}")
            telemetry_service.set_device_state(
                device_id, DeviceState.ERROR, last_error=str(e).splitlines()[0]
            )

        # 5. Deterministic Clock-Aligned Sleep & Poll Overrun Policy
        curr_interval = device_spec.poll_interval or interval or 5
        elapsed = time.monotonic() - loop_start
        target_cycle = math.ceil(elapsed / curr_interval)
        if target_cycle < cycle:
            target_cycle = cycle

        target_time = loop_start + (target_cycle * curr_interval)
        sleep_duration = max(0.0, target_time - time.monotonic())

        if elapsed > (target_cycle * curr_interval):
            log.warning(
                f"Device {device_id} poll overrun: elapsed={elapsed:.2f}s > "
                f"interval={curr_interval}s — skipping missed cycle(s)"
            )

        await asyncio.sleep(sleep_duration)


async def start_polling():
    """
    Initialize ConfigurationCache and start an independent poll loop per device.
    Called on app startup.
    """
    global _running
    _running = True
    log.info("Polling engine starting …")

    # Step 1: Populate Configuration Cache from DB
    await config_cache.load_all()

    devices = config_cache.get_all_devices()
    if not devices:
        log.warning("No active devices found — polling engine idle")
        return

    # Initialize all parameters as OFFLINE in LiveCache until real hardware responses arrive
    for device in devices:
        for param in device.parameters:
            telemetry_service.record_reading(
                parameter_id=param.id,
                tag_name=param.tag_name,
                station_name=device.station_name,
                device_name=device.name,
                device_id=device.id,
                value=None,
                raw_value=None,
                quality="E",
                unit=param.unit or "",
                timestamp=get_utc_now(),
            )
        telemetry_service.set_device_state(
            device_id=device.id,
            state=DeviceState.STARTING,
            device_name=device.name,
        )

    # Step 2: Start per-device poll loops
    for device in devices:
        interval = device.poll_interval or settings.POLLING_DEFAULT_INTERVAL
        task = asyncio.create_task(
            _device_poll_loop(device.id, interval),
            name=f"poll-device-{device.id}",
        )
        _device_tasks[device.id] = task

    log.info(f"Polling engine started: {len(devices)} device(s)")


async def stop_polling():
    """Gracefully stop all polling loops and transition state to STOPPED."""
    global _running
    _running = False
    for dev_id, task in _device_tasks.items():
        task.cancel()
        telemetry_service.set_device_state(dev_id, DeviceState.STOPPED)
    _device_tasks.clear()
    log.info("Polling engine stopped")


async def reload_device(device_id: int):
    """
    Single Device Configuration Reload.
    Reloads only the specified device in ConfigCache and restarts its loop.
    Other devices continue polling uninterrupted.
    """
    if device_id in _device_tasks:
        _device_tasks[device_id].cancel()
        del _device_tasks[device_id]

    # Reload single device in ConfigCache & evict transport connection
    device_spec = await config_cache.reload_device(device_id)
    comm_manager.evict_device(device_id, device_spec.serial_port if device_spec else None)

    if device_spec and device_spec.is_active and _running:
        interval = device_spec.poll_interval or settings.POLLING_DEFAULT_INTERVAL
        task = asyncio.create_task(
            _device_poll_loop(device_id, interval),
            name=f"poll-device-{device_id}",
        )
        _device_tasks[device_id] = task
        log.info(f"Device {device_id} poll loop reloaded (interval={interval}s)")


def is_polling_active() -> bool:
    return _running


async def restart_polling():
    await stop_polling()
    await asyncio.sleep(1)
    await start_polling()









async def check_heartbeats():
    """
    Heartbeat monitor running every minute.
    Check last heartbeat (last_poll for devices, last_seen for stations).
    If heartbeat older than 90 seconds, Status = Offline.
    If heartbeat newer than 90 seconds, Status = Online.
    No analyzer data.
    """
    from datetime import datetime, timedelta
    from app.models.device import Device
    from app.models.station import Station, StationStatus
    from sqlalchemy import update
    
    from app.services.time_sync import get_utc_now
    now = get_utc_now()
    cutoff = now - timedelta(seconds=90)
    
    async with AsyncSessionLocal() as db:
        try:
            # Update devices based on last_poll
            await db.execute(
                update(Device)
                .where((Device.last_poll < cutoff) | (Device.last_poll.is_(None)))
                .values(status="offline")
            )
            await db.execute(
                update(Device)
                .where(Device.last_poll >= cutoff)
                .values(status="online")
            )
            
            # Update stations based on last_seen
            await db.execute(
                update(Station)
                .where((Station.last_seen < cutoff) | (Station.last_seen.is_(None)))
                .values(status=StationStatus.offline)
            )
            await db.execute(
                update(Station)
                .where(Station.last_seen >= cutoff)
                .values(status=StationStatus.online)
            )
            
            await db.commit()
            log.info("[Heartbeat Monitor] Checked and updated device/station statuses based on 90s cutoff")
        except Exception as e:
            log.error(f"[Heartbeat Monitor] Error checking heartbeats: {e}")
            await db.rollback()

