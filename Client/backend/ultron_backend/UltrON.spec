# -*- mode: python ; coding: utf-8 -*-
# UltrON — Production PyInstaller Spec
# Build command:  pyinstaller UltrON.spec
#
# Place this file inside:  ultron_backend/
# Run from:                ultron_backend/
#
# Prerequisites (in your venv):
#   pip install pyinstaller pywebview
#   npm run build   (produces ui_dist/ inside ultron_backend/)

import sys
import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# ── Resolved paths ────────────────────────────────────────────────────────────
HERE = Path(SPEC).parent.resolve()           # ultron_backend/
UI_DIST = HERE / "ui_dist"
ENV_FILE = HERE / ".env"
DB_FILE = HERE / "ultron.db"

# ── Hidden imports ────────────────────────────────────────────────────────────
# Modules discovered via dynamic import / entry_points that PyInstaller misses.
hidden = [
    # uvicorn internals loaded by string at runtime
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.protocols.websockets.websockets_sansio_impl",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    # SQLAlchemy dialects loaded by URL string
    "sqlalchemy.dialects.sqlite",
    "sqlalchemy.dialects.sqlite.pysqlite",
    "sqlalchemy.dialects.sqlite.aiosqlite",
    "sqlalchemy.dialects.postgresql",
    "sqlalchemy.dialects.postgresql.asyncpg",
    "sqlalchemy.pool",
    "sqlalchemy.pool.impl",
    # Database async drivers
    "aiosqlite",
    "asyncpg",

    # APScheduler
    "apscheduler.schedulers.asyncio",
    "apscheduler.executors.asyncio",
    "apscheduler.jobstores.memory",
    "apscheduler.triggers.cron",
    "apscheduler.triggers.interval",
    "apscheduler.triggers.date",
    # pydantic / pydantic-settings internals
    "pydantic",
    "pydantic.v1",
    "pydantic_settings",
    "pydantic_core",
    # FastAPI / Starlette
    "fastapi",
    "starlette",
    "starlette.routing",
    "starlette.staticfiles",
    "starlette.middleware",
    "starlette.middleware.cors",
    "multipart",
    "python_multipart",
    # python-jose (JWT) with cryptography backend
    "jose",
    "jose.backends",
    "jose.backends.cryptography_backend",
    "cryptography",
    "cryptography.hazmat.primitives",
    "cryptography.hazmat.backends.openssl",
    "cryptography.hazmat.bindings.openssl.binding",
    # passlib
    "passlib",
    "passlib.handlers",
    "passlib.handlers.bcrypt",
    "passlib.context",
    "passlib.crypto",
    # pymodbus — protocol support
    "pymodbus",
    "pymodbus.client",
    "pymodbus.client.tcp",
    "pymodbus.client.serial",
    "pymodbus.framer",
    "pymodbus.framer.rtu",
    "pymodbus.framer.socket",
    "pymodbus.transport",
    # pyserial + asyncio extension
    "serial",
    "serial.serialwin32",
    "serial_asyncio",
    # openpyxl (Excel reports)
    "openpyxl",
    "et_xmlfile",
    # fpdf2 (PDF reports)
    "fpdf",
    # aiofiles
    "aiofiles",
    # python-dotenv
    "dotenv",
    # tzdata / tzlocal needed by APScheduler
    "tzdata",
    "tzlocal",
    # h11 / httptools (uvicorn HTTP parsers)
    "h11",
    "httptools",
    # websockets
    "websockets",
    # Your app package — ensure all sub-packages are included
    "app",
    "app.api",
    "app.core",
    "app.models",
    "app.schemas",
    "app.services",
    # pywebview (desktop wrapper)
    "webview",
]

# ── Collect data files ────────────────────────────────────────────────────────
datas = []

# 1. Built React UI
if UI_DIST.is_dir():
    datas.append((str(UI_DIST), "ui_dist"))
else:
    print("WARNING: ui_dist/ not found — run 'npm run build' before packaging!")

# 2. Config files (.env.enc or fallback to .env)
ENV_ENC_FILE = HERE / ".env.enc"
if ENV_ENC_FILE.is_file():
    datas.append((str(ENV_ENC_FILE), "."))
elif ENV_FILE.is_file():
    datas.append((str(ENV_FILE), "."))

# 3. fpdf2 ships font & image data inside its package
datas += collect_data_files("fpdf")

# 4. openpyxl has XML templates
datas += collect_data_files("openpyxl")

# 5. tzdata zone files
datas += collect_data_files("tzdata")

# 6. pydantic_core has Rust extension wheels with embedded resources
datas += collect_data_files("pydantic_core")

# 7. Mako templates used by alembic (not needed at runtime but safe to include)
# datas += collect_data_files("mako")

# ── Binaries ──────────────────────────────────────────────────────────────────
# PyInstaller usually finds .pyd/.dll files automatically via Analysis.
# If cryptography fails at runtime, explicitly list its _rust.pyd here.
binaries = []

# ── Analysis ──────────────────────────────────────────────────────────────────
a = Analysis(
    ["desktop.py"],          # <-- entry point (see desktop.py below)
    pathex=[str(HERE)],      # ultron_backend/ must be on sys.path for 'import app'
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude heavy testing / dev tooling not needed at runtime
        "pytest", "IPython", "notebook", "jupyter",
        "matplotlib", "numpy", "pandas",   # not used by UltrON
        "PIL",                              # not used
        "cv2",                              # not used
        "alembic",                          # migrations run separately
        "fontTools",                        # not needed at runtime
        "pip", "_yaml",
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

# ─── EXE (One-File Bundle) ────────────────────────────────────────────────────
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    exclude_binaries=False,   # one-file mode (self-contained executable)
    name="UltrON",
    debug=True,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,           # console window enabled for PyInstaller bootloader stability (hidden programmatically at runtime)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon="ultron.ico",       # place ultron.ico next to this .spec file
    version=None,            # replace with a version_info.txt for Windows metadata
)
