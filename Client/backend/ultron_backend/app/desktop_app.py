"""
UltrON — Native Desktop Window

Replaces the browser tab with a native OS window using pywebview (WebView2).
Start the server in a background thread, then open the webview window.
"""

import os
import sys
import threading
import uvicorn
from pathlib import Path


def _find_app_dir():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).parent.parent.resolve()


def _start_server(host: str, port: int, log_level: str):
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        log_level=log_level,
        reload=False,
        workers=1,
    )


def run_native(host: str = "127.0.0.1", port: int = 8000, log_level: str = "info"):
    import webview

    APP_DIR = _find_app_dir()
    title = "UltrON Industrial Monitoring Platform"

    # Try loading a custom window icon
    icon_path = str(APP_DIR / "ui_dist" / "favicon.svg")

    # Start server in background thread
    server_thread = threading.Thread(
        target=_start_server,
        args=(host, port, log_level),
        daemon=True,
    )
    server_thread.start()

    # Give the server a moment to boot
    import time
    time.sleep(0.5)

    # Compute a reasonable starting size
    screen = webview.screens[0]
    win_w = min(1400, int(screen.width * 0.9))
    win_h = min(900, int(screen.height * 0.9))
    win_x = max(0, (screen.width - win_w) // 2)
    win_y = max(0, (screen.height - win_h) // 2)

    window = webview.create_window(
        title=title,
        url=f"http://{host}:{port}",
        width=win_w,
        height=win_h,
        x=win_x,
        y=win_y,
        resizable=True,
        fullscreen=False,
        min_size=(900, 600),
        icon=icon_path,
        confirm_close=True,
    )

    webview.start(
        gui=None,
        debug=False,
        private_mode=False,
        storage_path=str(APP_DIR / "webview_data"),
    )


if __name__ == "__main__":
    run_native()
