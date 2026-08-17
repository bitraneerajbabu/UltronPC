import asyncio
import os
import sys
sys.path.insert(0, ".")

from app.config import APP_DIR
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{APP_DIR.as_posix()}/ultron_fresh_test.db"

from app.database import AsyncSessionLocal, init_db, engine
from app.models.station import Station
from sqlalchemy import select, func

async def verify_fresh_db_seeding():
    print("--- STEP 1 & 2: Initializing fresh database ---")
    await init_db()
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(func.count(Station.id)))
        count = res.scalar()
        print(f"Total Stations after first init_db(): {count}")
        
        res_st = await db.execute(select(Station))
        st_list = res_st.scalars().all()
        for s in st_list:
            print(f"Station -> ID: {s.id}, Name: '{s.name}', Location: '{s.location}'")
        
        assert count == 1, f"Expected 1 station, found {count}"
        assert st_list[0].name == "Default Station", f"Expected 'Default Station', got '{st_list[0].name}'"

    print("\n--- STEP 6 & 7: Restarting app / running init_db() a second time ---")
    await init_db()
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(func.count(Station.id)))
        count_after = res.scalar()
        print(f"Total Stations after second init_db(): {count_after}")
        assert count_after == 1, f"Expected exactly 1 station after restart, found {count_after}"

    print("\n✅ STEPS 1, 2, 6, 7 VERIFIED SUCCESSFULLY: 'Default Station' created exactly once!")

if __name__ == "__main__":
    asyncio.run(verify_fresh_db_seeding())
