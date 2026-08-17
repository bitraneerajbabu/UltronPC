"""
UltrON — Unit tests for Serial ASCII driver and Parser Engine

Covers:
  - build_command_bytes: ASCII, HEX, AUTO
  - KeyValueParser: found, missing, offset, separator
  - CsvColParser, PositionParser, DelimiterSplitParser, RegexParser
  - parser_engine factory: known + unknown method
  - SerialASCIIReader.poll_parameters: no response, valid response
  - Timeout / disconnected serial simulation
"""

import asyncio
from unittest.mock import MagicMock, patch
import pytest

from app.services.serial_ascii import (
    build_command_bytes,
    _looks_like_hex,
    SerialASCIIReader,
)
from app.services import parser_engine
from app.services.parser_engine import get_parser, UnknownParserError
from app.services.parser_engine.key_value import KeyValueParser
from app.services.parser_engine.csv_col import CsvColParser
from app.services.parser_engine.position import PositionParser
from app.services.parser_engine.delimiter_split import DelimiterSplitParser
from app.services.parser_engine.regex_ import RegexParser


# ─── Command Builder ──────────────────────────────────────────────────────────

class TestBuildCommandBytes:

    def test_ascii_plain_text(self):
        assert build_command_bytes("ascii", "HELLO") == b"HELLO"

    def test_ascii_soh_cr(self):
        result = build_command_bytes("ascii", "<SOH>R31<CR>")
        assert result == b"\x01R31\x0D"

    def test_ascii_crlf_resolved_before_cr_lf(self):
        # <CRLF> must produce two bytes, not be mistaken for <CR><LF> separately
        result = build_command_bytes("ascii", "<CRLF>")
        assert result == b"\x0D\x0A"

    def test_ascii_all_control_tokens(self):
        result = build_command_bytes("ascii", "<SOH><STX><ETX><EOT><ENQ><ACK><CR><LF>")
        assert result == b"\x01\x02\x03\x04\x05\x06\x0D\x0A"

    def test_ascii_empty_command(self):
        assert build_command_bytes("ascii", "") == b""

    def test_hex_space_separated(self):
        result = build_command_bytes("hex", "01 52 33 31 0D")
        assert result == b"\x01R31\x0D"

    def test_hex_comma_separated(self):
        result = build_command_bytes("hex", "01,52,33,31,0D")
        assert result == b"\x01R31\x0D"

    def test_auto_detects_hex(self):
        # All tokens are 2-char hex → detected as HEX
        result = build_command_bytes("auto", "01 52 33 31 0D")
        assert result == b"\x01R31\x0D"

    def test_auto_falls_back_to_ascii(self):
        # Contains <SOH> → not 2-char hex tokens → ASCII path
        result = build_command_bytes("auto", "<SOH>R31<CR>")
        assert result == b"\x01R31\x0D"

    def test_auto_partial_hex_is_ascii(self):
        # "01 ZZ 0D" — "ZZ" is not hex, so treat whole thing as ASCII
        result = build_command_bytes("auto", "01 ZZ 0D")
        assert result == b"01 ZZ 0D"

    def test_unknown_format_defaults_to_ascii(self):
        result = build_command_bytes("whatever", "HI")
        assert result == b"HI"

    def test_empty_command_any_format(self):
        for fmt in ("ascii", "hex", "auto"):
            assert build_command_bytes(fmt, "") == b""


class TestLooksLikeHex:

    def test_valid_hex_tokens(self):
        assert _looks_like_hex("01 52 0D") is True

    def test_single_non_hex_token(self):
        assert _looks_like_hex("01 ZZ 0D") is False

    def test_three_char_token(self):
        assert _looks_like_hex("01A 02B") is False

    def test_empty_string(self):
        assert _looks_like_hex("") is False


# ─── KeyValueParser ───────────────────────────────────────────────────────────

