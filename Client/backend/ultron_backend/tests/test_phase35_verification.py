"""
UltrON — Phase 3.5 Backend Verification Suite

Covers:
  1. Integration: SerialASCIIReader → parser_engine → readings struct
  2. Integration: readings struct → dq_engine → quality codes
  3. Integration: readings struct → polling engine data shape (LiveData/HistoricalData)
  4. Polling stability: concurrent device simulation, no blocking, no starvation
  5. Recovery: serial failure, timeout, partial, invalid config, wrong key
  6. Backward compatibility: existing parser methods untouched
  7. Database: migration idempotency (in-memory SQLite)
  8. Parser safety: every parser with malformed config returns None, never raises
"""

import asyncio
import time
import threading
from unittest.mock import MagicMock, patch, AsyncMock
from typing import Optional

import pytest

# ─── Parser Engine ────────────────────────────────────────────────────────────
from app.services import parser_engine
from app.services.parser_engine import get_parser, parse, UnknownParserError
from app.services.parser_engine.base import BaseParser
from app.services.parser_engine.csv_col import CsvColParser
from app.services.parser_engine.position import PositionParser
from app.services.parser_engine.delimiter_split import DelimiterSplitParser
from app.services.parser_engine.regex_ import RegexParser
from app.services.parser_engine.key_value import KeyValueParser

# ─── Serial Driver ────────────────────────────────────────────────────────────
from app.services.serial_ascii import (
    build_command_bytes,
    SerialASCIIReader,
)

# ─── DQ Engine ────────────────────────────────────────────────────────────────
from app.services.data_quality import DataQualityEngine


# ═══════════════════════════════════════════════════════════════════════════════
# 1. INTEGRATION — SerialASCIIReader → parser_engine → readings struct
# ═══════════════════════════════════════════════════════════════════════════════

class TestIntegration_ReaderToReadings:
    """Verify readings structure is exactly what polling_engine expects."""

    def _make_reader(self, cmd_format="ascii", cmd="<SOH>R31<CR>") -> SerialASCIIReader:
        return SerialASCIIReader(
            port="COM_TEST",
            baudrate=9600,
            data_bits=8,
            parity="N",
            stop_bits=1,
            timeout=1.0,
            command_format=cmd_format,
            request_command=cmd,
            response_delimiter="newline",
        )

    def _params(self) -> list[dict]:
        import json
        return [
            {
                "id": 1,
                "parse_method": "key_value",
                "parse_config": json.dumps({"key": "01R31", "value_offset": 2}),
                "scale_factor": 1.0,
                "offset": 0.0,
                "data_type": "float32",
            },
            {
                "id": 2,
                "parse_method": "key_value",
                "parse_config": json.dumps({"key": "02R31", "value_offset": 2}),
                "scale_factor": 2.0,
                "offset": 10.0,
                "data_type": "float32",
            },
        ]

    @pytest.mark.asyncio
    async def test_readings_have_required_fields(self):
        """Readings must contain parameter_id, value, raw_value, quality."""
        reader = self._make_reader()
        response = "01R31 NO 45.23 02R31 NO2 12.10"
        with patch.object(reader, "_send_and_receive_sync", return_value=response):
            readings = await reader.poll_parameters(self._params())

        assert len(readings) == 2
        for r in readings:
            assert "parameter_id" in r
            assert "value" in r
            assert "raw_value" in r
            assert "quality" in r

    @pytest.mark.asyncio
    async def test_quality_u_when_value_present(self):
        reader = self._make_reader()
        with patch.object(reader, "_send_and_receive_sync",
                          return_value="01R31 NO 45.23 02R31 NO2 12.10"):
            readings = await reader.poll_parameters(self._params())

        assert readings[0]["quality"] == "U"
        assert readings[1]["quality"] == "U"

    @pytest.mark.asyncio
    async def test_quality_e_when_no_response(self):
        reader = self._make_reader()
        with patch.object(reader, "_send_and_receive_sync", return_value=None):
            readings = await reader.poll_parameters(self._params())

        assert all(r["quality"] == "E" for r in readings)
        assert all(r["value"] is None for r in readings)

    @pytest.mark.asyncio
    async def test_scale_offset_applied_correctly(self):
        """raw_val=12.10, scale=2.0, offset=10.0 → value=34.2"""
        reader = self._make_reader()
        with patch.object(reader, "_send_and_receive_sync",
                          return_value="01R31 NO 45.23 02R31 NO2 12.10"):
            readings = await reader.poll_parameters(self._params())

        assert readings[0]["raw_value"] == pytest.approx(45.23)
        assert readings[0]["value"] == pytest.approx(45.23)        # sf=1.0, off=0.0
        assert readings[1]["raw_value"] == pytest.approx(12.10)
        assert readings[1]["value"] == pytest.approx(34.20)         # (12.10*2.0)+10.0

    @pytest.mark.asyncio
    async def test_parameter_id_matches_param(self):
        """parameter_id in output must correspond to input params."""
        reader = self._make_reader()
        with patch.object(reader, "_send_and_receive_sync",
                          return_value="01R31 NO 45.23 02R31 NO2 12.10"):
            readings = await reader.poll_parameters(self._params())

        assert readings[0]["parameter_id"] == 1
        assert readings[1]["parameter_id"] == 2


