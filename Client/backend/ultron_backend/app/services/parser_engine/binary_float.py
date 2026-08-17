"""
UltrON — Parser Engine: Binary Float Parser

Extracts a 4-byte IEEE-754 floating point number from binary/latin1 response bytes.
Config keys:
    offset (int, default 37)     — byte offset in the response frame
    byte_order (str, default ">f") — struct format (>f = big endian float, <f = little endian)
"""

import struct
from typing import Optional
from app.services.parser_engine.base import BaseParser


class BinaryFloatParser(BaseParser):
    """
    Extract 4-byte IEEE-754 float from raw binary response.

    config:
        offset     (int, default 37)  — byte offset in response
        byte_order (str, default ">f") — struct unpack format string
    """

    def parse(self, response: str, config: dict, param: dict) -> Optional[float]:
        try:
            offset = int(config.get("offset", 37))
            fmt = str(config.get("byte_order", ">f"))

            # Convert response string back to raw bytes losslessly using latin1
            raw_bytes = response.encode("latin1")

            if len(raw_bytes) < offset + 4:
                return None

            float_bytes = raw_bytes[offset : offset + 4]
            val = struct.unpack(fmt, float_bytes)[0]
            return float(val)
        except Exception:
            return None
