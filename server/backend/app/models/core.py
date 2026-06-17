from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.db.database import Base

class IndustrySite(Base):
    __tablename__ = "industry_sites"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    api_key = Column(String, unique=True, index=True)
    location = Column(String)
    is_active = Column(Boolean, default=True)
    amc_expiry = Column(DateTime, nullable=True)
    last_sync = Column(DateTime, nullable=True)   # Updated on every UltrON client sync
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    devices = relationship("Device", back_populates="site", cascade="all, delete-orphan")
    telemetry = relationship("TelemetryData", back_populates="site", cascade="all, delete-orphan")

class Device(Base):
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("industry_sites.id"))
    name = Column(String)
    status = Column(String, default="offline")
    
    site = relationship("IndustrySite", back_populates="devices")
    parameters = relationship("Parameter", back_populates="device", cascade="all, delete-orphan")

class Parameter(Base):
    __tablename__ = "parameters"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    name = Column(String)
    tag_name = Column(String)
    unit = Column(String)
    
    device = relationship("Device", back_populates="parameters")
    telemetry = relationship("TelemetryData", back_populates="parameter", cascade="all, delete-orphan")

class TelemetryData(Base):
    __tablename__ = "telemetry_data"
    
    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("industry_sites.id"), index=True)
    parameter_id = Column(Integer, ForeignKey("parameters.id"), index=True)
    value = Column(Float)
    quality = Column(String)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    
    site = relationship("IndustrySite", back_populates="telemetry")
    parameter = relationship("Parameter", back_populates="telemetry")
