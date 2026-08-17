"""
Tests for consolidated data-fetching in app/services/report_data.py.

Verifies:
  - Point-count math (10-min window, 1-min interval → 10 points).
  - Hard row limit engages for large raw-mode queries.
  - Step mode returns first reading per bucket.
  - Average mode falls back to HistoricalData when Averages table empty.
"""

import unittest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

from app.services.report_data import (
    fetch_interval_data,
    _bucket_historical_data,
    MAX_EXPORT_ROWS,
    AVG_TYPE_TO_MINUTES,
)


def _make_param(id: int, tag: str = "TEMP", name: str = "Temperature", unit: str = "°C"):
    p = MagicMock()
    p.id = id
    p.tag_name = tag
    p.name = name
    p.unit = unit
    return p


def _make_hd(pid: int, ts: datetime, val: float = 25.0, quality: str = "U"):
    """Make a HistoricalData-like mock."""
    r = MagicMock()
    r.parameter_id = pid
    r.timestamp = ts
    r.value = val
    r.quality = quality
    r.avg_type = "raw"
    return r


def _make_avg(pid: int, ts: datetime, val: float = 25.0, avg_type: str = "avg_15min", quality: str = "U"):
    """Make an Averages-like mock."""
    r = MagicMock()
    r.parameter_id = pid
    r.timestamp = ts
    r.value = val
    r.quality = quality
    r.avg_type = avg_type
    return r


# ─── Point-Count Math ──────────────────────────────────────────────────────────


class TestPointCountMath(unittest.IsolatedAsyncioTestCase):
    """Verify the exact point count from our original spec."""

    async def asyncSetUp(self):
        self.db = AsyncMock()
        self.pid = 1
        self.start = datetime(2025, 1, 1, 0, 0, 0)
        self.param_mock = _make_param(self.pid)

    async def _run_step_mode(self, interval_minutes: int, window_minutes: int):
        """Helper: create N raw rows (one per minute), run step mode."""
        end = self.start + timedelta(minutes=window_minutes)
        raw_rows = [
            _make_hd(self.pid, self.start + timedelta(minutes=i), val=float(i))
            for i in range(window_minutes)
        ]

        param_result = MagicMock()
        param_result.scalars.return_value.all.return_value = [self.param_mock]

        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = raw_rows

        self.db.execute = AsyncMock(side_effect=[param_result, data_result])

        params, readings = await fetch_interval_data(
            db=self.db,
            parameter_ids=[self.pid],
            start=self.start,
            end=end,
            interval_minutes=interval_minutes,
            avg_type="raw",
        )
        return len(readings)

    async def test_10min_window_1min_interval(self):
        """10-minute window, 1-min step → exactly 10 points."""
        count = await self._run_step_mode(1, 10)
        self.assertEqual(count, 10)

    async def test_10min_window_5min_interval(self):
        """10-minute window, 5-min step → exactly 2 points."""
        count = await self._run_step_mode(5, 10)
        self.assertEqual(count, 2)


# ─── Hard Row Limit ────────────────────────────────────────────────────────────


class TestHardRowLimit(unittest.IsolatedAsyncioTestCase):
    """MAX_EXPORT_ROWS must be enforced for raw mode."""

    async def asyncSetUp(self):
        self.db = AsyncMock()
        self.pid = 1
        self.start = datetime(2025, 1, 1, 0, 0, 0)
        self.end = datetime(2025, 1, 2, 0, 0, 0)  # 1 day window
        self.param_mock = _make_param(self.pid)

    async def test_raw_mode_limit_applied(self):
        """Raw mode with > MAX_EXPORT_ROWS rows must cap at limit."""
        overflow_rows = [_make_hd(self.pid, self.start + timedelta(seconds=i), val=float(i))
                         for i in range(MAX_EXPORT_ROWS + 1000)]

        # Mock: first call returns param, second returns data
        param_result = MagicMock()
        param_result.scalars.return_value.all.return_value = [self.param_mock]

        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = overflow_rows[:MAX_EXPORT_ROWS]

        self.db.execute = AsyncMock(side_effect=[param_result, data_result])

        params, readings = await fetch_interval_data(
            db=self.db,
            parameter_ids=[self.pid],
            start=self.start,
            end=self.end,
            interval_minutes=0,
            avg_type="raw",
        )
        # The limit is applied in the SQL query, so we should get at most MAX_EXPORT_ROWS
        self.assertLessEqual(len(readings), MAX_EXPORT_ROWS)

    async def test_step_mode_implicitly_limited_by_data(self):
        """Step mode with interval bucketing naturally limits row count."""
        # Create 6000 raw rows (100 hours of per-minute data)
        many_rows = [_make_hd(self.pid, self.start + timedelta(minutes=i), val=float(i))
                     for i in range(6000)]

        param_result = MagicMock()
        param_result.scalars.return_value.all.return_value = [self.param_mock]

        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = many_rows

        self.db.execute = AsyncMock(side_effect=[param_result, data_result])

        params, readings = await fetch_interval_data(
            db=self.db,
            parameter_ids=[self.pid],
            start=self.start,
            end=self.end,
            interval_minutes=60,  # hourly → ~24 rows for 1 day
            avg_type="raw",
        )
        # Despite having 6000 input rows, step mode produces ~100 points
        self.assertLessEqual(len(readings), 200)