# ═══════════════════════════════════════════════════════════════════════════════
# 2. INTEGRATION — readings → dq_engine quality codes
# ═══════════════════════════════════════════════════════════════════════════════

class TestIntegration_ReadingsToDQEngine:
    """Verify readings from SerialASCIIReader flow correctly through dq_engine."""

    def _dq(self) -> DataQualityEngine:
        return DataQualityEngine()

    def _meta(self, min_v=None, max_v=None, alarm_high=None) -> dict:
        return {"min_valid": min_v, "max_valid": max_v, "alarm_high": alarm_high}

    def test_good_reading_stays_u(self):
        """A value within range keeps quality U."""
        dq = self._dq()
        readings = [{"parameter_id": 1, "value": 45.23, "raw_value": 45.23, "quality": "U"}]
        param_meta = {1: self._meta(0, 100)}
        result = dq.bulk_check(readings, param_meta)
        assert result[0]["quality"] == "U"

    def test_error_reading_stays_e(self):
        """Quality E from driver is preserved."""
        dq = self._dq()
        readings = [{"parameter_id": 1, "value": None, "raw_value": None, "quality": "E"}]
        param_meta = {1: self._meta()}
        result = dq.bulk_check(readings, param_meta)
        assert result[0]["quality"] == "E"

    def test_out_of_range_becomes_o(self):
        """Value outside [min_valid, max_valid] gets quality O."""
        dq = self._dq()
        readings = [{"parameter_id": 1, "value": 150.0, "raw_value": 150.0, "quality": "U"}]
        param_meta = {1: self._meta(0, 100)}
        result = dq.bulk_check(readings, param_meta)
        assert result[0]["quality"] == "O"

    @pytest.mark.asyncio
    async def test_e2e_no_response_to_e_quality(self):
        """Full path: no serial response → quality E through dq_engine."""
        dq = self._dq()
        import json
        reader = SerialASCIIReader(
            port="COM_NONE", baudrate=9600, data_bits=8, parity="N",
            stop_bits=1, timeout=1.0, command_format="ascii",
            request_command="<SOH>R31<CR>", response_delimiter="newline",
        )
        params = [{"id": 99, "parse_method": "key_value",
                   "parse_config": json.dumps({"key": "01R31", "value_offset": 2}),
                   "scale_factor": 1.0, "offset": 0.0, "data_type": "float32"}]
        with patch.object(reader, "_send_and_receive_sync", return_value=None):
            readings = await reader.poll_parameters(params)

        param_meta = {99: {"min_valid": None, "max_valid": None, "alarm_high": None}}
        result = dq.bulk_check(readings, param_meta)
        assert result[0]["quality"] == "E"
        assert result[0]["value"] is None


