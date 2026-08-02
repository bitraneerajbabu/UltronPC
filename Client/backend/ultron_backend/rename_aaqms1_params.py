"""
UltrON — Rename AAQMS 1 Parameter Display Names
Updates Parameter.name to short tag names:
  NO, SO2, PM2.5, PM10, NO2, NOx, TVOC
"""

import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal, init_db
from app.models.parameter import Parameter
from app.models.station import Station
from app.models.device import Device
from app.services.config_cache import config_cache


NAME_MAP = {
    "NO": "NO",
    "SO2": "SO2",
    "PM2.5": "PM2.5",
    "PM10": "PM10",
    "NO2": "NO2",
    "NOx": "NOx",
    "TVOC": "TVOC",
}


async def rename_params():
    print("Updating AAQMS 1 parameter names in database...")
    await init_db()

    async with AsyncSessionLocal() as db:
        st_res = await db.execute(select(Station).where(Station.name == "AAQMS 1"))
        station = st_res.scalar_one_or_none()
        if not station:
            print("Station AAQMS 1 not found!")
            return

        dev_res = await db.execute(select(Device.id).where(Device.station_id == station.id))
        dev_ids = [r[0] for r in dev_res.all()]

        param_res = await db.execute(select(Parameter).where(Parameter.device_id.in_(dev_ids)))
        params = param_res.scalars().all()

        for p in params:
            if p.tag_name in NAME_MAP:
                new_name = NAME_MAP[p.tag_name]
                print(f"Renaming Parameter Tag '{p.tag_name}': '{p.name}' -> '{new_name}'")
                p.name = new_name

        await db.commit()

    await config_cache.load_all()
    print("Parameter names updated and config cache reloaded successfully [OK]")


if __name__ == "__main__":
    asyncio.run(rename_params())
