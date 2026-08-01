"""
UltrON — Parser Engine: Regex Parser

Extracts a value using a regular expression capture group.
Config keys: pattern (str).
"""

import re
from typing import Optional

from app.services.parser_engine.base import BaseParser


class RegexParser(BaseParser):
    """
    Apply re.search(pattern, response) and return group(1) as float.

    config:
        pattern (str, default r"(\\d+\\.?\\d*)") — regex with one capture group
    """

    def parse(self, response: str, config: dict, param: dict) -> Optional[float]:
        try:
            pattern = config.get("pattern", r"(\d+\.?\d*)")
            m = re.search(pattern, response)
            raw_str = m.group(1) if m else None
            return float(raw_str) if raw_str not in (None, "", "N/A", "---") else None
        except (ValueError, TypeError, AttributeError, re.error):
            return None
