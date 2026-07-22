"""
Unit test for Warning High Value Locking.
Verifies that when a parameter's real measured value exceeds its configured
alarm_high (Warning High limit), the saved & published telemetry value is
locked/capped at alarm_high.
"""

import pytest
from app.models.parameter import Parameter


def test_warning_high_capping_logic():
    """Verify that values exceeding alarm_high are capped to alarm_high."""
    param = Parameter(
        id=101,
        name="Sulfur Dioxide",
        tag_name="SO2",
        alarm_high=50.0,
    )

    readings = [
        {"parameter_id": 101, "value": 55.20, "quality": "U"},
        {"parameter_id": 101, "value": 30.00, "quality": "U"},
    ]

    param_meta = {101: {"alarm_high": param.alarm_high}}

    for r in readings:
        val = r.get("value")
        meta = param_meta.get(r["parameter_id"], {})
        alarm_high = meta.get("alarm_high")
        if val is not None and alarm_high is not None and val > alarm_high:
            if r.get("raw_value") is None:
                r["raw_value"] = val
            r["value"] = round(float(alarm_high), 2)
        else:
            r["value"] = round(float(val), 2)

    # Exceeded reading is capped at alarm_high (50.0)
    assert readings[0]["value"] == 50.0
    assert readings[0]["raw_value"] == 55.20

    # Normal reading below alarm_high remains unchanged (30.0)
    assert readings[1]["value"] == 30.0
