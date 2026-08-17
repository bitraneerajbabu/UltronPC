# UltrON — Application Flow & User Journeys

---

## 1. Navigation Map

### 1.1 Client Frontend (Plant PC)

```
Login Screen
    │
    ▼
┌──────────────────────────────────────────────────────────────────┐
│  APP SHELL (persistent chrome)                                    │
│  ┌──────────────┬─────────────────────────────────┬────────────┐ │
│  │ Nav Rail     │ Top Bar (clock, plant name,      │ ┐          │
│  │ (left)       │ user role, logo/logout)          │ │          │
│  │              ├─────────────────────────────────┤ │          │
│  │  Dashboard   │                                 │ │          │
│  │  Devices     │   CONTENT AREA                  │ ├ Screen   │
│  │  Trends      │   (active screen component)     │ │          │
│  │  Reports     │                                 │ │          │
│  │  Logs       │                                 │ │          │
│  │  Settings    │                                 │ │          │
│  │  Users      │                                 │ │          │
│  │  CPCB       │                                 │ │          │
│  │  Calibration │                                 │ │          │
│  │  Contact     │                                 │ ┘          │
│  │              ├─────────────────────────────────┤            │
│  │  username    │ Footer (copyright + marquee)     │            │
│  └──────────────┴─────────────────────────────────┴────────────┘
│                                                                  │
│  Global Toast Container (overlay, top-right)                     │
│  AlarmsInspectorModal (overlay, triggered by alarm count)        │
└──────────────────────────────────────────────────────────────────┘
```

**Role-based Access:**
- **admin** sees all 10 nav items
- **client** sees: Dashboard, Trends, Reports, Contact (4 items)
- Client role is forcibly redirected to Dashboard if they navigate directly to admin URL

### 1.2 Server Frontend (RajAPI — Admin Dashboard)

```
Login Screen
    │
    ▼
┌───────────────────────────────────────────────────────────────┐
│  APP SHELL                                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Tab Bar: Dashboard | Broadcasts | Commands | Telemetry │  │
│  │           AMC | CPCB | Audit Logs | Notifications       │  │
│  ├─────────────────────────────────────────────────────────┤  │
│  │  Content Area (active tab)                                │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. User Journeys

### 2.1 First-Time Setup (Plant Engineer)

```
1. Install UltrON on Windows PC
       │
2. Open browser → http://localhost:8000
       │
3. Login screen appears
       │
4. Enter default credentials (admin/admin123)
       │
5. Dashboard loads — empty state (0 stations, 0 devices)
       │
6. Navigate to Settings → Plant Info
       │  Set plant name, address, upload logo
       │
7. Navigate to Devices
       │
8. Create Station: "Main Stack AAQMS"
       │  Set station type, location
       │
9. Create Device under station:
   ┌─── Choose protocol (Modbus TCP / RTU / TCP Custom / UDP / CSV)
   ├─── Set connection params (host:port / COM port / file path)
   └─── Set poll interval, timeout, retries
       │
10. Add Parameters under device:
   ┌─── Set tag_name, name, unit
   ├─── Set register mapping (address, count, data type, byte order)
   ├─── Set scale factor, offset
   ├─── Set valid range (min/max)
   └─── Set alarm thresholds (high_high, high, low, low_low)
       │
11. Test connection: click device → "Test Connection" button
       │  Verify green checkmark
       │
12. Test parameter read: click parameter → "Test Read" button
       │  Verify value appears
       │
13. Navigate to CPCB → Server Config
       │  Configure TGPCB live/delay URLs
       │
14. Navigate to CPCB → Station Config
       │  Set export path, retention count, timezone
       │
15. Navigate to CPCB → Mappings
       │  Map internal parameters to CPCB standard names
       │
16. Setup complete → Dashboard shows live data
```

### 2.2 Daily Monitoring (Plant Engineer)

```
1. Open browser → http://localhost:8000
       │
2. Login (or auto-login if token stored)
       │
3. Dashboard loads:
   ┌─── KPI cards: total stations, online/offline devices, active alarms
   ├─── Sparklines for key parameters (optional)
   ├─── Station/device health indicators
   └─── Active broadcasts banner (scrolling marquee in footer)
       │