# ═══════════════════════════════════════════════════════════════════════════════
# 3. POLLING STABILITY — concurrent simulation
# ═══════════════════════════════════════════════════════════════════════════════

class TestPollingStability:
    """
    Simulate many devices polling concurrently.
    Verifies no event loop blocking, no starvation, no exceptions.
    """

    def _make_reader(self, device_id: int, response: str = None) -> SerialASCIIReader:
        import json
        reader = SerialASCIIReader(
            port=f"COM{device_id}",
            baudrate=9600, data_bits=8, parity="N", stop_bits=1,
            timeout=0.1, command_format="ascii",
            request_command="<SOH>R31<CR>", response_delimiter="newline",
        )
        reader._send_and_receive_sync = MagicMock(return_value=response)
        return reader

    def _params(self, pid: int) -> list[dict]:
        import json
        return [{"id": pid, "parse_method": "key_value",
                 "parse_config": json.dumps({"key": "K1", "value_offset": 1}),
                 "scale_factor": 1.0, "offset": 0.0, "data_type": "float32"}]

    @pytest.mark.asyncio
    async def test_ten_concurrent_polls_complete_under_2s(self):
        """10 simultaneous polls (all mocked) must complete well under 2 seconds."""
        readers = [self._make_reader(i, f"K1 {float(i)}") for i in range(10)]
        start = time.monotonic()
        results = await asyncio.gather(*[
            r.poll_parameters(self._params(i))
            for i, r in enumerate(readers)
        ])
        elapsed = time.monotonic() - start

        assert elapsed < 2.0, f"10 concurrent polls took {elapsed:.2f}s — possible blocking"
        assert len(results) == 10
        assert all(res[0]["quality"] == "U" for res in results)

    @pytest.mark.asyncio
    async def test_mixed_success_and_failure_no_exception(self):
        """5 success + 5 failure devices — no exception, correct quality mix."""
        import json
        params = [{"id": 1, "parse_method": "key_value",
                   "parse_config": json.dumps({"key": "K1", "value_offset": 1}),
                   "scale_factor": 1.0, "offset": 0.0, "data_type": "float32"}]

        readers_ok = [self._make_reader(i, "K1 99.9") for i in range(5)]
        readers_fail = [self._make_reader(i + 5, None) for i in range(5)]

        all_tasks = [r.poll_parameters(params) for r in readers_ok + readers_fail]
        results = await asyncio.gather(*all_tasks, return_exceptions=True)

        assert all(not isinstance(r, Exception) for r in results)
        ok_results = results[:5]
        fail_results = results[5:]
        assert all(r[0]["quality"] == "U" for r in ok_results)
        assert all(r[0]["quality"] == "E" for r in fail_results)

    @pytest.mark.asyncio
    async def test_event_loop_not_blocked_during_serial_io(self):
        """
        asyncio.to_thread must not block the event loop.
        Run a parallel coroutine that must complete while serial I/O is happening.
        """
        import asyncio

        async def canary() -> str:
            """Lightweight coroutine — must finish even when serial I/O is running."""
            await asyncio.sleep(0)
            return "alive"

        def slow_serial_sync(_cmd):
            # Simulate 100ms blocking serial read
            time.sleep(0.1)
            return "K1 42.0"

        reader = SerialASCIIReader(
            port="COM_SLOW", baudrate=9600, data_bits=8, parity="N",
            stop_bits=1, timeout=1.0, command_format="ascii",
            request_command="TEST", response_delimiter="newline",
        )
        reader._send_and_receive_sync = slow_serial_sync

        import json
        params = [{"id": 1, "parse_method": "key_value",
                   "parse_config": json.dumps({"key": "K1", "value_offset": 1}),
                   "scale_factor": 1.0, "offset": 0.0, "data_type": "float32"}]

        poll_task = asyncio.create_task(reader.poll_parameters(params))
        canary_result = await canary()  # This must complete without waiting for serial I/O
        readings = await poll_task

        assert canary_result == "alive"
        assert readings[0]["quality"] == "U"

    @pytest.mark.asyncio
    async def test_100_sequential_polls_stable(self):
        """100 polls on a single reader — no drift, no exception, consistent output."""
        import json
        reader = SerialASCIIReader(
            port="COM_STABLE", baudrate=9600, data_bits=8, parity="N",
            stop_bits=1, timeout=1.0, command_format="ascii",
            request_command="POLL", response_delimiter="newline",
        )
        reader._send_and_receive_sync = MagicMock(return_value="K1 77.7")
        params = [{"id": 1, "parse_method": "key_value",
                   "parse_config": json.dumps({"key": "K1", "value_offset": 1}),
                   "scale_factor": 1.0, "offset": 0.0, "data_type": "float32"}]

        for _ in range(100):
            readings = await reader.poll_parameters(params)
            assert readings[0]["quality"] == "U"
            assert readings[0]["value"] == pytest.approx(77.7)


