"""UltrON — Device ORM Model"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class DeviceType(str, enum.Enum):
    ANALYZER = "ANALYZER"
    PLC = "PLC"
    DATALOGGER = "DATALOGGER"
    RTU = "RTU"
    SENSOR = "SENSOR"
    CONTROLLER = "CONTROLLER"
    CUSTOM = "CUSTOM"


class DeviceProtocol(str, enum.Enum):
    modbus_tcp   = "modbus_tcp"
    modbus_rtu   = "modbus_rtu"
    tcp_custom   = "tcp_custom"
    udp_custom   = "udp_custom"
    csv          = "csv"
    serial_ascii = "serial_ascii"


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(120), nullable=False, index=True)
    device_type = Column(SAEnum(DeviceType), default=DeviceType.ANALYZER)

    # Protocol (can override station-level)
    protocol = Column(SAEnum(DeviceProtocol, create_constraint=False), default=DeviceProtocol.modbus_tcp)
    host = Column(String(100))           # override station host
    port = Column(Integer)               # override station port
    slave_id = Column(Integer, default=1)  # Modbus slave / unit ID

    # Serial-specific
    serial_port = Column(String(30))
    baud_rate = Column(Integer, default=9600)
    data_bits = Column(Integer, default=8)
    parity = Column(String(5), default="N")
    stop_bits = Column(Integer, default=1)

    # CSV-specific
    csv_path = Column(String(500))
    csv_folder = Column(String(500))
    csv_filename_pattern = Column(String(200))
    csv_delimiter = Column(String(5), default=",")
    csv_timestamp_col = Column(Integer, nullable=True)

    # TCP Custom-specific
    request_hex = Column(String(500), nullable=True)     # hex bytes to send before each read (e.g. "02 4D 31 30 34 30 34 37 43 03")
    response_delimiter = Column(String(20), default="newline")  # "newline", "etx", "length"

    # Serial ASCII-specific
    command_format  = Column(String(10), nullable=True)  # "ascii" | "hex" | "auto"
    request_command = Column(Text, nullable=True)         # command string (ASCII with <CR> tokens, or hex bytes)

    # Polling
    poll_interval = Column(Integer, default=5)    # seconds
    timeout = Column(Integer, default=5)            # seconds
    retry_count = Column(Integer, default=3)

    is_active = Column(Boolean, default=True)
    status = Column(String(20), default="offline")
    last_poll = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    station = relationship("Station", back_populates="devices")
    parameters = relationship("Parameter", back_populates="device", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Device id={self.id} name={self.name} protocol={self.protocol}>"
