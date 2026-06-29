"""Tests for telemetry models — DataQuality enum value uniqueness."""

import pytest
from app.models.telemetry import DataQuality


class TestDataQualityEnum:
    def test_all_members_have_unique_values(self):
        values = [m.value for m in DataQuality]
        assert len(values) == len(set(values)), (
            f"Duplicate values in DataQuality enum: {values}"
        )

    def test_good_is_U_CPCB_standard(self):
        assert DataQuality.good.value == "U"

    def test_bad_is_distinct_from_good(self):
        assert DataQuality.bad.value != DataQuality.good.value

    def test_uncertain_is_I(self):
        assert DataQuality.uncertain.value == "I"

    def test_comms_fail_sensor_fail_are_distinct(self):
        assert DataQuality.comms_fail.value != DataQuality.sensor_fail.value

    def test_maintenance_is_distinct(self):
        assert DataQuality.maintenance.value != DataQuality.good.value

    def test_lookup_by_value_good(self):
        assert DataQuality("U") == DataQuality.good

    def test_lookup_by_value_bad(self):
        assert DataQuality("B") == DataQuality.bad

    def test_lookup_by_value_uncertain(self):
        assert DataQuality("I") == DataQuality.uncertain

    def test_lookup_by_value_out_of_range(self):
        assert DataQuality("O") == DataQuality.out_of_range

    def test_lookup_by_value_comms_fail(self):
        assert DataQuality("E") == DataQuality.comms_fail

    def test_lookup_by_value_sensor_fail(self):
        assert DataQuality("F") == DataQuality.sensor_fail

    def test_lookup_by_value_negative(self):
        assert DataQuality("N") == DataQuality.negative
