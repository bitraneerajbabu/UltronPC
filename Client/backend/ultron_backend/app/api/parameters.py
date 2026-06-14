"""UltrON — Parameters API"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.database import get_db
from app.models.parameter import Parameter
from app.schemas.parameter import ParameterCreate, ParameterUpdate, ParameterOut
from app.services import polling_engine
from app.core.security import get_current_user, require_admin

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
    param = Parameter(**payload.model_dump())
    db.add(param)
    await db.flush()

    # Synchronize station name and other parameter descriptions if description is set
    if param.description:
        from app.models.device import Device
        from app.models.station import Station
        from sqlalchemy import update
        device_res = await db.execute(select(Device).where(Device.id == param.device_id))
        device = device_res.scalar_one_or_none()
        if device and device.station_id:
            station_res = await db.execute(select(Station).where(Station.id == device.station_id))
            station = station_res.scalar_one_or_none()
            if station:
                station.name = param.description
                await db.flush()
            
            # Sync description of all parameters under this station
            devices_res = await db.execute(select(Device).where(Device.station_id == device.station_id))
            station_devices = devices_res.scalars().all()
            station_device_ids = [d.id for d in station_devices]
            await db.execute(
                update(Parameter)
                .where(Parameter.device_id.in_(station_device_ids))
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
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(param, field, val)
    await db.flush()

    # Synchronize station name and other parameter descriptions if description is set
    if param.description:
        from app.models.device import Device
        from app.models.station import Station
        from sqlalchemy import update
        device_res = await db.execute(select(Device).where(Device.id == param.device_id))
        device = device_res.scalar_one_or_none()
        if device and device.station_id:
            station_res = await db.execute(select(Station).where(Station.id == device.station_id))
            station = station_res.scalar_one_or_none()
            if station:
                station.name = param.description
                await db.flush()
            
            # Sync description of all parameters under this station
            devices_res = await db.execute(select(Device).where(Device.station_id == device.station_id))
            station_devices = devices_res.scalars().all()
            station_device_ids = [d.id for d in station_devices]
            await db.execute(
                update(Parameter)
                .where(Parameter.device_id.in_(station_device_ids))
                .values(description=param.description)
            )
            await db.flush()

    await db.commit()
    await db.refresh(param)
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
            from app.services.modbus_rtu import ModbusRTUReader
            reader = ModbusRTUReader(
                port=target_serial_port or "COM1",
                baudrate=target_baud_rate or 9600,
                data_bits=target_data_bits or 8,
                parity=target_parity or "N",
                stop_bits=target_stop_bits or 1,
                timeout=min(device.timeout or 3, 5),
            )
            value, quality = await reader.read_parameter(
                slave_id=target_slave_id or 1,
                register_address=param.register_address,
                register_count=param.register_count,
                register_type=param.register_type.value if hasattr(param.register_type, "value") else str(param.register_type),
                data_type=param.data_type.value if hasattr(param.data_type, "value") else str(param.data_type),
                byte_order=param.byte_order.value if hasattr(param.byte_order, "value") else str(param.byte_order),
                scale_factor=param.scale_factor,
                offset=param.offset,
            )
            await reader.close()
            
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
                value, quality = None, "sensor_fail"
                
        elif protocol == "csv":
            from app.services.csv_watcher import CSVWatcher
            watcher = CSVWatcher(
                device.csv_path or "",
                device.csv_delimiter or ",",
                device.poll_interval or 60,
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
                value, quality = None, "sensor_fail"
                
        else:
            return {
                "success": False,
                "message": f"Protocol '{protocol}' not supported for single parameter test read.",
            }
            
        raw_value = None
        if value is not None and param.scale_factor not in (0, 0.0):
            raw_value = (value - param.offset) / param.scale_factor
            raw_value = round(raw_value, 4)
            value = round(value, 2)
            
        if quality in ("good", "out_of_range", "uncertain"):
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
            
    except Exception as e:
        return {
            "success": False,
            "message": f"Error communicating with analyser: {str(e)}",
        }
