# 🚀 UltrON & RajAPI System Master Specification (`Ultron_in_rajapi.md`)

## 1. Product Overview & Architecture Matrix

UltrON is Sunshine Technologies' Industrial IoT platform for real-time telemetry, CPCB/SPCB compliance, and remote plant control.

```
┌───────────────────────────────────────────────────────────┐
│               CLIENT PLANT PC (UltrON)                   │
│ - Tech: Python/FastAPI Backend + React/Vite Frontend      │
│ - Storage: Embedded SQLite (WAL Mode + Backoff/Semaphores) │
│ - Network: Outbound HTTPS (Port 443) to rajapi.com        │
└─────────────────────────────┬─────────────────────────────┘
                              │ (Live Sync Payload)
                              ▼
┌───────────────────────────────────────────────────────────┐
│              CENTRAL ADMIN SERVER (RajAPI)                │
│ - Public Domain: https://rajapi.com (Cloudflare Tunnel)   │
│ - Hardware: Raspberry Pi 3 (64-bit OS Lite, 64GB SD Card) │
│ - Engine: Nginx (Port 80) ➔ Uvicorn (Port 8081)           │
│ - Storage: PostgreSQL 15 Alpine in Docker (ultron_central)│
│ - Timezone: Asia/Kolkata (IST, +05:30)                    │
└───────────────────────────────────────────────────────────┘
```

---

## 2. Station-Level Telemetry Mapping
- **Hierarchy:** $\text{Parameter} \longrightarrow \text{Device} \longrightarrow \text{Station} \longrightarrow \text{Station Name (e.g. "AAQMS 2")}$
- **Payload Transmission:** `server_push.py` extracts `station_name` via ORM relationship and transmits `"station_name": "AAQMS 2"` for every live and delayed telemetry point.
- **RajAPI UI Rendering:** Expandable Station Accordions under `STATIONS`. Clicking a station (`AAQMS 2`) expands its associated parameters table (`PM2_5`, `PM10`, `SO2`, `NOX`) with embedded Site Key.

---

## 3. Timezone Standard (Indian Standard Time - IST +05:30)
- **Database Layer:** PostgreSQL database `ultron_central` & user `ultron_admin` configured to `Asia/Kolkata`.
- **Frontend Layer:** `parseUTCDate()` parses ISO timestamps (`19:53 UTC`) and `formatIST()` converts to 24-hour Indian Standard Time:
  $$\mathbf{\text{DD/MM/YYYY HH:MM \quad (e.g. 21/07/2026 19:53 UTC } \longrightarrow \text{ 22/07/2026 01:23 IST)}}$$

---

## 4. Data Capacity & Storage Lifespan (64 GB SD Card)
For **7 Industries $\times$ 2 Stations $\times$ 4 Parameters = 56 Raw 1-Minute Parameters**:

| Scope | Raw 1-Minute Live Data Volume | 64 GB Storage Lifespan |
|---|---|---|
| **1 Industry** (8 Params @ 1-min) | **~0.25 GB / Year** | **`200 YEARS`** |
| **All 7 Industries** (56 Params @ 1-min) | **~1.75 GB / Year** | **`28 YEARS`** |

- **Pi 3 Performance:** Writing 56 rows per minute takes **< 0.05 seconds** of CPU time (< 2% CPU load).

---

## 5. Zero-Touch Client Onboarding Vision (Smart Prefilled Installer)
To replace manual API key typing during plant setup:
1. **1-Click Download from `rajapi.com`:**
   Selecting a station generates a pre-configured installer download:
   $$\text{\texttt{UltrON\_Setup\_IN\_UltronSST\_26\_BegerPaints\_AAQMS2.exe}}$$
2. **Smart Filename Prefilling:**
   Upon launch, `UltrON.exe` reads its own filename, extracts the embedded Site Key, contacts `rajapi.com`, downloads plant parameters, and initializes local setup with **zero manual typing**.
3. **Hardware ID Binding:**
   On first boot, the client registers its **Windows Machine GUID / MAC Address**. Copy-pasting the `.exe` to an unapproved 3rd PC triggers an unauthorized alert and blocks sync.

---

## 6. Multi-Location High Availability (Primary + Secondary Redundancy)
- **Primary Server (Pi #1):** Located in Room (`https://rajapi.com`)
- **Secondary Server (Pi #2):** Located in Office (`https://backup.rajapi.com`)
- **Dual-Push Mode:** Client PCs send telemetry to both primary and secondary URLs simultaneously. If one room/office loses power or internet, the secondary location continues receiving data with zero downtime.

---

## 7. Remote Security, Licensing & Firewall Compliance
- **Remote Kill-Switch:** 1-Click **🔒 Lock Site** / **🔒 Lock Station** from `rajapi.com` freezes client Modbus polling & telemetry instantly.
- **AMC Expiry Lock:** Automatic locking upon AMC contract expiration.
- **Firewall Passage:** Outbound HTTPS (Port 443) only. Zero inbound open ports required at client plants.

---

## 8. Version Management & Remote OTA Engine (`v1.0.71` ➔ `v1.0.72`)
- **Fleet Version Tracking:** Every client heartbeat reports `"version": settings.APP_VERSION` to `rajapi.com`. The Fleet Dashboard displays real-time version badges (`v1.0.69`, `v1.0.71`, `v1.0.72`) per plant site.
- **Remote OTA Push:** New releases (`UltrON_v1.0.72.exe`) are uploaded to `rajapi.com`. Admin clicks **"Push OTA Update"** to send silent background update commands to target plant PCs.
- **Silent Update Protocol:** Client downloads the release into `/updates/`, verifies SHA-256 integrity hash, swaps the binary cleanly, restarts `UltrON.exe`, and reports the new version string on its next heartbeat.
- **Backward Compatibility:** RajAPI server endpoints maintain backward compatibility across version generations.

---

## 9. Broadcasts, AMC Alerts & CPCB/SPCB Remote Toggles
- **Target Selection:** Every broadcast and command can target **All Plants Globally** (`target_all=True`) or a **Specific Plant Site** (`target_site_id`).
- **AMC Expiry Alerts:** When AMC expiration approaches (e.g. 15 days left), RajAPI automatically issues an AMC warning toast to that plant site's client screen.
- **Remote CPCB & SPCB Push Control:** Admin toggle switch on `rajapi.com` sends `enable_cpcb` or `disable_cpcb` commands to pause or resume CPCB/SPCB data transmission for all or specific plants.
- **Custom System Announcements:** Supports `info`, `warning`, `error`, and `urgent` severity floating toasts for maintenance notices.


