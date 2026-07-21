# 🔐 UltrON License Protection & CPCB/SPCB Control System — Final Implementation Plan (`LICENSE_LOCK_PLAN.md`)

## 1. Executive Summary & Core Rules

UltrON supports two deployment modes, decided once at installation and stored locally:
- **`online`**: Plant has internet, syncs with RajAPI, license validated remotely with offline grace tolerance.
- **`offline_only`**: Plant has no internet by design, license validated entirely from a locally-installed signed file, RajAPI/CPCB/SPCB sync never attempted.

### 📜 Core Rules (Apply to Both Modes):
1. **Modbus Polling & Storage NEVER STOP:** Once configured, background sensor polling and local SQLite data recording continue uninterrupted regardless of license state so local history is never lost.
2. **When Unlicensed / Locked / Expired:** CPCB/SPCB outbound push is frozen (buffered in database, never deleted); desktop dashboard shows a lock banner.
3. **Upon Activation / Unlock:** Push resumes, backlog flushes in controlled, resumable, chronological order.
4. **Compliance Feature:** Withholding data (not deleting it) during an unlicensed period is a sanctioned right under AMC terms — this is a compliance feature, not a workaround.

---

## 2. Deployment Mode Configuration

Stored in local client configuration (`config.py` / database settings):
```json
{
  "deployment_mode": "online | offline_only",
  "set_at": "installation_time via client setup"
}
```

| Mode | RajAPI Sync | License Validation | CPCB / SPCB Push |
|---|---|---|---|
| **`online`** | Active every 60s | Remote + local 30-day grace fallback | Active when licensed |
| **`offline_only`** | Disabled entirely (never scheduled) | Local `.lic` file only (RSA-2048) | Never configured — shown as "not set up" |

---

## 3. Hardware ID (HWID) Specifications

$$\text{HWID} = \text{SHA256}(\text{Motherboard UUID} + \text{CPU Serial})$$

- **MAC Address Excluded:** MAC address is explicitly excluded because NIC swaps, USB adapters, and VPN virtual adapters cause instability.
- **Hardware Fallback:** Disk drive volume serial if UUID/CPU serial is unavailable.
- **UI Display:** Displayed with a 1-click **Copy HWID** button on the lock banner and Settings screen.

---

## 4. License Key Payload Structure

```json
{
  "client_name": "Beger Paints Ltd",
  "hwid": "SUN-8F92-A410-BC77",
  "allowed_stations": 2,
  "deployment_mode": "online",
  "issue_date": "2026-07-22",
  "expiry_date": "2027-07-22",
  "signature": "RSA_2048_SIGNATURE_FROM_SUNSHINE_PRIVATE_KEY"
}
```

- **Cryptographic Signature:** Signed with Sunshine's private key, verified in-app using embedded public key (RSA-2048).
- **`offline_only` Activation:** HWID generated locally $\rightarrow$ sent to Sunshine via phone/email/USB $\rightarrow$ signed `.lic` returned $\rightarrow$ loaded via file picker/folder. Zero app-initiated network calls.

---

## 5. License Manager Engine (`app/services/license_manager.py`)

### State Machine:
- **`ACTIVE`** $\mid$ **`GRACE_PERIOD`** $\mid$ **`LOCKED`** $\mid$ **`EXPIRED`**

### Validation Logic:
1. **`offline_only`**: Checks local `.lic` RSA signature + expiry only. Zero network calls.
2. **`online`**: Validates via RajAPI heartbeat response. If unreachable:
   - If $\text{now} - \text{last\_successful\_validation} < \text{grace\_period\_days (30 days)}$, treat as `GRACE_PERIOD` (ACTIVE with warning log).
   - Otherwise $\rightarrow$ `LOCKED`.
