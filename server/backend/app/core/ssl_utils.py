import ssl
import logging

_log = logging.getLogger("rajapi.ssl")


def get_verified_ssl_context() -> ssl.SSLContext:
    """Return a verified SSL context using system CA certificates.

    Raises on failure — never silently downgrades security.
    """
    return ssl.create_default_context()
