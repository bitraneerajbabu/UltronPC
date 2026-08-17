# RajAPI Super Admin Dashboard — Fleet Monitoring System

**Status:** Design proposal — no code written.
**Date:** 2026-07-04
**Context:** RajAPI is a Fleet Monitoring System. Each "plant" runs one UltrON client (one gateway). RajAPI monitors all deployed clients across the fleet.

---

## Layout Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  [RajAPI Fleet Manager]    [🔍 Search fleet...]    [🔔] [👤 admin] │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Fleet Status Bar  │  Online  │  Offline  │  Warning  │ Crit │  │
│  │                   │    18    │     2     │     3     │  1   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────┬──────────────────────┬────────────────┐  │
│  │ Online Plants        │ Warning Plants       │ Critical Plants│  │
│  │ [list of 5] See all→ │ [list of 5] See all→ │ [list of 5] → │  │
│  ├──────────────────────┼──────────────────────┼────────────────┤  │
│  │ Offline Plants       │ Latest Offline       │ Sys Health     │  │
│  │ [list of 5] See all→ │ [timeline]           │ [status cards] │  │
│  ├──────────────────────┴──────────────────────┴────────────────┤  │
│  │ Recent Activity                          [View all →]        │  │
│  │ ┌─────────────────────────────────────────────────────────┐  │
│  │ │ 🟢 ULTRON-IND-001  heartbeat received    12s ago       │  │
│  │ │ 🔴 ULTRON-IND-015  went offline           2m ago       │  │
│  │ │ 🟡 ULTRON-IND-008  CPU > 90%              5m ago       │  │
│  │ │ 📢 Broadcast sent  "Maintenance window"   10m ago      │  │
│  │ └─────────────────────────────────────────────────────────┘  │
│  ├──────────────────────┬──────────────────────┬────────────────┤  │
│  │ S/W Version Dist.    │ License / AMC        │ Notifications  │  │
│  │ [donut chart]        │ [summary cards]      │ [feed list]    │  │
│  └──────────────────────┴──────────────────────┴────────────────┘  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Section 1: Fleet Status Bar

### Purpose
Global fleet health at a single glance. Show aggregate counts of plants in each state. This is the primary KPI bar for the entire dashboard.

### Data Source
Aggregate SQL query across all `gateways` rows — computed server-side from `last_status` and `last_heartbeat` age.

### React Component Name
`FleetStatusBar`

### API Endpoint Needed
```
GET /api/v1/fleet/summary
Response:
{
  "total": 24,
  "online": 18,
  "offline": 2,
  "warning": 3,
  "critical": 1,
  "last_updated": "2026-07-04T12:34:56Z"
}
```

State definitions:
- **Online:** `last_status = "online"` AND `last_heartbeat > NOW() - INTERVAL '90 seconds'`
- **Warning:** `last_status = "online"` AND heartbeat > 90s but < 5min OR CPU > 90% OR RAM > 90%
- **Offline:** `last_status != "online"` OR `last_heartbeat < NOW() - INTERVAL '5 minutes'`
- **Critical:** No heartbeat for > 30 minutes OR `disk_usage > 95%` OR response shows `lock_status = "locked"`

### Backend Model Needed
New response struct — not a DB table. Aggregation of existing `Gateway` model.

### Estimated Size
350px × 80px — single horizontal bar, 4 stat cards with counts + color coding.

---

## Section 2: Online Plants

### Purpose
Show which plants are currently healthy and operational. Quick reference for "who's up right now." Limit to top 5 with link to full gateways page.

### Data Source
`SELECT * FROM gateways WHERE last_status = 'online' AND last_heartbeat > NOW() - INTERVAL '90 seconds' ORDER BY last_heartbeat DESC LIMIT 5`

### React Component Name
`OnlinePlantsPanel`

