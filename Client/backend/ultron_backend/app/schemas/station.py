"""UltrON — Pydantic Schemas for Station"""

from pydantic import BaseModel, Field, model_validator, field_validator
from datetime import datetime
from typing import Optional
from app.models.station import StationStatus, StationType


class StationBase(BaseModel):
    name: str = Field(..., max_length=120)
    station_type: StationType = StationType.AAQMS
    location: Optional[str] = None
    latitude: Optional[str] = None
    longitude: Optional[str] = None
    description: Optional[str] = None
    protocol: str = "modbus_tcp"
    host: Optional[str] = None
    port: Optional[int] = 502
    serial_port: Optional[str] = None
    baud_rate: Optional[int] = 9600
    is_active: bool = True

    @model_validator(mode="before")
    @classmethod
    def clean_empty_strings(cls, data):
        if isinstance(data, dict):
            nullable_fields = [
                "location", "latitude", "longitude", "description", 
                "host", "serial_port"
            ]
            for f in nullable_fields:
                if data.get(f) == "":
                    data[f] = None
            
            defaults = {
                "port": 502,
                "baud_rate": 9600
            }
            for f in defaults:
                if data.get(f) == "":
                    data.pop(f, None)
        return data



class StationCreate(StationBase):
    pass


class StationUpdate(BaseModel):
    name: Optional[str] = None
    station_type: Optional[StationType] = None
    location: Optional[str] = None
    latitude: Optional[str] = None
    longitude: Optional[str] = None
    description: Optional[str] = None
    protocol: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    serial_port: Optional[str] = None
    baud_rate: Optional[int] = None
    is_active: Optional[bool] = None

    @model_validator(mode="before")
    @classmethod
    def clean_empty_strings(cls, data):
        if isinstance(data, dict):
            fields = [
                "name", "station_type", "location", "latitude", "longitude", 
                "description", "protocol", "host", "port", "serial_port", 
                "baud_rate", "is_active"
            ]
            for f in fields:
                if data.get(f) == "":
                    data[f] = None
        return data



class StationOut(StationBase):
    id: int
    status: StationStatus = StationStatus.offline
    last_seen: Optional[datetime] = None
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @field_validator('status', mode='before')
    @classmethod
    def default_status(cls, v):
        return v if v is not None else StationStatus.offline
