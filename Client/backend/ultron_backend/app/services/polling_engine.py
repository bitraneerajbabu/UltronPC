"""
UltrON — Polling Engine (Central Orchestrator)
Manages the polling lifecycle for all active devices.
Dispatches to the correct protocol service based on device.protocol.
Persists telemetry, runs data quality, triggers alarm checks, and live pushes.
"""

import asyncio
from datetime import datetime
from typing import Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from sqlalchemy.orm import selectinload
import httpx

from app.database import AsyncSessionLocal
from app.models.station import Station, StationStatus
from app.models.device import Device, DeviceProtocol
from app.models.parameter import Parameter
from app.models.telemetry import LiveData, HistoricalData, AverageType, DataQuality, SystemLog

from app.services.modbus_tcp import ModbusTCPReader
from app.services.modbus_rtu import ModbusRTUReader
from app.services.tcp_custom import TCPCustomReader
from app.services.udp_custom import UDPCustomReader
from app.services.csv_watcher import CSVWatcher, DailyCSVWatcher, SmartWatcher, DailySmartWatcher
from app.services.data_quality import dq_engine
from app.services.alarm_engine import alarm_engine
from app.websocket_manager import ws_manager
from app.config import settings
from app.core.logger import get_logger

log = get_logger("ultron.polling_engine")

# ─── Valid DataQuality values ─────────────────────────────────────────────────
_VALID_QUALITIES = {q.value for q in DataQuality}

# ─── Reader Pool ──────────────────────────────────────────────────────────────
# Keep one reader instance per device to maintain persistent connections
_tcp_readers:    Dict[int, ModbusTCPReader] = {}
_rtu_readers:    Dict[str, ModbusRTUReader] = {}   # key = serial_port
_tcp_custom:     Dict[int, TCPCustomReader] = {}
_udp_custom:     Dict[int, UDPCustomReader] = {}
_csv_watchers:   Dict[int, CSVWatcher] = {}


def _get_modbus_tcp(device: Device) -> ModbusTCPReader:
    if device.id not in _tcp_readers:
        host = device.host or ""
        port = device.port or 502
        _tcp_readers[device.id] = ModbusTCPReader(host, port, device.slave_id or 1, device.timeout or 5)
    return _tcp_readers[device.id]


def _get_modbus_rtu(device: Device) -> ModbusRTUReader:
    port_key = device.serial_port or "unknown"
    if port_key not in _rtu_readers:
        _rtu_readers[port_key] = ModbusRTUReader(
            port=device.serial_port or "COM1",
            baudrate=device.baud_rate or 9600,
            data_bits=device.data_bits or 8,
            parity=device.parity or "N",
            stop_bits=device.stop_bits or 1,
            timeout=device.timeout or 3,
        )
    return _rtu_readers[port_key]


def _get_tcp_custom(device: Device) -> TCPCustomReader:
    if device.id not in _tcp_custom:
        _tcp_custom[device.id] = TCPCustomReader(
            host=device.host or "",
            port=device.port or 4001,
            timeout=device.timeout or 5,
            request_hex=device.request_hex,
            response_delimiter=device.response_delimiter or "newline",
        )
    return _tcp_custom[device.id]


def _get_udp_custom(device: Device) -> UDPCustomReader:
    if device.id not in _udp_custom:
        _udp_custom[device.id] = UDPCustomReader(
            host=device.host or "",
            port=device.port or 4001,
            timeout=device.timeout or 5,
            request_hex=device.request_hex,
            response_delimiter=device.response_delimiter or "newline",
        )
    return _udp_custom[device.id]


def _get_csv_watcher(device: Device) -> Optional[CSVWatcher]:
    if not device.csv_folder and not device.csv_path:
        return None
    if device.id not in _csv_watchers:
        if device.csv_folder:
            # DailySmartWatcher auto-detects .csv vs .xlsx from the filename pattern
            _csv_watchers[device.id] = DailySmartWatcher(
                device.csv_folder,
                device.csv_filename_pattern or "{YYYYMMDD}.csv",
                device.csv_delimiter or ",",
                device.poll_interval or 60,
                device.csv_timestamp_col if device.csv_timestamp_col is not None else 0,
            )
        else:
            # SmartWatcher auto-detects .csv vs .xlsx from the file path extension
            _csv_watchers[device.id] = SmartWatcher(
                device.csv_path,
                device.csv_delimiter or ",",
                device.poll_interval or 60,
                device.csv_timestamp_col,
            )
    return _csv_watchers[device.id]


