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
        self.response_delimiter = response_delimiter.lower()
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
        
        buffer = bytearray()
        try:
            # We want to read in chunks until we hit the delimiter or timeout
            end_time = asyncio.get_event_loop().time() + self.timeout
            while True:
                time_left = end_time - asyncio.get_event_loop().time()
                if time_left <= 0:
                    log.warning(f"ISEO TCP read timeout for {self.host}:{self.port}")
                    break

                try:
                    chunk = await asyncio.wait_for(self._reader.read(1024), timeout=time_left)
                except asyncio.TimeoutError:
                    log.warning(f"ISEO TCP read timeout for {self.host}:{self.port}")
                    break
                
                if not chunk:
                    # EOF
                    log.error(f"ISEO TCP connection closed by peer {self.host}:{self.port}")
                    await self.close()
                    break

                buffer.extend(chunk)

                # Check for delimiter
                if self.response_delimiter == "etx" and b"\x03" in buffer:
                    # We have ETX
                    break
                elif self.response_delimiter == "newline" and (b"\n" in buffer or b"\r\n" in buffer):
                    # We have newline
                    break
            
            return bytes(buffer) if buffer else None

        except Exception as e:
            log.error(f"ISEO TCP read error ({self.host}:{self.port}): {e}")
            return None

    @staticmethod
    def _extract_binary(raw: bytes) -> Optional[float]:
        try:
            # Type A protocol could be wrapped in \x02 or \x06 and ends in \x03
            text = raw.decode("utf-8", errors="ignore").strip("\x02\x06\x03").strip()
        except Exception:
            return None
            
        matches = re.findall(r"M(\d{10})", text)
        raw_str = None
        if len(matches) >= 2:
            raw_str = matches[1]  # Standard implementation takes second M string if two exist
        elif len(matches) == 1:
            raw_str = matches[0]
            
        if raw_str:
            try:
                return float(int(raw_str))
            except (ValueError, TypeError):
                return None
        return None

    @staticmethod
    def _extract_ascii(text: str, field_index: int) -> Optional[float]:
        parts = text.split()
        if field_index < len(parts):
            try:
                return float(parts[field_index])
            except (ValueError, IndexError):
                return None
        return None

    @staticmethod
    def _is_binary_response(raw: bytes) -> bool:
        if not raw:
            return False
        # Starts with ACK (0x06) or STX (0x02) or ends with ETX (0x03)
        return raw[0] in (0x06, 0x02) or b"\x03" in raw

    async def poll_parameters(self, parameters: list[dict]) -> list[dict]:
        if not await self._ensure_connected():
            return [{"parameter_id": p["id"], "value": None, "raw_value": None, "quality": "E"} for p in parameters]

        raw: Optional[bytes] = None
        try:
            if self.request_bytes:
                req_hex_log = self.request_bytes.hex().upper()
                # Format hex string with spaces for readability like "02 4D 31..."
                formatted_hex = " ".join([req_hex_log[i:i+2] for i in range(0, len(req_hex_log), 2)])
                log.info(f"ISEO TCP sending to {self.host}:{self.port} -> {formatted_hex}")
                self._writer.write(self.request_bytes)
                await self._writer.drain()
            
            raw = await self._read_response()
        except Exception as e:
            log.error(f"ISEO TCP poll error ({self.host}:{self.port}): {e}")
            await self.close()

        if not raw:
            return [{"parameter_id": p["id"], "value": None, "raw_value": None, "quality": "E"} for p in parameters]

        # Log received sequence
        resp_hex_log = raw.hex().upper()
        formatted_resp_hex = " ".join([resp_hex_log[i:i+2] for i in range(0, len(resp_hex_log), 2)])
        log.info(f"ISEO TCP received from {self.host}:{self.port} -> {formatted_resp_hex}")

        is_binary = self._is_binary_response(raw)
        text = raw.decode("utf-8", errors="ignore").strip()

        results = []
        for p in parameters:
            field_idx = p.get("register_address", 1)
            # Fetch scale_factor and offset. They default to 1.0 and 0.0 respectively
            sf = p.get("scale_factor", 1.0)
            offset = p.get("offset", 0.0)

            if is_binary:
                raw_val = self._extract_binary(raw)
            else:
                raw_val = self._extract_ascii(text, field_idx)

            if raw_val is not None:
                # Apply math: (raw_value * Scale) + Offset
                calculated_val = (raw_val * sf) + offset
                quality = "U"
                value = round(calculated_val, 2)
            else:
                quality = "E"
                value = None

            results.append({
                "parameter_id": p["id"],
                "value": value,
                "raw_value": raw_val,
                "quality": quality,
            })

        return results
