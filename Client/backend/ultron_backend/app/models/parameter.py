"""UltrON — Parameter ORM Model"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Float,
    ForeignKey, Text, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class RegisterType(str, enum.Enum):
    holding = "holding"           # FC 03
    input_reg = "input_reg"       # FC 04
    coil = "coil"                 # FC 01
    discrete_input = "discrete_input"  # FC 02


class DataType(str, enum.Enum):
    float32 = "float32"
    int16 = "int16"
    uint16 = "uint16"
    int32 = "int32"
    uint32 = "uint32"
    int64 = "int64"
    bool_ = "bool"
    string = "string"


class ByteOrder(str, enum.Enum):
    big = "big"
    little = "little"
    big_swap = "big_swap"
    little_swap = "little_swap"


class AlarmSeverity(str, enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"
    emergency = "emergency"


class Parameter(Base):
    __tablename__ = "parameters"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(120), nullable=False, index=True)
    tag_name = Column(String(60), nullable=False, index=True)   # short unique tag (e.g. SO2, PM10)
    description = Column(Text)
    unit = Column(String(30))                                    # mg/m3, µg/m3, ppm, °C, %

    # Register mapping
    register_type = Column(SAEnum(RegisterType), default=RegisterType.holding)
    register_address = Column(Integer, nullable=False)
    register_count = Column(Integer, default=2)                  # number of 16-bit registers
    data_type = Column(SAEnum(DataType), default=DataType.float32)
    byte_order = Column(SAEnum(ByteOrder), default=ByteOrder.big)
    scale_factor = Column(Float, default=1.0)
    offset = Column(Float, default=0.0)

    # Data quality limits
    min_valid = Column(Float, nullable=True)
    max_valid = Column(Float, nullable=True)

    # Alarm thresholds
    alarm_low_low = Column(Float, nullable=True)
    alarm_low = Column(Float, nullable=True)
    alarm_high = Column(Float, nullable=True)
    alarm_high_high = Column(Float, nullable=True)
    alarm_severity = Column(SAEnum(AlarmSeverity), default=AlarmSeverity.warning)
    alarm_enabled = Column(Boolean, default=True)
    alarm_deadband = Column(Float, default=0.0)                  # hysteresis

    # TCP Custom parsing
    parse_method = Column(String(30), default="csv_col")  # "csv_col", "position", "regex", "delimiter_split"
    parse_config = Column(Text, nullable=True)             # JSON config for the parse method

    # Connection overrides (allows individual parameters to connect differently)
    host = Column(String(100), nullable=True)
    port = Column(Integer, nullable=True)
    serial_port = Column(String(50), nullable=True)
    baud_rate = Column(Integer, nullable=True)
    data_bits = Column(Integer, nullable=True)
    parity = Column(String(5), nullable=True)
    stop_bits = Column(Integer, nullable=True)
    slave_id = Column(Integer, nullable=True)

    # Display
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    device = relationship("Device", back_populates="parameters")
    live_data = relationship("LiveData", back_populates="parameter", cascade="all, delete-orphan")
    historical_data = relationship("HistoricalData", back_populates="parameter", cascade="all, delete-orphan")
    averages = relationship("Averages", back_populates="parameter", cascade="all, delete-orphan")
    alarms = relationship("Alarm", back_populates="parameter", cascade="all, delete-orphan")
    server_mappings = relationship("ServerParameterMapping", back_populates="parameter", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Parameter id={self.id} tag={self.tag_name} addr={self.register_address}>"
