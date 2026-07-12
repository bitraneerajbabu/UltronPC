"""
UltrON — FastAPI Application Entry Point
Registers all routers, WebSocket endpoint, startup/shutdown lifecycle,
CORS for the frontend, and APScheduler for averaging + heartbeat.
"""

import asyncio
import os
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles


from app.config import settings, APP_DIR
from app.database import init_db, AsyncSessionLocal

from app.websocket_manager import ws_manager
from app.services import polling_engine
from app.services.averaging_engine import run_averaging_for_all_parameters
from app.core.logger import get_logger

# ─── API Routers ──────────────────────────────────────────────────────────────
from app.api import stations, devices, parameters, telemetry, trends, reports, alarms, logs, settings as settings_api, server_config, license
from app.api import auth as auth_api
from app.api import users as users_api
from app.api import led as led_api
from app.api import broadcasts as broadcasts_api
from app.api import cpcb as cpcb_api
from app.api import calibration as calibration_api
from app.core.security_middleware import SecurityHeadersMiddleware, RequestSizeLimitMiddleware
from app.core.rate_limiter import RateLimitMiddleware
from app.core.error_handler import RequestIDMiddleware, GlobalExceptionMiddleware, AccessLogMiddleware
from app.core.secrets_vault import validate_secrets_on_startup, vault

log = get_logger("ultron.main")


# ─── Seed Default Admin ───────────────────────────────────────────────────────
async def _seed_admin():
    """
    Create the default admin account on first startup if no users exist.
    Credentials are taken from settings: ADMIN_USERNAME / ADMIN_PASSWORD.
    """
    from app.database import AsyncSessionLocal
    from app.models.user import User
    from app.core.security import hash_password
    from sqlalchemy import select, func

    async with AsyncSessionLocal() as db:
        count_res = await db.execute(select(func.count(User.id)))
        count = count_res.scalar() or 0
        if count == 0:
            admin = User(
                username=settings.ADMIN_USERNAME,
                hashed_password=hash_password(settings.ADMIN_PASSWORD),
                role="admin",
                full_name="System Administrator",
                is_active=True,
                created_by="system",
            )
            db.add(admin)
            await db.commit()
            log.info(
                f"Default admin user seeded: username='{settings.ADMIN_USERNAME}' "
                "Change the default password in production."
            )



# ─── LED Board Secondary HTTP Server (port 80) ───────────────────────────────
async def _start_led_http_server(port: int):
    """
    Spawn a lightweight second ASGI/uvicorn server on the given port (default 80)
    that serves ONLY the LED board endpoint.

    LED control cards need to poll a URL without a port number (plain HTTP = port 80).
    This runs silently alongside the main app — errors are logged but never crash the app.

    URL the card should use:
        http://<PC-LAN-IP>/api/v1/led?auth=username&PCB=1,2,3
    """
    try:
        import uvicorn
        from fastapi import FastAPI
        from fastapi.middleware.cors import CORSMiddleware
        from app.api import led as led_api

        led_app = FastAPI(title="UltrON LED", docs_url=None, redoc_url=None)
        led_app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["GET"],
            allow_headers=["*"],
        )
        led_app.include_router(led_api.router, prefix="/api/v1")

        cfg = uvicorn.Config(
            led_app,
            host="0.0.0.0",
            port=port,
            log_level="warning",   # quiet — main app already logs everything
        )
        server = uvicorn.Server(cfg)
        log.info(f"LED board HTTP server starting on port {port} — "
                 f"Card URL: http://<PC-LAN-IP>/api/v1/led?auth=<token>&PCB=...")
        await server.serve()
    except (OSError, SystemExit) as e:
        # Port 80 might need admin rights on Windows — log clearly and continue
        log.warning(
            f"LED HTTP server could not bind to port {port}: {e}. "
            f"The LED board URL on port {port} will NOT be available. "
            f"Try running UltrON as Administrator, or set LED_HTTP_PORT=0 to disable."
        )
    except Exception as e:
        log.error(f"LED HTTP server error on port {port}: {e}")


