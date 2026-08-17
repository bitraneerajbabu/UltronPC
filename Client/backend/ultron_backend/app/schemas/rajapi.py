"""UltrON — RajAPI Sync Config Schemas"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class RajAPIStationConfigSchema(BaseModel):
    station_id: int
    station_name: Optional[str] = None
    enabled: bool = True
    custom_station_id: Optional[str] = None
    username: Optional[str] = None


class RajAPIConfigSchema(BaseModel):
    id: int
    auth_token: str
    is_enabled: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    stations: List[RajAPIStationConfigSchema] = []

    class Config:
        from_attributes = True


class RajAPIConfigUpdate(BaseModel):
    auth_token: Optional[str] = None
    is_enabled: Optional[bool] = None


class RajAPIStationBulkUpdate(BaseModel):
    stations: List[RajAPIStationConfigSchema]


class RajAPITestResult(BaseModel):
    success: bool
    status_code: int
    message: str
