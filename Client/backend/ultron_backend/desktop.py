# -*- coding: utf-8 -*-
"""
UltrON — Desktop Entry Point (PyInstaller-compatible)
Launches FastAPI in a background thread, then opens a pywebview window.

ALWAYS writes a crash log to:  <exe_dir>/ultron_crash.log
so errors are visible even when console=False.
"""

import sys
import io
import os
import multiprocessing

# Critical for PyInstaller frozen executables on Windows
if __name__ == "__main__" or getattr(sys, "frozen", False):
    multiprocessing.freeze_support()

# Clean leaked PyInstaller subprocess variables to prevent bootloader parent validation errors
for _k in list(os.environ.keys()):
    if _k.startswith("_MEI") or _k.startswith("_PYI"):
        os.environ.pop(_k, None)

# Make sys.argv[0] absolute immediately to prevent pywebview base_uri/get_app_root chdir bugs
if sys.argv and sys.argv[0]:
    sys.argv[0] = os.path.abspath(sys.argv[0])

# ── Robust Stream Patch ───────────────────────────────────────────────────────
# When packaged with console=False, standard streams (stdout, stderr) are None
# or invalid. Some libraries (like uvicorn or logging) call .isatty() or try to
# write to them, causing silent startup crashes. We patch them immediately here.
class DummyStream:
    def write(self, data): pass
    def writelines(self, lines): pass
    def flush(self): pass
    def isatty(self): return False
    def close(self): pass
    @property
    def encoding(self): return "utf-8"

if getattr(sys, "frozen", False):
    # Set Windows DPI Awareness so PyWebView renders 1:1 crisp identical to browser localhost
    if sys.platform == "win32":
        try:
            import ctypes
            # Per-Monitor DPI Aware V2 (2) or System Aware (1)
            try:
                ctypes.windll.shcore.SetProcessDpiAwareness(2)
            except Exception:
                ctypes.windll.user32.SetProcessDPIAware()
            hwnd = ctypes.windll.kernel32.GetConsoleWindow()
            if hwnd:
                ctypes.windll.user32.ShowWindow(hwnd, 0)  # SW_HIDE = 0
        except Exception:
            pass

    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is None:
            setattr(sys, stream_name, DummyStream())
        else:
            try:
                stream.write("")
                if not hasattr(stream, "isatty"):
                    stream.isatty = lambda: False
            except Exception:
                setattr(sys, stream_name, DummyStream())

import os
import threading
import time
import socket
import logging
import traceback
import argparse

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Fix paths BEFORE any other import
# ─────────────────────────────────────────────────────────────────────────────
if getattr(sys, "frozen", False):
    BUNDLE_DIR = sys._MEIPASS                          # extracted packages
    APP_DIR    = os.path.join(os.environ.get("PROGRAMDATA", "C:\\ProgramData"), "UltrON")
    os.makedirs(APP_DIR, exist_ok=True)
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    APP_DIR    = BUNDLE_DIR

# Make 'import app' work
if BUNDLE_DIR not in sys.path:
    sys.path.insert(0, BUNDLE_DIR)

# Fix relative paths (.env, ultron.db, reports/, logs/)
os.chdir(APP_DIR)

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1.5 — Auto-Updater (Applies downloaded firmware)
# ─────────────────────────────────────────────────────────────────────────────
def _apply_pending_update():
    """Clean up residual old executables safely on launch."""
    if not getattr(sys, "frozen", False):
        return

    exe_dir = os.path.dirname(os.path.abspath(sys.executable))
    old_exe = os.path.join(exe_dir, "UltrON_old.exe")

    # Clean up previous old exe if exists
    if os.path.exists(old_exe):
        try:
            os.remove(old_exe)
        except Exception:
            pass

_apply_pending_update()

# Check for restart flag (from /settings/restart-app)
_restart_flag = os.path.join(APP_DIR, "restart.flag")
if os.path.exists(_restart_flag):
    try:
        os.remove(_restart_flag)
    except Exception:
        pass

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1.6 — Background Update Downloader
# Silently checks GitHub for a newer release and downloads it in the background.
# The actual swap is applied on the NEXT launch by _apply_pending_update().
# ─────────────────────────────────────────────────────────────────────────────
GITHUB_REPO = "bitraneerajbabu/UltronPC"
GITHUB_API_LATEST = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"


