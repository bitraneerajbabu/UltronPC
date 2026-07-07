---
name: E2E Testing for UltrON
description: Guidelines and instructions for performing End-to-End (E2E) testing on the UltrON platform.
---
# E2E Testing Guidelines

When asked to "run E2E tests", "test the UI", or "verify end-to-end" on the UltrON platform, follow these procedures:

## 1. Tooling
- Always use the `browser_subagent` tool to perform manual AI-driven testing.
- The standard local URL for the frontend is `http://localhost:5173`.

## 2. Core Flows to Test
When performing a full E2E test, ensure you cover the following user flows:
- **Authentication:** Navigate to the login page, bypass or complete login (UltrON currently bypasses license checks to go straight to Master login).
- **Dashboard Telemetry:** Ensure live telemetry values load.
- **Navigation:** Test clicking through the main sidebar links (Devices & Config, CPCB, Trends Analysis, Reports Generator).
- **Data Persistence:** If instructed to test a specific flow (e.g., adding a device), verify that the UI correctly updates and the database backend saves the data.

## 3. Reporting
- Always capture screenshots of any UI errors or layout issues.
- Summarize your testing results in a clear markdown artifact (e.g., `e2e_test_results.md`).
- Highlight any React console errors or network 4xx/5xx errors you observe during the session.
