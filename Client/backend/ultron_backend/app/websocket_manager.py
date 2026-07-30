"""
UltrON — WebSocket Connection Manager
Handles live push to all connected dashboard clients.
"""

import asyncio
import json
from datetime import datetime
from typing import Set
from fastapi import WebSocket
from app.core.logger import get_logger

log = get_logger("ultron.websocket")


class ConnectionManager:
    """
    Manages all active WebSocket connections.

    Supports:
    - Global broadcast (all clients)
    - Per-client targeted messages
    """

    def __init__(self):
        self._connections: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.add(ws)
        log.info(f"WS client connected. Total: {len(self._connections)}")

    def disconnect(self, ws: WebSocket):
        self._connections.discard(ws)
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
