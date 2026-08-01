"""
UltrON — Serial ASCII Communication Driver

Transport-only driver for RS232 / RS485 ASCII analyzers.

Responsibilities:
  • Open / close serial port
  • Build command bytes (ASCII literals, HEX strings, or AUTO-detect)
  • Write command bytes to port
  • Read response using configurable terminator
  • Decode bytes to UTF-8 string
  • Call parser_engine per parameter
  • Return normalized [{parameter_id, value, raw_value, quality}]

This module NEVER contains protocol-specific parsing logic.
All parsing is delegated to app.services.parser_engine.
"""

import asyncio
import json
import threading
import time
from typing import Optional

import serial
from serial import SerialException

from app.core.logger import get_logger
from app.services import parser_engine

log = get_logger("ultron.serial_ascii")


# ─── Control Character Translation Table ─────────────────────────────────────
# Order matters: <CRLF> must be checked before <CR> and <LF>.

_CTRL: list[tuple[str, bytes]] = [
    ("<CRLF>", b"\x0D\x0A"),
    ("<SOH>",  b"\x01"),
    ("<STX>",  b"\x02"),
    ("<ETX>",  b"\x03"),
    ("<EOT>",  b"\x04"),
    ("<ENQ>",  b"\x05"),
    ("<ACK>",  b"\x06"),
    ("<CR>",   b"\x0D"),
    ("<LF>",   b"\x0A"),
]


# ─── Command Builders ─────────────────────────────────────────────────────────

def _build_ascii_bytes(command: str) -> bytes:
    """Translate <TOKEN> control chars and encode the remainder as UTF-8."""
    result = bytearray()
    i = 0
    while i < len(command):
        matched = False
        for token, byte_val in _CTRL:
            if command[i:].startswith(token):
                result.extend(byte_val)
                i += len(token)
                matched = True
                break
        if not matched:
            result.extend(command[i].encode("utf-8", errors="replace"))
            i += 1
    return bytes(result)


def _build_hex_bytes(command: str) -> bytes:
    """Parse space-separated hex byte strings (e.g. '01 52 33 31 0D')."""
    parts = command.replace(",", " ").strip().split()
    return bytes(int(p, 16) for p in parts if p)


def _looks_like_hex(command: str) -> bool:
    """True only when every space-delimited token is exactly 2 hex digits."""
    parts = command.strip().split()
    return bool(parts) and all(
        len(p) == 2 and all(c in "0123456789abcdefABCDEF" for c in p)
        for p in parts
    )


def build_command_bytes(command_format: str, request_command: str) -> bytes:
    """
    Convert a command string to bytes using the specified format.

    command_format:
        "ascii"  — translate <TOKEN> control chars, encode rest as UTF-8
        "hex"    — space-separated hex byte string
        "auto"   — if all tokens are 2-char hex → HEX path, else ASCII path
        ""       — treated as "ascii"
    """
    if not request_command:
        return b""

    fmt = (command_format or "ascii").lower().strip()

    if fmt == "hex":
        return _build_hex_bytes(request_command)
    if fmt == "auto":
        if _looks_like_hex(request_command):
            return _build_hex_bytes(request_command)
        return _build_ascii_bytes(request_command)
    # default: ascii
    return _build_ascii_bytes(request_command)


# ─── Response Reading (blocking — runs inside asyncio.to_thread) ──────────────

def _read_response_sync(ser: serial.Serial, delimiter: str, timeout: float) -> bytes:
    """
    Read from an open serial port until the configured terminator.
    Called inside asyncio.to_thread — blocking calls are acceptable here.
    """
    if delimiter == "newline":
        return ser.readline()

    if delimiter == "cr":
        buf = bytearray()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            b = ser.read(1)
            if not b:
                break
            buf.extend(b)
            if b == b"\x0D":
                break
        return bytes(buf)

    if delimiter == "etx":
        buf = bytearray()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            b = ser.read(1)
            if not b:
                break
            buf.extend(b)
            if b == b"\x03":
                # Horiba & ASCII analyzers often have a 2-byte BCC hex checksum following ETX (0x03)
                extra = ser.read(2)
                buf.extend(extra)
                break
        return bytes(buf)

    # "timeout" — read whatever arrives within the serial timeout window
    time.sleep(min(timeout, ser.timeout or timeout))
    n = ser.in_waiting
    return ser.read(n) if n else b""


# ─── Reader Class ─────────────────────────────────────────────────────────────

