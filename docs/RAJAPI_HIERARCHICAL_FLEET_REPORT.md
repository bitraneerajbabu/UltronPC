# RajAPI — Hierarchical Fleet / Telemetry View Implementation Report

## Overview
This report documents the implementation of the Super Admin Hierarchical Fleet View for RajAPI, bringing clear structural visibility (Industry → Station → Device → Parameter) across all UltrON deployments.

## Backend Implementation
- **New API Endpoint:** `GET /api/v1/fleet/hierarchy`
  - Created inside `server/backend/app/api/endpoints/fleet.py`.
  - Registered in `server/backend/app/main.py`.
  - Designed with an efficient `DISTINCT ON (t.parameter_id)` database query to fetch the latest telemetry state in a single pass without the N+1 problem.
  - Groups data logically into Industry/Plant → Station → Device → Parameter.

## Frontend Implementation
- **Types Update:** Added Hierarchy interfaces to `types.ts` (`HierarchyIndustry`, `HierarchyStation`, `HierarchyDevice`, `HierarchyParameter`).
- **API Client:** Added `fetchFleetHierarchy` to the UI API library, retrieving data with Super Admin authorization.
- **App State Integration:** Modified `App.tsx`'s `refreshData` polling logic to fetch and maintain `hierarchy` state every 30 seconds. Propagated this state to Dashboard and Site Detail screens.
- **Dashboard Enhancements:**
  - Added new dynamic KPI tracking total Industries, Stations, Devices, Online Devices, and Offline Devices.
  - Replaced the generic table with an **INDUSTRY / PLANT OVERVIEW** featuring counts for Stations, Devices, and split online/offline totals.
- **Site Detail / Hierarchy Tree:**
  - Restructured `SiteDetailScreen.tsx` to remove the flat parameter list.
  - Built an expandable Accordion tree for Station → Device → Parameter.
  - Applied the "Dark Teal" visual identity (`#0F766E`) to selected hierarchy nodes and accents.
  - Handled "NEVER SYNCED" states natively.
  - Merged the 30-second structural baseline with the 10-second live telemetry poll for real-time accuracy without structural latency.

## Environment Validation
- Inspected the production environment via `pi@raj.local`.
- Confirmed the use of `rajapi-python.service` and its dependencies.
- Changes were verified through a strict read-only audit initially and safely built out following production guidelines.

**STATUS:** IMPLEMENTATION COMPLETE — WAITING FOR DEPLOY APPROVAL.
