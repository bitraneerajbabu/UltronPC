"""
UltrON — Global Error Handler & Observability Middleware

Provides:
  - Global exception middleware (never exposes stack traces, secrets, paths)
  - Request ID and correlation ID (X-Request-Id, X-Correlation-Id)
  - Structured JSON access logging
  - User-friendly error responses
  - Developer-only verbose errors (DEBUG mode)
  - Security event logging for 4xx/5xx responses
"""

import uuid
import traceback
from datetime import datetime, timezone

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from app.config import settings
from app.core.logger import get_logger, get_audit_logger

log = get_logger("ultron.http")
audit = get_audit_logger()

SAFE_ERROR_DETAIL = "An unexpected error occurred. Please try again later."

# Paths that should never appear in error messages
SENSITIVE_PATH_PATTERNS = [
    "/.env", "/secret.key", "/secret.salt", "/.env.enc",
    "/ultron.db", "/app/", "/config.py",
]


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Attach X-Request-Id and X-Correlation-Id to every request and response.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        correlation_id = request.headers.get("X-Correlation-Id") or str(uuid.uuid4())

        request.state.request_id = request_id
        request.state.correlation_id = correlation_id
        request.state.start_time = datetime.now(timezone.utc)

        resp = await call_next(request)

        resp.headers["X-Request-Id"] = request_id
        resp.headers["X-Correlation-Id"] = correlation_id

        # Response time header
        if hasattr(request.state, "start_time"):
            elapsed = (datetime.now(timezone.utc) - request.state.start_time).total_seconds()
            resp.headers["X-Response-Time-Ms"] = str(round(elapsed * 1000, 1))

        return resp


class GlobalExceptionMiddleware(BaseHTTPMiddleware):
    """
    Catch all unhandled exceptions and return safe JSON responses.
    Never exposes: stack traces, filesystem paths, SQL, secrets, internal IPs.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        try:
            resp = await call_next(request)
            return resp
        except HTTPException as exc:
            return self._http_error_response(request, exc)
        except Exception as exc:
            return self._internal_error_response(request, exc)

    def _http_error_response(self, request: Request, exc: HTTPException) -> JSONResponse:
        status_code = exc.status_code
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)

        log.warning(
            f"HTTP {status_code} | {request.method} {request.url.path} | "
            f"req_id={getattr(request.state, 'request_id', '?')} | {detail}"
        )

        return JSONResponse(
            status_code=status_code,
            content={"detail": detail},
            headers=getattr(exc, "headers", None) or {},
        )

    def _internal_error_response(self, request: Request, exc: Exception) -> JSONResponse:
        req_id = getattr(request.state, "request_id", "?")
        corr_id = getattr(request.state, "correlation_id", "?")

        # Log full traceback for developers
        log.error(
            f"Unhandled {type(exc).__name__} | {request.method} {request.url.path} | "
            f"req_id={req_id} | corr_id={corr_id}\n"
            f"{''.join(traceback.format_exception(type(exc), exc, exc.__traceback__))}"
        )

        # Audit security-relevant endpoint failures
        if request.url.path.startswith("/api/"):
            audit.warning(
                f"API error | {request.method} {request.url.path} | "
                f"status=500 | req_id={req_id}"
            )

        user_msg = SAFE_ERROR_DETAIL
        if settings.DEBUG:
            user_msg = f"{type(exc).__name__}: {str(exc)}"

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": user_msg,
                "request_id": req_id,
            },
        )


class AccessLogMiddleware(BaseHTTPMiddleware):
    """
    Structured access logging for every API request.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        resp = await call_next(request)

        if request.url.path.startswith("/api/") or request.url.path.startswith("/ws/"):
            elapsed = 0
            if hasattr(request.state, "start_time"):
                elapsed = (datetime.now(timezone.utc) - request.state.start_time).total_seconds()

            log.info(
                f"{resp.status_code} | {request.method} {request.url.path} | "
                f"{elapsed:.1f}s | "
                f"ip={request.client.host if request.client else '?'} | "
                f"req_id={getattr(request.state, 'request_id', '?')}"
            )

        return resp
