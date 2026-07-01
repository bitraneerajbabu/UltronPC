"""UltrON — Station ORM Model"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class StationStatus(str, enum.Enum):
    online = "online"
    offline = "offline"
    fault = "fault"
    maintenance = "maintenance"


class StationType(str, enum.Enum):
    AAQMS = "AAQMS"
    EMS = "EMS"
    WEATHER = "WEATHER"
    NOISE = "NOISE"
    WATER = "WATER"
    EFFLUENT = "EFFLUENT"
    CUSTOM = "CUSTOM"


class Station(Base):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False, unique=True, index=True)
    station_type = Column(SAEnum(StationType), default=StationType.AAQMS)
    location = Column(String(250))
    latitude = Column(String(30))
    longitude = Column(String(30))
    description = Column(Text)

    # Connection config (host-level)
    protocol = Column(String(30), default="modbus_tcp")   # modbus_tcp | modbus_rtu | tcp | csv
    host = Column(String(100))
    port = Column(Integer, default=502)
    serial_port = Column(String(30))                       # COM3 / /dev/ttyUSB0
    baud_rate = Column(Integer, default=9600)

    # Status
    status = Column(SAEnum(StationStatus), default=StationStatus.offline)
    is_active = Column(Boolean, default=True)
    last_seen = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    devices = relationship("Device", back_populates="station", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Station id={self.id} name={self.name} status={self.status}>"
