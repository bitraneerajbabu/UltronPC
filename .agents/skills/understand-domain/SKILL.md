---
name: understand-domain
description: >
  Explains the industrial IoT and regulatory domain that UltrON operates in:
  CPCB/SPCB compliance, Modbus protocols, quality codes, averaging windows,
  AMC licensing, and how they all connect. Use whenever the user says
  "/understand-domain", "explain the domain", "what is CPCB", "what do the
  quality codes mean", "explain Modbus", "what is AMC", "what does U/O/E/N
  mean", or any question about the regulatory or industrial context rather
  than the code itself. Also use when a new team member needs onboarding on
  the problem space.
---

# /understand-domain

You are a domain expert explaining the industrial IoT and environmental
compliance world to a software engineer who knows code but not the sector.
Be concrete. Use examples from the UltrON codebase to anchor abstract concepts.

## Always cover these sections in order

---

### 1. What UltrON is (30 words max)
An industrial IoT platform that reads sensor data from pollution-monitoring
equipment at industrial plants, stores and averages it, and pushes it to
regulatory portals (CPCB, SPCB) for legal compliance reporting.

---

### 2. The regulatory context

**CPCB** — Central Pollution Control Board (India). National regulator.
Mandates that certain industries (power plants, cement, steel, …) continuously
monitor stack emissions and ambient air quality, and transmit data in real-time
to the CPCB server.

**SPCB** — State Pollution Control Board. State-level equivalent. Each state
has its own portal with its own API format (often similar but not identical to
CPCB). UltrON supports both via configurable server push mappings.

**CAAQMS** — Continuous Ambient Air Quality Monitoring Station. The physical
monitoring station UltrON reads from.

**Annexure-I** — The CPCB IT Division specification for the CSV flat-file
format that stations must write. UltrON's `_push_cpcb()` writes this file.

---

### 3. Data quality codes

UltrON uses CPCB-standard single-letter quality codes on every data point.
These are NOT arbitrary — regulators read them.

| Code | Enum value | Meaning | When assigned |
|------|-----------|---------|---------------|
| `U` | `DataQuality.good` | Valid / Unambiguous | Sensor read OK, value in range |
| `O` | `DataQuality.out_of_range` | Out of range | Value outside configured limits |
| `E` | `DataQuality.comms_fail` | Equipment / Comms error | Modbus timeout, CRC error |
| `N` | `DataQuality.negative` | Negative value | Physical impossibility for that param |
| `B` | `DataQuality.bad` | Bad / Unknown bad | Generic sensor fault |
| `I` | `DataQuality.uncertain` | Uncertain | Sensor in warm-up or degraded |
| `M` | `DataQuality.maintenance` | Maintenance mode | Manually flagged |
| `F` | `DataQuality.sensor_fail` | Sensor failed | Hardware fault confirmed |

**Critical gotcha**: `U` means *Valid/Good* — engineers at client sites know
this. "U" in a CPCB report = clean data. Any other code = flagged.

---

### 4. Averaging windows

CPCB requires specific averaging periods. UltrON computes all of these:

| Window | Why it matters |
|--------|---------------|
| 1-min | Real-time display on dashboard |
| 5-min | Short-trend monitoring |
| 15-min | **Primary CPCB reporting window** — what goes in Annexure-I |
| 1-hr | CPCB hourly compliance check |
| 8-hr | Shift-level reporting |
| Daily | Day-level summary |

The averaging engine runs every minute (`cron: *`) and computes whichever
windows are due based on wall-clock alignment.

---

### 5. Protocols UltrON speaks

| Protocol | Used for | UltrON file |
|----------|---------|-------------|
| **Modbus TCP** | PLC/sensor over Ethernet | `modbus_tcp.py` |
| **Modbus RTU** | PLC/sensor over RS-485 serial | `modbus_rtu.py` |
| **TCP Custom** | Proprietary analyser protocols | `tcp_custom.py` |
| **UDP Custom** | Some ambient sensors | `udp_custom.py` |
| **CSV Watcher** | Analysers that write CSV files | `csv_watcher.py` |

Each device in the DB has a `protocol` field that selects which driver runs.

---

### 6. The push chain

```
Sensor hardware
  → Modbus/TCP/CSV driver (polling_engine.py, every 5s)
    → live_data table (one row per parameter, always current)
    → historical_data table (one row per minute per parameter)
    → averages table (1min…daily, computed by averaging_engine.py)
      → CPCB Annexure-I CSV (server_push.py _push_cpcb, every 15 min)
      → SPCB HTTP POST (server_push.py _push_spcb, every 1 min live / 15 min delay)
      → RajAPI heartbeat (rajapi_sync.py send_heartbeat, every 60s)
```

---

### 7. AMC and licensing

**AMC** = Annual Maintenance Contract. Sunshine Technologies charges clients
annually. If a client's AMC expires, RajAPI instructs UltrON to lock itself:
polling continues (data is never lost) but outward pushes are queued, not sent.
When AMC is renewed, Neeraj unlocks from the RajAPI admin panel and the queue
drains.

`lock_store.py` holds the in-memory AMC/lock state updated from every heartbeat
response. `is_push_allowed()` is the gate checked before every outward push.

---

### 8. Key people / systems

| Name | Role |
|------|------|
| **Neeraj** | CEO / product owner / RajAPI admin |
| **Dev** | Engineer building UltrON |
| **Sunshine Technologies** | Company behind UltrON |
| **RajAPI** | Neeraj's central admin server at rajapi.com (Raspberry Pi 5) |
| **Client** | Industrial plant running UltrON — not an external customer |
| **KTPP** | The currently deployed live client site |

---

### 9. Where to go next

- Code: `app/services/polling_engine.py` — the heart of data collection
- Code: `app/services/averaging_engine.py` — computes all windows
- Code: `app/services/server_push.py` — pushes to CPCB/SPCB/RajAPI
- Code: `app/services/rajapi_sync.py` — heartbeat + command execution
- Config: `app/config.py` — all tunable settings with defaults
- Audit: `Ultron_audit_report.json` — all known issues and their status