# ─── Lifecycle ────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown hooks."""
    log.info("=" * 60)
    log.info(f"  {settings.APP_NAME} v{settings.APP_VERSION} starting …")
    log.info("=" * 60)

    # 1. Create storage dirs
    settings.ensure_dirs()

    # 1.5 Copy pre-seeded DB from bundle on first run
    try:
        import sys
        if getattr(sys, "frozen", False):
            import shutil
            from pathlib import Path
            bundle_db = Path(sys._MEIPASS) / "ultron.db"
            app_db = APP_DIR / "ultron.db"
            if bundle_db.is_file() and not app_db.is_file():
                shutil.copy2(str(bundle_db), str(app_db))
                log.info(f"Copied pre-seeded database from bundle to {app_db}")
    except Exception as e:
        log.warning(f"Could not copy bundled database: {e}")

    # 1.75 Validate secrets
    missing = vault.validate()
    if missing:
        for m in missing:
            log.warning(f"Missing secret: {m}")

    # 2. Init DB tables
    await init_db()

    # 2.5 Restore tracked active alarms from DB into in-memory engine
    from app.services.alarm_engine import alarm_engine
    async with AsyncSessionLocal() as restore_db:
        await alarm_engine.load_active_from_db(restore_db)

    # 3. Start polling engine
    await polling_engine.start_polling()

    # 4. Seed default admin user if no users exist
    await _seed_admin()

    # 4.25 Seed default CPCB parameter mappings
    from app.services.cpcb.mapping_service import seed_default_mappings
    async with AsyncSessionLocal() as seed_db:
        await seed_default_mappings(seed_db)
        await seed_db.commit()

    # 4.5 Start dedicated LED board HTTP server on port 80 (LAN LED cards use port 80)
    if settings.LED_HTTP_PORT and settings.LED_HTTP_PORT > 0:
        asyncio.create_task(_start_led_http_server(settings.LED_HTTP_PORT))

    # 5. Start APScheduler for averaging (every 1 minute)
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        run_averaging_for_all_parameters,
        trigger="cron",
        minute="*",       # every minute — engine decides which windows are due
        id="averaging",
        replace_existing=True,
    )
    scheduler.add_job(
        ws_manager.send_heartbeat,
        trigger="interval",
        seconds=30,
        id="heartbeat",
        replace_existing=True,
    )
    from app.services.server_push import run_server_push
    from app.services.rajapi_sync import push_to_rajapi

    scheduler.add_job(
        run_server_push,
        args=["live"],
        trigger="interval",
        seconds=5,
        id="server_push_live",
        replace_existing=True,
    )
    scheduler.add_job(
        run_server_push,
        args=["delay"],
        trigger="interval",
        seconds=5,
        id="server_push_delay",
        replace_existing=True,
    )
    # RajAPI Autopilot — lightweight heartbeat every 60 seconds
    scheduler.add_job(
        push_to_rajapi,
        trigger="interval",
        seconds=60,
        id="rajapi_sync",
        replace_existing=True,
    )
    # Heartbeat monitor for device and station connectivity — run every 60 seconds
    scheduler.add_job(
        polling_engine.check_heartbeats,
        trigger="interval",
        seconds=60,
        id="heartbeat_monitor",
        replace_existing=True,
    )
    # CPCB CAAQM Legacy Export — run every 5 seconds
    from app.services.cpcb.scheduler_service import run_cpcb_pipeline
    scheduler.add_job(
        run_cpcb_pipeline,
        trigger="interval",
        seconds=5,
        id="cpcb_export",
        replace_existing=True,
    )
    scheduler.start()
    log.info("APScheduler started (averaging + heartbeat + server_push)")

    yield   # app is running

    # ─── Shutdown ─────────────────────────────────────────────────────────────
    log.info("UltrON shutting down …")
    scheduler.shutdown(wait=False)
    await polling_engine.stop_polling()
    log.info("UltrON stopped")


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="UltrON Industrial Monitoring API",
    description="""
## UltrON — All Rights Reserved to Neeraj

Real-time industrial telemetry platform supporting:
- **Modbus TCP / RTU / RS485**
- **TCP Custom Protocols**
- **CSV File Ingestion**
- **Live WebSocket Push**
- **Alarm Engine with Hysteresis**
- **Averaging Engine (1min → Daily)**
- **Configurable Settings**: Polling, logging, DB maintenance.
    """,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# ─── CSP Headers ──────────────────────────────────────────────────────────────
