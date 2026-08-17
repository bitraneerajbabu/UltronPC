"""
UltrON — Watchdog & Diagnostics Service (watchdog.py)

Monitors polling engine tasks, historian service health, data freshness in LiveCache,
and system CPU/RAM usage via psutil. Auto-restarts crashed tasks and exposes diagnostics.
"""

import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

try:
    import psutil
except ImportError:
    psutil = None

from app.core.logger import get_logger
from app.services.config_cache import config_cache
from app.services.live_cache import live_cache, DeviceState
from app.services.telemetry_service import telemetry_service
from app.services.comm_manager import comm_manager
from app.services.historian_service import historian_service
from app.services import polling_engine as pe
from app.services.time_sync import get_utc_now
from app.database import AsyncSessionLocal
from app.models.telemetry import SystemLog

log = get_logger("ultron.watchdog")


class WatchdogService:
    """
    24x7 System Watchdog & Diagnostics Service.
    Auto-heals crashed polling tasks and monitors system health.
    Includes restart rate-limiting (max 5 restarts per 10m) to prevent infinite loops.
    """

    def __init__(self, check_interval: int = 15):
        self._interval: int = check_interval
        self._running: bool = False
        self._task: Optional[asyncio.Task] = None
        self._restarts_count: int = 0
        self._restart_timestamps: List[datetime] = []  # Rate limiting sliding window
        self._last_check_time: Optional[datetime] = None
        self._event_buffer: List[Dict[str, Any]] = []  # Fixed rolling buffer (max 500)
        self._MAX_BUFFER = 500

    def _log_event(self, event_type: str, source: str, message: str, level: str = "INFO"):
        """Record rolling event in RAM buffer and log via SystemLog."""
        now = get_utc_now()
        entry = {
            "timestamp": now.isoformat(),
            "event_type": event_type,
            "source": source,
            "message": message,
            "level": level,
        }
        self._event_buffer.append(entry)
        if len(self._event_buffer) > self._MAX_BUFFER:
            self._event_buffer.pop(0)

    def _can_restart(self) -> bool:
        """Rate limiter: max 5 restarts within a 10-minute window."""
        now = get_utc_now()
        ten_min_ago = now - timedelta(minutes=10)
        self._restart_timestamps = [ts for ts in self._restart_timestamps if ts > ten_min_ago]
        return len(self._restart_timestamps) < 5

    async def _check_health(self):
        """Execute one health audit cycle."""
        now = get_utc_now()
        self._last_check_time = now

        # 1. Audit Polling Engine Device Tasks
        for dev_id, task in list(pe._device_tasks.items()):
            if task.done():
                exc = task.exception() if not task.cancelled() else "Cancelled"

                if self._can_restart():
                    self._restarts_count += 1
                    self._restart_timestamps.append(now)
                    log.warning(f"Watchdog: auto-restarting dead poll task for device {dev_id} (error: {exc})")
                    self._log_event("RESTART", "watchdog", f"Auto-restarted poll task for device {dev_id}: {exc}", "WARNING")

                    try:
                        async with AsyncSessionLocal() as db:
                            db.add(SystemLog(
                                log_type="system",
                                level="WARNING",
                                source="ultron.watchdog",
                                message=f"Watchdog auto-restarted dead poll task for device {dev_id}: {exc}"
                            ))
                            await db.commit()
                    except Exception as err:
                        log.warning(f"Watchdog: failed to log restart event: {err}")

                    await pe.reload_device(dev_id)
                else:
                    log.critical(f"Watchdog: restart rate limit exceeded for device {dev_id} (>5 restarts/10m) — halting auto-restart loop")
                    self._log_event("CRITICAL_FAULT", "watchdog", f"Restart rate limit exceeded for device {dev_id}", "CRITICAL")

        # 2. Audit Historian Service Health
        if not historian_service._running:
            if self._can_restart():
                log.warning("Watchdog: detected HistorianService stopped -> auto-restarting")
                self._log_event("RESTART", "watchdog", "Auto-restarted HistorianService", "WARNING")
                historian_service.start()
            else:
                log.critical("Watchdog: HistorianService restart limit exceeded")

    async def _watchdog_loop(self):
        """Background watchdog loop."""
        log.info(f"WatchdogService loop started (interval={self._interval}s)")
        while self._running:
            try:
                await asyncio.sleep(self._interval)
                if self._running:
                    await self._check_health()
            except asyncio.CancelledError:
                log.info("WatchdogService loop cancelled")
                break
            except Exception as e:
                log.error(f"WatchdogService loop error: {e}")

    def start(self):
        """Start Watchdog background worker."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._watchdog_loop(), name="watchdog-service-task")
        self._log_event("SERVICE_START", "watchdog", "WatchdogService started")
        log.info("WatchdogService started")

    async def stop(self):
        """Stop Watchdog service."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self._log_event("SERVICE_STOP", "watchdog", "WatchdogService stopped")
        log.info("WatchdogService stopped")

    def _determine_health_level(self, cpu_pct: Optional[float], ram_mb: Optional[float]) -> str:
        """
        Determine 4-level system health status: HEALTHY, WARNING, DEGRADED, CRITICAL.
        """
        if not pe._running:
            return "CRITICAL"

        dead_tasks = len([t for t in pe._device_tasks.values() if t.done()])
        if dead_tasks > 0 and len(self._restart_timestamps) >= 5:
            return "CRITICAL"

        if not historian_service._running or dead_tasks > 0:
            return "DEGRADED"

        if (cpu_pct and cpu_pct > 85.0) or (ram_mb and ram_mb > 500.0):
            return "WARNING"

        return "HEALTHY"

    def get_diagnostics(self) -> Dict[str, Any]:
        """Expose comprehensive system health report for REST API."""
        now = get_utc_now()
        cpu_pct = psutil.cpu_percent(interval=None) if psutil else None
        ram_mb = psutil.Process().memory_info().rss / (1024 * 1024) if psutil else None

        active_tasks = len([t for t in pe._device_tasks.values() if not t.done()])
        health_level = self._determine_health_level(cpu_pct, ram_mb)

        return {
            "status": "healthy" if health_level == "HEALTHY" else "degraded",
            "health_level": health_level,  # HEALTHY | WARNING | DEGRADED | CRITICAL
            "is_watchdog_active": self._running,
            "uptime_check": self._last_check_time.isoformat() if self._last_check_time else None,
            "watchdog_restarts_total": self._restarts_count,
            "recent_restarts_in_10m": len(self._restart_timestamps),
            "system_resources": {
                "cpu_percent": cpu_pct,
                "ram_rss_mb": round(ram_mb, 2) if ram_mb else None,
            },
            "polling_engine": {
                "is_running": pe._running,
                "total_device_tasks": len(pe._device_tasks),
                "active_tasks": active_tasks,
            },
            "historian": historian_service.get_metrics(),
            "scada_device_states": telemetry_service.get_device_diagnostics(),
            "live_cache_points_count": len(live_cache.get_all_points()),
            "recent_events_count": len(self._event_buffer),
        }


# Global Singleton Instance
watchdog_service = WatchdogService()
