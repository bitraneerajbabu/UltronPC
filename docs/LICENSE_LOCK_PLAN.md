# 🔐 UltrON License Protection & CPCB/SPCB Control System — Master Hardened Plan (`LICENSE_LOCK_PLAN.md`)

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

## 2. System Clock Anti-Tampering Defense & Recovery (Addressing Fix #1)

To prevent users in `offline_only` mode from setting the PC system clock backward to bypass license expiration:

### 🛡️ Clock Rollback Detection & Recovery Logic:
1. **High-Water Mark (`last_seen_timestamp`):** The local SQLite `system_state` table records the latest valid timestamp every minute during polling.
2. **Rollback Trigger:** If $\text{current\_system\_time} < \text{last\_seen\_timestamp} - 5\text{ minutes}$, UltrON flags `CLOCK_TAMPERED` and freezes CPCB push.
3. **Dual Recovery Paths:**
   - **Path A (Automatic Recovery):** Once the system clock is re-aligned (via Windows NTP sync or manual clock adjustment) such that $\text{current\_system\_time} \ge \text{last\_seen\_timestamp}$, `CLOCK_TAMPERED` is automatically cleared and CPCB push resumes.
   - **Path B (Manual Admin Override):** If a bad CMOS battery causes a large clock jump, an admin entering the `Master` password can execute **"Reset Time Benchmark"**. This updates `last_seen_timestamp` to the current system time and records a compliance audit log (`CLOCK_RESET_OVERRIDE`, actor, reason, old_ts, new_ts).

---

## 3. Deployment Mode & Backlog Isolation (Addressing Fix #3)

Stored in local client configuration (`config.py` / database settings):
```json
{
  "deployment_mode": "online | offline_only",
  "set_at": "installation_time via client setup"
}
```

### 🔄 Mode Transition Policy (`online` $\longleftrightarrow$ `offline_only`):
- **Admin Reconfiguration Only:** Switching modes requires entering the local `Master` / Admin password in Settings.
- **`offline_only` $\longrightarrow$ `online`:** Enables `rajapi_sync.py` loop, prompts for RajAPI Site Key, validates remotely.
- **Backlog Isolation Rule:** Switching modes alone does **NOT** trigger a backlog flush. Flush job is triggered **ONLY by an explicit Unlock / Renewal Event** when license state is `ACTIVE`.

| Mode | RajAPI Sync | License Validation | CPCB / SPCB Push | Alerts Destination |
|---|---|---|---|---|
| **`online`** | Active every 60s | Remote + 30-day grace fallback | Active when licensed | RajAPI Dashboard + Local UI |
| **`offline_only`** | Disabled entirely | Local `.lic` file (RSA-2048) | Never configured ("Not Set Up") | **Local Desktop UI Only** |

---

## 4. Hardware ID (HWID) Specifications

$$\text{HWID} = \text{SHA256}(\text{Motherboard UUID} + \text{CPU Serial} + \text{BIOS Serial})$$

- **Excluded:** MAC address is explicitly excluded (NIC swaps/VPNs cause instability).
- **Stable Fallback:** Uses **BIOS Serial Number** (`wmic bios get serialnumber`) if Motherboard UUID is missing.
- **Hardware Swap Policy:** Motherboard/BIOS replacement requires a free license re-issue from Sunshine Technologies.
- **UI Display:** Displayed with a 1-click **Copy HWID** button on the lock banner and Settings screen.

---

## 5. License Key Payload & Replay Protection

```json
{
  "license_id": "LIC-9F82-441A-BC01",
  "client_name": "Beger Paints Ltd",
  "hwid": "SUN-8F92-A410-BC77",
  "allowed_stations": 2,
  "deployment_mode": "online",
  "issue_date": "2026-07-22",
  "expiry_date": "2027-07-22",
  "signature": "RSA_2048_SIGNATURE_FROM_SUNSHINE_PRIVATE_KEY"
}
```

- **Replay Protection:** `license_id` is registered in local `applied_licenses` table to prevent re-using old/renamed `.lic` files.
- **RSA-2048 Validation:** Signed with Sunshine's private key, verified in-app using embedded public key.

---

## 6. License Manager Engine & State Guard

### State Machine:
- **`ACTIVE`** $\mid$ **`GRACE_PERIOD`** $\mid$ **`LOCKED`** $\mid$ **`EXPIRED`** $\mid$ **`CLOCK_TAMPERED`**

### Guard Logic Matrix:
```python
def is_cpcb_upload_allowed() -> bool:
    state = get_license_state()
    # GRACE_PERIOD explicitly allows CPCB push while logging a 30-day countdown warning
    if state in ("ACTIVE", "GRACE_PERIOD"):
        return True
    return False  # LOCKED, EXPIRED, CLOCK_TAMPERED freeze push
```

---

## 7. Bounded Backlog Queue & FIFO Audit Trail (Addressing Fix #2)

- **Storage Table:** `PendingUpload` queue table.
- **Retention Cap:** 12 months of push entries (underlying `historical_data` table remains permanent).
- **FIFO Overflow Policy:** When capacity is reached, the **oldest pending push record is dropped** (FIFO).
- **Compliance Audit Log:** Every dropped record writes an immutable audit record:
  ```json
  {
    "event_type": "PUSH_BACKLOG_DROPPED_FIFO",
    "tag_name": "PM2_5",
    "record_timestamp": "2025-07-22T01:00:00Z",
    "dropped_at": "2026-07-22T02:25:00Z",
    "reason": "12-month backlog FIFO queue capacity reached"
  }
  ```

---

## 8. Controlled Delayed Flush & HTTP Retry Backoff

- **Rate-Limited Flush:** Flushes at 5–10 records/sec upon unlock.
- **HTTP Error Backoff:** Exponential backoff (5s, 10s, 20s, 60s, max 300s) if CPCB responds with HTTP 429/5xx errors.
- **Resumable:** Tracks `last_flushed_record_id` in SQLite.
- **UI Progress:** Displays *"Flushing backlog: 1,240 / 3,800 records"*.

---

## 9. Local & Remote Audit Logging

Every license event (`lock`, `unlock`, `renew`, `clock_tamper`, `clock_override`, `mode_switch`, `fifo_drop`) is recorded:
- **`online` Mode:** Logged to local `audit_logs` SQLite table AND pushed immediately to RajAPI.
- **`offline_only` Mode:** Logged to local `audit_logs` SQLite table (append-only, cryptographically hashed). Synced to RajAPI if plant ever connects online.

---

## 10. Verification & Test Checklist

- [ ] **Clock Tamper Auto Recovery:** Set clock back 1 hour $\rightarrow$ verify `CLOCK_TAMPERED` state $\rightarrow$ advance clock forward $\rightarrow$ verify automatic recovery to `ACTIVE`.
- [ ] **Clock Tamper Admin Override:** Execute Admin Reset Time Benchmark $\rightarrow$ verify `CLOCK_RESET_OVERRIDE` audit record created.
- [ ] **FIFO Audit Log Test:** Overflow backlog queue $\rightarrow$ verify `PUSH_BACKLOG_DROPPED_FIFO` audit record generated per dropped point.
- [ ] **Mode Switch Backlog Test:** Switch `offline_only` $\rightarrow$ `online` with pending backlog $\rightarrow$ verify flush does NOT start until valid license unlock event occurs.
