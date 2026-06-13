"""UltrON — Telemetry + Alarm ORM Models"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Float,
    ForeignKey, Text, Index, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from app.database import Base
import enum


# ─── Data Quality ─────────────────────────────────────────────────────────────
class DataQuality(str, enum.Enum):
    good = "good"
    bad = "bad"
    uncertain = "uncertain"
    out_of_range = "out_of_range"
    comms_fail = "comms_fail"
    sensor_fail = "sensor_fail"
    maintenance = "maintenance"


# ─── Average Types ────────────────────────────────────────────────────────────
class AverageType(str, enum.Enum):
    raw = "raw"
    avg_1min = "avg_1min"
    avg_5min = "avg_5min"
    avg_15min = "avg_15min"
    avg_1hr = "avg_1hr"
    avg_8hr = "avg_8hr"
    avg_daily = "avg_daily"


# ─── Live Data Hypertable ─────────────────────────────────────────────────────
class LiveData(Base):
    """
    Stores the most recent raw reading per parameter.
    """
    __tablename__ = "live_data"

    parameter_id = Column(Integer, ForeignKey("parameters.id", ondelete="CASCADE"), primary_key=True)
    timestamp = Column(DateTime, nullable=False, primary_key=True)
    value = Column(Float, nullable=True)
    raw_value = Column(Float, nullable=True)
    quality = Column(SAEnum(DataQuality), default=DataQuality.good)
    source = Column(String(30), default="poll")

    # Relationship back to parameter
    parameter = relationship("Parameter", back_populates="live_data")

    @property
    def id(self) -> int:
        return self.parameter_id

    @property
    def avg_type(self) -> AverageType:
        return AverageType.raw

    __table_args__ = (
        Index("ix_live_data_param_time", "parameter_id", "timestamp"),
        Index("ix_live_data_timestamp", "timestamp"),
    )

    def __repr__(self):
        return f"<LiveData param={self.parameter_id} ts={self.timestamp} val={self.value}>"


# ─── Historical Data Hypertable ───────────────────────────────────────────────
class HistoricalData(Base):
    """
    Stores full historical raw telemetry time-series points.
    """
    __tablename__ = "historical_data"

    parameter_id = Column(Integer, ForeignKey("parameters.id", ondelete="CASCADE"), primary_key=True)
    timestamp = Column(DateTime, nullable=False, primary_key=True)
    value = Column(Float, nullable=True)
    raw_value = Column(Float, nullable=True)
    quality = Column(SAEnum(DataQuality), default=DataQuality.good)
    source = Column(String(30), default="poll")

    # Relationship back to parameter
    parameter = relationship("Parameter", back_populates="historical_data")

    @property
    def id(self) -> int:
        return self.parameter_id

    @property
    def avg_type(self) -> AverageType:
        return AverageType.raw

    __table_args__ = (
        Index("ix_historical_data_param_time", "parameter_id", "timestamp"),
        Index("ix_historical_data_timestamp", "timestamp"),
    )

    def __repr__(self):
        return f"<HistoricalData param={self.parameter_id} ts={self.timestamp} val={self.value}>"


# ─── Averages Hypertable ──────────────────────────────────────────────────────
class Averages(Base):
    """
    Stores computed averages (1min, 5min, 15min, 1hr, 8hr, daily).
    """
    __tablename__ = "averages"

    parameter_id = Column(Integer, ForeignKey("parameters.id", ondelete="CASCADE"), primary_key=True)
    timestamp = Column(DateTime, nullable=False, primary_key=True)
    avg_type = Column(SAEnum(AverageType), nullable=False, primary_key=True)
    value = Column(Float, nullable=True)
    quality = Column(SAEnum(DataQuality), default=DataQuality.good)
    source = Column(String(30), default="calc")

    # Relationship back to parameter
    parameter = relationship("Parameter", back_populates="averages")

    @property
    def id(self) -> int:
        return self.parameter_id

    __table_args__ = (
        Index("ix_averages_param_type_time", "parameter_id", "avg_type", "timestamp"),
        Index("ix_averages_timestamp", "timestamp"),
    )

    def __repr__(self):
        return f"<Averages param={self.parameter_id} type={self.avg_type} ts={self.timestamp} val={self.value}>"


# ─── Alarm ────────────────────────────────────────────────────────────────────
class AlarmState(str, enum.Enum):
    active = "active"
    acknowledged = "acknowledged"
    cleared = "cleared"


class Alarm(Base):
    """Active and historical alarms for all parameters."""
    __tablename__ = "alarms"

    id = Column(Integer, primary_key=True, index=True)
    parameter_id = Column(Integer, ForeignKey("parameters.id", ondelete="CASCADE"), nullable=False, index=True)

    severity = Column(String(20), nullable=False)       # info / warning / critical / emergency
    message = Column(Text, nullable=False)
    threshold_type = Column(String(20))                 # low_low / low / high / high_high
    threshold_value = Column(Float)
    actual_value = Column(Float)

    state = Column(SAEnum(AlarmState), default=AlarmState.active)
    triggered_at = Column(DateTime, default=datetime.utcnow, index=True)
    acknowledged_at = Column(DateTime, nullable=True)
    acknowledged_by = Column(String(100), nullable=True)
    cleared_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

    # Relationship
    parameter = relationship("Parameter", back_populates="alarms")

    def __repr__(self):
        return f"<Alarm id={self.id} param={self.parameter_id} sev={self.severity} state={self.state}>"


# ─── System Log ───────────────────────────────────────────────────────────────
class SystemLog(Base):
    """In-database system / communication / audit log entries."""
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, index=True)
    log_type = Column(String(30), nullable=False, index=True)   # comm / system / audit / alarm
    level = Column(String(15), default="INFO")                   # DEBUG / INFO / WARNING / ERROR
    source = Column(String(100))                                 # module name
    message = Column(Text, nullable=False)
    details = Column(Text, nullable=True)                        # JSON extra data
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self):
        return f"<SystemLog id={self.id} type={self.log_type} level={self.level}>"
