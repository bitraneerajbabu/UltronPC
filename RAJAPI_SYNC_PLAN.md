# UltrON ↔ RajAPI Sync — Option B Redesign Plan
# Status: DEFERRED — implement after Neeraj confirms /heartbeat extension on RajAPI server
# Option A (bug fixes) shipped: 2026-07-20

## Context

UltrON client currently has 3 overlapping RajAPI communication paths:

| # | Function | Trigger | Endpoint | Auth |
|---|----------|---------|----------|------|
| 1 | `send_heartbeat()` in `rajapi_sync.py` | every 60s | `POST /heartbeat` | CENTRAL_API_KEY as Bearer |
| 2 | `_push_telemetry_to_rajapi()` in `server_push.py` | every 60s + 900s | `POST /sync/` | CENTRAL_API_KEY as X-API-Key |
| 3 | `_poll_remote_commands()` in `server_push.py` | every 60s | `GET /commands/pending` | RAJAPI_API_KEY as X-Admin-Key |

**Option A (done):** Removed #3 (duplicate command poll). Fixed PendingUpload null-FK crash. Consolidated auth function. Commands now flow exclusively through heartbeat response body.

## Option B Goal: Collapse paths #1 and #2 into one

Single `POST /api/v1/client-sync` replaces both `/heartbeat` and `/sync/`:

```json
{
  "gateway_id": "KTPP",
  "device_secret": "...",
  "version": "1.0.70",
  "heartbeat_ts": "2026-07-20T16:00:00Z",
  "status": "online",
  "metrics": { "cpu": 12.1, "ram": 45.0, "disk": 30.0 },
  "polling_active": true,
  "hostname": "KTPP-PC",
  "live_points": [
    { "tag": "PM10", "value": 45.2, "quality": "U", "ts": "2026-07-20T16:00:00Z", "unit": "ug/m3" }
  ],
  "avg_points": [
    { "tag": "PM10", "value": 44.1, "quality": "U", "ts": "2026-07-20T15:45:00Z", "type": "avg_15min", "unit": "ug/m3" }
  ]
}
```

RajAPI responds (same shape as current /heartbeat response):
```json
{
  "lock_status": "unlocked",
  "broadcasts": [...],
  "commands": [...]
}
```

## Preconditions (Neeraj must confirm before starting)

- [ ] RajAPI `/api/v1/client-sync` endpoint created (or `/heartbeat` extended to accept + store `live_points`, `avg_points`)
- [ ] PostgreSQL schema updated: `telemetry_points` table in `ultron_central` DB
- [ ] RajAPI admin panel shows per-client telemetry (smoke test)

## Client-Side Changes (Option B)

### `rajapi_sync.py`
- Extend `send_heartbeat()` payload to include `live_points` + `avg_points`
- Query `LiveData` + `Averages` (last 30 min, avg_15min) inside `send_heartbeat()`
- Change `RAJAPI_SYNC_URL` default to new endpoint

### `server_push.py`
- Delete `_push_telemetry_to_rajapi()` entirely (replaced by extended heartbeat)
- Delete calls to it in `run_server_push()`
- `server_push.py` now only handles SPCB/CPCB third-party servers

### `main.py`
- Remove `push_to_rajapi` scheduler job (merged into heartbeat)
- Result: one `rajapi_sync` job every 60s, two SPCB jobs (live/delay)

### `config.py`
- Change `RAJAPI_SYNC_URL` default to new endpoint
- Remove `RAJAPI_COMMANDS_URL` (no longer used after Option A)
- Remove `RAJAPI_API_KEY` (Q4 auth cleanup)

### `models/rajapi.py`
- `RajAPIConfig.auth_token` → deprecate (Q4 cleanup)
- `RajAPIStationConfig` — keep for per-station enable/disable

## Auth Model (surviving after Option B)
- **CENTRAL_API_KEY** — primary, set via license verify → saved to .env.enc
- **GATEWAY_ID + DEVICE_SECRET** — fingerprinting fallback only
- Kill: `RAJAPI_API_KEY`, `RajAPIConfig.auth_token` (Q4)

## Verification Plan

1. Heartbeat fires every 60s with `live_points` + `avg_points` in payload
2. RajAPI admin panel shows telemetry for the client
3. Lock/AMC response still works (response shape unchanged)
4. Broadcasts dedup still works
5. No separate `/sync/` calls appear in network logs
