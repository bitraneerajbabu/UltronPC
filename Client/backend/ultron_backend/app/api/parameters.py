"""UltrON — Parameters API"""

import asyncio
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.database import get_db
from app.models.parameter import Parameter
from app.schemas.parameter import ParameterCreate, ParameterUpdate, ParameterOut
from app.services import polling_engine
from app.core.security import get_current_user, require_admin
from app.core.logger import get_logger

log = get_logger("ultron.api.parameters")

router = APIRouter(
    prefix="/parameters",
    tags=["Parameters"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/", response_model=List[ParameterOut])
async def list_parameters(device_id: int = None, db: AsyncSession = Depends(get_db)):
    query = select(Parameter).order_by(Parameter.display_order, Parameter.id)
    if device_id:
        query = query.where(Parameter.device_id == device_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/",
    response_model=ParameterOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_parameter(
    payload: ParameterCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    data = payload.model_dump()
    if data.get("display_order", 0) == 0:
        from sqlalchemy import func as sa_func
        max_res = await db.execute(sa_func.max(Parameter.display_order).select())
        max_ord = max_res.scalar() or 0
        data["display_order"] = max_ord + 1
    param = Parameter(**data)
    db.add(param)
    await db.flush()

    # Sync description to all parameters in the same device if description is set
    if param.description:
        from sqlalchemy import update as sa_update
        await db.execute(
            sa_update(Parameter)
            .where(Parameter.device_id == param.device_id)
            .values(description=param.description)
        )
        await db.flush()

    await db.commit()
    await db.refresh(param)

    # Auto-enable parameter mapping for all existing push servers
    from app.models.server_config import ServerConfig, ServerParameterMapping
    servers_res = await db.execute(select(ServerConfig))
    servers = servers_res.scalars().all()
    for srv in servers:
        mapping = ServerParameterMapping(
            server_id=srv.id,
            parameter_id=param.id,
            is_active=True,
            api_vname=param.tag_name,
            api_unit=param.unit or "",
            api_id="",
            api_name="",
            api_password="",
            cpcb_station_name="",
            cpcb_parameter=param.name
        )
        db.add(mapping)
    await db.flush()
    await db.commit()

    background_tasks.add_task(polling_engine.reload_device, param.device_id)
    return param


@router.get("/{param_id}", response_model=ParameterOut)
async def get_parameter(param_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Parameter).where(Parameter.id == param_id))
    param = result.scalar_one_or_none()
    if not param:
        raise HTTPException(status_code=404, detail="Parameter not found")
    return param


@router.patch("/{param_id}", response_model=ParameterOut, dependencies=[Depends(require_admin)])
async def update_parameter(
    param_id: int,
    payload: ParameterUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Parameter).where(Parameter.id == param_id))
    param = result.scalar_one_or_none()
    if not param:
        raise HTTPException(status_code=404, detail="Parameter not found")
    update_data = payload.model_dump(exclude_unset=True)
    old_device_id = param.device_id
    for field, val in update_data.items():
        setattr(param, field, val)
    await db.flush()

    # Recalculate LiveData value if scale_factor or offset changed
    if "scale_factor" in update_data or "offset" in update_data:
        from app.models.telemetry import LiveData
        ld_result = await db.execute(
            select(LiveData).where(LiveData.parameter_id == param_id)
        )
        live = ld_result.scalar_one_or_none()
        if live and live.raw_value is not None:
            sf = param.scale_factor or 1.0
            off = param.offset or 0.0
            live.value = (live.raw_value * sf) + off
            await db.flush()

    # Sync description to all parameters in the same device if description is set
    if param.description:
        from sqlalchemy import update as sa_update
        await db.execute(
            sa_update(Parameter)
            .where(Parameter.device_id == param.device_id)
            .values(description=param.description)
        )
        await db.flush()

    await db.commit()
    await db.refresh(param)
    if "device_id" in update_data and old_device_id != param.device_id:
        background_tasks.add_task(polling_engine.reload_device, old_device_id)
    background_tasks.add_task(polling_engine.reload_device, param.device_id)
    return param


@router.delete("/{param_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
async def delete_parameter(
    param_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Parameter).where(Parameter.id == param_id))
    param = result.scalar_one_or_none()
    if not param:
        raise HTTPException(status_code=404, detail="Parameter not found")
    device_id = param.device_id
    await db.delete(param)
    await db.commit()
    background_tasks.add_task(polling_engine.reload_device, device_id)


@router.post("/{param_id}/test-read", dependencies=[Depends(require_admin)])
async def test_parameter_read(param_id: int, db: AsyncSession = Depends(get_db)):
    """
    Read the parameter directly from the analyser on demand to check data receiving.
    Returns { success: bool, value: float, raw_value: float, quality: str, message: str }
    """
    from sqlalchemy.orm import selectinload
    
    # 1. Resolve parameter & device
    result = await db.execute(
        select(Parameter)
        .options(selectinload(Parameter.device))
        .where(Parameter.id == param_id)
    )
    param = result.scalar_one_or_none()
    if not param:
        raise HTTPException(status_code=404, detail="Parameter not found")
        
    device = param.device
    if not device:
        raise HTTPException(status_code=400, detail="Parameter is not mapped to any device")
        
    protocol = device.protocol.value if hasattr(device.protocol, "value") else str(device.protocol)
    if isinstance(protocol, str) and "." in protocol:
        protocol = protocol.split(".")[-1]
        
    # 2. Extract target connection details with fallback
    target_host = param.host or device.host
    target_port = param.port or device.port
    target_slave_id = param.slave_id or device.slave_id
    target_serial_port = param.serial_port or device.serial_port
    target_baud_rate = param.baud_rate or device.baud_rate
    target_data_bits = param.data_bits or device.data_bits
    target_parity = param.parity or device.parity
    target_stop_bits = param.stop_bits or device.stop_bits
    
    # 3. Read based on protocol
    try:
        if protocol == "modbus_tcp":
            from app.services.modbus_tcp import ModbusTCPReader
            reader = ModbusTCPReader(
                host=target_host or "",
                port=target_port or 502,
                slave_id=target_slave_id or 1,
                timeout=min(device.timeout or 5, 5),
            )
            value, quality = await reader.read_parameter(
                register_address=param.register_address,
                register_count=param.register_count,
                register_type=param.register_type.value if hasattr(param.register_type, "value") else str(param.register_type),
                data_type=param.data_type.value if hasattr(param.data_type, "value") else str(param.data_type),
                byte_order=param.byte_order.value if hasattr(param.byte_order, "value") else str(param.byte_order),
                scale_factor=param.scale_factor,
                offset=param.offset,
            )
            await reader.close()
            
        elif protocol == "modbus_rtu":
            # RS485/RTU: reuse the polling engine's shared reader for this port.
            # Windows serial ports are exclusive — opening a second connection
            # causes PermissionError (Access Denied) → quality 'E'.
            from app.services import polling_engine as _pe
            port_key = target_serial_port or device.serial_port or "COM1"
            shared_reader = _pe._rtu_readers.get(port_key)
            if shared_reader is None:
                # Port not yet opened by the polling engine — create a temporary one
                from app.services.modbus_rtu import ModbusRTUReader
                shared_reader = ModbusRTUReader(
                    port=port_key,
                    baudrate=target_baud_rate or 9600,
                    data_bits=target_data_bits or 8,
                    parity=target_parity or "N",
                    stop_bits=target_stop_bits or 1,
                    timeout=min(device.timeout or 3, 5),
                )
                _owned_reader = True
            else:
                _owned_reader = False
            value, quality = await shared_reader.read_parameter(
                slave_id=target_slave_id or 1,
                register_address=param.register_address,
                register_count=param.register_count,
                register_type=param.register_type.value if hasattr(param.register_type, "value") else str(param.register_type),
                data_type=param.data_type.value if hasattr(param.data_type, "value") else str(param.data_type),
                byte_order=param.byte_order.value if hasattr(param.byte_order, "value") else str(param.byte_order),
                scale_factor=param.scale_factor,
                offset=param.offset,
            )
            if _owned_reader:
                await shared_reader.close()
            
        elif protocol == "tcp_custom":
            from app.services.tcp_custom import TCPCustomReader
            reader = TCPCustomReader(
                host=target_host or "",
                port=target_port or 4001,
                timeout=min(device.timeout or 5, 5),
            )
            param_dict = {
                "id": param.id,
                "register_address": param.register_address,
                "scale_factor": param.scale_factor,
                "offset": param.offset,
            }
            res = await reader.poll_parameters([param_dict])
            await reader.close()
            if res and len(res) > 0:
                value = res[0]["value"]
                quality = res[0]["quality"]
            else:
                value, quality = None, "E"
                
        elif protocol == "csv":
            from app.services.csv_watcher import CSVWatcher, DailyCSVWatcher
            if device.csv_folder:
                watcher = DailyCSVWatcher(
                    device.csv_folder,
                    device.csv_filename_pattern or "{YYYYMMDD}.csv",
                    device.csv_delimiter or ",",
                    device.poll_interval or 5,
                    device.csv_timestamp_col if device.csv_timestamp_col is not None else 0,
                )
            else:
                watcher = CSVWatcher(
                    device.csv_path or "",
                    device.csv_delimiter or ",",
                    device.poll_interval or 5,
                    device.csv_timestamp_col,
                )
            param_dict = {
                "id": param.id,
                "register_address": param.register_address,
                "scale_factor": param.scale_factor,
                "offset": param.offset,
            }
            res = watcher.get_latest_values([param_dict])
            if res and len(res) > 0:
                value = res[0]["value"]
                quality = res[0]["quality"]
            else:
                value, quality = None, "E"

        elif protocol == "udp_custom":
            from app.services.udp_custom import UDPCustomReader
            reader = UDPCustomReader(
                host=target_host or "",
                port=target_port or 4001,
                timeout=min(device.timeout or 5, 5),
                request_hex=device.request_hex,
            )
            param_dict = {
                "id": param.id,
                "register_address": param.register_address,
                "parse_method": param.parse_method or "csv_col",
                "parse_config": param.parse_config,
                "scale_factor": param.scale_factor,
                "offset": param.offset,
            }
            res = await reader.poll_parameters([param_dict])
            if res and len(res) > 0:
                value = res[0]["value"]
                quality = res[0]["quality"]
            else:
                value, quality = None, "E"
                
        else:
            return {
                "success": False,
                "message": f"Protocol '{protocol}' not supported for single parameter test read.",
            }
            
        raw_value = None
        if value is not None and param.scale_factor not in (0, 0.0):
            if param.data_type == "bool":
                raw_value = value
            else:
                raw_value = (value - param.offset) / param.scale_factor
            raw_value = round(raw_value, 4)
            value = round(value, 2)
            
        if quality in ("U", "O"):
            return {
                "success": True,
                "value": value,
                "raw_value": raw_value,
                "quality": quality,
                "message": f"Successfully read from analyser: {value} {param.unit or ''} (Raw: {raw_value})",
            }
        else:
            return {
                "success": False,
                "quality": quality,
                "message": f"Failed to read from analyser: quality check returned '{quality}'",
            }
            
    except (asyncio.TimeoutError, ConnectionError, OSError, ValueError) as e:
        log.error(f"Test read error param={param_id}: {e}", exc_info=True)
        return {
            "success": False,
            "message": f"Error communicating with analyser: {str(e)}",
        }
