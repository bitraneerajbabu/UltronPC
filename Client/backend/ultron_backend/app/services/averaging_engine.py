"""
UltrON — Averaging Engine
Computes 1min / 5min / 15min / 1hr / 8hr / daily averages
from raw telemetry and stores them as separate AverageType records.
Runs on a schedule via APScheduler.
"""

from datetime import datetime, timedelta
# pyrefly: ignore [missing-import]
from sqlalchemy.ext.asyncio import AsyncSession
# pyrefly: ignore [missing-import]
from sqlalchemy import select, func, and_
from app.models.telemetry import HistoricalData, Averages, AverageType, DataQuality
from app.database import AsyncSessionLocal
from app.core.logger import get_logger

log = get_logger("ultron.averaging")


# ─── Average Window Definitions ───────────────────────────────────────────────
WINDOWS = [
    (AverageType.avg_1min,  timedelta(minutes=1)),
    (AverageType.avg_5min,  timedelta(minutes=5)),
    (AverageType.avg_15min, timedelta(minutes=15)),
    (AverageType.avg_1hr,   timedelta(hours=1)),
    (AverageType.avg_8hr,   timedelta(hours=8)),
    (AverageType.avg_daily, timedelta(days=1)),
]


async def _compute_average(
    db: AsyncSession,
    parameter_id: int,
    avg_type: AverageType,
    start: datetime,
    end: datetime,
) -> None:
    """
    Compute mean of raw 'good' readings in [start, end) for a parameter
    and upsert an Averages record of the given avg_type.
    """
    # Fetch raw good-quality readings in the window
    result = await db.execute(
        select(func.avg(HistoricalData.value), func.count(HistoricalData.parameter_id))
        .where(
            and_(
                HistoricalData.parameter_id == parameter_id,
                HistoricalData.quality.in_((DataQuality.good, DataQuality.out_of_range, DataQuality.uncertain)),
                HistoricalData.timestamp >= start,
                HistoricalData.timestamp < end,
            )
        )
    )
    row = result.one()
    avg_val, count = row[0], row[1]
    if avg_val is not None:
        avg_val = round(float(avg_val), 2)

    if count == 0:
        return   # no data in window — skip

    # Check if an average already exists for this window
    existing = await db.execute(
        select(Averages).where(
            and_(
                Averages.parameter_id == parameter_id,
                Averages.avg_type == avg_type,
                Averages.timestamp == start,
            )
        )
    )
    record = existing.scalar_one_or_none()

    if record:
        record.value = avg_val
    else:
        db.add(Averages(
            parameter_id=parameter_id,
            timestamp=start,
            avg_type=avg_type,
            value=avg_val,
            quality=DataQuality.good,
            source="calc",
        ))

    log.debug(f"Average computed: param={parameter_id} type={avg_type} val={avg_val:.3f} n={count}")


async def run_averaging_for_all_parameters():
    """
    Called by the scheduler at the end of each averaging window.
    Computes averages for all parameters × all window types.
    """
    now = datetime.utcnow()
    log.info(f"Averaging run started at {now.isoformat()}")

    async with AsyncSessionLocal() as db:
        # Get all active parameter IDs
        result = await db.execute(
            select(HistoricalData.parameter_id).distinct()
        )
        param_ids = [row[0] for row in result.all()]

        for avg_type, delta in WINDOWS:
            # Round 'now' down to the nearest window boundary
            if delta.total_seconds() >= 86400:
                # Daily: align to midnight
                start = now.replace(hour=0, minute=0, second=0, microsecond=0) - delta
            elif delta.total_seconds() >= 3600:
                hrs = int(delta.total_seconds() / 3600)
                start = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=hrs)
            else:
                mins = int(delta.total_seconds() / 60)
                rounded_min = (now.minute // mins) * mins
                start = now.replace(minute=rounded_min, second=0, microsecond=0) - delta
            end = start + delta

            for pid in param_ids:
                try:
                    await _compute_average(db, pid, avg_type, start, end)
                except Exception as e:
                    log.error(f"Average error param={pid} type={avg_type}: {e}")

        await db.commit()
        log.info(f"Averaging complete: {len(param_ids)} params × {len(WINDOWS)} windows")
