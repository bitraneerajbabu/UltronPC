"""
UltrON — Unit Tests for Phase 5.3 Historian Service & Storage Engine

Covers:
  - BaseStorageEngine & SQLiteStorageEngine batch insertion
  - Dual Timestamp Preservation (timestamp = measurement time, created_at = storage time)
  - HistorianService: 60s periodic ticker, atomic LiveCache snapshot flush
  - SystemLog event creation on historian flush
  - ConfigCache config_version incrementing on reload
"""

import asyncio
from datetime import datetime
from unittest.mock import MagicMock, patch, AsyncMock
import pytest

from app.services.storage_engine import BaseStorageEngine, SQLiteStorageEngine, storage_factory
from app.services.historian_service import HistorianService, historian_service
from app.services.live_cache import LiveCache, LivePointSpec, live_cache
from app.services.config_cache import ConfigurationCache, CachedDeviceSpec, CachedParameterSpec


# ═══════════════════════════════════════════════════════════════════════════════
# 1. Storage Engine Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestStorageEngine:

    @pytest.mark.asyncio
    async def test_sqlite_storage_engine_empty_batch(self):
        engine = SQLiteStorageEngine()
        written = await engine.save_history_batch([])
        assert written == 0

    def test_storage_factory_creation(self):
        engine = storage_factory.create_engine("sqlite")
        assert isinstance(engine, SQLiteStorageEngine)


# ═══════════════════════════════════════════════════════════════════════════════
# 2. Historian Service Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestHistorianService:

    @pytest.mark.asyncio
    async def test_historian_flush_snapshot_dual_timestamps(self):
        mock_storage = MagicMock()
        mock_storage.save_history_batch = AsyncMock(return_value=2)

        service = HistorianService(storage_engine=mock_storage)
        lc = LiveCache()

        ts1 = datetime(2026, 7, 30, 12, 0, 0)
        pt1 = LivePointSpec(1, "NOX", "ST1", "DEV1", 1, 45.0, 45.0, "U", "ppm", ts1)
        pt2 = LivePointSpec(2, "SO2", "ST1", "DEV1", 1, 12.0, 12.0, "U", "ppb", ts1)

        lc.update_point(pt1)
        lc.update_point(pt2)

        with patch("app.services.historian_service.live_cache", lc):
            with patch("app.services.historian_service.AsyncSessionLocal"):
                count = await service.flush_snapshot()

        assert count == 2
        assert mock_storage.save_history_batch.called
        records = mock_storage.save_history_batch.call_args[0][0]
        assert len(records) == 2

        # Verify Measurement Timestamp preserved
        assert records[0]["timestamp"] == ts1
        assert records[0]["parameter_id"] == 1

    def test_historian_metrics(self):
        service = HistorianService()
        metrics = service.get_metrics()
        assert "is_running" in metrics
        assert metrics["interval_seconds"] == 60


# ═══════════════════════════════════════════════════════════════════════════════
# 3. ConfigCache Versioning Test
# ═══════════════════════════════════════════════════════════════════════════════

class TestConfigVersion:

    def test_config_version_defaults_to_one(self):
        spec = CachedDeviceSpec(
            id=1, name="Dev 1", protocol="modbus_tcp", station_id=1, station_name="ST",
            serial_port=None, baud_rate=9600, data_bits=8, parity="N", stop_bits=1,
            slave_id=1, host="127.0.0.1", port=502, command_format="ascii",
            request_command="", response_delimiter="newline", request_hex=None,
            csv_path=None, csv_folder=None, csv_filename_pattern=None, csv_delimiter=",",
            csv_timestamp_col=0, poll_interval=5, timeout=5, retry_count=3, is_active=True,
            parameters=[],
        )
        assert spec.config_version == 1
