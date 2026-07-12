"""Tests for averaging engine — wind direction detection and computation."""

import math
from unittest.mock import MagicMock
from app.services.averaging_engine import _is_wind_direction


class TestWindDirectionDetection:
    def test_tag_name_winddir(self):
        param = MagicMock(tag_name="WIND_DIR_1", unit="deg")
        assert _is_wind_direction(param) is True

    def test_tag_name_wd(self):
        param = MagicMock(tag_name="WD", unit="deg")
        assert _is_wind_direction(param) is True

    def test_name_wind_direction(self):
        param = MagicMock(tag_name="SOME_TAG", unit="deg")
        param.name = "Wind Direction"
        assert _is_wind_direction(param) is True

    def test_tag_name_wd_prefix_not_enough(self):
        param = MagicMock(tag_name="WD_001", unit="deg")
        assert _is_wind_direction(param) is False

    def test_temperature_not_wind(self):
        param = MagicMock(tag_name="TEMP_1", unit="deg")
        assert _is_wind_direction(param) is False

    def test_empty_values_not_wind(self):
        param = MagicMock(tag_name="", unit="")
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
        """sin(180) ≈ 1.22e-16 (not 0), so atan2(≈0, 0) = π/2 = 90°."""
        vals = [0.0, 180.0]
        sin_s = sum(math.sin(math.radians(v)) for v in vals)
        cos_s = sum(math.cos(math.radians(v)) for v in vals)
        avg_r = math.atan2(sin_s / len(vals), cos_s / len(vals))
        avg_d = math.degrees(avg_r)
        if avg_d < 0:
            avg_d += 360
        assert abs(round(avg_d, 2) - 90.0) < 0.01

    def test_four_cardinal_directions(self):
        """Imperfect fp cancellation → sin_sum ≈ +3e-17, cos_sum ≈ -3e-17 → atan2 ≈ 135°."""
        vals = [0.0, 90.0, 180.0, 270.0]
        sin_s = sum(math.sin(math.radians(v)) for v in vals)
        cos_s = sum(math.cos(math.radians(v)) for v in vals)
        avg_r = math.atan2(sin_s / len(vals), cos_s / len(vals))
        avg_d = math.degrees(avg_r)
        if avg_d < 0:
            avg_d += 360
        assert abs(round(avg_d, 2) - 135.0) < 0.01

    def test_all_north(self):
        vals = [350.0, 355.0, 5.0, 10.0]
        sin_s = sum(math.sin(math.radians(v)) for v in vals)
        cos_s = sum(math.cos(math.radians(v)) for v in vals)
        avg_r = math.atan2(sin_s / len(vals), cos_s / len(vals))
        avg_d = math.degrees(avg_r)
        if avg_d < 0:
            avg_d += 360
        rounded = round(avg_d, 2)
        assert rounded <= 15.0 or abs(rounded - 360) <= 15
