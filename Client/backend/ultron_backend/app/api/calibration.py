"""UltrON — Calibration API"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.database import get_db
from app.models.calibration import (
    CalibrationJob, CalibrationResult, CalibrationApproval,
    CalibrationType, CalibrationSequence, CalibrationStatus,
    CalibrationPhase, ApprovalDecision,
)
from app.models.station import Station
from app.models.parameter import Parameter
from app.core.security import require_admin

router = APIRouter(
    prefix="/calibration",
    tags=["Calibration"],
    dependencies=[Depends(require_admin)],
)


# ─── Schemas ──────────────────────────────────────────────────────────────────

class StartCalibrationRequest(BaseModel):
    station_id: int
    parameter_id: int
    job_name: str = Field(..., min_length=1, max_length=200)
    calibration_type: CalibrationType
    sequence: CalibrationSequence = CalibrationSequence.zero_first
    scheduled_start: Optional[datetime] = None


class CalibrationResultOut(BaseModel):
    id: int
    calibration_job_id: int
    phase: CalibrationPhase
    start_time: datetime
    end_time: Optional[datetime]
    min_value: Optional[float]
    max_value: Optional[float]
    avg_value: Optional[float]
    std_dev: Optional[float]
    values_json: Optional[dict]
    created_at: datetime

    model_config = {"from_attributes": True}


class CalibrationApprovalOut(BaseModel):
    id: int
    calibration_job_id: int
    approved_by: str
    approved_at: datetime
    status: ApprovalDecision
    comments: Optional[str]
    control_chart_data_json: Optional[dict]

    model_config = {"from_attributes": True}


class CalibrationJobOut(BaseModel):
    id: int
    station_id: int
    parameter_id: int
    job_name: str
    calibration_type: CalibrationType
    sequence: CalibrationSequence
    status: CalibrationStatus
    scheduled_start: Optional[datetime]
    actual_start: Optional[datetime]
    actual_end: Optional[datetime]
    triggered_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    results: List[CalibrationResultOut] = []
    approvals: List[CalibrationApprovalOut] = []

    model_config = {"from_attributes": True}


class CalibrationJobListItem(BaseModel):
    id: int
    station_id: int
    parameter_id: int
    job_name: str
    calibration_type: CalibrationType
    status: CalibrationStatus
    actual_start: Optional[datetime]
    actual_end: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class ApproveRejectRequest(BaseModel):
    comments: Optional[str] = None


class ControlChartData(BaseModel):
    shewhart: Optional[dict] = None
    cusum: Optional[dict] = None
    ewma: Optional[dict] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/start", response_model=CalibrationJobOut, status_code=status.HTTP_201_CREATED)
async def start_calibration(
    req: StartCalibrationRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    station = await db.get(Station, req.station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    parameter = await db.get(Parameter, req.parameter_id)
    if not parameter:
        raise HTTPException(status_code=404, detail="Parameter not found")

    job = CalibrationJob(
        station_id=req.station_id,
        parameter_id=req.parameter_id,
        job_name=req.job_name,
        calibration_type=req.calibration_type,
        sequence=req.sequence,
        status=CalibrationStatus.pending,
        scheduled_start=req.scheduled_start,
        triggered_by=admin.username if hasattr(admin, "username") else "admin",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.get("/jobs", response_model=List[CalibrationJobListItem])
async def list_calibration_jobs(
    status_filter: Optional[CalibrationStatus] = Query(None, alias="status"),
    station_id: Optional[int] = None,
    parameter_id: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    query = select(CalibrationJob)
    conditions = []
    if status_filter:
        conditions.append(CalibrationJob.status == status_filter)
    if station_id:
        conditions.append(CalibrationJob.station_id == station_id)
    if parameter_id:
        conditions.append(CalibrationJob.parameter_id == parameter_id)
    if date_from:
        conditions.append(CalibrationJob.created_at >= date_from)
    if date_to:
        conditions.append(CalibrationJob.created_at <= date_to)
    if conditions:
        query = query.where(and_(*conditions))
    query = query.order_by(CalibrationJob.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/jobs/{job_id}", response_model=CalibrationJobOut)
async def get_calibration_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    job = await db.get(CalibrationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Calibration job not found")
    return job


@router.post("/{job_id}/approve", response_model=CalibrationApprovalOut)
async def approve_calibration(
    job_id: int,
    req: ApproveRejectRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    job = await db.get(CalibrationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Calibration job not found")
    if job.status not in (CalibrationStatus.completed, CalibrationStatus.pending, CalibrationStatus.running):
        raise HTTPException(status_code=400, detail=f"Cannot approve job with status '{job.status}'")

    job.status = CalibrationStatus.approved
    approval = CalibrationApproval(
        calibration_job_id=job_id,
        approved_by=admin.username if hasattr(admin, "username") else "admin",
        status=ApprovalDecision.approved,
        comments=req.comments,
    )
    db.add(approval)
    await db.commit()
    await db.refresh(approval)
    return approval


@router.post("/{job_id}/reject", response_model=CalibrationApprovalOut)
async def reject_calibration(
    job_id: int,
    req: ApproveRejectRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    job = await db.get(CalibrationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Calibration job not found")
    if job.status not in (CalibrationStatus.completed, CalibrationStatus.pending, CalibrationStatus.running):
        raise HTTPException(status_code=400, detail=f"Cannot reject job with status '{job.status}'")

    job.status = CalibrationStatus.rejected
    approval = CalibrationApproval(
        calibration_job_id=job_id,
        approved_by=admin.username if hasattr(admin, "username") else "admin",
        status=ApprovalDecision.rejected,
        comments=req.comments,
    )
    db.add(approval)
    await db.commit()
    await db.refresh(approval)
    return approval


@router.get("/results/{result_id}", response_model=CalibrationResultOut)
async def get_calibration_result(
    result_id: int,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    result = await db.get(CalibrationResult, result_id)
    if not result:
        raise HTTPException(status_code=404, detail="Calibration result not found")
    return result


@router.get("/control-chart/{job_id}", response_model=ControlChartData)
async def get_control_chart_data(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    job = await db.get(CalibrationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Calibration job not found")

    approval = (
        await db.execute(
            select(CalibrationApproval)
            .where(CalibrationApproval.calibration_job_id == job_id)
            .order_by(CalibrationApproval.approved_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    chart_data = ControlChartData()
    if approval and approval.control_chart_data_json:
        cc = approval.control_chart_data_json
        chart_data.shewhart = cc.get("shewhart")
        chart_data.cusum = cc.get("cusum")
        chart_data.ewma = cc.get("ewma")

    return chart_data


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_calibration_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Delete a calibration job (cascades to results and approvals)."""
    job = await db.get(CalibrationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Calibration job not found")
    await db.delete(job)
    await db.commit()
    return None
