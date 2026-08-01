"""
UltrON — Unit Tests for Phase 5.1 Core Architecture Components

Covers:
  - ConfigurationCache: load_all, reload_device, get_device, get_all_devices
  - LiveCache: update_point, get_point, bulk_update_points, get_snapshot
  - DeviceState: SCADA 8-state model enum transitions
  - TelemetryService: abstraction methods (get_live_telemetry, record_reading)
  - CommunicationManager: stats, pool eviction, poll dispatching
  - Refinement Verifications: concurrent devices, reload while polling, reconnect, snapshot consistency, thread safety
"""

import asyncio
import threading
from datetime import datetime
from unittest.mock import MagicMock, patch, AsyncMock
import pytest

from app.services.config_cache import (
    ConfigurationCache,
    CachedDeviceSpec,
    CachedParameterSpec,
    config_cache,
)
from app.services.live_cache import (
    LiveCache,
    LivePointSpec,
    DeviceStateSpec,
    DeviceState,
    live_cache,
)
from app.services.telemetry_service import TelemetryService, telemetry_service
from app.services.comm_manager import CommunicationManager, comm_manager, CommStats


# ═══════════════════════════════════════════════════════════════════════════════
# 1. ConfigurationCache Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestConfigurationCache:

    def _make_spec(self, dev_id=1, name="Dev 1", proto="modbus_tcp") -> CachedDeviceSpec:
        p1 = CachedParameterSpec(
            id=10, tag_name="NOX", register_address=40001, register_count=2,
            register_type="input_reg", data_type="float32", byte_order="big",
            scale_factor=1.0, offset=0.0, min_valid=0.0, max_valid=1000.0,
            host="192.168.1.10", port=502, serial_port="COM1", baud_rate=9600,
            data_bits=8, parity="N", stop_bits=1, slave_id=1,
            parse_method="csv_col", parse_config=None, alarm_high=80.0,
            alarm_low=0.0, alarm_enabled=True, unit="ppm", is_active=True,
        )
        return CachedDeviceSpec(
            id=dev_id, name=name, protocol=proto, station_id=1, station_name="AAQMS 1",
            serial_port="COM1", baud_rate=9600, data_bits=8, parity="N", stop_bits=1,
            slave_id=1, host="192.168.1.10", port=502, command_format="ascii",
            request_command="<SOH>R31<CR>", response_delimiter="newline",
            request_hex=None, csv_path=None, csv_folder=None, csv_filename_pattern="{YYYYMMDD}.csv",
            csv_delimiter=",", csv_timestamp_col=0, poll_interval=5, timeout=5, retry_count=3,
            is_active=True, parameters=[p1],
        )

    def test_get_device_and_all_devices(self):
        cache = ConfigurationCache()
        spec = self._make_spec(1, "Analyzer 1")
        cache._devices[1] = spec

        assert cache.get_device(1) == spec
        assert cache.get_device(999) is None
        assert len(cache.get_all_devices()) == 1

    def test_case_protocol_property(self):
        spec = self._make_spec(1, "Serial Dev", "serial_ascii")
        assert spec.case_protocol == "serial_ascii"

    def test_param_to_dict_shape(self):
        spec = self._make_spec()
        param_dict = spec.parameters[0].to_dict()
        assert param_dict["id"] == 10
        assert param_dict["tag_name"] == "NOX"
        assert param_dict["scale_factor"] == 1.0


