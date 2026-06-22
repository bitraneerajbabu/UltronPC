"""UltrON — Telemetry API (raw data query + dashboard summary)"""

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, Query
# pyrefly: ignore [missing-import]
from sqlalchemy.ext.asyncio import AsyncSession
# pyrefly: ignore [missing-import]
from sqlalchemy import select, func, and_
from datetime import datetime, timedelta
from typing import List, Optional
from app.database import get_db
from app.models.telemetry import LiveData, HistoricalData, Averages, AverageType, DataQuality, Alarm, AlarmState
from app.models.station import Station, StationStatus
from app.models.parameter import Parameter
from app.schemas.telemetry import TelemetryPoint, DashboardSummary
from app.core.security import get_current_user

router = APIRouter(
    prefix="/telemetry",
    tags=["Telemetry"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/", response_model=List[TelemetryPoint])
async def query_telemetry(
    parameter_ids: Optional[str] = Query(None, description="Comma-separated parameter IDs"),
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    avg_type: AverageType = AverageType.raw,
    limit: int = Query(1000, le=50000),
    db: AsyncSession = Depends(get_db),
):
    model = HistoricalData if avg_type == AverageType.raw else Averages
    query = select(model)

    if avg_type != AverageType.raw:
        query = query.where(model.avg_type == avg_type)

    if parameter_ids:
        ids = [int(x) for x in parameter_ids.split(",") if x.strip().isdigit()]
        query = query.where(model.parameter_id.in_(ids))

    if start:
        query = query.where(model.timestamp >= start)
    if end:
        query = query.where(model.timestamp <= end)

    query = query.order_by(model.timestamp.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/latest", response_model=List[TelemetryPoint])
async def latest_values(
    parameter_ids: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent raw reading per parameter."""
    query = select(LiveData)
    if parameter_ids:
        ids = [int(x) for x in parameter_ids.split(",") if x.strip().isdigit()]
        query = query.where(LiveData.parameter_id.in_(ids))

    result = await db.execute(query)
    points = result.scalars().all()

    # For any offline/failed parameter, retrieve the last successful poll timestamp from HistoricalData
    for pt in points:
        if pt.quality in (DataQuality.comms_fail, DataQuality.sensor_fail):
            good_res = await db.execute(
                select(HistoricalData.timestamp)
                .where(
                    HistoricalData.parameter_id == pt.parameter_id,
                    HistoricalData.quality.in_((DataQuality.good, DataQuality.out_of_range, DataQuality.uncertain))
                )
                .order_by(HistoricalData.timestamp.desc())
                .limit(1)
            )
            last_good_ts = good_res.scalar()
            if last_good_ts:
                pt.timestamp = last_good_ts

    return points


@router.get("/dashboard-summary", response_model=DashboardSummary)
async def dashboard_summary(db: AsyncSession = Depends(get_db)):
    """Aggregate stats for the dashboard KPI cards."""
    # Station counts
    stations_result = await db.execute(select(Station))
    stations = stations_result.scalars().all()
    total = len(stations)

    # Count active parameters by online/offline status based on their live quality
    params_result = await db.execute(
        select(Parameter.id).where(Parameter.is_active == True)
    )
    active_param_ids = [row[0] for row in params_result.all()]

    online = 0
    offline = 0
    if active_param_ids:
        live_result = await db.execute(
            select(LiveData.parameter_id, LiveData.quality).where(
                LiveData.parameter_id.in_(active_param_ids)
            )
        )
        live_points = {row[0]: row[1] for row in live_result.all()}

        for pid in active_param_ids:
            quality = live_points.get(pid)
            if quality in (DataQuality.good, DataQuality.out_of_range, DataQuality.uncertain):
                online += 1
            else:
                offline += 1
    fault = 0


    # Parameter count
    param_count_result = await db.execute(
        select(func.count(Parameter.id)).where(Parameter.is_active == True)
    )
    total_params = param_count_result.scalar() or 0

    # Active alarms
    alarm_result = await db.execute(
        select(func.count(Alarm.id)).where(Alarm.state == AlarmState.active)
    )
    active_alarms = alarm_result.scalar() or 0

    # Data quality (last hour, raw readings)
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    total_q_result = await db.execute(
        select(func.count(HistoricalData.parameter_id)).where(
            HistoricalData.timestamp >= one_hour_ago,
        )
    )
    good_q_result = await db.execute(
        select(func.count(HistoricalData.parameter_id)).where(
            HistoricalData.timestamp >= one_hour_ago,
            HistoricalData.quality.in_((DataQuality.good, DataQuality.out_of_range, DataQuality.uncertain)),
        )
    )
    total_q = total_q_result.scalar() or 1
    good_q = good_q_result.scalar() or 0
    quality_pct = round((good_q / total_q) * 100, 1)

    return DashboardSummary(
        total_stations=total,
        online_stations=online,
        offline_stations=offline,
        fault_stations=fault,
        total_parameters=total_params,
        active_alarms=active_alarms,
        data_quality_pct=quality_pct,
        last_updated=datetime.utcnow(),
    )


