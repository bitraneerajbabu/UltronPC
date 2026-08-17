"""
UltrON — Parser Engine
Factory package for transport-independent response parsers.

Usage (preferred convenience form):
    from app.services import parser_engine
    value = parser_engine.parse(raw_response, "key_value", config, param)

Usage (factory form — when you need the parser instance):
    parser = parser_engine.get_parser("key_value")
    value  = parser.parse(raw_response, config, param)

Supported method strings:
    "csv_col"          CsvColParser
    "position"         PositionParser
    "delimiter_split"  DelimiterSplitParser
    "regex"            RegexParser
    "key_value"        KeyValueParser

Adding a new parser:
    1. Create services/parser_engine/<name>.py with a class inheriting BaseParser
    2. Import it here and add one entry to _REGISTRY
    No other files need to change.
"""

from typing import Optional

from app.services.parser_engine.base import BaseParser
from app.services.parser_engine.csv_col import CsvColParser
from app.services.parser_engine.position import PositionParser
from app.services.parser_engine.delimiter_split import DelimiterSplitParser
from app.services.parser_engine.regex_ import RegexParser
from app.services.parser_engine.key_value import KeyValueParser
from app.services.parser_engine.binary_float import BinaryFloatParser


class UnknownParserError(ValueError):
    """Raised by get_parser() when the method string is not registered."""


# ─── Registry ─────────────────────────────────────────────────────────────────
# Key   = parse_method string stored in Parameter.parse_method
# Value = parser class (instantiated on each call — parsers are stateless)

_REGISTRY: dict[str, type[BaseParser]] = {
    "csv_col":         CsvColParser,
    "position":        PositionParser,
    "delimiter_split": DelimiterSplitParser,
    "regex":           RegexParser,
    "key_value":       KeyValueParser,
    "binary_float":    BinaryFloatParser,
}


def get_parser(method: str) -> BaseParser:
    """
    Return a parser instance for the given method string.
    Raises UnknownParserError if method is not registered.
    """
    cls = _REGISTRY.get(method)
    if cls is None:
        raise UnknownParserError(f"Unknown parse method: '{method}'")
    return cls()


def parse(
    response: str,
    method: str,
    config: dict,
    param: dict,
) -> Optional[float]:
    """
    Convenience wrapper — look up parser by method and call parse().
    Returns None (does not raise) for unknown methods.
    """
    cls = _REGISTRY.get(method)
    if cls is None:
        return None
    return cls().parse(response, config, param)