4. (Optional) Click on alarm count → AlarmsInspectorModal opens
   ┌─── View active alarms
   ├─── Acknowledge alarms
   └─── View comms/devices failures tab
       │
5. Switch to Trends → select parameter → view Chart.js chart
   ┌─── Configure date range
   ├─── Select averaging window
   └─── Export CSV
       │
6. Switch to Logs → filter by type/level/date
       │
7. (Admin only) Switch to Users → manage accounts
       │
8. (Admin only) Switch to Settings → DB maintenance if needed
       │
9. Leave browser open — live data updates via WebSocket
```

### 2.3 CPCB Export Verification (Plant Engineer)

```
1. Navigate to CPCB screen
       │
2. View active exports section
       │
3. Check "Export Logs" tab:
   ┌─── Last export time
   ├─── Records written per station
   └─── Status (success/failure) + any error messages
       │
4. (If needed) Click "Compute Averages" to trigger immediate 15-min calc
       │
5. (If needed) Click "Export Now" to trigger immediate CSV write
       │
6. (If needed) Use Backfill for date range to regenerate past records
       │
7. Verify CSV files exist at export_path on the local filesystem
```

### 2.4 Alarm Management (Plant Engineer → Fleet Operator)

```
Plant Engineer (Client):
       │
1. Dashboard shows active alarm count incrementing
       │
2. Click alarm count → AlarmsInspectorModal opens
       │
3. Review each alarm:
   ┌─── Parameter name, current value, threshold
   ├─── Severity (info/warning/critical/emergency)
   └─── Timestamp
       │
4. Select alarms → click "Acknowledge Selected"
       │
5. Alarm moves to acknowledged state → still visible but muted
       │
6. Wait for value to return to normal → alarm auto-clears
       │
       │

Fleet Operator (RajAPI Server):
       │
1. Open RajAPI dashboard → Notifications tab
       │
2. View cross-site alarm list
       │
3. Click on alarm → see site, parameter, value, quality
       │
4. Remote acknowledge if needed
```

### 2.5 Calibration Workflow (Plant Engineer)

```
1. Navigate to Calibration screen
       │
2. Select station + parameter + calibration type (zero/span/full)
       │
3. Start job
       │
4. Monitor job status: pending → running → completed
       │
5. View results for each phase:
   ┌─── Min, max, avg, std_dev
   ├─── Raw readings (expandable JSON)
   └─── Duration
       │
6. Approve or reject:
   ┌─── Add comments
   └─── Decision recorded with username + timestamp
       │
7. Calibration job flagged in CPCB export records (calibration_flag field)
```

### 2.6 Remote Fleet Management (Fleet Operator/Admin — RajAPI)

```
1. Open RajAPI → Dashboard
       │
2. View all sites table: total/online/offline, last sync, version
       │
3. Click a site → detail panel:
   ┌─── Live telemetry (latest values)
   ├─── Device status per site
   └─── AMC expiry date
       │
4. Site actions:
   ├─── Send Broadcast → Create message, set severity, schedule
   ├─── Remote Command → Restart Polling / Reboot PC / Factory Reset
   ├─── Lock/Unlock → Reason tracking, stops CPCB pushes
   ├─── OTA Deploy → Select version → Deploy to site
   └─── Renew AMC → Extend expiry date
       │
5. Switch to CPCB tab → view compliance status per site
       │
6. Switch to Audit Logs → U/O/E/N quality breakdown
```

### 2.7 OTA Update Flow

```
RajAPI Admin:
       │
1. Navigate to OTA → Software Versions
       │
2. Register new version: version number, description, upload EXE
       │
3. Navigate to Deployments
       │
4. Select target site + version → Create Deployment
       │
5. Deployment status: pending → in_progress (when client syncs)
       │
       │

Client (automatic via heartbeat):
       │
6. Client sends heartbeat to RajAPI (60s)
       │
7. Response includes ota_deployment if one exists
       │
8. Client downloads new EXE → saves locally
       │
9. Client reports: status=success, progress=100%
       │
