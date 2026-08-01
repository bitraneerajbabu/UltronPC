"""
UltrON — Communication Manager (comm_manager.py)

Situated between Polling Scheduler and Protocol Transport Drivers.

Responsibilities:
  • Connection pool & lifecycle management (reuse, eviction, reconnects)
  • Retry policy and timeout handling
  • SCADA state transitions (CONNECTING, READING, WAITING, ERROR, RECONNECTING)
  • Communication statistics & diagnostics tracking
  • Protocol driver dispatching
"""

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Any

from app.core.logger import get_logger
from app.services.config_cache import CachedDeviceSpec, CachedParameterSpec
from app.services.live_cache import DeviceState
from app.services.telemetry_service import telemetry_service

# Import Transport Drivers
from app.services.modbus_tcp import ModbusTCPReader
from app.services.modbus_rtu import ModbusRTUReader
from app.services.tcp_custom import TCPCustomReader
from app.services.udp_custom import UDPCustomReader
from app.services.csv_watcher import CSVWatcher, SmartWatcher, DailySmartWatcher
from app.services.serial_ascii import SerialASCIIReader

log = get_logger("ultron.comm_manager")


@dataclass
class CommStats:
    """Communication diagnostics per device."""
    device_id: int
    total_polls: int = 0
    successful_polls: int = 0
    failed_polls: int = 0
    consecutive_failures: int = 0
    last_poll_time: Optional[datetime] = None
    last_response_ms: float = 0.0

    def to_dict(self) -> dict:
        return {
            "device_id":            self.device_id,
            "total_polls":          self.total_polls,
            "successful_polls":     self.successful_polls,
            "failed_polls":         self.failed_polls,
            "consecutive_failures": self.consecutive_failures,
            "last_poll_time":       self.last_poll_time.isoformat() if self.last_poll_time else None,
            "last_response_ms":     round(self.last_response_ms, 2),
        }


