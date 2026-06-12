import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.server_config import ServerParameterMapping

async def run():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(ServerParameterMapping))
        mappings = res.scalars().all()
        for m in mappings:
            # Set api_id to 8244
            m.api_id = "8244"
            m.api_name = "site_2143"
            m.api_password = "BERGER"
            
            # Map specific parameters
            if m.parameter_id == 4: # NOX
                m.is_active = True
                m.api_vname = "NOX"
                m.api_unit = "ug/m3"
            elif m.parameter_id == 5: # PM2.5
                m.is_active = True
                m.api_vname = "PM2.5"
                m.api_unit = "ug/m3"
        await db.commit()
        print("Updated mappings successfully in DB")

if __name__ == "__main__":
    asyncio.run(run())
