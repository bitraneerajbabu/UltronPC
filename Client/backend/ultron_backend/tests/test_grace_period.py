"""
Unit tests for Grace Period Calculator (Phase 2, License Protection)

Tests boundary conditions:
  - Exactly at limit
  - Just under (within grace)
  - Just over (beyond grace)
  - None (never validated)
  - Zero-day grace period
"""

import unittest
from datetime import datetime, timedelta, timezone
from app.services.grace_period import (
    is_within_grace,
    grace_remaining,
    get_grace_period_days,
    set_grace_period_days,
)


class TestGracePeriodBoundary(unittest.TestCase):

    def setUp(self):
        self.default_grace = get_grace_period_days()
        set_grace_period_days(30)  # reset to default for each test

    def tearDown(self):
        set_grace_period_days(self.default_grace)

    # ─── None / never-validated ───────────────────────────────────────────────

    def test_never_validated_is_not_within_grace(self):
        self.assertFalse(is_within_grace(None))

    def test_never_validated_grace_remaining_is_none(self):
        self.assertIsNone(grace_remaining(None))

    # ─── Exactly at limit (edge) ──────────────────────────────────────────────

    def test_exactly_at_grace_limit_is_within_grace(self):
        """29 days + 23:59:59 ago — still within 30-day window."""
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        last_valid = now - timedelta(days=29, hours=23, minutes=59, seconds=59)
        self.assertTrue(is_within_grace(last_valid, now=now))

    def test_exactly_at_30_days_is_within_grace(self):
        """Exactly 30 days ago, same time of day — boundary case, still within."""
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        last_valid = now - timedelta(days=30)
        self.assertTrue(is_within_grace(last_valid, now=now))

    # ─── Just under (within grace) ────────────────────────────────────────────

    def test_1_day_ago_is_within_grace(self):
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        last_valid = now - timedelta(days=1)
        self.assertTrue(is_within_grace(last_valid, now=now))

    def test_15_days_ago_is_within_grace(self):
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        last_valid = now - timedelta(days=15)
        self.assertTrue(is_within_grace(last_valid, now=now))

    def test_29_days_ago_is_within_grace(self):
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        last_valid = now - timedelta(days=29)
        self.assertTrue(is_within_grace(last_valid, now=now))

    # ─── Just over (beyond grace) ─────────────────────────────────────────────

    def test_31_days_ago_is_beyond_grace(self):
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        last_valid = now - timedelta(days=31)
        self.assertFalse(is_within_grace(last_valid, now=now))

    def test_60_days_ago_is_beyond_grace(self):
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        last_valid = now - timedelta(days=60)
        self.assertFalse(is_within_grace(last_valid, now=now))

    def test_1_second_over_limit_is_beyond_grace(self):
        """30 days + 1 second ago — just beyond grace."""
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        last_valid = now - timedelta(days=30, seconds=1)
        self.assertFalse(is_within_grace(last_valid, now=now))

    # ─── grace_remaining returns correct sign ─────────────────────────────────

    def test_grace_remaining_positive_within_window(self):
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        last_valid = now - timedelta(days=15)
        remaining = grace_remaining(last_valid, now=now)
        self.assertIsNotNone(remaining)
        self.assertGreater(remaining.total_seconds(), 0)

    def test_grace_remaining_negative_beyond_window(self):
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        last_valid = now - timedelta(days=31)
        remaining = grace_remaining(last_valid, now=now)
        self.assertIsNotNone(remaining)
        self.assertLess(remaining.total_seconds(), 0)

    def test_grace_remaining_zero_at_exact_limit(self):
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        last_valid = now - timedelta(days=30)
        remaining = grace_remaining(last_valid, now=now)
        self.assertIsNotNone(remaining)
        self.assertEqual(remaining.total_seconds(), 0)

    # ─── Custom grace period days ─────────────────────────────────────────────

    def test_custom_7_day_grace(self):
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        last_valid = now - timedelta(days=5)
        self.assertTrue(is_within_grace(last_valid, grace_period_days=7, now=now))

        last_valid_2 = now - timedelta(days=10)
        self.assertFalse(is_within_grace(last_valid_2, grace_period_days=7, now=now))

    def test_zero_day_grace_only_current_moment(self):
        """Zero-day grace means only exact now is within grace."""
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        last_valid = now - timedelta(seconds=1)
        self.assertFalse(is_within_grace(last_valid, grace_period_days=0, now=now))

        # Exactly now should be within
        self.assertTrue(is_within_grace(now, grace_period_days=0, now=now))

    def test_set_grace_period_days_negative_raises(self):
        with self.assertRaises(ValueError):
            set_grace_period_days(-1)

    # ─── Timezone-naive input handling ────────────────────────────────────────

    def test_naive_datetime_treated_as_utc(self):
        """Naive (tzinfo=None) datetimes should be treated as UTC."""
        now = datetime(2026, 7, 22, 12, 0, 0)  # no tz
        last_valid = now - timedelta(days=15)    # no tz
        # This should not raise, and should return True
        self.assertTrue(is_within_grace(last_valid, now=now))

    def test_mixed_naive_aware_datetime(self):
        """Naive last_valid and aware now should still compute correctly."""
        now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
        last_valid = datetime(2026, 7, 7, 12, 0, 0)  # 15 days ago, no tz
        self.assertTrue(is_within_grace(last_valid, now=now))


if __name__ == "__main__":
    unittest.main()
