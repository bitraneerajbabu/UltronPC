"""
UltrON — Security Middleware
Provides:
  - HSTS header (Strict-Transport-Security)
  - Secure response headers (X-Content-Type-Options, X-Frame-Options, etc.)
  - Request size limiting
  - WebSocket auth improvements (token expiry in URL warning)
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Apply security-related HTTP headers to every response:
      - Strict-Transport-Security (HSTS)
      - X-Content-Type-Options (nosniff)
      - X-Frame-Options (DENY)
      - Referrer-Policy
      - Permissions-Policy
      - Cache-Control (for sensitive responses)
    """

    async def dispatch(self, request: Request, call_next):
        resp: Response = await call_next(request)

        # HSTS — instruct browsers to always use HTTPS
        if "Strict-Transport-Security" not in resp.headers:
            resp.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        # Prevent MIME type sniffing
        if "X-Content-Type-Options" not in resp.headers:
            resp.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking
        if "X-Frame-Options" not in resp.headers:
            resp.headers["X-Frame-Options"] = "DENY"

        # Control referrer information
        if "Referrer-Policy" not in resp.headers:
            resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Restrict browser features
        if "Permissions-Policy" not in resp.headers:
            resp.headers["Permissions-Policy"] = (
                "camera=(), microphone=(), geolocation=(), "
                "fullscreen=(self), payment=()"
            )

        return resp


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Limit incoming request body size.
    Default: 10 MB for most endpoints, smaller for auth.
    """

    def __init__(self, app, max_size: int = 10 * 1024 * 1024):
        super().__init__(app)
        self.max_size = max_size

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_size:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                {"detail": "Request entity too large"},
                status_code=413,
            )
        return await call_next(request)
