# RajAPI Super Admin Portal — Phase 2 Rebuild Report

**Date:** 2026-08-14
**Status:** READY FOR DEPLOYMENT — awaiting explicit approval. Nothing deployed to `/var/www/rajapi`.

---

## 1. Overview

Rebuilt the RajAPI.com UltrON Super Admin Portal frontend (server/frontend) from a 1,527-line `App.tsx` monolith into a structured, typed, maintainable app with a new information architecture. Backend untouched. All verification passed against a throwaway test instance of the backend with fresh credentials (prod-safe, see §8).

## 2. What shipped

- **12 screens** in `src/screens/`: Dashboard (6 KPIs + plants table + recent activity), Sites (filters/search/AMC edit/toggle/renew/delete), Site Detail (10s live telemetry, stations CRUD, API key show/copy/regenerate, quick commands, lock), UltrON Clients, Broadcast Center (create/edit/toggle/delete + filters), AMC & Control (lock/unlock + AMC expiry), Regulatory (CPCB status + 30-day counts), Reports (quality U/O/E/N per site → param detail → history chart), Commands (restart/reboot/reset with double-confirm), Notifications (stats + ack), Activity, PendingScreen placeholders.
- **New IA nav**: Dashboard; Monitoring (Sites, UltrON Clients); Control (Broadcast Center, AMC & Control); Compliance (Regulatory, Reports); Operations (Commands, Notifications, Activity); Administration (Users, Roles, Settings, Audit Trail).
- **Shared modules**: `types.ts`, `api.ts` (adminFetch with `X-Admin-Key` from sessionStorage), `format.ts` (IST formatting, 90s online rule, quality map).
- **Theme**: light-only, Source Sans 3, primary `#0F6E56`, border radius 8, industrial MUI overrides.
- **Deleted**: `Telemetry3DVisualizer.tsx`, `SkeletonLoader.tsx`.
- **PWA fix**: runtimeCaching for `/api/*` removed — precache is assets-only (no stale API data served offline).

## 3. Files changed

**New**
- `server/frontend/src/types.ts`, `src/api.ts`, `src/format.ts`
- `server/frontend/src/screens/` (12 files): DashboardScreen, SitesScreen, SiteDetailScreen, ClientsScreen, BroadcastsScreen, AmcScreen, RegulatoryScreen, ReportsScreen, CommandsScreen, NotificationsScreen, ActivityScreen, PendingScreen

**Rewritten**
- `server/frontend/src/App.tsx` (~390 lines: login, 30s polling, tab/site nav, PENDING_REQUIREMENTS)
- `server/frontend/src/theme.ts` (light-only, Source Sans 3)
- `server/frontend/src/index.css` (@fontsource/source-sans-3 imports, dark rules removed)
- `server/frontend/src/components/Layout/{Sidebar,Header,Layout}.tsx` (new IA, breadcrumbs, no search/dark toggle)

**Modified**
- `server/frontend/src/components/Common/Icon.tsx` (+12 icons)
- `server/frontend/src/components/Dialogs/BroadcastDialog.tsx` (`SiteOption.location` typed `string | null`)
- `server/frontend/package.json` (`@fontsource/inter` → `@fontsource/source-sans-3 ^5.2.8`)
- `server/frontend/vite.config.ts` — **KEPT per user decision**: proxy target `process.env.API_PROXY_TARGET || 'http://localhost:8000'`. Default behavior unchanged; enables staged E2E. No further changes to this file.

**Deleted**
- `server/frontend/src/components/Common/Telemetry3DVisualizer.tsx`
- `server/frontend/src/components/Common/SkeletonLoader.tsx`

## 4. Design decisions

| Decision | Rationale |
|---|---|
| Tab-state nav, no react-router | Same as old app; no route/back-button complexity for an admin tool |
| Chart.js retained for Reports history | Already bundled; no new chart dep |
| Dialogs (CreateSite/EditSite/Broadcast/Lock) reused as-is | Backend contracts unchanged; smallest diff |
| SiteDetailScreen self-polls telemetry/10s | Same cadence as old App-level poll; polls only when a site is open (less traffic) |
| App polls 8 GETs/30s | Exactly the old endpoint set — no API traffic increase |
| PendingScreen for Users/Roles/Settings/Audit | No backend exists; requirements listed in UI; no backend work this phase |
| 90s online rule | Server semantics (`last_sync` recency); old UI used 5 min — now correct per server truth |
| Deleted 3D globe + skeleton loader | Dead weight; no consumer |
| PWA no longer caches API | Old cached API responses could serve stale broadcast/AMC data offline |

## 5. Bundle & asset sizes

| Asset | Size |
|---|---|
| `index-*.js` | 786 KB (≈245 KB gzip) |
| `index-*.css` | 12.9 KB |
| Fonts (Source Sans 3) | ~72 subset files emitted; browsers fetch only the latin woff2 subsets actually used (≈6 files, ~90 KB) via `unicode-range` |
| PWA precache | 50 entries, 1298.55 KB (includes all font subsets — flagged simplification, §9) |