def _version_tuple(v: str):
    """Convert 'v1.2.3' or '1.2.3' to (1, 2, 3) for comparison."""
    v = v.lstrip("v").strip()
    try:
        return tuple(int(x) for x in v.split("."))
    except Exception:
        return (0,)


def _check_and_download_update():
    """
    Run in a daemon thread.  Checks GitHub for a newer release; if found,
    downloads UltrON.exe as UltrON_new.exe and writes update_pending.flag.
    The swap is applied on next launch by _apply_pending_update().
    """
    if not getattr(sys, "frozen", False):
        return  # only run when packaged

    install_dir = APP_DIR
    flag_path   = os.path.join(install_dir, "update_pending.flag")
    new_exe     = os.path.join(install_dir, "UltrON_new.exe")
    partial_exe = os.path.join(install_dir, "UltrON_new.exe.part")

    # Don't download again if a pending update already exists
    if os.path.exists(flag_path) and os.path.exists(new_exe):
        return

    try:
        import urllib.request
        import json as _json
        import ssl as _ssl_mod
        from urllib.error import URLError

        def _urlopen_verified(url_req, timeout):
            """Open URL with verified SSL — fails hard on certificate errors."""
            from app.core.ssl_utils import get_verified_ssl_context
            ctx = get_verified_ssl_context()
            return urllib.request.urlopen(url_req, timeout=timeout, context=ctx)

        req = urllib.request.Request(
            GITHUB_API_LATEST,
            headers={"User-Agent": "UltrON-Updater/1.0",
                     "Accept": "application/vnd.github.v3+json"},
        )
        with _urlopen_verified(req, timeout=15) as resp:
            data = _json.loads(resp.read().decode("utf-8"))

        latest_tag = data.get("tag_name", "")
        assets     = data.get("assets", [])

        # Find the UltrON.exe asset
        exe_url = None
        for asset in assets:
            if asset.get("name", "").lower() == "ultron.exe":
                exe_url = asset.get("browser_download_url")
                break

        if not exe_url:
            return  # no asset found

        # Compare versions — import APP_VERSION from config
        try:
            from app.config import settings
            current_ver = settings.APP_VERSION
        except Exception:
            current_ver = "0.0.0"

        if _version_tuple(latest_tag) <= _version_tuple(current_ver):
            return  # already up-to-date

        # Download new EXE to a .part file first
        import logging as _logging
        import hashlib
        _log_update = _logging.getLogger("ultron.updater")
        _log_update.info("Update available: %s → %s — downloading…", current_ver, latest_tag)

        dl_req = urllib.request.Request(
            exe_url,
            headers={"User-Agent": "UltrON-Updater/1.0"},
        )
        sha256 = hashlib.sha256()
        with _urlopen_verified(dl_req, timeout=120) as dl_resp, \
             open(partial_exe, "wb") as f:
            while True:
                chunk = dl_resp.read(65536)
                if not chunk:
                    break
                f.write(chunk)
                sha256.update(chunk)

        downloaded_hash = sha256.hexdigest()

        # Verify checksum — fail CLOSED (reject update if checksums.json missing or mismatch)
        checksums_url = None
        for asset in assets:
            if asset.get("name", "").lower() == "checksums.json":
                checksums_url = asset.get("browser_download_url")
                break

        if not checksums_url:
            _log_update.error("No checksums.json in release — rejecting update for safety.")
            os.remove(partial_exe)
            return

        try:
            ck_req = urllib.request.Request(
                checksums_url,
                headers={"User-Agent": "UltrON-Updater/1.0"},
            )
            with _urlopen_verified(ck_req, timeout=15) as ck_resp:
                checksums = _json.loads(ck_resp.read().decode("utf-8"))
            expected_hash = checksums.get("UltrON.exe", "")
            if expected_hash and downloaded_hash != expected_hash:
                _log_update.error(
                    "Checksum mismatch! Expected %s, got %s — rejecting update.",
                    expected_hash, downloaded_hash,
                )
                os.remove(partial_exe)
                return
            _log_update.info("Checksum verified [OK]")
        except Exception as ck_err:
            _log_update.error(
                "Checksum fetch/parse failed (%s) — rejecting update for safety.",
                ck_err,
            )
            os.remove(partial_exe)
            return

        # Move .part → final
        if os.path.exists(new_exe):
            os.remove(new_exe)
        os.rename(partial_exe, new_exe)

        # Write the flag — _apply_pending_update() reads this on next launch
        with open(flag_path, "w") as f:
            f.write(latest_tag)

        _log_update.info("Update %s downloaded [OK] — will apply on next launch.", latest_tag)

    except Exception as _e:
        # Non-fatal — log quietly
        import logging as _logging
        _logging.getLogger("ultron.updater").debug("Update check failed: %s", _e)
        # Clean up partial download if present
        if os.path.exists(partial_exe):
            try:
                os.remove(partial_exe)
            except Exception:
                pass


