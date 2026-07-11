"""UltrON — Server Config Schemas"""
from pydantic import BaseModel, field_validator
from typing import Optional, List, Dict, Literal

class ServerConfigBase(BaseModel):
    name: str
    protocol: str = "tspcb"          # "tspcb" | "cpcb" | "led"
    live_url: Optional[str] = None   # TSPCB: Live push URL (every 1 min)
    delay_url: Optional[str] = None  # TSPCB: Delay push URL (every 15 min)
    cpcb_file_path: Optional[str] = None  # CPCB: Output CSV file path
    is_active: bool = True
    is_cpcb_active: bool = True

    led_station_name: Optional[str] = None        # Station label on the LED board

    @field_validator("protocol")
    @classmethod
    def validate_protocol(cls, v):
        allowed = {"tspcb", "cpcb", "both", "led"}
        if v not in allowed:
            raise ValueError(f"protocol must be one of {allowed}")
        return v

class ServerConfigCreate(ServerConfigBase):
    pass

class ServerConfigUpdate(ServerConfigBase):
    name: Optional[str] = None

class ServerConfigResponse(ServerConfigBase):
    id: int

    class Config:
        from_attributes = True

class ServerMappingBase(BaseModel):
    server_id: int
    is_active: bool = True
    api_id: Optional[str] = None        # TGPCB: DeviceID  | CPCB: Station name in file
    api_name: Optional[str] = None      # TGPCB: API-Name  | CPCB: (not used)
    api_password: Optional[str] = None  # TGPCB: Password  | CPCB: (not used)
    api_vname: Optional[str] = None     # TGPCB: VarName   | CPCB: Param abbreviation (CO, SO2…)
    api_unit: Optional[str] = None      # Unit override
    cpcb_station_name: Optional[str] = None
    cpcb_parameter: Optional[str] = None

    # LED Board (LAN)
    led_channel_name: Optional[str] = None  # Label on LED display (e.g. "NOX", "PM10")
    led_unit: Optional[str] = None          # Unit override for LED display

class ServerMappingUpdate(ServerMappingBase):
    pass

class ServerMappingResponse(ServerMappingBase):
    id: int
    parameter_id: int

    class Config:
        from_attributes = True

class ParameterMappingResponse(BaseModel):
    parameter_id: int
    parameter_name: str
    station_name: str
    channel_no: int
    mappings: Dict[int, ServerMappingBase]  # server_id → mapping fields

class BulkMappingUpdate(BaseModel):
    parameter_id: int
    mappings: Dict[int, ServerMappingBase]  # server_id → mapping update
