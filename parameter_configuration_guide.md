# KTPP2 Parameter Configuration Guide

This guide provides the exact settings you need to enter into the **UltrON UI** to map all the devices and parameters found in your legacy `D:\KTPP2\ultron.CFG` file.

> [!TIP]
> **Modbus Registers for ENVEA Analyzers**
> ENVEA (Environment S.A.) analyzers typically store their primary live concentration value as a **32-bit Float** starting at **Input Register 0** (or sometimes 100). If you get garbage values, try flipping the **Byte Order** (e.g., from ABCD to CDAB).

---

## 1. NOx Analyzer (AF22) - UDP Custom Protocol
This device uses the older ASCII broadcast protocol we tested earlier with Hercules.

**Device Settings:**
*   **Protocol:** UDP Custom (or TCP Custom, depending on what worked in Hercules)
*   **IP Address:** `172.21.36.206`
*   **Port:** `8003`

**Parameters:**
Because the device returns a space-separated string like `AF2216260628M00 35 0 0 43`, you map the parameters using the **Field Index** (0-based).
| Tag Name | Type | Field Index | Unit |
| :--- | :--- | :--- | :--- |
| `NO_AQ3_KTPP` | Float | 1 | ug/m3 |
| `NO2_AQ3_KTPP`| Float | 2 | ug/m3 |
| `NOX_AQ3_KTPP`| Float | 3 | ppb |

*(Note: Adjust the field indexes 1, 2, or 3 based on which value corresponds to NO, NO2, and NOx in the raw string).*

---

## 2. Modbus TCP Analyzers
All of the following analyzers operate natively on **Modbus TCP**. Add each one as a new device with the protocol set to `Modbus TCP`.

### SO2 Analyzer (AC32)
*   **IP Address:** `172.21.36.205`
*   **Port:** `8002`
*   **Slave ID:** `1`
*   **Parameter:** `SO2_AQ3_KTPP` 
    *   **Function Code:** 04 Input Register
    *   **Start Address:** `0` (Standard ENVEA starting address)
    *   **Data Type:** Float32
    *   **Unit:** ppb

### CO / CO2 Analyzer (CO12)
*   **IP Address:** `172.21.36.207`
*   **Port:** `8003`
*   **Slave ID:** `1`
*   **Parameters:** `CO_AQ3_KTPP` (ppb) & `CO2_AQ3_KTPP` (ppb)
    *   **Function Code:** 04 Input Register
    *   *You will need to check the manual for this specific analyzer to see if CO is at address `0` and CO2 is at address `2`, or vice versa.*

### PM10 Analyzer
*   **IP Address:** `172.21.36.203`
*   **Port:** `8004`
*   **Slave ID:** `1`
*   **Parameter:** `PM10_AQ3_KTPP` (ppb)
    *   **Function Code:** 04 Input Register
    *   **Start Address:** `0`
    *   **Data Type:** Float32

### PM2.5 Analyzer (M105)
*   **IP Address:** `172.21.36.204`
*   **Port:** `8008`
*   **Slave ID:** `1`
*   **Parameter:** `PM25_AQ3_KTPP` (ppb)
    *   **Function Code:** 04 Input Register
    *   **Start Address:** `0`
    *   **Data Type:** Float32

### Ozone Analyzer (O342)
*   **IP Address:** `172.21.36.209`
*   **Port:** `8006`
*   **Slave ID:** `1`
*   **Parameter:** `O3_AQ3_KTPP` (ppb)
    *   **Function Code:** 04 Input Register
    *   **Start Address:** `0`
    *   **Data Type:** Float32

### Secondary CO2 Analyzer (CO12)
*   **IP Address:** `172.21.36.208`
*   **Port:** `8003`
*   **Slave ID:** `1`
*   **Parameter:** `CO2_AQ3_KTP1` (mg/m3)

---

## 3. Weather / Meteorological Sensors
In the legacy configuration, the following sensors are marked as Analog (`ANA`) or Pulse (`IMP`) inputs. This means they are wired physically into a Data Logger or I/O Module (likely the main ENVEA logger box), rather than having their own IP addresses.

*   `WS_AQ3_KTPP` (Wind Speed)
*   `WD_AQ3_KTPP` (Wind Direction)
*   `TEMP_AQ3_KTPP` (Temperature)
*   `RH_AQ3_KTPP` (Relative Humidity)
*   `RS_AQ3_KTPP` (Solar Radiation)
*   `RG_AQ3_KTPP` (Rain Gauge)

> [!IMPORTANT]
> **To add these to UltrON:**
> You need to identify the IP address of the central data logger/PLC they are wired into. You will add that IP as a **Modbus TCP** device in UltrON, and then map each sensor to its corresponding Analog Input register (e.g., Register 30001, 30002, etc. depending on the logger's manual).