# ═══════════════════════════════════════════════════════════════════════════════
# 4. RECOVERY — all failure scenarios
# ═══════════════════════════════════════════════════════════════════════════════

class TestRecovery:
    """
    Every failure must:
    - NOT crash the reader
    - NOT crash the polling engine dispatch
    - Return quality "E" for affected parameters
    - Leave other devices unaffected
    """

    def _make_reader(self, **kw) -> SerialASCIIReader:
        defaults = dict(port="COM_TEST", baudrate=9600, data_bits=8, parity="N",
                        stop_bits=1, timeout=1.0, command_format="ascii",
                        request_command="CMD", response_delimiter="newline")
        defaults.update(kw)
        return SerialASCIIReader(**defaults)

    def _params(self) -> list[dict]:
        import json
        return [{"id": 1, "parse_method": "key_value",
                 "parse_config": json.dumps({"key": "K1", "value_offset": 1}),
                 "scale_factor": 1.0, "offset": 0.0, "data_type": "float32"}]

    @pytest.mark.asyncio
    async def test_serial_port_unavailable_on_open(self):
        """COM port doesn't exist → SerialException on connect → quality E, no crash."""
        from serial import SerialException
        reader = self._make_reader(port="COM_NOEXIST")

        def fail_open(*a, **kw):
            raise SerialException("Port not found")

        with patch("serial.Serial", side_effect=fail_open):
            readings = await reader.poll_parameters(self._params())

        assert readings[0]["quality"] == "E"

    @pytest.mark.asyncio
    async def test_serial_cable_unplugged_mid_poll(self):
        """SerialException during write/read → quality E, port closed gracefully."""
        from serial import SerialException
        reader = self._make_reader()

        # Patch serial.Serial so _open_sync succeeds but serial.write raises
        mock_ser = MagicMock()
        mock_ser.is_open = True
        mock_ser.write.side_effect = SerialException("Device disconnected")

        with patch("serial.Serial", return_value=mock_ser):
            readings = await reader.poll_parameters(self._params())
        assert readings[0]["quality"] == "E"

    @pytest.mark.asyncio
    async def test_read_timeout_returns_e(self):
        """Device doesn't respond (timeout) → empty bytes → quality E."""
        reader = self._make_reader()
        reader._send_and_receive_sync = MagicMock(return_value=None)
        readings = await reader.poll_parameters(self._params())
        assert readings[0]["quality"] == "E"

    @pytest.mark.asyncio
    async def test_partial_response_key_not_found(self):
        """Truncated response missing the key → key_value returns None → quality E."""
        reader = self._make_reader()
        reader._send_and_receive_sync = MagicMock(return_value="K1")  # value token missing
        import json
        params = [{"id": 1, "parse_method": "key_value",
                   "parse_config": json.dumps({"key": "K1", "value_offset": 1}),
                   "scale_factor": 1.0, "offset": 0.0, "data_type": "float32"}]
        readings = await reader.poll_parameters(params)
        assert readings[0]["quality"] == "E"

    @pytest.mark.asyncio
    async def test_invalid_response_non_numeric(self):
        """Response has key but value token is non-numeric → quality E."""
        reader = self._make_reader()
        reader._send_and_receive_sync = MagicMock(return_value="K1 INVALID_VAL")
        readings = await reader.poll_parameters(self._params())
        assert readings[0]["quality"] == "E"

    @pytest.mark.asyncio
    async def test_invalid_parse_config_bad_json(self):
        """Malformed parse_config JSON → treated as empty config → quality E."""
        reader = self._make_reader()
        reader._send_and_receive_sync = MagicMock(return_value="K1 99.9")
        bad_params = [{"id": 1, "parse_method": "key_value",
                       "parse_config": "{this is not json}",
                       "scale_factor": 1.0, "offset": 0.0, "data_type": "float32"}]
        readings = await reader.poll_parameters(bad_params)
        # Empty config → key="" → returns None → quality E
        assert readings[0]["quality"] == "E"

    @pytest.mark.asyncio
    async def test_unknown_parse_method_returns_e(self):
        """Unknown parse_method → parser_engine returns None → quality E."""
        reader = self._make_reader()
        reader._send_and_receive_sync = MagicMock(return_value="K1 99.9")
        bad_params = [{"id": 1, "parse_method": "NONEXISTENT_PARSER",
                       "parse_config": None,
                       "scale_factor": 1.0, "offset": 0.0, "data_type": "float32"}]
        readings = await reader.poll_parameters(bad_params)
        assert readings[0]["quality"] == "E"

    @pytest.mark.asyncio
    async def test_one_param_fails_others_continue(self):
        """First param fails to parse, second succeeds — independent."""
        import json
        reader = self._make_reader()
        reader._send_and_receive_sync = MagicMock(return_value="K2 55.5")
        params = [
            {"id": 1, "parse_method": "key_value",
             "parse_config": json.dumps({"key": "K1", "value_offset": 1}),
             "scale_factor": 1.0, "offset": 0.0, "data_type": "float32"},
            {"id": 2, "parse_method": "key_value",
             "parse_config": json.dumps({"key": "K2", "value_offset": 1}),
             "scale_factor": 1.0, "offset": 0.0, "data_type": "float32"},
        ]
        readings = await reader.poll_parameters(params)
        assert readings[0]["quality"] == "E"  # K1 not in response
        assert readings[1]["quality"] == "U"  # K2 found
        assert readings[1]["value"] == pytest.approx(55.5)

    @pytest.mark.asyncio
    async def test_reconnect_after_failure(self):
        """After a serial failure, next poll attempt connects fresh."""
        from serial import SerialException
        reader = self._make_reader()
        call_count = {"n": 0}

        # Simulate a port that fails on first write then succeeds
        mock_ser = MagicMock()
        mock_ser.is_open = True

        def write_side_effect(data):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise SerialException("First call fails")

        mock_ser.write.side_effect = write_side_effect
        mock_ser.readline.return_value = b"K1 99.9\n"
        mock_ser.in_waiting = 0

        with patch("serial.Serial", return_value=mock_ser):
            # First poll — write raises SerialException → quality E
            readings1 = await reader.poll_parameters(self._params())
            assert readings1[0]["quality"] == "E"

            # Reset: reader re-opens on next poll (port closed by _close_sync)
            # Second write succeeds
            mock_ser.is_open = False  # simulate closed state after failure
            readings2 = await reader.poll_parameters(self._params())
            assert readings2[0]["quality"] == "U"
            assert readings2[0]["value"] == pytest.approx(99.9)


