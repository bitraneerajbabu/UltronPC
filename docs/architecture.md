# UltrON Architecture Specification

## Overview
The system contains three major layers:
1. **Client platform**: Relies on Modbus/Serial to read local devices, processes telemetry locally, and aggregates it into 1-minute to daily averages.
2. **Supabase Central Database**: Cloud storage of telemetry, tenant definitions, activation logs, and command pipelines.
3. **Admin Panel**: Multitenant frontend dashboard for device provision and activation control.\n