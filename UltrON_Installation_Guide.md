# UltrON Industrial Monitoring Platform — Installation Guide

## Overview

UltrON runs on a single Windows PC. All setup — stations, devices, parameters, SPCB push, RajAPI sync, license — is done through the web UI after launching the EXE. No separate server or Master PC needed.

---

## Prerequisites

- Windows 10/11 (x64)
- Admin rights (for LED board port 80 or RS485 serial, optional)
- Internet connection (first-time license activation + RajAPI sync)

---

## Part 1 — Install & Launch

### 1.1 Get UltrON.exe

Get the EXE from your admin or download from the release link. Place it anywhere (e.g. `C:\UltrON\UltrON.exe`).

### 1.2 Run

1. Double-click `UltrON.exe`
2. Terminal window opens — backend starts on `http://localhost:8000`
3. Browser opens automatically after a few seconds
4. Login as **Master** (password provided by admin)

### 1.3 Verify it works

- **Dashboard** — shows live telemetry once devices are configured
- **Settings → Logs** — polling status, no errors
- **Devices & Config** — device online, parameters reading

---

## Part 2 — Configuration

Do these steps in the web UI after logging in as **Master**.

### 2.1 Create Station

1. Go to **Devices & Config** → **Stations** tab
2. Click **Add Station**
3. Enter:
   - **Station Name** — your site name (e.g. "KTPP Plant")
   - **Station Code** — short code for CPCB
4. Click **Save**

### 2.2 Add Device

1. Go to **Devices** tab → **Add Device**
2. Choose connection type:
   - **Modbus TCP**: IP address, port (default 502), slave ID
   - **Modbus RTU (serial)**: COM port, baud rate, slave ID
   - **CSV file**: file path, delimiter, refresh interval
3. Click **Test Connection** to verify device is reachable
4. Click **Save**

### 2.3 Add Parameters

1. Select the device → **Add Parameter**
2. For each measurement:
   - **Tag Name** — unique ID (e.g. `CO`, `SO2`, `PM10`)
   - **Register Address** — Modbus register or CSV column
   - **Data Type** — `int16`, `float32`, `uint16`, etc.
   - **Scale Factor / Offset** — raw value conversion
   - **Unit** — `ppm`, `ppb`, `ug/m3`, `degC`, etc.
   - **Min/Max Valid** — range for quality check
   - **Alarm High/Low** — alert thresholds
3. Click **Test Read** to verify the parameter reads correctly
4. Click **Save**

### 2.4 Configure SPCB Push

1. Go to **Settings** → **CPCB** tab → **SPCB server** section
2. Click **Add SPCB Server**
3. Enter:
   - **Name** — e.g. "GPCB Gujarat"
   - **Live URL** — SPCB push endpoint
   - **Delay URL** — SPCB delay endpoint (15 min retry)
4. Toggle server ON
5. In the mapping table below, map each parameter to a **CPCB Parameter** from the dropdown
6. Fill **API ID / Name / Password / vName** as provided by the PCB board
7. Click **Save**
8. Click **Test Live** / **Test Delay** to confirm push works

### 2.5 Configure CPCB TXT Export

1. In **Settings → CPCB** tab → **CPCB TXT File Generation** section
2. Click **Add Config** for your station
3. Set **Export Path** — folder for output files (e.g. `C:\UltrON\CPCB_Data`)
4. Set **Retention Count** (default 97 files)
5. Enable toggle
6. Files auto-generate every 15 minutes in Annexure-I format

### 2.6 Configure LED Board (optional)

1. In **Settings → CPCB** tab → **LED Board** tab
2. Add LED server config, map parameters to channels
3. Card URL: `http://<PC-LAN-IP>/api/v1/led?auth=username&PCB=1,2,3`
4. Run EXE as **Administrator** if LED port 80 binding fails

### 2.7 Activate License

1. Go to **Settings → License** tab
2. Get AMC token from RajAPI admin
3. Paste token → **Test & Activate**
4. License activates `CENTRAL_API_KEY` — enables RajAPI sync

---

## Part 3 — RajAPI Sync (Central Server)

UltrON communicates with **RajAPI** (`rajapi.com`) — the central admin panel to manage all client sites.

### 3.1 What syncs

| Interval | Data | Direction |
|----------|------|-----------|
| **60s** | Heartbeat (station name, device count, online/offline status, telemetry snapshot) | This PC → RajAPI |
| **60s** | Remote commands (restart polling, factory reset, config update) | RajAPI → This PC |
| **60s (live)** | SPCB telemetry push (latest 1-min values per mapped parameter) | This PC → PCB URL |
| **900s (delay)** | SPCB delayed push (backlog retry for failed live pushes) | This PC → PCB URL |
| **15 min** | CPCB TXT file generation (15-min averaged values, Annexure-I format) | This PC → Local file |
| **On license verify** | `CENTRAL_API_KEY` assignment (auth token for all RajAPI requests) | RajAPI → This PC |

### 3.2 Auth flow

```
License activation → RajAPI returns CENTRAL_API_KEY
                         ↓
Heartbeat sends {gateway_id, device_secret, CENTRAL_API_KEY}
                         ↓
RajAPI validates → returns commands + sync acknowledgment
```

