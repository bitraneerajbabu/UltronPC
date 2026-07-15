import uuid
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.db.database import Base

class PendingCommand(Base):
    __tablename__ = "pending_commands"

    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("industry_sites.id"), nullable=True)
    station_id = Column(String, index=True)
    action = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending, delivered, completed, failed
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    delivered_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)

class Broadcast(Base):
    __tablename__ = "broadcasts"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message = Column(Text, nullable=False)
    message_type = Column(String, default="info")  # info, warning, critical

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=True)
    target_all = Column(Boolean, default=True)     # True = all sites, False = specific site only
    target_site_id = Column(Integer, ForeignKey("industry_sites.id"), nullable=True)

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
    lock_status = Column(String, default="unlocked")  # unlocked, manual_lock, amc_expired
    lock_reason = Column(Text, nullable=True)
    lock_updated_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)          # Last sync error message (diagnostic)
    last_error_at = Column(DateTime, nullable=True)   # When the last error occurred
    client_version = Column(String, nullable=True)    # UltrON version reported by client
    notes = Column(Text, nullable=True)               # Admin notes / description

    devices = relationship("Device", back_populates="site", cascade="all, delete-orphan")
    telemetry = relationship("TelemetryData", back_populates="site", cascade="all, delete-orphan")
    stations = relationship("Station", back_populates="site", cascade="all, delete-orphan")

class Device(Base):
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("industry_sites.id"))
    name = Column(String)
    status = Column(String, default="offline")
    api_key = Column(String, unique=True, index=True, nullable=True)
    
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

class Alarm(Base):
    __tablename__ = "alarms"

    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("industry_sites.id"), index=True)
    parameter_id = Column(Integer, ForeignKey("parameters.id"), nullable=True)
    value = Column(Float, nullable=True)
    quality = Column(String(10))
    message = Column(Text, nullable=True)
    status = Column(String(20), default="active")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    acknowledged_at = Column(DateTime, nullable=True)

class SoftwareVersion(Base):
    __tablename__ = "software_versions"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String, unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    file_path = Column(String, nullable=True)
    checksum = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    deployments = relationship("OTADeployment", back_populates="version", cascade="all, delete-orphan")

class OTADeployment(Base):
    __tablename__ = "ota_deployments"

    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("industry_sites.id"), nullable=False)
    version_id = Column(Integer, ForeignKey("software_versions.id"), nullable=False)
    status = Column(String, default="pending")  # pending, in_progress, success, failed
    progress = Column(Integer, default=0)        # 0-100
    logs = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    site = relationship("IndustrySite")
    version = relationship("SoftwareVersion", back_populates="deployments")

class Station(Base):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("industry_sites.id"), nullable=False)
    station_id = Column(String(100), nullable=False)
    username = Column(String(200), nullable=False)
    category = Column(String(50), nullable=False)
    station_name = Column(String(200), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    site = relationship("IndustrySite", back_populates="stations")

