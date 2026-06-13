"""
UltrON — WebSocket Connection Manager
Handles live push to all connected dashboard clients.
"""

import asyncio
import json
from datetime import datetime
from typing import Dict, Set
from fastapi import WebSocket
from app.core.logger import get_logger

log = get_logger("ultron.websocket")


class ConnectionManager:
    """
    Manages all active WebSocket connections.

    Supports:
    - Global broadcast (all clients)
    - Per-station broadcast
    - Per-client targeted messages
    """

    def __init__(self):
        self._connections: Set[WebSocket] = set()
        self._station_subs: Dict[int, Set[WebSocket]] = {}  # station_id → clients

    async def connect(self, ws: WebSocket, station_ids: list[int] = None):
        await ws.accept()
        self._connections.add(ws)
        if station_ids:
            for sid in station_ids:
                self._station_subs.setdefault(sid, set()).add(ws)
        log.info(f"WS client connected. Total: {len(self._connections)}")

    def disconnect(self, ws: WebSocket):
        self._connections.discard(ws)
        for sid_set in self._station_subs.values():
            sid_set.discard(ws)
        log.info(f"WS client disconnected. Total: {len(self._connections)}")

    async def broadcast(self, payload: dict):
        """Send to ALL connected clients."""
        if not self._connections:
            return
        data = json.dumps(payload, default=str)
        dead: list[WebSocket] = []
        for ws in list(self._connections):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def broadcast_station(self, station_id: int, payload: dict):
        """Send only to clients subscribed to a specific station."""
        targets = self._station_subs.get(station_id, set())
        if not targets:
            return
        data = json.dumps(payload, default=str)
        dead: list[WebSocket] = []
        for ws in list(targets):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def send_alarm(self, alarm_payload: dict):
        """Broadcast an alarm event to all clients."""
        payload = {"type": "alarm", **alarm_payload}
        await self.broadcast(payload)

    async def send_heartbeat(self):
        """Periodic heartbeat so clients know the server is alive."""
        await self.broadcast({
            "type": "heartbeat",
            "ts": datetime.utcnow().isoformat(),
            "clients": len(self._connections),
        })

    @property
    def client_count(self) -> int:
        return len(self._connections)


# ─── Singleton ────────────────────────────────────────────────────────────────
ws_manager = ConnectionManager()