3. **Heartbeat Re-Validation:** Piggybacks on 60s heartbeat loop (`rajapi_sync.py`) — remote lock/unlock takes effect within ~60s.
4. **Expiry Warnings (Both Modes):**
   - **30 days before expiry:** Dismissible warning banner.
   - **14 days before expiry:** Non-dismissible, non-blocking banner.
   - **0 days / Locked:** Full lock banner.

---

## 6. CPCB/SPCB Push Guard & Bounded Backlog (`app/services/cpcb/cpcb_push.py`)

```python
if not license_manager.is_cpcb_upload_allowed():
    log.warning(f"CPCB/SPCB push frozen: state={license_manager.get_license_state()}")
    queue_for_delayed_push(payload)
    return
```

- **Explicit Queuing:** Enqueues points into `PendingUpload` backlog table.
- **Bounded Backlog Queue:** 12-month retention cap for push entries (underlying `historical_data` table remains permanent). Emits alerts before reaching capacity.
- **`offline_only` Mode:** CPCB/SPCB servers shown as "Not Configured".

---

## 7. Controlled Delayed Flush Job (On Unlock)

When unlocked/renewed, a dedicated flush job runs:
- **Triggered by Unlock Event:** Not a fixed timer.
- **Chronological Flush:** Reads backlog from oldest to newest.
- **Controlled Rate:** Pushes at a configurable rate (5–10 records/sec) to avoid overloading CPCB/SPCB servers.
- **Resumable:** Tracks `last_flushed_record_id` so flush resumes cleanly if interrupted by app restart or network drop.
- **UI Progress Indicator:** Displays progress: *"Flushing backlog: 1,240 / 3,800 records"*.

---

## 8. Governance & Enforcement

1. **`allowed_stations` Enforcement:** Blocks station creation beyond the licensed count with a clear error message in both modes.
2. **Audit Logging:** Every lock/unlock/renew event is recorded with `event_type`, `actor`, `timestamp`, `reason`, and `site_id`.
3. **Version Protection:** No version files touched without explicit user approval.

---

## 9. Implementation Roadmap & Task Dependencies

| # | Component | Depends On |
|---|---|---|
| **1** | Deployment mode flag (`online` vs `offline_only`) | — |
| **2** | Hardware ID generator fix (Motherboard UUID + CPU Serial, drop MAC) | — |
| **3** | Offline grace period logic (30-day window) | Task 2 |
| **4** | Heartbeat-tied re-validation in `rajapi_sync.py` | Existing heartbeat |
| **5** | `offline_only` local RSA-2048 validation path | Tasks 1, 2 |
| **6** | License Manager Engine + CPCB Push Guard | Tasks 3, 4, 5 |
| **7** | Bounded backlog queue (`PendingUpload`) | Task 6 |
| **8** | Controlled delayed flush job | Task 7 |
| **9** | UI Lock Banner + Expiry Warnings + Mode-Aware Messaging | Task 6 |
| **10** | `allowed_stations` enforcement in Station CRUD | Existing station endpoints |
| **11** | Audit logging for license events | RajAPI audit log system |

---

## 10. Verification Plan

### Verification Checklist:
- [ ] **`online` mode, no license:** Lock banner shown, CPCB push frozen, Modbus polling & SQLite recording continue uninterrupted.
- [ ] **`online` mode, internet drops:** 30-day grace period holds active state, then transitions to locked.
- [ ] **`offline_only` mode, valid `.lic`:** Fully functional, zero network calls attempted.
- [ ] **`offline_only` mode, expired `.lic`:** Lock banner shown, CPCB push frozen.
- [ ] **Unlock Event:** Delayed flush job starts automatically, pushes chronologically at 5-10 rec/sec, and resumes cleanly after interruption.
- [ ] **Station Cap:** Station creation beyond `allowed_stations` is blocked with clear error message.
- [ ] **Remote Lock:** Remote lock command from `rajapi.com` takes effect within ~60s.
- [ ] **Audit Log:** Every lock/unlock event generates an immutable audit record.
