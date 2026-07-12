"""Tests for the Rate Limiter."""

import pytest
from unittest.mock import MagicMock
from fastapi import Request

from app.core.rate_limiter import SlidingWindowCounter, RateLimiter


class TestSlidingWindowCounter:
    def test_allows_within_limit(self):
        c = SlidingWindowCounter(max_requests=3, window_seconds=60.0)
        assert c.allow()
        assert c.allow()
        assert c.allow()

    def test_blocks_over_limit(self):
        c = SlidingWindowCounter(max_requests=2, window_seconds=60.0)
        assert c.allow()
        assert c.allow()
        assert not c.allow()

    def test_remaining(self):
        c = SlidingWindowCounter(max_requests=5, window_seconds=60.0)
        assert c.remaining() == 5
        c.allow()
        assert c.remaining() == 4

    def test_retry_after_on_empty(self):
        c = SlidingWindowCounter(max_requests=5, window_seconds=60.0)
        assert c.retry_after() == 0.0


class TestRateLimiter:
    @pytest.mark.asyncio
    async def test_check_ip_allows(self):
        rl = RateLimiter()
        req = MagicMock(spec=Request)
        req.client.host = "127.0.0.1"
        req.headers = {"X-Forwarded-For": ""}
        req.url.path = "/api/v1/auth/login"
        assert await rl.check_ip(req, max_requests=10, window_seconds=60)

    @pytest.mark.asyncio
    async def test_check_user_allows(self):
        rl = RateLimiter()
        assert await rl.check_user("testuser", max_requests=5, window_seconds=60)

    def test_cleanup_does_not_crash(self):
        rl = RateLimiter()
        rl.cleanup()
