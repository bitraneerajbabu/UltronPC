"""
UltrON — Parser Engine: Base class
All parsers implement this contract.
"""

from abc import ABC, abstractmethod
from typing import Optional


class BaseParser(ABC):
    """
    Abstract base for all response parsers.

    Contract:
    - parse() MUST NOT raise — return None on failure
    - parse() MUST NOT perform I/O
    - Instances are stateless; one instance is safe to share
    """

    @abstractmethod
    def parse(
        self,
        response: str,    # raw decoded string from the wire
        config: dict,     # parse_config JSON (may be empty)
        param: dict,      # parameter dict (id, register_address, …)
    ) -> Optional[float]:
        ...
