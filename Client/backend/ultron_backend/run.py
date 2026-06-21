# -*- coding: utf-8 -*-
"""
UltrON -- Unified Launcher
Run:  python run.py

What it does:
  1. Detects the frontend source (../src) and checks if a build is needed.
  2. Runs `npm run build` (Vite) to produce ui_dist/ inside this folder.
  3. Starts the FastAPI backend on http://0.0.0.0:8000.
  4. The UI is served at http://localhost:8000/ -- no separate server needed.

For active frontend development:
  - Start backend:  python run.py --no-build
  - Start UI:       npm run dev   (Vite dev server on :5173, proxies API to :8000)
"""

import sys
import os
import shutil
import subprocess
import argparse
import uvicorn
from pathlib import Path

# ── PyInstaller compatibility ─────────────────────────────────────────────────
if getattr(sys, "frozen", False):
    _BUNDLE_DIR = Path(sys._MEIPASS)
    _APP_DIR    = Path(sys.executable).parent

    # ── Silent windowed mode: redirect stdout/stderr to log file ──────────────
    # When console=False, any print()/exception to stdout/stderr causes a crash.
    # We redirect them to a log file so errors are still captured for debugging.
    import io
    _log_path = _APP_DIR / "ultron_log.txt"
    try:
        _log_file = open(_log_path, "a", encoding="utf-8", buffering=1)
        sys.stdout = _log_file
        sys.stderr = _log_file
    except Exception:
        # If log file can't be opened, use a null sink to prevent crashes
        sys.stdout = io.StringIO()
        sys.stderr = io.StringIO()
else:
    _BUNDLE_DIR = Path(__file__).parent.resolve()
    _APP_DIR    = _BUNDLE_DIR

# Ensure the bundle/source root is on sys.path so `import app` works
if str(_BUNDLE_DIR) not in sys.path:
    sys.path.insert(0, str(_BUNDLE_DIR))

# Set cwd to the directory that contains ultron.db, .env, reports/, etc.
os.chdir(str(_APP_DIR))

# ── Paths ─────────────────────────────────────────────────────────────────────
BACKEND_DIR  = _APP_DIR                            # .../ultron_backend/  (or dist/UltrON/)
PROJECT_DIR  = _APP_DIR.parent.parent / "frontend" # .../client/frontend/
UI_SRC_DIR   = PROJECT_DIR / "src"
UI_DIST_DIR  = _APP_DIR / "ui_dist"
PACKAGE_JSON = PROJECT_DIR / "package.json"


def _color(tag):
    return {
        "INFO": "\033[36m[UltrON]\033[0m",
        "OK":   "\033[32m[  OK  ]\033[0m",
        "WARN": "\033[33m[ WARN ]\033[0m",
        "ERR":  "\033[31m[ ERR  ]\033[0m",
    }.get(tag, "[INFO]")


def log(msg, tag="INFO"):
    print("{} {}".format(_color(tag), msg), flush=True)


def _npm_available():
    return shutil.which("npm") is not None


def _node_modules_ok():
    return (
        (PROJECT_DIR / "node_modules" / ".package-lock.json").exists()
        or (PROJECT_DIR / "node_modules" / "vite").exists()
    )


def _needs_build():
    """Return True if ui_dist is missing or older than any source file."""
    if not UI_DIST_DIR.is_dir() or not (UI_DIST_DIR / "index.html").is_file():
        return True
    dist_mtime = max(
        (p.stat().st_mtime for p in UI_DIST_DIR.rglob("*") if p.is_file()),
        default=0,
    )
    for src_file in UI_SRC_DIR.rglob("*"):
        if src_file.is_file() and src_file.stat().st_mtime > dist_mtime:
            return True
    return False


def build_frontend(force=False):
    """Build the Vite frontend. Skipped when frozen (ui_dist is bundled)."""
    # In a frozen bundle the UI is already embedded — never try to rebuild
    if getattr(sys, "frozen", False):
        log("Running as packaged app — skipping frontend build.", "OK")
        return UI_DIST_DIR.is_dir()

    if not PACKAGE_JSON.exists():
        log("package.json not found -- skipping frontend build.", "WARN")
        return False

    if not _npm_available():
        log("npm not found. Install Node.js from https://nodejs.org/", "WARN")
        log("Skipping frontend build -- API-only mode.", "WARN")
        return False

    if not force and not _needs_build():
        log("Frontend is up-to-date -- skipping rebuild.", "OK")
        return True

    log("Building frontend (npm run build) ...")

    if not _node_modules_ok():
        log("Installing npm packages ...")
        r = subprocess.run(
            ["npm", "install"],
            cwd=str(PROJECT_DIR),
            shell=(sys.platform == "win32"),
        )
        if r.returncode != 0:
            log("npm install failed.", "ERR")
            return False

    r = subprocess.run(
        ["npm", "run", "build"],
        cwd=str(PROJECT_DIR),
        shell=(sys.platform == "win32"),
    )

    if r.returncode != 0:
        log("Frontend build failed. Check Vite output above.", "ERR")
        return False

    if (UI_DIST_DIR / "index.html").is_file():
        log("Frontend built -> {}".format(UI_DIST_DIR), "OK")
        return True
    else:
        log("Build ran but ui_dist/index.html is missing.", "ERR")
        return False


