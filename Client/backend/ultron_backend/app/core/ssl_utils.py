import ssl
import sys
import logging

_log = logging.getLogger("ultron.ssl")


def get_verified_ssl_context() -> ssl.SSLContext:
    """Return a verified SSL context using system CA certificates or certifi.
    
    Raises on failure — never falls back to unverified.
    """
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()

