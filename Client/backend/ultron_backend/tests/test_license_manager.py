"""
Unit & integration tests for License Manager Engine (Phase 4, License Protection).

Tests cover every state transition path:
  - Clock tamper detection (sync helper)
  - Install license: valid, expired, bad-signature, HWID-mismatch, replay-rollback, no-file
  - Offline routine state: cached+not-expired → ACTIVE, cached+expired → EXPIRED, no-cache → LOCKED
  - Online mode: within-grace, beyond-grace, never-validated
  - Clock tamper override of all other states
  - is_cpcb_upload_allowed guard for every state
  - Regression: expiry transitions correctly after install
  - Integration: real SQLite for cache + online paths
"""

import json
import os
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

from app.services import license_manager as lm
from app.services.license_manager import (
    STATE_ACTIVE,
    STATE_GRACE_PERIOD,
    STATE_LOCKED,
    STATE_EXPIRED,
    STATE_CLOCK_TAMPERED,
    _get_cached_license,
    _get_today,
    _is_clock_tampered,
    get_clock_tamper_threshold_seconds,
    get_license_file_path,
    install_license_file,
    set_clock_tamper_threshold_seconds,
    set_license_file_path,
)
from app.services.offline_license import (
    LicenseExpiredError,
    LicenseHWIDMismatchError,
    LicenseReplayError,
    LicenseSignatureError,
    LicenseValidationError,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_lic_payload(overrides: dict | None = None) -> dict:
    """Build a license payload dict (unsigned). Tests sign via install_license_file mock."""
    data = {
        "license_id": "LIC-9F82-441A-BC01",
        "client_name": "Test Client",
        "hwid": "SUN-FAKE-HWID-FOR-TEST",
        "allowed_stations": 2,
        "deployment_mode": "offline_only",
        "issue_date": "2026-01-01",
        "expiry_date": "2029-12-31",
    }
    if overrides:
        data.update(overrides)
    return data


def _build_cached(overrides: dict | None = None) -> dict:
    """Build a dict as it would appear in the installed_license cache."""
    base = {
        "license_id": "LIC-9F82-441A-BC01",
        "hwid": "SUN-FAKE-HWID-FOR-TEST",
        "issue_date": "2026-01-01",
        "expiry_date": "2029-12-31",
        "client_name": "Test Client",
        "allowed_stations": 2,
        "deployment_mode": "offline_only",
        "installed_at": "2026-07-22T12:00:00+00:00",
    }
    if overrides:
        base.update(overrides)
    return base


# ─── Sync helper: _is_clock_tampered ─────────────────────────────────────────

class TestClockTamperDetection(unittest.TestCase):
    """Unit tests for the _is_clock_tampered sync helper."""

    def setUp(self):
        self.default_threshold = get_clock_tamper_threshold_seconds()

    def tearDown(self):
        set_clock_tamper_threshold_seconds(self.default_threshold)

    def test_none_last_seen_not_tampered(self):
        self.assertFalse(_is_clock_tampered(None))

    def test_future_time_not_tampered(self):
        """Current time ahead of last_seen is normal forward progress."""
        last_seen = datetime.now(timezone.utc) - timedelta(hours=1)
        self.assertFalse(_is_clock_tampered(last_seen))

    def test_slight_rewind_within_threshold(self):
        """Small rollback under 5 minutes is not tampered."""
        now = datetime.now(timezone.utc)
        last_seen = now + timedelta(minutes=2)
        self.assertFalse(_is_clock_tampered(last_seen))

    def test_rewind_exceeding_threshold(self):
        """Large rollback over 5 minutes is tampered."""
        set_clock_tamper_threshold_seconds(300)
        now = datetime.now(timezone.utc)
        last_seen = now + timedelta(minutes=10)
        self.assertTrue(_is_clock_tampered(last_seen))

    def test_exactly_at_threshold_not_tampered(self):
        """Rollback at exactly 5 minutes is NOT tampered (< not <=)."""
        set_clock_tamper_threshold_seconds(300)
        now = datetime.now(timezone.utc)
        last_seen = now + timedelta(seconds=300)
        self.assertFalse(_is_clock_tampered(last_seen))

    def test_one_second_over_threshold_is_tampered(self):
        set_clock_tamper_threshold_seconds(300)
        now = datetime.now(timezone.utc)
        last_seen = now + timedelta(seconds=301)
        self.assertTrue(_is_clock_tampered(last_seen))

    def test_naive_datetime_treated_as_utc(self):
        set_clock_tamper_threshold_seconds(300)
        now = datetime.now(timezone.utc)
        naive_last = (now + timedelta(minutes=10)).replace(tzinfo=None)
        self.assertTrue(_is_clock_tampered(naive_last))

    def test_custom_threshold(self):
        set_clock_tamper_threshold_seconds(60)  # 1 minute
        now = datetime.now(timezone.utc)
        last_seen = now + timedelta(seconds=90)
        self.assertTrue(_is_clock_tampered(last_seen))


# ─── Install license tests ────────────────────────────────────────────────────

class TestInstallLicense(unittest.IsolatedAsyncioTestCase):
    """install_license_file() — full validation pipeline for the INSTALL event."""

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".lic", delete=False, encoding="utf-8"
        )
        self.path = self.tmp.name
        self.db = AsyncMock()

    def tearDown(self):
        try:
            os.unlink(self.path)
        except OSError:
            pass

    def _write_lic(self, data: dict):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(data, f)

    # ── Success path ──────────────────────────────────────────────────────

    async def test_install_success(self):
        """Full install pipeline succeeds and caches the license."""
        payload = _make_lic_payload()
        self._write_lic(payload)
        with patch("app.services.license_manager.verify_license_signature") as mock_sig:
            with patch("app.services.license_manager.check_hwid") as mock_hwid:
                with patch("app.services.license_manager._get_cached_license", return_value=None):
                    with patch("app.services.license_manager._cache_license") as mock_cache:
                        mock_sig.return_value = True
                        mock_hwid.return_value = True
                        result = await install_license_file(self.path, self.db)
                        self.assertEqual(result["license_id"], "LIC-9F82-441A-BC01")
                        mock_cache.assert_awaited_once()

    # ── Expired ───────────────────────────────────────────────────────────

    async def test_install_expired_license(self):
        payload = _make_lic_payload({"expiry_date": "2020-01-01"})
        self._write_lic(payload)
        with patch("app.services.license_manager.verify_license_signature") as mock_sig:
            with patch("app.services.license_manager.check_hwid") as mock_hwid:
                mock_sig.return_value = True
                mock_hwid.return_value = True
                with self.assertRaises(LicenseExpiredError):
                    await install_license_file(self.path, self.db)

    # ── Bad signature ─────────────────────────────────────────────────────

    async def test_install_bad_signature(self):
        payload = _make_lic_payload()
        self._write_lic(payload)
        with patch("app.services.license_manager.verify_license_signature") as mock_sig:
            mock_sig.side_effect = LicenseSignatureError("bad sig")
            with self.assertRaises(LicenseSignatureError):
                await install_license_file(self.path, self.db)

    # ── HWID mismatch ─────────────────────────────────────────────────────

    async def test_install_hwid_mismatch(self):
        payload = _make_lic_payload()
        self._write_lic(payload)
        with patch("app.services.license_manager.verify_license_signature") as mock_sig:
            with patch("app.services.license_manager.check_hwid") as mock_hwid:
                mock_sig.return_value = True
                mock_hwid.side_effect = LicenseHWIDMismatchError("wrong machine")
                with self.assertRaises(LicenseHWIDMismatchError):
                    await install_license_file(self.path, self.db)

    # ── Replay rollback ───────────────────────────────────────────────────

    async def test_install_replay_rollback_rejected(self):
        """Installing an older issue_date than cached license is rejected."""
        cached = _build_cached({"issue_date": "2026-06-01"})
        payload = _make_lic_payload({"issue_date": "2026-01-01"})
        self._write_lic(payload)
        with patch("app.services.license_manager.verify_license_signature") as mock_sig:
            with patch("app.services.license_manager.check_hwid") as mock_hwid:
                with patch("app.services.license_manager._get_cached_license", return_value=cached):
                    mock_sig.return_value = True
                    mock_hwid.return_value = True
                    with self.assertRaises(LicenseReplayError) as ctx:
                        await install_license_file(self.path, self.db)
                    self.assertIn("older", str(ctx.exception))

    async def test_install_same_issue_allowed(self):
        """Re-installing the same license (same issue_date) is allowed."""
        cached = _build_cached({"issue_date": "2026-01-01"})
        payload = _make_lic_payload({"issue_date": "2026-01-01"})
        self._write_lic(payload)
        with patch("app.services.license_manager.verify_license_signature") as mock_sig:
            with patch("app.services.license_manager.check_hwid") as mock_hwid:
                with patch("app.services.license_manager._get_cached_license", return_value=cached):
                    with patch("app.services.license_manager._cache_license"):
                        mock_sig.return_value = True
                        mock_hwid.return_value = True
                        result = await install_license_file(self.path, self.db)
                        self.assertEqual(result["issue_date"], "2026-01-01")

    async def test_install_newer_issue_allowed(self):
        """Upgrading to a newer issue_date is allowed."""
        cached = _build_cached({"issue_date": "2026-01-01"})
        payload = _make_lic_payload({"issue_date": "2026-06-01"})
        self._write_lic(payload)
        with patch("app.services.license_manager.verify_license_signature") as mock_sig:
            with patch("app.services.license_manager.check_hwid") as mock_hwid:
                with patch("app.services.license_manager._get_cached_license", return_value=cached):
                    with patch("app.services.license_manager._cache_license"):
                        mock_sig.return_value = True
                        mock_hwid.return_value = True
                        result = await install_license_file(self.path, self.db)
                        self.assertEqual(result["issue_date"], "2026-06-01")

    # ── File not found ────────────────────────────────────────────────────

    async def test_install_file_not_found(self):
        with self.assertRaises(LicenseValidationError) as ctx:
            await install_license_file("/nonexistent/license.lic", self.db)
        self.assertIn("not found", str(ctx.exception))


