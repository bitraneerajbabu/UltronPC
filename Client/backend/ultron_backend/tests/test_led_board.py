"""
Unit tests for LED Board LAN Endpoint & Payload formatting.
"""

import pytest
from app.database import AsyncSessionLocal, init_db
from app.services.led_push import build_led_response


@pytest.mark.asyncio
async def test_build_led_response_empty_db():
    """Verify LED response builder handles empty DB cleanly without throwing."""
    await init_db()
    async with AsyncSessionLocal() as db:
        res = await build_led_response(db, channel_ids=[])
        assert isinstance(res, list)
        assert len(res) == 0
