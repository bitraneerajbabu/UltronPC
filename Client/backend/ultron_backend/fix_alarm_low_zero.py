"""
fix_alarm_low_zero.py — One-time manual fix.

Find all parameters with alarm_low = 0.0 and set them to NULL.
0.0 was the DEFAULT_PARAM default, causing spurious low alarms.

Run manually:  python fix_alarm_low_zero.py
NOT called from init_db() or any startup path.
"""

import sys, asyncio
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.resolve()))

from app.database import AsyncSessionLocal
from sqlalchemy import text


async def main():
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            text("SELECT id, tag_name, device_id FROM parameters WHERE alarm_low = 0.0")
        )).fetchall()

        if not rows:
            print("No parameters found with alarm_low = 0.0. Nothing to do.")
            return

        print(f"Found {len(rows)} parameter(s) with alarm_low = 0.0:\n")
        for r in rows:
            print(f"  id={r[0]}  tag_name={r[1]!r}  device_id={r[2]}")
        print()

        answer = input(f"Update {len(rows)} parameter(s) — set alarm_low = NULL? (y/n): ").strip().lower()
        if answer != "y":
            print("Aborted.")
            return

        result = await db.execute(
            text("UPDATE parameters SET alarm_low = NULL WHERE alarm_low = 0.0")
        )
        await db.commit()
        print(f"Done. {result.rowcount} row(s) updated.")


if __name__ == "__main__":
    asyncio.run(main())
