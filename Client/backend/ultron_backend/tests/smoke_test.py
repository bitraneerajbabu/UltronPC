"""
UltrON pre-build smoke test.

Run this BEFORE every PyInstaller build (add it as a step in build_exe.bat).
It imports every module under app/ and fails loudly with the exact module
and traceback if anything is broken or missing a hidden import — catching
in ~2 seconds what would otherwise surface as a silent crash on a client PC
after a 40MB build + install cycle.

Usage:
    cd client/backend/ultron_backend
    python tests/smoke_test.py

Exit code 0 = all modules imported cleanly.
Exit code 1 = one or more modules failed; details printed per-module.

Add to build_exe.bat right before the PyInstaller steps:
    python tests\\smoke_test.py
    if errorlevel 1 (
        echo SMOKE TEST FAILED - fix imports before building
        exit /b 1
    )
"""

import importlib
import pkgutil
import sys
import traceback
from pathlib import Path

# Root of the ultron_backend package (this file lives in ultron_backend/tests/)
BACKEND_ROOT = Path(__file__).resolve().parent.parent
APP_ROOT = BACKEND_ROOT / "app"
PACKAGE_PREFIX = "app"

# Modules that are known to require special environment/runtime setup and
# are exempt from the plain-import smoke test (add reasons so this list
# doesn't silently grow forever).
SKIP_MODULES = {
    # "app.core.secrets_vault": "requires decrypted .env at import time",
}


def discover_modules(package_root: Path, package_prefix: str) -> list[str]:
    """Walk app/ and return dotted module names for every .py file."""
    modules = []
    for path in package_root.rglob("*.py"):
        if path.name == "__init__.py":
            rel = path.parent.relative_to(package_root.parent)
        else:
            rel = path.relative_to(package_root.parent).with_suffix("")
        dotted = ".".join(rel.parts)
        if dotted and dotted not in modules:
            modules.append(dotted)
    return sorted(set(modules))


def run_smoke_test() -> int:
    sys.path.insert(0, str(BACKEND_ROOT))

    modules = discover_modules(APP_ROOT, PACKAGE_PREFIX)
    if not modules:
        print(f"ERROR: no modules discovered under {APP_ROOT} — check paths.")
        return 1

    print(f"Smoke testing {len(modules)} modules under app/ ...\n")

    failures: list[tuple[str, str]] = []
    skipped: list[str] = []

    for mod_name in modules:
        if mod_name in SKIP_MODULES:
            skipped.append(mod_name)
            continue
        try:
            importlib.import_module(mod_name)
        except Exception:
            failures.append((mod_name, traceback.format_exc()))

    print(f"Imported OK : {len(modules) - len(failures) - len(skipped)}")
    print(f"Skipped     : {len(skipped)}")
    print(f"Failed      : {len(failures)}\n")

    if skipped:
        print("Skipped modules:")
        for m in skipped:
            print(f"  - {m}: {SKIP_MODULES[m]}")
        print()

    if failures:
        print("=" * 70)
        print("FAILURES — fix these before running PyInstaller:")
        print("=" * 70)
        for mod_name, tb in failures:
            print(f"\n--- {mod_name} ---")
            print(tb)
        return 1

    print("All modules imported cleanly. Safe to build.")
    return 0


if __name__ == "__main__":
    sys.exit(run_smoke_test())
