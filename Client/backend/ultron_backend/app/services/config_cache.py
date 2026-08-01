"""
UltrON — Configuration Cache Service (config_cache.py)

In-memory cache for all Device and Parameter configurations.
Initialized at startup; updated on single-device edit events.

Eliminates repeated database queries during normal 24x7 polling cycles.
"""

import asyncio
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.logger import get_logger
from app.database import AsyncSessionLocal
from app.models.device import Device, DeviceProtocol
from app.models.parameter import Parameter
from app.models.station import Station

log = get_logger("ultron.config_cache")


@dataclass
class CachedParameterSpec:
    id: int
    tag_name: str
    register_address: int
    register_count: int
    register_type: str
    data_type: str
    byte_order: str
    scale_factor: float
    offset: float
    min_valid: Optional[float]
    max_valid: Optional[float]
    host: Optional[str]
    port: Optional[int]
    serial_port: Optional[str]
    baud_rate: Optional[int]
    data_bits: Optional[int]
    parity: Optional[str]
    stop_bits: Optional[int]
    slave_id: Optional[int]
    parse_method: str
    parse_config: Optional[str]
    alarm_high: Optional[float]
    alarm_low: Optional[float]
    alarm_enabled: bool
    unit: str
    is_active: bool

    def to_dict(self) -> dict:
        """Return dict matching polling engine param_dicts shape."""
        return {
            "id":               self.id,
            "tag_name":         self.tag_name,
            "register_address": self.register_address,
            "register_count":   self.register_count,
            "register_type":    self.register_type,
            "data_type":        self.data_type,
            "byte_order":       self.byte_order,
            "scale_factor":     self.scale_factor,
            "offset":           self.offset,
            "min_valid":        self.min_valid,
            "max_valid":        self.max_valid,
            "host":             self.host,
            "port":             self.port,
            "serial_port":      self.serial_port,
            "baud_rate":        self.baud_rate,
            "data_bits":        self.data_bits,
            "parity":           self.parity,
            "stop_bits":        self.stop_bits,
            "slave_id":         self.slave_id,
            "parse_method":     self.parse_method,
            "parse_config":     self.parse_config,
            "alarm_high":       self.alarm_high,
            "alarm_low":        self.alarm_low,
            "alarm_enabled":    self.alarm_enabled,
            "unit":             self.unit,
            "is_active":        self.is_active,
        }


@dataclass
class CachedDeviceSpec:
    id: int
    name: str
    protocol: str
    station_id: Optional[int]
    station_name: str
    serial_port: Optional[str]
    baud_rate: Optional[int]
    data_bits: Optional[int]
    parity: Optional[str]
    stop_bits: Optional[int]
    slave_id: Optional[int]
    host: Optional[str]
    port: Optional[int]
    command_format: Optional[str]
    request_command: Optional[str]
    response_delimiter: Optional[str]
    request_hex: Optional[str]
    csv_path: Optional[str]
    csv_folder: Optional[str]
    csv_filename_pattern: Optional[str]
    csv_delimiter: Optional[str]
    csv_timestamp_col: Optional[int]
    poll_interval: int
    timeout: int
    retry_count: int
    is_active: bool
    parameters: List[CachedParameterSpec] = field(default_factory=list)
    config_version: int = 1

    @property
    def case_protocol(self) -> str:
        proto = self.protocol
        if hasattr(proto, "value"):
            proto = proto.value
        proto_str = str(proto)
        return proto_str.split(".")[-1] if "." in proto_str else proto_str


