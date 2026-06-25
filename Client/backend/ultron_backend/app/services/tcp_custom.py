"""
UltrON — TCP Custom Parser Service
Connects to a raw TCP socket and parses proprietary ASCII/binary frames.
Supports multiple parse methods: CSV-over-TCP, position-based, regex, delimiter-split.
"""

import asyncio
import csv
import io
import json
import re
from typing import Optional
from app.core.logger import get_logger

log = get_logger("ultron.tcp_custom")


def _hex_to_bytes(hex_str: Optional[str]) -> Optional[bytes]:
    if not hex_str:
        return None
    clean = hex_str.strip()
    if not clean:
        return None
    try:
        parts = clean.replace(",", " ").split()
        return bytes(int(b, 16) for b in parts if b)
    except Exception as e:
        log.error(f"Failed to parse hex string '{hex_str}': {e}")
        return None


async def _read_until_delimiter(
    reader: asyncio.StreamReader, delimiter: str, timeout: int
) -> Optional[bytes]:
    """Read response until the configured delimiter or timeout."""
    try:
        if delimiter == "newline":
            data = await asyncio.wait_for(reader.readline(), timeout=timeout)
        elif delimiter == "etx":
            data = bytearray()
            while True:
                b = await asyncio.wait_for(reader.readexactly(1), timeout=timeout)
                data.extend(b)
                if b == b"\x03":
                    break
        elif delimiter == "length":
            length_byte = await asyncio.wait_for(reader.readexactly(1), timeout=timeout)
            length = length_byte[0]
            data = bytearray(length_byte)
            if length > 0:
                rest = await asyncio.wait_for(reader.readexactly(length), timeout=timeout)
                data.extend(rest)
        else:
            data = await asyncio.wait_for(reader.readline(), timeout=timeout)
        return bytes(data)
    except asyncio.IncompleteReadError:
        return None
    except asyncio.TimeoutError:
        return None


def _extract_value(raw_response: str, method: str, config: dict, param: dict) -> Optional[float]:
    """Extract a numeric value from the response string using the configured method."""
    if method == "csv_col":
        col_idx = param.get("register_address", 0)
        reader = csv.reader(io.StringIO(raw_response))
        fields = next(reader, [])
        raw_str = fields[col_idx].strip() if col_idx < len(fields) else None

    elif method == "position":
        start = config.get("start", 0)
        length = config.get("length", 4)
        decimal = config.get("decimal", 0)
        raw_str = raw_response[start:start + length].strip()
        if decimal > 0 and raw_str and raw_str.isdigit():
            raw_str = raw_str[:-decimal] + "." + raw_str[-decimal:]

    elif method == "regex":
        pattern = config.get("pattern", r"(\d+\.?\d*)")
        m = re.search(pattern, raw_response)
        raw_str = m.group(1) if m else None

    elif method == "delimiter_split":
        sep = config.get("sep", " ")
        index = config.get("index", 0)
        parts = raw_response.split(sep)
        raw_str = parts[index].strip() if index < len(parts) else None

    else:
        raw_str = None

    try:
        return float(raw_str) if raw_str not in (None, "", "N/A", "---") else None
    except (ValueError, TypeError):
        return None


class TCPCustomReader:
    """
    Generic async TCP client for proprietary industrial protocols.
    Sends an optional request frame, reads a response using a configurable
    delimiter, and extracts values using per-parameter parse methods.
    """

    def __init__(
        self,
        host: str,
        port: int,
        timeout: int = 5,
        request_hex: Optional[str] = None,
        response_delimiter: str = "newline",
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

    async def send_request(self) -> Optional[str]:
        """
        Send the configured request bytes (if any) and read the response.
        Returns the response decoded as a string.
        """
        if not await self._ensure_connected():
            return None
        try:
            if self.request_bytes:
                self._writer.write(self.request_bytes)
                await self._writer.drain()
            response = await _read_until_delimiter(
                self._reader, self.response_delimiter, self.timeout
            )
            if response is None:
                await self.close()
                return None
            return response.decode("utf-8", errors="ignore").strip()
        except Exception as e:
            log.error(f"TCP request error ({self.host}:{self.port}): {e}")
            await self.close()
            return None

    async def poll_parameters(self, parameters: list[dict]) -> list[dict]:
        """
        Send request (if configured), read response, extract each parameter
        value using its parse method, apply scale/offset.
        """
        raw_response = await self.send_request()
        results = []
        for p in parameters:
            parse_method = p.get("parse_method", "csv_col")
            parse_config_raw = p.get("parse_config")
            parse_config = {}
            if parse_config_raw:
                try:
                    parse_config = json.loads(parse_config_raw) if isinstance(parse_config_raw, str) else (parse_config_raw or {})
                except (json.JSONDecodeError, TypeError):
                    parse_config = {}

            raw_val = None
            if raw_response:
                raw_val = _extract_value(raw_response, parse_method, parse_config, p)

            quality = "U" if raw_val is not None else "E"
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

    async def read_line(self) -> Optional[str]:
        """
        Read one line from the TCP stream and return as decoded string.
        Kept for backward compatibility.
        """
        if not await self._ensure_connected():
            return None
        try:
            line = await asyncio.wait_for(
                self._reader.readline(),
                timeout=self.timeout,
            )
            if not line:
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
        Used for CSV-over-TCP instruments.
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
