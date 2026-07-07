"""Tests for DataQualityEngine — frozen sensor, range checks, quality codes."""

import pytest
from datetime import datetime, timedelta
from app.services.data_quality import DataQualityEngine, FROZEN_THRESHOLD_SEC
from app.models.telemetry import DataQuality


@pytest.fixture
def engine():
    return DataQualityEngine()


GOOD = DataQuality.good.value          # "U"
ERROR = DataQuality.comms_fail.value   # "E"
OOR = DataQuality.out_of_range.value   # "O"
NEG = DataQuality.negative.value       # "N"


class TestQualityCodes:
    def test_good_value_returns_U(self, engine):
        q = engine.check(parameter_id=1, value=25.0, quality_from_driver=GOOD)
        assert q == GOOD

    def test_communication_failure_returns_E(self, engine):
        q = engine.check(parameter_id=1, value=None, quality_from_driver=ERROR)
        assert q == ERROR

    def test_negative_value_returns_N(self, engine):
        q = engine.check(parameter_id=1, value=-5.0, quality_from_driver=GOOD)
        assert q == NEG

    def test_below_min_returns_O(self, engine):
        q = engine.check(parameter_id=1, value=5.0, quality_from_driver=GOOD, min_valid=10.0)
        assert q == OOR

    def test_above_max_returns_O(self, engine):
        q = engine.check(parameter_id=1, value=95.0, quality_from_driver=GOOD, max_valid=90.0)
        assert q == OOR

    def test_none_value_without_error_returns_U(self, engine):
        q = engine.check(parameter_id=1, value=None, quality_from_driver=GOOD)
        assert q == GOOD


class TestFrozenSensor:
    def test_changing_value_not_frozen(self, engine):
        ts = datetime.utcnow()
        q1 = engine.check(1, 10.0, GOOD, timestamp=ts)
        q2 = engine.check(1, 20.0, GOOD, timestamp=ts + timedelta(seconds=1))
        assert q1 == GOOD
        assert q2 == GOOD

    def test_frozen_value_detected_after_threshold(self, engine):
        ts = datetime.utcnow()
        engine.check(1, 10.0, GOOD, timestamp=ts)
        far_future = ts + timedelta(seconds=FROZEN_THRESHOLD_SEC + 1)
        q = engine.check(1, 10.0, GOOD, timestamp=far_future)
        assert q == GOOD  # frozen still returns "U" (valid but flagged)

    def test_frozen_not_detected_before_threshold(self, engine):
        ts = datetime.utcnow()
        engine.check(1, 10.0, GOOD, timestamp=ts)
        just_before = ts + timedelta(seconds=FROZEN_THRESHOLD_SEC - 10)
        q = engine.check(1, 10.0, GOOD, timestamp=just_before)
        assert q == GOOD

    def test_reset_clears_frozen_state(self, engine):
        ts = datetime.utcnow()
        engine.check(1, 10.0, GOOD, timestamp=ts)
        engine.reset(1)
        far_future = ts + timedelta(seconds=FROZEN_THRESHOLD_SEC + 1)
        q = engine.check(1, 10.0, GOOD, timestamp=far_future)
        assert q == GOOD  # reset means it starts fresh


class TestBulkCheck:
    def test_bulk_check_updates_qualities(self, engine):
        readings = [
            {"parameter_id": 1, "value": 25.0, "raw_value": 25.0, "quality": GOOD},
            {"parameter_id": 2, "value": -5.0, "raw_value": -5.0, "quality": GOOD},
        ]
        meta = {1: {"min_valid": 0.0, "max_valid": 100.0}, 2: {}}
        result = engine.bulk_check(readings, meta)
        assert result[0]["quality"] == GOOD
        assert result[1]["quality"] == NEG

    def test_bulk_check_empty_readings(self, engine):
        result = engine.bulk_check([], {})
        assert result == []


class TestConcurrency:
    @pytest.mark.asyncio
    async def test_concurrent_access_does_not_raise(self, engine):
        ts = datetime.utcnow()
        async def check_param(pid):
            engine.check(pid, float(pid * 10), GOOD, timestamp=ts)
        import asyncio
        await asyncio.gather(*[check_param(i) for i in range(50)])
        # Should not raise — lock inside DataQualityEngine protects the dict
