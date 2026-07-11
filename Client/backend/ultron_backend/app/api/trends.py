"""UltrON — Trends API (chart data with averaging + CSV export)"""

import csv
import io
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.database import get_db
from app.models.telemetry import HistoricalData, Averages, AverageType, DataQuality
from app.models.parameter import Parameter
from app.core.security import get_current_user
from app.config import settings

router = APIRouter(prefix="/trends", tags=["Trends"], dependencies=[Depends(get_current_user)])


def _reports_dir() -> Path:
    d = Path(settings.REPORTS_DIR).resolve()
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.get("/chart-data")
async def get_chart_data(
    parameter_ids: str = Query(..., description="Comma-separated parameter IDs"),
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    avg_type: AverageType = AverageType.raw,
    limit: int = Query(50000, le=200000),
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


@router.get("/export-csv")
async def export_trend_csv(
    parameter_ids: str = Query(..., description="Comma-separated parameter IDs"),
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    avg_type: AverageType = AverageType.raw,
    db: AsyncSession = Depends(get_db),
):
    """Export trend data as CSV saved to the Reports directory."""
    ids = [int(x) for x in parameter_ids.split(",") if x.strip().isdigit()]
    if not ids:
        raise HTTPException(status_code=400, detail="No valid parameter IDs provided")

    if not end:
        end = datetime.utcnow()
    if not start:
        start = end - timedelta(hours=24)

    model = HistoricalData if avg_type == AverageType.raw else Averages

    param_result = await db.execute(
        select(Parameter).where(Parameter.id.in_(ids))
    )
    params = {p.id: p for p in param_result.scalars().all()}

    rows = []
    for pid in ids:
        p = params.get(pid)
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
            .order_by(model.timestamp)
        )
        readings = result.scalars().all()
        for r in readings:
            rows.append({
                "timestamp": r.timestamp.strftime("%Y/%m/%d %H:%M"),
                "parameter": p.tag_name if p else str(pid),
                "unit": p.unit if p else "",
                "value": f"{r.value:.3f}" if r.value is not None else "NA",
                "quality": str(r.quality),
            })

    headers = ["Timestamp", "Parameter", "Value", "Unit", "Quality"]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    for r in rows:
        writer.writerow([r["timestamp"], r["parameter"], r["value"], r["unit"], r["quality"]])

    csv_content = buf.getvalue()
    fname = f"UltrON_Trend_{start.strftime('%Y%m%d')}_{end.strftime('%Y%m%d')}.csv"
    try:
        report_path = _reports_dir() / fname
        report_path.write_text(csv_content, encoding="utf-8")
    except Exception as e:
        pass  # streaming still works

    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
