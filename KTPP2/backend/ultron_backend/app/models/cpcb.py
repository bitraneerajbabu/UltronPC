"""UltrON — CPCB CAAQM Legacy Export ORM Models"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Float,
    ForeignKey, Text, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from app.database import Base


class CPCBStationConfig(Base):
    """Per-station CPCB export configuration."""
    __tablename__ = "cpcb_station_config"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    station_name = Column(String(100), nullable=False, index=True)
    station_code = Column(String(50))
    export_enabled = Column(Boolean, default=True)
    export_path = Column(String(500), nullable=False, default="C:\\Data")
    cpcb_enabled = Column(Boolean, default=True)
    timezone = Column(String(50), default="Asia/Kolkata")
    retention_count = Column(Integer, default=97)

    calibration_mode = Column(Boolean, default=False)
    maintenance_mode = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    station = relationship("Station")

    def __repr__(self):
        return f"<CPCBStationConfig id={self.id} station={self.station_name}>"


class CPCBParameterMapping(Base):
    """Maps internal UltrON parameters to CPCB parameter names with conversion."""
    __tablename__ = "cpcb_parameter_mapping"

    id = Column(Integer, primary_key=True, index=True)
    internal_parameter = Column(String(100), nullable=False)
    cpcb_parameter = Column(String(100), nullable=False, index=True)
    unit = Column(String(20), default="ppm")
    conversion_factor = Column(Float, default=1.0)
    enabled = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<CPCBParameterMapping id={self.id} {self.internal_parameter}->{self.cpcb_parameter}>"


class CPCBExportRecord(Base):
    """Stores generated 15-minute CPCB-compliant records."""
    __tablename__ = "cpcb_export_records"

    id = Column(Integer, primary_key=True, index=True)
    station_name = Column(String(100), nullable=False, index=True)
    parameter = Column(String(100), nullable=False, index=True)
    date_from = Column(DateTime, nullable=False)
    date_to = Column(DateTime, nullable=False)
    value = Column(Float, nullable=True)
    calibration_flag = Column(Integer, default=0)
    maintenance_flag = Column(Integer, default=0)
    remark = Column(String(200), default="Normal")
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "station_name", "parameter", "date_from", "date_to",
            name="uq_cpcb_export_record"
        ),
        Index("ix_cpcb_export_from_to", "date_from", "date_to"),
    )

    def __repr__(self):
        return f"<CPCBExportRecord id={self.id} {self.station_name}/{self.parameter} @ {self.date_from}>"


class CPCBExportLog(Base):
    """Logs every CPCB export run."""
    __tablename__ = "cpcb_export_logs"

    id = Column(Integer, primary_key=True, index=True)
    station_name = Column(String(100), nullable=False, index=True)
    record_count = Column(Integer, default=0)
    status = Column(String(20), default="success")
    message = Column(Text, nullable=True)
    execution_time_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self):
        return f"<CPCBExportLog id={self.id} station={self.station_name} status={self.status}>"
