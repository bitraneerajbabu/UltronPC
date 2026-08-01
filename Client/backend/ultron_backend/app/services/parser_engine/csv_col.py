"""
UltrON — Parser Engine: CSV Column Parser

Extracts value at a column index from a CSV or whitespace-delimited response.
Config: none — uses param["register_address"] as the column index.
"""

import csv
import io
from typing import Optional

from app.services.parser_engine.base import BaseParser


class CsvColParser(BaseParser):
    """
    Split response on commas (or whitespace when no commas present),
    return the token at register_address as a float.

    Mirrors the existing _extract_value "csv_col" branch in tcp_custom.py
    so behaviour is identical when adopting this shared parser.
    """

    def parse(self, response: str, config: dict, param: dict) -> Optional[float]:
        try:
            col_idx = param.get("register_address", 0)
            if "," not in response and " " in response:
                fields = response.split()
            else:
                reader = csv.reader(io.StringIO(response))
                fields = next(reader, [])
            raw_str = fields[col_idx].strip() if col_idx < len(fields) else None
            return float(raw_str) if raw_str not in (None, "", "N/A", "---") else None
        except (ValueError, TypeError, IndexError):
            return None
