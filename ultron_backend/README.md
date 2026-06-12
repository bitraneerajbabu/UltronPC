# UltrON — Industrial Monitoring Platform

**Real-time telemetry, alarm management, and reporting for AAQMS / industrial analyzers.**

Supports **Modbus TCP**, **Modbus RTU / RS485**, **TCP Custom Sockets**, and **CSV File Ingestion** — with live WebSocket push, hysteresis alarm engine, and multi-interval averaging.

---

## Prerequisites

- **Python 3.11+** → https://www.python.org/downloads/
  > ✅ During install, check **"Add Python to PATH"**
- **pip** (bundled with Python 3.11+)
- For RS485: a physical COM port or USB-to-RS485 adapter (Windows: `COM3`, Linux: `/dev/ttyUSB0`)

---

## Quick Start (Windows)

### 1 — Open PowerShell inside `ultron_backend`

Right-click the `ultron_backend` folder -> **Open in Terminal**

### 2 — Create & activate virtual environment

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

> If you get an execution policy error, run first:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

### 3 — Install Python dependencies

```powershell
pip install -r requirements.txt
```

### 4 — Run everything with one command

```powershell
python run.py
```

This will:
- **Build the React frontend** automatically via `npm run build` (Node.js must be installed)
- **Serve the UI + API** on a single port — no separate frontend server needed
- Skip the build on subsequent runs if no source files have changed

Open **http://localhost:8000/** in your browser.

> **Node.js required for the first run** — https://nodejs.org/en/download  
> If npm is not available, the server still starts in API-only mode (`/docs` still works).

---

### Optional Flags

```powershell
python run.py --no-build      # skip frontend build (use existing ui_dist/)
python run.py --force-build   # force full rebuild even if source is unchanged
python run.py --port 9000     # change port (default: 8000)
```

### Frontend Hot-Reload (Development)

For live CSS/JS edits without rebuilding:

```powershell
# Terminal 1 (backend)
python run.py --no-build

# Terminal 2 (frontend dev server)
cd ..        # go to UltrON/ root
npm run dev  # Vite dev server on :5173, proxies /api -> :8000
```

Then open **http://localhost:5173/** for hot-reload.

---

## URLs After Starting

| URL | Purpose |
|-----|---------|
| **http://localhost:8000/** | **React UI (full application)** |
| http://localhost:8000/docs | Swagger UI -- interactive API explorer |
| http://localhost:8000/redoc | ReDoc API docs |
| ws://localhost:8000/ws/live | WebSocket live telemetry feed |
| http://localhost:8000/health | Liveness probe |

---

## First-Time Configuration

The database starts **empty**. Use the UI (or Swagger at `/docs`) to configure:

1. **Create a Station** → `POST /api/v1/stations/`
2. **Add a Device** → `POST /api/v1/devices/` — choose protocol and enter connection details
3. **Map Parameters** → `POST /api/v1/parameters/` — map Modbus register addresses to tag names
4. The polling engine starts automatically on server boot and picks up all active devices

> 💡 After adding new devices while the server is running, call `POST /api/v1/settings/reload-polling` to start their poll loops without restarting.

---

## Protocol Configuration

### Modbus TCP (Ethernet)

```json
{
  "protocol": "modbus_tcp",
  "host": "192.168.1.101",
  "port": 502,
  "slave_id": 1,
  "poll_interval": 60,
  "timeout": 5
}
```

### Modbus RTU / RS485 (Serial)

```json
{
  "protocol": "modbus_rtu",
  "serial_port": "COM3",
  "baud_rate": 9600,
  "data_bits": 8,
  "parity": "N",
  "stop_bits": 1,
  "slave_id": 1,
  "poll_interval": 60,
  "timeout": 3
}
```

> **Linux / Raspberry Pi:** use `/dev/ttyUSB0` or `/dev/ttyS0` as `serial_port`.  
> Supported baud rates: `1200`, `2400`, `4800`, `9600`, `14400`, `19200`, `38400`, `57600`, `115200`.  
> Parity: `N` (None), `E` (Even), `O` (Odd).

### TCP Custom Socket

```json
{
  "protocol": "tcp_custom",
  "host": "192.168.1.50",
  "port": 4001,
  "poll_interval": 60,
  "timeout": 5
}
```

Reads one CSV line per poll cycle. Field position (0-based) is set via `register_address` on each parameter.

