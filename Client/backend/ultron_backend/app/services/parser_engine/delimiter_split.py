"""
UltrON — Parser Engine: Delimiter Split Parser

Splits the response on a configurable separator and returns the token at index.
Config keys: sep (str), index (int).
"""

from typing import Optional

from app.services.parser_engine.base import BaseParser


class DelimiterSplitParser(BaseParser):
    """
    response.split(sep)[index] → float.

    config:
        sep   (str, default " ")  — delimiter character(s)
        index (int, default 0)    — zero-based token position
    """

    def parse(self, response: str, config: dict, param: dict) -> Optional[float]:
        try:
            sep = config.get("sep", " ")
            index = int(config.get("index", 0))
            parts = response.split(sep)
            raw_str = parts[index].strip() if index < len(parts) else None
            return float(raw_str) if raw_str not in (None, "", "N/A", "---") else None
        except (ValueError, TypeError, IndexError):
            return None
