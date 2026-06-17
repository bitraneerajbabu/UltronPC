from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class TelemetryPoint(BaseModel):
    tag_name: str
    value: Optional[float] = None
    quality: str
    timestamp: datetime

class ClientSyncPayload(BaseModel):
    client_id: str
    points: List[TelemetryPoint]

class SiteCreate(BaseModel):
    name: str
    location: Optional[str] = None
    amc_expiry: Optional[datetime] = None

class SiteResponse(BaseModel):
    id: int
    name: str
    api_key: str
    location: Optional[str]
    is_active: bool
    amc_expiry: Optional[datetime] = None
    last_sync: Optional[datetime] = None

    class Config:
        from_attributes = True

class LatestTelemetryPoint(BaseModel):
    tag_name: str
    name: str
    unit: Optional[str] = None
    value: Optional[float] = None
    quality: str
    timestamp: datetime

    class Config:
        from_attributes = True
