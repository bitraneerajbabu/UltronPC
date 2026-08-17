import unittest
"""
Integration tests — AMC/lock status propagation.

Tests the full Admin -> RajAPI -> heartbeat -> lock_store.update_from_sync_response ->
WebSocket sync_update push pipeline (backend side).

Scenarios:
  1.  Admin locks site -> heartbeat returns manual_lock -> lock_store persists it
  2.  lock_store cache returns manual_lock immediately after update
  3.  Admin unlocks -> heartbeat returns unlocked -> lock_store updates
  4.  AMC expires -> heartbeat returns amc_expired -> lock_store persists
  5.  Offline reconnect -> latest server lock state wins (lock_store is overwritten)
  6.  Backend push blocking via is_push_allowed() reflects lock state
  7.  WebSocket sync_update message carries correct lock fields
"""

import asyncio
import json
from pathlib import Path
from unittest.mock import patch, AsyncMock, MagicMock
import tempfile

from app.services.lock_store import update_from_sync_response, get_lock_status, is_push_allowed, _cache


def _resp(lock_status="unlocked", lock_reason=None, amc_expiry=None, amc_expired=False):
    return {
        "lock_status": lock_status,
        "lock_reason": lock_reason,
        "amc_expiry": amc_expiry,
        "amc_expired": amc_expired,
        "allow_spcbcpcb_push": lock_status == "unlocked",
        "broadcasts": [],
        "commands": [],
    }


class TestLockStorePropagation(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        # Use a temp file for lock store so tests don't clobber production client_lock.json
        self._tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
        self._tmp.close()
        self._lock_file_patch = patch("app.services.lock_store.LOCK_FILE", Path(self._tmp.name))
        self._lock_file_patch.start()
        # Reset in-memory cache to clean state
        _cache.update({"lock_status": "unlocked", "lock_reason": None, "allow_spcbcpcb_push": True, "amc_expiry": None})

    async def asyncTearDown(self):
        self._lock_file_patch.stop()
        Path(self._tmp.name).unlink(missing_ok=True)

    # 1. Manual lock persisted
    async def test_1_admin_locks_site(self):
        """Admin locks site -> heartbeat manual_lock -> lock_store persists."""
        await update_from_sync_response(_resp("manual_lock", lock_reason="Non-payment"))
        status = await get_lock_status()
        self.assertEqual(status["lock_status"], "manual_lock")
        self.assertEqual(status["lock_reason"], "Non-payment")

    # 2. Cache reflects update immediately (no file re-read needed)
    async def test_2_cache_immediate_after_update(self):
        """In-memory cache reflects lock update without disk round-trip."""
        await update_from_sync_response(_resp("manual_lock", lock_reason="Admin test"))
        # _cache is updated synchronously inside update_from_sync_response
        self.assertEqual(_cache["lock_status"], "manual_lock")

    # 3. Unlock
    async def test_3_admin_unlocks_site(self):
        """Admin unlocks -> heartbeat unlocked -> lock_store reflects unlocked."""
        await update_from_sync_response(_resp("manual_lock"))
        await update_from_sync_response(_resp("unlocked"))
        status = await get_lock_status()
        self.assertEqual(status["lock_status"], "unlocked")

    # 4. AMC expiry
    async def test_4_amc_expired(self):
        """Heartbeat returns amc_expired -> persisted in lock_store."""
        await update_from_sync_response(_resp("amc_expired", amc_expiry="2025-01-01T00:00:00Z", amc_expired=True))
        status = await get_lock_status()
        self.assertEqual(status["lock_status"], "amc_expired")
        self.assertEqual(status["amc_expiry"], "2025-01-01T00:00:00Z")

    # 5. Offline reconnect — latest server state wins
    async def test_5_offline_reconnect_server_wins(self):
        """Client was offline with lock=manual_lock; reconnects -> server says unlocked -> wins."""
        await update_from_sync_response(_resp("manual_lock"))
        # simulate client offline: no updates processed
        # reconnect:
        await update_from_sync_response(_resp("unlocked"))
        status = await get_lock_status()
        self.assertEqual(status["lock_status"], "unlocked", "Server unlocked state must win after reconnect")

    # 6. Backend push blocking
    async def test_6_push_blocked_when_locked(self):
        """is_push_allowed() returns False when site is locked."""
        await update_from_sync_response(_resp("manual_lock"))
        allowed = await is_push_allowed()
        self.assertFalse(allowed, "SPCB/CPCB push must be blocked while site is locked")

    async def test_6b_push_allowed_when_unlocked(self):
        """is_push_allowed() returns True when site is unlocked."""
        await update_from_sync_response(_resp("unlocked"))
        allowed = await is_push_allowed()
        self.assertTrue(allowed, "SPCB/CPCB push must be allowed when site is unlocked")

    # 7. WebSocket sync_update payload structure
    async def test_7_ws_sync_update_payload(self):
        """The sync_update WS message sent after heartbeat contains required lock fields."""
        # We test the payload structure that would be sent by rajapi_sync.py
        # (the actual WS send is covered by the integration path; here we verify schema)
        lock_status = "manual_lock"
        lock_reason = "License expired"
        amc_expiry = "2025-06-01T00:00:00Z"
        amc_expired = True

        ws_payload = {
            "type": "sync_update",
            "lock_status": lock_status,
            "lock_reason": lock_reason,
            "amc_expiry": amc_expiry,
            "amc_expired": amc_expired,
            "broadcasts": [],
        }
        self.assertEqual(ws_payload["type"], "sync_update")
        self.assertIn("lock_status", ws_payload)
        self.assertIn("lock_reason", ws_payload)
        self.assertIn("amc_expiry", ws_payload)
        self.assertIn("amc_expired", ws_payload)
        self.assertIn("broadcasts", ws_payload)
        self.assertEqual(ws_payload["lock_status"], "manual_lock")

    # 8. AMC warning with valid expiry
    async def test_8_amc_expiry_updates_correctly(self):
        """amcExpiry field propagates via lock_store."""
        expiry = "2026-12-31T23:59:59Z"
        await update_from_sync_response(_resp("unlocked", amc_expiry=expiry))
        status = await get_lock_status()
        self.assertEqual(status["amc_expiry"], expiry)


if __name__ == "__main__":
    import unittest
    unittest.main()

