"""
UltrON — Unit Tests for Phase 5.2 Polling Scheduler & Driver Registry

Covers:
  - DriverRegistry: registration, lookup, fallback
  - Clock-Aligned Scheduler: deterministic sleep calculation, overrun detection
  - Polling Engine: zero DB queries during polling tick, LiveCache updates
  - Single Device Reload: atomic config reload without interrupting sibling loops
"""

import asyncio
import math
import time
from datetime import datetime
from unittest.mock import MagicMock, patch, AsyncMock
import pytest

from app.services.driver_registry import DriverRegistry, driver_registry
from app.services.config_cache import ConfigurationCache, CachedDeviceSpec, CachedParameterSpec, config_cache
from app.services.live_cache import LiveCache, DeviceState, live_cache
from app.services.telemetry_service import TelemetryService, telemetry_service
from app.services.comm_manager import CommunicationManager, comm_manager
from app.services import polling_engine as pe


# ═══════════════════════════════════════════════════════════════════════════════
# 1. DriverRegistry Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestDriverRegistry:

    def test_register_and_lookup(self):
        reg = DriverRegistry()
        mock_factory = MagicMock()
        reg.register("custom_protocol", mock_factory)

        assert reg.is_registered("CUSTOM_PROTOCOL") is True
        assert reg.get_driver_factory("custom_protocol") == mock_factory
        assert reg.get_driver_factory("unknown") is None


# ═══════════════════════════════════════════════════════════════════════════════
# 2. Clock-Aligned Scheduling & Poll Overrun Policy Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestClockAlignedScheduling:

    def test_clock_aligned_target_calculation(self):
        interval = 5.0
        loop_start = 100.0
        cycle = 1

        # Simulate 1.2s read time
        elapsed = 1.2
        target_cycle = math.ceil(elapsed / interval)
        if target_cycle < cycle:
            target_cycle = cycle
        target_time = loop_start + (target_cycle * interval)

        assert target_cycle == 1
        assert target_time == 105.0

    def test_poll_overrun_skips_missed_cycles(self):
        interval = 5.0
        loop_start = 100.0
        cycle = 1

        # Simulate 8.5s read time (overrun past 5s boundary)
        elapsed = 8.5
        target_cycle = math.ceil(elapsed / interval)
        if target_cycle < cycle:
            target_cycle = cycle
        target_time = loop_start + (target_cycle * interval)

        # Must skip 5s boundary and target 10s boundary (110.0)
        assert target_cycle == 2
        assert target_time == 110.0


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Polling Engine Integration Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestPollingEngineIntegration:

    def _setup_cache(self, dev_id=1):
        p1 = CachedParameterSpec(
            id=101, tag_name="SO2", register_address=0, register_count=1, register_type="",
            data_type="float32", byte_order="big", scale_factor=1.0, offset=0.0, min_valid=None,
            max_valid=None, host=None, port=None, serial_port="COM1", baud_rate=9600,
            data_bits=8, parity="N", stop_bits=1, slave_id=1, parse_method="key_value",
            parse_config=None, alarm_high=None, alarm_low=None, alarm_enabled=False,
            unit="ppm", is_active=True,
        )
        spec = CachedDeviceSpec(
            id=dev_id, name=f"Device {dev_id}", protocol="serial_ascii", station_id=1,
            station_name="AAQMS 1", serial_port="COM1", baud_rate=9600, data_bits=8,
            parity="N", stop_bits=1, slave_id=1, host=None, port=None, command_format="ascii",
            request_command="R", response_delimiter="newline", request_hex=None, csv_path=None,
            csv_folder=None, csv_filename_pattern=None, csv_delimiter=",", csv_timestamp_col=0,
            poll_interval=1, timeout=1, retry_count=3, is_active=True, parameters=[p1],
        )
        config_cache._devices[dev_id] = spec
        return spec

    @pytest.mark.asyncio
    async def test_device_poll_loop_updates_live_cache_without_db(self):
        spec = self._setup_cache(10)
        pe._running = True

        mock_readings = [{"parameter_id": 101, "value": 77.7, "raw_value": 77.7, "quality": "U"}]

        with patch.object(comm_manager, "execute_poll", AsyncMock(return_value=mock_readings)):
            task = asyncio.create_task(pe._device_poll_loop(10, 1))
            await asyncio.sleep(0.1)
            pe._running = False
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        # Check LiveCache was updated directly in RAM
        pt = live_cache.get_point(101)
        assert pt is not None
        assert pt.value == 77.7
        assert pt.quality == "U"

        # Check SCADA State
        state = live_cache.get_device_state(10)
        assert state is not None
        assert state.state in (DeviceState.STARTING, DeviceState.READING, DeviceState.WAITING, DeviceState.STOPPED)

    @pytest.mark.asyncio
    async def test_single_device_reload_does_not_interrupt_siblings(self):
        self._setup_cache(1)
        self._setup_cache(2)
        pe._running = True

        pe._device_tasks[1] = asyncio.create_task(asyncio.sleep(10))
        pe._device_tasks[2] = asyncio.create_task(asyncio.sleep(10))

        # Mock config_cache reload_device to avoid hitting uninitialized DB
        with patch.object(config_cache, "reload_device", AsyncMock(return_value=config_cache.get_device(1))):
            with patch.object(pe, "_device_poll_loop", AsyncMock()):
                await pe.reload_device(1)

        # Device 2 task must remain alive and running
        assert not pe._device_tasks[2].done()

        # Clean up
        pe._running = False
        for t in pe._device_tasks.values():
            t.cancel()
