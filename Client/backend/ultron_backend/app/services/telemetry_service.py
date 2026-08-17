"""
UltrON — Telemetry Service Layer (telemetry_service.py)

Service layer abstraction insulating consumers from LiveCache internals.
Provides unified access methods for Dashboard, WebSocket, RajAPI, CPCB, Reports, REST API.
"""

from datetime import datetime
from typing import Dict, List, Optional, Any

from app.services.live_cache import (
    LiveCache,
    LivePointSpec,
    DeviceStateSpec,
    DeviceState,
    live_cache,
)
from app.core.logger import get_logger

log = get_logger("ultron.telemetry_service")


class TelemetryService:
    """
    Extensible Service Layer between LiveCache and external consumers.
    """

    def __init__(self, cache: LiveCache = live_cache):
        self._cache = cache

    def get_live_telemetry(self) -> List[dict]:
        """Return all live parameter points formatted for API/WebSocket."""
        return [p.to_dict() for p in self._cache.get_all_points()]

    def get_parameter_live(self, parameter_id: int) -> Optional[dict]:
        """Return a single parameter live point."""
        point = self._cache.get_point(parameter_id)
        return point.to_dict() if point else None

    def get_device_diagnostics(self) -> List[dict]:
        """Return diagnostic status for all devices."""
        return [d.to_dict() for d in self._cache.get_all_device_states()]

    def get_device_state(self, device_id: int) -> Optional[dict]:
        """Return diagnostic status for a specific device."""
        state = self._cache.get_device_state(device_id)
        return state.to_dict() if state else None

    def get_snapshot_for_historian(self) -> Dict[int, LivePointSpec]:
        """Return raw snapshot dictionary for Historian batch inserts."""
        return self._cache.get_snapshot()

    def record_reading(
        self,
        parameter_id: int,
        tag_name: str,
        station_name: str,
        device_name: str,
        device_id: int,
        value: Optional[float],
        raw_value: Optional[float],
        quality: str,
        unit: str,
        timestamp: Optional[datetime] = None,
    ) -> LivePointSpec:
        """Record a single telemetry reading from polling engine into LiveCache."""
        from app.services.time_sync import get_utc_now
        ts = timestamp or get_utc_now()
        point = LivePointSpec(
            parameter_id=parameter_id,
            tag_name=tag_name,
            station_name=station_name,
            device_name=device_name,
            device_id=device_id,
            value=value,
            raw_value=raw_value,
            quality=quality,
            unit=unit,
            timestamp=ts,
        )
        self._cache.update_point(point)
        return point

    def record_bulk_readings(self, points: List[LivePointSpec]) -> None:
        """Record multiple readings into LiveCache atomically."""
        self._cache.bulk_update_points(points)

    def set_device_state(
        self,
        device_id: int,
        state: DeviceState,
        device_name: str = "",
        last_poll: Optional[datetime] = None,
        last_error: Optional[str] = None,
        reset_errors: bool = False,
    ) -> DeviceStateSpec:
        """Update device SCADA state in LiveCache."""
        return self._cache.set_device_state(
            device_id=device_id,
            state=state,
            device_name=device_name,
            last_poll=last_poll,
            last_error=last_error,
            reset_errors=reset_errors,
        )


# Global Service Instance
telemetry_service = TelemetryService()
