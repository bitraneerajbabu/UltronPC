# UltrON Industrial Monitoring Platform — Installation Guide

## Prerequisites

- Windows 10/11 (x64)
- Admin rights (for LED board port 80, optional)
- Internet connection (first-time setup)

---

## Installation Steps

### 1. Download the Installer

**Option A — Bootstrapper (recommended)**
Download `UltrON_Installer.exe` from:
```
https://github.com/bitraneerajbabu/UltronPC/releases/tag/v1.0.10
```
Run it — it will:
- Show available versions
- Download the latest `UltrON.exe`
- Install to `%LOCALAPPDATA%\UltrON\`
- Create a desktop shortcut
- Launch the app

**Option B — Direct Download**
Download `UltrON.exe` directly from the same link and place it anywhere.

---

### 2. First Launch

1. Double-click `UltrON.exe` (or the desktop shortcut)
2. A terminal window opens — the backend starts (FastAPI on port 8000)
3. After a few seconds, the UI opens in a native window

**Login Defaults:**
- Username: `Master`
- Password: `Ultron123.0`

---

### 3. AMC / License Setup

On first run, if no AMC token is configured:

1. The app shows **"Access Denied — AMC Token is expired or not configured"**
2. Click the logo 3 times to reveal the override form
3. Enter credentials: Username `token`, Password `Ultron123.0`
4. In the setup screen, paste the AMC Token from rajapi.com
5. Click **Test & Activate**

---

### 4. Station & Device Configuration

1. Login as **Master**
2. Go to **Devices & Config**
3. Create Stations → Add Devices (Modbus TCP/RTU/CSV)
4. Configure Parameters per device
5. Go to **API Mappings** to configure server push

---

### 5. CPCB Export Setup (if required)

1. Go to **CPCB Config**
2. Click **Add Config** for your station
3. Set **Export Path** (e.g. `C:\UltrON\CPCB_Data`)
4. Set **Retention Count** (default 97)
5. Ensure **Export Enabled** is ON
6. Go to **CPCB Mappings** — default 25 mappings are pre-loaded
7. Adjust conversion factors if needed
8. CPCB files auto-generate every 15 min at `{Export Path}\{StationName}.txt`

---

### 6. LED Board Setup (if required)

The LED board HTTP server runs on **port 80** automatically.

**Card URL format:**
```
http://<PC-LAN-IP>/api/v1/led?auth=username&PCB=1,2,3
```
- `auth` = any active UltrON username
- `PCB` = comma-separated channel IDs

> Port 80 requires admin rights. Run UltrON as Administrator if the LED server fails to bind.

---

### 7. Running as Administrator

Some features require admin rights:
- **LED board server** (port 80 binding)
- **RS485 serial port access** (COM ports)

Right-click `UltrON.exe` → **Run as administrator**, or create a shortcut with:
```
Target: C:\Users\%USERNAME%\AppData\Local\UltrON\UltrON.exe
Advanced → Run as administrator
```

---

### 8. Sleep Prevention

UltrON automatically prevents the PC from sleeping while running.

---

### 9. Updating to a New Version

**Using the installer (recommended):**
1. Download the latest `UltrON_Installer.exe`
2. Run it — it replaces the old EXE automatically

**Manual update:**
1. Stop UltrON (close the window)
2. Replace `UltrON.exe` in `%LOCALAPPDATA%\UltrON\` with the new version
3. Restart

---

### 10. Firewall / Network

UltrON listens on:
- **Port 8000** — main API + UI
- **Port 80** — LED board endpoint (optional)
- **Modbus ports** — as configured per device (default 502)

Ensure Windows Firewall allows inbound connections if clients need to access the Web UI from other devices on the LAN.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| App won't start | Check terminal logs for Python errors. Ensure no other app uses port 8000. |
| LED board not responding | Run as Administrator (port 80 needs admin rights). Check card URL format. |
| Login failed after F5 | Use correct credentials. Master/Master now authenticates via real API. |
| RS485/Serial not working | Run as Administrator. Check COM port number in Device Manager. |
| CPCB file not generating | Verify **Export Enabled** is ON in CPCB Config. Check export path is writable. |
| AMC token setup fails | Contact Sunshine Technologies for a valid token. |

---

## Contact

**Sunshine Technologies**
- Support: 7659091468, 9133377852, 853
- Sales: 8801231166, 9133377852
- Web: https://sunshinetechno.com/
