"""
UltrON — ISEO TCP Protocol Reader
Dedicated handler for ISEO/NKSS environmental monitoring devices.

Protocol variants auto-detected from response:
  Type A (PM10/PM2.5): Binary — response wrapped in ACK(0x06)/ETX(0x03),
    value encoded as "M" + 10 ASCII digits (last 4 digits × 0.01)
  Type B (SO2/NO/NO2/NOx): ASCII — space-delimited fields, newline terminated,
    value extracted by field index

Device config fields used:
  host, port, request_hex, response_delimiter (etx|newline), timeout
Parameter config fields used:
  register_address = field index (ASCII), scale_factor = decimal multiplier
"""

import asyncio
import re
from typing import Optional
from app.core.logger import get_logger

log = get_logger("ultron.iseo_tcp")


def _hex_to_bytes(hex_str: Optional[str]) -> Optional[bytes]:
    if not hex_str:
        return None
    try:
        parts = hex_str.strip().replace(",", " ").split()
        return bytes(int(b, 16) for b in parts if b)
    except Exception as e:
        log.error(f"Invalid hex string '{hex_str}': {e}")
        return None


class IseoTCPReader:

    def __init__(
        self,
        host: str,
        port: int,
        timeout: int = 5,
        request_hex: Optional[str] = None,
        response_delimiter: str = "etx",
    ):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.request_bytes = _hex_to_bytes(request_hex)
        self.response_delimiter = response_delimiter
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
            log.info(f"ISEO TCP connected → {self.host}:{self.port}")
            return True
        except asyncio.TimeoutError:
            log.error(f"ISEO TCP connect timeout ({self.timeout}s) → {self.host}:{self.port}")
            self._reader = self._writer = None
            return False
        except Exception as e:
            log.error(f"ISEO TCP connect failed ({self.host}:{self.port}): {e}")
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

    async def _read_response(self) -> Optional[bytes]:
        if not self._reader:
            return None
        try:
            if self.response_delimiter == "etx":
                data = bytearray()
                while True:
                    b = await asyncio.wait_for(
                        self._reader.readexactly(1), timeout=self.timeout
                    )
                    data.extend(b)
                    if b == b"\x03":
                        break
                return bytes(data)
            else:
                data = await asyncio.wait_for(
                    self._reader.readline(), timeout=self.timeout
                )
                return data
        except asyncio.IncompleteReadError:
            return None
        except asyncio.TimeoutError:
            return None

    @staticmethod
    def _extract_binary(raw: bytes, scale_factor: float = 0.01) -> Optional[float]:
        try:
            text = raw.decode("utf-8", errors="ignore").strip("\x06\x03").strip()
        except Exception:
            return None
        matches = re.findall(r"M(\d{10})", text)
        raw_str = None
        if len(matches) >= 2:
            raw_str = matches[1]
        elif len(matches) == 1:
            raw_str = matches[0]
        if raw_str:
            try:
                return int(raw_str) * scale_factor
            except (ValueError, TypeError):
                return None
        return None

    @staticmethod
    def _extract_ascii(text: str, field_index: int = 1) -> Optional[float]:
        parts = text.split()
        if field_index < len(parts):
            try:
                return float(parts[field_index])
            except (ValueError, IndexError):
                return None
        return None

    @staticmethod
    def _is_binary_response(raw: bytes) -> bool:
        return len(raw) > 0 and raw[0] == 0x06

    async def poll_parameters(self, parameters: list[dict]) -> list[dict]:
        if not await self._ensure_connected():
            for p in parameters:
                return [{"parameter_id": p["id"], "value": None, "raw_value": None, "quality": "E"} for p in parameters]

        raw: Optional[bytes] = None
        try:
            if self.request_bytes:
                self._writer.write(self.request_bytes)
                await self._writer.drain()
            raw = await self._read_response()
        except Exception as e:
            log.error(f"ISEO TCP poll error ({self.host}:{self.port}): {e}")
            await self.close()

        if raw is None:
            await self.close()
            return [{"parameter_id": p["id"], "value": None, "raw_value": None, "quality": "E"} for p in parameters]

        is_binary = self._is_binary_response(raw)
        text = raw.decode("utf-8", errors="ignore").strip()

        results = []
        for p in parameters:
            field_idx = p.get("register_address", 1)
            sf = p.get("scale_factor", 0.01 if is_binary else 1.0)

            if is_binary:
                raw_val = self._extract_binary(raw, sf)
            else:
                raw_val = self._extract_ascii(text, field_idx)

            quality = "U" if raw_val is not None else "E"
            value = round(raw_val, 2) if raw_val is not None else None

            results.append({
                "parameter_id": p["id"],
                "value": value,
                "raw_value": raw_val,
                "quality": quality,
            })

        return results
