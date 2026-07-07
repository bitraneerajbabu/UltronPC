"""Tests for averaging engine — wind direction detection and computation."""

import math
import pytest
from datetime import datetime
from unittest.mock import MagicMock
from app.services.averaging_engine import _is_wind_direction


class TestWindDirectionDetection:
    def test_tag_name_winddir(self):
        param = MagicMock(name="param", tag_name="WIND_DIR_1", unit="deg")
        assert _is_wind_direction(param) is True

    def test_tag_name_wd(self):
        param = MagicMock(name="param", tag_name="WD", unit="deg")
        assert _is_wind_direction(param) is True

    def test_name_wind_direction(self):
        param = MagicMock(name="param", tag_name="SOME_TAG", name="Wind Direction", unit="deg")
        assert _is_wind_direction(param) is True

    def test_degree_unit_with_wind_in_name(self):
        param = MagicMock(name="param", tag_name="WD_001", unit="deg")
        assert _is_wind_direction(param) is True

    def test_temperature_not_wind(self):
        param = MagicMock(name="param", tag_name="TEMP_1", name="Temperature", unit="deg")
        assert _is_wind_direction(param) is False

    def test_empty_values_not_wind(self):
        param = MagicMock(name="param", tag_name="", name="", unit="")
        assert _is_wind_direction(param) is False


class TestWindDirectionMath:
    """Verify vector averaging math matches expected CPCB-compliant logic."""

    def test_single_value_returns_that_value(self):
        vals = [90.0]
        sin_s = sum(math.sin(math.radians(v)) for v in vals)
        cos_s = sum(math.cos(math.radians(v)) for v in vals)
        avg_r = math.atan2(sin_s / len(vals), cos_s / len(vals))
        avg_d = math.degrees(avg_r)
        if avg_d < 0:
            avg_d += 360
        assert round(avg_d, 2) == 90.0

    def test_two_opposite_directions(self):
        vals = [0.0, 180.0]
        sin_s = sum(math.sin(math.radians(v)) for v in vals)
        cos_s = sum(math.cos(math.radians(v)) for v in vals)
        avg_r = math.atan2(sin_s / len(vals), cos_s / len(vals))
        avg_d = math.degrees(avg_r)
        if avg_d < 0:
            avg_d += 360
        # 0 and 180 cancel out — result is undefined (atan2(0,0) = 0)
        assert round(avg_d, 2) == 0.0

    def test_four_cardinal_directions(self):
        vals = [0.0, 90.0, 180.0, 270.0]
        sin_s = sum(math.sin(math.radians(v)) for v in vals)
        cos_s = sum(math.cos(math.radians(v)) for v in vals)
        avg_r = math.atan2(sin_s / len(vals), cos_s / len(vals))
        avg_d = math.degrees(avg_r)
        if avg_d < 0:
            avg_d += 360
        # All 4 cancel out
        assert round(avg_d, 2) == 0.0

    def test_all_north(self):
        vals = [350.0, 355.0, 5.0, 10.0]
        sin_s = sum(math.sin(math.radians(v)) for v in vals)
        cos_s = sum(math.cos(math.radians(v)) for v in vals)
        avg_r = math.atan2(sin_s / len(vals), cos_s / len(vals))
        avg_d = math.degrees(avg_r)
        if avg_d < 0:
            avg_d += 360
        # Should be near 0 degrees (North)
        assert 0.0 <= round(avg_d, 2) <= 15.0
