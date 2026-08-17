import uuid
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class TelemetryPoint(BaseModel):
    tag_name: str
    value: Optional[float] = None
    quality: str
    timestamp: datetime
    unit: Optional[str] = ""
    std_limit: Optional[float] = None  # CPCB standard limit (client alarm_high)
    station_name: Optional[str] = None  # client station name for grouping

class ClientSyncPayload(BaseModel):
    client_id: str
    points: List[TelemetryPoint]

class SiteCreate(BaseModel):
    name: str
    location: Optional[str] = None
    amc_expiry: Optional[datetime] = None

class DeviceResponse(BaseModel):
    id: int
    site_id: int
    name: str
    status: str = "offline"
    api_key: Optional[str] = None

    class Config:
        from_attributes = True

class DeviceCreate(BaseModel):
    name: str
    status: str = "offline"

class SiteResponse(BaseModel):
    id: int
    name: str
    api_key: str
    location: Optional[str]
    is_active: bool
    amc_expiry: Optional[datetime] = None
    last_sync: Optional[datetime] = None
    lock_status: str = "unlocked"
    lock_reason: Optional[str] = None
    lock_updated_at: Optional[datetime] = None
    last_error: Optional[str] = None
    last_error_at: Optional[datetime] = None
    client_version: Optional[str] = None
    notes: Optional[str] = None
    devices: List[DeviceResponse] = []

    class Config:
        from_attributes = True

class LatestTelemetryPoint(BaseModel):
    id: int
    tag_name: str
    name: str
    unit: Optional[str] = None
    value: Optional[float] = None
    quality: str
    timestamp: datetime
    std_limit: Optional[float] = None  # CPCB standard limit
    station_name: Optional[str] = None  # station grouping label

    class Config:
        from_attributes = True

class BroadcastCreate(BaseModel):
    message: str
    message_type: str = "info"
    expires_at: Optional[datetime] = None
    target_all: bool = True
    target_site_id: Optional[int] = None

class BroadcastResponse(BaseModel):
    id: uuid.UUID
    message: str
    message_type: str
    is_active: bool
    created_at: datetime
    expires_at: Optional[datetime] = None
    target_all: bool = True
    target_site_id: Optional[int] = None

    class Config:
        from_attributes = True

class StationCreate(BaseModel):
    station_id: str
    username: str
    category: str
    station_name: str

class StationUpdate(BaseModel):
    station_id: Optional[str] = None
    username: Optional[str] = None
    category: Optional[str] = None
    station_name: Optional[str] = None
    is_active: Optional[bool] = None

class StationResponse(BaseModel):
    id: int
    site_id: int
    station_id: str
    username: str
    category: str
    station_name: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class LockUpdate(BaseModel):
    lock_status: str = "unlocked"
    lock_reason: Optional[str] = None