# ─── Offline routine state tests (read from cache only) ───────────────────────

class TestOfflineState(unittest.IsolatedAsyncioTestCase):
    """
    Offline-only mode state — reads cached license, re-checks expiry.
    Does NOT call validate_license_file() or install_license_file().
    """

    async def asyncSetUp(self):
        self.db = AsyncMock()
        self.default_path = get_license_file_path()

    async def asyncTearDown(self):
        set_license_file_path(self.default_path)

    async def _get_state(self, cached: dict | None = None) -> str:
        """Call get_license_state() in offline mode with given cached value."""
        # execute() returns a sync Result mock (scalar_one_or_none is sync)
        mock_val = json.dumps(cached) if cached else None
        self.db.execute.return_value = Mock()
        self.db.execute.return_value.scalar_one_or_none.return_value = mock_val
        with patch("app.services.license_manager.is_offline_only_mode", return_value=True):
            with patch("app.services.license_manager.get_last_seen_timestamp", return_value=None):
                return await lm.get_license_state(self.db)

    # ── Valid cached license → ACTIVE ─────────────────────────────────────

    async def test_offline_valid_not_expired(self):
        cached = _build_cached({"expiry_date": "2099-12-31"})
        with patch("app.services.license_manager._get_today", return_value=date(2026, 7, 22)):
            state = await self._get_state(cached=cached)
        self.assertEqual(state, STATE_ACTIVE)

    # ── Expired cached license → EXPIRED ──────────────────────────────────

    async def test_offline_expired_cache(self):
        cached = _build_cached({"expiry_date": "2025-01-01"})
        with patch("app.services.license_manager._get_today", return_value=date(2026, 7, 22)):
            state = await self._get_state(cached=cached)
        self.assertEqual(state, STATE_EXPIRED)

    # ── Expiry today still valid ──────────────────────────────────────────

    async def test_offline_expiry_today_still_active(self):
        """Expiry on the same day is inclusive — still ACTIVE."""
        cached = _build_cached({"expiry_date": "2026-07-22"})
        with patch("app.services.license_manager._get_today", return_value=date(2026, 7, 22)):
            state = await self._get_state(cached=cached)
        self.assertEqual(state, STATE_ACTIVE)

    # ── No cached license → LOCKED ────────────────────────────────────────

    async def test_offline_no_cache(self):
        state = await self._get_state(cached=None)
        self.assertEqual(state, STATE_LOCKED)

    # ── Missing expiry in cache → LOCKED ──────────────────────────────────

    async def test_offline_cache_missing_expiry(self):
        cached = _build_cached({"expiry_date": ""})
        state = await self._get_state(cached=cached)
        self.assertEqual(state, STATE_LOCKED)

    # ── Regression: expiry transitions correctly ──────────────────────────

    async def test_offline_transitions_to_expired(self):
        """
        Regression test for the original bug: install valid license with
        near-future expiry, advance reference_date past expiry, confirm EXPIRED.
        """
        cached = _build_cached({"expiry_date": "2026-07-31"})
        # Before expiry → ACTIVE
        with patch("app.services.license_manager._get_today", return_value=date(2026, 7, 22)):
            state = await self._get_state(cached=cached)
            self.assertEqual(state, STATE_ACTIVE)
        # After expiry → EXPIRED
        with patch("app.services.license_manager._get_today", return_value=date(2026, 8, 1)):
            state = await self._get_state(cached=cached)
            self.assertEqual(state, STATE_EXPIRED)


