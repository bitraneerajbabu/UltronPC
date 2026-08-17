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
from app.services.report_data import fetch_interval_data, MAX_EXPORT_ROWS

router = APIRouter(prefix="/trends", tags=["Trends"], dependencies=[Depends(get_current_user)])


def _reports_dir() -> Path:
    d = Path(settings.REPORTS_DIR).resolve()
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.get("/chart-data")
async def get_chart_data(
    db: AsyncSession = Depends(get_db),
    parameter_ids: str = Query(..., description="Comma-separated parameter IDs"),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    avg_type: AverageType = AverageType.raw,
    step_minutes: int = Query(0, description="Step interval in minutes (for raw mode, Normal Reports)"),
    limit: int = Query(50000, le=200000),
):
    """
    Returns time-series data for Chart.js rendering.
    Format: { parameter_id: { labels: [...timestamps], data: [...values] } }

    Uses the shared :func:`fetch_interval_data` to ensure preview and export
    return identical row counts and data for the same parameters/range/interval.

    * ``avg_type`` controls the data source:
      - ``raw`` with ``step_minutes > 0`` → step mode (HistoricalData, first per bucket)
      - ``raw`` with ``step_minutes == 0`` → raw mode (HistoricalData, capped)
      - ``avg_5min`` / ``avg_1hr`` / etc. → average mode (Averages table)
    """
    ids = [int(x) for x in parameter_ids.split(",") if x.strip().isdigit()]
    if not ids:
        raise HTTPException(status_code=400, detail="No valid parameter IDs provided")
    if len(ids) > 200:
        raise HTTPException(status_code=400, detail="Maximum 200 parameters allowed per request")

    if not start or not isinstance(start, datetime):
        start = datetime.utcnow() - timedelta(hours=24)
    elif start.tzinfo is not None:
        start = start.replace(tzinfo=None)

    if not end or not isinstance(end, datetime):
        end = datetime.utcnow()
    elif end.tzinfo is not None:
        end = end.replace(tzinfo=None)

    # ── Use the shared data-fetching function ─────────────────────────────
    interval = step_minutes if avg_type == AverageType.raw else 0
    avg_t = avg_type.value if isinstance(avg_type, AverageType) else str(avg_type)
    params, readings = await fetch_interval_data(
        db=db,
        parameter_ids=ids,
        start=start,
        end=end,
        interval_minutes=interval,
        avg_type=avg_t,
        limit=limit,
    )
    param_map = {p.id: p for p in params}

    # ── Build Chart.js series format ──────────────────────────────────────
    series: dict = {}
    for pid in ids:
        p = param_map.get(pid)
        series[pid] = {
            "parameter_id": pid,
            "tag_name": p.tag_name if p else str(pid),
            "name": p.name if p else str(pid),
            "unit": p.unit if p else "",
            "labels": [],
            "values": [],
            "qualities": [],
        }

    for r in readings:
        sid = r.parameter_id
        if sid in series:
            series[sid]["labels"].append(r.timestamp.isoformat())
            series[sid]["values"].append(r.value)
            series[sid]["qualities"].append(str(r.quality))

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "avg_type": str(avg_type),
        "series": [s for s in series.values() if s["labels"]],
    }


@router.get("/statistics")
async def get_statistics(
    parameter_id: int,
    db: AsyncSession = Depends(get_db),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    avg_type: AverageType = AverageType.raw,
):
    """Min / Max / Avg / StdDev / Count for a parameter in a time range."""
    if not end or not isinstance(end, datetime):
        end = datetime.utcnow()
    elif end.tzinfo is not None:
        end = end.replace(tzinfo=None)

    if not start or not isinstance(start, datetime):
        start = end - timedelta(hours=24)
    elif start.tzinfo is not None:
        start = start.replace(tzinfo=None)

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
    db: AsyncSession = Depends(get_db),
    parameter_ids: str = Query(..., description="Comma-separated parameter IDs"),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    avg_type: AverageType = AverageType.raw,
    step_minutes: int = Query(0, description="Step interval in minutes (for raw mode, Normal Reports)"),
):
    """Export trend data as CSV saved to the Reports directory.

    Uses the shared :func:`fetch_interval_data` — identical query path
    as chart-data preview and Reports PDF/Excel exports.
    """
    ids = [int(x) for x in parameter_ids.split(",") if x.strip().isdigit()]
    if not ids:
        raise HTTPException(status_code=400, detail="No valid parameter IDs provided")
    if len(ids) > 200:
        raise HTTPException(status_code=400, detail="Maximum 200 parameters allowed per request")

    if not end:
        end = datetime.utcnow()
    elif end.tzinfo is not None:
        end = end.replace(tzinfo=None)

    if not start:
        start = end - timedelta(hours=24)
    elif start.tzinfo is not None:
        start = start.replace(tzinfo=None)

    # ── Use the shared data-fetching function ─────────────────────────────
    interval = step_minutes if avg_type == AverageType.raw else 0
    avg_t = avg_type.value if isinstance(avg_type, AverageType) else str(avg_type)
    params, readings = await fetch_interval_data(
        db=db,
        parameter_ids=ids,
        start=start,
        end=end,
        interval_minutes=interval,
        avg_type=avg_t,
    )
    param_map = {p.id: p for p in params}

    rows = []
    for r in readings:
        p = param_map.get(r.parameter_id)
        rows.append({
            "timestamp": r.timestamp.strftime("%Y/%m/%d %H:%M"),
            "parameter": p.tag_name if p else str(r.parameter_id),
            "unit": p.unit if p else "",
            "value": f"{r.value:.3f}" if r.value is not None else "NA",
            "quality": getattr(r.quality, 'value', str(r.quality)),
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
