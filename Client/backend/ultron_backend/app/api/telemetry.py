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
    """Return the most recent reading per parameter from LiveCache (or DB fallback)."""
    from app.services.live_cache import live_cache
    live_points = live_cache.get_all_points()

    filter_ids = None
    if parameter_ids is not None and isinstance(parameter_ids, str):
        filter_ids = [int(x) for x in parameter_ids.split(",") if x.strip().isdigit()]

    if live_points:
        points = []
        for lp in live_points:
            if filter_ids and lp.parameter_id not in filter_ids:
                continue
            is_online = lp.quality in ("U", "O", "N", "good", "out_of_range") and lp.value is not None
            qual = lp.quality if is_online else "comms_fail"
            points.append(TelemetryPoint(
                parameter_id=lp.parameter_id,
                value=lp.value if is_online else None,
                raw_value=lp.raw_value if is_online else None,
                quality=qual,
                timestamp=lp.timestamp or datetime.now(timezone.utc),
            ))
        if points:
            return points

    # Initial boot fallback when LiveCache is empty: return offline states
    query = select(Parameter).where(Parameter.is_active == True)
    if filter_ids:
        query = query.where(Parameter.id.in_(filter_ids))
    params = (await db.execute(query)).scalars().all()
    now = datetime.now(timezone.utc)
    return [
        TelemetryPoint(
            parameter_id=p.id,
            value=None,
            raw_value=None,
            quality="comms_fail",
            timestamp=p.updated_at or p.created_at or now,
        )
        for p in params
    ]


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

    # 2. Parameter counts — online vs offline from LiveCache
    from app.services.live_cache import live_cache
    live_points = live_cache.get_all_points()

    param_count = (await db.execute(
        select(func.count(Parameter.id)).where(Parameter.is_active == True)
    )).scalar() or 0

    online_params = 0
    if live_points:
        online_params = sum(
            1 for pt in live_points 
            if pt.quality in ("U", "O", "N", "good", "out_of_range") and pt.value is not None
        )

    offline_params = max(0, param_count - online_params)

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
                    (HistoricalData.quality.in_(("U", "O", "N", "good")), 1),
                    else_=0
                )
            ).label("good"),
        ).where(HistoricalData.timestamp >= one_hour_ago)
    )
    row = quality_result.one_or_none()
    total_q = (row.total if row else 0) or 1
    good_q = (row.good if row else 0) or 0
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


@router.get("/diagnostics")
async def get_system_diagnostics():
    """Return comprehensive system health report, SCADA device states, and metrics."""
    from app.services.watchdog import watchdog_service
    return watchdog_service.get_diagnostics()


