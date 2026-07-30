"""
UltrON — Sliding Window Rate Limiter

In-memory per-IP and per-user rate limiting with:
  - Sliding window counters
  - Per-IP limits (login, API)
  - Per-user limits (admin endpoints)
  - Burst protection
  - Configurable windows and thresholds
  - HTTP 429 responses with Retry-After header
"""

import time
import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.config import settings
from app.core.logger import get_logger

log = get_logger("ultron.rate_limiter")


@dataclass
class SlidingWindowCounter:
    """Per-key sliding window counter with O(1) cleanup."""
    max_requests: int
    window_seconds: float
    timestamps: list[float] = field(default_factory=list)

    def _prune(self, now: float):
        cutoff = now - self.window_seconds
        while self.timestamps and self.timestamps[0] < cutoff:
            self.timestamps.pop(0)

    def allow(self, now: Optional[float] = None) -> bool:
        now = now or time.monotonic()
        self._prune(now)
        if len(self.timestamps) >= self.max_requests:
            return False
        self.timestamps.append(now)
        return True

    def remaining(self, now: Optional[float] = None) -> int:
        now = now or time.monotonic()
        self._prune(now)
        return max(0, self.max_requests - len(self.timestamps))

    def retry_after(self, now: Optional[float] = None) -> float:
        now = now or time.monotonic()
        if not self.timestamps:
            return 0
        return max(0, self.window_seconds - (now - self.timestamps[0]))


class RateLimiter:
    """In-memory rate limiter with per-IP buckets."""

    def __init__(self):
        self._ip_buckets: dict[str, SlidingWindowCounter] = {}
        self._lock = asyncio.Lock()

    def _get_ip_key(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def check_ip(
        self,
        request: Request,
        max_requests: int = 20,
        window_seconds: float = 60.0,
    ) -> bool:
        ip = self._get_ip_key(request)
        key = f"ip:{ip}"
        async with self._lock:
            if key not in self._ip_buckets:
                self._ip_buckets[key] = SlidingWindowCounter(max_requests, window_seconds)
            return self._ip_buckets[key].allow()

    async def check_user(
        self,
        username: str,
        max_requests: int = 20,
        window_seconds: float = 60.0,
    ) -> bool:
        key = f"user:{username}"
        async with self._lock:
            if key not in self._ip_buckets:
                self._ip_buckets[key] = SlidingWindowCounter(max_requests, window_seconds)
            return self._ip_buckets[key].allow()


    def cleanup(self):
        """Periodic cleanup of stale buckets."""
        now = time.monotonic()
        for bucket in list(self._ip_buckets.values()):
            if bucket.timestamps and (now - bucket.timestamps[-1]) > bucket.window_seconds * 2:
                stale = [k for k, v in self._ip_buckets.items() if v is bucket]
                for k in stale:
                    del self._ip_buckets[k]


# Singleton
rate_limiter = RateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Apply rate limiting to matching request paths.
    Skips static files and non-API routes.
    """

    RATE_LIMITS: dict[str, tuple[int, float]] = {
        "/api/v1/auth/login": (5, 60.0),
        "/api/v1/auth/refresh": (10, 60.0),
        "/api/v1/auth/setup-override": (3, 300.0),
        "/api/v1/users/": (30, 60.0),
        "/api/v1/led": (60, 60.0),
        "/api/v1/reports/": (10, 60.0),
        "/ws/live": (20, 60.0),
        "/api/v1/uploads/": (5, 60.0),
    }

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        # Skip non-API routes
        if not request.url.path.startswith("/api/") and not request.url.path.startswith("/ws/"):
            return await call_next(request)

        limits = self._match_limits(request.url.path)
        if limits:
            allowed = await rate_limiter.check_ip(request, limits[0], limits[1])
            if not allowed:
                log.warning(f"Rate limit exceeded: {request.client.host if request.client else 'unknown'} -> {request.url.path}")
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "Too many requests. Please slow down."},
                    headers={"Retry-After": "60"},
                )

        return await call_next(request)

    def _match_limits(self, path: str) -> Optional[tuple[int, float]]:
        for prefix, limits in self.RATE_LIMITS.items():
            if path.startswith(prefix):
                return limits
        return None
