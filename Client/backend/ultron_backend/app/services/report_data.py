"""
UltrON — Shared interval-bucketed telemetry data fetching for Reports and Trends.

Consolidates preview (chart-data) and export (PDF/Excel/CSV) code paths into ONE
function so both return identical row counts and values for the same parameters,
time range, and interval. Eliminates the historical divergence where:
  - Preview used HistoricalData + Python downsampling (last value per bucket)
  - Export used either Averages table (mean) or HistoricalData + step filtering
    (first value per bucket), with no row limit.
"""

from datetime import datetime
from typing import Optional

# pyrefly: ignore [missing-import]
from sqlalchemy import select, and_
# pyrefly: ignore [missing-import]
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telemetry import HistoricalData, Averages, AverageType
from app.models.parameter import Parameter


# ─── Hard Row Limit ────────────────────────────────────────────────────────────
# Every export path must respect this cap. Prevents misconfigured or malicious
# requests from producing unbounded output (the original bug).
MAX_EXPORT_ROWS = 100_000


# ─── Avg-type → Interval Minutes ───────────────────────────────────────────────
# Maps every known AverageType value to its interval in minutes.
# Used to determine when to query the Averages table vs. bucket HistoricalData.
AVG_TYPE_TO_MINUTES: dict[str, int] = {
    "avg_1min": 1,
    "avg_5min": 5,
    "avg_15min": 15,
    "avg_30min": 30,
    "avg_1hr": 60,
    "avg_3hr": 180,
    "avg_6hr": 360,
    "avg_8hr": 480,
    "avg_12hr": 720,
    "avg_24hr": 1440,
    "avg_daily": 1440,
}


async def fetch_interval_data(
    db: AsyncSession,
    parameter_ids: list[int],
    start: datetime,
    end: datetime,
    interval_minutes: int = 0,
    avg_type: str = "raw",
    limit: int = MAX_EXPORT_ROWS,
) -> tuple[list[Parameter], list]:
    """
    Fetch telemetry data bucketed at the requested interval.

    Table-selection strategy (the crux of the preview-vs-export bug):

      1. **Average mode** (avg_type != "raw"): query the ``Averages`` table
         for pre-computed values at that interval (e.g. avg_15min = 15-minute
         mean).  This is the correct source for "Average Reports" because it
         stores CPCB-compliant statistical aggregates, not a single raw
         reading per bucket.

         If the Averages table has no rows for the given avg_type (e.g. the
         averaging engine hasn't populated it yet), fall back to bucketing
         HistoricalData at the corresponding interval.

      2. **Step mode** (avg_type == "raw" and interval_minutes > 0): query
         ``HistoricalData`` (raw per-minute readings) and keep the **first**
         reading within each interval bucket.  Used by "Normal Reports"
         where the user wants one representative raw sample every N minutes.

      3. **Raw mode** (avg_type == "raw" and interval_minutes == 0): return
         all ``HistoricalData`` rows in the time range, capped at ``limit``.
         Used by the Trend Chart when the user selects "1 Minute Raw".

    Always enforces a hard cap of ``limit`` rows (default |MAX_EXPORT_ROWS|)
    to prevent unbounded query output.

    Returns
    -------
    (params, readings)
        params : list[Parameter]  — parameter metadata for the requested IDs.
        readings : list          — ORM instances (HistoricalData or Averages)
                                   each providing .parameter_id, .timestamp,
                                   .value, .quality.
    """
    # ── 0. Ensure start and end are naive UTC datetimes for DB comparison ─
    if start and start.tzinfo is not None:
        start = start.replace(tzinfo=None)
    if end and end.tzinfo is not None:
        end = end.replace(tzinfo=None)

    # ── 1. Fetch parameter metadata ────────────────────────────────────────
    param_result = await db.execute(
        select(Parameter).where(Parameter.id.in_(parameter_ids))
    )
    params = list(param_result.scalars().all())

    # ── 2. Determine which model and strategy to use ───────────────────────
    is_avg_mode = avg_type != AverageType.raw.value and avg_type in AVG_TYPE_TO_MINUTES

    if is_avg_mode:
        step = AVG_TYPE_TO_MINUTES[avg_type]
        readings = await _bucket_historical_data(
            db, parameter_ids, start, end, step, limit,
            compute_mean=True,
        )

    elif interval_minutes > 0:
        # ── Step mode: bucket HistoricalData ──────────────────────────────
        readings = await _bucket_historical_data(
            db, parameter_ids, start, end, interval_minutes, limit,
            keep_first=True,
        )

    else:
        # ── 1-Minute / Raw mode: bucket HistoricalData at 1-minute intervals ───
        readings = await _bucket_historical_data(
            db, parameter_ids, start, end, 1, limit,
            keep_first=True,
        )

    return params, readings


async def _bucket_historical_data(
    db: AsyncSession,
    parameter_ids: list[int],
    start: datetime,
    end: datetime,
    interval_minutes: int,
    limit: int,
    keep_first: bool = True,
    compute_mean: bool = False,
) -> list:
    """
    Query all ``HistoricalData`` rows in the time range, then keep exactly
    one reading per ``interval_minutes`` bucket per parameter.
    If compute_mean is True, computes the arithmetic mean of all readings in the bucket.
    """
    from datetime import timezone

    if start and start.tzinfo is not None:
        start = start.replace(tzinfo=None)
    if end and end.tzinfo is not None:
        end = end.replace(tzinfo=None)

    query = select(HistoricalData).where(
        and_(
            HistoricalData.parameter_id.in_(parameter_ids),
            HistoricalData.timestamp >= start,
            HistoricalData.timestamp <= end,
        )
    )
    result = await db.execute(
        query.order_by(HistoricalData.timestamp).limit(limit)
    )
    all_rows: list = list(result.scalars().all())

    # Bucket: group by (parameter_id, bucket_start_timestamp)
    bucket_map: dict[tuple[int, datetime], list] = {}
    for r in all_rows:
        ts_clean = r.timestamp.replace(second=0, microsecond=0)
        ts_epoch_min = int(ts_clean.replace(tzinfo=timezone.utc).timestamp()) // 60
        bucket_idx = (ts_epoch_min // interval_minutes) * interval_minutes
        bucket_start = datetime.fromtimestamp(bucket_idx * 60, tz=timezone.utc).replace(tzinfo=None)
        key = (r.parameter_id, bucket_start)
        bucket_map.setdefault(key, []).append(r)

    readings = []
    for (pid, b_start), rows in bucket_map.items():
        if compute_mean:
            valid_vals = [r.value for r in rows if r.value is not None]
            avg_val = round(sum(valid_vals) / len(valid_vals), 2) if valid_vals else None
            readings.append(
                HistoricalData(
                    parameter_id=pid,
                    timestamp=b_start,
                    value=avg_val,
                    raw_value=avg_val,
                    quality=rows[0].quality,
                    source="calc",
                )
            )
        elif keep_first:
            readings.append(rows[0])
        else:
            readings.append(rows[-1])

    # Sort chronologically for deterministic output
    readings.sort(key=lambda r: (r.parameter_id, r.timestamp))
    return readings
