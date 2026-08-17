"""
UltrON — Unit tests for Device Reading & Trends Export Fixes:
1. RegexParser default pattern negative sign handling.
2. Server Push payload skipping on failed reads (None value / quality 'E') for SPCB, TNPCB, RajAPI.
3. Trends CSV Export step_minutes alignment with chart-data preview.
"""

import pytest
import json
import io
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta, timezone

from app.services.parser_engine.regex_ import RegexParser
from app.services.server_push import (
    _build_spcb_payloads,
    _build_tnpcb_payloads,
    _push_telemetry_to_rajapi,
)
from app.api.trends import get_chart_data, export_trend_csv
from app.models.telemetry import HistoricalData, DataQuality, AverageType
from app.models.parameter import Parameter


# ─── MOCK HELPER ──────────────────────────────────────────────────────────────

class MockScalarResult:
    def __init__(self, items):
        if items is None:
            self._items = []
        elif not isinstance(items, list):
            self._items = [items]
        else:
            self._items = items

    def first(self):
        return self._items[0] if self._items else None

    def all(self):
        return self._items

class MockResult:
    def __init__(self, items):
        self._items = items
    def scalars(self):
        return MockScalarResult(self._items)


# ─── REGRESSION TESTS ─────────────────────────────────────────────────────────

class TestRegexParserDefaultPatternFix:
    def test_default_pattern_negative_float(self):
        """Assert parsing '-0.0013' with the default pattern now returns -0.0013, not 0.0013."""
        val = RegexParser().parse("-0.0013", {}, {})
        assert val == pytest.approx(-0.0013)

    def test_default_pattern_positive_float(self):
        """Default regex pattern still parses positive numbers cleanly."""
        val = RegexParser().parse("45.67", {}, {})
        assert val == pytest.approx(45.67)

    def test_default_pattern_explicit_plus_float(self):
        """Default regex pattern captures leading plus sign."""
        val = RegexParser().parse("+12.34", {}, {})
        assert val == pytest.approx(12.34)


class TestPayloadSkipFailedReads:
    @pytest.mark.asyncio
    async def test_spcb_payload_skips_none_or_error_quality(self):
        """SPCB payload must omit parameters where value is None or quality is 'E' (comms_fail)."""
        db = AsyncMock()

        m1 = MagicMock(api_id="101", api_name="St1", api_password="pw", api_vname="SO2", api_unit="ppb", parameter_id=1)
        m1.parameter = MagicMock(tag_name="SO2", unit="ppb")

        m2 = MagicMock(api_id="101", api_name="St1", api_password="pw", api_vname="NO2", api_unit="ppb", parameter_id=2)
        m2.parameter = MagicMock(tag_name="NO2", unit="ppb")

        ld1 = MagicMock(value=45.2, quality=DataQuality.good)
        ld2 = MagicMock(value=None, quality=DataQuality.comms_fail)

        ld_call_count = [0]

        async def mock_execute(stmt):
            s = str(stmt).lower()
            if "live_data" in s:
                ld_call_count[0] += 1
                if ld_call_count[0] == 1:
                    return MockResult(ld1)
                return MockResult(ld2)
            return MockResult([m1, m2])

        db.execute = AsyncMock(side_effect=mock_execute)

        payloads = await _build_spcb_payloads(db, server_id=1, mode="live")

        assert len(payloads) == 1
        vars_list = payloads[0]["Variables"]
        assert len(vars_list) == 1
        assert vars_list[0]["Variablename"] == "SO2"
        assert vars_list[0]["Value"] == 45.2

    @pytest.mark.asyncio
    async def test_tnpcb_payload_skips_none_or_error_quality(self):
        """TNPCB payload must omit parameters where value is None or quality is 'E' (comms_fail)."""
        db = AsyncMock()

        m1 = MagicMock(api_id="1001", api_vname="so2", api_unit="ppm", parameter_id=1)
        m1.parameter = MagicMock(tag_name="so2", unit="ppm")

        m2 = MagicMock(api_id="1001", api_vname="no2", api_unit="ppm", parameter_id=2)
        m2.parameter = MagicMock(tag_name="no2", unit="ppm")

        now = datetime.now(timezone.utc)
        ld1 = MagicMock(value=0.0268, quality=DataQuality.good, timestamp=now)
        ld2 = MagicMock(value=None, quality=DataQuality.comms_fail, timestamp=now)

        ld_call_count = [0]

        async def mock_execute(stmt):
            s = str(stmt).lower()
            if "live_data" in s:
                ld_call_count[0] += 1
                if ld_call_count[0] == 1:
                    return MockResult(ld1)
                return MockResult(ld2)
            return MockResult([m1, m2])

        db.execute = AsyncMock(side_effect=mock_execute)

        devices = await _build_tnpcb_payloads(db, server_id=1, mode="live")

        assert len(devices) == 1
        params = devices[0]["params"]
        assert len(params) == 1
        assert params[0]["parameter"] == "so2"

    @pytest.mark.asyncio
    async def test_rajapi_payload_skips_none_or_error_quality(self):
        """RajAPI payload points list must omit telemetry points with None value or 'E' quality."""
        db = AsyncMock()

        param1 = MagicMock(tag_name="SO2", unit="ppb", alarm_high=100.0)
        param1.device.station.name = "Station Alpha"

        param2 = MagicMock(tag_name="NO2", unit="ppb", alarm_high=80.0)
        param2.device.station.name = "Station Alpha"

        now = datetime.now(timezone.utc)
        ld1 = MagicMock(parameter=param1, value=12.5, quality=DataQuality.good, timestamp=now)
        ld2 = MagicMock(parameter=param2, value=None, quality=DataQuality.comms_fail, timestamp=now)

        db.execute = AsyncMock(return_value=MockResult([ld1, ld2]))

        with patch("app.config.settings.CENTRAL_API_KEY", "test_key"), \
             patch("app.config.settings.CENTRAL_API_URL", "http://test.com/api"), \
             patch("app.services.server_push._last_net_ok", True), \
             patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:

            mock_res = MagicMock(status_code=200)
            mock_post.return_value = mock_res

            await _push_telemetry_to_rajapi(db, mode="live")

            assert mock_post.called
            sent_json = mock_post.call_args.kwargs.get("json")
            points = sent_json.get("points", [])
            assert len(points) == 1
            assert points[0]["tag_name"] == "SO2"
            assert points[0]["value"] == 12.5


