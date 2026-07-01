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

# ═══════════════════════════════════════════════════════════════════════════
# Protocol-specific decoders for environmental analysers
# All frames: ACK (0x06) + ASCII payload + ETX (0x03)
# ═══════════════════════════════════════════════════════════════════════════


def _decode_m10404(raw_response: str, channel: int = 0) -> Optional[float]:
    """
    M10404 protocol — used by Envco PM10 / PM2.5 analysers.
    Frame: ACK + 'M10404DDMMYYM<status6><val×100:4><f2:4><f3:4><f4:4><chk:2>' + ETX
    Returns value ÷ 100 based on channel (0=val, 1=f2, 2=f3, 3=f4).
    """
    try:
        if not raw_response or raw_response[0] != "\x06" or raw_response[-1] != "\x03":
            log.warning("M10404: bad frame delimiters")
            return None
        payload = raw_response[1:-1]
        data = payload[13:]          # skip DevID(6) + Date(6) + Mode(1)
        start_idx = 6 + (channel * 4)
        val_str = data[start_idx:start_idx + 4]
        return int(val_str) / 100.0
    except Exception as exc:
        log.error("M10404 decode error: %s", exc)
        return None


def _decode_af2216(raw_response: str, channel: int = 0) -> Optional[float]:
    """
    AF2216 protocol — used by Envco SO2 analysers.
    Frame: ACK + 'AF2216DDMMYYM00 <SO2> <f2> <f3> <chk>' + ETX
    Returns value based on channel (first numeric field after header is channel 0).
    """
    try:
        if not raw_response or raw_response[0] != "\x06" or raw_response[-1] != "\x03":
            log.warning("AF2216: bad frame delimiters")
            return None
        payload = raw_response[1:-1]
        after_header = payload[15:].strip()   # DevID(6) + Date(6) + 'M00'
        tokens = after_header.split()
        if channel < len(tokens):
            return float(tokens[channel])
        return None
    except Exception as exc:
        log.error("AF2216 decode error: %s", exc)
        return None


def _decode_ac3216(raw_response: str, channel: int = 0) -> Optional[float]:
    """
    AC3216 protocol — used by Envco NO/NO2/NOx analysers.
    Frame: ACK + 'AC3216DDMMYYM00 <NO> <NO2> <NOx> <chk>' + ETX
    channel 0 = NO, 1 = NO2, 2 = NOx.
    """
    try:
        if not raw_response or raw_response[0] != "\x06" or raw_response[-1] != "\x03":
            log.warning("AC3216: bad frame delimiters")
            return None
        payload = raw_response[1:-1]
        after_header = payload[15:].strip()
        tokens = after_header.split()
        if len(tokens) < 4:
            log.warning("AC3216: too few tokens: %s", tokens)
            return None
        return float(tokens[channel])
    except Exception as exc:
        log.error("AC3216 decode error: %s", exc)
        return None


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

    elif method == "m10404":
        channel = param.get("register_address", 0)
        raw_val = _decode_m10404(raw_response, channel)
        return raw_val
    elif method == "af2216":
        channel = param.get("register_address", 0)
        raw_val = _decode_af2216(raw_response, channel)
        return raw_val
    elif method == "ac3216":
        channel = param.get("register_address", 0)
        raw_val = _decode_ac3216(raw_response, channel)
        return raw_val

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

    async def send_request(self, target_host: str = None, target_port: int = None, custom_request_bytes: bytes = None) -> Optional[str]:
        """
        Send the configured request bytes (if any) and read the response.
        Returns the response decoded as a string.
        """
        host = target_host if target_host is not None else self.host
        port = target_port if target_port is not None else self.port
        req_bytes = custom_request_bytes if custom_request_bytes is not None else self.request_bytes

        loop = asyncio.get_running_loop()
        on_response = loop.create_future()
        transport = None
        
        try:
            # We connect the UDP socket to the target host/port so we can send/recv without specifying addr every time
            transport, protocol = await asyncio.wait_for(
                loop.create_datagram_endpoint(
                    lambda: SimpleUDPClientProtocol(req_bytes, on_response),
                    remote_addr=(host, port)
                ),
                timeout=self.timeout
            )

            # Wait for response data with timeout
            response_data = await asyncio.wait_for(on_response, timeout=self.timeout)
            
            if response_data is None:
                return None
            return response_data.decode("utf-8", errors="ignore").strip()

        except asyncio.TimeoutError:
            log.warning(f"UDP request timeout ({self.timeout}s) → {host}:{port}")
            return None
        except Exception as e:
            log.error(f"UDP request error ({host}:{port}): {e}")
            return None
        finally:
            if transport:
                transport.close()

    async def poll_parameters(self, parameters: list[dict]) -> list[dict]:
        """
        Send request (if configured), read response, extract each parameter
        value using its parse method, apply scale/offset.
        """
        import json
        groups = {}
        for p in parameters:
            thost = p.get("host")
            if thost is None: thost = self.host
            tport = p.get("port")
            if tport is None: tport = self.port
            
            # Extract parameter-level request_hex from parse_config
            req_hex = None
            try:
                if p.get("parse_config"):
                    conf = json.loads(p["parse_config"])
                    req_hex = conf.get("request_hex")
            except:
                pass
                
            key = (thost, tport, req_hex)
            if key not in groups:
                groups[key] = []
            groups[key].append(p)

        results = []
        for (thost, tport, req_hex), params in groups.items():
            custom_bytes = _hex_to_bytes(req_hex) if req_hex else None
            raw_response = await self.send_request(target_host=thost, target_port=tport, custom_request_bytes=custom_bytes)
            
            for p in params:
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