### CSV File Watcher

```json
{
  "protocol": "csv",
  "csv_path": "C:\\datalogger\\readings.csv",
  "csv_delimiter": ",",
  "poll_interval": 60
}
```

Reads the **last row** of the CSV on each poll. Column 0-based index set via `register_address`. Supports automatic header-row detection.

---

## Register / Data Type Mapping

| UI Label | `data_type` | `byte_order` | Description |
|---|---|---|---|
| Integer | `uint16` | `big` | 16-bit unsigned |
| Signed Integer | `int16` | `big` | 16-bit signed |
| Long Integer | `int32` | `big` | 32-bit signed, big-endian words |
| Swapped Long | `int32` | `little_swap` | 32-bit signed, word-swapped |
| Float point | `float32` | `big` | IEEE 754, big-endian words |
| Swapped Float | `float32` | `little_swap` | IEEE 754, word-swapped |
| Double Float | `int64` | `big` | 64-bit integer |
| Swapped Double | `int64` | `little_swap` | 64-bit, word-swapped |

**Register type FC codes:**

| Value | FC | Description |
|---|---|---|
| `holding` | FC03 | Holding Register (4x) — most common |
| `input_reg` | FC04 | Input Register (3x) — read-only |
| `coil` | FC01 | Coil Status (0x) — digital output |
| `discrete_input` | FC02 | Discrete Input (1x) — digital input |

---

## Database

By default, UltrON uses **SQLite** (zero config) → creates `ultron.db` automatically.

### Switch to PostgreSQL / TimescaleDB (Production)

1. Install PostgreSQL + TimescaleDB extension
2. Create database and user:
   ```sql
   CREATE DATABASE ultron_db;
   CREATE USER ultron WITH PASSWORD 'ultron';
   GRANT ALL ON DATABASE ultron_db TO ultron;
   ```
3. Edit `.env`:
   ```env
   DATABASE_URL=postgresql+asyncpg://ultron:ultron@localhost:5432/ultron_db
   DB_TYPE=postgresql
   ```
4. Restart the server — tables and hypertables are created automatically.

---

## WebSocket — Live Data Feed

Connect from any client:

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/live');

ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'connected') {
        console.log('UltrON connected:', msg.message);
    }
    if (msg.type === 'live_data') {
        // msg.device_id, msg.ts, msg.data → array of {tag_name, value, unit, quality, timestamp}
        msg.data.forEach(pt => console.log(pt.tag_name, pt.value, pt.unit));
    }
    if (msg.type === 'alarm') {
        // msg.severity, msg.message, msg.parameter_id
        console.warn('ALARM:', msg.severity, msg.message);
    }
    if (msg.type === 'heartbeat') {
        console.log('Heartbeat — clients:', msg.clients);
    }
};

// Optional ping
ws.send('ping');
```

Subscribe to specific stations only:
```
ws://localhost:8000/ws/live?station_ids=1,2
```

---

## API Quick Reference

### Stations
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/stations/` | List all stations |
| `POST` | `/api/v1/stations/` | Create station |
| `PATCH` | `/api/v1/stations/{id}` | Update station |
| `DELETE` | `/api/v1/stations/{id}` | Delete station |

### Devices
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/devices/` | List devices (filter: `?station_id=`) |
| `POST` | `/api/v1/devices/` | Create device |
| `PATCH` | `/api/v1/devices/{id}` | Update device config |
| `DELETE` | `/api/v1/devices/{id}` | Delete device |
| `POST` | `/api/v1/devices/{id}/test-connection` | **Real connection test** — returns `{ success, message, latency_ms }` |

### Parameters (Register Mappings)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/parameters/` | List parameters (filter: `?device_id=`) |
| `POST` | `/api/v1/parameters/` | Create parameter mapping |
| `PATCH` | `/api/v1/parameters/{id}` | Update mapping |
| `DELETE` | `/api/v1/parameters/{id}` | Delete mapping |

### Telemetry
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/telemetry/` | Query historical data |
| `GET` | `/api/v1/telemetry/latest` | Latest value per parameter |
| `GET` | `/api/v1/telemetry/live` | Current live data snapshot |
| `GET` | `/api/v1/telemetry/dashboard-summary` | KPI counts (stations, alarms, quality%) |

### Trends
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/trends/chart-data` | Chart-ready series (`?parameter_ids=&start=&end=&avg_type=`) |
| `GET` | `/api/v1/trends/statistics` | Min / max / avg / stddev for a parameter |