Auth methods checked in order:
1. `CENTRAL_API_KEY` — set by license activation (primary)
2. `GATEWAY_ID` + `DEVICE_SECRET` — from `.env` (secondary)
3. `RAJAPI_API_KEY` + `STATION_ID` — legacy (fallback)

### 3.3 Remote commands from RajAPI

RajAPI can send these commands via heartbeat response:

| Command | Action |
|---------|--------|
| `restart_polling` | Restarts the Modbus/CSV polling engine |
| `restart_app` | Restarts the entire UltrON application |
| `factory_reset` | Clears all data and re-runs first-time setup |
| `update_config` | Pulls latest config from central server |
| `reboot_pc` | Reboots this PC |

### 3.4 Monitoring on RajAPI

RajAPI dashboard shows for this PC:
- **Online/Offline** status (based on heartbeat recency)
- **Last seen** timestamp
- **Device count** and **parameter count**
- **AMC expiry** date
- **App version** (from UltrON EXE)
- **Recent SPCB push** status

### 3.5 Troubleshooting sync

| Problem | Fix |
|---------|------|
| Heartbeat 401 | License expired or CENTRAL_API_KEY invalid. Reactivate license. |
| Heartbeat not reaching RajAPI | Check internet. RajAPI sync enabled in Settings. |
| Remote command not executing | This PC must be online. Command delivered on next 60s heartbeat. |
| SPCB push failing | Test from CPCB → Test Live. Check URL and PCB credentials. |
| CPCB TXT not generating | Verify Export Enabled + Export Path is writable. |

---

## Part 4 — Features Summary

| Feature | Where | How |
|---------|-------|-----|
| **Live telemetry** | Dashboard | WebSocket push every 5s |
| **Polling** | Background | 5s cycle per device, dedup to 1-min storage |
| **Trends** | Trends screen | Historical chart with resolution selector |
| **Reports** | Reports screen | Normal (raw) + Average reports, PDF/CSV export |
| **Alarms** | Alarms screen | Configurable high/low thresholds, auto-trigger |
| **CPCB TXT** | Background | 15-min averaged file in Annexure-I format |
| **SPCB push** | Background | JSON POST to PCB URL, live (60s) + delay (900s) |
| **LED board** | Port 80 | HTTP GET with channel values |
| **Calibration** | Calibration screen | Multi-phase jobs with control charts |
| **Broadcasts** | Dashboard | Marquee + popup from RajAPI |
| **RajAPI sync** | Background | Heartbeat + commands every 60s |
| **Live Trends** | Dashboard modal | Real-time chart with 20-point sliding window |
| **System logs** | Settings → Logs | All engine events, push status, errors |

---

## Part 5 — Changing Configuration Later

When stations, devices, or mappings need to change:

1. Stop UltrON (close the window)
2. Get the latest `UltrON.exe` from your admin (contains updated config)
3. Replace the old EXE with the new one
4. Restart UltrON — your data (telemetry, logs, alarms) is preserved in `ultron.db` next to the EXE

Or if you have access to the admin panel on `rajapi.com`, Neeraj can push config changes remotely.

---

## Appendix — Hardware Setup

### RS485 / Modbus RTU (serial)

1. Connect USB-to-RS485 converter to this PC
2. Note COM port number from Device Manager
3. In UltrON UI: Devices → select device → set port (e.g. `COM3`), baud rate, slave ID
4. Restart polling or restart UltrON

### Modbus TCP (Ethernet)

1. Ensure this PC can reach the Modbus device over LAN
2. In UltrON UI: Devices → select device → set IP, port (default 502), slave ID
3. Restart polling or restart UltrON

### LED Board

Run EXE as Administrator if LED server on port 80 is needed:
```
http://<PC-LAN-IP>/api/v1/led?auth=username&PCB=1,2,3
```

---

## Appendix — Firewall / Network

UltrON listens on:
- **Port 8000** — main API + UI (browser access from LAN)
- **Port 80** — LED board endpoint (optional, admin rights required)
- **Modbus ports** — as configured per device (default 502 TCP)

Open Windows Firewall if LAN access to the UI is needed.

---

## Appendix — Updating

1. Stop UltrON (close window)
2. Replace `UltrON.exe` with new version
3. Restart

The EXE auto-generates `secret.key` and `ultron.db` on first run if missing. On subsequent runs it uses the existing files — your data (historical telemetry, alarms, logs) persists across updates.

---

## Appendix — Troubleshooting

| Problem | Fix |
|---|---|
| EXE won't start | Check `ultron_log.txt` next to EXE. Common: port 8000 in use. |
| No telemetry data | Check device connection (serial/IP). Verify polling is active in Logs. |
| Login fails | Default: Master / password set during config. Reset by deleting `ultron.db`. |
| LED board not working | Run as Administrator. |
| RS485 not working | Run as Administrator. Check COM port in Device Manager. |
| SPCB push failing | Test push from CPCB screen. Check live/delay URLs. |
| AMC token expired | Contact Sunshine Technologies for renewal. |
| Config lost after update | Never delete `ultron.db` next to EXE — that file is your live data. Only the bundled DB inside the EXE is replaced. |

---

## Contact

**Sunshine Technologies**
- Support: 7659091468, 9133377852, 853
- Sales: 8801231166, 9133377852
- Web: https://sunshinetechno.com/
