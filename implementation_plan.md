# UltrON EXE — Three Fixes

## Summary

Addressing three issues in the UltrON client EXE:

1. **Login token bug** — When the EXE restarts, the `SECRET_KEY` is regenerated from `secrets.token_urlsafe(32)` (see `config.py` line 122), which **invalidates all previously issued JWT tokens** on every restart, forcing re-login.
2. **Update button** — Add a UI button to `client_manager.py` (the admin GUI) labeled **"Update"** that shows the current version and lets admin push/trigger a firmware update to the latest GitHub release on client PCs.
3. **Terminal/console window showing** — When the EXE runs on client PCs, a black console window appears briefly (or stays). This is caused by `desktop.py` trying to `ShowWindow(hwnd, 0)` but the window already shows before the code runs; also the `_run_server` thread's uvicorn output may open a console.

---

## Proposed Changes

### Fix 1 — Stable `SECRET_KEY` (Login token persistence)

#### [MODIFY] [config.py](file:///c:/Users/sunsh/OneDrive/Music/UltrON/client/backend/ultron_backend/app/config.py)

Instead of using `secrets.token_urlsafe(32)` as default (which regenerates every run), derive a **deterministic but secret key** from machine-stable data. The best approach: persist the key to a `secret.key` file next to the EXE on first run. On subsequent runs, load it from disk.

Change: replace the random default factory for `SECRET_KEY` with a function that reads/writes a stable key file.

---

### Fix 2 — "Update" button in `client_manager.py`

#### [MODIFY] [client_manager.py](file:///c:/Users/sunsh/OneDrive/Music/UltrON/client/client_manager.py)

Add an **"Update"** button in the header bar of the Client Manager GUI. Clicking it opens a small dialog that:
- Shows **current version** (read from `publish_release.py`'s `TAG` constant or a version file)
- Shows **latest version** from GitHub Releases API
- Has an **"Update Now"** button to download + re-publish the new EXE

This is the **admin-side manager** (the GUI running on the developer's machine), not on client PCs. So the button will:
1. Check the latest GitHub release tag
2. Show current version vs latest
3. If newer is available, trigger `publish_release.py` to upload a newly built EXE to GitHub

---

### Fix 3 — Hide console window on client EXE

#### [MODIFY] [desktop.py](file:///c:/Users/sunsh/OneDrive/Music/UltrON/client/backend/ultron_backend/desktop.py)

The console hide code already exists but runs **after** the window has been shown. The real fix is in the **PyInstaller spec** — setting `console=False` in `UltrON.spec`. Let me also verify and update.

#### [MODIFY] [UltrON.spec](file:///c:/Users/sunsh/OneDrive/Music/UltrON/client/backend/ultron_backend/UltrON.spec)

Ensure `console=False` is set in the `EXE(...)` call so no terminal appears.

---

## Open Questions

> [!IMPORTANT]
> **Fix 2 — What does "Update" button mean exactly?**
> - **Option A**: Button in `client_manager.py` (admin dev machine) — lets the admin see current vs latest GitHub version and trigger a new publish/release
> - **Option B**: A button visible on the **client PC's EXE** in the pywebview window (frontend React UI) — shows version + download + auto-update
> - **Option C**: Both — an update checker in the EXE that auto-downloads updates on client PC startup (the auto-updater in `desktop.py` already has `_apply_pending_update`)
>
> Currently the auto-updater in `desktop.py` checks for `update_pending.flag` + `UltrON_new.exe` but there's no code that **downloads** the new version automatically. Is the plan to add that download logic to the EXE?

> [!IMPORTANT]
> **Fix 1 — Where is the `SECRET_KEY` instability happening?**
> - Every time the EXE restarts, `secrets.token_urlsafe(32)` runs fresh, so all tokens expire. Should we persist the key to a file next to the EXE (e.g., `secret.key`)?

> [!NOTE]
> **Fix 3 — Terminal visibility**: The `desktop.py` has `ShowWindow(hwnd, 0)` at startup but the terminal might flash briefly. The definitive fix is ensuring `console=False` in `UltrON.spec`. Please confirm this is the desired behavior (no terminal at all on client).

## Verification Plan

- Build the EXE and test login persistence across restarts
- Verify console window does not appear on launch
- Verify the Update button shows versions correctly

---

## GSTACK REVIEW REPORT

### DX Plan Review — Scorecard

| Dimension | Score | Prior | Trend |
|---|---|---|---|
| Usable | 5 | — | baseline |
| Credible | 6 | — | baseline |
| Findable | 4 | — | baseline |
| Useful | 7 | — | baseline |
| Valuable | 5 | — | baseline |

**Overall DX score: 5.4/10** (DX TRIAGE mode)

### Executive Summary

All 3 fixes described in this plan are **already implemented in source code**. The plan is stale — the `SECRET_KEY` stability question (Fix 1) and `console=False` configuration (Fix 3) were resolved in earlier work. Two open questions in this plan reference already-fixed issues.

### Critical Recommendations (blocking adoption)

1. **Retire this plan document.** All changes are shipped. Move to `docs/` as historical record or delete.
2. **Close the publish loop in the GUI.** `UpdateDialog` shows versions but stops at CLI instructions. A `📦 Publish Now` button that shells `publish_release.py --patch` would turn 2 min of CLI into 5 sec.
3. **Add release notes to the Update dialog.** Fetch GitHub release body alongside version tag so admin sees what changed.
4. **Run one-click from the plan dialog.** The 3-step build chain (`npm run build` → `pyinstaller` → `publish_release.py`) needs a single orchestrator.

### Evidence

- Fix 1 implemented: `config.py:165-190` (`_load_or_create_secret_key`)
- Fix 2 implemented: `client_manager.py:100-401` (`UpdateDialog` + `⬆ Update` button)
- Fix 3 implemented: `UltrON.spec:256` (`console=False`) + `desktop.py:17-47` (DummyStream patch)
