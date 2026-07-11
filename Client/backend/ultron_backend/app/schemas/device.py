"""UltrON — Pydantic Schemas for Device"""

from pydantic import BaseModel, Field, model_validator, field_validator
from datetime import datetime
from typing import Optional, List
from app.models.device import DeviceType, DeviceProtocol
from app.models.parameter import RegisterType, DataType, ByteOrder, AlarmSeverity
from app.schemas.parameter import ParameterOut


class ParameterCreateNested(BaseModel):
    id: Optional[int] = None
    name: str = Field(..., max_length=120)
    tag_name: Optional[str] = Field(None, max_length=60)
    description: Optional[str] = None
    unit: Optional[str] = None
    register_type: RegisterType = RegisterType.holding
    register_address: int
    register_count: int = 2
    data_type: DataType = DataType.float32
    byte_order: ByteOrder = ByteOrder.big
    scale_factor: float = 1.0
    offset: float = 0.0
    min_valid: Optional[float] = None
    max_valid: Optional[float] = None
    alarm_low_low: Optional[float] = None
    alarm_low: Optional[float] = None
    alarm_high: Optional[float] = None
    alarm_high_high: Optional[float] = None
    alarm_severity: AlarmSeverity = AlarmSeverity.warning
    alarm_enabled: bool = True
    alarm_deadband: float = 0.0
    display_order: int = 0
    is_active: bool = True
    parse_method: Optional[str] = "csv_col"
    parse_config: Optional[str] = None

    # Connection overrides
    host: Optional[str] = None
    port: Optional[int] = None
    serial_port: Optional[str] = None
    baud_rate: Optional[int] = None
    data_bits: Optional[int] = None
    parity: Optional[str] = None
    stop_bits: Optional[int] = None
    slave_id: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def clean_empty_strings(cls, data):
        if isinstance(data, dict):
            nullable_fields = [
                "id", "min_valid", "max_valid", "alarm_low_low", "alarm_low",
                "alarm_high", "alarm_high_high", "port", "baud_rate", "data_bits",
                "stop_bits", "slave_id", "host", "serial_port", "parity",
                "description", "unit"
            ]
            for f in nullable_fields:
                if data.get(f) == "":
                    data[f] = None
            
            defaults = {
                "register_count": 2,
                "scale_factor": 1.0,
                "offset": 0.0,
                "alarm_deadband": 0.0,
                "display_order": 0
            }
            for f in defaults:
                if data.get(f) == "":
                    data.pop(f, None)
        return data


class DeviceBase(BaseModel):
    station_id: Optional[int] = None
    station_name: Optional[str] = None
    name: str = Field(..., max_length=120)
    device_type: DeviceType = DeviceType.ANALYZER
    protocol: DeviceProtocol = DeviceProtocol.modbus_tcp
    host: Optional[str] = None
    port: Optional[int] = None
    slave_id: int = 1
    serial_port: Optional[str] = None
    baud_rate: Optional[int] = 9600
    data_bits: Optional[int] = 8
    parity: Optional[str] = "N"
    stop_bits: Optional[int] = 1
    csv_path: Optional[str] = None
    csv_folder: Optional[str] = None
    csv_filename_pattern: Optional[str] = None
    csv_delimiter: Optional[str] = ","
    csv_timestamp_col: Optional[int] = None
    request_hex: Optional[str] = None
    response_delimiter: Optional[str] = "newline"
    poll_interval: int = 5
    timeout: int = 5
    retry_count: int = 3
    is_active: bool = True

    @model_validator(mode="before")
    @classmethod
    def clean_empty_strings(cls, data):
        if isinstance(data, dict):
            nullable_fields = [
                "station_id", "host", "port", "serial_port", "csv_path",
                "csv_folder", "csv_filename_pattern", "csv_timestamp_col"
            ]
            for f in nullable_fields:
                if data.get(f) == "":
                    data[f] = None
            
            defaults = {
                "slave_id": 1,
                "baud_rate": 9600,
                "data_bits": 8,
                "stop_bits": 1,
                "poll_interval": 5,
                "timeout": 5,
                "retry_count": 3
            }
            for f in defaults:
                if data.get(f) == "":
                    data.pop(f, None)
        return data


class DeviceCreate(DeviceBase):
    parameters: Optional[List[ParameterCreateNested]] = None


class DeviceUpdate(BaseModel):
    station_id: Optional[int] = None
    station_name: Optional[str] = None
    name: Optional[str] = None
    device_type: Optional[DeviceType] = None
    protocol: Optional[DeviceProtocol] = None
    host: Optional[str] = None
    port: Optional[int] = None
    slave_id: Optional[int] = None
    serial_port: Optional[str] = None
    baud_rate: Optional[int] = None
    data_bits: Optional[int] = None
    parity: Optional[str] = None
    stop_bits: Optional[int] = None
    poll_interval: Optional[int] = None
    timeout: Optional[int] = None
    retry_count: Optional[int] = None
    is_active: Optional[bool] = None
    csv_path: Optional[str] = None
    csv_folder: Optional[str] = None
    csv_filename_pattern: Optional[str] = None
    csv_delimiter: Optional[str] = None
    csv_timestamp_col: Optional[int] = None
    request_hex: Optional[str] = None
    response_delimiter: Optional[str] = None
    parameters: Optional[List[ParameterCreateNested]] = None

    @model_validator(mode="before")
    @classmethod
    def clean_empty_strings(cls, data):
        if isinstance(data, dict):
            fields = [
                "station_id", "host", "port", "slave_id", "serial_port",
                "baud_rate", "data_bits", "stop_bits", "csv_path", "csv_folder",
                "csv_filename_pattern", "csv_delimiter", "csv_timestamp_col",
                "poll_interval", "timeout", "retry_count", "request_hex"
            ]
            for f in fields:
                if data.get(f) == "":
                    data[f] = None
        return data


class DeviceOut(DeviceBase):
    id: int
    status: str = "offline"
    last_poll: Optional[datetime] = None
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    parameters: Optional[List[ParameterOut]] = None

    class Config:
        from_attributes = True

    @field_validator('status', mode='before')
    @classmethod
    def default_status(cls, v):
        return v if v is not None else "offline"