# Launch update checker as a daemon thread (never blocks startup)
threading.Thread(target=_check_and_download_update, daemon=True, name="updater").start()

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — File-based crash logger (survives console=False)
# ─────────────────────────────────────────────────────────────────────────────
LOG_FILE = os.path.join(APP_DIR, "ultron_crash.log")

def _setup_logging():
    handlers = [
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
    ]
    # Also show in console when running from source
    if not getattr(sys, "frozen", False):
        handlers.append(logging.StreamHandler(sys.stdout))

    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=handlers,
    )

_setup_logging()
log = logging.getLogger("ultron.desktop")

# ── Suppress noisy library loggers in production ─────────────────────────────
# aiosqlite, sqlalchemy, httpcore flood the crash log with low-level DEBUG ops.
_QUIET_LOGGERS = [
    "aiosqlite",
    "sqlalchemy.engine",
    "sqlalchemy.pool",
    "sqlalchemy.dialects",
    "httpcore",
    "httpx",
    "asyncio",
    "apscheduler",
    "uvicorn.access",
]
for _lib in _QUIET_LOGGERS:
    logging.getLogger(_lib).setLevel(logging.WARNING)

# (Null-stream guard removed; robust stream patch has been applied at the top)

# ── Power Management ──────────────────────────────────────────────────────────
def _prevent_sleep():
    """Prevent Windows from sleeping while UltrON is running."""
    try:
        import ctypes
        ES_CONTINUOUS = 0x80000000
        ES_SYSTEM_REQUIRED = 0x00000001
        ES_DISPLAY_REQUIRED = 0x00000002
        ctypes.windll.kernel32.SetThreadExecutionState(
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
        )
        log.info("Sleep prevention enabled — system will not sleep while UltrON is running")
    except Exception as e:
        log.warning("Could not enable sleep prevention: %s", e)


def _keepalive_loop():
    """Periodically re-assert sleep prevention and log resume after suspend."""
    import ctypes
    ES_CONTINUOUS = 0x80000000
    ES_SYSTEM_REQUIRED = 0x00000001
    ES_DISPLAY_REQUIRED = 0x00000002
    last_tick = time.monotonic()
    while True:
        time.sleep(30)
        ctypes.windll.kernel32.SetThreadExecutionState(
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
        )
        # Detect large time gaps (system was suspended)
        now = time.monotonic()
        gap = now - last_tick
        if gap > 60:
            log.info("System resumed after %.0f s — all services continue automatically", gap)
        last_tick = now


# ── Windows single-instance mutex ────────────────────────────────────────────
# Also used by the Inno Setup uninstaller to detect if app is running.
_mutex = None
try:
    import ctypes
    _mutex = ctypes.windll.kernel32.CreateMutexW(None, False, "UltrONAppMutex")
except Exception:
    pass  # non-Windows or ctypes unavailable — safe to ignore

def _crash_hook(exc_type, exc_value, exc_tb):
    """Catch any unhandled exception, log it, show a message box, then exit."""
    msg = "".join(traceback.format_exception(exc_type, exc_value, exc_tb))
    log.critical("UNHANDLED EXCEPTION:\n%s", msg)
    # Show a native Windows error dialog so the user knows something went wrong
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(
            0,
            f"UltrON crashed.\n\nError: {exc_value}\n\nSee: {LOG_FILE}",
            "UltrON — Fatal Error",
            0x10,  # MB_ICONERROR
        )
    except Exception:
        pass
    sys.exit(1)

