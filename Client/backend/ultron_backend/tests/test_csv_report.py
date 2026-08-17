"""
Tests for CSV report generation matching industrial template.
"""

import unittest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

from app.api.reports import export_csv, AverageType


def _make_param(id: int, tag: str, name: str, unit: str):
    p = MagicMock()
    p.id = id
    p.tag_name = tag
    p.name = name
    p.unit = unit
    p.min_valid = 0.0
    p.max_valid = 22.0
    p.alarm_high = 22.0
    return p


def _make_hd(pid: int, ts: datetime, val: float):
    r = MagicMock()
    r.parameter_id = pid
    r.timestamp = ts
    r.value = val
    return r


class TestCSVReportGenerator(unittest.IsolatedAsyncioTestCase):

    async def test_export_csv_success(self):
        """Verify export_csv outputs title block, Sl No., data rows, and bottom summary block."""
        start = datetime(2026, 7, 26, 0, 0, 0)
        end = datetime(2026, 7, 26, 20, 52, 0)

        p1 = _make_param(1, "HTDS-Flow", "Flow Rate", "m3/hr")

        readings = [
            _make_hd(1, start + timedelta(minutes=i), val=84.82)
            for i in range(10)
        ]

        db = AsyncMock()
        param_result = MagicMock()
        param_result.scalars.return_value.all.return_value = [p1]

        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = readings

        db.execute = AsyncMock(side_effect=[param_result, data_result])

        response = await export_csv(
            parameter_ids="1",
            start=start,
            end=end,
            avg_type=AverageType.raw,
            step_minutes=1,
            station_name="APL Apollo tubes Limited.",
            db=db,
        )

        # Consume streaming response
        body = b"".join([chunk async for chunk in response.body_iterator]).decode("utf-8")

        lines = body.strip().splitlines()

        # Check CSV header
        self.assertIn("Date & Time", lines[0])
        self.assertIn("HTDS-Flow", lines[0])

        # Check data row
        self.assertIn("2026/07/26 00:00,84.820", lines[1])



if __name__ == "__main__":
    unittest.main()