# ─── Online mode state tests ──────────────────────────────────────────────────

class TestOnlineState(unittest.IsolatedAsyncioTestCase):
    """Online mode state via mocked last_successful_validation + grace_period."""

    async def asyncSetUp(self):
        self.db = AsyncMock()

    async def _get_state(self, last_valid_value=None, is_within_grace_value=False):
        with patch("app.services.license_manager.is_offline_only_mode", return_value=False):
            with patch("app.services.license_manager.get_last_seen_timestamp", return_value=None):
                with patch("app.services.license_manager.get_last_successful_validation") as mock_last:
                    mock_last.return_value = last_valid_value
                    with patch("app.services.license_manager.is_within_grace") as mock_grace:
                        mock_grace.return_value = is_within_grace_value
                        return await lm.get_license_state(self.db)

    async def test_online_never_validated(self):
        state = await self._get_state(last_valid_value=None)
        self.assertEqual(state, STATE_LOCKED)

    async def test_online_recently_validated_within_grace(self):
        now = datetime.now(timezone.utc)
        last_valid = now - timedelta(days=1)
        state = await self._get_state(last_valid_value=last_valid, is_within_grace_value=True)
        self.assertEqual(state, STATE_GRACE_PERIOD)

    async def test_online_beyond_grace(self):
        now = datetime.now(timezone.utc)
        last_valid = now - timedelta(days=60)
        state = await self._get_state(last_valid_value=last_valid, is_within_grace_value=False)
        self.assertEqual(state, STATE_LOCKED)