from starlette.middleware.base import BaseHTTPMiddleware

CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws:; frame-ancestors 'none'; form-action 'self'"

class CSPMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        resp = await call_next(request)
        if "Content-Security-Policy" not in resp.headers:
            resp.headers["Content-Security-Policy"] = CSP
        return resp

app.add_middleware(CSPMiddleware)

# ─── Security Headers (HSTS, X-Content-Type-Options, etc.) ────────────────────
app.add_middleware(SecurityHeadersMiddleware)

# ─── Request Size Limit (10 MB) ───────────────────────────────────────────────
app.add_middleware(RequestSizeLimitMiddleware, max_size=10 * 1024 * 1024)

# ─── Request ID / Correlation ID ──────────────────────────────────────────────
app.add_middleware(RequestIDMiddleware)

# ─── Global Exception Handler ─────────────────────────────────────────────────
app.add_middleware(GlobalExceptionMiddleware)

# ─── Access Logging ───────────────────────────────────────────────────────────
app.add_middleware(AccessLogMiddleware)

# ─── Rate Limiting ────────────────────────────────────────────────────────────
app.add_middleware(RateLimitMiddleware)

# ─── API Routes ───────────────────────────────────────────────────────────────
PREFIX = "/api/v1"
app.include_router(stations.router,     prefix=PREFIX)
app.include_router(devices.router,      prefix=PREFIX)
app.include_router(parameters.router,   prefix=PREFIX)
app.include_router(telemetry.router,    prefix=PREFIX)
app.include_router(trends.router,       prefix=PREFIX)
app.include_router(reports.router,      prefix=PREFIX)
app.include_router(alarms.router,       prefix=PREFIX)
app.include_router(logs.router,         prefix=PREFIX)
app.include_router(settings_api.router, prefix=PREFIX)
app.include_router(server_config.router, prefix=PREFIX)
app.include_router(auth_api.router,     prefix=PREFIX)
app.include_router(users_api.router,    prefix=PREFIX)
app.include_router(license.router,      prefix=PREFIX)
app.include_router(led_api.router,      prefix=PREFIX)  # LED Board LAN endpoint
app.include_router(broadcasts_api.router, prefix=PREFIX)
app.include_router(cpcb_api.router, prefix=PREFIX)
app.include_router(calibration_api.router, prefix=PREFIX)

# ─── Public Version Endpoint ──────────────────────────────────────────────────
@app.get("/api/v1/version")
async def get_app_version():
    return {"version": settings.APP_VERSION, "app_name": settings.APP_NAME}


