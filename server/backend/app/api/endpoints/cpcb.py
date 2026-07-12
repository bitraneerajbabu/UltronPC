from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta, timezone
from app.db.database import get_db
from app.models.core import IndustrySite
from app.api.deps import AuthContext, get_auth_context

router = APIRouter()


@router.get("/status")
def cpcb_status(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    sql = text("""
        SELECT
            s.id AS site_id,
            s.name AS site_name,
            s.last_sync AS last_tgpcb_sync,
            COALESCE(t.today_count, 0) AS total_records_synced_today,
            s.last_error
        FROM industry_sites s
        LEFT JOIN (
            SELECT site_id, COUNT(*) AS today_count
            FROM telemetry_data
            WHERE timestamp >= :today
            GROUP BY site_id
        ) t ON t.site_id = s.id
        ORDER BY s.name
    """)
    rows = db.execute(sql, {"today": today_start}).fetchall()

    return [
        {
            "site_id": r.site_id,
            "site_name": r.site_name,
            "last_tgpcb_sync": r.last_tgpcb_sync.isoformat() if r.last_tgpcb_sync else None,
            "total_records_synced_today": r.total_records_synced_today,
            "last_error": r.last_error,
        }
        for r in rows
    ]


@router.get("/summary")
def cpcb_summary(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    sql = text("""
        SELECT
            t.site_id,
            s.name AS site_name,
            DATE(t.timestamp) AS record_date,
            COUNT(*) AS record_count
        FROM telemetry_data t
        JOIN industry_sites s ON s.id = t.site_id
        WHERE t.timestamp >= :since
        GROUP BY t.site_id, s.name, DATE(t.timestamp)
        ORDER BY t.site_id, record_date
    """)
    rows = db.execute(sql, {"since": thirty_days_ago}).fetchall()

    result = {}
    for r in rows:
        sid = r.site_id
        if sid not in result:
            result[sid] = {
                "site_id": sid,
                "site_name": r.site_name,
                "daily_counts": [],
            }
        result[sid]["daily_counts"].append({
            "date": r.record_date.isoformat() if r.record_date else None,
            "record_count": r.record_count,
        })

    return list(result.values())
