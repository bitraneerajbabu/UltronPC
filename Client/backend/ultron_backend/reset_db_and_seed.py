import asyncio
import os
import sys
sys.path.insert(0, ".")

from app.config import APP_DIR
from app.database import init_db, AsyncSessionLocal
from app.models.station import Station
from app.models.user import User
from app.schemas.station import StationOut
from sqlalchemy import select, func

db_file = APP_DIR / "ultron.db"

async def test():
    print("Deleting ultron.db if exists...")
    if db_file.is_file():
        try:
            os.remove(db_file)
            print("ultron.db deleted.")
        except Exception as e:
            print("Could not delete ultron.db:", e)

    print("Running init_db()...")
    await init_db()

    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Station))
        stations = res.scalars().all()
        print(f"Total stations in DB: {len(stations)}")
        for s in stations:
            print(f"  - Station ID {s.id}: name='{s.name}', station_type='{s.station_type}', protocol='{s.protocol}', is_active={s.is_active}")
            st_out = StationOut.model_validate(s)
            print("  - Pydantic validation successful:", st_out.name)

        res_u = await db.execute(select(User).where(User.username == "Master"))
        u = res_u.scalar_one_or_none()
        print(f"  - Admin User: '{u.username}' (Role: {u.role})")

if __name__ == "__main__":
    asyncio.run(test())