### API Endpoint Needed
```
GET /api/v1/fleet/online?limit=5
Response:
[
  {
    "gateway_id": "ULTRON-IND-001",
    "plant_name": "Sunshine HQ",
    "location": "Indore, MP",
    "last_heartbeat": "2026-07-04T12:34:00Z",
    "version": "1.0.67",
    "uptime_hours": 342
  }
]
```

### Backend Model Needed
New `FleetGatewaySummary` struct (subset of `Gateway` + computed `uptime_hours`).

### Estimated Size
400px × 280px — card list with status dot, plant name, location, version, last heartbeat time.

---

## Section 3: Offline Plants

### Purpose
Show plants that have lost connectivity. Critical for dispatch/alerting. Show how long each has been offline.

### Data Source
`SELECT * FROM gateways WHERE last_status != 'online' OR last_heartbeat < NOW() - INTERVAL '90 seconds' ORDER BY last_heartbeat ASC LIMIT 5`

### React Component Name
`OfflinePlantsPanel`

### API Endpoint Needed
```
GET /api/v1/fleet/offline?limit=5
Response:
[
  {
    "gateway_id": "ULTRON-IND-012",
    "plant_name": "Neeraj Industries",
    "location": "Pithampur, MP",
    "last_heartbeat": "2026-07-04T08:15:00Z",
    "offline_duration": "4h 19m",
    "last_version": "1.0.65"
  }
]
```

### Backend Model Needed
Same `FleetGatewaySummary` struct, with `offline_duration` replacing `uptime_hours`.

### Estimated Size
400px × 280px — card list with red status dot, plant name, offline duration, last known heartbeat. Quick-dispatch button per row.

---

## Section 4: Warning Plants

### Purpose
Show plants that are online but degraded — high resource usage, stale heartbeats, or other anomalies. Proactive alerting before they go fully offline.

### Data Source
`SELECT * FROM gateways WHERE last_status = 'online' AND (cpu_usage > 90 OR ram_usage > 90 OR disk_usage > 90 OR last_heartbeat < NOW() - INTERVAL '90 seconds') ORDER BY GREATEST(cpu_usage, ram_usage, disk_usage) DESC LIMIT 5`

### React Component Name
`WarningPlantsPanel`

### API Endpoint Needed
```
GET /api/v1/fleet/warning?limit=5
Response:
[
  {
    "gateway_id": "ULTRON-IND-008",
    "plant_name": "Beta Chemicals",
    "location": "DEwas, MP",
    "cpu_usage": 94.2,
    "ram_usage": 88.1,
    "disk_usage": 76.3,
    "warning_reason": "CPU > 90%",
    "last_heartbeat": "2026-07-04T12:33:00Z"
  }
]
```

### Backend Model Needed
New `FleetWarningGateway` struct extending `FleetGatewaySummary` with resource usage + computed `warning_reason`.

### Estimated Size
400px × 280px — card list with amber status dot, resource usage bars (CPU/RAM/Disk), warning reason text.

---

## Section 5: Critical Plants

### Purpose
Show plants that need immediate attention: long-term offline, locked AMC, critical disk usage, or no heartbeat for > 30 minutes.

### Data Source
`SELECT * FROM gateways WHERE (last_status != 'online' AND last_heartbeat < NOW() - INTERVAL '30 minutes') OR disk_usage > 95 OR is_active = false ORDER BY last_heartbeat ASC NULLS FIRST LIMIT 5`

### React Component Name
`CriticalPlantsPanel`

### API Endpoint Needed
```
GET /api/v1/fleet/critical?limit=5
Response:
[
  {
    "gateway_id": "ULTRON-IND-003",
    "plant_name": "Old Plant",
    "last_heartbeat": null,
    "critical_reason": "Never connected — 14 days since registration",
    "is_active": false
  },
  {
    "gateway_id": "ULTRON-IND-019",
    "plant_name": "Ancient Corp",
    "location": "Ujjain, MP",
    "disk_usage": 97.8,
    "critical_reason": "Disk 97.8% — possible data loss",
    "last_heartbeat": "2026-07-02T06:00:00Z"
  }
]
```

