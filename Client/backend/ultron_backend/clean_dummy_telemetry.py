"""
UltrON — Clean Stale Dummy Telemetry Data
Wipes all old dummy records from live_data, historical_data, and averages tables.
"""

import asyncio
from sqlalchemy import delete
from app.database import AsyncSessionLocal
from app.models.telemetry import LiveData, HistoricalData, Averages
from app.services.live_cache import live_cache


async def clear_dummy_data():
    print("Clearing all stale dummy telemetry from SQLite database...")
    async with AsyncSessionLocal() as db:
        await db.execute(delete(LiveData))
        await db.execute(delete(HistoricalData))
        await db.execute(delete(Averages))
        await db.commit()

    # Clear in-memory live_cache as well
    live_cache._points.clear()
    print("All dummy telemetry records wiped cleanly [OK]")


if __name__ == "__main__":
    asyncio.run(clear_dummy_data())