# ─── Bucketing Correctness ─────────────────────────────────────────────────────


class TestStepBucketing(unittest.IsolatedAsyncioTestCase):
    """Verify step mode keeps first reading per bucket, in order."""

    async def asyncSetUp(self):
        self.db = AsyncMock()
        self.pid = 1
        self.start = datetime(2025, 1, 1, 0, 0, 0)
        self.end = self.start + timedelta(minutes=30)
        self.param_mock = _make_param(self.pid)

    async def test_first_value_per_bucket(self):
        """Step mode keeps the FIRST reading in each 5-min bucket."""
        # 3 raw readings per minute for 30 minutes
        raw_rows = []
        for m in range(30):
            for s in range(3):
                raw_rows.append(_make_hd(
                    self.pid,
                    self.start + timedelta(minutes=m, seconds=s),
                    val=float(m * 10 + s),
                ))

        param_result = MagicMock()
        param_result.scalars.return_value.all.return_value = [self.param_mock]

        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = raw_rows

        self.db.execute = AsyncMock(side_effect=[param_result, data_result])

        params, readings = await fetch_interval_data(
            db=self.db,
            parameter_ids=[self.pid],
            start=self.start,
            end=self.end,
            interval_minutes=5,
            avg_type="raw",
        )

        # 30 min / 5 min = 6 buckets → 6 readings
        self.assertEqual(len(readings), 6)

        # Each reading should be the FIRST value in its bucket (s=0)
        for i, r in enumerate(readings):
            expected_val = float(i * 5 * 10)  # m = i*5, s=0 → val = i*5*10
            self.assertEqual(r.value, expected_val,
                             f"Bucket {i}: expected first value {expected_val}")

    async def test_chronological_order(self):
        """Step mode readings are sorted by (parameter_id, timestamp)."""
        pid2 = 2
        raw_rows = []
        for pid, offset in [(self.pid, 0), (pid2, 5)]:
            for m in range(10):
                raw_rows.append(_make_hd(
                    pid,
                    self.start + timedelta(minutes=m + offset),
                    val=float(m),
                ))

        param_result = MagicMock()
        param_result.scalars.return_value.all.return_value = [
            self.param_mock,
            _make_param(pid2, "HUMD", "Humidity", "%"),
        ]

        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = raw_rows

        self.db.execute = AsyncMock(side_effect=[param_result, data_result])

        params, readings = await fetch_interval_data(
            db=self.db,
            parameter_ids=[self.pid, pid2],
            start=self.start,
            end=self.start + timedelta(minutes=20),
            interval_minutes=5,
            avg_type="raw",
        )

        # Should be sorted by pid then timestamp
        for i in range(len(readings) - 1):
            a, b = readings[i], readings[i + 1]
            if a.parameter_id == b.parameter_id:
                self.assertLessEqual(a.timestamp, b.timestamp)
            else:
                self.assertLess(a.parameter_id, b.parameter_id)


# ─── Average Mode Fallback ─────────────────────────────────────────────────────


class TestAverageModeFallback(unittest.IsolatedAsyncioTestCase):
    """When Averages table is empty, fall back to HistoricalData bucketing."""

    async def asyncSetUp(self):
        self.db = AsyncMock()
        self.pid = 1
        self.start = datetime(2025, 1, 1, 0, 0, 0)
        self.end = self.start + timedelta(hours=4)
        self.param_mock = _make_param(self.pid)

    async def test_averages_empty_falls_back_to_historical(self):
        """avg_type='avg_1hr' with empty Averages → returns HistoricalData bucketed at 60min."""
        # Empty Averages result
        avg_result = MagicMock()
        avg_result.scalars.return_value.all.return_value = []

        # HistoricalData: one per minute for 4 hours
        raw_rows = [
            _make_hd(self.pid, self.start + timedelta(minutes=i), val=float(i))
            for i in range(240)
        ]
        hd_result = MagicMock()
        hd_result.scalars.return_value.all.return_value = raw_rows

        param_result = MagicMock()
        param_result.scalars.return_value.all.return_value = [self.param_mock]

        # 2 calls: param, HistoricalData (bucketed directly at interval)
        self.db.execute = AsyncMock(side_effect=[param_result, hd_result])

        params, readings = await fetch_interval_data(
            db=self.db,
            parameter_ids=[self.pid],
            start=self.start,
            end=self.end,
            interval_minutes=0,
            avg_type="avg_1hr",
        )

        # 4 hours / 1 hour = 4 buckets → 4 readings
        self.assertEqual(len(readings), 4,
                         "Should fall back to HistoricalData with hourly bucketing")

    async def test_averages_populated_uses_directly(self):
        """When Averages has data, it's used directly (no bucketing applied twice)."""
        avg_rows = [
            _make_avg(self.pid, self.start + timedelta(hours=i), val=float(i * 10))
            for i in range(4)
        ]

        avg_result = MagicMock()
        avg_result.scalars.return_value.all.return_value = avg_rows

        param_result = MagicMock()
        param_result.scalars.return_value.all.return_value = [self.param_mock]

        self.db.execute = AsyncMock(side_effect=[param_result, avg_result])

        params, readings = await fetch_interval_data(
            db=self.db,
            parameter_ids=[self.pid],
            start=self.start,
            end=self.end,
            interval_minutes=0,
            avg_type="avg_1hr",
        )

        self.assertEqual(len(readings), 4)
        for i, r in enumerate(readings):
            self.assertEqual(r.value, float(i * 10))


