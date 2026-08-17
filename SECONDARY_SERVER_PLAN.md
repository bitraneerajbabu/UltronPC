# 📡 RajAPI Secondary Server & High Availability (HA) Plan

## 1. Executive Summary & Goal
To ensure **99.99% system availability** and **zero data loss**, RajAPI will support a dual-location redundant server architecture:
- **Primary Server (Pi #1):** Located in Room (`https://rajapi.com`)
- **Secondary Server (Pi #2):** Located in Office (`https://backup.rajapi.com`)

---

## 2. System Architecture

```
                                  ┌───────────────────────────────┐
                                  │   UltrON Client Plant PCs     │
                                  └──────────────┬────────────────┘
                                                 │
                                     (Dual Telemetry Push)
                                                 │
                     ┌───────────────────────────┴───────────────────────────┐
                     ▼                                                       ▼
  ┌─────────────────────────────────────┐                 ┌─────────────────────────────────────┐
  │         PRIMARY SERVER (Pi #1)       │                 │       SECONDARY SERVER (Pi #2)      │
  ├─────────────────────────────────────┤                 ├─────────────────────────────────────┤
  │ Location: Room                      │                 │ Location: Office                    │
  │ Domain: https://rajapi.com          │                 │ Domain: https://backup.rajapi.com   │
  │ Database: PostgreSQL (ultron_central)│                 │ Database: PostgreSQL (ultron_central)│
  └─────────────────────────────────────┘                 └─────────────────────────────────────┘
```

---

## 3. Dual-Push Synchronization Strategy
1. **Client-Side Autopilot (`server_push.py`)**:
   - Pushes live telemetry to `settings.RAJAPI_PRIMARY_URL` (`rajapi.com`).
   - Simultaneously pushes live telemetry to `settings.RAJAPI_SECONDARY_URL` (`backup.rajapi.com`).
2. **Automatic Buffer & Retry**:
   - If one server is offline (e.g. power cut or internet outage at one location), the client buffers points locally and retries the offline server upon reconnection.

---

## 4. Cloudflare Tunnel Configuration
- **Pi #1 (Room):** `cloudflared` tunnel bound to `rajapi.com`.
- **Pi #2 (Office):** `cloudflared` tunnel bound to `backup.rajapi.com`.
- **Automatic Failover Option:** Cloudflare Health Checks automatically reroute `rajapi.com` traffic to Pi #2 if Pi #1 stops responding for > 30 seconds.

---

## 5. Next Steps for Discussion
- [ ] Setup Cloudflare tunnel on Office Pi #2 (`backup.rajapi.com`).
- [ ] Add `RAJAPI_SECONDARY_URL` configuration to UltrON client settings.
- [ ] Test dual-push sync and failover under simulated power outage.