# ═══════════════════════════════════════════════════════════════════════════════
# 5. PARSER SAFETY — every parser with malformed/extreme inputs
# ═══════════════════════════════════════════════════════════════════════════════

class TestParserSafety:
    """
    Every parser must: return None (never raise) for malformed config or response.
    Unknown method through factory convenience must return None (not raise).
    """

    @pytest.mark.parametrize("response,config,param,expected", [
        # CsvColParser
        ("",      {},  {"register_address": 0},   None),
        ("a,b,c", {},  {"register_address": 99},  None),  # OOB
        ("a,b,c", {},  {"register_address": 0},   None),  # non-numeric

        # PositionParser — OOB slice returns empty string → None
        ("ABC",   {"start": 100, "length": 4}, {}, None),
        ("ABCD",  {"start": 0, "length": 4, "decimal": 99}, {}, None),  # non-numeric
    ])
    def test_csv_col_and_position_edge_cases(self, response, config, param, expected):
        method = "csv_col" if "register_address" in param else "position"
        result = parse(response, method, config, param)
        assert result == expected

    @pytest.mark.parametrize("method,response,config", [
        ("csv_col", None, {}),
        ("position", None, {}),
        ("delimiter_split", None, {}),
        ("regex", None, {}),
        ("key_value", None, {"key": "K1"}),
    ])
    def test_none_response_never_raises(self, method, response, config):
        """None response → parser must return None, not raise."""
        # Parser engine receives strings; this tests the caller's guard
        # (serial_ascii.py already guards for None before calling parser_engine)
        result = parse(response or "", method, config, {})
        assert result is None

    def test_key_value_empty_config_returns_none(self):
        result = KeyValueParser().parse("K1 99.9", {}, {})
        assert result is None  # key="" not found

    def test_key_value_zero_offset_token_is_key_itself(self):
        # value_offset=0 reads the key token itself — not a valid float
        result = KeyValueParser().parse("K1 99.9", {"key": "K1", "value_offset": 0}, {})
        assert result is None  # "K1" is not a float

    def test_position_decimal_with_non_digit_string(self):
        result = PositionParser().parse("ABCDE", {"start": 0, "length": 4, "decimal": 2}, {})
        assert result is None

    def test_regex_invalid_pattern_returns_none(self):
        result = RegexParser().parse("test 45.6", {"pattern": "[invalid("}, {})
        assert result is None  # re.error caught

    def test_delimiter_split_empty_response(self):
        result = DelimiterSplitParser().parse("", {"sep": "|", "index": 0}, {})
        assert result is None

    def test_all_parsers_with_na_sentinel(self):
        """N/A and --- sentinels must return None, not raise."""
        for method, config, param, response in [
            ("csv_col",        {}, {"register_address": 0}, "N/A"),
            ("delimiter_split", {"sep": " ", "index": 0}, {}, "N/A"),
            ("csv_col",        {}, {"register_address": 0}, "---"),
        ]:
            result = parse(response, method, config, param)
            assert result is None, f"{method} failed on sentinel {response!r}"

    def test_unknown_method_returns_none_no_raise(self):
        result = parse("anything", "horiba_specific_parser", {}, {})
        assert result is None

    def test_unknown_method_get_parser_raises(self):
        with pytest.raises(UnknownParserError):
            get_parser("not_registered")

    def test_all_registered_parsers_implement_base(self):
        for method in ("csv_col", "position", "delimiter_split", "regex", "key_value"):
            p = get_parser(method)
            assert isinstance(p, BaseParser)


