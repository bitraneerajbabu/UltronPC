"""UltrON — Trends API (chart data with averaging)"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timedelta
from typing import List, Optional
from app.database import get_db
from app.models.telemetry import HistoricalData, Averages, AverageType, DataQuality
from app.models.parameter import Parameter

router = APIRouter(prefix="/trends", tags=["Trends"])


@router.get("/chart-data")
async def get_chart_data(
    parameter_ids: str = Query(..., description="Comma-separated parameter IDs"),
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    avg_type: AverageType = AverageType.raw,
    limit: int = Query(5000, le=100000),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns time-series data for Chart.js rendering.
    Format: { parameter_id: { labels: [...timestamps], data: [...values] } }
    """
    ids = [int(x) for x in parameter_ids.split(",") if x.strip().isdigit()]
    if not ids:
        raise HTTPException(status_code=400, detail="No valid parameter IDs provided")

    if not end:
        end = datetime.utcnow()
    if not start:
        start = end - timedelta(hours=24)

    model = HistoricalData if avg_type == AverageType.raw else Averages
    # Get parameter metadata for labels
    param_result = await db.execute(
        select(Parameter).where(Parameter.id.in_(ids))
    )
    params = {p.id: p for p in param_result.scalars().all()}

    # Build per-parameter series
    series: dict = {}
    for pid in ids:
        p = params.get(pid)
        series[pid] = {
            "parameter_id": pid,
            "tag_name": p.tag_name if p else str(pid),
            "name": p.name if p else str(pid),
            "unit": p.unit if p else "",
            "labels": [],
            "values": [],
            "qualities": [],
        }

        conditions = [
            model.parameter_id == pid,
            model.timestamp >= start,
            model.timestamp <= end,
        ]
        if avg_type != AverageType.raw:
            conditions.append(model.avg_type == avg_type)

        result = await db.execute(
            select(model)
            .where(and_(*conditions))
            .order_by(model.timestamp.desc())
            .limit(limit)
        )
        rows = result.scalars().all()
        rows = list(reversed(rows))

        for row in rows:
            series[pid]["labels"].append(row.timestamp.isoformat())
            series[pid]["values"].append(row.value)
            series[pid]["qualities"].append(str(row.quality))

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "avg_type": str(avg_type),
        "series": list(series.values()),
    }


@router.get("/statistics")
async def get_statistics(
    parameter_id: int,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    avg_type: AverageType = AverageType.raw,
    db: AsyncSession = Depends(get_db),
):
    """Min / Max / Avg / StdDev / Count for a parameter in a time range."""
    if not end:
        end = datetime.utcnow()
    if not start:
        start = end - timedelta(hours=24)

    model = HistoricalData if avg_type == AverageType.raw else Averages
    conditions = [
        model.parameter_id == parameter_id,
        model.quality.in_((DataQuality.good, DataQuality.out_of_range, DataQuality.uncertain)),
        model.timestamp >= start,
        model.timestamp <= end,
    ]
    if avg_type != AverageType.raw:
        conditions.append(model.avg_type == avg_type)

    result = await db.execute(
        select(
            func.min(model.value).label("min"),
            func.max(model.value).label("max"),
            func.avg(model.value).label("avg"),
            func.count(model.parameter_id).label("count"),
        ).where(and_(*conditions))
    )
    row = result.one()

    param_result = await db.execute(select(Parameter).where(Parameter.id == parameter_id))
    param = param_result.scalar_one_or_none()

    return {
        "parameter_id": parameter_id,
        "tag_name": param.tag_name if param else str(parameter_id),
        "unit": param.unit if param else "",
        "start": start.isoformat(),
        "end": end.isoformat(),
        "avg_type": str(avg_type),
        "min": row.min,
        "max": row.max,
        "avg": round(row.avg, 4) if row.avg else None,
        "count": row.count,
    }