class TestTrendsStepMinutesExportFix:
    @pytest.mark.asyncio
    async def test_export_csv_respects_step_minutes_matching_chart_preview(self):
        """
        Regression Test: for avg_type=raw and step_minutes=15 over a 2-hour window (120 raw points),
        both get_chart_data and export_trend_csv must return exactly 8 points (not 120 points).
        """
        db = AsyncMock()
        param = MagicMock(id=1, tag_name="SO2", name="SO2 Analyzer", unit="ppb")

        base_time = datetime(2026, 8, 13, 0, 0, 0)
        # Create 120 raw 1-minute readings (2 hours)
        raw_readings = [
            HistoricalData(
                parameter_id=1,
                timestamp=base_time + timedelta(minutes=m),
                value=10.0 + m * 0.1,
                quality=DataQuality.good
            )
            for m in range(120)
        ]

        async def mock_execute(stmt):
            s = str(stmt).lower()
            if "from parameters" in s or "parameters.id" in s or "parameter.id" in s:
                return MockResult([param])
            return MockResult(raw_readings)

        db.execute = AsyncMock(side_effect=mock_execute)

        start_dt = base_time
        end_dt = base_time + timedelta(minutes=119)

        # 1. Fetch Chart Preview with step_minutes=15
        chart_res = await get_chart_data(
            db=db,
            parameter_ids="1",
            start=start_dt,
            end=end_dt,
            avg_type=AverageType.raw,
            step_minutes=15,
            limit=100000
        )
        chart_points = len(chart_res["series"][0]["values"])

        # 2. Fetch CSV Export with step_minutes=15
        csv_response = await export_trend_csv(
            db=db,
            parameter_ids="1",
            start=start_dt,
            end=end_dt,
            avg_type=AverageType.raw,
            step_minutes=15
        )

        csv_bytes = b""
        async for chunk in csv_response.body_iterator:
            csv_bytes += chunk

        csv_text = csv_bytes.decode("utf-8")
        csv_rows = [line for line in csv_text.splitlines() if line.strip()]
        csv_data_rows = len(csv_rows) - 1  # exclude header

        # Assert BOTH return 8 points (120 min / 15 min step = 8 points)
        assert chart_points == 8
        assert csv_data_rows == 8
        assert csv_data_rows == chart_points
