import ssl
import sys
import logging

_log = logging.getLogger("ultron.ssl")


def get_verified_ssl_context() -> ssl.SSLContext:
    """Return a verified SSL context using system CA certificates or certifi.
    
    Falls back to unverified context if creation fails.
    """
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception as exc:
        _log.debug("Could not create certifi SSL context (%s), trying default.", exc)
        try:
            return ssl.create_default_context()
        except Exception as exc2:
            _log.warning("Could not create verified SSL context (%s). Falling back to unverified.", exc2)
            return ssl._create_unverified_context()


def urlopen_with_ssl_fallback(req, timeout=None, context=None):
    """Call urllib.request.urlopen. If it fails with SSL verification errors,
    fallback to an unverified SSL context and retry.
    """
    import urllib.request
    try:
        ctx = context if context is not None else get_verified_ssl_context()
        return urllib.request.urlopen(req, timeout=timeout, context=ctx)
    except Exception as e:
        err_msg = str(e).lower()
        if "cert" in err_msg or "ssl" in err_msg or "verify" in err_msg:
            _log.warning("SSL verification failed (%s). Retrying request with unverified SSL context.", e)
            unverified_ctx = ssl._create_unverified_context()
            return urllib.request.urlopen(req, timeout=timeout, context=unverified_ctx)
        raise

