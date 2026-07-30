import ssl
import urllib.request
from typing import Any


def get_verified_ssl_context() -> ssl.SSLContext:
    """Return standard verified SSL context."""
    return ssl.create_default_context()


def urlopen_with_ssl_fallback(req: urllib.request.Request, *args: Any, **kwargs: Any) -> Any:
    """Wrapper around urllib.request.urlopen with default verified SSL context."""
    return urllib.request.urlopen(req, *args, context=get_verified_ssl_context(), **kwargs)



