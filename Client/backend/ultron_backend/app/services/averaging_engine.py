"""
UltrON — Averaging Engine
Computes 1min / 5min / 15min / 1hr / 8hr / daily averages
from raw telemetry and stores them as separate AverageType records.
Runs on a schedule via APScheduler.
"""

import math
from datetime import datetime, timedelta
# pyrefly: ignore [missing-import]
from sqlalchemy.ext.asyncio import AsyncSession
# pyrefly: ignore [missing-import]
from sqlalchemy import select, func, and_
from app.models.telemetry import HistoricalData, Averages, AverageType, DataQuality
from app.database import AsyncSessionLocal
from app.core.logger import get_logger

log = get_logger("ultron.averaging")


# ─── Wind Direction Detection ─────────────────────────────────────────────────
def _is_wind_direction(param) -> bool:
    name_lower = (param.name or "").lower()
    tag_lower = (param.tag_name or "").lower()
    unit_lower = (param.unit or "").lower()
    
    # Check unit or name indicators
    has_wind_dir_indicators = (
        "winddir" in tag_lower or 
        "wind_dir" in tag_lower or 
        tag_lower == "wd" or 
        "wind direction" in name_lower or
        "wind_direction" in name_lower
    )
    is_degree_unit = unit_lower in ("deg", "degree", "degrees", "°")
    
    # Exclude temperature to prevent false positives
    is_temp = "temp" in tag_lower or "temp" in name_lower
    
    return (has_wind_dir_indicators or (is_degree_unit and "wind" in name_lower)) and not is_temp


# ─── Average Window Definitions ───────────────────────────────────────────────
WINDOWS = [
    (AverageType.avg_1min,  timedelta(minutes=1)),
    (AverageType.avg_5min,  timedelta(minutes=5)),
    (AverageType.avg_15min, timedelta(minutes=15)),
    (AverageType.avg_30min, timedelta(minutes=30)),
    (AverageType.avg_1hr,   timedelta(hours=1)),
    (AverageType.avg_3hr,   timedelta(hours=3)),
    (AverageType.avg_6hr,   timedelta(hours=6)),
    (AverageType.avg_12hr,  timedelta(hours=12)),
    (AverageType.avg_24hr,  timedelta(hours=24)),
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
    from app.models.parameter import Parameter

    # Fetch parameter definition to check for wind direction
    param_res = await db.execute(select(Parameter).where(Parameter.id == parameter_id))
    parameter = param_res.scalar_one_or_none()
    
    is_wd = parameter and _is_wind_direction(parameter)

    # Fetch raw good-quality readings in the window
    raw_res = await db.execute(
        select(HistoricalData.value)
        .where(
            and_(
                HistoricalData.parameter_id == parameter_id,
                HistoricalData.quality.in_((DataQuality.good, DataQuality.out_of_range, DataQuality.uncertain)),
                HistoricalData.timestamp >= start,
                HistoricalData.timestamp < end,
            )
        )
    )
    raw_vals = [float(row[0]) for row in raw_res.all() if row[0] is not None]
    count = len(raw_vals)

    if count == 0:
        return   # no data in window — skip

    if is_wd:
        sin_sum = sum(math.sin(math.radians(v)) for v in raw_vals)
        cos_sum = sum(math.cos(math.radians(v)) for v in raw_vals)
        avg_rad = math.atan2(sin_sum / count, cos_sum / count)
        avg_deg = math.degrees(avg_rad)
        if avg_deg < 0:
            avg_deg += 360
        avg_val = round(avg_deg, 2)
    else:
        avg_val = round(sum(raw_vals) / count, 2)

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

        if not param_ids:
            log.info("No parameters found — skipping averaging")
            return

        # Load parameters definitions to detect wind direction parameters
        from app.models.parameter import Parameter
        param_result = await db.execute(
            select(Parameter).where(Parameter.id.in_(param_ids))
        )
        parameters = {p.id: p for p in param_result.scalars().all()}

        for avg_type, delta in WINDOWS:
            # Round 'now' down to the nearest window boundary
            if delta.total_seconds() >= 86400:
                start = now.replace(hour=0, minute=0, second=0, microsecond=0) - delta
            elif delta.total_seconds() >= 3600:
                hrs = int(delta.total_seconds() / 3600)
                start = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=hrs)
            else:
                mins = int(delta.total_seconds() / 60)
                rounded_min = (now.minute // mins) * mins
                start = now.replace(minute=rounded_min, second=0, microsecond=0) - delta
            end = start + delta

            # Batch query: compute average for ALL parameters in a single query
            batch_result = await db.execute(
                select(
                    HistoricalData.parameter_id,
                    func.avg(HistoricalData.value),
                    func.count(HistoricalData.parameter_id),
                )
                .where(
                    and_(
                        HistoricalData.parameter_id.in_(param_ids),
                        HistoricalData.quality.in_((DataQuality.good, DataQuality.out_of_range, DataQuality.uncertain)),
                        HistoricalData.timestamp >= start,
                        HistoricalData.timestamp < end,
                    )
                )
                .group_by(HistoricalData.parameter_id)
            )
            batch_rows = batch_result.all()

            for pid, avg_val, count in batch_rows:
                if avg_val is None or count == 0:
                    continue

                param = parameters.get(pid)
                if param and _is_wind_direction(param):
                    # Recalculate vector average for wind direction
                    raw_result = await db.execute(
                        select(HistoricalData.value)
                        .where(
                            and_(
                                HistoricalData.parameter_id == pid,
                                HistoricalData.quality.in_((DataQuality.good, DataQuality.out_of_range, DataQuality.uncertain)),
                                HistoricalData.timestamp >= start,
                                HistoricalData.timestamp < end,
                            )
                        )
                    )
                    raw_vals = [float(r[0]) for r in raw_result.all() if r[0] is not None]
                    if raw_vals:
                        sin_sum = sum(math.sin(math.radians(v)) for v in raw_vals)
                        cos_sum = sum(math.cos(math.radians(v)) for v in raw_vals)
                        avg_rad = math.atan2(sin_sum / len(raw_vals), cos_sum / len(raw_vals))
                        avg_deg = math.degrees(avg_rad)
                        if avg_deg < 0:
                            avg_deg += 360
                        avg_val = round(avg_deg, 2)
                    else:
                        continue  # no valid raw values
                else:
                    avg_val = round(float(avg_val), 2)

                existing = await db.execute(
                    select(Averages).where(
                        and_(
                            Averages.parameter_id == pid,
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
                        parameter_id=pid,
                        timestamp=start,
                        avg_type=avg_type,
                        value=avg_val,
                        quality=DataQuality.good,
                        source="calc",
                    ))
                log.debug(f"Average computed: param={pid} type={avg_type} val={avg_val:.3f} n={count}")

            # Parameters with no data in this window are silently skipped

        await db.commit()
        log.info(f"Averaging complete: {len(param_ids)} params × {len(WINDOWS)} windows")
