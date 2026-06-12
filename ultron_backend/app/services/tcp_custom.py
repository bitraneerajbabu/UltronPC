"""
UltrON — TCP Custom Parser Service
Connects to a raw TCP socket and parses proprietary ASCII/binary frames.
Also handles CSV-over-TCP streams.
"""

import asyncio
import csv
import io
from typing import Optional
from app.core.logger import get_logger

log = get_logger("ultron.tcp_custom")


class TCPCustomReader:
    """
    Generic async TCP client for proprietary industrial protocols.
    Sends an optional request frame, reads a response, and maps values
    by byte/field position.
    """

    def __init__(self, host: str, port: int, timeout: int = 5):
        self.host = host
        self.port = port
        self.timeout = timeout
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None

    def _is_connected(self) -> bool:
        return (
            self._reader is not None
            and self._writer is not None
            and not self._writer.is_closing()
        )

    async def _ensure_connected(self) -> bool:
        if self._is_connected():
            return True
        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=self.timeout,
            )
            log.info(f"TCP connected → {self.host}:{self.port}")
            return True
        except asyncio.TimeoutError:
            log.error(f"TCP connect timeout ({self.timeout}s) → {self.host}:{self.port}")
            self._reader = self._writer = None
            return False
        except Exception as e:
            log.error(f"TCP connect failed ({self.host}:{self.port}): {e}")
            self._reader = self._writer = None
            return False

    async def close(self):
        if self._writer:
            try:
                self._writer.close()
                await asyncio.wait_for(self._writer.wait_closed(), timeout=2.0)
            except Exception:
                pass
        self._reader = None
        self._writer = None

    async def send_request(self, request_bytes: bytes) -> Optional[bytes]:
        """Send raw bytes and read response until newline or timeout."""
        if not await self._ensure_connected():
            return None
        try:
            self._writer.write(request_bytes)
            await self._writer.drain()
            response = await asyncio.wait_for(
                self._reader.readline(),
                timeout=self.timeout,
            )
            return response
        except asyncio.TimeoutError:
            log.error(f"TCP request timeout → {self.host}:{self.port}")
            await self.close()
            return None
        except Exception as e:
            log.error(f"TCP request error ({self.host}:{self.port}): {e}")
            await self.close()
            return None

    async def read_line(self) -> Optional[str]:
        """
        Read one line from the TCP stream and return as decoded string.
        Reconnects automatically on failure.
        """
        if not await self._ensure_connected():
            return None
        try:
            line = await asyncio.wait_for(
                self._reader.readline(),
                timeout=self.timeout,
            )
            if not line:
                # Server closed connection
                await self.close()
                return None
            return line.decode("utf-8", errors="ignore").strip()
        except asyncio.TimeoutError:
            log.warning(f"TCP readline timeout → {self.host}:{self.port}")
            await self.close()
            return None
        except Exception as e:
            log.error(f"TCP readline error ({self.host}:{self.port}): {e}")
            await self.close()
            return None

    async def read_csv_line(self) -> Optional[dict]:
        """
        Read one CSV line from the TCP stream and return as {field_index: value}.
        Used for CSV-over-TCP instruments (e.g. weather stations, gas analyzers).
        """
        decoded = await self.read_line()
        if not decoded:
            return None
        try:
            reader = csv.reader(io.StringIO(decoded))
            fields = next(reader, [])
            return {i: v.strip() for i, v in enumerate(fields)}
        except Exception as e:
            log.error(f"TCP CSV parse error: {e}")
            return None

    async def poll_parameters(self, parameters: list[dict]) -> list[dict]:
        """
        Map CSV field positions to parameter values.
        Each parameter uses 'register_address' as the CSV column index.
        """
        row = await self.read_csv_line()
        results = []
        for p in parameters:
            col_idx = p.get("register_address", 0)
            raw_str = row.get(col_idx) if row else None
            try:
                raw_val = float(raw_str) if raw_str not in (None, "", "N/A", "---") else None
            except (ValueError, TypeError):
                raw_val = None

            quality = "good" if raw_val is not None else "comms_fail"
            value = None
            if raw_val is not None:
                sf = p.get("scale_factor", 1.0) or 1.0
                off = p.get("offset", 0.0) or 0.0
                value = (raw_val * sf) + off

            results.append({
                "parameter_id": p["id"],
                "value": value,
                "raw_value": raw_val,
                "quality": quality,
            })
        return results
