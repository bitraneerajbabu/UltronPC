"""
UltrON — Driver Registry Service (driver_registry.py)

Registry mapping protocol identifier strings to transport drivers.
Decouples CommunicationManager from protocol-specific instantiation.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Type, Optional, Any

from app.core.logger import get_logger
from app.services.config_cache import CachedDeviceSpec, CachedParameterSpec

log = get_logger("ultron.driver_registry")


class DriverRegistry:
    """
    Central registry for protocol drivers.
    Allows dynamic registration of new protocols without modifying CommManager.
    """

    def __init__(self):
        self._drivers: Dict[str, Any] = {}

    def register(self, protocol_name: str, driver_cls_or_factory: Any) -> None:
        """Register a driver factory or class for a protocol string."""
        key = protocol_name.lower().strip()
        self._drivers[key] = driver_cls_or_factory
        log.info(f"DriverRegistry: registered protocol '{key}'")

    def get_driver_factory(self, protocol_name: str) -> Optional[Any]:
        """Look up driver factory by protocol name."""
        key = protocol_name.lower().strip()
        return self._drivers.get(key)

    def is_registered(self, protocol_name: str) -> bool:
        """Check if protocol is registered."""
        return protocol_name.lower().strip() in self._drivers


# Global Registry Instance
driver_registry = DriverRegistry()
