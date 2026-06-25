## v1.0.37 — DB Migration Fix

### Bug Fixes
- **Database migration**: Added missing ALTER TABLE migrations for equest_hex, esponse_delimiter, csv_delimiter, csv_timestamp_col on devices table
- Added missing migration columns for server_config (live_url, delay_url), server_parameter_mapping (pi_id, pi_name, pi_password, pi_vname, pi_unit), and cpcb_station_config (station_code, export_enabled, export_path, cpcb_enabled, 	imezone, etention_count)
- Fixes "no such column: devices.request_hex" error when upgrading from older versions

### Features
- **Restart App button** added in Settings page

### Previous v1.0.36
- Scaling bug fix, performance optimization, security audit fixes