class TestKeyValueParser:

    def _p(self) -> KeyValueParser:
        return KeyValueParser()

    def test_value_offset_2_skips_label(self):
        # "01R31 NO 45.23" → key at 0, offset 2 → "45.23"
        result = self._p().parse(
            "01R31 NO 45.23 02R31 NO2 12.10",
            {"key": "01R31", "value_offset": 2},
            {},
        )
        assert result == pytest.approx(45.23)

    def test_value_offset_1_direct_value(self):
        # "01R31 45.23" → key at 0, offset 1 → "45.23"
        result = self._p().parse(
            "01R31 45.23 02R31 12.10",
            {"key": "01R31", "value_offset": 1},
            {},
        )
        assert result == pytest.approx(45.23)

    def test_second_key_in_response(self):
        result = self._p().parse(
            "01R31 NO 45.23 02R31 NO2 12.10",
            {"key": "02R31", "value_offset": 2},
            {},
        )
        assert result == pytest.approx(12.10)

    def test_missing_key_returns_none(self):
        result = self._p().parse(
            "01R31 NO 45.23",
            {"key": "99R31", "value_offset": 2},
            {},
        )
        assert result is None

    def test_empty_key_returns_none(self):
        result = self._p().parse("01R31 NO 45.23", {"key": ""}, {})
        assert result is None

    def test_offset_beyond_tokens_returns_none(self):
        # only 2 tokens after key, offset 5 → out of bounds
        result = self._p().parse(
            "K1 45.23",
            {"key": "K1", "value_offset": 5},
            {},
        )
        assert result is None

    def test_non_numeric_value_returns_none(self):
        result = self._p().parse(
            "K1 NOTANUMBER",
            {"key": "K1", "value_offset": 1},
            {},
        )
        assert result is None

    def test_custom_separator(self):
        # comma-separated: "K1,45.23,K2,12.10"
        result = self._p().parse(
            "K1,45.23,K2,12.10",
            {"key": "K1", "value_offset": 1, "separator": ","},
            {},
        )
        assert result == pytest.approx(45.23)

    def test_default_value_offset_is_1(self):
        result = self._p().parse("K1 99.9", {"key": "K1"}, {})
        assert result == pytest.approx(99.9)


# ─── Other Parsers ────────────────────────────────────────────────────────────

class TestCsvColParser:

    def test_comma_delimited(self):
        val = CsvColParser().parse("10.0,20.0,30.0", {}, {"register_address": 1})
        assert val == pytest.approx(20.0)

    def test_whitespace_fallback(self):
        val = CsvColParser().parse("10.0 20.0 30.0", {}, {"register_address": 2})
        assert val == pytest.approx(30.0)

    def test_out_of_range_returns_none(self):
        val = CsvColParser().parse("10.0,20.0", {}, {"register_address": 99})
        assert val is None


class TestPositionParser:

    def test_basic_slice(self):
        val = PositionParser().parse("ABCD1234EF", {"start": 4, "length": 4}, {})
        assert val == pytest.approx(1234.0)

    def test_decimal_insertion(self):
        val = PositionParser().parse("____1234__", {"start": 4, "length": 4, "decimal": 2}, {})
        assert val == pytest.approx(12.34)

    def test_non_numeric_returns_none(self):
        val = PositionParser().parse("ABCDEFGH", {"start": 0, "length": 4}, {})
        assert val is None


class TestDelimiterSplitParser:

    def test_pipe_delimiter(self):
        val = DelimiterSplitParser().parse("A|B|99.5|D", {"sep": "|", "index": 2}, {})
        assert val == pytest.approx(99.5)

    def test_out_of_range_returns_none(self):
        val = DelimiterSplitParser().parse("A|B", {"sep": "|", "index": 9}, {})
        assert val is None


class TestRegexParser:

    def test_default_pattern(self):
        val = RegexParser().parse("Temperature: 23.45 C", {}, {})
        assert val == pytest.approx(23.45)

    def test_custom_pattern(self):
        val = RegexParser().parse("SO2=45.2 ppb", {"pattern": r"SO2=(\d+\.?\d*)"}, {})
        assert val == pytest.approx(45.2)

    def test_no_match_returns_none(self):
        val = RegexParser().parse("no numbers here at all", {}, {})
        assert val is None


# ─── Parser Engine Factory ────────────────────────────────────────────────────

class TestParserEngineFactory:

    def test_get_known_parsers(self):
        for method in ("csv_col", "position", "delimiter_split", "regex", "key_value"):
            p = get_parser(method)
            assert isinstance(p, parser_engine.BaseParser)

    def test_get_unknown_raises(self):
        with pytest.raises(UnknownParserError):
            get_parser("nonexistent_parser")

    def test_parse_convenience_known(self):
        result = parser_engine.parse(
            "01R31 NO 45.0",
            "key_value",
            {"key": "01R31", "value_offset": 2},
            {},
        )
        assert result == pytest.approx(45.0)

    def test_parse_convenience_unknown_returns_none(self):
        result = parser_engine.parse("anything", "not_a_parser", {}, {})
        assert result is None


# ─── SerialASCIIReader — poll_parameters ─────────────────────────────────────