### Backend Model Needed
New `FleetCriticalGateway` struct with `critical_reason` (computed string).

### Estimated Size
400px × 280px — card list with red status dot, critical reason in bold, urgent action button ("Send Alert", "Disable").

---

## Section 6: Latest Offline Timeline

### Purpose
Show a chronological timeline of plants that recently went offline. Helps identify cascading failures (e.g., power outage affecting multiple plants in same region).

### Data Source
`heartbeat_log` table — query for status transitions. Alternatively, derive from `gateways.last_heartbeat` ordering with `last_status = 'offline'`.

### React Component Name
`LatestOfflineTimeline`

### API Endpoint Needed
```
GET /api/v1/fleet/recent-offline?limit=10
Response:
[
  {
    "gateway_id": "ULTRON-IND-015",
    "plant_name": "Greenfield Ltd",
    "location": "Dhar, MP",
    "went_offline_at": "2026-07-04T12:32:00Z",
    "was_online_for": "12d 4h",
    "last_status_before": "online",
    "region": "Malwa"
  }
]
```

### Backend Model Needed
New struct. Data derived from `gateways` table ordered by `last_heartbeat` ASC where `last_status = 'offline'`, plus a computed `was_online_for` from tracking when the gateway first appeared.

Alternatively, add a `status_changes` table to track transitions (future optimization).

### Estimated Size
400px × 280px — vertical timeline with dots, plant names, relative time, region grouping.

---

## Section 7: Recent Activity Feed

### Purpose
Unified, chronological feed of all significant fleet events: heartbeats received, commands dispatched, broadcasts sent, gateways going online/offline, config changes.

### Data Source
Combined query across `commands`, `broadcasts`, and `heartbeat_log` tables using `UNION ALL` ordered by timestamp DESC.

### React Component Name
`RecentActivityFeed`

### API Endpoint Needed
```
GET /api/v1/fleet/activity?limit=20
Response:
[
  {
    "type": "heartbeat",
    "gateway_id": "ULTRON-IND-001",
    "message": "Heartbeat received — online",
    "timestamp": "2026-07-04T12:34:56Z",
    "severity": "info"
  },
  {
    "type": "command",
    "gateway_id": "ULTRON-IND-012",
    "message": "Command 'restart_polling' dispatched",
    "timestamp": "2026-07-04T12:30:00Z",
    "severity": "info"
  },
  {
    "type": "broadcast",
    "gateway_id": null,
    "message": "Broadcast 'Scheduled maintenance' sent to all gateways",
    "timestamp": "2026-07-04T12:00:00Z",
    "severity": "warning"
  },
  {
    "type": "offline",
    "gateway_id": "ULTRON-IND-015",
    "message": "Gateway went offline",
    "timestamp": "2026-07-04T11:45:00Z",
    "severity": "error"
  }
]
```

### Backend Model Needed
New `ActivityEvent` enum + struct. Query constructed from UNION of:
```sql
SELECT 'heartbeat' as type, gateway_id, ..., NOW() - last_heartbeat ...
FROM gateways WHERE last_heartbeat IS NOT NULL
UNION ALL
SELECT 'command' as type, gateway_id, status, created_at ...
FROM commands
UNION ALL
SELECT 'broadcast' as type, NULL as gateway_id, message, created_at ...
FROM broadcasts
ORDER BY timestamp DESC LIMIT 20
```

### Estimated Size
Full width, 300px — icon + message + timestamp per row, color-coded by severity.

---

## Section 8: Broadcast Status

### Purpose
Show active broadcasts at a glance — how many are active, how many gateways they target, time remaining. Allow quick create/deactivate from the same panel.

### Data Source
`SELECT * FROM broadcasts WHERE is_active = true ORDER BY created_at DESC LIMIT 10`