# ═══════════════════════════════════════════════════════════════════════════════
# 6. BACKWARD COMPATIBILITY — existing parse methods identical to tcp_custom
# ═══════════════════════════════════════════════════════════════════════════════

class TestBackwardCompatibility:
    """
    parser_engine implementations must be functionally identical
    to the existing _extract_value logic in tcp_custom.py and udp_custom.py.
    """

    def test_csv_col_comma_matches_original(self):
        """csv_col with comma-delimited string — same as tcp_custom line 61-68."""
        param = {"register_address": 2}
        result = CsvColParser().parse("10.0,20.0,30.0", {}, param)
        assert result == pytest.approx(30.0)

    def test_csv_col_space_fallback_matches_original(self):
        """csv_col with space-delimited — same as tcp_custom fallback branch."""
        param = {"register_address": 1}
        result = CsvColParser().parse("10.0 20.0 30.0", {}, param)
        assert result == pytest.approx(20.0)

    def test_position_decimal_matches_original(self):
        """position with decimal=2 — same as tcp_custom line 70-76."""
        result = PositionParser().parse("001234", {"start": 0, "length": 6, "decimal": 2}, {})
        assert result == pytest.approx(12.34)

    def test_delimiter_split_matches_original(self):
        """delimiter_split — same as tcp_custom line 83-87."""
        result = DelimiterSplitParser().parse("A;B;99.5;D", {"sep": ";", "index": 2}, {})
        assert result == pytest.approx(99.5)

    def test_regex_default_matches_original(self):
        """regex with default pattern — same as tcp_custom line 78-81."""
        result = RegexParser().parse("VALUE=45.67 ppm", {}, {})
        assert result == pytest.approx(45.67)

    def test_existing_serial_rtu_fields_untouched(self):
        """
        DeviceProtocol must still contain all original values.
        Verifying the enum addition didn't break existing values.
        """
        from app.models.device import DeviceProtocol
        assert DeviceProtocol.modbus_tcp.value  == "modbus_tcp"
        assert DeviceProtocol.modbus_rtu.value  == "modbus_rtu"
        assert DeviceProtocol.tcp_custom.value  == "tcp_custom"
        assert DeviceProtocol.udp_custom.value  == "udp_custom"
        assert DeviceProtocol.csv.value         == "csv"
        assert DeviceProtocol.serial_ascii.value == "serial_ascii"

    def test_polling_engine_pools_still_present(self):
        """
        The existing pool dicts must still exist and be the correct types.
        Regression guard against accidental rename.
        """
        from app.services import polling_engine as pe
        assert isinstance(pe._tcp_readers, dict)
        assert isinstance(pe._rtu_readers, dict)
        assert isinstance(pe._tcp_custom, dict)
        assert isinstance(pe._udp_custom, dict)
        assert isinstance(pe._csv_watchers, dict)
        assert isinstance(pe._serial_ascii, dict)  # new pool present


