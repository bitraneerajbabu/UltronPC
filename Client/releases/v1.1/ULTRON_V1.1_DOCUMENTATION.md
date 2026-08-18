# UltrON™ Industrial IoT & Compliance Platform — v1.1
**Official System Architecture, Compliance Specification & Operating Manual**

> **Publisher & Copyright:** © 2026 [Sunshine Technologies](https://www.sunshinetechno.com/). All rights reserved.  
> **Lead Developer & Product Owner:** Neeraj  
> **Support:** +91-7659091468, +91-9133377852 | **Sales:** +91-8801231166, +91-9133377854  
> **Official Release Version:** `v1.1` (`1.1.0`)

---

## 1. Executive Summary

**UltrON™ v1.1** is a high-availability Industrial Internet of Things (IIoT) edge platform designed for real-time telemetry acquisition, environmental compliance monitoring (CPCB / SPCB), regulatory reporting, and hardware automation. 

Deployed on plant-side edge computers (Windows PCs and industrial dataloggers), UltrON interfaces directly with stack analyzers, AAQMS stations, PLCs, and gas chromatographs, processing telemetry locally while synchronizing with central regulatory servers and the **RajAPI** fleet management cloud.

---

## 2. System Architecture

```
                                  ┌───────────────────────────────┐
                                  │   RajAPI Central Cloud        │
                                  │   (rajapi.com Fleet Sync)     │
                                  └──────────────▲────────────────┘
                                                 │ HTTPS Heartbeat / Sync
┌────────────────────────────────────────────────▼────────────────────────────────┐
│  UltrON Edge Station (Plant Computer)                                           │
│                                                                                 │
│  ┌─────────────────────────┐         ┌───────────────────────────────────────┐  │
│  │   React / Vite Web UI   │◄───────►│       FastAPI Async Core Engine       │  │
│  │  (Modern Dark Theme)    │ WebSock │  • Polling Loop (5s deterministic)    │  │
│  │  • Real-time Dashboards │  / REST │  • Data Quality & Alarm High Lock     │  │
│  │  • Trends (PDF/PNG)     │         │  • 15-Min CPCB Averaging Scheduler    │  │
│  │  • Multi-Station Reports│         │  • Universal DB Auto-Migration Engine │  │
│  └─────────────────────────┘         └───────────────────▲───────────────────┘  │
│                                                          │                      │
│                                      ┌───────────────────▼───────────────────┐  │
│                                      │ SQLite Engine (WAL Mode)              │  │
│                                      │ • ultron.db + Auto Pre-Update Backups │  │
│                                      │ • historical_data, averages, logs     │  │
│                                      └───────────────────▲───────────────────┘  │
└──────────────────────────────────────────────────────────┼──────────────────────┘
                                                           │
               ┌───────────────────────────────────────────┴───────────────────────────────────────────┐
               ▼                                           ▼                                           ▼
┌─────────────────────────────┐             ┌─────────────────────────────┐             ┌─────────────────────────────┐
│  Modbus TCP / RTU (RS-485)  │             │   TCP Sockets / CSV Ingest  │             │  State Board & Cloud Pushes │
│  • 8-N-1, 8-E-1, 8-O-1      │             │  • Custom Hex ASCII Prompts │             │  • CPCB Annexure-I TXT      │
│  • 1200 to 921600 Baud      │             │  • Continuous Folder Watch  │             │  • APPCB AES-128 Encryption │
│  • Multi-Param Single Slave │             │  • Delimited Telemetry Parse│             │  • SPCB / TNPCB / TGPCB     │
└─────────────────────────────┘             └─────────────────────────────┘             └─────────────────────────────┘
```

---

## 3. Key Core Features in v1.1

### 3.1. CPCB Annexure-I 15-Minute Averaged TXT File Engine
* **Automatic Scheduler**: Evaluates completed 15-minute intervals at `:00`, `:15`, `:30`, and `:45` past every hour.
* **Annexure-I Output Structure**:
  ```csv
  1,2,3,4,5,6,7,8,
  GRASIM INDUSTRIES LIMITED (PHASE-1)_MAHAJANAMBAKKAM_1_EMERGENCY ASSEMBLE AREA,PM10,01-08-2026 09:15,01-08-2026 09:30,62.51,0,0,0
  GRASIM INDUSTRIES LIMITED (PHASE-1)_MAHAJANAMBAKKAM_1_EMERGENCY ASSEMBLE AREA,PM2.5,01-08-2026 09:15,01-08-2026 09:30,0.00,0,0,0
  GRASIM INDUSTRIES LIMITED (PHASE-1)_MAHAJANAMBAKKAM_1_EMERGENCY ASSEMBLE AREA,SO2,01-08-2026 09:15,01-08-2026 09:30,76.34,0,0,0
  GRASIM INDUSTRIES LIMITED (PHASE-1)_MAHAJANAMBAKKAM_1_EMERGENCY ASSEMBLE AREA,NOx,01-08-2026 09:15,01-08-2026 09:30,0.34,0,0,0
  ```
* **Auto-Directory & File Creation**: Automatically creates destination folders (e.g. `C:\CPCB\data.txt`) using `os.makedirs`.
* **Rolling 95-Interval FIFO**: Retains the 24-hour rolling window (up to 95 intervals) and trims older lines automatically.

### 3.2. Warning High Limit Lock (`alarm_high` Clamping)
* If physical sensor readings exceed the configured regulatory threshold (`alarm_high`), telemetry values are clamped to `alarm_high` across:
  * Live KPI Cards & Dashboard Tiles
  * Historian Tables & Trend Charts
  * Shift / Daily / Monthly Reports (PDF, CSV, Excel)
  * Outbound Cloud Pushes (CPCB, APPCB, TNPCB, TGPCB, SPCB, RajAPI)

### 3.3. Strict Offline Quality Exclusion & Zero Fake Data
* Disconnected or offline analyzers receive quality code **`E`** (`NA`).
* Offline parameters are excluded from regulatory pushes without injecting artificial zeros (`0.00`). Genuine physical measurements of `0.00` retain valid quality code **`U`**.

### 3.4. Modbus RTU Framing & Serial Determinism
* **Framing Formats**: Full support for Data Bits (`7`, `8`), Parity (`None`, `Even`, `Odd`), and Stop Bits (`1`, `2`) e.g. `8-N-1`, `8-E-1`, `8-O-1`.
* **Baud Rates**: Flexible range from `1200 bps` to `921600 bps` with custom rate inputs.
* **Deterministic Port Releasing**: Batched multi-parameter reading on single slaves, releases COM port within ~1s and holds in memory for the remainder of the 5-second interval.

### 3.5. Universal Non-Destructive Database Auto-Migration & Automatic Backups
* **Never Overwrite Policy**: Existing plant databases (`ultron.db`) are **never deleted or overwritten** during updates.
* **Pre-Migration Safety Snapshot**: Before any schema modification, an automatic backup is created in `C:\ProgramData\UltrON\backups\ultron_pre_update_TIMESTAMP.db` (retaining the last 5 snapshots).
* **Universal ORM Schema Migrator**: Dynamically checks all models and runs `ALTER TABLE ... ADD COLUMN` for any newly added fields across older databases without data loss.

### 3.6. In-App OTA Software Updates
* Check for updates, download new binaries (`UltrON_new.exe`), and verify cryptographic checksums directly from GitHub Releases (`bitraneerajbabu/UltronPC`) or custom URLs.
* Atomic binary swap upon app restart with zero manual setup required.

### 3.7. Role-Based Access Control
* **`SuperMaster`** (Rank 1 Administrator): Full system control, Server Management, OTA updates, and user access.
* **`Master`** (Rank 2 Administrator): Devices, parameter mapping, calibrations, reports, and logs.
* **`Client`** (Read-Only User): Live Dashboard and Reports view only.

---

## 4. UI Navigation & Screen Overview

| Screen | Primary Capabilities | Export Formats |
| :--- | :--- | :--- |
| **Dashboard** | 5-KPI live health strip, real-time parameter cards, quick actions rail, active alarm ticker. | Live View |
| **Trends** | Interactive multi-range time-series line chart (`1h` to `30d`), normal and average modes. | **PNG, PDF Only** |
| **Reports** | Multi-station ("All Stations") & multi-parameter tabular generator, `1m` to `24h` intervals, offline `"NA"` tagging. | **PDF, Excel, CSV** |
| **Devices** | Stations, Modbus TCP/RTU framing (`8-E-1`, `8-N-1`), serial ASCII prompts, CSV folders, scale factor & offset. | Configuration |
| **Server Mgmt** | SPCB, TNPCB, APPCB (AES-128), CPCB TXT File Generator, and LAN LED Board controls. | Configuration |
| **Calibration** | Sensor zero/span calibration offsets, drift tracking, and audit logging. | Records & Logs |
| **Settings** | Software updates (GitHub OTA), system restart, database health, license validation. | System Admin |

---

## 5. How-To Configuration Guides

### 5.1. Configuring CPCB 15-Minute Flat-File Export
1. Log in as **`SuperMaster`** and navigate to **Server Management** $\rightarrow$ **`CPCB TXT File Generation`**.
2. In **OUTPUT FILE PATH**, enter the target location:
   ```text
   C:\CPCB\data.txt
   ```
3. Set **Status: Enabled (ON)**.
4. In the Parameter Mapping table below:
   * Enter the **CPCB STATION** name *(e.g. `GRASIM INDUSTRIES LIMITED...`)*.
   * Select the **CPCB PARAM** code *(e.g. `PM10`, `PM2.5`, `SO2`, `NOx`)*.
   * Toggle **PUSH** to **ON** for all required parameters.
5. Click **`+ Save`**. UltrON creates the folder and file automatically and starts appending averages every 15 minutes.

### 5.2. Configuring APPCB Push with AES-128 Encryption
1. Open **Server Management** $\rightarrow$ **`APPCB Server`**.
2. Enter the plant's **Site ID**, **Site UID**, **AES-128 Encryption Key**, and **Live URL**.
3. Toggle **Enabled: ON**.
4. Map the corresponding APPCB Unit IDs and Parameter IDs.
5. Click **`+ Save`**.

### 5.3. Updating Software (Git or UI)
* **Via In-App UI**: Go to **Settings** $\rightarrow$ Click **Check for Updates** $\rightarrow$ Click **Download & Update** $\rightarrow$ Restart UltrON.
* **Via Git Terminal**:
  ```powershell
  git pull
  python run.py --no-build
  ```
  *(UltrON automatically backs up the database and migrates all tables on launch).*

---

## 6. Verification & Test Pass Matrix

| Test Suite | Test File | Covered Scope | Pass Rate |
| :--- | :--- | :--- | :---: |
| **Database Migration & Upgrade** | `test_database_upgrade_migration.py` | Legacy DB preservation, dynamic column additions, pre-update backup | **100% (PASSED)** |
| **CPCB 15-Min Pipeline E2E** | `test_cpcb_pipeline_e2e.py` | 15-min averaging, Annexure-I format, FIFO retention, warning limit lock | **100% (PASSED)** |
| **Warning High Limit Lock** | `test_warning_high_lock.py` | Raw telemetry clamping, average capping, cloud push capping | **100% (PASSED)** |
| **Data Integrity & Server Push** | `test_server_push_guard.py` | SPCB, APPCB, TNPCB guards, rate control, FIFO queue caps | **100% (PASSED)** |
| **Offline Push Behavior** | `test_offline_push_behavior.py` | Quality `E` assignment, fake zero exclusion, reconnection retries | **100% (PASSED)** |
| **Report Generation & Math** | `test_report_data.py` | Multi-station aggregation, interval bucketing (`1m` to `24h`), PDF/CSV/Excel | **100% (PASSED)** |
| **Live Practical Verification** | `test_live_practical_verification.py` | End-to-end hardware Modbus polling, WebSocket push, alarm thresholds | **100% (PASSED)** |

---

## 7. Build & Distribution Specs

* **Desktop Executable**: `dist/UltrON.exe` (PyInstaller 64-bit embedded runtime)
* **Windows Installer**: `dist/UltrON_Setup_v1.1.exe` (InnoSetup with `uninsneveruninstall` data protection)
* **Frontend Bundle**: Compiled via Vite 8 into `client/backend/ultron_backend/ui_dist/`
* **Local Backend URL**: `http://localhost:8000/`
* **API Documentation**: `http://localhost:8000/docs` (Swagger UI)
