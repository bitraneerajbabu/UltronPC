"""
Unit tests for Validation State Service (Phase 2, License Protection)

Tests timestamp read/write operations against mocked DB sessions,
plus integration tests against real in-memory SQLite.
"""

import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, Mock

from app.services.validation_state import (
    get_last_successful_validation,
    set_last_successful_validation,
    get_last_seen_timestamp,
    set_last_seen_timestamp,
)


class TestValidationState(unittest.IsolatedAsyncioTestCase):
    """Unit tests with mocked DB session to avoid database dependency."""

    def setUp(self):
        self.mock_db = AsyncMock()
        # execute() returns a sync Result mock (scalar_one_or_none is sync)
        self.mock_db.execute.return_value = Mock()
        self.mock_db.execute.return_value.scalar_one_or_none.return_value = None

    # ─── last_successful_validation ───────────────────────────────────────────

    async def test_get_none_when_empty(self):
        result = await get_last_successful_validation(db=self.mock_db)
        self.assertIsNone(result)

    async def test_set_and_get_round_trip(self):
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)

        stored = await set_last_successful_validation(when=now, db=self.mock_db)
        self.assertEqual(stored, now)

        # Simulate read returning stored value
        iso_str = now.isoformat()
        self.mock_db.execute.return_value.scalar_one_or_none.return_value = iso_str
        result = await get_last_successful_validation(db=self.mock_db)
        self.assertIsNotNone(result)
        self.assertEqual(result.replace(tzinfo=timezone.utc), now)

    async def test_set_defaults_to_now(self):
        """set_last_successful_validation() with no args stores current time."""
        stored = await set_last_successful_validation(db=self.mock_db)
        self.assertIsNotNone(stored)
        self.assertAlmostEqual(
            (datetime.now(timezone.utc) - stored).total_seconds(),
            0,
            delta=5,
        )

    async def test_parse_invalid_timestamp_returns_none(self):
        self.mock_db.execute.return_value.scalar_one_or_none.return_value = "not-a-timestamp"
        result = await get_last_successful_validation(db=self.mock_db)
        self.assertIsNone(result)

    async def test_parse_empty_string_returns_none(self):
        self.mock_db.execute.return_value.scalar_one_or_none.return_value = ""
        result = await get_last_successful_validation(db=self.mock_db)
        self.assertIsNone(result)

    # ─── last_seen_timestamp (high-water mark) ────────────────────────────────

    async def test_last_seen_defaults_to_now(self):
        stored = await set_last_seen_timestamp(db=self.mock_db)
        self.assertIsNotNone(stored)

    async def test_last_seen_get_none_when_empty(self):
        result = await get_last_seen_timestamp(db=self.mock_db)
        self.assertIsNone(result)

    async def test_last_seen_round_trip(self):
        ts = datetime(2026, 7, 15, 8, 30, 0, tzinfo=timezone.utc)
        stored = await set_last_seen_timestamp(when=ts, db=self.mock_db)
        self.assertEqual(stored, ts)

        iso_str = ts.isoformat()
        self.mock_db.execute.return_value.scalar_one_or_none.return_value = iso_str
        result = await get_last_seen_timestamp(db=self.mock_db)
        self.assertIsNotNone(result)
        self.assertEqual(result.replace(tzinfo=timezone.utc), ts)

    async def test_last_seen_parse_invalid_returns_none(self):
        self.mock_db.execute.return_value.scalar_one_or_none.return_value = "bad-date"
        result = await get_last_seen_timestamp(db=self.mock_db)
        self.assertIsNone(result)


class TestValidationStateIntegration(unittest.IsolatedAsyncioTestCase):
    """
    Integration tests against a real in-memory SQLite database.
    Validates the full read/write cycle through AsyncSessionLocal.
    """

    async def asyncSetUp(self):
        from app.database import engine, Base
        from app.models.system_state import SystemState  # noqa: F401
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def asyncTearDown(self):
        from app.database import engine, Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    async def test_integration_write_then_read(self):
        from app.database import AsyncSessionLocal

        now = datetime(2026, 7, 22, 12, 30, 0, tzinfo=timezone.utc)
        stored = await set_last_successful_validation(when=now)
        self.assertEqual(stored, now)

        async with AsyncSessionLocal() as session:
            result = await get_last_successful_validation(db=session)
        self.assertIsNotNone(result)
        self.assertEqual(result.replace(tzinfo=timezone.utc), now)

    async def test_integration_overwrite_updates_value(self):
        from app.database import AsyncSessionLocal

        ts1 = datetime(2026, 7, 1, 12, 0, 0, tzinfo=timezone.utc)
        ts2 = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)

        await set_last_successful_validation(when=ts1)
        await set_last_successful_validation(when=ts2)

        async with AsyncSessionLocal() as session:
            result = await get_last_successful_validation(db=session)
        self.assertEqual(result.replace(tzinfo=timezone.utc), ts2)

    async def test_integration_last_seen_round_trip(self):
        from app.database import AsyncSessionLocal

        ts = datetime(2026, 7, 15, 8, 0, 0, tzinfo=timezone.utc)
        stored = await set_last_seen_timestamp(when=ts)
        self.assertEqual(stored, ts)

        async with AsyncSessionLocal() as session:
            result = await get_last_seen_timestamp(db=session)
        self.assertIsNotNone(result)
        self.assertEqual(result.replace(tzinfo=timezone.utc), ts)

    async def test_integration_get_both_keys(self):
        """Both keys can coexist in system_state."""
        from app.database import AsyncSessionLocal

        val_ts = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        seen_ts = datetime(2026, 7, 22, 12, 5, 0, tzinfo=timezone.utc)

        await set_last_successful_validation(when=val_ts)
        await set_last_seen_timestamp(when=seen_ts)

        async with AsyncSessionLocal() as session:
            v = await get_last_successful_validation(db=session)
            s = await get_last_seen_timestamp(db=session)
        self.assertEqual(v.replace(tzinfo=timezone.utc), val_ts)
        self.assertEqual(s.replace(tzinfo=timezone.utc), seen_ts)


if __name__ == "__main__":
    unittest.main()