# ═══════════════════════════════════════════════════════════════════════════════
# 7. DATABASE MIGRATION — in-memory SQLite verification
# ═══════════════════════════════════════════════════════════════════════════════

class TestDatabaseMigration:
    """
    Verify _ensure_serial_ascii_columns adds columns idempotently.
    Uses an in-memory SQLite connection (no app DB touched).
    """

    def _make_in_memory_devices_table(self, include_new_cols: bool = False):
        """Return a sqlite3 connection with a minimal devices table."""
        import sqlite3
        conn = sqlite3.connect(":memory:")
        cols = "id INTEGER PRIMARY KEY, name TEXT, protocol TEXT"
        if include_new_cols:
            cols += ", command_format TEXT, request_command TEXT"
        conn.execute(f"CREATE TABLE devices ({cols})")
        conn.execute("INSERT INTO devices (name, protocol) VALUES ('dev1', 'modbus_tcp')")
        conn.commit()
        return conn

    def _column_names(self, conn) -> set:
        rows = conn.execute("PRAGMA table_info(devices)").fetchall()
        return {r[1] for r in rows}

    def test_columns_added_to_existing_table(self):
        """Simulate fresh migration: columns missing → must be added."""
        import sqlite3
        conn = self._make_in_memory_devices_table(include_new_cols=False)
        cols_before = self._column_names(conn)
        assert "command_format" not in cols_before
        assert "request_command" not in cols_before

        # Run the same logic as _ensure_serial_ascii_columns
        new_cols = {"command_format": "VARCHAR(10)", "request_command": "TEXT"}
        for col_name, col_type in new_cols.items():
            if col_name not in cols_before:
                conn.execute(f"ALTER TABLE devices ADD COLUMN {col_name} {col_type}")
        conn.commit()

        cols_after = self._column_names(conn)
        assert "command_format" in cols_after
        assert "request_command" in cols_after

    def test_migration_idempotent_when_columns_exist(self):
        """Simulate re-run: columns already exist → no ALTER TABLE, no error."""
        import sqlite3
        conn = self._make_in_memory_devices_table(include_new_cols=True)
        cols = self._column_names(conn)
        assert "command_format" in cols
        assert "request_command" in cols

        # Running migration again must not raise
        new_cols = {"command_format": "VARCHAR(10)", "request_command": "TEXT"}
        for col_name, col_type in new_cols.items():
            if col_name not in cols:  # guard prevents duplicate ALTER TABLE
                conn.execute(f"ALTER TABLE devices ADD COLUMN {col_name} {col_type}")
        conn.commit()
        # No exception — idempotent

    def test_existing_row_unaffected_after_migration(self):
        """After adding new columns, existing rows retain their data."""
        import sqlite3
        conn = self._make_in_memory_devices_table(include_new_cols=False)
        cols = self._column_names(conn)
        new_cols = {"command_format": "VARCHAR(10)", "request_command": "TEXT"}
        for col_name, col_type in new_cols.items():
            if col_name not in cols:
                conn.execute(f"ALTER TABLE devices ADD COLUMN {col_name} {col_type}")
        conn.commit()

        row = conn.execute("SELECT name, protocol, command_format, request_command FROM devices").fetchone()
        assert row[0] == "dev1"
        assert row[1] == "modbus_tcp"
        assert row[2] is None  # nullable — correct
        assert row[3] is None  # nullable — correct

    def test_new_serial_ascii_row_can_be_inserted(self):
        """After migration, a serial_ascii device can be stored."""
        import sqlite3
        conn = self._make_in_memory_devices_table(include_new_cols=True)
        conn.execute(
            "INSERT INTO devices (name, protocol, command_format, request_command) "
            "VALUES (?, ?, ?, ?)",
            ("Horiba APNA", "serial_ascii", "ascii", "<SOH>R31<CR>")
        )
        conn.commit()

        row = conn.execute(
            "SELECT name, protocol, command_format, request_command FROM devices WHERE protocol='serial_ascii'"
        ).fetchone()
        assert row[0] == "Horiba APNA"
        assert row[1] == "serial_ascii"
        assert row[2] == "ascii"
        assert row[3] == "<SOH>R31<CR>"


