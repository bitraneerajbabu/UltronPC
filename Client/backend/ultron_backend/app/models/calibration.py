"""UltrON — Calibration ORM Models"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, DateTime, Float, ForeignKey, Text, JSON,
    Enum as SAEnum
)
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class CalibrationType(str, enum.Enum):
    zero = "zero"
    span = "span"
    full = "full"


class CalibrationSequence(str, enum.Enum):
    zero_first = "zero_first"
    span_first = "span_first"


class CalibrationStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    approved = "approved"
    rejected = "rejected"


class CalibrationPhase(str, enum.Enum):
    zero = "zero"
    span = "span"


class ApprovalDecision(str, enum.Enum):
    approved = "approved"
    rejected = "rejected"


class CalibrationJob(Base):
    __tablename__ = "calibration_jobs"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id", ondelete="CASCADE"), nullable=False, index=True)
    parameter_id = Column(Integer, ForeignKey("parameters.id", ondelete="CASCADE"), nullable=False, index=True)
    job_name = Column(String(200), nullable=False)
    calibration_type = Column(SAEnum(CalibrationType), nullable=False)
    sequence = Column(SAEnum(CalibrationSequence), default=CalibrationSequence.zero_first)
    status = Column(SAEnum(CalibrationStatus), default=CalibrationStatus.pending)
    scheduled_start = Column(DateTime, nullable=True)
    actual_start = Column(DateTime, nullable=True)
    actual_end = Column(DateTime, nullable=True)
    triggered_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    station = relationship("Station", backref="calibration_jobs")
    parameter = relationship("Parameter", backref="calibration_jobs")
    results = relationship("CalibrationResult", back_populates="calibration_job", cascade="all, delete-orphan")
    approvals = relationship("CalibrationApproval", back_populates="calibration_job", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<CalibrationJob id={self.id} name={self.job_name} status={self.status}>"


class CalibrationResult(Base):
    __tablename__ = "calibration_results"

    id = Column(Integer, primary_key=True, index=True)
    calibration_job_id = Column(Integer, ForeignKey("calibration_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    phase = Column(SAEnum(CalibrationPhase), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)
    min_value = Column(Float, nullable=True)
    max_value = Column(Float, nullable=True)
    avg_value = Column(Float, nullable=True)
    std_dev = Column(Float, nullable=True)
    values_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    calibration_job = relationship("CalibrationJob", back_populates="results")

    def __repr__(self):
        return f"<CalibrationResult id={self.id} job={self.calibration_job_id} phase={self.phase}>"


class CalibrationApproval(Base):
    __tablename__ = "calibration_approvals"

    id = Column(Integer, primary_key=True, index=True)
    calibration_job_id = Column(Integer, ForeignKey("calibration_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    approved_by = Column(String(100), nullable=False)
    approved_at = Column(DateTime, default=datetime.utcnow)
    status = Column(SAEnum(ApprovalDecision), nullable=False)
    comments = Column(Text, nullable=True)
    control_chart_data_json = Column(JSON, nullable=True)

    calibration_job = relationship("CalibrationJob", back_populates="approvals")

    def __repr__(self):
        return f"<CalibrationApproval id={self.id} job={self.calibration_job_id} status={self.status}>"