def _cleanup_reader(device_id: int, protocol: str, device: Device = None):
    """Remove stale reader instances from pool so fresh connections are made."""
    _tcp_readers.pop(device_id, None)
    _tcp_custom.pop(device_id, None)
    _udp_custom.pop(device_id, None)
    # RS485 RTU: shared by port key — also evict if the device's port is known
    if device and device.serial_port:
        old_reader = _rtu_readers.pop(device.serial_port, None)
        if old_reader:
            # Best-effort close; don't await here since we're in a sync context
            log.info(f"Evicted stale RTU reader for port '{device.serial_port}' (device {device_id})")
    _csv_watchers.pop(device_id, None)


# ─── Core Poll Function ───────────────────────────────────────────────────────
async def _poll_device(device: Device, parameters: list[Parameter]):
    """
    Poll a single device, persist results, run quality/alarm checks, push live data.
    """
    if not parameters:
        return

    param_dicts = [
        {
            "id":               p.id,
            "tag_name":         p.tag_name,
            "register_address": p.register_address,
            "register_count":   p.register_count,
            "register_type":    p.register_type,
            "data_type":        p.data_type,
            "byte_order":       p.byte_order,
            "scale_factor":     p.scale_factor,
            "offset":           p.offset,
            "min_valid":        p.min_valid,
            "max_valid":        p.max_valid,
            "host":             p.host,
            "port":             p.port,
            "serial_port":      p.serial_port,
            "baud_rate":        p.baud_rate,
            "data_bits":        p.data_bits,
            "parity":           p.parity,
            "stop_bits":        p.stop_bits,
            "slave_id":         p.slave_id,
            "parse_method":     p.parse_method,
            "parse_config":     p.parse_config,
        }
        for p in parameters
    ]

    protocol = device.protocol.value if hasattr(device.protocol, "value") else str(device.protocol)
    if isinstance(protocol, str) and "." in protocol:
        protocol = protocol.split(".")[-1]

    readings = []

    try:
        if protocol == "modbus_tcp":
            reader = _get_modbus_tcp(device)
            readings = await reader.read_all_parameters(param_dicts)

        elif protocol == "modbus_rtu":
            reader = _get_modbus_rtu(device)
            readings = await reader.read_all_parameters(device.slave_id or 1, param_dicts)
            await reader.close()  # close RS485 after each poll — devices don't stream continuously

        elif protocol == "tcp_custom":
            reader = _get_tcp_custom(device)
            readings = await reader.poll_parameters(param_dicts)

        elif protocol == "udp_custom":
            reader = _get_udp_custom(device)
            readings = await reader.poll_parameters(param_dicts)

        elif protocol == "csv":
            watcher = _get_csv_watcher(device)
            if watcher:
                readings = watcher.get_latest_values(param_dicts)
            else:
                log.warning(f"Device {device.id}: CSV protocol but no CSV source configured")
                readings = [
                    {"parameter_id": p["id"], "value": None, "raw_value": None, "quality": "E"}
                    for p in param_dicts
                ]

        elif protocol == "opc_ua":
            # OPC-UA not yet implemented — mark all as E
            log.warning(f"Device {device.id} ({device.name}): OPC-UA protocol not yet implemented")
            readings = [
                {"parameter_id": p["id"], "value": None, "raw_value": None, "quality": "E"}
                for p in param_dicts
            ]

        else:
            log.warning(f"Unknown protocol '{protocol}' for device {device.id}")
            return

    except Exception as e:
        log.error(f"Poll error device={device.id} ({device.name}): {e}")
        # Force reconnect next cycle by clearing the reader from pool
        _cleanup_reader(device.id, protocol, device)
        readings = [
            {"parameter_id": p["id"], "value": None, "raw_value": None, "quality": "E"}
            for p in param_dicts
        ]

    if not readings:
        return

    # ─── Data Quality ─────────────────────────────────────────────────────────
    param_meta = {p.id: {"min_valid": p.min_valid, "max_valid": p.max_valid} for p in parameters}
    readings = dq_engine.bulk_check(readings, param_meta)

    # ─── Round Values to 2 Decimals ───────────────────────────────────────────
    for r in readings:
        if r.get("value") is not None and isinstance(r["value"], (int, float)):
            r["value"] = round(float(r["value"]), 2)

    # ─── Persist + Alarm Check ────────────────────────────────────────────────
    now = datetime.utcnow()
    param_by_id = {p.id: p for p in parameters}
    live_points = []

    async with AsyncSessionLocal() as db:
        # Resolve station name safely from the db
        station_name = ""
        if device.station_id:
            st_res = await db.execute(
                select(Station.name).where(Station.id == device.station_id)
            )
            station_name = st_res.scalar() or ""

        # Batch delete-then-insert live records
        param_ids = [r["parameter_id"] for r in readings]
        hist_rows = []
        live_rows = []
        alarm_tasks = []

        if param_ids:
            await db.execute(
                delete(LiveData).where(LiveData.parameter_id.in_(param_ids))
            )

        for r in readings:
            q_str = r.get("quality", "U")
            quality_enum = DataQuality(q_str) if q_str in _VALID_QUALITIES else DataQuality.good
            ts = r.get("timestamp") if r.get("timestamp") is not None else now

            hist_rows.append(HistoricalData(
                parameter_id=r["parameter_id"],
                timestamp=ts,
                value=r["value"],
                raw_value=r.get("raw_value"),
                quality=quality_enum,
                source="poll",
            ))

            live_rows.append(LiveData(
                parameter_id=r["parameter_id"],
                timestamp=ts,
                value=r["value"],
                raw_value=r.get("raw_value"),
                quality=quality_enum,
                source="poll",
            ))

            param = param_by_id.get(r["parameter_id"])
            if param:
                alarm_tasks.append(alarm_engine.evaluate(db, param, r["value"], r.get("quality", "U")))
                live_points.append({
                    "parameter_id": param.id,
                    "tag_name":     param.tag_name,
                    "station_name": station_name,
                    "device_name":  device.name,
                    "value":        r["value"],
                    "unit":         param.unit or "",
                    "quality":      r.get("quality", "U"),
                    "timestamp":    ts.isoformat(),
                })

        # Bulk insert historical and live data
        if hist_rows:
            db.add_all(hist_rows)
        if live_rows:
            db.add_all(live_rows)

        # Evaluate alarms in parallel after bulk writes
        for task in alarm_tasks:
            await task

        # Update device status
        any_good = any(r.get("quality") in ("U", "O") for r in readings)
        new_status = "online" if any_good else "offline"
        await db.execute(
            Device.__table__.update()
            .where(Device.id == device.id)
            .values(
                status=new_status,
                last_poll=now,
                last_error=None if any_good else f"Poll failed at {now.isoformat()}",
            )
        )

        # Update station status
        if device.station_id:
            station_status = "online" if any_good else "offline"
            await db.execute(
                Station.__table__.update()
                .where(Station.id == device.station_id)
                .values(status=station_status, last_seen=now)
            )

        # ─── SystemLog for device events ─────────────────────────────────────
        if not any_good:
            db.add(SystemLog(log_type="comm", level="ERROR", source="ultron.polling",
                message=f"Device {device.name} ({device.id}): OFFLINE — no data"))
        else:
            bad_params = []
            for r in readings:
                q = r.get("quality")
                if q == "E":
                    p = param_by_id.get(r["parameter_id"])
                    bad_params.append(p.tag_name if p else f"#{r['parameter_id']}")
                elif q == "O":
                    p = param_by_id.get(r["parameter_id"])
                    bad_params.append(f"{p.tag_name if p else '#'+str(r['parameter_id'])}={r.get('value')} OOR")
            if bad_params:
                db.add(SystemLog(log_type="comm", level="WARNING", source="ultron.polling",
                    message=f"Device {device.name} ({device.id}): {', '.join(bad_params)}"))

        await db.commit()

    # ─── WebSocket Live Push ──────────────────────────────────────────────────
    if live_points:
        await ws_manager.broadcast({
            "type": "live_data",
            "device_id": device.id,
            "data": live_points,
            "ts": now.isoformat(),
        })