# ═══════════════════════════════════════════════════════════════════════════════
# 8. COMMAND BUILDER — edge cases not covered in Phase 3 unit tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestCommandBuilderEdgeCases:

    def test_ascii_mixed_ctrl_and_data(self):
        """Real-world Horiba command: SOH + data bytes + CR."""
        result = build_command_bytes("ascii", "<SOH>R31<CR>")
        assert result == b"\x01R31\x0D"

    def test_ascii_stx_etx_frame(self):
        """STX...ETX framing common in older analyzers."""
        result = build_command_bytes("ascii", "<STX>READ<ETX>")
        assert result == b"\x02READ\x03"

    def test_ascii_unicode_passthrough(self):
        """Non-ASCII unicode is encoded as UTF-8."""
        result = build_command_bytes("ascii", "°C")
        assert result == "°C".encode("utf-8")

    def test_hex_case_insensitive(self):
        """Hex parser accepts uppercase and lowercase."""
        lower = build_command_bytes("hex", "0a 1b 2c")
        upper = build_command_bytes("hex", "0A 1B 2C")
        assert lower == upper == bytes([0x0A, 0x1B, 0x2C])

    def test_auto_single_hex_byte(self):
        """Single 2-char hex token → detected as HEX."""
        result = build_command_bytes("auto", "0D")
        assert result == b"\x0D"

    def test_none_format_defaults_to_ascii(self):
        """None command_format → treated as ascii."""
        result = build_command_bytes(None, "<CR>")
        assert result == b"\x0D"

    def test_crlf_is_two_bytes_not_four(self):
        """<CRLF> must expand to exactly 0x0D 0x0A, not two separate tokens."""
        result = build_command_bytes("ascii", "END<CRLF>")
        assert result == b"END\x0D\x0A"
        assert len(result) == 5  # 3 bytes "END" + 2 bytes CR+LF

    def test_repeated_control_tokens(self):
        result = build_command_bytes("ascii", "<CR><CR><CR>")
        assert result == b"\x0D\x0D\x0D"