# ─── WebSocket Live Push ──────────────────────────────────────────────────────
@app.websocket("/ws/live")
async def websocket_live(
    websocket: WebSocket,
    token: str = Query(default=""),
    station_ids: str = Query(default=""),
):
    """
    WebSocket endpoint for live dashboard data.

    Connect: ws://localhost:8000/ws/live?token=JWT_TOKEN&station_ids=1,2,3
    Messages received:
      - {"type": "live_data", "device_id": ..., "data": [...], "ts": "..."}
      - {"type": "alarm", "alarm_id": ..., "severity": ..., ...}
      - {"type": "heartbeat", "ts": ..., "clients": ...}
    """
    if not token:
        await websocket.close(code=4001, reason="Missing auth token")
        return
    try:
        from app.core.security import decode_token
        payload = decode_token(token)
        username = payload.get("sub")
        if not username:
            await websocket.close(code=4001, reason="Invalid token")
            return
        # Blacklist check on WS connect
        if settings.JWT_BLACKLIST_ENABLED:
            from app.core.security import is_token_blacklisted
            async with AsyncSessionLocal() as ws_db:
                if await is_token_blacklisted(token, ws_db):
                    await websocket.close(code=4001, reason="Token revoked")
                    return
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    sids = [int(x) for x in station_ids.split(",") if x.strip().isdigit()] if station_ids else []
    await ws_manager.connect(websocket, sids)
    log.info(f"WS client connected (user={username}). Subscribed stations: {sids or 'all'}")

    try:
        # Send welcome message
        await websocket.send_json({
            "type": "connected",
            "message": f"Connected to {settings.APP_NAME} live stream",
            "ts": datetime.now(timezone.utc).isoformat(),
            "subscribed_stations": sids,
        })
        # Keep connection open — just drain incoming (clients can send ping)
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong", "ts": datetime.now(timezone.utc).isoformat()})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        log.info("WS client disconnected")


_UI_DIST = Path(__file__).parent.parent / "ui_dist"

# ─── Root ─────────────────────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
async def root():
    index = _UI_DIST / "index.html"
    if index.is_file():
        return FileResponse(str(index))
    return JSONResponse({
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "ws": "ws://HOST:PORT/ws/live",
        "status": "running",
    })


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}


@app.get("/show-window", include_in_schema=False)
async def show_window():
    import sys
    if sys.platform == "win32":
        try:
            import ctypes
            hwnd = ctypes.windll.user32.FindWindowW(None, "UltrON Industrial Monitoring Platform")
            if hwnd:
                # SW_RESTORE = 9
                ctypes.windll.user32.ShowWindow(hwnd, 9)
                ctypes.windll.user32.SetForegroundWindow(hwnd)
                return {"status": "restored_win32"}
        except Exception as e:
            log.error(f"Failed to restore window via ctypes in show_window: {e}")

    window = getattr(app.state, "window", None)
    if window:
        try:
            window.show()
            window.restore()
            return {"status": "restored"}
        except Exception as e:
            log.error(f"Failed to show window: {e}")
            return {"status": "error", "message": str(e)}
    return {"status": "no_window"}


@app.post("/shutdown", include_in_schema=False)
async def shutdown_server():
    """Fully stop UltrON server and process."""
    import os
    log.warning("Shutdown requested via API — exiting.")
    thread = threading.Thread(target=lambda: os._exit(0), daemon=True)
    thread.start()
    return {"status": "shutting_down"}


# ─── Serve Built Frontend (SPA) ───────────────────────────────────────────────
# The Vite production build lands in ui_dist/ (same dir as this app package).
# We mount it LAST so API routes always take priority.

if _UI_DIST.is_dir():
    # Serve JS/CSS/assets under /assets
    _assets = _UI_DIST / "assets"
    if _assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="ui_assets")
    # Serve /fonts (woff2 files referenced by CSS)
    _fonts = _UI_DIST / "fonts"
    if _fonts.is_dir():
        app.mount("/fonts", StaticFiles(directory=str(_fonts)), name="ui_fonts")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_ui(full_path: str):
        """
        Serve static files from ui_dist/ root (favicon.svg, icons.svg, etc.)
        and fall back to index.html for SPA client-side routes.
        """
        if full_path.startswith("api/") or full_path.startswith("ws"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        file = _UI_DIST / full_path
        if file.is_file() and file != _UI_DIST / "index.html":
            return FileResponse(str(file))
        index = _UI_DIST / "index.html"
        if index.is_file():
            return FileResponse(str(index))
        return JSONResponse({"detail": "UI not built — run python run.py"}, status_code=503)
else:
    log.warning(
        "ui_dist/ not found — frontend not served. "
        "Run 'python run.py' to auto-build, or 'npm run dev' for development."
    )
