import ssl
import sys
import logging
import urllib.request
from typing import Any

_log = logging.getLogger("ultron.ssl")


def get_verified_ssl_context() -> ssl.SSLContext:
    """Return a verified SSL context using system CA certificates or certifi.

    Raises on failure — never falls back to unverified.
    """
    import certifi
    return ssl.create_default_context(cafile=certifi.where())


def urlopen_with_ssl_fallback(req: urllib.request.Request, *args: Any, **kwargs: Any) -> Any:
    """Wrapper around urllib.request.urlopen with verified SSL context.

    Raises on SSL error — never silently downgrades security.
    """
    context = get_verified_ssl_context()
    return urllib.request.urlopen(req, *args, context=context, **kwargs)


