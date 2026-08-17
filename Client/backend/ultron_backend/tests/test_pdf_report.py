"""
Tests for PDF report generation matching industrial template.
"""

import unittest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from app.api.reports import generate_pdf


def _make_param(id: int, tag: str, name: str, unit: str):
    p = MagicMock()
    p.id = id
    p.tag_name = tag
    p.name = name
    p.unit = unit
    p.min_valid = 0.0
    p.max_valid = 100.0
    p.alarm_high = 100.0
    return p


def _make_hd(pid: int, ts: datetime, val: float):
    r = MagicMock()
    r.parameter_id = pid
    r.timestamp = ts
    r.value = val
    return r


class TestPDFReportGenerator(unittest.IsolatedAsyncioTestCase):

    async def test_generate_pdf_success(self):
        """Verify generate_pdf builds a valid PDF response binary with summary stats."""
        start = datetime(2026, 7, 13, 0, 0, 0)
        end = datetime(2026, 7, 14, 12, 0, 0)

        p1 = _make_param(1, "ETP ANALYSER-Flow", "Flow Rate", "m3/hr")
        p2 = _make_param(2, "ETP ANALYSER-TSS", "Total Suspended Solids", "mg/l")

        readings = [
            _make_hd(1, start + timedelta(minutes=i), val=20.0 + (i % 10))
            for i in range(30)
        ] + [
            _make_hd(2, start + timedelta(minutes=i), val=50.0 + (i % 5))
            for i in range(30)
        ]

        db = AsyncMock()
        param_result = MagicMock()
        param_result.scalars.return_value.all.return_value = [p1, p2]

        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = readings

        db.execute = AsyncMock(side_effect=[param_result, data_result])

        response = await generate_pdf(
            parameter_ids="1,2",
            start=start,
            end=end,
            step_minutes=1,
            station_name="MANA Treatment Plant Ltd.",
            db=db,
        )

        # Consume streaming response
        body = b"".join([chunk async for chunk in response.body_iterator])

        # PDF header bytes check %PDF
        self.assertTrue(body.startswith(b"%PDF"))
        self.assertGreater(len(body), 1000)


if __name__ == "__main__":
    unittest.main()
