"""UltrON — RajAPI Sync Config ORM Model"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base


class RajAPIConfig(Base):
    __tablename__ = "rajapi_config"

    id = Column(Integer, primary_key=True, index=True)
    auth_token = Column(Text, nullable=True)
    is_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    stations = relationship("RajAPIStationConfig", back_populates="config", cascade="all, delete-orphan")


class RajAPIStationConfig(Base):
    __tablename__ = "rajapi_station_config"

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("rajapi_config.id", ondelete="CASCADE"), nullable=False)
    station_id = Column(Integer, ForeignKey("stations.id", ondelete="CASCADE"), nullable=False)
    enabled = Column(Boolean, default=True)
    custom_station_id = Column(String(255), nullable=True)
    username = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    config = relationship("RajAPIConfig", back_populates="stations")

    def __repr__(self):
        return f"<RajAPIStationConfig station_id={self.station_id} enabled={self.enabled}>"
