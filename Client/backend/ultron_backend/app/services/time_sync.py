"""
UltrON — Online Time Sync Service
Decouples telemetry, alarms, logs, and reports from Windows system clock drift.

Queries online NTP servers (port 123) or HTTP server Date headers (rajapi.com / 1.1.1.1)
to compute a clock offset between true UTC time and the local PC system clock.
"""

import asyncio
import socket
import struct
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import httpx

from app.core.logger import get_logger

log = get_logger("ultron.time_sync")

# Difference in seconds between NTP epoch (1900-01-01) and Unix epoch (1970-01-01)
NTP_DELTA = 2208988800

NTP_SERVERS = [
    "pool.ntp.org",
    "time.google.com",
    "time.windows.com",
    "time.cloudflare.com",
]

HTTP_SERVERS = [
    "https://rajapi.com",
    "https://1.1.1.1",
    "https://www.google.com",
]

# Global offset state: online_utc - system_utc (in seconds)
_clock_offset_seconds: float = 0.0
_last_synced_at: Optional[datetime] = None
_sync_source: str = "system"
_sync_running: bool = False


def get_utc_now() -> datetime:
    """
    Returns the true current UTC datetime adjusted by the online time sync offset.
    Always returns a naive UTC datetime for database compatibility.
    """
    system_now = datetime.utcnow()
    if _clock_offset_seconds != 0.0:
        return system_now + timedelta(seconds=_clock_offset_seconds)
    return system_now


def get_clock_offset() -> float:
    """Returns current clock offset in seconds (positive means PC clock is behind real time)."""
    return _clock_offset_seconds


def get_sync_status() -> Dict[str, Any]:
    """Returns time sync diagnostic info."""
    return {
        "sync_source": _sync_source,
        "offset_seconds": round(_clock_offset_seconds, 3),
        "last_synced_at": _last_synced_at.isoformat() if _last_synced_at else None,
        "current_utc_now": get_utc_now().isoformat(),
        "system_utc_now": datetime.utcnow().isoformat(),
    }


def _query_ntp_server(host: str, timeout: float = 3.0) -> Optional[datetime]:
    """Synchronously query an NTP server via UDP socket."""
    try:
        msg = b'\x1b' + 47 * b'\0'
        client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        client.settimeout(timeout)
        client.sendto(msg, (host, 123))
        data, _ = client.recvfrom(1024)
        client.close()

        if len(data) >= 48:
            # Unpack transmit timestamp (seconds since 1900)
            sec, frac = struct.unpack("!II", data[40:48])
            unix_ts = sec - NTP_DELTA + (frac / 2**32)
            return datetime.fromtimestamp(unix_ts, tz=timezone.utc).replace(tzinfo=None)
    except Exception as e:
        log.debug(f"NTP query failed for host {host}: {e}")
    return None


async def _query_http_date_header(url: str, timeout: float = 4.0) -> Optional[datetime]:
    """Fallback: query HTTP Date header from reliable servers."""
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=False) as client:
            resp = await client.head(url)
            date_str = resp.headers.get("Date")
            if date_str:
                from email.utils import parsedate_to_datetime
                dt = parsedate_to_datetime(date_str)
                return dt.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception as e:
        log.debug(f"HTTP Date query failed for {url}: {e}")
    return None


async def sync_online_time() -> bool:
    """
    Attempts to sync time with NTP or HTTP servers.
    Calculates clock offset = online_utc - system_utc.
    """
    global _clock_offset_seconds, _last_synced_at, _sync_source

    system_now = datetime.utcnow()

    # 1. Try NTP servers in parallel using executor
    loop = asyncio.get_running_loop()
    for ntp_host in NTP_SERVERS:
        try:
            online_utc = await loop.run_in_executor(None, _query_ntp_server, ntp_host, 3.0)
            if online_utc:
                _clock_offset_seconds = (online_utc - system_now).total_seconds()
                _last_synced_at = system_now
                _sync_source = f"NTP ({ntp_host})"
                log.info(f"[TimeSync] Synced via {_sync_source}. Offset: {_clock_offset_seconds:+.2f}s")
                return True
        except Exception as e:
            log.debug(f"NTP error {ntp_host}: {e}")

    # 2. Fallback: Try HTTP Date headers
    for http_url in HTTP_SERVERS:
        try:
            online_utc = await _query_http_date_header(http_url, 4.0)
            if online_utc:
                _clock_offset_seconds = (online_utc - system_now).total_seconds()
                _last_synced_at = system_now
                _sync_source = f"HTTP ({http_url})"
                log.info(f"[TimeSync] Synced via {_sync_source}. Offset: {_clock_offset_seconds:+.2f}s")
                return True
        except Exception as e:
            log.debug(f"HTTP date sync error {http_url}: {e}")

    # 3. Offline fallback
    if _last_synced_at is None:
        _sync_source = "system (offline fallback)"
        log.warning("[TimeSync] Offline / Time servers unreachable — using local PC system clock")
    else:
        log.warning(f"[TimeSync] Time servers unreachable — retaining last offset ({_clock_offset_seconds:+.2f}s)")
    return False


async def start_time_sync_loop(interval_minutes: int = 10):
    """Background task to sync online time periodically."""
    global _sync_running
    _sync_running = True
    log.info("Online Time Sync service starting …")

    # Initial sync on startup
    await sync_online_time()

    while _sync_running:
        try:
            await asyncio.sleep(interval_minutes * 60)
            await sync_online_time()
        except asyncio.CancelledError:
            log.info("Time Sync loop cancelled")
            break
        except Exception as e:
            log.error(f"Error in Time Sync loop: {e}")
            await asyncio.sleep(60)


def stop_time_sync():
    global _sync_running
    _sync_running = False
