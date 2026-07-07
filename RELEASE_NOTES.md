## v1.0.63 — KPI Cards Redesign & Bug Fixes

### Features
- **KPI Cards redesigned**: Bordered glass cards with icon pills, colored left borders matching each metric (teal/green/red/amber/blue)
- **Sensor cards**: Colored left border matching parameter category (violet for PM, orange for CO, etc.) instead of full border
- **ErrorBoundary**: Global React error boundary with styled fallback UI + reload button
- **Bug 2 fix**: Login token guard — returns early with toast if access_token is missing
- **Bug 7 fix**: checkApi useEffect deps added (stationId, dateFrom, dateTo, API_BASE)
- **Bug 8 fix**: Stale closure in mockWatermark fixed
- **Windrose screen**: Auth 401/403 handling + three-state messaging
- **Analytical reports**: Auth added to 7 backend endpoints
- **DataQuality enum fix**: Correct CPCB quality codes (bad=B, uncertain=I, sensor_fail=F, maintenance=M)

### Design
- Full DESIGN.md with glass-morphism design system (colors, typography, components, motion)
- Windrose screen uses design tokens instead of hardcoded colors
- .card CSS aligned with GLASS_CARD tokens

### Previous Releases

### Bug Fixes
- **Database migration**: Added missing ALTER TABLE migrations for equest_hex, esponse_delimiter, csv_delimiter, csv_timestamp_col on devices table
- Added missing migration columns for server_config (live_url, delay_url), server_parameter_mapping (pi_id, pi_name, pi_password, pi_vname, pi_unit), and cpcb_station_config (station_code, export_enabled, export_path, cpcb_enabled, 	imezone, etention_count)
- Fixes "no such column: devices.request_hex" error when upgrading from older versions

### Features
- **Restart App button** added in Settings page

### Previous v1.0.36
- Scaling bug fix, performance optimization, security audit fixes
