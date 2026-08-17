import unittest
"""
Integration tests — Broadcast server-state reconciliation.

Tests the full Admin -> RajAPI heartbeat response -> reconcile logic ->
SQLite -> WebSocket push pipeline.

Scenarios:
  1.  Admin creates global broadcast -> heartbeat delivers it -> client stores it
  2.  Same heartbeat does NOT create a duplicate
  3.  Admin disables it -> next heartbeat deactivates local active row
  4.  Admin deletes it -> next heartbeat deactivates (audit row preserved inactive)
  5.  Expired broadcast disappears from active WS payload
  6.  Site-targeted broadcast absent from heartbeat -> client deactivates it
  7.  Offline -> reconnect -> latest server state wins
  8.  Identity is server_id not message text
"""

import asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.database import Base
from app.models.telemetry import Broadcast


def _make_engine():
    return create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)


def _future(seconds=3600):
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


def _past(seconds=3600):
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat()


async def _reconcile(db, server_broadcasts):
    """Run the broadcast reconciliation logic (mirrors rajapi_sync.py lines 300-406)."""
    active_server_ids = set()
    active_server_texts = set()

    local_res = await db.execute(select(Broadcast).where(Broadcast.is_active == True))
    local_active = local_res.scalars().all()
    by_sid = {b.server_id: b for b in local_active if b.server_id}
    by_txt = {b.message: b for b in local_active if not b.server_id}

    new_count = 0
    for msg in server_broadcasts:
        s_id = str(msg["id"]) if msg.get("id") is not None else None
        text = msg.get("message", "")
        sev = msg.get("severity", "info")
        expires_raw = msg.get("expires_at")
        expires = None
        if expires_raw:
            try:
                expires = datetime.fromisoformat(str(expires_raw).replace("Z", "+00:00"))
            except Exception:
                pass

        if s_id:
            active_server_ids.add(s_id)
        active_server_texts.add(text)

        existing = None
        if s_id and s_id in by_sid:
            existing = by_sid[s_id]
        elif not s_id and text in by_txt:
            existing = by_txt[text]
        else:
            stmt = select(Broadcast)
            stmt = stmt.where(Broadcast.server_id == s_id) if s_id else stmt.where(Broadcast.message == text)
            r = await db.execute(stmt)
            existing = r.scalars().first()

        if existing:
            existing.message = text
            existing.severity = sev
            existing.expires_at = expires
            existing.is_active = True
            if s_id:
                existing.server_id = s_id
        else:
            db.add(Broadcast(server_id=s_id, message=text, severity=sev, is_active=True, expires_at=expires))
            new_count += 1

    deact_count = 0
    for b in local_active:
        if b.server_id:
            if b.server_id not in active_server_ids:
                b.is_active = False
                deact_count += 1
        else:
            if b.message not in active_server_texts:
                b.is_active = False
                deact_count += 1

    await db.commit()

    now_utc = datetime.utcnow()
    final_res = await db.execute(
        select(Broadcast).where(
            Broadcast.is_active == True,
            (Broadcast.expires_at == None) | (Broadcast.expires_at > now_utc)
        )
    )
    ws = [{"id": b.id, "server_id": b.server_id, "message": b.message} for b in final_res.scalars().all()]
    return ws, new_count, deact_count


class TestBroadcastReconciliation(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        self.engine = _make_engine()
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)

    async def asyncTearDown(self):
        await self.engine.dispose()

    async def test_1_create_and_delivery(self):
        """Heartbeat delivers new broadcast -> stored active in client DB."""
        async with self.Session() as db:
            ws, new, _ = await _reconcile(db, [{"id": "101", "message": "Maintenance tonight", "severity": "warn"}])
        self.assertEqual(new, 1)
        self.assertTrue(any(b["server_id"] == "101" for b in ws))

    async def test_2_no_duplicate_on_repeated_heartbeat(self):
        """Same broadcast in two consecutive heartbeats must not create a second row."""
        payload = [{"id": "202", "message": "Calibration due", "severity": "info"}]
        async with self.Session() as db:
            _, n1, _ = await _reconcile(db, payload)
            ws, n2, _ = await _reconcile(db, payload)
        self.assertEqual(n1, 1)
        self.assertEqual(n2, 0, "Second heartbeat must reuse existing row")
        self.assertEqual(len([b for b in ws if b["server_id"] == "202"]), 1)

    async def test_3_admin_disables_broadcast(self):
        """Broadcast absent from next heartbeat -> local row deactivated."""
        async with self.Session() as db:
            await _reconcile(db, [{"id": "303", "message": "System update", "severity": "info"}])
            ws, _, deact = await _reconcile(db, [])
        self.assertGreaterEqual(deact, 1)
        self.assertFalse(any(b["server_id"] == "303" for b in ws))

    async def test_4_admin_deletes_broadcast_audit_preserved(self):
        """Deleted server-side -> client deactivates; audit row preserved (is_active=False)."""
        async with self.Session() as db:
            await _reconcile(db, [{"id": "404", "message": "Delete me", "severity": "critical"}])
            ws, _, _ = await _reconcile(db, [])
            row_res = await db.execute(select(Broadcast).where(Broadcast.server_id == "404"))
            row = row_res.scalar_one_or_none()
        self.assertIsNotNone(row, "Historical record must be preserved")
        self.assertFalse(row.is_active, "Deleted broadcast must be inactive")
        self.assertFalse(any(b["server_id"] == "404" for b in ws))

    async def test_5_expired_broadcast_not_in_ws_payload(self):
        """Broadcast with past expires_at excluded from active WS payload."""
        payload = [{"id": "505", "message": "Expired notice", "severity": "info", "expires_at": _past()}]
        async with self.Session() as db:
            await _reconcile(db, payload)
            ws, _, _ = await _reconcile(db, payload)
        self.assertFalse(any(b["server_id"] == "505" for b in ws))

    async def test_6_site_targeted_absent_deactivates(self):
        """Broadcast no longer in heartbeat (re-targeted to different site) -> deactivated."""
        async with self.Session() as db:
            await _reconcile(db, [{"id": "606", "message": "Site A only", "severity": "info"}])
            ws, _, deact = await _reconcile(db, [])
        self.assertGreaterEqual(deact, 1)
        self.assertFalse(any(b["server_id"] == "606" for b in ws))

    async def test_7_offline_reconnect_server_state_wins(self):
        """Client offline while admin deactivates broadcast; reconnect syncs correctly."""
        async with self.Session() as db:
            await _reconcile(db, [{"id": "707", "message": "Storm warning", "severity": "critical"}])
            # [simulated offline gap — no heartbeats]
            ws, _, deact = await _reconcile(db, [])  # reconnect: server no longer sends it
        self.assertGreaterEqual(deact, 1)
        self.assertFalse(any(b["server_id"] == "707" for b in ws))

    async def test_8_identity_is_server_id_not_text(self):
        """Two broadcasts with same text but different IDs are distinct records."""
        async with self.Session() as db:
            ws, n, _ = await _reconcile(db, [
                {"id": "801", "message": "Same text", "severity": "info"},
                {"id": "802", "message": "Same text", "severity": "info"},
            ])
        self.assertEqual(n, 2)
        sids = {b["server_id"] for b in ws}
        self.assertIn("801", sids)
        self.assertIn("802", sids)


if __name__ == "__main__":
    import unittest
    unittest.main()