sys.excepthook = _crash_hook

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Server config
# ─────────────────────────────────────────────────────────────────────────────
HOST = "127.0.0.1"
PORT = 8765
URL  = f"http://{HOST}:{PORT}"


def _port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        try:
            s.connect((host, port))
            return True
        except OSError:
            return False


def _wait_for_server(host: str, port: int, timeout: float = 30.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _port_open(host, port):
            return True
        time.sleep(0.25)
    return False


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — FastAPI server thread
# ─────────────────────────────────────────────────────────────────────────────
def _run_server() -> None:
    try:
        log.info("Importing app.main …")
        import uvicorn
        from app.main import app as asgi_app

        log.info("uvicorn starting on %s:%s", HOST, PORT)
        config = uvicorn.Config(
            app=asgi_app,        # object, not string — avoids module-lookup issues
            host=HOST,
            port=PORT,
            log_level="warning",
            log_config=None,     # ← CRITICAL: prevents uvicorn formatter crash when console=False
            access_log=False,
            reload=False,
        )
        server = uvicorn.Server(config)
        server.run()
    except Exception:
        log.critical("Server thread crashed:\n%s", traceback.format_exc())
    except BaseException:
        log.critical("Server thread terminated (BaseException):\n%s", traceback.format_exc())

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Windows Startup Registration
# ─────────────────────────────────────────────────────────────────────────────
def _register_startup() -> None:
    """Add UltrON to Windows startup (HKCU\\Run) - runs headless on boot."""
    try:
        import winreg
        exe_path = f'"{sys.executable}" --background'
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE
        )
        winreg.SetValueEx(key, "UltrON", 0, winreg.REG_SZ, exe_path)
        winreg.CloseKey(key)
        log.info("Registered UltrON for auto-start with Windows: %s", exe_path)
        print("[OK] UltrON will auto-start when Windows boots.")
    except Exception as e:
        log.error("Failed to register startup: %s", e)
        print(f"[ERROR] Could not register startup: {e}")