### React Component Name
`BroadcastStatusPanel`

### API Endpoint Needed
```
GET /api/v1/fleet/broadcasts/active
Response:
{
  "active_count": 3,
  "broadcasts": [
    {
      "id": "uuid",
      "message": "Scheduled maintenance tonight",
      "severity": "info",
      "target_count": 24,
      "target_type": "all",
      "time_remaining": "4h 30m",
      "created_at": "2026-07-04T08:00:00Z"
    }
  ]
}
```

### Backend Model Needed
New `ActiveBroadcastSummary` struct — extends `Broadcast` with computed `time_remaining` and `target_count`.

### Estimated Size
400px × 280px — summary count badge + card list with severity left border, message preview, time remaining, target count.

---

## Section 9: Software Version Distribution

### Purpose
Show which UltrON client versions are deployed across the fleet. Helps plan upgrades and identify outdated installations.

### Data Source
`SELECT last_version, COUNT(*) as count FROM gateways GROUP BY last_version ORDER BY count DESC`

### React Component Name
`VersionDistributionChart`

### API Endpoint Needed
```
GET /api/v1/fleet/versions
Response:
{
  "versions": [
    {"version": "1.0.67", "count": 12, "percentage": 50.0},
    {"version": "1.0.66", "count": 6,  "percentage": 25.0},
    {"version": "1.0.65", "count": 4,  "percentage": 16.7},
    {"version": "1.0.64", "count": 1,  "percentage": 4.2},
    {"version": null,     "count": 1,  "percentage": 4.2}
  ],
  "latest_version": "1.0.67",
  "outdated_count": 5
}
```

### Backend Model Needed
New `VersionDistribution` struct — simple aggregation query.

### Estimated Size
400px × 280px — horizontal stacked bar chart OR donut chart (rendered as SVG or canvas). Version labels + count + percentage. Highlight outdated versions in amber.

---

## Section 10: License Summary

### Purpose
Show license/activation status for each plant. Which are active, expired, or unlicensed. Not currently implemented in DB — requires a new model.

### Data Source
New `licenses` table (not yet created). For now, can derive from `gateways.is_active` as a proxy.

### React Component Name
`LicenseSummaryPanel`

### API Endpoint Needed
```
GET /api/v1/fleet/licenses
Response:
{
  "total": 24,
  "active": 22,
  "expired": 1,
  "unlicensed": 1,
  "expiring_soon": 2,
  "expiring_soon_list": [
    {"gateway_id": "ULTRON-IND-005", "plant_name": "Shiva Industries", "expires_at": "2026-08-01T00:00:00Z", "days_remaining": 28}
  ]
}
```

### Backend Model Needed
New `licenses` table:
```sql
CREATE TABLE licenses (
    id SERIAL PRIMARY KEY,
    gateway_id VARCHAR(64) NOT NULL REFERENCES gateways(gateway_id),
    license_key VARCHAR(128) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true
);
```

### Estimated Size
300px × 200px — 3 stat cards (Active / Expired / Unlicensed) + "Expiring soon" list below.

---

## Section 11: AMC Summary

### Purpose
Display Annual Maintenance Contract status for each plant. Show which AMCs are active, expiring soon, or expired. Critical for revenue management.

### Data Source
New `amc` table (not yet created). Currently the `HeartbeatResponse` includes `amc_expiry` and `lock_status` fields, suggesting AMC data flows through heartbeat responses but is not stored server-side yet.

### React Component Name
`AmcSummaryPanel`

### API Endpoint Needed
```
GET /api/v1/fleet/amc
Response:
{
  "total": 24,
  "active": 20,
  "expiring_30_days": 3,
  "expired": 1,
  "expiring_list": [
    {
      "gateway_id": "ULTRON-IND-009",
      "plant_name": "Kamal Mills",
      "amc_expiry": "2026-07-20T00:00:00Z",
      "days_remaining": 16,
      "lock_status": "unlocked"
    }
  ]
}
```

