"""UltrON — Telemetry API (raw data query + dashboard summary)"""

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, Query
# pyrefly: ignore [missing-import]
from sqlalchemy.ext.asyncio import AsyncSession
# pyrefly: ignore [missing-import]
from sqlalchemy import select, func, case
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from app.database import get_db
from app.models.telemetry import LiveData, HistoricalData, Averages, AverageType, DataQuality, Alarm, AlarmState
from app.models.station import Station
from app.models.parameter import Parameter
from app.schemas.telemetry import TelemetryPoint, DashboardSummary
from app.core.security import get_current_user

router = APIRouter(
    prefix="/telemetry",
    tags=["Telemetry"],
    dependencies=[Depends(get_current_user)],
)

# ─── Simple in-memory cache for dashboard summary (5s TTL) ─────────────
_dashboard_cache: dict = {"data": None, "ts": 0.0}
_DASHBOARD_CACHE_TTL = 5.0


@router.get("/", response_model=List[TelemetryPoint])
async def query_telemetry(
    db: AsyncSession = Depends(get_db),
    parameter_ids: Optional[str] = Query(None, description="Comma-separated parameter IDs"),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    avg_type: AverageType = AverageType.raw,
    limit: int = Query(1000, le=50000),
):
    model = HistoricalData if avg_type == AverageType.raw else Averages
    query = select(model)

    if avg_type != AverageType.raw:
        query = query.where(model.avg_type == avg_type)

    if parameter_ids and isinstance(parameter_ids, str):
        ids = [int(x) for x in parameter_ids.split(",") if x.strip().isdigit()]
        if ids:
            query = query.where(model.parameter_id.in_(ids))

    if start and isinstance(start, datetime):
        query = query.where(model.timestamp >= start)
    if end and isinstance(end, datetime):
        query = query.where(model.timestamp <= end)

    lim_val = limit if isinstance(limit, int) else 1000
    query = query.order_by(model.timestamp.desc()).limit(lim_val)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/latest", response_model=List[TelemetryPoint])
async def latest_values(
    db: AsyncSession = Depends(get_db),
    parameter_ids: Optional[str] = Query(None),
):
    """Return the most recent raw reading per parameter."""
    query = select(LiveData)
    if parameter_ids is not None and isinstance(parameter_ids, str):
        ids = [int(x) for x in parameter_ids.split(",") if x.strip().isdigit()]
        if ids:
            query = query.where(LiveData.parameter_id.in_(ids))

    result = await db.execute(query)
    points = result.scalars().all()

    if not points:
        return points

    # Single batch query: get last good timestamp for all offline parameters
    bad_param_ids = [
        pt.parameter_id for pt in points
        if pt.quality in (DataQuality.comms_fail, DataQuality.sensor_fail)
    ]
    if bad_param_ids:
        # Use a correlated subquery to get last good timestamp per parameter
        latest_good = select(
            HistoricalData.parameter_id,
            func.max(HistoricalData.timestamp).label("last_good_ts")
        ).where(
            HistoricalData.parameter_id.in_(bad_param_ids),
            HistoricalData.quality.in_((DataQuality.good, DataQuality.out_of_range, DataQuality.uncertain))
        ).group_by(HistoricalData.parameter_id)

        good_result = await db.execute(latest_good)
        good_map = {row.parameter_id: row.last_good_ts for row in good_result.all()}

        for pt in points:
            if pt.parameter_id in good_map:
                pt.timestamp = good_map[pt.parameter_id]

    return points


@router.get("/dashboard-summary", response_model=DashboardSummary)
async def dashboard_summary(db: AsyncSession = Depends(get_db)):
    """Aggregate stats for the dashboard KPI cards (cached 5s)."""
    now = datetime.now(timezone.utc)
    now_ts = now.timestamp()

    # Return cached result if fresh
    if _dashboard_cache["data"] and (now_ts - _dashboard_cache["ts"]) < _DASHBOARD_CACHE_TTL:
        return _dashboard_cache["data"]

    # 1. Station count (single scalar)
    total_stations = (await db.execute(select(func.count(Station.id)))).scalar() or 0

    # 2. Parameter counts — online vs offline from LiveData in a single query
    param_count = (await db.execute(
        select(func.count(Parameter.id)).where(Parameter.is_active == True)
    )).scalar() or 0

    online_params = 0
    if param_count > 0:
        # Single aggregated query: count online/offline params via CASE
        online_result = await db.execute(
            select(func.count(LiveData.parameter_id)).where(
                LiveData.quality.in_(("U", "O", "N"))
            )
        )
        online_params = online_result.scalar() or 0

    offline_params = param_count - online_params
    if offline_params < 0:
        offline_params = 0

    # 3. Active alarms (single scalar)
    active_alarms = (await db.execute(
        select(func.count(Alarm.id)).where(Alarm.state == AlarmState.active)
    )).scalar() or 0

    # 4. Data quality % — single query with CASE
    one_hour_ago = now - timedelta(hours=1)
    quality_result = await db.execute(
        select(
            func.count(HistoricalData.parameter_id).label("total"),
            func.sum(
                case(
                    (HistoricalData.quality.in_(("U", "O", "N")), 1),
                    else_=0
                )
            ).label("good"),
        ).where(HistoricalData.timestamp >= one_hour_ago)
    )
    row = quality_result.one_or_none()
    total_q = row.total or 1
    good_q = row.good or 0
    quality_pct = round((float(good_q) / float(total_q)) * 100, 1)

    result = DashboardSummary(
        total_stations=total_stations,
        online_stations=online_params,
        offline_stations=offline_params,
        fault_stations=0,
        total_parameters=param_count,
        active_alarms=active_alarms,
        data_quality_pct=quality_pct,
        last_updated=now,
    )

    _dashboard_cache["data"] = result
    _dashboard_cache["ts"] = now_ts
    return result


