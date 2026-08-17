"""
Tests for Online Time Sync service (app/services/time_sync.py).

Verifies:
  - get_utc_now() offset math (system clock ahead or behind).
  - get_sync_status() structure.
  - HTTP date header fallback parsing.
"""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

from app.services.time_sync import (
    get_utc_now,
    get_clock_offset,
    get_sync_status,
    sync_online_time,
    _clock_offset_seconds,
)
import app.services.time_sync as time_sync_module


class TestTimeSync(unittest.TestCase):

    def setUp(self):
        # Reset offset state before each test
        time_sync_module._clock_offset_seconds = 0.0
        time_sync_module._last_synced_at = None
        time_sync_module._sync_source = "system"

    def test_get_utc_now_zero_offset(self):
        """Zero offset should return current system UTC time (within small delta)."""
        system_now = datetime.utcnow()
        sync_now = get_utc_now()
        diff = abs((sync_now - system_now).total_seconds())
        self.assertLess(diff, 1.0)

    def test_get_utc_now_positive_offset(self):
        """Positive offset (+1 hour when system clock is behind)."""
        time_sync_module._clock_offset_seconds = 3600.0  # +1 hour
        system_now = datetime.utcnow()
        sync_now = get_utc_now()
        expected = system_now + timedelta(seconds=3600)
        diff = abs((sync_now - expected).total_seconds())
        self.assertLess(diff, 1.0)

    def test_get_utc_now_negative_offset(self):
        """Negative offset (-2 hours when system clock is ahead)."""
        time_sync_module._clock_offset_seconds = -7200.0  # -2 hours
        system_now = datetime.utcnow()
        sync_now = get_utc_now()
        expected = system_now - timedelta(seconds=7200)
        diff = abs((sync_now - expected).total_seconds())
        self.assertLess(diff, 1.0)

    def test_get_sync_status(self):
        """get_sync_status() returns expected dict shape."""
        time_sync_module._clock_offset_seconds = 15.5
        time_sync_module._last_synced_at = datetime(2026, 7, 26, 12, 0, 0)
        time_sync_module._sync_source = "NTP (pool.ntp.org)"

        status = get_sync_status()
        self.assertEqual(status["sync_source"], "NTP (pool.ntp.org)")
        self.assertEqual(status["offset_seconds"], 15.5)
        self.assertIn("2026-07-26T12:00:00", status["last_synced_at"])
        self.assertIn("current_utc_now", status)
        self.assertIn("system_utc_now", status)


class TestTimeSyncAsync(unittest.IsolatedAsyncioTestCase):

    async def test_sync_online_time_ntp_success(self):
        """NTP success path sets offset correctly."""
        target_online_utc = datetime(2026, 7, 26, 12, 0, 0)

        with patch("app.services.time_sync._query_ntp_server", return_value=target_online_utc):
            success = await sync_online_time()
            self.assertTrue(success)
            self.assertIn("NTP", time_sync_module._sync_source)

    async def test_sync_online_time_http_fallback(self):
        """NTP failure falls back to HTTP Date query."""
        target_online_utc = datetime(2026, 7, 26, 12, 0, 0)

        with patch("app.services.time_sync._query_ntp_server", return_value=None):
            with patch("app.services.time_sync._query_http_date_header", return_value=target_online_utc):
                success = await sync_online_time()
                self.assertTrue(success)
                self.assertIn("HTTP", time_sync_module._sync_source)


if __name__ == "__main__":
    unittest.main()
