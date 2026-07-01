import ssl
import sys
import logging
import urllib.request

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


def urlopen_with_ssl_fallback(req, *args, **kwargs):
    """Wrapper around urllib.request.urlopen that falls back to an unverified
    SSL context if default/verified connection fails due to SSL errors.
    """
    try:
        # First attempt: Try with verified context
        context = get_verified_ssl_context()
        return urllib.request.urlopen(req, *args, context=context, **kwargs)
    except Exception as e:
        _log.warning(f"SSL verification failed, trying with unverified context. Error: {e}")
        # Second attempt: Try with unverified context
        try:
            unverified_context = ssl._create_unverified_context()
            return urllib.request.urlopen(req, *args, context=unverified_context, **kwargs)
        except Exception as e2:
            _log.error(f"Unverified SSL context connection failed. Error: {e2}")
            raise e2


