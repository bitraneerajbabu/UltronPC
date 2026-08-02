"""
UltrON — Rename Weather Station & All Parameter Display Names to Match Reference
"""

import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal, init_db
from app.models.parameter import Parameter
from app.services.config_cache import config_cache


WEATHER_NAME_MAP = {
    "TEMP": "Temp",
    "HUM": "Humidity",
    "PRESS": "Pressure",
    "AZIMUTH": "Magnetic North",
    "WS": "Wind Speed",
    "WD": "Wind Direction",
    "RAIN_INST": "Instant Rainfall",
    "RAIN_CUM": "Cumulative Rainfall",
}


async def rename_all():
    print("Updating Weather Station parameter names in database...")
    await init_db()

    async with AsyncSessionLocal() as db:
        param_res = await db.execute(select(Parameter))
        params = param_res.scalars().all()

        for p in params:
            if p.tag_name in WEATHER_NAME_MAP:
                new_name = WEATHER_NAME_MAP[p.tag_name]
                print(f"Renaming Weather Param '{p.tag_name}': '{p.name}' -> '{new_name}'")
                p.name = new_name

        await db.commit()

    await config_cache.load_all()
    print("Weather station parameter names updated and config cache reloaded successfully [OK]")


if __name__ == "__main__":
    asyncio.run(rename_all())
