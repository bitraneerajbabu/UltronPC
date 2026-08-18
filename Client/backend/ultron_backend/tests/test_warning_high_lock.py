"""
Unit test for Warning High Limit Lock / Capping.
Verifies that when a parameter's real measured value exceeds its configured
alarm_high (Warning High limit), the published and stored value is capped
to the alarm_high limit value (e.g. 88.0 -> 80.0).
"""

import pytest
from app.services.data_quality import dq_engine
from app.services.server_push import _cpcb_row
from datetime import datetime, timezone


def test_warning_high_limit_capping():
    """Verify that values exceeding alarm_high are capped to the limit value."""
    meta = {
        101: {"min_valid": 0.0, "max_valid": 1000.0, "alarm_high": 80.0}
    }

    readings = [
        {"parameter_id": 101, "value": 88.00, "raw_value": 88.00, "quality": "U"},
        {"parameter_id": 101, "value": 120.00, "raw_value": 120.00, "quality": "U"},
        {"parameter_id": 101, "value": 45.00, "raw_value": 45.00, "quality": "U"},
    ]

    processed = dq_engine.bulk_check(readings, meta)

    # 1. Values exceeding alarm_high (80.0) are capped to 80.0
    assert processed[0]["value"] == 80.0
    assert processed[1]["value"] == 80.0
    assert processed[2]["value"] == 45.0  # under limit, unchanged

    # 2. CPCB Annexure-I CSV row generation contains capped value
    now = datetime(2026, 8, 13, 10, 0, tzinfo=timezone.utc)
    cpcb_row_1 = _cpcb_row("StationA", "SO2", now, processed[0]["value"], "U")
    assert "80.00" in cpcb_row_1