10. On next restart, user runs updated EXE manually
```

---

## 3. State Management (Client Frontend)

### 3.1 AppContext Global State

```
┌─────────────────────────────────────────────────────────────┐
│  AppContext (React.createContext)                             │
├─────────────────────────────────────────────────────────────┤
│  DATA:                                                       │
│  ├── stations[]    — List of Station objects                 │
│  ├── devices[]     — List of Device objects (keyed to sta)  │
│  ├── parameters[]  — List of Parameter objects (keyed to dv)│
│  ├── logs[]        — System logs (paginated)                 │
│  ├── liveData{}    — Map: parameter_id → { value, quality } │
│  ├── kpis          — { totalStations, onlineDevices,         │
│  │                     offlineDevices, activeAlarms }        │
│  ├── broadcasts[]  — Active broadcast messages               │
│  └── amcExpiry     — AMC expiry string or null               │
│                                                              │
│  AUTH:                                                       │
│  ├── currentUser   — Username string or null                 │
│  ├── currentUserRole — 'admin' or 'client'                   │
│  └── authToken     — JWT string or null                      │
│                                                              │
│  NAV:                                                        │
│  ├── activeScreen  — Current screen key                      │
│  ├── loading       — Boolean (data fetching)                 │
│  └── hasLoadedOnce — First load complete                     │
│                                                              │
│  PLANT:                                                      │
│  ├── plantName     — From localStorage/settings              │
│  ├── plantAddress  — From localStorage/settings              │
│  └── plantLogo     — Base64 image string                     │
│                                                              │
│  REFS:                                                       │
│  ├── wsRef          — WebSocket connection ref               │
│  ├── wsReconnectTimerRef — Reconnection timer ref            │
│  ├── wsKpiLastFetch — Last KPI fetch timestamp               │
│  ├── wsIsClosing    — Prevent reconnect during logout        │
│  └── parametersRef — Snapshot for WebSocket handler          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Data Loading Sequence

```
App Mount
    │
    ├── Read token from localStorage
    │
    ├── POST /auth/me (validate token)
    │   ├── 200 → loadAllData()
    │   └── 401 → clear credentials, show login
    │
    └── connectWebSocket()
        ├── WS connected → live data stream starts
        └── WS closed → reconnect after 5s (unless logging out)

loadAllData():
    ├── Parallel fetch:
    │   ├── GET /settings/plant
    │   ├── GET /stations
    │   ├── GET /devices
    │   ├── GET /parameters
    │   └── GET /logs?limit=50
    │
    ├── Then:
    │   ├── fetchLatestTelemetryAndKpis()
    │   └── fetch broadcasts + license
    │
    └── set hasLoadedOnce = true
```

---

## 4. Error & Edge Case Flows

### 4.1 Connection Lost (Client → RajAPI)

```
RajAPI heartbeat fails (timeout or 5xx)
       │
       ├── Client retries on next 60s cycle
       ├── Local operations continue uninterrupted
       ├── CPCB exports still write to local filesystem
       ├── TGPCB pushes fail → queued in PendingUpload
       └── "Server unreachable" logged to SystemLog
```

### 4.2 Device Goes Offline

```
Polling engine: device timeout or connection error
       │
       ├── Device.status → "offline"
       ├── Parameter quality → "E" (comms_fail)
       ├── Alarm created if alarm_enabled
       ├── LiveData timestamp stops updating
       ├── Dashboard shows red indicator
       └── SystemLog entry logged
```

### 4.3 No Internet (Client)

```
All external operations degraded:
       ├── RajAPI heartbeat fails → skips, retries next cycle
       ├── TGPCB pushes fail → added to PendingUpload queue
       ├── CPCB file exports still work (local only)
       ├── License verification fails → uses cached status
       └── "No Internet Connection" in Settings → Network Test
```

### 4.4 Factory Reset (Admin)

```
Settings → Factory Reset
       │
       ├── Double confirmation dialog
       │
       ├── Drop all tables
       ├── Reinitialize database
       ├── Clear localStorage
       ├── Clear secret.key
       └── Redirect to login screen
       │
       NOTE: Does NOT delete CPCB export files on disk
```
