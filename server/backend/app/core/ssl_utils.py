import ssl
import logging

_log = logging.getLogger("rajapi.ssl")


def get_verified_ssl_context() -> ssl.SSLContext:
    """Return a verified SSL context using system CA certificates.
    
    Falls back to unverified context on failure for maximum compatibility.
    """
    try:
        return ssl.create_default_context()
    except Exception as exc:
        _log.warning("Could not create verified SSL context (%s). Falling back to unverified.", exc)
        return ssl._create_unverified_context()
