"""
UltrON — Live Cache Service (live_cache.py)

Dedicated in-memory runtime single source of truth for telemetry and SCADA states.
Sub-millisecond access for Dashboard, WebSocket, RajAPI, CPCB, and Historian.

Replaces continuous LiveData SQLite table writes.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any
import threading

from app.core.logger import get_logger

log = get_logger("ultron.live_cache")


class DeviceState(str, Enum):
    """Rich 9-State Industrial SCADA Device State Model."""
    STOPPED      = "STOPPED"      # Disabled device or graceful system shutdown
    STARTING     = "STARTING"      # Task spawned, driver initializing
    CONNECTING   = "CONNECTING"    # Opening COM port or TCP socket
    ONLINE       = "ONLINE"        # Transport connected & ready
    READING      = "READING"       # Transmitting command / waiting for bytes
    WAITING      = "WAITING"       # Read complete, waiting for next tick
    ERROR        = "ERROR"         # Read timeout / corrupt frame / checksum fail
    RECONNECTING = "RECONNECTING"  # Exponential backoff reconnecting port
    OFFLINE      = "OFFLINE"       # Device disabled or non-responsive after max retries


@dataclass
class LivePointSpec:
    """Runtime telemetry snapshot per parameter."""
    parameter_id: int
    tag_name: str
    station_name: str
    device_name: str
    device_id: int
    value: Optional[float]
    raw_value: Optional[float]
    quality: str                  # "U", "O", "E", "N"
    unit: str
    timestamp: datetime

    def to_dict(self) -> dict:
        return {
            "parameter_id": self.parameter_id,
            "tag_name":     self.tag_name,
            "station_name": self.station_name,
            "device_name":  self.device_name,
            "device_id":    self.device_id,
            "value":        self.value,
            "raw_value":    self.raw_value,
            "quality":      self.quality,
            "unit":         self.unit,
            "timestamp":    self.timestamp.isoformat() if self.timestamp else None,
        }


@dataclass
class DeviceStateSpec:
    """Runtime SCADA status per device."""
    device_id: int
    device_name: str
    state: DeviceState
    last_poll: Optional[datetime] = None
    last_error: Optional[str] = None
    consecutive_errors: int = 0

    def to_dict(self) -> dict:
        return {
            "device_id":          self.device_id,
            "device_name":        self.device_name,
            "state":              self.state.value,
            "last_poll":          self.last_poll.isoformat() if self.last_poll else None,
            "last_error":         self.last_error,
            "consecutive_errors": self.consecutive_errors,
        }


class LiveCache:
    """
    Thread-safe in-memory Live Cache singleton.
    Stores latest parameter readings and SCADA device states.
    """

    def __init__(self):
        self._points: Dict[int, LivePointSpec] = {}
        self._device_states: Dict[int, DeviceStateSpec] = {}
        self._lock = threading.Lock()

    # ── Telemetry Points ──────────────────────────────────────────────────────

    def update_point(self, point: LivePointSpec) -> None:
        """Update or insert a single parameter point atomically."""
        with self._lock:
            self._points[point.parameter_id] = point

    def bulk_update_points(self, points: List[LivePointSpec]) -> None:
        """Update multiple parameter points atomically."""
        with self._lock:
            for p in points:
                self._points[p.parameter_id] = p

    def get_point(self, parameter_id: int) -> Optional[LivePointSpec]:
        """Get point by parameter ID."""
        with self._lock:
            return self._points.get(parameter_id)

    def get_all_points(self) -> List[LivePointSpec]:
        """Return list of all current live points."""
        with self._lock:
            return list(self._points.values())

    def get_snapshot(self) -> Dict[int, LivePointSpec]:
        """Return a copy dictionary snapshot for Historian batch writes."""
        with self._lock:
            return dict(self._points)

    # ── Device States ─────────────────────────────────────────────────────────

    def set_device_state(
        self,
        device_id: int,
        state: DeviceState,
        device_name: str = "",
        last_poll: Optional[datetime] = None,
        last_error: Optional[str] = None,
        reset_errors: bool = False,
    ) -> DeviceStateSpec:
        """Set device state and update error counters atomically."""
        with self._lock:
            current = self._device_states.get(device_id)
            d_name = device_name or (current.device_name if current else f"Device {device_id}")
            errors = 0 if reset_errors else (current.consecutive_errors if current else 0)
            if state == DeviceState.ERROR:
                errors += 1
            elif state == DeviceState.ONLINE:
                errors = 0

            poll_ts = last_poll or (current.last_poll if current else None)
            err_msg = last_error if last_error is not None else (current.last_error if current else None)

            spec = DeviceStateSpec(
                device_id=device_id,
                device_name=d_name,
                state=state,
                last_poll=poll_ts,
                last_error=err_msg,
                consecutive_errors=errors,
            )
            self._device_states[device_id] = spec
            return spec

    def get_device_state(self, device_id: int) -> Optional[DeviceStateSpec]:
        """Get device state by device ID."""
        with self._lock:
            return self._device_states.get(device_id)

    def get_all_device_states(self) -> List[DeviceStateSpec]:
        """Return list of all device states."""
        with self._lock:
            return list(self._device_states.values())

    def clear(self) -> None:
        """Clear memory cache."""
        with self._lock:
            self._points.clear()
            self._device_states.clear()


# Global Singleton Instance
live_cache = LiveCache()
