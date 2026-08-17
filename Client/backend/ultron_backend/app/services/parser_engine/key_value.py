"""
UltrON — Parser Engine: Key-Value ASCII Parser

Locates a named key token in the response and returns the value at a
configurable offset after the key.

Designed for analyzers that return multiple parameters in a single
space-delimited response string where each parameter is identified by
a token key.

Config keys:
    key          (str, required)   — token to locate in the response
    value_offset (int, default 1)  — number of tokens after the key to read
    separator    (str|None, default None) — split char; None = whitespace

Examples:

  Response: "01R31 NO 45.23 02R31 NO2 12.10"
  config = {"key": "01R31", "value_offset": 2}
  → tokens: ["01R31", "NO", "45.23", "02R31", "NO2", "12.10"]
  → key at index 0, target = index 0+2 = "45.23" → 45.23

  Response: "01R31 45.23 02R31 12.10"
  config = {"key": "01R31", "value_offset": 1}
  → key at index 0, target = index 0+1 = "45.23" → 45.23

  Response: "TEMP=23.5,HUM=60.1"
  Better handled by RegexParser — use key_value for space/delimiter tokens.
"""

from typing import Optional

from app.services.parser_engine.base import BaseParser


class KeyValueParser(BaseParser):
    """
    Generic key-value token parser for ASCII analyzers.
    No vendor-specific logic — fully configured via parse_config JSON.
    """

    def parse(self, response: str, config: dict, param: dict) -> Optional[float]:
        try:
            key = config.get("key", "")
            if not key:
                return None

            value_offset = int(config.get("value_offset", 1))
            separator = config.get("separator") or None  # None = split on whitespace

            resp_text = response.replace(",", " ") if separator is None else response
            tokens = [t.strip() for t in resp_text.split(separator) if t.strip()]

            # Find the key token (exact match, case-sensitive)
            key_index = tokens.index(key)
            target_index = key_index + value_offset

            if target_index >= len(tokens):
                return None

            raw_str = tokens[target_index]
            return float(raw_str) if raw_str not in ("N/A", "---", "") else None

        except (ValueError, TypeError, IndexError):
            return None