# ─── Clock tamper override ────────────────────────────────────────────────────

class TestClockTamperOverride(unittest.IsolatedAsyncioTestCase):
    """CLOCK_TAMPERED must override all other states."""

    async def asyncSetUp(self):
        self.db = AsyncMock()
        self.default_threshold = get_clock_tamper_threshold_seconds()
        set_clock_tamper_threshold_seconds(300)

    async def asyncTearDown(self):
        set_clock_tamper_threshold_seconds(self.default_threshold)

    async def _assert_clock_tampered_overrides(self, mode_offline: bool):
        tampered_last_seen = datetime.now(timezone.utc) + timedelta(minutes=10)
        with patch("app.services.license_manager.is_offline_only_mode", return_value=mode_offline):
            with patch("app.services.license_manager.get_last_seen_timestamp", return_value=tampered_last_seen):
                state = await lm.get_license_state(self.db)
                self.assertEqual(state, STATE_CLOCK_TAMPERED)

    async def test_clock_tamper_overrides_offline_active(self):
        await self._assert_clock_tampered_overrides(mode_offline=True)

    async def test_clock_tamper_overrides_online_grace(self):
        await self._assert_clock_tampered_overrides(mode_offline=False)

    async def test_clock_tamper_with_none_last_seen_does_not_override(self):
        with patch("app.services.license_manager.is_offline_only_mode", return_value=False):
            with patch("app.services.license_manager.get_last_seen_timestamp", return_value=None):
                with patch("app.services.license_manager.get_last_successful_validation", return_value=None):
                    state = await lm.get_license_state(self.db)
                    self.assertEqual(state, STATE_LOCKED)


# ─── is_cpcb_upload_allowed guard ────────────────────────────────────────────

class TestCPCBGuard(unittest.IsolatedAsyncioTestCase):
    """is_cpcb_upload_allowed per Section 6 guard matrix."""

    async def asyncSetUp(self):
        self.db = AsyncMock()

    async def _test_state_allows(self, state: str, expected: bool):
        with patch("app.services.license_manager.get_license_state", return_value=state):
            result = await lm.is_cpcb_upload_allowed(self.db)
            self.assertEqual(result, expected)

    async def test_active_allows_upload(self):
        await self._test_state_allows(STATE_ACTIVE, True)

    async def test_grace_period_allows_upload(self):
        await self._test_state_allows(STATE_GRACE_PERIOD, True)

    async def test_locked_blocks_upload(self):
        await self._test_state_allows(STATE_LOCKED, False)

    async def test_expired_blocks_upload(self):
        await self._test_state_allows(STATE_EXPIRED, False)

    async def test_clock_tampered_blocks_upload(self):
        await self._test_state_allows(STATE_CLOCK_TAMPERED, False)


# ─── Integration tests (real SQLite) ─────────────────────────────────────────

