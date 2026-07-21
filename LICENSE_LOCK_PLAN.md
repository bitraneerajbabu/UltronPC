# 🔐 UltrON License Protection & CPCB/SPCB Control System — Final Hardened Plan (`LICENSE_LOCK_PLAN.md`)

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

## 2. System Clock Anti-Tampering Defense (Addressing Gap #1)

To prevent users in `offline_only` mode from setting the PC system clock backward to bypass license expiration:

### 🛡️ Clock Rollback Detection Algorithm:
1. **High-Water Mark (`last_seen_timestamp`):** The local SQLite `system_state` table records the latest valid timestamp every minute during polling.
2. **Rollback Check:** On every validation run, if $\text{current\_system\_time} < \text{last\_seen\_timestamp} - 5\text{ minutes}$, UltrON flags `CLOCK_TAMPERED`.
3. **Enforcement:** If `CLOCK_TAMPERED` is triggered:
   - License state transitions immediately to `LOCKED`.
   - CPCB/SPCB outbound push is frozen.
   - Desktop dashboard displays: ⚠️ *"System Clock Tampering Detected. Re-align system time or contact Sunshine Technologies."*
4. **Recovery:** Re-aligning the system clock to a timestamp $\ge \text{last\_seen\_timestamp}$ (or applying a new signed `.lic` file) restores normal validation.

---

## 3. Deployment Mode & Reconfiguration Path (Addressing Gap #5)

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
- **`online` $\longrightarrow$ `offline_only`:** Disables `rajapi_sync.py` loop, prompts for valid `.lic` file, clears remote heartbeat schedules.

| Mode | RajAPI Sync | License Validation | CPCB / SPCB Push | Alerts Destination |
|---|---|---|---|---|
| **`online`** | Active every 60s | Remote + 30-day grace fallback | Active when licensed | RajAPI Dashboard + Local UI |
| **`offline_only`** | Disabled entirely | Local `.lic` file (RSA-2048) | Never configured ("Not Set Up") | **Local Desktop UI Only** (Addressing Gap #4) |

---

## 4. Hardware ID (HWID) Specifications (Addressing Gap #2)

$$\text{HWID} = \text{SHA256}(\text{Motherboard UUID} + \text{CPU Serial} + \text{BIOS Serial})$$

- **Excluded:** MAC address is explicitly excluded (NIC swaps/VPNs cause instability).
- **Stable Fallback:** Uses **BIOS Serial Number** (`wmic bios get serialnumber`) if Motherboard UUID is missing.
- **Hardware Swap Policy:** Documented policy states that motherboard/BIOS replacement requires a free license re-issue from Sunshine Technologies.
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

## 6. License Manager Engine & State Guard (Addressing Gap #7)

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

### Expiry Warning Progression (Both Modes):
- **30 days before expiry:** Dismissible notification banner.
- **14 days before expiry:** Non-dismissible, non-blocking header banner.
- **0 days / Locked:** Full red lock banner on EXE dashboard.

---

## 7. Bounded Backlog Queue & Overflow Policy (Addressing Gap #3)

- **Storage Table:** `PendingUpload` queue table.
- **Retention Cap:** 12 months of push entries (underlying `historical_data` table remains permanent).
- **FIFO Overflow Policy:** When capacity is reached, the **oldest pending push record is dropped** (FIFO), preserving recent compliance data.
- **Alerting:** Emits `BACKLOG_OVERFLOW_WARNING` badge on UI when capacity reaches 90%.

---

## 8. Controlled Delayed Flush & HTTP Retry Backoff

- **Rate-Limited Flush:** Flushes at 5–10 records/sec upon unlock.
- **HTTP Error Backoff:** If CPCB server responds with HTTP 429/5xx, flush pauses and retries with exponential backoff (5s, 10s, 20s, 60s, max 300s).
- **Resumable:** Tracks `last_flushed_record_id` in SQLite so interrupted flushes resume cleanly.
- **UI Progress:** Displays *"Flushing backlog: 1,240 / 3,800 records"*.

---

## 9. Local & Remote Audit Logging (Addressing Gap #6)

Every license event (`lock`, `unlock`, `renew`, `clock_tamper`, `mode_switch`) is recorded:
- **`online` Mode:** Logged to local `audit_logs` SQLite table AND pushed immediately to RajAPI.
- **`offline_only` Mode:** Logged to local `audit_logs` SQLite table (append-only, cryptographically hashed). If the plant later transitions to `online`, historical audit logs are automatically synced to RajAPI.

---

## 10. Verification & Test Checklist

- [ ] **Clock Rollback Test:** Manually set PC clock back 1 hour in `offline_only` mode $\rightarrow$ Confirm system transitions to `CLOCK_TAMPERED` and locks push.
- [ ] **HWID Stability Test:** Verify BIOS serial fallback works cleanly without MAC address dependencies.
- [ ] **Mode Transition Test:** Switch `offline_only` $\rightarrow$ `online` in Admin Settings $\rightarrow$ Confirm RajAPI sync loop activates cleanly.
- [ ] **Grace Period Logic:** Disconnect internet in `online` mode $\rightarrow$ Confirm `is_cpcb_upload_allowed()` returns `True` during 30-day grace period.
- [ ] **FIFO Backlog Test:** Fill backlog to cap $\rightarrow$ Confirm oldest entries drop first and alert badge renders.
- [ ] **Local Audit Logging:** Perform license actions in `offline_only` mode $\rightarrow$ Confirm immutable records written to local `audit_logs` table.