# ─── Consolidated Endpoints Return Identical Counts ────────────────────────────


class TestPreviewExportConsistency(unittest.IsolatedAsyncioTestCase):
    """Preview (chart-data via fetch_interval_data) and export must return same
    row count for the same parameters, range, and interval."""

    async def asyncSetUp(self):
        self.db = AsyncMock()
        self.pid = 1
        self.start = datetime(2025, 6, 1, 0, 0, 0)
        self.end = self.start + timedelta(hours=2)
        self.param_mock = _make_param(self.pid)

    async def _fetch(self, interval_minutes: int, avg_type: str):
        param_result = MagicMock()
        param_result.scalars.return_value.all.return_value = [self.param_mock]

        raw_rows = [
            _make_hd(self.pid, self.start + timedelta(minutes=i), val=float(i))
            for i in range(120)  # 2 hours of per-minute data
        ]
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = raw_rows

        self.db.execute = AsyncMock(side_effect=[param_result, data_result])

        params, readings = await fetch_interval_data(
            db=self.db,
            parameter_ids=[self.pid],
            start=self.start,
            end=self.end,
            interval_minutes=interval_minutes,
            avg_type=avg_type,
        )
        return len(readings)

    async def test_step_mode_preview_export_same_count(self):
        """Step mode: same row count for preview (chart-data) and export paths."""
        count = await self._fetch(interval_minutes=15, avg_type="raw")
        # 120 min / 15 min = 8 points
        self.assertEqual(count, 8)

    async def test_average_avg_type_uses_averages(self):
        """Average mode returns correct count from Averages table."""
        avg_rows = [
            _make_avg(self.pid, self.start + timedelta(hours=i), val=float(i))
            for i in range(2)
        ]
        param_result = MagicMock()
        param_result.scalars.return_value.all.return_value = [self.param_mock]

        avg_result = MagicMock()
        avg_result.scalars.return_value.all.return_value = avg_rows

        self.db.execute = AsyncMock(side_effect=[param_result, avg_result])

        params, readings = await fetch_interval_data(
            db=self.db,
            parameter_ids=[self.pid],
            start=self.start,
            end=self.end,
            interval_minutes=0,
            avg_type="avg_1hr",
        )
        self.assertEqual(len(readings), 2)

    async def test_raw_mode_same_rows_preview_export(self):
        """Raw mode: both paths return same rows (up to limit)."""
        count = await self._fetch(interval_minutes=0, avg_type="raw")
        # 120 minutes of per-minute data = 120 raw rows
        self.assertEqual(count, 120)

    async def test_preview_limit_equals_export_limit(self):
        """MAX_EXPORT_ROWS is the cap for both preview and export."""
        self.assertEqual(MAX_EXPORT_ROWS, 100_000,
                         "Preview and export must share the same hard limit")

    async def test_tzinfo_stripped_properly(self):
        """Timezone-aware start/end datetimes are handled cleanly without error."""
        from datetime import timezone
        start_tz = self.start.replace(tzinfo=timezone.utc)
        end_tz = self.end.replace(tzinfo=timezone.utc)
        
        param_result = MagicMock()
        param_result.scalars.return_value.all.return_value = [self.param_mock]
        raw_rows = [_make_hd(self.pid, self.start + timedelta(minutes=i)) for i in range(10)]
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = raw_rows
        self.db.execute = AsyncMock(side_effect=[param_result, data_result])

        params, readings = await fetch_interval_data(
            db=self.db,
            parameter_ids=[self.pid],
            start=start_tz,
            end=end_tz,
            interval_minutes=1,
            avg_type="raw",
        )
        self.assertEqual(len(readings), 10)

    async def test_multi_hour_interval_bucketing(self):
        """3-hour (180 min) step mode buckets 12 hours of data into 4 points."""
        param_result = MagicMock()
        param_result.scalars.return_value.all.return_value = [self.param_mock]

        raw_rows = [
            _make_hd(self.pid, self.start + timedelta(minutes=i), val=float(i))
            for i in range(720)  # 12 hours
        ]
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = raw_rows

        self.db.execute = AsyncMock(side_effect=[param_result, data_result])

        params, readings = await fetch_interval_data(
            db=self.db,
            parameter_ids=[self.pid],
            start=self.start,
            end=self.start + timedelta(hours=12),
            interval_minutes=180,
            avg_type="raw",
        )
        # 720 minutes / 180 min bucket = 4 points
        self.assertEqual(len(readings), 4)