class TestIntegration(unittest.IsolatedAsyncioTestCase):
    """
    Integration tests with real in-memory SQLite.
    Tests both install_license_file() and get_license_state() end-to-end.
    """

    async def asyncSetUp(self):
        from app.database import engine, Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.default_threshold = get_clock_tamper_threshold_seconds()
        self.default_path = get_license_file_path()
        set_clock_tamper_threshold_seconds(300)
        set_license_file_path("/fake/license.lic")
        # Create temp .lic file for install tests
        self.tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".lic", delete=False, encoding="utf-8"
        )
        self.path = self.tmp.name

    async def asyncTearDown(self):
        from app.database import engine, Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        set_clock_tamper_threshold_seconds(self.default_threshold)
        set_license_file_path(self.default_path)
        try:
            os.unlink(self.path)
        except OSError:
            pass

    def _write_lic(self, payload: dict):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(payload, f)

    # ── Online integration paths ──────────────────────────────────────────

    async def _seed_validation(self, when: datetime | None):
        from app.database import AsyncSessionLocal
        from app.models.system_state import SystemState
        if when is not None:
            async with AsyncSessionLocal() as session:
                session.add(SystemState(
                    key="last_successful_validation",
                    value=when.isoformat(),
                ))
                await session.commit()

    async def _seed_last_seen(self, when: datetime | None):
        from app.database import AsyncSessionLocal
        from app.models.system_state import SystemState
        if when is not None:
            async with AsyncSessionLocal() as session:
                session.add(SystemState(
                    key="last_seen_timestamp",
                    value=when.isoformat(),
                ))
                await session.commit()

    async def test_online_integration_within_grace(self):
        from app.database import AsyncSessionLocal
        await self._seed_validation(datetime.now(timezone.utc) - timedelta(days=15))
        async with AsyncSessionLocal() as session:
            with patch("app.services.license_manager.is_offline_only_mode", return_value=False):
                state = await lm.get_license_state(session)
        self.assertEqual(state, STATE_GRACE_PERIOD)

    async def test_online_integration_beyond_grace(self):
        from app.database import AsyncSessionLocal
        await self._seed_validation(datetime.now(timezone.utc) - timedelta(days=60))
        async with AsyncSessionLocal() as session:
            with patch("app.services.license_manager.is_offline_only_mode", return_value=False):
                state = await lm.get_license_state(session)
        self.assertEqual(state, STATE_LOCKED)

    async def test_online_integration_never_validated(self):
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            with patch("app.services.license_manager.is_offline_only_mode", return_value=False):
                state = await lm.get_license_state(session)
        self.assertEqual(state, STATE_LOCKED)

    async def test_clock_tamper_integration(self):
        from app.database import AsyncSessionLocal
        future_last_seen = datetime.now(timezone.utc) + timedelta(minutes=10)
        await self._seed_last_seen(future_last_seen)
        async with AsyncSessionLocal() as session:
            with patch("app.services.license_manager.is_offline_only_mode", return_value=False):
                state = await lm.get_license_state(session)
        self.assertEqual(state, STATE_CLOCK_TAMPERED)

    # ── Offline cache integration ─────────────────────────────────────────

    async def test_offline_cache_reads_from_db(self):
        """Cache seeded in real SQLite → get_license_state reads it correctly."""
        from app.database import AsyncSessionLocal
        cached = _build_cached({"expiry_date": "2099-12-31"})
        async with AsyncSessionLocal() as session:
            await lm._cache_license(session, cached)  # type: ignore[attr-defined]
            await session.commit()
        async with AsyncSessionLocal() as session:
            with patch("app.services.license_manager.is_offline_only_mode", return_value=True):
                with patch("app.services.license_manager.get_last_seen_timestamp", return_value=None):
                    with patch("app.services.license_manager._get_today", return_value=date(2026, 7, 22)):
                        state = await lm.get_license_state(session)
        self.assertEqual(state, STATE_ACTIVE)

    async def test_offline_cache_expired_in_db(self):
        """Cache with past expiry → get_license_state returns EXPIRED."""
        from app.database import AsyncSessionLocal
        cached = _build_cached({"expiry_date": "2025-01-01"})
        async with AsyncSessionLocal() as session:
            await lm._cache_license(session, cached)  # type: ignore[attr-defined]
            await session.commit()
        async with AsyncSessionLocal() as session:
            with patch("app.services.license_manager.is_offline_only_mode", return_value=True):
                with patch("app.services.license_manager.get_last_seen_timestamp", return_value=None):
                    with patch("app.services.license_manager._get_today", return_value=date(2026, 7, 22)):
                        state = await lm.get_license_state(session)
        self.assertEqual(state, STATE_EXPIRED)


if __name__ == "__main__":
    unittest.main()
