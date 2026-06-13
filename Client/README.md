# UltrON Client (Local PC)

The **UltrON Client** is the software package deployed onto industrial touch-panel PCs at each station. It connects to Modbus TCP/RTU hardware locally, aggregates data, and pushes telemetry to the cloud or government servers (CPCB/TSPCB).

## Architecture
- **`backend/`** (FastAPI / Python)
  - Manages hardware polling (Modbus RTU/TCP).
  - Handles local alarms and 15-minute averaging.
  - Serves REST/WebSocket data to the local UI.
- **`frontend/`** (React / Vite)
  - The "Industrial Dashboard" UI.
  - Displays live data and trends using `chart.js`.
  - Served via pywebview directly from the local Python executable.

## Building the Executable
Run `build_exe.bat` to package the frontend and backend into a single portable `.exe` using PyInstaller.