# ─── Scheduler Loop ───────────────────────────────────────────────────────────
_running: bool = False
_device_tasks: Dict[int, asyncio.Task] = {}


async def _device_poll_loop(device_id: int, interval: int):
    """Per-device polling loop — runs independently."""
    log.info(f"Poll loop started: device_id={device_id} interval={interval}s")
    consecutive_errors = 0
    while _running:
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Device)
                    .where(Device.id == device_id, Device.is_active == True)
                    .options(selectinload(Device.parameters), selectinload(Device.station))
                )
                device = result.scalar_one_or_none()

            if not device:
                log.warning(f"Device {device_id} not found or inactive — stopping loop")
                break

            active_params = [p for p in device.parameters if p.is_active]
            await _poll_device(device, active_params)
            consecutive_errors = 0  # reset on success

        except asyncio.CancelledError:
            log.info(f"Device poll loop cancelled: device_id={device_id}")
            break
        except Exception as e:
            err_str = str(e)
            consecutive_errors += 1
            # Transient errors (stale DB pool during startup/restart) back off briefly
            if "no active connection" in err_str:
                backoff = min(5 * consecutive_errors, 30)
                log.warning(f"Device loop transient error device={device_id} (retry #{consecutive_errors}, backoff {backoff}s): {err_str.splitlines()[0]}")
                await asyncio.sleep(backoff)
                continue
            else:
                log.error(f"Device loop error device={device_id}: {e}")

        await asyncio.sleep(interval)