def create_desktop_shortcut():
    """Create a desktop shortcut to the executable if running frozen and it doesn't exist."""
    if not getattr(sys, "frozen", False):
        return
        
    try:
        desktop_path = os.path.join(os.path.join(os.environ['USERPROFILE']), 'Desktop')
        shortcut_path = os.path.join(desktop_path, "UltrON.lnk")
        
        if not os.path.exists(shortcut_path):
            log("Creating desktop shortcut...", "INFO")
            exe_path = sys.executable
            work_dir = os.path.dirname(exe_path)
            
            script = f"""
            $WshShell = New-Object -comObject WScript.Shell
            $Shortcut = $WshShell.CreateShortcut("{shortcut_path}")
            $Shortcut.TargetPath = "{exe_path}"
            $Shortcut.WorkingDirectory = "{work_dir}"
            $Shortcut.Description = "UltrON Industrial Platform"
            $Shortcut.IconLocation = "{exe_path},0"
            $Shortcut.Save()
            """
            
            subprocess.run(
                ["powershell", "-Command", script], 
                creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
            )
            log("Desktop shortcut created.", "OK")
    except Exception as e:
        log(f"Failed to create desktop shortcut: {e}", "WARN")


def main():
    create_desktop_shortcut()
    parser = argparse.ArgumentParser(description="UltrON unified launcher")
    parser.add_argument("--no-build",    action="store_true", help="Skip frontend build")
    parser.add_argument("--force-build", action="store_true", help="Force full frontend rebuild")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Bind port (default: 8000)")
    parser.add_argument("--encrypt-env", action="store_true", help="Encrypt .env to .env.enc and rename .env to .env.bak")
    parser.add_argument("--decrypt-env", action="store_true", help="Decrypt .env.enc back to .env")
    args = parser.parse_args()

    if args.encrypt_env:
        try:
            from app.core.config_crypt import encrypt_file, secure_delete_file, decrypt_file_to_string
            plain_file = BACKEND_DIR / ".env"
            enc_file = BACKEND_DIR / ".env.enc"
            if not plain_file.is_file():
                log(f"Plaintext file {plain_file.name} not found!", "ERR")
                sys.exit(1)
            log(f"Encrypting {plain_file.name} to {enc_file.name} ...")
            encrypt_file(str(plain_file), str(enc_file))
            
            # Verify the newly encrypted file is valid and can be decrypted
            try:
                decrypted_content = decrypt_file_to_string(str(enc_file))
                if not decrypted_content:
                    raise ValueError("Decrypted content is empty")
            except Exception as verify_err:
                raise RuntimeError(f"Verification of encrypted file failed: {verify_err}")
            
            is_frozen = getattr(sys, "frozen", False)
            if is_frozen:
                secure_delete_file(str(plain_file))
                secure_delete_file(str(plain_file.parent / ".env.bak"))
                log("Encryption successful! Plaintext config securely removed.", "OK")
            else:
                # In development source mode, keep a backup for safety
                bak_file = plain_file.parent / ".env.bak"
                if bak_file.exists():
                    os.remove(str(bak_file))
                os.rename(str(plain_file), str(bak_file))
                log(f"Encryption successful! Plaintext config renamed to {bak_file.name}.", "OK")
        except Exception as e:
            log(f"Failed to encrypt config: {e}", "ERR")
            sys.exit(1)
        sys.exit(0)


    if args.decrypt_env:
        try:
            from app.core.config_crypt import decrypt_file_to_string
            plain_file = BACKEND_DIR / ".env"
            enc_file = BACKEND_DIR / ".env.enc"
            if not enc_file.is_file():
                log(f"Encrypted file {enc_file.name} not found!", "ERR")
                sys.exit(1)
            log(f"Decrypting {enc_file.name} to {plain_file.name} ...")
            decrypted = decrypt_file_to_string(str(enc_file))
            with open(plain_file, "w", encoding="utf-8") as f:
                f.write(decrypted)
            log(f"Decryption successful! Plaintext config written to {plain_file.name}.", "OK")
        except Exception as e:
            log(f"Failed to decrypt config: {e}", "ERR")
            sys.exit(1)
        sys.exit(0)

    print()
    print("  +======================================+")
    print("  |   UltrON Industrial Platform  v1.0  |")
    print("  +======================================+")
    print()

    if args.no_build:
        log("Skipping frontend build (--no-build).", "WARN")
        ui_ok = UI_DIST_DIR.is_dir()
    else:
        ui_ok = build_frontend(force=args.force_build)

    if ui_ok:
        log("UI will be served at -> http://localhost:{}/".format(args.port))
        import threading
        import time
        import webbrowser
        def open_browser():
            time.sleep(1.5)
            webbrowser.open("http://localhost:{}".format(args.port))
        threading.Thread(target=open_browser, daemon=True).start()
    else:
        log("Running in API-only mode (no UI served).", "WARN")

    print()
    log("Starting API server on http://{}:{}".format(args.host, args.port))
    log("Swagger docs  -> http://localhost:{}/docs".format(args.port))
    log("UltrON running silently in background. Open http://localhost:{} in browser.".format(args.port))
    print()

    # Import the app object directly when frozen to avoid the module-string lookup
    # issue that causes "No module named 'app'" in some PyInstaller builds.
    if getattr(sys, "frozen", False):
        from app.main import app as asgi_app
        uvicorn.run(
            asgi_app,
            host=args.host,
            port=args.port,
            reload=False,
            log_level="info",
            access_log=True,
        )
    else:
        uvicorn.run(
            "app.main:app",
            host=args.host,
            port=args.port,
            reload=False,
            log_level="info",
            access_log=True,
        )


if __name__ == "__main__":
    main()