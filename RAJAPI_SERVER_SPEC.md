# 🖥️ RajAPI Server Infrastructure Specification

## 1. Hardware & Operating System
- **Device Model:** Raspberry Pi 3 Model B / B+
- **Architecture:** 64-bit ARM (`aarch64`)
- **Operating System:** Raspberry Pi OS Lite 64-bit (Debian GNU/Linux 12/13 headless)
- **Storage:** 64 GB MicroSD Card
- **Network Hostname:** `raj.local` (Local LAN IP: dynamic / DHCP reservation)
- **Public Domain:** [https://rajapi.com](https://rajapi.com) (via Cloudflare Tunnel)

---

## 2. Software Architecture & Services
- **Web Gateway (Reverse Proxy):** Nginx (Port 80) $\rightarrow$ Cloudflare Tunnel (`cloudflared`)
- **Backend Service:** FastAPI / Python Uvicorn (`rajapi-python.service` running on `127.0.0.1:8081`)
- **Database Engine:** PostgreSQL 15 Alpine in Docker container (`ultron_db`, Port 5432)
  - **Database Name:** `ultron_central`
  - **Database User:** `ultron_admin`
  - **Database Timezone:** `Asia/Kolkata` (IST, +05:30)

---

## 3. Database Architecture (Client vs Server)
- **Client Side (Plant Gateways):** SQLite (WAL Mode enabled with retry backoffs & semaphores) — lightweight, zero-setup embedded DB.
- **Server Side (RajAPI Central Vault):** PostgreSQL 15 (Multi-Version Concurrency Control, row-level locking for multi-site concurrent telemetry pushes).

---

## 4. Deployment Scripts & Paths
- **Backend Code Location:** `/home/pi/rajapi_server/backend`
- **Static Frontend Location:** `/var/www/rajapi`
- **Windows Deployment Scripts:**
  - `deploy_rajapi_frontend.bat` — Builds Vite app and deploys static bundle to `/var/www/rajapi`.
  - `deploy_rajapi_backend.bat` — Uploads FastAPI backend files to `/home/pi/rajapi_server/backend/app/` and restarts `rajapi-python.service`.

---

## 5. Maintenance & Backup Guidelines
- **Storage Capacity:** 64 GB SD Card can store > 100 Million telemetry records.
- **Database Backups:** Perform periodic `pg_dump` of container `ultron_db` to protect against SD card wear:
  ```bash
  docker exec ultron_db pg_dump -U ultron_admin ultron_central > /home/pi/backup_ultron_central.sql
  ```
