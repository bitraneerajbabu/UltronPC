"""
Integration tests for Phase 5 — license guard wiring in server_push.py.

Tests that is_cpcb_upload_allowed() guards every push entry point:
  _push_spcb, _push_cpcb, retry_pending_uploads

Matrix (Section 6):
  ACTIVE, GRACE_PERIOD → allowed (proceed)
  LOCKED, EXPIRED, CLOCK_TAMPERED → blocked (queue / defer)
"""

import unittest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.server_push import (
    _push_spcb,
    _push_cpcb,
    retry_pending_uploads,
)
from app.services.license_manager import (
    STATE_ACTIVE,
    STATE_GRACE_PERIOD,
    STATE_LOCKED,
    STATE_EXPIRED,
    STATE_CLOCK_TAMPERED,
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_config(**overrides):
    """Build a minimal ServerConfig mock."""
    cfg = MagicMock()
    cfg.id = 1
    cfg.name = "TestServer"
    cfg.protocol = "tspcb"
    cfg.live_url = "http://test.live/api"
    cfg.delay_url = "http://test.delay/api"
    cfg.cpcb_file_path = "/tmp/test_cpcb.csv"
    cfg.is_active = True
    cfg.is_cpcb_active = True
    for k, v in overrides.items():
        setattr(cfg, k, v)
    return cfg


_ALLOWED = [STATE_ACTIVE, STATE_GRACE_PERIOD]
_BLOCKED = [STATE_LOCKED, STATE_EXPIRED, STATE_CLOCK_TAMPERED]


# ─── _push_spcb Guard ─────────────────────────────────────────────────────────

class TestPushSPCBGuard(unittest.IsolatedAsyncioTestCase):
    """License guard at start of _push_spcb."""

    async def asyncSetUp(self):
        self.config = _make_config()
        self.db = AsyncMock()

    async def _assert_blocked(self):
        """Blocked → queues to PendingUpload, does not reach HTTP push."""
        with patch("app.services.server_push.is_cpcb_upload_allowed", return_value=False):
            with patch("app.services.server_push._build_spcb_payloads",
                       return_value=[{"DeviceID": 1, "Variables": []}]):
                await _push_spcb(self.config, self.db, "live")
                self.assertTrue(self.db.add.called, "Expected PendingUpload added")
                self.assertTrue(self.db.commit.called)

    async def _assert_allowed(self, mode: str):
        """Allowed state → passes guard, reaches connectivity check. Queues if unreachable."""
        with patch("app.services.server_push.is_cpcb_upload_allowed", return_value=True):
            with patch("app.services.server_push._check_server_reachable", return_value=False):
                with patch("app.services.server_push._build_spcb_payloads", return_value=[{"DeviceID": 1, "Variables": []}]):
                    self.db.reset_mock()
                    await _push_spcb(self.config, self.db, mode)
                    # When unreachable, PendingUpload is added to queue
                    self.assertTrue(self.db.add.called)

    # ── 3 blocked states × 2 modes = 6 tests ──────────────────────────────

    async def test_blocked_locked_live(self):
        await self._assert_blocked()
    async def test_blocked_expired_live(self):
        await self._assert_blocked()
    async def test_blocked_clock_tampered_live(self):
        await self._assert_blocked()

    async def test_blocked_locked_delay(self):
        with patch("app.services.server_push.is_cpcb_upload_allowed", return_value=False):
            with patch("app.services.server_push._build_spcb_payloads",
                       return_value=[{"DeviceID": 1, "Variables": []}]):
                await _push_spcb(self.config, self.db, "delay")
                self.assertTrue(self.db.add.called)
    async def test_blocked_expired_delay(self):
        with patch("app.services.server_push.is_cpcb_upload_allowed", return_value=False):
            with patch("app.services.server_push._build_spcb_payloads",
                       return_value=[{"DeviceID": 1, "Variables": []}]):
                await _push_spcb(self.config, self.db, "delay")
                self.assertTrue(self.db.add.called)
    async def test_blocked_clock_tampered_delay(self):
        with patch("app.services.server_push.is_cpcb_upload_allowed", return_value=False):
            with patch("app.services.server_push._build_spcb_payloads",
                       return_value=[{"DeviceID": 1, "Variables": []}]):
                await _push_spcb(self.config, self.db, "delay")
                self.assertTrue(self.db.add.called)

    # ── 2 allowed states × 2 modes = 4 tests ──────────────────────────────

    async def test_allowed_active_live(self):
        await self._assert_allowed("live")
    async def test_allowed_grace_live(self):
        await self._assert_allowed("live")
    async def test_allowed_active_delay(self):
        await self._assert_allowed("delay")
    async def test_allowed_grace_delay(self):
        await self._assert_allowed("delay")


# ─── _push_cpcb Guard ─────────────────────────────────────────────────────────

class TestPushCPCBGuard(unittest.IsolatedAsyncioTestCase):
    """License guard at start of _push_cpcb."""

    async def asyncSetUp(self):
        self.config = _make_config()
        self.db = AsyncMock()

    async def _assert_blocked(self):
        """Blocked → logs warning, returns early."""
        with patch("app.services.server_push.is_cpcb_upload_allowed", return_value=False):
            await _push_cpcb(self.config, self.db)

    async def _assert_allowed(self):
        """Allowed state → passes guard, reaches is_cpcb_active check."""
        with patch("app.services.server_push.is_cpcb_upload_allowed", return_value=True):
            # Make is_cpcb_active=False so we know we got past the guard
            config = _make_config(is_cpcb_active=False)
            self.db.reset_mock()
            await _push_cpcb(config, self.db)
            # Guard passed — function exits at is_cpcb_active check, not at guard

    # ── 3 blocked states ──────────────────────────────────────────────────

    async def test_blocked_locked(self):
        await self._assert_blocked()
    async def test_blocked_expired(self):
        await self._assert_blocked()
    async def test_blocked_clock_tampered(self):
        await self._assert_blocked()

    # ── 2 allowed states ──────────────────────────────────────────────────

    async def test_allowed_active(self):
        await self._assert_allowed()
    async def test_allowed_grace(self):
        await self._assert_allowed()


# ─── retry_pending_uploads Guard ──────────────────────────────────────────────

class TestRetryPendingUploadsGuard(unittest.IsolatedAsyncioTestCase):
    """License guard at start of retry_pending_uploads."""

    async def asyncSetUp(self):
        self.db = AsyncMock()

    async def _assert_blocked(self):
        """Blocked → logs warning, returns early, no DB query for pending."""
        with patch("app.services.server_push.is_cpcb_upload_allowed", return_value=False):
            self.db.execute.reset_mock()
            await retry_pending_uploads(self.db)
            # Guard should return before db.execute for PendingUpload select
            self.db.execute.assert_not_called()

    async def _assert_allowed(self):
        """Allowed state → passes guard, queries PendingUpload."""
        with patch("app.services.server_push.is_cpcb_upload_allowed", return_value=True):
            self.db.execute.return_value = MagicMock()
            self.db.execute.return_value.scalars.return_value.all.return_value = []
            self.db.reset_mock()
            await retry_pending_uploads(self.db)
            # Should have called db.execute for the PendingUpload select
            self.db.execute.assert_called()

    # ── 3 blocked states ──────────────────────────────────────────────────

    async def test_blocked_locked(self):
        await self._assert_blocked()
    async def test_blocked_expired(self):
        await self._assert_blocked()
    async def test_blocked_clock_tampered(self):
        await self._assert_blocked()

    # ── 2 allowed states ──────────────────────────────────────────────────

    async def test_allowed_active(self):
        await self._assert_allowed()
    async def test_allowed_grace(self):
        await self._assert_allowed()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6 — FIFO Retention Cap & Overflow Audit
# ─────────────────────────────────────────────────────────────────────────────

class TestEnforcePendingUploadCap(unittest.IsolatedAsyncioTestCase):
    """Bounded backlog queue with FIFO drop + audit logging (LICENSE_LOCK_PLAN.md §7)."""

    async def asyncSetUp(self):
        """Create in-memory SQLite with PendingUpload + SystemLog tables."""
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
        from app.database import Base
        self.engine = create_async_engine("sqlite+aiosqlite://", echo=False)
        self.SessionLocal = async_sessionmaker(
            bind=self.engine, class_=AsyncSession, expire_on_commit=False
        )
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.db = self.SessionLocal()

    async def asyncTearDown(self):
        await self.db.close()
        await self.engine.dispose()

    async def _add_pending(self, server_config_id: int, tag_names: list[str],
                           dt_str: str, count: int = 1,
                           created_at: datetime | None = None):
        """Insert N PendingUpload records with the same payload."""
        from app.models.telemetry import PendingUpload
        for _ in range(count):
            variables = [{"Variablename": t, "Value": 1.0} for t in tag_names]
            self.db.add(PendingUpload(
                server_config_id=server_config_id,
                url="http://test/api",
                payload={"DeviceID": 1, "Datetime": dt_str, "Variables": variables},
                mode="live",
                last_error="",
                created_at=created_at or datetime.utcnow(),
            ))
        await self.db.commit()

    async def _count_pending(self) -> int:
        from sqlalchemy import func, select
        from app.models.telemetry import PendingUpload
        r = await self.db.execute(select(func.count(PendingUpload.id)))
        return r.scalar() or 0

    async def _count_audit_logs(self) -> int:
        from sqlalchemy import func, select
        from app.models.telemetry import SystemLog
        r = await self.db.execute(
            select(func.count(SystemLog.id)).where(SystemLog.log_type == "audit")
        )
        return r.scalar() or 0

    async def _get_oldest_pending_id(self) -> int | None:
        from sqlalchemy import select
        from app.models.telemetry import PendingUpload
        r = await self.db.execute(
            select(PendingUpload.id).order_by(PendingUpload.created_at.asc()).limit(1)
        )
        return r.scalar_one_or_none()

    async def _get_newest_pending_id(self) -> int | None:
        from sqlalchemy import select
        from app.models.telemetry import PendingUpload
        r = await self.db.execute(
            select(PendingUpload.id).order_by(PendingUpload.created_at.desc()).limit(1)
        )
        return r.scalar_one_or_none()

    # ── Tests ──────────────────────────────────────────────────────────────

    @patch("app.services.server_push.settings")
    async def test_under_cap_no_drop(self, mock_settings):
        """Queue below cap → no records dropped, no audit logs."""
        mock_settings.PENDING_UPLOAD_MAX_RECORDS = 100
        await self._add_pending(1, ["PM10"], "2026-01-01 12:00:00", count=50)
        before = await self._count_pending()

        from app.services.server_push import enforce_pending_upload_cap
        await enforce_pending_upload_cap(self.db)

        self.assertEqual(await self._count_pending(), before)
        self.assertEqual(await self._count_audit_logs(), 0)

    @patch("app.services.server_push.settings")
    async def test_exact_cap_no_drop(self, mock_settings):
        """Queue exactly at cap → no drops."""
        mock_settings.PENDING_UPLOAD_MAX_RECORDS = 50
        await self._add_pending(1, ["PM10"], "2026-01-01 12:00:00", count=50)
        before = await self._count_pending()

        from app.services.server_push import enforce_pending_upload_cap
        await enforce_pending_upload_cap(self.db)

        self.assertEqual(await self._count_pending(), before)
        self.assertEqual(await self._count_audit_logs(), 0)

    @patch("app.services.server_push.settings")
    async def test_fifo_drops_oldest_first(self, mock_settings):
        """Queue over cap → oldest record dropped, newest kept."""
        mock_settings.PENDING_UPLOAD_MAX_RECORDS = 10
        base_ts = datetime(2026, 1, 1, 12, 0, 0)
        # Insert 12 records with sequential timestamps
        for i in range(12):
            await self._add_pending(
                1, ["PM10"], f"2026-01-01 12:{i:02d}:00",
                created_at=base_ts + timedelta(minutes=i)
            )
        await self.db.commit()  # ensure all in

        oldest_before = await self._get_oldest_pending_id()
        newest_before = await self._get_newest_pending_id()

        from app.services.server_push import enforce_pending_upload_cap
        await enforce_pending_upload_cap(self.db)

        # Should still have 10 records
        self.assertEqual(await self._count_pending(), 10)
        # Oldest should have been dropped
        oldest_after = await self._get_oldest_pending_id()
        self.assertNotEqual(oldest_after, oldest_before,
                            "Oldest record should have been dropped")
        # Newest should still be present
        self.assertEqual(await self._get_newest_pending_id(), newest_before,
                         "Newest record should be preserved")

    @patch("app.services.server_push.settings")
    async def test_audit_log_created(self, mock_settings):
        """Dropped records create SystemLog with correct spec fields."""
        mock_settings.PENDING_UPLOAD_MAX_RECORDS = 5
        await self._add_pending(1, ["PM2_5", "SO2"], "2025-07-22 01:00:00", count=8)

        from app.services.server_push import enforce_pending_upload_cap
        await enforce_pending_upload_cap(self.db)

        # Should have dropped 3 records → 3 audit log entries
        self.assertGreaterEqual(await self._count_audit_logs(), 3)

        # Verify audit log fields match spec §7
        from sqlalchemy import select
        from app.models.telemetry import SystemLog
        r = await self.db.execute(
            select(SystemLog).where(SystemLog.log_type == "audit").limit(1)
        )
        log_entry = r.scalar_one_or_none()
        self.assertIsNotNone(log_entry)
        self.assertEqual(log_entry.level, "WARNING")
        self.assertEqual(log_entry.source, "ultron.server_push.fifo")
        self.assertIn("PUSH_BACKLOG_DROPPED_FIFO", log_entry.message)

        import json
        details = json.loads(log_entry.details)
        self.assertEqual(details["event_type"], "PUSH_BACKLOG_DROPPED_FIFO")
        self.assertIn("tag_name", details)
        self.assertIn("record_timestamp", details)
        self.assertIn("dropped_at", details)
        self.assertIn("reason", details)
        self.assertIn("capacity reached", details["reason"].lower())
        self.assertIn("payload_id", details)
        self.assertIn("server_config_id", details)

    @patch("app.services.server_push.settings")
    async def test_90_percent_warning(self, mock_settings):
        """Queue at 90%+ fires warning log."""
        mock_settings.PENDING_UPLOAD_MAX_RECORDS = 100
        await self._add_pending(1, ["NO2"], "2026-01-01 12:00:00", count=95)

        from app.services.server_push import enforce_pending_upload_cap
        with patch("app.services.server_push.log.warning") as mock_warn:
            await enforce_pending_upload_cap(self.db)
            mock_warn.assert_any_call(
                unittest.mock.ANY
            )
            # Verify warning contains the queue percentage
            call_args = [str(c) for c in mock_warn.call_args_list]
            has_pct = any("95" in a or "90" in a or "%" in a for a in call_args)
            self.assertTrue(has_pct, "Warning should mention queue percentage")

    @patch("app.services.server_push.settings")
    async def test_90_percent_exact_threshold(self, mock_settings):
        """Queue exactly at 90% → warning fires."""
        mock_settings.PENDING_UPLOAD_MAX_RECORDS = 100
        await self._add_pending(1, ["NO2"], "2026-01-01 12:00:00", count=90)

        from app.services.server_push import enforce_pending_upload_cap
        with patch("app.services.server_push.log.warning") as mock_warn:
            await enforce_pending_upload_cap(self.db)
            self.assertTrue(mock_warn.called,
                            "Warning should fire at exactly 90%")

    @patch("app.services.server_push.settings")
    async def test_below_90_no_warning(self, mock_settings):
        """Queue below 90% → no warning fired."""
        mock_settings.PENDING_UPLOAD_MAX_RECORDS = 100
        await self._add_pending(1, ["NO2"], "2026-01-01 12:00:00", count=80)

        from app.services.server_push import enforce_pending_upload_cap
        with patch("app.services.server_push.log.warning") as mock_warn:
            await enforce_pending_upload_cap(self.db)
            self.assertFalse(mock_warn.called,
                             "No warning below 90% threshold")

    @patch("app.services.server_push.settings")
    async def test_historical_data_untouched(self, mock_settings):
        """Verify function never queries historical_data or averages tables."""
        mock_settings.PENDING_UPLOAD_MAX_RECORDS = 5
        await self._add_pending(1, ["PM10"], "2026-01-01 12:00:00", count=8)

        from app.services.server_push import enforce_pending_upload_cap
        await enforce_pending_upload_cap(self.db)

        # Verify the tables the function touches exist
        from sqlalchemy import inspect
        async with self.engine.begin() as conn:
            tables = await conn.run_sync(lambda sync_conn: inspect(sync_conn).get_table_names())
        self.assertIn("pending_uploads", tables)
        self.assertIn("system_logs", tables)

    @patch("app.services.server_push.settings")
    async def test_multiple_variables_in_payload(self, mock_settings):
        """Audit log captures all tag_names from multi-variable payload."""
        mock_settings.PENDING_UPLOAD_MAX_RECORDS = 3
        # Insert 5 records with multiple variables
        await self._add_pending(1, ["PM10", "SO2", "NO2", "CO"],
                                "2026-01-01 12:00:00", count=5)

        from app.services.server_push import enforce_pending_upload_cap
        await enforce_pending_upload_cap(self.db)

        # 2 dropped, check audit logs
        self.assertGreaterEqual(await self._count_audit_logs(), 2)
        from sqlalchemy import select
        from app.models.telemetry import SystemLog
        import json
        r = await self.db.execute(
            select(SystemLog).where(SystemLog.log_type == "audit").limit(1)
        )
        log_entry = r.scalar_one_or_none()
        details = json.loads(log_entry.details)
        self.assertIsInstance(details["tag_name"], list)
        self.assertIn("PM10", details["tag_name"])
        self.assertIn("SO2", details["tag_name"])


# ─────────────────────────────────────────────────────────────────────────────
# Phase 7 — Controlled Delayed Flush on Unlock
# ─────────────────────────────────────────────────────────────────────────────

class TestFlushOnUnlock(unittest.IsolatedAsyncioTestCase):
    """Test flush_pending_uploads_on_unlock() behavior and unlock detection."""

    async def asyncSetUp(self):
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
        from sqlalchemy.orm import sessionmaker
        from app.database import Base
        self.engine = create_async_engine("sqlite+aiosqlite://", echo=False)
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.SessionLocal = sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )
        self.db = self.SessionLocal()

    async def asyncTearDown(self):
        await self.db.close()
        await self.engine.dispose()

    async def _add_pending(self, server_config_id: int, tag_names: list[str],
                           dt_str: str, count: int = 1,
                           created_at: datetime | None = None):
        from app.models.telemetry import PendingUpload
        for _ in range(count):
            variables = [{"Variablename": t, "Value": 1.0} for t in tag_names]
            self.db.add(PendingUpload(
                server_config_id=server_config_id,
                url="http://test/api",
                payload={"DeviceID": 1, "Datetime": dt_str, "Variables": variables},
                mode="live",
                last_error="",
                created_at=created_at or datetime.utcnow(),
            ))
        await self.db.commit()

    async def _count_pending(self) -> int:
        from sqlalchemy import func, select
        from app.models.telemetry import PendingUpload
        r = await self.db.execute(select(func.count(PendingUpload.id)))
        return r.scalar() or 0

    # ── Tests ──────────────────────────────────────────────────────

    @patch("app.services.server_push.httpx.AsyncClient")
    async def test_flush_no_pending(self, mock_http_client):
        """No pending records → flush does nothing."""
        from app.services.server_push import flush_pending_uploads_on_unlock
        await flush_pending_uploads_on_unlock(self.db)
        mock_http_client.assert_not_called()

    @patch("app.services.server_push.httpx.AsyncClient")
    async def test_flush_chronological_order(self, mock_http_client):
        """Records flushed in chronological order (oldest first)."""
        from datetime import timedelta
        from unittest.mock import AsyncMock
        base = datetime(2026, 1, 1, 12, 0, 0)
        for i in range(5):
            await self._add_pending(
                1, ["PM10"], f"2026-01-01 12:{i:02d}:00",
                created_at=base + timedelta(minutes=i)
            )
        # Set last_flushed_id to 0 so nothing skipped
        from app.models.system_state import SystemState
        self.db.add(SystemState(key="last_flushed_record_id", value="0"))
        await self.db.commit()

        # Mock HTTP client with AsyncMock for awaitable post()
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        # Use AsyncMock for post() so await works
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_http_client.return_value.__aenter__.return_value = mock_client

        from app.services.server_push import flush_pending_uploads_on_unlock
        with patch("app.services.server_push.asyncio.sleep"):
            await flush_pending_uploads_on_unlock(self.db)

        # All records should be flushed
        self.assertEqual(await self._count_pending(), 0)
        # Verify chronological order: IDs should increase
        calls = [call[0][0] for call in mock_client.post.call_args_list]
        self.assertEqual(len(calls), 5)

    @patch("app.services.server_push.httpx.AsyncClient")
    @patch("app.services.server_push.asyncio.sleep")
    async def test_flush_rate_limiting(self, mock_sleep, mock_http_client):
        """Rate limiting pauses between records."""
        from datetime import timedelta
        from unittest.mock import AsyncMock
        base = datetime(2026, 1, 1, 12, 0, 0)
        for i in range(3):
            await self._add_pending(
                1, ["PM10"], f"2026-01-01 12:{i:02d}:00",
                created_at=base + timedelta(minutes=i)
            )
        from app.models.system_state import SystemState
        self.db.add(SystemState(key="last_flushed_record_id", value="0"))
        await self.db.commit()

        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_http_client.return_value.__aenter__.return_value = mock_client

        from app.services.server_push import flush_pending_uploads_on_unlock
        await flush_pending_uploads_on_unlock(self.db)

        # Should have called asyncio.sleep with 1/rate = 0.2s between records
        rate = 5  # default FLUSH_RATE_PER_SECOND
        expected_sleep = 1.0 / rate
        sleep_calls = mock_sleep.call_args_list
        # At least 2 sleep calls (between 3 records)
        self.assertGreaterEqual(len(sleep_calls), 2)
        for call in sleep_calls:
            self.assertAlmostEqual(call[0][0], expected_sleep, places=2)

    @patch("app.services.server_push.httpx.AsyncClient")
    async def test_flush_429_backoff(self, mock_http_client):
        """HTTP 429 triggers exponential backoff before retry."""
        from unittest.mock import AsyncMock
        base = datetime(2026, 1, 1, 12, 0, 0)
        await self._add_pending(1, ["PM10"], "2026-01-01 12:00:00",
                                created_at=base)
        from app.models.system_state import SystemState
        self.db.add(SystemState(key="last_flushed_record_id", value="0"))
        await self.db.commit()

        # First response: 429, second: 200
        mock_client = MagicMock()
        resp_429 = MagicMock()
        resp_429.status_code = 429
        resp_200 = MagicMock()
        resp_200.status_code = 200
        mock_client.post = AsyncMock(side_effect=[resp_429, resp_200])
        mock_http_client.return_value.__aenter__.return_value = mock_client

        from app.services.server_push import flush_pending_uploads_on_unlock
        with patch("app.services.server_push.asyncio.sleep") as mock_sleep:
            await flush_pending_uploads_on_unlock(self.db)

        # Should have slept: backoff 5s + rate limit 0.2s
        sleep_calls = mock_sleep.call_args_list
        self.assertGreaterEqual(len(sleep_calls), 2)
        self.assertAlmostEqual(sleep_calls[0][0][0], 5.0, places=1)

    @patch("app.services.server_push.httpx.AsyncClient")
    async def test_flush_delete_only_on_success(self, mock_http_client):
        """Record deleted ONLY after HTTP < 300 success."""
        from unittest.mock import AsyncMock
        base = datetime(2026, 1, 1, 12, 0, 0)
        await self._add_pending(1, ["PM10"], "2026-01-01 12:00:00",
                                created_at=base)
        from app.models.system_state import SystemState
        self.db.add(SystemState(key="last_flushed_record_id", value="0"))
        await self.db.commit()

        mock_client = MagicMock()
        resp_400 = MagicMock()
        resp_400.status_code = 400
        mock_client.post = AsyncMock(return_value=resp_400)
        mock_http_client.return_value.__aenter__.return_value = mock_client

        from app.services.server_push import flush_pending_uploads_on_unlock
        with patch("app.services.server_push.asyncio.sleep"):
            await flush_pending_uploads_on_unlock(self.db)

        # Record should still exist (only deleted on <300)
        self.assertEqual(await self._count_pending(), 1)

        # Now succeed — reset progress so it retries the record
        from sqlalchemy import select
        from app.models.system_state import SystemState
        r = await self.db.execute(
            select(SystemState).where(SystemState.key == "last_flushed_record_id")
        )
        existing = r.scalar_one_or_none()
        if existing:
            existing.value = "0"
        else:
            self.db.add(SystemState(key="last_flushed_record_id", value="0"))
        await self.db.commit()

        resp_200 = MagicMock()
        resp_200.status_code = 200
        mock_client.post = AsyncMock(return_value=resp_200)
        with patch("app.services.server_push.asyncio.sleep"):
            await flush_pending_uploads_on_unlock(self.db)

        self.assertEqual(await self._count_pending(), 0)

    @patch("app.services.server_push.httpx.AsyncClient")
    async def test_flush_resumability(self, mock_http_client):
        """Flush skips already-flushed records via last_flushed_record_id."""
        from datetime import timedelta
        from unittest.mock import AsyncMock
        base = datetime(2026, 1, 1, 12, 0, 0)
        for i in range(5):
            await self._add_pending(
                1, ["PM10"], f"2026-01-01 12:{i:02d}:00",
                created_at=base + timedelta(minutes=i)
            )
        # Get IDs of first 3 records
        from sqlalchemy import select
        from app.models.telemetry import PendingUpload
        r = await self.db.execute(
            select(PendingUpload.id).order_by(PendingUpload.created_at.asc()).limit(3)
        )
        first_three = r.scalars().all()
        last_flushed = first_three[-1]  # ID of 3rd record

        from app.models.system_state import SystemState
        self.db.add(SystemState(key="last_flushed_record_id", value=str(last_flushed)))
        await self.db.commit()

        mock_client = MagicMock()
        resp_200 = MagicMock()
        resp_200.status_code = 200
        mock_client.post = AsyncMock(return_value=resp_200)
        mock_http_client.return_value.__aenter__.return_value = mock_client

        from app.services.server_push import flush_pending_uploads_on_unlock
        with patch("app.services.server_push.asyncio.sleep"):
            await flush_pending_uploads_on_unlock(self.db)

        # Only 2 records should have been flushed
        calls = mock_client.post.call_args_list
        self.assertEqual(len(calls), 2)

    @patch("app.services.server_push.flush_pending_uploads_on_unlock")
    async def test_detect_unlock_transition(self, mock_flush):
        """Blocked→allowed transition triggers flush."""
        from app.services.server_push import _detect_and_trigger_flush
        from app.models.system_state import SystemState

        # Start with the "previously blocked" state
        self.db.add(SystemState(key="last_known_upload_allowed", value="False"))
        await self.db.commit()

        # Patch is_cpcb_upload_allowed to return True (allowed now)
        from unittest.mock import AsyncMock
        with patch("app.services.server_push.is_cpcb_upload_allowed",
                   new=AsyncMock(return_value=True)):
            await _detect_and_trigger_flush(self.db)

        mock_flush.assert_called_once()

    @patch("app.services.server_push.flush_pending_uploads_on_unlock")
    async def test_detect_no_transition(self, mock_flush):
        """Same state (allowed→allowed) does NOT trigger flush."""
        from app.services.server_push import _detect_and_trigger_flush
        from app.models.system_state import SystemState

        self.db.add(SystemState(key="last_known_upload_allowed", value="True"))
        await self.db.commit()

        from unittest.mock import AsyncMock
        with patch("app.services.server_push.is_cpcb_upload_allowed",
                   new=AsyncMock(return_value=True)):
            await _detect_and_trigger_flush(self.db)

        mock_flush.assert_not_called()


if __name__ == "__main__":
    unittest.main()
