"""
fix_stale_alarms.py — One-time manual fix.

Find all active alarms and clear them.
Run manually:  python fix_stale_alarms.py
NOT called from init_db() or any startup path.
"""

import sys, asyncio
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.resolve()))

from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.telemetry import Alarm, AlarmState
from app.models.parameter import Parameter


async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Alarm, Parameter.tag_name)
            .join(Parameter, Alarm.parameter_id == Parameter.id)
            .where(Alarm.state == AlarmState.active)
        )
        rows = result.all()

        if not rows:
            print("No active alarms found. Nothing to do.")
            return

        print(f"Found {len(rows)} active alarm(s):\n")
        for alarm, tag_name in rows:
            print(f"  id={alarm.id}  tag={tag_name}  msg={alarm.message!r}  "
                  f"threshold={alarm.threshold_type}  triggered={alarm.triggered_at}")
        print()

        answer = input(f"Clear {len(rows)} active alarm(s)? (y/n): ").strip().lower()
        if answer != "y":
            print("Aborted.")
            return

        now = datetime.now(timezone.utc)
        for alarm, _ in rows:
            alarm.state = AlarmState.cleared
            alarm.cleared_at = now
        await db.commit()
        print(f"Done. {len(rows)} alarm(s) cleared.")


if __name__ == "__main__":
    asyncio.run(main())
