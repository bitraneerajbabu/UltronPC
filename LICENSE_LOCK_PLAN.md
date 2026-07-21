# 🔐 UltrON License Protection & CPCB/SPCB Control System (`LICENSE_LOCK_PLAN.md`)

## 1. Executive Summary & Core Rules
This plan implements software protection for UltrON to ensure no unauthorized plant can use the software without a valid license from Sunshine Technologies.

### 📜 Core Rules:
1. **Modbus Polling & Storage NEVER STOPS:** Once configured, background sensor polling and local SQLite data recording continue uninterrupted so local history is never lost.
2. **When Unlicensed or Locked:**
   - **CPCB / SPCB Outbound Push is FROZEN:** Telemetry uploads to State & Central CPCB portals are immediately stopped.
   - **Client Dashboard UI is BLOCKED:** Local web screen (`localhost:8000`) displays a locked activation screen with Machine Hardware ID.
3. **Upon Activation / Unlock:** CPCB/SPCB push resumes immediately, flushing all buffered historical data to CPCB/SPCB.

---

## 2. Architecture & Licensing State Machine

```
                              ┌──────────────────────────────────┐
                              │     UltrON Background Engine     │
                              └────────────────┬─────────────────┘
                                               │
                                  (Modbus Sensor Polling)
                                               │ (Always Active)
                                               ▼
                              ┌──────────────────────────────────┐
                              │     SQLite Local Vault (db)      │
                              └────────────────┬─────────────────┘
                                               │
                                    [License State Check]
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼                                               ▼
            [VALID LICENSE / ACTIVE]                               [LOCKED / UNLICENSED]
  ┌─────────────────────────────────────────┐     ┌─────────────────────────────────────────┐
  │ 🟢 Client UI Dashboard: FULL ACCESS     │     │ 🔴 Client UI Dashboard: BLOCKED (Lock)  │
  │ 🟢 CPCB / SPCB Upload: ACTIVE           │     │ 🔴 CPCB / SPCB Upload: FROZEN           │
  │ 🟢 RajAPI Fleet Sync: ACTIVE            │     │ 🟡 Local Telemetry: BUFFERED IN DB      │
  └─────────────────────────────────────────┘     └─────────────────────────────────────────┘
```

---

## 3. License Key & Hardware Binding Specifications

### A. Machine Hardware ID (HWID) Generation
UltrON generates a unique, non-spoofable Hardware ID for the host Windows PC:
$$\text{HWID} = \text{SHA256}(\text{Motherboard UUID} + \text{CPU Serial} + \text{MAC Address})$$
- Example: `SUN-8F92-A410-BC77`

### B. License Key Payload Structure (`ultron.lic` or Online API Token)
```json
{
  "client_name": "Beger Paints Ltd",
  "hwid": "SUN-8F92-A410-BC77",
  "allowed_stations": 2,
  "issue_date": "2026-07-22",
  "expiry_date": "2027-07-22",
  "signature": "RSA_2048_SIGNATURE_FROM_SUNSHINE_PRIVATE_KEY"
}
```

---

## 4. Implementation Details by Component

### Component 1: License Manager Engine (`app/services/license_manager.py`)
- Reads local `ultron.lic` or queries `rajapi.com` during startup.
- Verifies RSA-2048 cryptographic signature using Sunshine's embedded Public Key.
- Evaluates `is_valid`, `is_expired`, and `is_hwid_matched`.

### Component 2: CPCB / SPCB Uploader Guard (`app/services/cpcb/cpcb_push.py`)
```python
# Guard inside CPCB push loop
if not license_manager.is_cpcb_upload_allowed():
    log.warning("CPCB/SPCB Upload Frozen: License is Locked or Expired")
    return  # Telemetry remains safely buffered in SQLite
```

### Component 3: Frontend Lock Overlay (`client/frontend/src/App.tsx`)
When `license.status === "LOCKED"` or `"EXPIRED"`:
- Renders full-screen non-dismissible dialog:
  - **Header:** 🔒 License Activation Required — Sunshine Technologies
  - **Machine HWID:** `SUN-8F92-A410-BC77` (with Copy button)
  - **Message:** *"Software license is locked or expired. Please contact Neeraj / Support at info@sunshinetech.in to obtain an activation key."*
  - **Activation Input Box:** Allows entering activation key to instantly unlock without restarting.

### Component 4: RajAPI Remote Unlock / Lock Gateway (`rajapi.com`)
- Admin panel button: **🔒 Lock Site** / **🔓 Unlock Site**.
- Remote command `lock_license` / `unlock_license` dispatched over heartbeat loop.

---

## 5. Verification Plan

### Automated & Unit Verification
- Test signature validation algorithm with valid/invalid HWIDs.
- Verify CPCB push loop returns immediately when license state is `LOCKED`.
- Verify Modbus polling engine continues inserting rows into `LiveData` table while UI is locked.

### Manual Verification
1. Launch UltrON without `ultron.lic` $\rightarrow$ Confirm UI shows Lock Screen and CPCB push is paused.
2. Verify Modbus sensors continue updating SQLite `live_data` table.
3. Enter valid license key on UI $\rightarrow$ Confirm UI unlocks instantly and CPCB push flushes buffered points.
