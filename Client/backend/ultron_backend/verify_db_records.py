import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.parameter import Parameter
from app.models.device import Device
from app.models.station import Station
from app.models.server_config import ServerConfig, ServerParameterMapping

async def check():
    async with AsyncSessionLocal() as db:
        st_res = await db.execute(select(Station).where(Station.name == 'AAQMS 1'))
        st = st_res.scalar_one_or_none()
        print('STATION:', st.name if st else 'NOT FOUND')
        
        params_res = await db.execute(select(Parameter))
        params = params_res.scalars().all()
        print('\n--- ALL PARAMETERS ---')
        for p in params:
            dev_res = await db.execute(select(Device).where(Device.id == p.device_id))
            dev = dev_res.scalar_one_or_none()
            port_info = dev.serial_port or str(dev.host or '-') if dev else '-'
            baud_info = str(dev.baud_rate or dev.port or '-') if dev else '-'
            print(f"Tag: {p.tag_name:6s} | Name: {p.name:32s} | Unit: {p.unit:6s} | Scale: {p.scale_factor:8.2f} | Method: {p.parse_method:12s} | Config: {p.parse_config}")
            if dev:
                print(f"  -> Device: {dev.name:30s} | Protocol: {dev.protocol:12s} | Port: {port_info} | Baud: {baud_info}")
        
        srv_res = await db.execute(select(ServerConfig).where(ServerConfig.name == 'Sunshine GRASIM Server'))
        srv = srv_res.scalar_one_or_none()
        print('\n--- SERVER CONFIG ---')
        if srv:
            print(f"Server: {srv.name} | Protocol: {srv.protocol} | Live URL: {srv.live_url}")
            maps_res = await db.execute(select(ServerParameterMapping).where(ServerParameterMapping.server_id == srv.id))
            mappings = maps_res.scalars().all()
            for m in mappings:
                p_item = next((p for p in params if p.id == m.parameter_id), None)
                tag = p_item.tag_name if p_item else '?'
                print(f"  -> Mapping: Param Tag={tag:6s} | API ID={m.api_id} | Name={m.api_name} | Pass={m.api_password} | Var={m.api_vname} | Unit={m.api_unit}")

if __name__ == '__main__':
    asyncio.run(check())