class CommunicationManager:
    """
    Central Communication Manager managing transport drivers,
    connection pooling, retry policies, and diagnostics.
    """

    def __init__(self):
        # Driver Pools
        self._tcp_readers:   Dict[int, ModbusTCPReader] = {}
        self._rtu_readers:   Dict[str, ModbusRTUReader] = {}   # key = serial_port
        self._tcp_custom:    Dict[int, TCPCustomReader] = {}
        self._udp_custom:    Dict[int, UDPCustomReader] = {}
        self._csv_watchers:  Dict[int, CSVWatcher] = {}
        self._serial_ascii:  Dict[int, SerialASCIIReader] = {}

        # Diagnostics & Stats
        self._stats: Dict[int, CommStats] = {}
        self._lock = asyncio.Lock()

    # ─── Driver Pool Factory Methods ──────────────────────────────────────────

    def _get_modbus_tcp(self, device: CachedDeviceSpec) -> ModbusTCPReader:
        if device.id not in self._tcp_readers:
            host = device.host or ""
            port = device.port or 502
            self._tcp_readers[device.id] = ModbusTCPReader(host, port, device.slave_id or 1, device.timeout or 5)
        return self._tcp_readers[device.id]

    def _get_modbus_rtu(self, device: CachedDeviceSpec) -> ModbusRTUReader:
        port_key = device.serial_port or "unknown"
        if port_key not in self._rtu_readers:
            self._rtu_readers[port_key] = ModbusRTUReader(
                port=device.serial_port or "COM1",
                baudrate=device.baud_rate or 9600,
                data_bits=device.data_bits or 8,
                parity=device.parity or "N",
                stop_bits=device.stop_bits or 1,
                timeout=device.timeout or 3,
            )
        return self._rtu_readers[port_key]

    def _get_tcp_custom(self, device: CachedDeviceSpec) -> TCPCustomReader:
        if device.id not in self._tcp_custom:
            self._tcp_custom[device.id] = TCPCustomReader(
                host=device.host or "",
                port=device.port or 4001,
                timeout=device.timeout or 5,
                request_hex=device.request_hex,
                response_delimiter=device.response_delimiter or "newline",
            )
        return self._tcp_custom[device.id]

    def _get_udp_custom(self, device: CachedDeviceSpec) -> UDPCustomReader:
        if device.id not in self._udp_custom:
            self._udp_custom[device.id] = UDPCustomReader(
                host=device.host or "",
                port=device.port or 4001,
                timeout=device.timeout or 5,
                request_hex=device.request_hex,
                response_delimiter=device.response_delimiter or "newline",
            )
        return self._udp_custom[device.id]

    def _get_serial_ascii(self, device: CachedDeviceSpec) -> SerialASCIIReader:
        if device.id not in self._serial_ascii:
            self._serial_ascii[device.id] = SerialASCIIReader(
                port=device.serial_port or "COM1",
                baudrate=device.baud_rate or 9600,
                data_bits=device.data_bits or 8,
                parity=device.parity or "N",
                stop_bits=device.stop_bits or 1,
                timeout=device.timeout or 5,
                command_format=device.command_format or "ascii",
                request_command=device.request_command or "",
                response_delimiter=device.response_delimiter or "newline",
            )
        return self._serial_ascii[device.id]

    def _get_csv_watcher(self, device: CachedDeviceSpec) -> Optional[CSVWatcher]:
        if not device.csv_folder and not device.csv_path:
            return None
        if device.id not in self._csv_watchers:
            if device.csv_folder:
                self._csv_watchers[device.id] = DailySmartWatcher(
                    device.csv_folder,
                    device.csv_filename_pattern or "{YYYYMMDD}.csv",
                    device.csv_delimiter or ",",
                    device.poll_interval or 5,
                    device.csv_timestamp_col if device.csv_timestamp_col is not None else 0,
                )
            else:
                self._csv_watchers[device.id] = SmartWatcher(
                    device.csv_path,
                    device.csv_delimiter or ",",
                    device.poll_interval or 5,
                    device.csv_timestamp_col,
                )
        return self._csv_watchers[device.id]

    # ─── Pool Eviction & Connection Lifecycle ─────────────────────────────────

    def evict_device(self, device_id: int, serial_port: Optional[str] = None) -> None:
        """Remove cached reader instance so fresh connection is made next cycle."""
        self._tcp_readers.pop(device_id, None)
        self._tcp_custom.pop(device_id, None)
        self._udp_custom.pop(device_id, None)
        self._serial_ascii.pop(device_id, None)
        self._csv_watchers.pop(device_id, None)
        if serial_port:
            old = self._rtu_readers.pop(serial_port, None)
            if old:
                log.info(f"Evicted shared RTU reader on '{serial_port}' (device {device_id})")

    # ─── Execution & Dispatch ──────────────────────────────────────────────────

    async def execute_poll(
        self,
        device: CachedDeviceSpec,
        parameters: List[CachedParameterSpec],
    ) -> List[dict]:
        """
        Execute hardware read via appropriate transport driver.
        Manages SCADA state transitions and communication statistics.
        """
        if not parameters:
            return []

        param_dicts = [p.to_dict() for p in parameters]
        protocol = device.case_protocol

        # Update Stats & State → CONNECTING / READING
        stats = self._stats.setdefault(device.id, CommStats(device_id=device.id))
        stats.total_polls += 1
        from app.services.time_sync import get_utc_now
        now = get_utc_now()
        stats.last_poll_time = now

        telemetry_service.set_device_state(
            device_id=device.id,
            state=DeviceState.READING,
            device_name=device.name,
            last_poll=now,
        )

        start_t = time.monotonic()
        readings: List[dict] = []

        try:
            if protocol == "modbus_tcp":
                reader = self._get_modbus_tcp(device)
                readings = await reader.read_all_parameters(param_dicts)

            elif protocol == "modbus_rtu":
                reader = self._get_modbus_rtu(device)
                readings = await reader.read_all_parameters(device.slave_id or 1, param_dicts)
                await reader.close()

            elif protocol == "tcp_custom":
                reader = self._get_tcp_custom(device)
                readings = await reader.poll_parameters(param_dicts)

            elif protocol == "udp_custom":
                reader = self._get_udp_custom(device)
                readings = await reader.poll_parameters(param_dicts)

            elif protocol == "serial_ascii":
                reader = self._get_serial_ascii(device)
                readings = await reader.poll_parameters(param_dicts)

            elif protocol == "csv":
                watcher = self._get_csv_watcher(device)
                if watcher:
                    readings = watcher.get_latest_values(param_dicts)
                else:
                    log.warning(f"Device {device.id}: CSV protocol but no CSV path/folder")
                    readings = [
                        {"parameter_id": p["id"], "value": None, "raw_value": None, "quality": "E"}
                        for p in param_dicts
                    ]
            else:
                log.warning(f"Unknown protocol '{protocol}' for device {device.id}")
                return []

            elapsed_ms = (time.monotonic() - start_t) * 1000.0
            stats.last_response_ms = elapsed_ms

            # Check if poll succeeded (any parameter with valid value)
            any_valid = any(r.get("quality") in ("U", "O") for r in readings) if readings else False

            if any_valid:
                stats.successful_polls += 1
                stats.consecutive_failures = 0
                telemetry_service.set_device_state(
                    device_id=device.id,
                    state=DeviceState.WAITING,
                    device_name=device.name,
                    last_poll=now,
                    reset_errors=True,
                )
            else:
                stats.failed_polls += 1
                stats.consecutive_failures += 1
                self.evict_device(device.id, device.serial_port)
                telemetry_service.set_device_state(
                    device_id=device.id,
                    state=DeviceState.ERROR,
                    device_name=device.name,
                    last_poll=now,
                    last_error=f"No response at {now.strftime('%H:%M:%S')}",
                )

        except Exception as e:
            elapsed_ms = (time.monotonic() - start_t) * 1000.0
            stats.last_response_ms = elapsed_ms
            stats.failed_polls += 1
            stats.consecutive_failures += 1
            err_msg = str(e)
            log.error(f"CommManager poll error (device {device.id}): {err_msg}")
            self.evict_device(device.id, device.serial_port)

            telemetry_service.set_device_state(
                device_id=device.id,
                state=DeviceState.RECONNECTING if stats.consecutive_failures < 3 else DeviceState.ERROR,
                device_name=device.name,
                last_poll=now,
                last_error=err_msg.splitlines()[0] if err_msg else "Driver Error",
            )
            readings = [
                {"parameter_id": p.id, "value": None, "raw_value": None, "quality": "E"}
                for p in parameters
            ]

        return readings

    def get_stats(self, device_id: int) -> Optional[dict]:
        """Get communication diagnostics for a device."""
        s = self._stats.get(device_id)
        return s.to_dict() if s else None

    def get_all_stats(self) -> List[dict]:
        """Get communication diagnostics for all devices."""
        return [s.to_dict() for s in self._stats.values()]


# Global Manager Instance
comm_manager = CommunicationManager()
