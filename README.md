# UltrON — Industrial Monitoring Platform

**Real-time industrial telemetry, alarm management, and reporting for AAQMS (Ambient Air Quality Monitoring Systems) and industrial analyzers.**

UltrON is a high-performance industrial monitoring platform designed to ingest data from hardware devices, calculate statistical averages, raise real-time alarms with hysteresis, and generate compliant compliance reports.

---

## 🚀 Key Features

* **Multiple Telemetry Drivers**: Built-in support for **Modbus TCP**, **Modbus RTU / RS485**, **TCP Custom Sockets**, and **CSV File Ingestion**.
* **Automatic UI Startup**: Automatically launches the default web browser and opens the UI once the backend server is listening.
* **Secured Authentication Wall**: Uses session-based authentication (`sessionStorage`) to protect dashboard data and require logging in upon opening a new browser window or tab.
* **Real-time Live Push**: WebSockets channel pushes telemetry updates and alarms instantly to the web frontend.
* **Hysteresis Alarm Engine**: Supports warning and critical thresholds (high-high, high, low, low-low) with custom deadbands.
* **Multi-interval Averaging Engine**: APScheduler calculating averages from 1-minute to daily intervals.
* **Compliance Reporting**: Built-in PDF and Excel report generation.

---

## 🛠️ Technology Stack

### Frontend (User Interface)
* **Core Framework**: React 19 (TypeScript / TSX)
* **Build Tool**: Vite 8 (ESBuild)
* **Charting**: Chart.js 4 (using `react-chartjs-2`) for trends & lightweight inline SVGs for sparklines
* **Styling**: TailwindCSS 4 & Vanilla CSS for premium custom glassmorphic cards and shell layouts

### Backend (Core Application)
* **Web Framework**: FastAPI (Python) with standard REST routers and async lifecycle hooks
* **ASGI Server**: Uvicorn standard
* **WebSocket Server**: Async live communication channel
* **Industrial Drivers**: `pymodbus` (Ethernet/Serial), `pyserial`, and `pyserial-asyncio`
* **Scheduling Engine**: APScheduler (Advanced Python Scheduler)
* **Reporting Engines**: `openpyxl` (Excel) and `fpdf2` (PDF)

### Database & Storage
* **Local Database**: SQLite 3 (async integration via `aiosqlite`)
* **Enterprise Database Support**: PostgreSQL & TimescaleDB drivers (`asyncpg` / `psycopg2`) for high-volume time-series storage
* **Migrations**: Alembic

---

## 📁 Directory Structure

```
UltrON/
├── src/                    # React Frontend Source Code (TypeScript)
│   ├── components/         # Reusable UI components (Modals, Sparklines, etc.)
│   ├── context/            # AppContext.tsx (Global auth & state provider)
│   ├── screens/            # Application Screens (Dashboard, Config, Trends)
│   ├── App.tsx             # Main layout shell and routing
│   └── main.tsx            # React entry point
├── ultron_backend/         # FastAPI Python Backend
│   ├── app/                # Backend packages
│   │   ├── api/            # API routers (auth, devices, telemetry, logs)
│   │   ├── models/         # SQLAlchemy DB Models (Device, Parameter, Log)
│   │   ├── schemas/        # Pydantic schemas
│   │   └── services/       # Polling, Alarms, and Averaging Engines
│   ├── ui_dist/            # Compiled production build of the React app
│   ├── run.py              # Unified launcher (auto-builds UI and runs server)
│   ├── start.bat           # Setup & startup script for Windows
│   └── requirements.txt    # Python package dependencies
├── package.json            # Node.js project configurations
└── tsconfig.json           # TypeScript configuration
```

---

## 🏁 Quick Start (Windows)

The simplest way to run both the frontend and backend in production mode is by double-clicking:
📂 `ultron_backend/start.bat`

This batch script will automatically:
1. Verify Python is installed.
2. Initialize the Python virtual environment (`venv`).
3. Install all necessary dependencies in `requirements.txt`.
4. Compile the React frontend to production static assets (`ui_dist/`).
5. Launch the FastAPI server at `http://localhost:8000`.
6. Open your default web browser to the app dashboard.

---

### Manual Development Setup

If you want to make active frontend edits with **Hot-Reloading**:

#### 1. Start the Backend API Server
Navigate to the `ultron_backend` folder, activate the virtual environment, and start the Python launcher in `--no-build` mode:
```powershell
cd ultron_backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py --no-build
```

#### 2. Start the Vite Frontend Dev Server
In a **separate** terminal window, run the node packages installation and start the Vite development server:
```powershell
npm install
npm run dev
```

* Open **`http://localhost:5173`** in your browser. Any UI code modifications will now trigger hot-reloads instantly, proxying all backend `/api` requests to port `8000`.

---

## 🔒 Default Credentials
* **Username**: `Master`
* **Password**: `Ultron123.0`

---

## 📞 Powered by Sunshine Technologies
* **Web**: [https://sunshinetechno.com/](https://sunshinetechno.com/)