class SerialASCIIReader:
    """
    Generic async-compatible serial ASCII communication driver.

    One instance per device.  All blocking serial I/O runs in
    asyncio.to_thread() so the event loop is never blocked.

    This class is transport-only: it never parses protocol payload structure.
    Parsing is entirely delegated to parser_engine.
    """

    def __init__(
        self,
        port: str,
        baudrate: int = 9600,
        data_bits: int = 8,
        parity: str = "N",
        stop_bits: int = 1,
        timeout: float = 5.0,
        command_format: str = "ascii",
        request_command: str = "",
        response_delimiter: str = "newline",
    ):
        self.port = port
        self.baudrate = baudrate
        self.data_bits = data_bits
        self.parity = parity
        self.stop_bits = stop_bits
        self.timeout = timeout
        self.command_format = command_format
        self.request_command = request_command
        self.response_delimiter = response_delimiter

        self._serial: Optional[serial.Serial] = None
        # Protects _serial from concurrent threads if to_thread is ever called
        # in parallel (unlikely given one task per device, but safe).
        self._lock = threading.Lock()

    # ── Synchronous internals (run inside asyncio.to_thread) ──────────────────

    def _open_sync(self) -> bool:
        """Open the serial port if not already open. Returns True on success."""
        if self._serial is not None and self._serial.is_open:
            return True
        try:
            self._serial = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=self.data_bits,
                parity=self.parity,
                stopbits=self.stop_bits,
                timeout=self.timeout,
            )
            log.info(
                f"Serial opened → {self.port} @ {self.baudrate} bps "
                f"[{self.data_bits}{self.parity}{self.stop_bits}]"
            )
            return True
        except SerialException as e:
            log.error(f"Serial open failed ({self.port}): {e}")
            self._serial = None
            return False

    def _close_sync(self) -> None:
        """Close the serial port. Safe to call when already closed."""
        try:
            if self._serial and self._serial.is_open:
                self._serial.close()
        except Exception:
            pass
        finally:
            self._serial = None

    def _send_and_receive_sync(self, cmd_bytes: bytes) -> Optional[str]:
        """
        Write cmd_bytes, read response, decode to str.
        Runs inside asyncio.to_thread — all blocking I/O is intentional here.
        """
        with self._lock:
            if not self._open_sync():
                return None
            try:
                ser = self._serial
                try:
                    ser.reset_input_buffer()
                except Exception:
                    pass
                if cmd_bytes:
                    ser.write(cmd_bytes)
                raw = _read_response_sync(ser, self.response_delimiter, self.timeout)
                decoded = raw.decode("utf-8", errors="ignore").strip()
                return decoded if decoded else None
            except SerialException as e:
                log.error(f"Serial I/O error ({self.port}): {e}")
                self._close_sync()
                return None
            except Exception as e:
                log.error(f"Serial unexpected error ({self.port}): {e}")
                self._close_sync()
                return None

    # ── Public async API ──────────────────────────────────────────────────────

    async def close(self) -> None:
        """Async-safe close — runs _close_sync in a thread."""
        await asyncio.to_thread(self._close_sync)

    async def poll_parameters(self, parameters: list[dict]) -> list[dict]:
        """
        Build command, send to device, read response, parse each parameter.

        Returns a list compatible with the polling engine contract:
          [{"parameter_id": int, "value": float|None,
            "raw_value": float|None, "quality": "U"|"E"}]
        """
        cmd_bytes = build_command_bytes(self.command_format, self.request_command)

        raw_response: Optional[str] = await asyncio.to_thread(
            self._send_and_receive_sync, cmd_bytes
        )

        if raw_response:
            log.debug(f"Serial {self.port} response: {raw_response!r}")
        else:
            log.warning(f"Serial {self.port}: no response received")

        results = []
        for p in parameters:
            parse_method = p.get("parse_method", "csv_col")
            config: dict = {}
            parse_config_raw = p.get("parse_config")
            if parse_config_raw:
                try:
                    config = (
                        json.loads(parse_config_raw)
                        if isinstance(parse_config_raw, str)
                        else (parse_config_raw or {})
                    )
                except (json.JSONDecodeError, TypeError):
                    config = {}

            raw_val: Optional[float] = None
            if raw_response:
                raw_val = parser_engine.parse(raw_response, parse_method, config, p)

            quality = "U" if raw_val is not None else "E"
            value: Optional[float] = None
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
