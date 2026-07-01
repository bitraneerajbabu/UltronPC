"""UltrON — Pydantic Schemas for Parameter"""

from pydantic import BaseModel, Field, model_validator
from datetime import datetime
from typing import Optional
from app.models.parameter import RegisterType, DataType, ByteOrder, AlarmSeverity


class ParameterBase(BaseModel):
    device_id: int
    name: str = Field(..., max_length=120)
    tag_name: str = Field(..., max_length=60)
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

    # TCP Custom parsing
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
                "description", "unit", "min_valid", "max_valid", 
                "alarm_low_low", "alarm_low", "alarm_high", "alarm_high_high",
                "host", "port", "serial_port", "baud_rate", "data_bits", 
                "parity", "stop_bits", "slave_id", "parse_config"
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



class ParameterCreate(ParameterBase):
    pass


class ParameterUpdate(BaseModel):
    device_id: Optional[int] = None
    name: Optional[str] = None
    tag_name: Optional[str] = None
    description: Optional[str] = None
    unit: Optional[str] = None
    register_type: Optional[RegisterType] = None
    register_address: Optional[int] = None
    register_count: Optional[int] = None
    data_type: Optional[DataType] = None
    byte_order: Optional[ByteOrder] = None
    scale_factor: Optional[float] = None
    offset: Optional[float] = None
    min_valid: Optional[float] = None
    max_valid: Optional[float] = None
    alarm_low_low: Optional[float] = None
    alarm_low: Optional[float] = None
    alarm_high: Optional[float] = None
    alarm_high_high: Optional[float] = None
    alarm_severity: Optional[AlarmSeverity] = None
    alarm_enabled: Optional[bool] = None
    alarm_deadband: Optional[float] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None

    # TCP Custom parsing
    parse_method: Optional[str] = None
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
            fields = [
                "name", "tag_name", "description", "unit", "register_type", 
                "register_address", "register_count", "data_type", "byte_order", 
                "min_valid", "max_valid", 
                "alarm_low_low", "alarm_low", "alarm_high", "alarm_high_high", 
                "alarm_severity", "alarm_enabled", "alarm_deadband", "display_order", 
                "is_active", "host", "port", "serial_port", "baud_rate", 
                "data_bits", "parity", "stop_bits", "slave_id"
            ]
            for f in fields:
                if data.get(f) == "":
                    data[f] = None
            # Numeric fields with defaults: remove entirely when empty so DB default is preserved
            numeric_with_defaults = ["scale_factor", "offset", "register_count"]
            for f in numeric_with_defaults:
                if data.get(f) in ("", None):
                    data.pop(f, None)
        return data



class ParameterOut(ParameterBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
