"""
Unit tests for settings safety and defensive accessors.
Ensures that missing/empty settings attributes never crash endpoint routers
or background tasks with AttributeError (HTTP 500).
"""

import pytest
from app.config import settings
from app.api.license import get_license_status


def test_settings_has_required_attributes():
    """Verify that all core settings attributes are defined on Settings model."""
    required_attrs = [
        "APP_NAME",
        "APP_VERSION",
        "SECRET_KEY",
        "CENTRAL_API_KEY",
        "CENTRAL_API_URL",
        "RAJAPI_SYNC_URL",
        "RAJAPI_STATION_ID",
        "RAJAPI_SYNC_ENABLED",
        "GATEWAY_ID",
        "DEVICE_SECRET",
        "DEPLOYMENT_MODE",
    ]
    for attr in required_attrs:
        assert hasattr(settings, attr), f"Missing setting attribute: {attr}"


@pytest.mark.asyncio
async def test_license_status_never_raises_attribute_error():
    """Verify get_license_status runs cleanly even if keys are empty."""
    res = await get_license_status()
    assert isinstance(res, dict)
    assert res.get("licensed") is True
    assert "lock_status" in res
    assert "server_url" in res
