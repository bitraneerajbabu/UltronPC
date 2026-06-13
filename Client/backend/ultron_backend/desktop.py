# -*- coding: utf-8 -*-
"""
UltrON — Desktop Entry Point (PyInstaller-compatible)
Launches FastAPI in a background thread, then opens a pywebview window.

ALWAYS writes a crash log to:  <exe_dir>/ultron_crash.log
so errors are visible even when console=False.
"""

import sys
import io

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
    # Hide the console window immediately on Windows if running in console mode
    if sys.platform == "win32":
        try:
            import ctypes
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

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Fix paths BEFORE any other import
# ─────────────────────────────────────────────────────────────────────────────
if getattr(sys, "frozen", False):
    BUNDLE_DIR = sys._MEIPASS                          # extracted packages
    APP_DIR    = os.path.dirname(sys.executable)       # dir holding the .exe
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
    if not getattr(sys, "frozen", False):
        return

    install_dir = APP_DIR
    flag_path = os.path.join(install_dir, "update_pending.flag")
    new_exe = os.path.join(install_dir, "UltrON_new.exe")
    current_exe = sys.executable
    old_exe = os.path.join(install_dir, "UltrON_old.exe")

    # Clean up previous old exe if exists
    if os.path.exists(old_exe):
        try:
            os.remove(old_exe)
        except Exception:
            pass

    if os.path.exists(flag_path) and os.path.exists(new_exe):
        try:
            import subprocess
            # Rename current exe to old_exe (Windows allows renaming running exes)
            os.rename(current_exe, old_exe)
            # Rename downloaded exe to current exe name
            os.rename(new_exe, current_exe)
            # Remove flag
            os.remove(flag_path)
            # Relaunch newly replaced exe
            subprocess.Popen([current_exe] + sys.argv[1:])
            sys.exit(0)
        except Exception as e:
            with open(os.path.join(install_dir, "ultron_update_error.log"), "w") as f:
                f.write(f"Update failed: {e}\n")
            try:
                os.remove(flag_path)
            except Exception:
                pass

_apply_pending_update()

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

# (Null-stream guard removed; robust stream patch has been applied at the top)

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

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Main
# ─────────────────────────────────────────────────────────────────────────────
def main() -> None:
    log.info("=" * 60)
    log.info("UltrON starting")
    log.info("  BUNDLE_DIR : %s", BUNDLE_DIR)
    log.info("  APP_DIR    : %s", APP_DIR)
    log.info("  cwd        : %s", os.getcwd())
    log.info("  sys.path[0]: %s", sys.path[0])
    log.info("=" * 60)

    # 1. Verify ui_dist is present
    ui_index = os.path.join(APP_DIR, "ui_dist", "index.html")
    if not os.path.isfile(ui_index):
        # Also check _MEIPASS location
        ui_index_bundle = os.path.join(BUNDLE_DIR, "ui_dist", "index.html")
        if os.path.isfile(ui_index_bundle):
            log.info("ui_dist found inside bundle dir")
        else:
            log.warning("ui_dist/index.html NOT FOUND — UI will not load")

    # 2. Start server thread
    t = threading.Thread(target=_run_server, daemon=True, name="uvicorn")
    t.start()

    # 3. Wait for server
    log.info("Waiting for API server at %s …", URL)
    if not _wait_for_server(HOST, PORT, timeout=30):
        log.error("Server did not start within 30 s")
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

    log.info("Server ready ✓  Opening window …")

    # 4. Open window
    try:
        import webview
        log.info("pywebview version: %s", getattr(webview, "__version__", "unknown"))
        window = webview.create_window(
            title="UltrON Industrial Platform",
            url=URL,
            width=1280,
            height=800,
            resizable=True,
            min_size=(1024, 600),
        )
        webview.start(debug=False)
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
