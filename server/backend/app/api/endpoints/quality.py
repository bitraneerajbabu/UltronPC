from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta, timezone
from typing import Optional
from app.db.database import get_db
from app.models.core import IndustrySite
from app.api.deps import AuthContext, get_auth_context

router = APIRouter()


@router.get("/")
def get_quality_summary(
    from_date: Optional[datetime] = Query(default=None, alias="from"),
    to_date: Optional[datetime] = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    now = datetime.now(timezone.utc)
    frm = from_date or (now - timedelta(hours=24))
    to = to_date or now

    sql = text("""
        SELECT
            s.id AS site_id,
            s.name AS site_name,
            COUNT(t.id) AS total_points,
            COUNT(*) FILTER (WHERE t.quality = 'U') AS quality_u,
            COUNT(*) FILTER (WHERE t.quality = 'O') AS quality_o,
            COUNT(*) FILTER (WHERE t.quality = 'E') AS quality_e,
            COUNT(*) FILTER (WHERE t.quality IS NULL OR t.quality NOT IN ('U', 'O', 'E')) AS quality_n
        FROM industry_sites s
        LEFT JOIN telemetry_data t ON t.site_id = s.id
            AND t.timestamp >= :frm AND t.timestamp <= :to
        GROUP BY s.id, s.name
        ORDER BY s.name
    """)
    rows = db.execute(sql, {"frm": frm, "to": to}).fetchall()

    result = []
    for r in rows:
        total = r.total_points or 0
        result.append({
            "site_id": r.site_id,
            "site_name": r.site_name,
            "total_points": total,
            "quality": {
                "U": {"count": r.quality_u or 0, "percentage": round((r.quality_u or 0) / total * 100, 1) if total else 0},
                "O": {"count": r.quality_o or 0, "percentage": round((r.quality_o or 0) / total * 100, 1) if total else 0},
                "E": {"count": r.quality_e or 0, "percentage": round((r.quality_e or 0) / total * 100, 1) if total else 0},
                "N": {"count": r.quality_n or 0, "percentage": round((r.quality_n or 0) / total * 100, 1) if total else 0},
            }
        })
    return result


@router.get("/{site_id}")
def get_site_quality_detail(
    site_id: int,
    from_date: Optional[datetime] = Query(default=None, alias="from"),
    to_date: Optional[datetime] = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    if not auth.is_admin and auth.site_id != site_id:
        raise HTTPException(status_code=403, detail="Access denied")

    site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    now = datetime.now(timezone.utc)
    frm = from_date or (now - timedelta(hours=24))
    to = to_date or now

    sql = text("""
        SELECT
            p.id AS parameter_id,
            p.name AS parameter_name,
            p.tag_name,
            p.unit,
            COUNT(t.id) AS total_points,
            COUNT(*) FILTER (WHERE t.quality = 'U') AS quality_u,
            COUNT(*) FILTER (WHERE t.quality = 'O') AS quality_o,
            COUNT(*) FILTER (WHERE t.quality = 'E') AS quality_e,
            COUNT(*) FILTER (WHERE t.quality IS NULL OR t.quality NOT IN ('U', 'O', 'E')) AS quality_n
        FROM telemetry_data t
        JOIN parameters p ON p.id = t.parameter_id
        WHERE t.site_id = :site_id AND t.timestamp >= :frm AND t.timestamp <= :to
        GROUP BY p.id, p.name, p.tag_name, p.unit
        ORDER BY p.name
    """)
    rows = db.execute(sql, {"site_id": site_id, "frm": frm, "to": to}).fetchall()

    return [
        {
            "parameter_id": r.parameter_id,
            "parameter_name": r.parameter_name,
            "tag_name": r.tag_name,
            "unit": r.unit,
            "total_points": r.total_points or 0,
            "quality": {
                "U": {"count": r.quality_u or 0},
                "O": {"count": r.quality_o or 0},
                "E": {"count": r.quality_e or 0},
                "N": {"count": r.quality_n or 0},
            }
        }
        for r in rows
    ]