class ConfigurationCache:
    """
    Singleton configuration cache.
    Thread-safe in-memory cache for all devices & active parameters.
    """

    def __init__(self):
        self._devices: Dict[int, CachedDeviceSpec] = {}
        self._lock = asyncio.Lock()

    def _convert_param(self, p: Parameter) -> CachedParameterSpec:
        def _str_val(v):
            return v.value if hasattr(v, "value") else (str(v) if v is not None else "")

        return CachedParameterSpec(
            id=p.id,
            tag_name=p.tag_name or "",
            register_address=p.register_address or 0,
            register_count=p.register_count or 1,
            register_type=_str_val(p.register_type),
            data_type=_str_val(p.data_type),
            byte_order=_str_val(p.byte_order),
            scale_factor=p.scale_factor if p.scale_factor is not None else 1.0,
            offset=p.offset if p.offset is not None else 0.0,
            min_valid=p.min_valid,
            max_valid=p.max_valid,
            host=p.host,
            port=p.port,
            serial_port=p.serial_port,
            baud_rate=p.baud_rate,
            data_bits=p.data_bits,
            parity=p.parity,
            stop_bits=p.stop_bits,
            slave_id=p.slave_id,
            parse_method=p.parse_method or "csv_col",
            parse_config=p.parse_config,
            alarm_high=p.alarm_high,
            alarm_low=p.alarm_low,
            alarm_enabled=bool(p.alarm_enabled),
            unit=p.unit or "",
            is_active=bool(p.is_active),
        )

    def _convert_device(self, d: Device, station_name: str = "") -> CachedDeviceSpec:
        proto = d.protocol.value if hasattr(d.protocol, "value") else str(d.protocol)
        if isinstance(proto, str) and "." in proto:
            proto = proto.split(".")[-1]

        active_params = [self._convert_param(p) for p in (d.parameters or []) if p.is_active]

        return CachedDeviceSpec(
            id=d.id,
            name=d.name or f"Device {d.id}",
            protocol=proto,
            station_id=d.station_id,
            station_name=station_name,
            serial_port=d.serial_port,
            baud_rate=d.baud_rate or 9600,
            data_bits=d.data_bits or 8,
            parity=d.parity or "N",
            stop_bits=d.stop_bits or 1,
            slave_id=d.slave_id or 1,
            host=d.host,
            port=d.port,
            command_format=d.command_format or "ascii",
            request_command=d.request_command or "",
            response_delimiter=d.response_delimiter or "newline",
            request_hex=d.request_hex,
            csv_path=d.csv_path,
            csv_folder=d.csv_folder,
            csv_filename_pattern=d.csv_filename_pattern or "{YYYYMMDD}.csv",
            csv_delimiter=d.csv_delimiter or ",",
            csv_timestamp_col=d.csv_timestamp_col if d.csv_timestamp_col is not None else 0,
            poll_interval=d.poll_interval or 5,
            timeout=d.timeout or 5,
            retry_count=d.retry_count or 3,
            is_active=bool(d.is_active),
            parameters=active_params,
        )

    async def load_all(self) -> None:
        """Load all active devices & parameters from database into memory."""
        async with self._lock:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Device)
                    .where(Device.is_active == True)
                    .options(selectinload(Device.parameters), selectinload(Device.station))
                )
                devices = result.scalars().all()

                new_cache: Dict[int, CachedDeviceSpec] = {}
                for d in devices:
                    st_name = d.station.name if d.station else ""
                    new_cache[d.id] = self._convert_device(d, st_name)

                self._devices = new_cache
                log.info(f"ConfigCache loaded {len(self._devices)} active device(s)")

    async def reload_device(self, device_id: int) -> Optional[CachedDeviceSpec]:
        """Reload configuration for a single device atomically (e.g. after edit)."""
        async with self._lock:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Device)
                    .where(Device.id == device_id)
                    .options(selectinload(Device.parameters), selectinload(Device.station))
                )
                d = result.scalar_one_or_none()

                if not d or not d.is_active:
                    self._devices.pop(device_id, None)
                    log.info(f"ConfigCache: device {device_id} removed (inactive/deleted)")
                    return None

                st_name = d.station.name if d.station else ""
                old_spec = self._devices.get(device_id)
                old_ver = old_spec.config_version if old_spec else 0
                spec = self._convert_device(d, st_name)
                spec.config_version = old_ver + 1
                self._devices[device_id] = spec
                log.info(f"ConfigCache: device {device_id} reloaded (ver={spec.config_version}, {len(spec.parameters)} active params)")
                return spec

    def get_device(self, device_id: int) -> Optional[CachedDeviceSpec]:
        """Instant in-memory lookup — zero DB queries."""
        return self._devices.get(device_id)

    def get_all_devices(self) -> List[CachedDeviceSpec]:
        """Instant in-memory list — zero DB queries."""
        return list(self._devices.values())

    def clear(self) -> None:
        """Clear memory cache."""
        self._devices.clear()


# Global Singleton Instance
config_cache = ConfigurationCache()
