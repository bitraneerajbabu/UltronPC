"""
UltrON — Parser Engine: Fixed Position Parser

Extracts a value by byte offset and length from the response string.
Config keys: start (int), length (int), decimal (int).
"""

from typing import Optional

from app.services.parser_engine.base import BaseParser


class PositionParser(BaseParser):
    """
    Slice response[start : start+length], optionally insert a decimal point.

    config:
        start   (int, default 0)   — character offset
        length  (int, default 4)   — number of characters to read
        decimal (int, default 0)   — digits from right to insert decimal point
    """

    def parse(self, response: str, config: dict, param: dict) -> Optional[float]:
        try:
            start = int(config.get("start", 0))
            length = int(config.get("length", 4))
            decimal = int(config.get("decimal", 0))
            raw_str = response[start: start + length].strip()
            if decimal > 0 and raw_str and raw_str.isdigit():
                raw_str = raw_str[:-decimal] + "." + raw_str[-decimal:]
            return float(raw_str) if raw_str not in (None, "", "N/A", "---") else None
        except (ValueError, TypeError, IndexError):
            return None
