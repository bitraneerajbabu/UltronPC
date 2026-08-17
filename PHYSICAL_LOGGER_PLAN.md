# 📟 Sunshine Technologies — Physical IoT Hardware & M2M Datalogger Roadmap (`PHYSICAL_LOGGER_PLAN.md`)

## 1. Executive Summary & Vision
While UltrON currently operates as a PC-based datalogger (`UltrON.exe`), the RajAPI architecture is designed to support **manufactured physical IoT hardware dataloggers, standalone M2M RTU boards, and embedded ARM gateways** seamlessly without changing the central server.

---

## 2. Hardware Architecture & Connectivity

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │               SUNSHINE PHYSICAL IoT / M2M DATALOGGER                    │
 │ - Hardware: STM32 / ESP32-S3 / Linux ARM Industrial Board               │
 │ - Cellular: Integrated 4G CAT-1 / M2M Modem (Quectel / SIM7600)          │
 │ - Physical I/O: RS485 Modbus RTU (Isolated), 4-20mA Analog, DI Channels   │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              │ (Ultra-Low Bandwidth MQTT / HTTPS Stream)     │
              ▼                                               ▼
 ┌──────────────────────────┐                   ┌──────────────────────────┐
 │ MQTT GATEWAY (Port 1883) │                   │ HTTPS REST (Port 443)    │
 └────────────┬─────────────┘                   └────────────┬─────────────┘
              │                                              │
              └───────────────────────┬──────────────────────┘
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │       RajAPI Central Vault (rajapi.com)         │
             └─────────────────────────────────────────────────┘
```

---

## 3. Communication Protocols

| Protocol | Transport | Target Device | Advantages |
|---|---|---|---|
| **HTTPS REST** | Port 443 | Windows PC / ARM Gateway | Standard web payload, easy firewall traversal |
| **MQTT / TLS** | Port 1883 / 9001 | 4G M2M Embedded Hardware | **95% lower SIM data consumption**, battery friendly |

---

## 4. Hardware Identification & Licensing Security
- **Hardware ID:** Physical loggers authenticate using their **4G Modem IMEI** or **Microcontroller Chip Unique ID**.
- **Auto-Onboarding:** Plugging in a new Sunshine Physical Logger automatically registers its IMEI on `rajapi.com`.
- **Remote Kill-Switch:** Unpaid AMC or lost hardware can be remotely locked via MQTT command.

---

## 5. Firmware Over-The-Air (FOTA) Engine
- RajAPI's OTA Manager will serve compiled Microcontroller Binary files (`.bin` / `.hex`).
- Physical loggers download firmware chunks over MQTT/HTTPS, perform checksum validation, and flash themselves silently in the background.

---

## 6. Product Roadmap Phases

- [x] **Phase 1 (Current):** PC-based Datalogger (`UltrON.exe` on Windows).
- [ ] **Phase 2 (Near-Term):** Embedded Industrial ARM Gateway (Linux / Yocto / Raspberry Pi CM4 enclosure).
- [ ] **Phase 3 (Long-Term):** Sunshine Manufactured Microcontroller PCB Board (4G M2M RTU with isolated RS485 & 4-20mA inputs).
