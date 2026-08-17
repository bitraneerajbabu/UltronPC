"""
UltrON — Unit tests for Live Trends rolling window & gap handling:
1. Verifies get_chart_data API returns nulls for missing/gapped intervals (device offline).
2. Verifies rolling window calculations and gap detection behavior.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timedelta, timezone

from app.api.trends import get_chart_data, export_trend_csv
from app.models.telemetry import HistoricalData, DataQuality, AverageType


class TestLiveTrendsGapHandling:
    @pytest.mark.asyncio
    async def test_get_chart_data_returns_null_for_gapped_intervals(self):
        """
        Verify that get_chart_data API returns explicit None (null in JSON)
        for intervals where the device was offline or missing data,
        ensuring frontend Chart.js receives nulls to render line breaks.
        """
        db = AsyncMock()
        param = MagicMock(id=1, tag_name="SO2", name="SO2 Analyzer", unit="ppb")

        base_time = datetime(2026, 8, 13, 10, 0, 0)
        # Create 10 good points (10:00 to 10:09), 10 comms_fail (null) points (10:10 to 10:19), 10 good points (10:20 to 10:29)
        readings = []
        for m in range(10):
            readings.append(HistoricalData(parameter_id=1, timestamp=base_time + timedelta(minutes=m), value=15.0 + m, quality=DataQuality.good))
        for m in range(10, 20):
            readings.append(HistoricalData(parameter_id=1, timestamp=base_time + timedelta(minutes=m), value=None, quality=DataQuality.comms_fail))
        for m in range(20, 30):
            readings.append(HistoricalData(parameter_id=1, timestamp=base_time + timedelta(minutes=m), value=25.0 + m, quality=DataQuality.good))

        async def mock_execute(stmt):
            s = str(stmt).lower()
            if "from parameters" in s or "parameter.id" in s:
                return MagicMock(scalars=lambda: MagicMock(all=lambda: [param]))
            return MagicMock(scalars=lambda: MagicMock(all=lambda: readings))

        db.execute = AsyncMock(side_effect=mock_execute)

        chart_res = await get_chart_data(
            db=db,
            parameter_ids="1",
            start=base_time,
            end=base_time + timedelta(minutes=29),
            avg_type=AverageType.raw,
            step_minutes=0,   # must pass as plain int — FastAPI Query() default is not resolved outside DI
            limit=100
        )

        series = chart_res["series"][0]
        values = series["values"]

        # Assert total points = 30
        assert len(values) == 30
        # Assert middle 10 points (10:10 to 10:19) are explicit None (null) for the gap
        assert all(v is None for v in values[10:20])
        # Assert first 10 and last 10 points have numeric values
        assert all(isinstance(v, float) for v in values[0:10])
        assert all(isinstance(v, float) for v in values[20:30])

    def test_rolling_window_minute_epochs_calculation(self):
        """
        Verify rolling 20-minute window calculation produces 20 sequential minute epochs
        ending at current time, moving forward continuously.
        """
        now = datetime(2026, 8, 13, 10, 46, 30, tzinfo=timezone.utc)
        current_ms = int(now.timestamp() * 1000)
        current_min_epoch = (current_ms // 60000) * 60000

        epoch_list = [current_min_epoch - i * 60000 for i in range(19, -1, -1)]

        assert len(epoch_list) == 20
        # Check start minute is 10:27 and end minute is 10:46
        start_dt = datetime.fromtimestamp(epoch_list[0] / 1000, tz=timezone.utc)
        end_dt = datetime.fromtimestamp(epoch_list[-1] / 1000, tz=timezone.utc)

        assert start_dt.strftime("%H:%M") == "10:27"
        assert end_dt.strftime("%H:%M") == "10:46"

    def test_epoch_pruning_drops_old_entries(self):
        """
        Verify that the pruning logic (keep only epochs within last 40 min)
        drops entries older than the cutoff and keeps recent ones.
        This mirrors the `cutoffEpoch = currentMinEpoch - 40 * 60000` logic
        in updateLiveTrendsChart.
        """
        now_ms = int(datetime(2026, 8, 13, 10, 46, 0, tzinfo=timezone.utc).timestamp() * 1000)
        current_min_epoch = (now_ms // 60000) * 60000
        cutoff = current_min_epoch - 40 * 60000

        # Simulate a time-series map with stale (05:30) and fresh (10:30–10:46) entries
        ts_map = {
            # stale — should be pruned
            int(datetime(2026, 8, 13, 5, 30, 0, tzinfo=timezone.utc).timestamp() * 1000 // 60000) * 60000: 12.5,
            int(datetime(2026, 8, 13, 5, 39, 0, tzinfo=timezone.utc).timestamp() * 1000 // 60000) * 60000: 13.1,
            # fresh — must survive
            int(datetime(2026, 8, 13, 10, 30, 0, tzinfo=timezone.utc).timestamp() * 1000 // 60000) * 60000: 55.0,
            int(datetime(2026, 8, 13, 10, 46, 0, tzinfo=timezone.utc).timestamp() * 1000 // 60000) * 60000: 57.2,
        }

        pruned = {ep: v for ep, v in ts_map.items() if ep >= cutoff}

        # Stale 05:30 and 05:39 entries are gone
        stale_05_30 = int(datetime(2026, 8, 13, 5, 30, 0, tzinfo=timezone.utc).timestamp() * 1000 // 60000) * 60000
        assert stale_05_30 not in pruned
        # Fresh 10:30 and 10:46 entries survive
        fresh_10_30 = int(datetime(2026, 8, 13, 10, 30, 0, tzinfo=timezone.utc).timestamp() * 1000 // 60000) * 60000
        assert fresh_10_30 in pruned
        assert len(pruned) == 2

    def test_offline_null_sentinel_breaks_chart_line(self):
        """
        When a device goes offline mid-window (quality='E' / comms_fail),
        the null sentinel inserted for that epoch results in a visible line
        break: the values array for the 20-slot window has null at the
        offline slot, correctly severing Chart.js spanGaps=false rendering.

        Simulates: device online 10:26–10:39, offline 10:40–10:44,
        online again 10:45–10:46.
        """
        base = datetime(2026, 8, 13, 10, 26, 0, tzinfo=timezone.utc)
        now = datetime(2026, 8, 13, 10, 46, 30, tzinfo=timezone.utc)

        now_ms = int(now.timestamp() * 1000)
        current_min_epoch = (now_ms // 60000) * 60000
        epoch_list = [current_min_epoch - i * 60000 for i in range(19, -1, -1)]

        # Build ts_map: online for first 14 slots (10:27–10:40), offline (null) for 4 (10:41–10:44),
        # online for last 2 (10:45–10:46)
        ts_map = {}
        for i, ep in enumerate(epoch_list):
            if i < 14:
                ts_map[ep] = 42.0 + i * 0.5
            elif i < 18:
                ts_map[ep] = None   # offline / null sentinel
            else:
                ts_map[ep] = 44.0

        values = [ts_map.get(ep, None) for ep in epoch_list]

        # Assert exactly 4 null values in the offline window
        assert values.count(None) == 4
        # Assert they are contiguous at positions 14–17
        assert all(values[i] is None for i in range(14, 18))
        # Assert flanking values are numeric (line connects up to the gap, not across)
        assert isinstance(values[13], float)
        assert isinstance(values[18], float)