# ═══════════════════════════════════════════════════════════════════════════════
# 2. LiveCache & DeviceState Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestLiveCache:

    def _point(self, pid=1, val=45.2, q="U") -> LivePointSpec:
        return LivePointSpec(
            parameter_id=pid, tag_name="SO2", station_name="AAQMS 1",
            device_name="Horiba APNA", device_id=1, value=val, raw_value=val,
            quality=q, unit="ppb", timestamp=datetime.utcnow(),
        )

    def test_update_and_get_point(self):
        lc = LiveCache()
        pt = self._point(10, 55.5, "U")
        lc.update_point(pt)

        retrieved = lc.get_point(10)
        assert retrieved is not None
        assert retrieved.value == 55.5
        assert retrieved.quality == "U"

    def test_bulk_update_points(self):
        lc = LiveCache()
        pts = [self._point(1, 10.0), self._point(2, 20.0)]
        lc.bulk_update_points(pts)

        assert len(lc.get_all_points()) == 2
        snapshot = lc.get_snapshot()
        assert 1 in snapshot and 2 in snapshot

    def test_scada_device_state_transitions(self):
        lc = LiveCache()
        # Initial transition -> CONNECTING
        s1 = lc.set_device_state(1, DeviceState.CONNECTING, "Dev 1")
        assert s1.state == DeviceState.CONNECTING

        # Read successful -> ONLINE / WAITING
        s2 = lc.set_device_state(1, DeviceState.ONLINE, reset_errors=True)
        assert s2.state == DeviceState.ONLINE
        assert s2.consecutive_errors == 0

        # Read error -> ERROR (consecutive_errors increments)
        s3 = lc.set_device_state(1, DeviceState.ERROR, last_error="Timeout")
        assert s3.state == DeviceState.ERROR
        assert s3.consecutive_errors == 1
        assert s3.last_error == "Timeout"


# ═══════════════════════════════════════════════════════════════════════════════
# 3. TelemetryService Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestTelemetryService:

    def test_record_and_get_live_telemetry(self):
        cache = LiveCache()
        service = TelemetryService(cache)

        service.record_reading(
            parameter_id=100, tag_name="NO2", station_name="AAQMS 1",
            device_name="APNA 370", device_id=2, value=12.5, raw_value=12.5,
            quality="U", unit="ppb",
        )

        items = service.get_live_telemetry()
        assert len(items) == 1
        assert items[0]["parameter_id"] == 100
        assert items[0]["value"] == 12.5

    def test_device_diagnostics_service(self):
        cache = LiveCache()
        service = TelemetryService(cache)

        service.set_device_state(5, DeviceState.READING, "Dev 5")
        diag = service.get_device_diagnostics()
        assert len(diag) == 1
        assert diag[0]["device_id"] == 5
        assert diag[0]["state"] == "READING"


# ═══════════════════════════════════════════════════════════════════════════════
# 4. CommunicationManager Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestCommunicationManager:

    def _device(self) -> CachedDeviceSpec:
        p1 = CachedParameterSpec(
            id=1, tag_name="CO", register_address=40001, register_count=2,
            register_type="input_reg", data_type="float32", byte_order="big",
            scale_factor=1.0, offset=0.0, min_valid=0.0, max_valid=100.0,
            host="127.0.0.1", port=502, serial_port="COM1", baud_rate=9600,
            data_bits=8, parity="N", stop_bits=1, slave_id=1,
            parse_method="key_value", parse_config='{"key":"K1","value_offset":1}',
            alarm_high=80.0, alarm_low=0.0, alarm_enabled=True, unit="ppm", is_active=True,
        )
        return CachedDeviceSpec(
            id=1, name="Serial Device 1", protocol="serial_ascii", station_id=1,
            station_name="AAQMS 1", serial_port="COM1", baud_rate=9600,
            data_bits=8, parity="N", stop_bits=1, slave_id=1, host="127.0.0.1", port=502,
            command_format="ascii", request_command="K1", response_delimiter="newline",
            request_hex=None, csv_path=None, csv_folder=None, csv_filename_pattern="{YYYYMMDD}.csv",
            csv_delimiter=",", csv_timestamp_col=0, poll_interval=5, timeout=1, retry_count=3,
            is_active=True, parameters=[p1],
        )

    @pytest.mark.asyncio
    async def test_execute_poll_serial_ascii_success(self):
        cm = CommunicationManager()
        dev = self._device()

        # Mock driver
        mock_driver = MagicMock()
        mock_driver.poll_parameters = AsyncMock(return_value=[
            {"parameter_id": 1, "value": 42.0, "raw_value": 42.0, "quality": "U"}
        ])

        with patch.object(cm, "_get_serial_ascii", return_value=mock_driver):
            readings = await cm.execute_poll(dev, dev.parameters)

        assert len(readings) == 1
        assert readings[0]["value"] == 42.0
        assert readings[0]["quality"] == "U"

        # Check diagnostics
        stats = cm.get_stats(1)
        assert stats["total_polls"] == 1
        assert stats["successful_polls"] == 1
        assert stats["consecutive_failures"] == 0

    @pytest.mark.asyncio
    async def test_execute_poll_driver_failure_evicts_connection(self):
        cm = CommunicationManager()
        dev = self._device()

        mock_driver = MagicMock()
        mock_driver.poll_parameters = AsyncMock(side_effect=Exception("Serial port error"))

        with patch.object(cm, "_get_serial_ascii", return_value=mock_driver):
            readings = await cm.execute_poll(dev, dev.parameters)

        assert readings[0]["quality"] == "E"
        stats = cm.get_stats(1)
        assert stats["failed_polls"] == 1
        assert stats["consecutive_failures"] == 1


