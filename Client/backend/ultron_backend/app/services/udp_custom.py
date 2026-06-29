"""
UltrON — UDP Custom Parser Service
Connects to a UDP socket, sends an optional hex request, and parses proprietary ASCII/binary frames.
Supports multiple parse methods: CSV-over-UDP, position-based, regex, delimiter-split.
"""

import asyncio
import csv
import io
import json
import re
import socket
from typing import Optional
from app.core.logger import get_logger

log = get_logger("ultron.udp_custom")


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


def _extract_value(raw_response: str, method: str, config: dict, param: dict) -> Optional[float]:
    """Extract a numeric value from the response string using the configured method."""
    if method == "csv_col":
        col_idx = param.get("register_address", 0)
        if "," not in raw_response and " " in raw_response:
            fields = raw_response.split()
        else:
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


class SimpleUDPClientProtocol(asyncio.DatagramProtocol):
    def __init__(self, request_bytes: Optional[bytes], on_response: asyncio.Future):
        self.request_bytes = request_bytes
        self.on_response = on_response
        self.transport = None

    def connection_made(self, transport):
        self.transport = transport
        if self.request_bytes:
            self.transport.sendto(self.request_bytes)

    def datagram_received(self, data, addr):
        if not self.on_response.done():
            self.on_response.set_result(data)

    def error_received(self, exc):
        if not self.on_response.done():
            self.on_response.set_exception(exc)

    def connection_lost(self, exc):
        if not self.on_response.done():
            if exc:
                self.on_response.set_exception(exc)
            else:
                self.on_response.set_result(None)


class UDPCustomReader:
    """
    Generic async UDP client for proprietary industrial protocols.
    Sends an optional request frame, reads a response datagram,
    and extracts values using per-parameter parse methods.
    """

    def __init__(
        self,
        host: str,
        port: int,
        timeout: int = 5,
        request_hex: Optional[str] = None,
        response_delimiter: str = "newline",  # typically unused in UDP as frames are usually 1 datagram, kept for interface compat
    ):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.request_bytes = _hex_to_bytes(request_hex)
        self.response_delimiter = response_delimiter

    async def send_request(self) -> Optional[str]:
        """
        Send the configured request bytes (if any) and read the response.
        Returns the response decoded as a string.
        """
        loop = asyncio.get_running_loop()
        on_response = loop.create_future()
        transport = None
        
        try:
            # We connect the UDP socket to the target host/port so we can send/recv without specifying addr every time
            transport, protocol = await asyncio.wait_for(
                loop.create_datagram_endpoint(
                    lambda: SimpleUDPClientProtocol(self.request_bytes, on_response),
                    remote_addr=(self.host, self.port)
                ),
                timeout=self.timeout
            )

            # Wait for response data with timeout
            response_data = await asyncio.wait_for(on_response, timeout=self.timeout)
            
            if response_data is None:
                return None
            return response_data.decode("utf-8", errors="ignore").strip()

        except asyncio.TimeoutError:
            log.warning(f"UDP request timeout ({self.timeout}s) → {self.host}:{self.port}")
            return None
        except Exception as e:
            log.error(f"UDP request error ({self.host}:{self.port}): {e}")
            return None
        finally:
            if transport:
                transport.close()

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
                if p.get("data_type") in ("bool", "uint16"):
                    value = raw_val
                else:
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
