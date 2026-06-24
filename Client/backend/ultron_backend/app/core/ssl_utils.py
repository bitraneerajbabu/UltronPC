import ssl
import sys
import logging

_log = logging.getLogger("ultron.ssl")


def get_verified_ssl_context() -> ssl.SSLContext:
    """Return a verified SSL context using system CA certificates.
    
    Falls back to unverified context if creation fails (rare on modern Windows,
    but can happen with outdated root stores or corporate SSL inspection).
    """
    try:
        return ssl.create_default_context()
    except Exception as exc:
        _log.warning("Could not create verified SSL context (%s). Falling back to unverified.", exc)
        ctx = ssl._create_unverified_context()
        return ctx
