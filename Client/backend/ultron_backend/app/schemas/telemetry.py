"""UltrON — Pydantic Schemas for Telemetry, Alarms, Logs"""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from app.models.telemetry import DataQuality, AverageType, AlarmState


# ─── Telemetry ────────────────────────────────────────────────────────────────
class TelemetryPoint(BaseModel):
    id: int
    parameter_id: int
    timestamp: datetime
    value: Optional[float]
    raw_value: Optional[float] = None
    quality: DataQuality
    avg_type: AverageType
    source: str

    class Config:
        from_attributes = True


class TelemetryQuery(BaseModel):
    parameter_ids: Optional[List[int]] = None
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    avg_type: Optional[AverageType] = AverageType.raw
    limit: int = 1000


class LiveDataPoint(BaseModel):
    """Used in WebSocket live push."""
    parameter_id: int
    tag_name: str
    station_name: str
    device_name: str
    value: Optional[float]
    raw_value: Optional[float] = None
    unit: str
    quality: str
    timestamp: datetime


# ─── Alarm ────────────────────────────────────────────────────────────────────
class AlarmOut(BaseModel):
    id: int
    parameter_id: int
    severity: str
    message: str
    threshold_type: Optional[str]
    threshold_value: Optional[float]
    actual_value: Optional[float]
    state: AlarmState
    triggered_at: datetime
    acknowledged_at: Optional[datetime]
    acknowledged_by: Optional[str]
    cleared_at: Optional[datetime]
    notes: Optional[str]

    class Config:
        from_attributes = True


class AlarmAck(BaseModel):
    alarm_ids: List[int]
    acknowledged_by: str
    notes: Optional[str] = None


# ─── System Log ───────────────────────────────────────────────────────────────
class SystemLogOut(BaseModel):
    id: int
    log_type: str
    level: str
    source: Optional[str]
    message: str
    details: Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True


# ─── Dashboard Summary ────────────────────────────────────────────────────────
class DashboardSummary(BaseModel):
    total_stations: int
    online_stations: int
    offline_stations: int
    fault_stations: int
    total_parameters: int
    active_alarms: int
    data_quality_pct: float
    last_updated: datetime
