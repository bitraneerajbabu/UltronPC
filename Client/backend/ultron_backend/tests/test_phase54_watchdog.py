"""
UltrON — Unit Tests for Phase 5.4 Watchdog, Diagnostics & API Integration

Covers:
  - WatchdogService: health audit, dead task detection, auto-restart
  - WatchdogService: historian service auto-restart
  - Diagnostics Report: psutil metrics, polling engine state, SCADA device states
  - REST API Integration: /telemetry/diagnostics endpoint
"""

import asyncio
from unittest.mock import MagicMock, patch, AsyncMock
import pytest

from app.services.watchdog import WatchdogService, watchdog_service
from app.services.historian_service import historian_service
from app.services.live_cache import live_cache, DeviceState
from app.services import polling_engine as pe


# ═══════════════════════════════════════════════════════════════════════════════
# 1. Watchdog Service Unit Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestWatchdogService:

    def setup_method(self):
        pe._device_tasks.clear()

    @pytest.mark.asyncio
    async def test_watchdog_detects_dead_task_and_restarts(self):
        wd = WatchdogService()
        pe._running = True

        # Create a done task representing a crashed poll loop
        dead_task = asyncio.create_task(asyncio.sleep(0.001))
        await dead_task
        pe._device_tasks[99] = dead_task

        with patch.object(pe, "reload_device", AsyncMock()) as mock_reload:
            with patch("app.services.watchdog.AsyncSessionLocal"):
                await wd._check_health()

        assert wd._restarts_count == 1
        assert mock_reload.called
        assert mock_reload.call_args[0][0] == 99

    @pytest.mark.asyncio
    async def test_watchdog_restarts_stopped_historian(self):
        wd = WatchdogService()
        historian_service._running = False

        with patch.object(historian_service, "start", MagicMock()) as mock_start:
            with patch("app.services.watchdog.AsyncSessionLocal"):
                await wd._check_health()

        assert mock_start.called

    def test_get_diagnostics_shape(self):
        wd = WatchdogService()
        diag = wd.get_diagnostics()

        assert "status" in diag
        assert "system_resources" in diag
        assert "polling_engine" in diag
        assert "historian" in diag
        assert "scada_device_states" in diag