### Backend Model Needed
New `amc` table:
```sql
CREATE TABLE amc (
    id SERIAL PRIMARY KEY,
    gateway_id VARCHAR(64) NOT NULL REFERENCES gateways(gateway_id),
    contract_start TIMESTAMPTZ NOT NULL,
    contract_end TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The `lock_status` field in the heartbeat response comes from the client — RajAPI should store the last reported `amc_expiry` per gateway to make this query possible.

### Estimated Size
300px × 200px — 3 stat cards (Active / Expiring / Expired) + expiring list. Color-coded: green (active), amber (expiring ≤30 days), red (expired).

---

## Section 12: System Health

### Purpose
Show RajAPI server health itself — DB connection status, last migration, uptime, memory usage, connected gateways in last 5min, request throughput.

### Data Source
Server metrics collected internally — no DB for this. Could be in-memory counters or a new `server_metrics` table.

### React Component Name
`SystemHealthPanel`

### API Endpoint Needed
```
GET /api/v1/health/full
Response:
{
  "server_uptime_seconds": 123456,
  "database_status": "connected",
  "database_pool_size": 10,
  "database_pool_active": 2,
  "active_gateways_5min": 18,
  "total_gateways": 24,
  "requests_last_hour": 3420,
  "last_migration": "20260704000001_add_auth.sql",
  "version": "3.0.0",
  "cpu_usage": 23.5,
  "memory_usage_mb": 42.1
}
```

### Backend Model Needed
New `SystemHealth` struct. Data sourced from:
- `pg_stat_activity` for DB pool
- In-memory `START_TIME` constant for uptime
- Request counter middleware for requests/hour
- `sysinfo` crate or `/proc/self/status` for CPU/memory

### Estimated Size
400px × 200px — grid of small stat tiles with green/red status indicators. 2×4 grid.

---

## Section 13: Notification Center

### Purpose
Central feed of system-generated alerts: gateways going offline, AMC expiring, software updates available, disk thresholds crossed. This is the fleet operator's attention hub.

### Data Source
New `notifications` table. Populated by background checks (cron job or triggered on heartbeat):
- When gateway goes offline → insert notification
- When AMC within 30 days of expiry → insert notification
- When disk > 90% → insert notification
- When new software version available → insert notification

### React Component Name
`NotificationCenter`

### API Endpoint Needed
```
GET /api/v1/fleet/notifications?limit=20&unread_only=false
Response:
{
  "total_unread": 5,
  "notifications": [
    {
      "id": 1,
      "type": "gateway_offline",
      "severity": "critical",
      "title": "ULTRON-IND-015 went offline",
      "message": "No heartbeat for 35 minutes. Last seen at 12:00 PM.",
      "gateway_id": "ULTRON-IND-015",
      "is_read": false,
      "created_at": "2026-07-04T12:35:00Z"
    },
    {
      "id": 2,
      "type": "amc_expiring",
      "severity": "warning",
      "title": "AMC expiring: Kamal Mills",
      "message": "AMC expires in 16 days (July 20, 2026).",
      "gateway_id": "ULTRON-IND-009",
      "is_read": false,
      "created_at": "2026-07-04T06:00:00Z"
    }
  ]
}
```

### Backend Model Needed
New `notifications` table:
```sql
CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    type VARCHAR(64) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    gateway_id VARCHAR(64) REFERENCES gateways(gateway_id),
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_unread ON notifications(is_read, created_at DESC);
```

Plus a background worker (or heartbeat-triggered check) to generate notifications.

### Estimated Size
Full-width section, 350px tall — bell icon with unread count badge in header, scrollable feed list below. Each item: severity icon + title + message + relative time + "Mark read" button.

---

## New API Endpoints Summary

| Method | Endpoint | Purpose | Priority |
|---|---|---|---|
| GET | `/api/v1/fleet/summary` | Fleet-wide status counts | P0 |
| GET | `/api/v1/fleet/online` | Online plants list | P0 |
| GET | `/api/v1/fleet/offline` | Offline plants list | P0 |
| GET | `/api/v1/fleet/warning` | Warning plants list | P0 |
| GET | `/api/v1/fleet/critical` | Critical plants list | P0 |
| GET | `/api/v1/fleet/recent-offline` | Offline timeline | P1 |
| GET | `/api/v1/fleet/activity` | Unified activity feed | P1 |
| GET | `/api/v1/fleet/broadcasts/active` | Active broadcast status | P1 |
| GET | `/api/v1/fleet/versions` | Software version distribution | P1 |
| GET | `/api/v1/fleet/licenses` | License summary | P2 |
| GET | `/api/v1/fleet/amc` | AMC summary | P2 |
| GET | `/api/v1/health/full` | System health detail | P2 |
| GET | `/api/v1/fleet/notifications` | Notification center | P2 |
| PATCH | `/api/v1/fleet/notifications/{id}` | Mark notification read | P2 |
| PATCH | `/api/v1/fleet/notifications/read-all` | Mark all read | P2 |

Route group pattern: All fleet endpoints under `/api/v1/fleet/*` with a common `AuthUser` guard.

---

## New Backend Models Summary

| Model | Table | Fields | Priority |
|---|---|---|---|
| `FleetSummary` | — (aggregation) | total, online, offline, warning, critical, last_updated | P0 |
| `FleetGatewaySummary` | — (query) | gateway_id, plant_name, location, last_heartbeat, version, status | P0 |
| `FleetWarningGateway` | — (query) | extends FleetGatewaySummary + cpu/ram/disk, warning_reason | P0 |
| `FleetCriticalGateway` | — (query) | extends FleetGatewaySummary + critical_reason | P0 |
| `OfflineEvent` | — (query) | gateway_id, plant_name, went_offline_at, was_online_for | P1 |
| `ActivityEvent` | — (UNION query) | type, gateway_id, message, timestamp, severity | P1 |
| `ActiveBroadcastSummary` | — (query) | id, message, severity, target_count, time_remaining | P1 |
| `VersionDistribution` | — (aggregation) | version, count, percentage | P1 |
| `License` | `licenses` (new) | id, gateway_id, license_key, issued_at, expires_at, is_active | P2 |
| `Amc` | `amc` (new) | id, gateway_id, contract_start, contract_end, status, notes | P2 |
| `SystemHealth` | — (in-memory) | uptime, db_status, pool_size, requests_per_hour, cpu, memory | P2 |
| `Notification` | `notifications` (new) | id, type, severity, title, message, gateway_id, is_read, created_at | P2 |

---

## Layout Implementation Notes

### Grid Configuration
```
Desktop (≥1200px):    3-column layout   [fleet-bar: full width]
Tablet (768-1199px):  2-column layout   [fleet-bar: full width]
Mobile (<768px):       1-column layout   [fleet-bar: stacked cards]
```

### Section Placement Strategy
```
Row 1: FleetStatusBar (full width, sticky top below nav)
Row 2: OnlinePlants | OfflinePlants | SysHealth
Row 3: WarningPlants | CriticalPlants | LatestOffline
Row 4: RecentActivityFeed (full width)
Row 5: VersionDist    | BroadcastStatus | LicenseSummary
Row 6: AMCSummary     | NotificationCenter (spans 2 cols — tall)
```

### Interaction Pattern
- Every plant card/row is clickable → opens Gateway Detail panel (right slide-in or modal)
- "See all →" links navigate to the full Gateways view filtered by that state
- Notification bell in global nav shows unread count; clicking opens a dropdown overlay
- Auto-refresh period: 30 seconds (fleet data changes less frequently than live telemetry)
