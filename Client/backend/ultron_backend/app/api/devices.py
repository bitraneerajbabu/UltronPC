"""UltrON — Devices API"""

import asyncio
import re
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.database import get_db
from app.models.device import Device, DeviceProtocol
from app.schemas.device import DeviceCreate, DeviceUpdate, DeviceOut
from app.services import polling_engine
from app.core.logger import get_logger
from app.core.security import get_current_user, require_admin

log = get_logger("ultron.api.devices")
router = APIRouter(
    prefix="/devices",
    tags=["Devices"],
    dependencies=[Depends(get_current_user)],
)


def generate_tag_name(name: str) -> str:
    if not name:
        return ""
    tag = name.strip().upper()
    tag = re.sub(r'[^A-Z0-9_]', '_', tag)
    tag = re.sub(r'_+', '_', tag)
    tag = tag.strip('_')
    return tag[:50]


@router.get("/", response_model=List[DeviceOut])
async def list_devices(station_id: int = None, db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import selectinload
    query = select(Device).options(selectinload(Device.parameters)).order_by(Device.id)
    if station_id:
        query = query.where(Device.station_id == station_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/",
    response_model=DeviceOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_device(payload: DeviceCreate, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    from app.models.station import Station
    from app.models.parameter import Parameter
    from sqlalchemy.orm import selectinload

    # Resolve station — strict lookup, no auto-create
    station_id = payload.station_id
    station_name = payload.station_name
    if station_name and (not station_id or station_id <= 0):
        res = await db.execute(select(Station).where(Station.name == station_name))
        existing_station = res.scalar_one_or_none()
        if existing_station:
            station_id = existing_station.id
        else:
            raise HTTPException(
                status_code=422,
                detail=f"Station '{station_name}' not found. Create it first."
            )

    if not station_id:
        # Fallback to first station
        res = await db.execute(select(Station).order_by(Station.id))
        first_station = res.scalars().first()
        if first_station:
            station_id = first_station.id
        else:
            raise HTTPException(
                status_code=422,
                detail="No stations exist. Create a station first before adding devices."
            )

    # Create device
    device_dict = payload.model_dump(exclude={"parameters", "station_name", "station_id"})
    device = Device(**device_dict)
    device.station_id = station_id
    db.add(device)
    await db.flush()

    # Create parameters
    params_data = payload.parameters or []
    for p_data in params_data:
        p_dict = p_data.model_dump()
        p_dict.pop("id", None)
        p_dict["device_id"] = device.id
        if not p_dict.get("tag_name"):
            p_dict["tag_name"] = generate_tag_name(p_dict["name"])
        if p_dict.get("display_order", 0) == 0:
            from sqlalchemy import func as sa_func
            max_res = await db.execute(sa_func.max(Parameter.display_order).select())
            max_ord = max_res.scalar() or 0
            p_dict["display_order"] = max_ord + 1
        param = Parameter(**p_dict)
        db.add(param)

    await db.flush()
    await db.commit()

    # Start polling for the new device immediately
    background_tasks.add_task(polling_engine.reload_device, device.id)
    log.info(f"Device {device.id} ({device.name}) created — poll loop scheduled")

    # Return loaded
    result = await db.execute(
        select(Device).options(selectinload(Device.parameters)).where(Device.id == device.id)
    )
    return result.scalar_one()


@router.get("/{device_id}", response_model=DeviceOut)
async def get_device(device_id: int, db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Device).options(selectinload(Device.parameters)).where(Device.id == device_id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.patch("/{device_id}", response_model=DeviceOut, dependencies=[Depends(require_admin)])
async def update_device(
    device_id: int,
    payload: DeviceUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    from app.models.station import Station
    from app.models.parameter import Parameter
    from sqlalchemy.orm import selectinload

    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Resolve station — strict lookup, no auto-create/rename
    station_id = payload.station_id
    station_name = payload.station_name
    if station_name and (not station_id or station_id <= 0):
        res = await db.execute(select(Station).where(Station.name == station_name))
        existing_station = res.scalar_one_or_none()
        if existing_station:
            station_id = existing_station.id
        else:
            raise HTTPException(
                status_code=422,
                detail=f"Station '{station_name}' not found. Create it first."
            )

    if station_id:
        device.station_id = station_id

    # Update main device fields
    update_data = payload.model_dump(exclude_unset=True, exclude={"parameters", "station_id", "station_name"})
    for field, val in update_data.items():
        setattr(device, field, val)

    # Process nested parameters
    payload_dump = payload.model_dump(exclude_unset=True)
    if "parameters" in payload_dump:
        param_result = await db.execute(select(Parameter).where(Parameter.device_id == device_id))
        existing_params = param_result.scalars().all()
        existing_params_map = {p.id: p for p in existing_params}

        new_params_data = payload.parameters or []
        new_param_ids = set()

        for p_data in new_params_data:
            p_dict = p_data.model_dump()
            p_id = p_dict.get("id")
            p_dict.pop("id", None)
            p_dict["device_id"] = device_id

            if not p_dict.get("tag_name"):
                p_dict["tag_name"] = generate_tag_name(p_dict["name"])

            if p_id and p_id in existing_params_map:
                param = existing_params_map[p_id]
                for k, v in p_dict.items():
                    setattr(param, k, v)
                new_param_ids.add(p_id)
            else:
                new_param = Parameter(**p_dict)
                db.add(new_param)

        for old_param_id, old_param in existing_params_map.items():
            if old_param_id not in new_param_ids:
                await db.delete(old_param)

    await db.flush()
    await db.commit()

    # Query with selectinload
    res = await db.execute(
        select(Device).options(selectinload(Device.parameters)).where(Device.id == device_id)
    )
    device = res.scalar_one()

    background_tasks.add_task(polling_engine.reload_device, device_id)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
async def delete_device(
    device_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.delete(device)
    await db.commit()
    background_tasks.add_task(polling_engine.reload_device, device_id)


@router.post("/{device_id}/test-connection", dependencies=[Depends(require_admin)])
async def test_device_connection(device_id: int, db: AsyncSession = Depends(get_db)):
    """
    Attempt a real connection to the device using its configured protocol.
    Returns { success, message, latency_ms } or raises 4xx/5xx on failure.
    """
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Device)
        .options(selectinload(Device.parameters))
        .where(Device.id == device_id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    protocol = device.protocol.value if hasattr(device.protocol, "value") else str(device.protocol)
    if isinstance(protocol, str) and "." in protocol:
        protocol = protocol.split(".")[-1]
    start_ts = asyncio.get_running_loop().time()

    # Connection settings with fallback to first parameter override if device-level is blank
    target_host = device.host
    target_port = device.port
    target_slave_id = device.slave_id
    target_serial_port = device.serial_port
    target_baud_rate = device.baud_rate
    target_data_bits = device.data_bits
    target_parity = device.parity
    target_stop_bits = device.stop_bits

    if protocol in ("modbus_tcp", "tcp_custom", "udp_custom"):
        if not target_host and device.parameters:
            for p in device.parameters:
                if p.host:
                    target_host = p.host
                    target_port = p.port
                    target_slave_id = p.slave_id
                    break

    elif protocol == "modbus_rtu":
        if not target_serial_port and device.parameters:
            for p in device.parameters:
                if p.serial_port:
                    target_serial_port = p.serial_port
                    target_baud_rate = p.baud_rate
                    target_data_bits = p.data_bits
                    target_parity = p.parity
                    target_stop_bits = p.stop_bits
                    target_slave_id = p.slave_id
                    break

    try:
        if protocol == "modbus_tcp":
            from app.services.modbus_tcp import ModbusTCPReader
            reader = ModbusTCPReader(
                host=target_host or "",
                port=target_port or 502,
                slave_id=target_slave_id or 1,
                timeout=min(device.timeout or 5, 5),   # cap at 5s for test
            )
            connected = await reader._ensure_connected()
            await reader.close()
            if not connected:
                return {
                    "success": False,
                    "message": f"Modbus TCP connection refused — {target_host or ''}:{target_port or 502}",
                    "latency_ms": None,
                }

        elif protocol == "modbus_rtu":
            from app.services.modbus_rtu import ModbusRTUReader
            reader = ModbusRTUReader(
                port=target_serial_port or "COM1",
                baudrate=target_baud_rate or 9600,
                data_bits=target_data_bits or 8,
                parity=target_parity or "N",
                stop_bits=target_stop_bits or 1,
                timeout=min(device.timeout or 3, 5),
            )
            connected = await reader._ensure_connected()
            await reader.close()
            if not connected:
                return {
                    "success": False,
                    "message": f"Modbus RTU serial port not available — {target_serial_port or 'COM1'}",
                    "latency_ms": None,
                }

        elif protocol == "tcp_custom":
            from app.services.tcp_custom import TCPCustomReader
            reader = TCPCustomReader(
                host=target_host or "",
                port=target_port or 4001,
                timeout=min(device.timeout or 5, 5),
            )
            connected = await reader._ensure_connected()
            await reader.close()
            if not connected:
                return {
                    "success": False,
                    "message": f"TCP connection refused — {target_host or ''}:{target_port or 4001}",
                    "latency_ms": None,
                }

        elif protocol == "csv":
            import os
            if device.csv_folder:
                from app.services.csv_watcher import DailySmartWatcher
                watcher = DailySmartWatcher(
                    device.csv_folder,
                    device.csv_filename_pattern or "{YYYYMMDD}.csv",
                    device.csv_delimiter or ",",
                    device.poll_interval or 5,
                    device.csv_timestamp_col if device.csv_timestamp_col is not None else 0,
                )
                csv_path = watcher.resolve_path()
            else:
                csv_path = device.csv_path or ""
            if not csv_path:
                return {"success": False, "message": "No CSV/Excel source configured", "latency_ms": None}
            exists = os.path.exists(csv_path)
            if not exists:
                return {"success": False, "message": f"File not found: {csv_path}", "latency_ms": None}

        elif protocol == "udp_custom":
            from app.services.udp_custom import UDPCustomReader
            reader = UDPCustomReader(
                host=target_host or "",
                port=target_port or 4001,
                timeout=min(device.timeout or 5, 5),
                request_hex=device.request_hex,
            )
            resp = await reader.send_request()
            if resp is None:
                return {
                    "success": False,
                    "message": f"UDP no response — {target_host or ''}:{target_port or 4001} (timeout)",
                    "latency_ms": None,
                }

        else:
            return {"success": False, "message": f"Protocol '{protocol}' not supported for connection test", "latency_ms": None}

        elapsed_ms = round((asyncio.get_running_loop().time() - start_ts) * 1000, 1)
        log.info(f"Connection test OK: device={device_id} ({device.name}) protocol={protocol} {elapsed_ms}ms")
        return {
            "success": True,
            "message": f"Connection to '{device.name}' ({protocol}) successful",
            "latency_ms": elapsed_ms,
        }

    except (asyncio.TimeoutError, ConnectionError, OSError, ValueError) as e:
        log.error(f"Connection test error device={device_id}: {e}", exc_info=True)
        return {
            "success": False,
            "message": f"Connection test error: {str(e)}",
            "latency_ms": None,
        }