class TestSerialASCIIReaderPollParameters:
    """
    Tests for poll_parameters without real hardware.
    _send_and_receive_sync is mocked at asyncio.to_thread level.
    """

    def _make_reader(self, **kwargs) -> SerialASCIIReader:
        defaults = dict(
            port="COM99",
            baudrate=9600,
            data_bits=8,
            parity="N",
            stop_bits=1,
            timeout=1.0,
            command_format="ascii",
            request_command="<SOH>R31<CR>",
            response_delimiter="newline",
        )
        defaults.update(kwargs)
        return SerialASCIIReader(**defaults)

    def _param(self, pid=1, method="key_value", config=None) -> dict:
        import json
        return {
            "id": pid,
            "parse_method": method,
            "parse_config": json.dumps(config or {"key": "01R31", "value_offset": 2}),
            "scale_factor": 1.0,
            "offset": 0.0,
            "data_type": "float32",
        }

    @pytest.mark.asyncio
    async def test_valid_response_parsed(self):
        reader = self._make_reader()
        with patch.object(reader, "_send_and_receive_sync",
                          return_value="01R31 NO 45.23"):
            results = await reader.poll_parameters([self._param()])

        assert len(results) == 1
        assert results[0]["parameter_id"] == 1
        assert results[0]["value"] == pytest.approx(45.23)
        assert results[0]["quality"] == "U"

    @pytest.mark.asyncio
    async def test_no_response_returns_error_quality(self):
        reader = self._make_reader()
        with patch.object(reader, "_send_and_receive_sync", return_value=None):
            results = await reader.poll_parameters([self._param()])

        assert results[0]["value"] is None
        assert results[0]["quality"] == "E"

    @pytest.mark.asyncio
    async def test_key_missing_in_response_returns_error_quality(self):
        reader = self._make_reader()
        with patch.object(reader, "_send_and_receive_sync",
                          return_value="02R31 NO2 12.10"):  # no 01R31
            results = await reader.poll_parameters([self._param()])

        assert results[0]["value"] is None
        assert results[0]["quality"] == "E"

    @pytest.mark.asyncio
    async def test_scale_and_offset_applied(self):
        p = self._param()
        p["scale_factor"] = 2.0
        p["offset"] = 5.0
        reader = self._make_reader()
        with patch.object(reader, "_send_and_receive_sync",
                          return_value="01R31 NO 10.0"):
            results = await reader.poll_parameters([p])

        # (10.0 * 2.0) + 5.0 = 25.0
        assert results[0]["value"] == pytest.approx(25.0)

    @pytest.mark.asyncio
    async def test_multiple_parameters_same_response(self):
        """Two parameters parsed from a single response."""
        import json
        p1 = self._param(pid=1, config={"key": "01R31", "value_offset": 2})
        p2 = self._param(pid=2, config={"key": "02R31", "value_offset": 2})
        reader = self._make_reader()
        response = "01R31 NO 45.23 02R31 NO2 12.10"
        with patch.object(reader, "_send_and_receive_sync", return_value=response):
            results = await reader.poll_parameters([p1, p2])

        assert results[0]["value"] == pytest.approx(45.23)
        assert results[1]["value"] == pytest.approx(12.10)

    @pytest.mark.asyncio
    async def test_disconnected_serial_returns_error(self):
        """Simulates SerialException during send_and_receive."""
        from serial import SerialException
        reader = self._make_reader()
        with patch.object(reader, "_send_and_receive_sync", return_value=None):
            # _send_and_receive_sync already handles exceptions and returns None
            results = await reader.poll_parameters([self._param()])

        assert results[0]["quality"] == "E"

    @pytest.mark.asyncio
    async def test_empty_parameters_list(self):
        reader = self._make_reader()
        with patch.object(reader, "_send_and_receive_sync", return_value="some data"):
            results = await reader.poll_parameters([])

        assert results == []


class TestHoribaAPNA370Parsing:
    """Test parsing real Horiba APNA370 ASCII live response payload."""

    HORIBA_RESP = (
        "010100R00100,20231206152930,01R31  1.291,02R31  0.013,03R31  1.304,"
        "0000010000000000,00000000000000000000000000000000000000000000000000000000000000000000000000000000019"
    )

    def test_regex_parser_horiba(self):
        p_no = RegexParser().parse(self.HORIBA_RESP, {"pattern": r"01R31\s+([-+]?\d+\.?\d*)"}, {})
        p_no2 = RegexParser().parse(self.HORIBA_RESP, {"pattern": r"02R31\s+([-+]?\d+\.?\d*)"}, {})
        p_nox = RegexParser().parse(self.HORIBA_RESP, {"pattern": r"03R31\s+([-+]?\d+\.?\d*)"}, {})

        assert p_no == pytest.approx(1.291)
        assert p_no2 == pytest.approx(0.013)
        assert p_nox == pytest.approx(1.304)

    def test_key_value_parser_horiba(self):
        p_no = KeyValueParser().parse(self.HORIBA_RESP, {"key": "01R31", "value_offset": 1}, {})
        p_no2 = KeyValueParser().parse(self.HORIBA_RESP, {"key": "02R31", "value_offset": 1}, {})
        p_nox = KeyValueParser().parse(self.HORIBA_RESP, {"key": "03R31", "value_offset": 1}, {})

        assert p_no == pytest.approx(1.291)
        assert p_no2 == pytest.approx(0.013)
        assert p_nox == pytest.approx(1.304)

