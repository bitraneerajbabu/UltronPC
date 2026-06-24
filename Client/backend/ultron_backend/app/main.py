"""
UltrON — FastAPI Application Entry Point
Registers all routers, WebSocket endpoint, startup/shutdown lifecycle,
CORS for the frontend, and APScheduler for averaging + heartbeat.
"""

import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles


from app.config import settings
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
    except OSError as e:
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

    # 2. Init DB tables
    await init_db()

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
        minutes=1,
        id="server_push_live",
        replace_existing=True,
    )
    scheduler.add_job(
        run_server_push,
        args=["delay"],
        trigger="interval",
        minutes=15,
        id="server_push_delay",
        replace_existing=True,
    )
    # RajAPI Central Sync — silently push live data every minute (if API key is configured)
    scheduler.add_job(
        push_to_rajapi,
        trigger="interval",
        minutes=1,
        id="rajapi_sync",
        replace_existing=True,
    )
    # CPCB CAAQM Legacy Export — run every 15 minutes at 0,15,30,45
    from app.services.cpcb.scheduler_service import run_cpcb_pipeline
    scheduler.add_job(
        run_cpcb_pipeline,
        trigger="cron",
        minute="0,15,30,45",
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
## UltrON — Powered by Sunshine Technologies

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
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Rate Limiting (slowapi) ─────────────────────────────────────────────────
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

_app_limiter = Limiter(key_func=get_remote_address)
app.state.limiter = _app_limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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

# ─── WebSocket Live Push ──────────────────────────────────────────────────────
@app.websocket("/ws/live")
async def websocket_live(
    websocket: WebSocket,
    station_ids: str = Query(default=""),
):
    """
    WebSocket endpoint for live dashboard data.

    Connect: ws://localhost:8000/ws/live?station_ids=1,2,3
    Messages received:
      - {"type": "live_data", "device_id": ..., "data": [...], "ts": "..."}
      - {"type": "alarm", "alarm_id": ..., "severity": ..., ...}
      - {"type": "heartbeat", "ts": ..., "clients": ...}
    """
    sids = [int(x) for x in station_ids.split(",") if x.strip().isdigit()] if station_ids else []
    await ws_manager.connect(websocket, sids)
    log.info(f"WS client connected. Subscribed stations: {sids or 'all'}")

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
                await websocket.send_json({"type": "pong", "ts": datetime.utcnow().isoformat()})
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
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}


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
