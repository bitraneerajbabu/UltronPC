import asyncio
import sys
sys.path.insert(0, ".")

from app.database import AsyncSessionLocal, init_db
from app.models.user import User
from app.models.station import Station
from app.core.security import create_access_token
from sqlalchemy import select

async def test_all():
    print("Initializing DB...")
    await init_db()
    async with AsyncSessionLocal() as db:
        res_st = await db.execute(select(Station))
        stations = res_st.scalars().all()
        print(f"Total Stations in DB: {len(stations)}")
        for s in stations:
            print(f"  - Station ID {s.id}: '{s.name}' ({s.location})")
        
        res_u = await db.execute(select(User).where(User.username == "Master"))
        u = res_u.scalar_one_or_none()
        if u:
            token = create_access_token({"sub": u.username, "role": u.role})
            print(f"Generated admin token: {token[:25]}...")
            return token

if __name__ == "__main__":
    asyncio.run(test_all())
