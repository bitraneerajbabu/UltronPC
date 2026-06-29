---
name: Shift Protocol & DI Testing
description: Guidelines and instructions for testing Modbus Discrete Inputs (DI) and Shift Protocols in UltrON.
---
# Shift Protocol & DI Testing Guidelines

When asked to "test shift protocol", "verify DI", or handle "discrete inputs", follow these rules:

## 1. Discrete Input (DI) Testing Rules
- **Modbus Protocol Mapping:** When testing DI, ensure the parameter is mapped to Modbus Function Code 2 (Discrete Inputs) or Function Code 1 (Coils).
- **Data Type:** Verify that the `data_type` in the database is set appropriately (usually `bool` or `uint16` if packed).
- **State Verification:** Validate that the system correctly interprets the 0 and 1 states. Ensure that the dashboard and telemetry API correctly translate these to ON/OFF or the desired alarm states without applying unnecessary scale factors.

## 2. Shift Protocol Rules
- **Shift Definitions:** Unless specified otherwise, assume the standard three shifts for analytical reports:
  - Morning Shift: 06:00 to 14:00
  - Evening Shift: 14:00 to 22:00
  - Night Shift: 22:00 to 06:00 (crosses midnight)
- **Data Boundary Testing:** When testing shift averages or totals, strictly verify the boundary conditions (e.g., data recorded exactly at 14:00:00).
- **Night Shift Logic:** Pay special attention to the Night Shift logic, as data spans across two calendar days. Ensure SQL queries handle `timestamp >= '22:00'` of Day 1 and `< '06:00'` of Day 2 correctly.