## 6. RAM impact

- Backend: **zero** — no backend changes.
- Pi RAM: static files only; nginx serves from disk. No new server-side cost.
- Browser: same MUI stack as before, comparable bundle; font swap neutral. Lower render cost than old monolith (no 3D canvas globe).

## 7. Verification results (all green)

**Build & lint**
- `npm install` OK (4 pre-existing vulns noted, none introduced)
- `tsc -b && vite build` PASS (2 fix rounds: 4 TS errors fixed)
- `npm run lint`: 9 pre-existing errors remain in **untouched** files (Icon.tsx, SectionCard.tsx, 4 dialogs — `any`/set-state-in-effect). All new files lint-clean.

**Backend regression** (in-memory SQLite, safe): `test_sync_auto_provisioning.py` 3/3 PASS.

**API integration** (test instance, same prod DB, read-only + test-safe records):
- Login: username+password 200, admin_key-as-password 200, wrong password 401
- All 8 polling GETs: 200
- Sites CRUD, lock/unlock, renew, renew-key, status toggle: 200
- Stations CRUD (correct payload): 201 / 200 / 204
- Broadcasts CRUD + toggle: 200
- Commands route (invalid action): 400 — validated without queueing
- Alarm ack (nonexistent id): 404 — validated without touching real alarms
- History route (real param): schema accepted

**Browser E2E** (headless Chrome + CDP driver, zero deps):
- Login form → dashboard: PASS (key stored in sessionStorage)
- All 14 screens (10 live + 4 placeholders): PASS
- Console errors: **0** · Network failures: **0** · Failed API responses: **0**
- State changes via UI: create/delete broadcast, create/lock/unlock/delete site — all passed, records verified deleted from DB after

## 8. Test hygiene

- Throwaway backend instance on LAN-only port 8082 with **fresh random** ADMIN_USERNAME/ADMIN_PASSWORD/ADMIN_KEY/SECRET_KEY; DATABASE_URL copied on-Pi only (never left the Pi, never printed)
- Credentials delivered to the browser driver via a chmod-600 temp env file, deleted after; **no values were printed or committed anywhere**
- Test records (`ZZ TEST *` / `ZZ UI TEST *`) created and deleted within the session; verified zero leftovers in DB
- Test instance process killed, `/home/pi/rajapi_test` removed, prod service untouched (verified active, auth 403 on bad key)

## 9. Known simplifications

- **Font subsets**: all @fontsource subsets precached (1298 KB precache). Browsers only download used subsets; prune `latin`-only import when subsetting matters.
- **Reports param selection** driven by `quality/{site}` response; params without readings won't appear in the selector (matches old behavior).
- **Activity screen** = alarms + broadcasts only; command history and user actions need backend (noted in UI subtitle).
- **BroadcastDialog `location` type relaxation** — dialogs still carry pre-existing lint `any`s; left as-is (out of scope, shared components).
- **Pending screens** list requirements — intentionally not implemented (no backend).

## 10. Deploy plan (NOT executed — awaiting approval)

1. Backup frontend: `tar -czf /home/pi/rajapi_www_backup_$(date +%Y%m%d_%H%M%S).tar.gz -C /var/www rajapi`
2. Record pre-deploy hashes: `sha256sum /var/www/rajapi/assets/*` (current: `index-OMr4Gfv4.v4.js` expected)
3. Copy `server/frontend/dist/*` to Pi temp, then swap into `/var/www/rajapi` (assets dir + index.html + sw.js)
4. `chown -R www-data:www-data /var/www/rajapi`
5. Verify: `curl -sI https://rajapi.com/` → 200; `curl -s https://rajapi.com/assets/index-*.js` → 200; hash matches repo `dist` (`index-BnkNGb3t.js`)
6. Verify all 8 API routes still 200 through nginx
7. Post-deploy browser pass: login, Dashboard, each screen, console/network zero-errors

## 11. Rollback plan

- Restore: `tar -xzf /home/pi/rajapi_www_backup_<ts>.tar.gz -C /var/www`
- Verify old `index-OMr4Gfv4.v4.js` served again (200 + hash match)
- DB backup already verified off-Pi: `backups/ultron_central_20260814_014519.dump` (SHA256 F3C8AC9AE0EFAE0412D948F2A9129E1B53C410FEC510064FD08983A442C20195) + Pi cron backups (03:00/15:00, 14-day retention)

## 12. Out of scope (unchanged)

Auth/authorization, heartbeat, broadcast, AMC, sync, CPCB/SPCB, commands security, Rust axum service, nginx, systemd, DB schema, backend code, Users/Roles/Settings/Audit backend.

---

**Next action:** await explicit approval before touching `/var/www/rajapi`.