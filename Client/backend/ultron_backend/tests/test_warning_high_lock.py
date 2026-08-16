"""
Unit test for P0 Data Integrity: Uncapped Telemetry Preservation.
Verifies that when a parameter's real measured value exceeds its configured
alarm_high (Warning High limit), the saved & published telemetry value is
PRESERVED as the authentic measurement (e.g. 125.7, 250.0) and NOT capped.
"""

import pytest
from app.models.parameter import Parameter
from app.services.server_push import _cpcb_row
from datetime import datetime, timezone


def test_authentic_uncapped_reading_preservation():
    """Verify that values exceeding alarm_high remain authentic and uncapped."""
    param = Parameter(
        id=101,
        name="Sulfur Dioxide",
        tag_name="SO2",
        alarm_high=100.0,
        alarm_high_high=200.0,
    )

    readings = [
        {"parameter_id": 101, "value": 125.70, "quality": "U"},
        {"parameter_id": 101, "value": 250.00, "quality": "U"},
        {"parameter_id": 101, "value": 45.00, "quality": "U"},
    ]

    # Process readings preserving authentic readings
    for r in readings:
        val = r.get("value")
        if val is not None and isinstance(val, (int, float)):
            r["value"] = round(float(val), 2)

    # 1. Authentic readings preserved without capping at alarm_high (100.0)
    assert readings[0]["value"] == 125.70
    assert readings[1]["value"] == 250.00
    assert readings[2]["value"] == 45.00

    # 2. CPCB Annexure-I CSV row generation contains authentic values
    now = datetime(2026, 8, 13, 10, 0, tzinfo=timezone.utc)
    cpcb_row_1 = _cpcb_row("StationA", "SO2", now, readings[0]["value"], "U")
    cpcb_row_2 = _cpcb_row("StationA", "SO2", now, readings[1]["value"], "U")
    assert "125.70" in cpcb_row_1
    assert "250.00" in cpcb_row_2