async def _central_sync_worker():
    """Background task to push telemetry data to RajAPI.com"""
    log.info("Central Sync Worker started")
    
    from app.config import CENTRAL_API_URL
    import os
    central_url = CENTRAL_API_URL

    while _running:
        api_key = os.environ.get("CENTRAL_API_KEY", "")
        if not api_key:
            # If AMC is expired or setup is pending, we don't sync, but we wait in the loop
            log.debug("No CENTRAL_API_KEY configured or AMC pending. Central sync paused.")
            await asyncio.sleep(60)
            continue

        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(LiveData).join(Parameter).options(selectinload(LiveData.parameter)))
                live_data = result.scalars().all()
                
                if live_data:
                    payload = {
                        "client_id": "ultron_client_01",
                        "points": [
                            {
                                "tag_name": ld.parameter.tag_name,
                                "value": ld.value,
                                "quality": ld.quality.value if hasattr(ld.quality, "value") else str(ld.quality),
                                "timestamp": ld.timestamp.isoformat()
                            } for ld in live_data
                        ]
                    }
                    
                    async with httpx.AsyncClient() as client:
                        response = await client.post(
                            central_url, 
                            json=payload,
                            headers={"X-API-Key": api_key},
                            timeout=10.0
                        )
                        if response.status_code != 200:
                            log.warning(f"Central sync failed: {response.status_code} {response.text}")
                            # Important: the API key might have been deleted on the server (AMC expired)
                            if response.status_code == 401:
                                log.error("AMC Token expired or invalid! Locking out client.")
                                if "CENTRAL_API_KEY" in os.environ:
                                    del os.environ["CENTRAL_API_KEY"]
                                
                                from app.config import APP_DIR
                                from app.core.config_crypt import write_env_enc_from_dict
                                enc_file = str(APP_DIR / ".env.enc")
                                write_env_enc_from_dict({"CENTRAL_API_KEY": ""}, enc_file)
                        else:
                            log.debug("Successfully synced telemetry to RajAPI")
                            
        except Exception as e:
            log.error(f"Central sync error: {e}")
            
        await asyncio.sleep(60) # Sync every 60 seconds




async def start_polling():
    """
    Load all active devices from DB and start a poll loop per device.
    Called on app startup.
    """
    global _running
    _running = True
    log.info("Polling engine starting …")

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Device).where(Device.is_active == True)
        )
        devices = result.scalars().all()

    if not devices:
        log.warning("No active devices found — polling engine idle (add devices via the UI)")
        return

    for device in devices:
        rtu_default = device.poll_interval or 5 if device.protocol == DeviceProtocol.modbus_rtu else None
        interval = rtu_default or device.poll_interval or settings.POLLING_DEFAULT_INTERVAL
        task = asyncio.create_task(
            _device_poll_loop(device.id, interval),
            name=f"poll-device-{device.id}",
        )
        _device_tasks[device.id] = task

    # Start the central sync worker
    _device_tasks[-1] = asyncio.create_task(_central_sync_worker(), name="central-sync")

    log.info(f"Polling engine started: {len(devices)} device(s)")


async def stop_polling():
    """Gracefully stop all polling loops."""
    global _running
    _running = False
    for task in _device_tasks.values():
        task.cancel()
    _device_tasks.clear()
    log.info("Polling engine stopped")


async def reload_device(device_id: int):
    """
    Restart the poll loop for a specific device (e.g., after config change).
    """
    if device_id in _device_tasks:
        _device_tasks[device_id].cancel()
        del _device_tasks[device_id]

    # Clear cached readers so fresh connections are made with new config
    _tcp_readers.pop(device_id, None)
    _tcp_custom.pop(device_id, None)
    _udp_custom.pop(device_id, None)
    _csv_watchers.pop(device_id, None)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Device).where(Device.id == device_id))
        device = result.scalar_one_or_none()

    if device and device.is_active and _running:
        rtu_default = device.poll_interval or 5 if device.protocol == DeviceProtocol.modbus_rtu else None
        interval = rtu_default or device.poll_interval or settings.POLLING_DEFAULT_INTERVAL
        task = asyncio.create_task(
            _device_poll_loop(device_id, interval),
            name=f"poll-device-{device_id}",
        )
        _device_tasks[device_id] = task
        log.info(f"Device {device_id} poll loop reloaded (interval={interval}s)")
