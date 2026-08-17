"""
UltrON — Deployment Mode Service

Manages deployment mode storage and retrieval (online | offline_only).
Mode Transition Policy (Section 3):
- Reconfiguration path requires local Admin/Master password authentication.
- Storage is persistent via app settings / environment configuration.
"""

from typing import Dict, Any
from app.config import settings
from app.core.logger import get_logger

log = get_logger("ultron.deployment_mode")

VALID_MODES = {"online", "offline_only"}


def get_deployment_mode() -> str:
    """
    Get current deployment mode ('online' or 'offline_only').
    Defaults to 'online'.
    """
    mode = str(getattr(settings, "DEPLOYMENT_MODE", "online")).strip().lower()
    return mode if mode in VALID_MODES else "online"


def is_online_mode() -> bool:
    """Check if app is running in 'online' mode."""
    return get_deployment_mode() == "online"


def is_offline_only_mode() -> bool:
    """Check if app is running in 'offline_only' mode."""
    return get_deployment_mode() == "offline_only"


def set_deployment_mode(new_mode: str, admin_password: str) -> Dict[str, Any]:
    """
    Reconfigure deployment mode ('online' <-> 'offline_only').
    Requires local Master / Admin password authentication.

    Returns:
        Dict[str, Any] with status and details.
    
    Raises:
        ValueError: If new_mode is invalid.
        PermissionError: If admin_password is incorrect.
    """
    cleaned_mode = str(new_mode).strip().lower()
    if cleaned_mode not in VALID_MODES:
        raise ValueError(f"Invalid deployment mode '{new_mode}'. Must be one of: {sorted(VALID_MODES)}")

    if admin_password != settings.ADMIN_PASSWORD:
        log.warning(f"Failed deployment mode change attempt to '{cleaned_mode}': Invalid admin password")
        raise PermissionError("Admin password verification failed")

    old_mode = get_deployment_mode()
    settings.DEPLOYMENT_MODE = cleaned_mode

    log.info(f"Deployment mode successfully reconfigured: {old_mode} -> {cleaned_mode}")
    return {
        "status": "success",
        "previous_mode": old_mode,
        "current_mode": cleaned_mode,
    }
