---
name: understand-onboard
description: >
  Generates a complete onboarding document for a new engineer joining the
  UltrON project. Covers: what the product is, the tech stack, how to run
  it locally, the key files to know, the domain concepts, the team, the
  deployment process, and the known sharp edges. Use whenever the user says
  "/understand-onboard", "write an onboarding doc", "new engineer joining",
  "how do I get started", "explain the project to someone new", or "write a
  README for the team".
argument-hint: "[junior|senior|frontend|backend|devops]"
---

# /understand-onboard

You are the lead engineer writing the onboarding guide that you wish you had
on day one. Dense and useful. No corporate filler.

## What to do

1. Read the project structure:
   - `client/backend/ultron_backend/app/` — Python/FastAPI backend
   - `client/frontend/src/` — React/Vite frontend
   - `client/backend/ultron_backend/app/config.py` — all settings
   - `client/backend/ultron_backend/app/main.py` — startup + scheduler
   - Root-level `README.md` if it exists

2. Read `Ultron_audit_report.json` for known issues to warn about.

3. Read `RAJAPI_SYNC_PLAN.md` for the planned architecture direction.

4. Produce the onboarding document below. Tailor depth to the audience if
   specified (junior / senior / frontend / backend / devops).

## Output format — save as ONBOARDING.md in project root

```markdown
# UltrON — Engineer Onboarding Guide
*Last updated: [date]*

## What is UltrON?
[2–3 sentences. Product, customer, regulatory context.]

## The team
| Person | Role |
|--------|------|
| Neeraj | CEO / product owner / RajAPI admin |
| Dev    | Engineer |

## Architecture overview
[Mermaid diagram of: sensors → client PC → RajAPI → CPCB/SPCB]

## Tech stack
| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11, FastAPI, SQLAlchemy (async), SQLite, APScheduler |
| Frontend | React 18, Vite, TypeScript, Chart.js |
| Comms | Modbus TCP/RTU, WebSocket, HTTP push |
| Central server | FastAPI on Raspberry Pi 5, PostgreSQL, nginx, cloudflared |

## How to run locally

### Backend
\`\`\`powershell
cd client/backend
pip install -r requirements.txt
cd ultron_backend
# Copy .env.template → .env, fill in ADMIN_PASSWORD
python -m uvicorn app.main:app --reload --port 8000
\`\`\`

### Frontend
\`\`\`powershell
cd client/frontend
npm install
npm run dev   # http://localhost:5173
\`\`\`

Default login: Master / [from .env ADMIN_PASSWORD]

## Key files — learn these first

| File | Why it matters |
|------|---------------|
| `app/config.py` | All settings, env vars, encrypted .env.enc |
| `app/main.py` | App startup, all scheduler jobs |
| `app/services/polling_engine.py` | Reads sensors every 5s |
| `app/services/averaging_engine.py` | Computes 1min…daily averages |
| `app/services/server_push.py` | Pushes to CPCB/SPCB third-party servers |
| `app/services/rajapi_sync.py` | Heartbeat to RajAPI central |
| `app/services/lock_store.py` | AMC / license lock gate |
| `app/models/telemetry.py` | All DB models for live/historical/averages |

## Domain concepts you MUST understand
[Paste output of /understand-domain here, condensed]

## The data flow
\`\`\`
Sensor → Modbus driver → live_data (every 5s)
                       → historical_data (once/min, deduped)
                       → averages (1min/5min/15min/1hr/8hr/daily)
                         → CPCB CSV (every 15min)
                         → SPCB HTTP POST (every 1min live / 15min delay)
                         → RajAPI heartbeat (every 60s)
\`\`\`

## Quality codes (memorise these)
| Code | Meaning |
|------|---------|
| U | Valid / Good — what you want to see |
| O | Out of range |
| E | Comms / equipment error |
| N | Negative value |
| B | Bad / generic fault |
| M | Maintenance mode |

## Configuration (.env)
Never commit `.env`. The app encrypts it to `.env.enc` on first run (frozen mode).
Key settings:
- `ADMIN_PASSWORD` — required, app won't start without it
- `CENTRAL_API_KEY` — set by the license verify flow
- `RAJAPI_STATION_ID` — e.g. "KTPP"
- `POLLING_DEFAULT_INTERVAL` — 5 (seconds)

## Known issues
[Summarise top 5 open items from Ultron_audit_report.json]

## How to deploy a new client

1. Build EXE: `pyinstaller UltrON.spec` in `client/backend/`
2. Copy `UltrON.exe` + `_internal/` to client PC
3. Client runs EXE → browser opens at http://localhost:8000
4. First-time setup: enter API key from Neeraj → saves to `.env.enc`
5. Neeraj activates the site in RajAPI admin panel

## RajAPI admin (Neeraj only)
URL: https://rajapi.com
What Neeraj can do remotely: lock/unlock AMC, send broadcasts, restart polling,
factory reset, push OTA updates.

## Gotchas for new engineers

- **Master password is LOCKED** — never change it via API. DB edit only.
- **`U` = Valid** — not "unknown". CPCB standard. Engineers at sites know this.
- **SQLite WAL mode** — concurrent writes use semaphore + jitter to avoid locks
- **PyInstaller** — hidden imports in `UltrON.spec` must include any new library
  you add, or it will fail silently on the client PC
- **`.env.enc`** — the EXE auto-encrypts `.env` on first run. On dev, keep `.env` plain.
- **`server_config_id` FK** — `PendingUpload.server_config_id` was NOT NULL;
  now nullable. If you see `IntegrityError` on uploads, check this FK.

## Architecture direction
See `RAJAPI_SYNC_PLAN.md` for Option B (unified client-sync endpoint).
Not started — needs Neeraj to confirm RajAPI server changes first.

## Useful commands
\`\`\`powershell
# Check app is running
curl http://localhost:8000/docs

# Watch logs
Get-Content .\logs\ultron.log -Wait -Tail 50

# Reset DB (dev only!)
Remove-Item ultron.db; python -m uvicorn app.main:app --reload
\`\`\`
```

## Rules

- Write the actual document. Do not describe what the document would contain.
- Save it to `c:\Users\sunsh\OneDrive\Music\UltrON\ONBOARDING.md`.
- Pull real data (file paths, version, known issues) from the codebase — do
  not invent.
- If a section's content cannot be determined without reading a file, read it.
- Audience flag: `junior` = add more explanation of why; `senior` = denser,
  skip basics; `frontend` = expand UI/WS sections; `backend` = expand DB/push
  sections; `devops` = expand build/deploy sections.
