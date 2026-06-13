# -*- mode: python ; coding: utf-8 -*-
# UltrON — DEBUG SPEC
# Use this first to find what is failing.
# Shows a console window so all errors are visible.
#
# Build:  pyinstaller UltrON_debug.spec --clean --noconfirm
# Run:    dist\UltrON_debug\UltrON_debug.exe
#         (a black console window will open — read the errors there)

import sys
import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files

HERE    = Path(SPEC).parent.resolve()
UI_DIST = HERE / "ui_dist"
ENV_FILE = HERE / ".env"

hidden = [
    "uvicorn.logging",
    "uvicorn.loops", "uvicorn.loops.asyncio",
    "uvicorn.protocols", "uvicorn.protocols.http", "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl", "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.websockets", "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.protocols.websockets.websockets_sansio_impl",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.lifespan", "uvicorn.lifespan.on", "uvicorn.lifespan.off",
    "sqlalchemy.dialects.sqlite", "sqlalchemy.dialects.sqlite.pysqlite",
    "sqlalchemy.dialects.sqlite.aiosqlite",
    "sqlalchemy.dialects.postgresql", "sqlalchemy.dialects.postgresql.asyncpg",
    "sqlalchemy.pool", "sqlalchemy.pool.impl",
    "aiosqlite",
    "asyncpg",
    "apscheduler.schedulers.asyncio", "apscheduler.executors.asyncio",
    "apscheduler.jobstores.memory",
    "apscheduler.triggers.cron", "apscheduler.triggers.interval",
    "apscheduler.triggers.date",
    "pydantic", "pydantic.v1", "pydantic_settings", "pydantic_core",
    "fastapi", "starlette", "starlette.routing", "starlette.staticfiles",
    "starlette.middleware", "starlette.middleware.cors",
    "multipart", "python_multipart",
    "jose", "jose.backends", "jose.backends.cryptography_backend",
    "cryptography", "cryptography.hazmat.primitives",
    "cryptography.hazmat.backends.openssl",
    "cryptography.hazmat.bindings.openssl.binding",
    "passlib", "passlib.handlers", "passlib.handlers.bcrypt",
    "passlib.context", "passlib.crypto",
    "pymodbus", "pymodbus.client", "pymodbus.client.tcp",
    "pymodbus.client.serial", "pymodbus.framer",
    "pymodbus.framer.rtu", "pymodbus.framer.socket", "pymodbus.transport",
    "serial",
    "serial.serialwin32",
    "serial.serialutil",
    "serial.win32",
    "serial.tools",
    "serial.tools.list_ports",
    "serial.tools.list_ports_windows",
    "serial.tools.list_ports_common",
    "serial_asyncio",
    "openpyxl", "et_xmlfile", "fpdf", "aiofiles", "dotenv",
    "tzdata", "tzlocal", "h11", "httptools", "websockets",
    "app", "app.api", "app.core", "app.models", "app.schemas", "app.services",
    "webview",
]

datas = []
if UI_DIST.is_dir():
    datas.append((str(UI_DIST), "ui_dist"))
ENV_ENC_FILE = HERE / ".env.enc"
if ENV_ENC_FILE.is_file():
    datas.append((str(ENV_ENC_FILE), "."))
elif ENV_FILE.is_file():
    datas.append((str(ENV_FILE), "."))
datas += collect_data_files("fpdf")
datas += collect_data_files("openpyxl")
datas += collect_data_files("tzdata")
datas += collect_data_files("pydantic_core")

a = Analysis(
    ["desktop.py"],
    pathex=[str(HERE)],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    runtime_hooks=[],
    excludes=["pytest", "IPython", "matplotlib", "numpy", "pandas",
              "PIL", "cv2", "alembic", "fontTools", "pip"],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    exclude_binaries=False,   # one-file mode (self-contained executable)
    name="UltrON_debug",
    debug=True,          # ← verbose PyInstaller boot messages
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,           # skip UPX so we get cleaner error messages
    console=True,        # ← CONSOLE WINDOW ON — see all errors
    icon="ultron.ico",   # place ultron.ico next to this .spec file
    disable_windowed_traceback=False,
)