`avg_type` options: `raw`, `avg_5min`, `avg_15min`, `avg_1hr`, `avg_8hr`, `avg_daily`

### Reports
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/reports/excel` | Download `.xlsx` report |
| `GET` | `/api/v1/reports/pdf` | Download PDF report |

### Alarms
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/alarms/` | List alarms (filter: `?state=&severity=&parameter_id=`) |
| `GET` | `/api/v1/alarms/active-count` | Count of active alarms |
| `POST` | `/api/v1/alarms/acknowledge` | Acknowledge selected alarms |
| `POST` | `/api/v1/alarms/{id}/clear` | Clear a specific alarm |

### Logs
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/logs/` | Query system / comm / audit logs |
| `DELETE` | `/api/v1/logs/purge` | Purge logs older than N days |

### Settings & DB Utilities
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/settings/info` | App version, station/device/parameter counts |
| `GET` | `/api/v1/settings/health` | Database connectivity check |
| `GET` | `/api/v1/settings/polling-status` | Active poll loop count and device IDs |
| `POST` | `/api/v1/settings/reload-polling` | Restart all device poll loops (no restart needed) |
| `POST` | `/api/v1/settings/reset-telemetry` | **Clear all readings/alarms — keep config** |
| `POST` | `/api/v1/settings/reset-all` | **⚠ Factory reset — wipes ALL data** |

---

## Architecture

```
Frontend (Vite / React)
    │
    ├── REST API ──────────────── FastAPI  :8000
    │       ├── /api/v1/stations/
    │       ├── /api/v1/devices/
    │       ├── /api/v1/parameters/
    │       ├── /api/v1/telemetry/
    │       ├── /api/v1/trends/
    │       ├── /api/v1/reports/
    │       ├── /api/v1/alarms/
    │       ├── /api/v1/logs/
    │       └── /api/v1/settings/
    │
    └── WebSocket ─────────────── ws://localhost:8000/ws/live
            └── Live push on every device poll cycle

Backend Services
    ├── Polling Engine  (per-device asyncio Task)
    │       ├── Modbus TCP   → Ethernet analyzers / PLCs
    │       ├── Modbus RTU   → RS485 bus (async lock, inter-frame gap)
    │       ├── TCP Custom   → ASCII/CSV stream over raw socket
    │       └── CSV Watcher  → File-based data logger ingestion
    │
    ├── Data Quality Engine  (range, NaN, frozen sensor detection)
    ├── Alarm Engine         (4-level thresholds, hysteresis deadband)
    ├── Averaging Engine     (APScheduler: 1min/5min/15min/1hr/8hr/daily)
    └── Database
            ├── SQLite       (development / embedded)
            └── TimescaleDB  (production / high-frequency)
```

---

## Directory Structure

```
ultron_backend/
├── app/
│   ├── api/            # FastAPI routers (stations, devices, params, …)
│   ├── core/           # Logger
│   ├── models/         # SQLAlchemy ORM models
│   ├── schemas/        # Pydantic request/response schemas
│   ├── services/       # Protocol drivers + engines
│   │   ├── modbus_tcp.py
│   │   ├── modbus_rtu.py
│   │   ├── tcp_custom.py
│   │   ├── csv_watcher.py
│   │   ├── polling_engine.py
│   │   ├── alarm_engine.py
│   │   ├── averaging_engine.py
│   │   └── data_quality.py
│   ├── config.py       # App settings (.env loader)
│   ├── database.py     # DB engine + session factory
│   ├── main.py         # FastAPI app + lifespan hooks
│   └── websocket_manager.py
├── .env                # Environment variables
├── requirements.txt
├── run.py
└── README.md
```

---

## Environment Variables (`.env`)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./ultron.db` | Database connection string |
| `DB_TYPE` | `sqlite` | `sqlite` or `postgresql` |
| `APP_NAME` | `UltrON` | Application display name |
| `APP_VERSION` | `1.0.0` | Version string |
| `DEBUG` | `false` | Enable debug logging |
| `POLLING_DEFAULT_INTERVAL` | `60` | Default poll interval (seconds) |

---

## Powered by Sunshine Technologies