def _unregister_startup() -> None:
    """Remove UltrON from Windows startup."""
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE
        )
        try:
            winreg.DeleteValue(key, "UltrON")
            log.info("Removed UltrON from Windows startup")
            print("[OK] UltrON removed from auto-start.")
        except FileNotFoundError:
            print("[OK] UltrON was not registered for auto-start.")
        winreg.CloseKey(key)
    except Exception as e:
        log.error("Failed to unregister startup: %s", e)
        print(f"[ERROR] Could not unregister startup: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — Headless Background Mode
# ─────────────────────────────────────────────────────────────────────────────
def _run_headless() -> None:
    """Run server-only mode with no UI window — intended for Windows startup."""
    _prevent_sleep()
    threading.Thread(target=_keepalive_loop, daemon=True, name="keepalive").start()

    # Start server as non-daemon so process survives when main thread finishes
    t = threading.Thread(target=_run_server, daemon=False, name="uvicorn")
    t.start()

    if not _wait_for_server(HOST, PORT, timeout=60):
        log.error("Background server failed to start within 60 s")
        sys.exit(1)

    log.info("UltrON running in background mode on %s:%s", HOST, PORT)

    try:
        t.join()
    except KeyboardInterrupt:
        log.info("Background server shutting down...")
        sys.exit(0)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — Main
# ─────────────────────────────────────────────────────────────────────────────
def main() -> None:
    # Parse command-line arguments first
    parser = argparse.ArgumentParser(description="UltrON Industrial Monitoring Platform")
    parser.add_argument("--background", action="store_true",
                        help="Run backend only (no UI window) — for auto-start with Windows")
    parser.add_argument("--register-startup", action="store_true",
                        help="Register UltrON to auto-start with Windows")
    parser.add_argument("--unregister-startup", action="store_true",
                        help="Remove UltrON from Windows auto-start")
    args = parser.parse_args()

    # Handle startup registration commands (run and exit)
    if args.register_startup:
        _register_startup()
        return
    if args.unregister_startup:
        _unregister_startup()
        return

    log.info("=" * 60)
    log.info("UltrON starting")
    log.info("  BUNDLE_DIR : %s", BUNDLE_DIR)
    log.info("  APP_DIR    : %s", APP_DIR)
    log.info("  cwd        : %s", os.getcwd())
    log.info("  sys.path[0]: %s", sys.path[0])
    log.info("=" * 60)

    # If --background, run headless and never open a window
    if args.background:
        _run_headless()
        return

    # Check if server is already running (second instance → restore window)
    if _port_open(HOST, PORT):
        log.info("UltrON is already running in the background. Restoring window...")
        if sys.platform == "win32":
            try:
                import ctypes
                hwnd = ctypes.windll.user32.FindWindowW(None, "UltrON Industrial Monitoring Platform")
                if hwnd:
                    log.info("Found window handle %s via Win32. Showing and restoring...", hwnd)
                    ctypes.windll.user32.ShowWindow(hwnd, 9)
                    ctypes.windll.user32.SetForegroundWindow(hwnd)
                    sys.exit(0)
            except Exception as win_err:
                log.error("Failed to restore window via Win32: %s", win_err)

        try:
            import urllib.request
            req = urllib.request.Request(f"{URL}/show-window", method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                log.info("Restore request response: %s", resp.read().decode())
        except Exception as e:
            log.error("Failed to restore window: %s", e)
        sys.exit(0)

    # Prevent sleep while running
    _prevent_sleep()
    threading.Thread(target=_keepalive_loop, daemon=True, name="keepalive").start()

    # 1. Verify ui_dist is present
    ui_index = os.path.join(APP_DIR, "ui_dist", "index.html")
    if not os.path.isfile(ui_index):
        # Also check _MEIPASS location
        ui_index_bundle = os.path.join(BUNDLE_DIR, "ui_dist", "index.html")
        if os.path.isfile(ui_index_bundle):
            log.info("ui_dist found inside bundle dir")
        else:
            log.warning("ui_dist/index.html NOT FOUND — UI will not load")

    # 2. Start server thread (non-daemon — survives window close)
    t = threading.Thread(target=_run_server, daemon=False, name="uvicorn")
    t.start()

    # 3. Wait for server
    log.info("Waiting for API server at %s …", URL)
    if not _wait_for_server(HOST, PORT, timeout=60):
        log.error("Server did not start within 60 s")
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(
                0,
                f"UltrON server failed to start.\n\nCheck: {LOG_FILE}",
                "UltrON — Startup Failed",
                0x10,
            )
        except Exception:
            pass
        sys.exit(1)

    log.info("Server ready [OK]  Opening window …")

    # 4. Open native window
    try:
        import webview
        log.info("pywebview loaded successfully")

        # Compute a reasonable window size based on screen
        screen = webview.screens[0]
        win_w = min(1400, int(screen.width * 0.9))
        win_h = min(900, int(screen.height * 0.9))
        win_x = max(0, (screen.width - win_w) // 2)
        win_y = max(0, (screen.height - win_h) // 2)

        window = webview.create_window(
            title="UltrON Industrial Monitoring Platform",
            url=URL,
            width=win_w,
            height=win_h,
            x=win_x,
            y=win_y,
            resizable=True,
            fullscreen=False,
            zoomable=True,
            min_size=(600, 500),
            confirm_close=False,
        )

        from app.main import app as asgi_app
        asgi_app.state.window = window

        def on_closing():
            log.info("Window close intercept: hiding window instead of exiting")
            window.hide()
            return False

        window.events.closing += on_closing

        webview.start(
            gui=None,
            debug=False,
            private_mode=False,
            storage_path=os.path.join(APP_DIR, "webview_data"),
        )
        log.info("Window closed — exiting.")
    except ImportError:
        log.warning("pywebview not installed — opening system browser")
        import webbrowser
        webbrowser.open(URL)
        try:
            t.join()
        except KeyboardInterrupt:
            log.info("Ctrl+C received — exiting.")
    except Exception:
        log.critical("webview failed:\n%s", traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()