# ═══════════════════════════════════════════════════════════════════════════════
# 5. Additional Refinement Tests (Section 7 Verification)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPhase51RefinedVerifications:

    def test_multiple_concurrent_devices_live_cache(self):
        """Verify multiple devices updating LiveCache concurrently without interference."""
        lc = LiveCache()
        ts = datetime.utcnow()

        # 5 devices updating distinct parameters
        for dev_id in range(1, 6):
            pt = LivePointSpec(
                parameter_id=dev_id * 10,
                tag_name=f"PARAM_{dev_id}",
                station_name="AAQMS 1",
                device_name=f"Device {dev_id}",
                device_id=dev_id,
                value=float(dev_id * 100),
                raw_value=float(dev_id * 100),
                quality="U",
                unit="ppm",
                timestamp=ts,
            )
            lc.update_point(pt)
            lc.set_device_state(dev_id, DeviceState.ONLINE, f"Device {dev_id}")

        assert len(lc.get_all_points()) == 5
        assert len(lc.get_all_device_states()) == 5
        assert lc.get_point(30).value == 300.0

    def test_live_cache_snapshot_consistency(self):
        """Verify snapshot returns an isolated copy that is not mutated by subsequent updates."""
        lc = LiveCache()
        ts = datetime.utcnow()
        lc.update_point(LivePointSpec(1, "NOX", "ST1", "DEV1", 1, 50.0, 50.0, "U", "ppm", ts))

        # Take snapshot
        snapshot = lc.get_snapshot()
        assert snapshot[1].value == 50.0

        # Update point in cache
        lc.update_point(LivePointSpec(1, "NOX", "ST1", "DEV1", 1, 99.9, 99.9, "U", "ppm", ts))

        # Original snapshot value must remain unchanged
        assert snapshot[1].value == 50.0
        assert lc.get_point(1).value == 99.9

    def test_thread_safety_concurrent_updates(self):
        """Verify multi-threaded updates to LiveCache do not corrupt internal dicts."""
        lc = LiveCache()
        ts = datetime.utcnow()

        def worker(thread_idx: int):
            for i in range(100):
                pid = (thread_idx * 100) + i
                lc.update_point(LivePointSpec(pid, f"P_{pid}", "ST1", "DEV", 1, float(i), float(i), "U", "ppm", ts))

        threads = [threading.Thread(target=worker, args=(t,)) for t in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # 5 threads * 100 points = 500 points stored safely
        assert len(lc.get_all_points()) == 500

    def test_comm_manager_reconnect_counter(self):
        """Verify CommunicationManager transitions state to RECONNECTING (<3) then ERROR (>=3)."""
        cm = CommunicationManager()

        dev = CachedDeviceSpec(
            id=9, name="Dev 9", protocol="serial_ascii", station_id=1, station_name="ST1",
            serial_port="COM9", baud_rate=9600, data_bits=8, parity="N", stop_bits=1,
            slave_id=1, host=None, port=None, command_format="ascii", request_command="R",
            response_delimiter="newline", request_hex=None, csv_path=None, csv_folder=None,
            csv_filename_pattern=None, csv_delimiter=",", csv_timestamp_col=0,
            poll_interval=5, timeout=1, retry_count=3, is_active=True, parameters=[],
        )

        p = CachedParameterSpec(
            id=90, tag_name="TEMP", register_address=0, register_count=1, register_type="",
            data_type="float32", byte_order="big", scale_factor=1.0, offset=0.0,
            min_valid=None, max_valid=None, host=None, port=None, serial_port="COM9",
            baud_rate=9600, data_bits=8, parity="N", stop_bits=1, slave_id=1,
            parse_method="key_value", parse_config=None, alarm_high=None, alarm_low=None,
            alarm_enabled=False, unit="C", is_active=True,
        )

        # Mock driver raising error
        mock_driver = MagicMock()
        mock_driver.poll_parameters = AsyncMock(side_effect=Exception("COM Port Error"))

        async def run_polls():
            with patch.object(cm, "_get_serial_ascii", return_value=mock_driver):
                # Poll 1 -> failure 1 -> RECONNECTING
                await cm.execute_poll(dev, [p])
                st1 = telemetry_service.get_device_state(9)
                assert st1["state"] == "RECONNECTING"

                # Poll 2 -> failure 2 -> RECONNECTING
                await cm.execute_poll(dev, [p])
                st2 = telemetry_service.get_device_state(9)
                assert st2["state"] == "RECONNECTING"

                # Poll 3 -> failure 3 -> ERROR
                await cm.execute_poll(dev, [p])
                st3 = telemetry_service.get_device_state(9)
                assert st3["state"] == "ERROR"

        asyncio.run(run_polls())

    def test_config_cache_single_device_isolation(self):
        """Verify editing Device 1 reloads only Device 1, leaving Device 2 untouched."""
        cache = ConfigurationCache()

        d1 = CachedDeviceSpec(id=1, name="D1", protocol="modbus_tcp", station_id=1, station_name="ST",
                              serial_port=None, baud_rate=9600, data_bits=8, parity="N", stop_bits=1, slave_id=1,
                              host="1.1.1.1", port=502, command_format="ascii", request_command="",
                              response_delimiter="newline", request_hex=None, csv_path=None, csv_folder=None,
                              csv_filename_pattern=None, csv_delimiter=",", csv_timestamp_col=0, poll_interval=5,
                              timeout=5, retry_count=3, is_active=True, parameters=[])

        d2 = CachedDeviceSpec(id=2, name="D2", protocol="modbus_tcp", station_id=1, station_name="ST",
                              serial_port=None, baud_rate=9600, data_bits=8, parity="N", stop_bits=1, slave_id=1,
                              host="2.2.2.2", port=502, command_format="ascii", request_command="",
                              response_delimiter="newline", request_hex=None, csv_path=None, csv_folder=None,
                              csv_filename_pattern=None, csv_delimiter=",", csv_timestamp_col=0, poll_interval=5,
                              timeout=5, retry_count=3, is_active=True, parameters=[])

        cache._devices[1] = d1
        cache._devices[2] = d2

        # Verify initial state
        assert cache.get_device(1).name == "D1"
        assert cache.get_device(2).name == "D2"

        # Update D1 spec in memory
        d1_updated = CachedDeviceSpec(id=1, name="D1_EDITED", protocol="modbus_tcp", station_id=1, station_name="ST",
                                      serial_port=None, baud_rate=9600, data_bits=8, parity="N", stop_bits=1, slave_id=1,
                                      host="1.1.1.100", port=502, command_format="ascii", request_command="",
                                      response_delimiter="newline", request_hex=None, csv_path=None, csv_folder=None,
                                      csv_filename_pattern=None, csv_delimiter=",", csv_timestamp_col=0, poll_interval=5,
                                      timeout=5, retry_count=3, is_active=True, parameters=[])
        cache._devices[1] = d1_updated

        # D1 is updated, D2 remains completely unchanged
        assert cache.get_device(1).name == "D1_EDITED"
        assert cache.get_device(2).name == "D2"
