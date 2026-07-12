# UltrON — Backend Schema Documentation

**Version:** 1.0  
**Date:** 2026-07-13  

---

## 1. Client Database (SQLite — `ultron.db`)

**Driver:** `aiosqlite` (async) + `sqlite3` (sync)  
**Mode:** WAL (Write-Ahead Logging) for concurrent access  
**File location:** `{APP_DIR}/ultron.db` (alongside `.env`)

### 1.1 Entity Relationship Diagram

```
stations ──1:N──> devices ──1:N──> parameters ──1:N──> live_data
                                                       ├──> historical_data
                                                       ├──> averages
                                                       ├──> alarms
                                                       └──> server_parameter_mapping
                                                              └──> N:1 ── server_config

stations ──1:1──> cpcb_station_config

calibration_jobs ──1:N──> calibration_results
                    └──> calibration_approvals
      │
      └──> N:1 ── stations
      └──> N:1 ── parameters

pending_uploads ──N:1──> server_config

broadcasts (standalone)

system_logs (standalone)

users (standalone)

plant_settings (standalone — singleton row)

cpcb_parameter_mapping (standalone — global mapping table)

cpcb_export_records (standalone — generated data)

cpcb_export_logs (standalone — generated audit trail)
```

### 1.2 Full Table Schemas

---

#### `stations`

Core entity representing a monitoring location (stack, ambient station, etc.).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `name` | VARCHAR(120) | NOT NULL UNIQUE INDEX | Display name, CPCB-referenced |
| `station_type` | VARCHAR(20) | DEFAULT 'AAQMS' | Enum: AAQMS, EMS, WEATHER, NOISE, WATER, EFFLUENT, CUSTOM |
| `location` | VARCHAR(250) | NULLABLE | Free-text location |
| `latitude` | VARCHAR(30) | NULLABLE | |
| `longitude` | VARCHAR(30) | NULLABLE | |
| `description` | TEXT | NULLABLE | |
| `protocol` | VARCHAR(30) | DEFAULT 'modbus_tcp' | Default connection protocol |
| `host` | VARCHAR(100) | NULLABLE | Default host override |
| `port` | INTEGER | DEFAULT 502 | Default port override |
| `serial_port` | VARCHAR(30) | NULLABLE | Default serial port override |
| `baud_rate` | INTEGER | DEFAULT 9600 | Default baud rate override |
| `status` | VARCHAR(20) | DEFAULT 'offline' | Enum: online, offline, fault, maintenance |
| `is_active` | BOOLEAN | DEFAULT 1 | Soft delete / disable |
| `last_seen` | DATETIME | NULLABLE | Last successful poll timestamp |
| `last_error` | TEXT | NULLABLE | Last error message |
| `created_at` | DATETIME | DEFAULT datetime.utcnow | |
| `updated_at` | DATETIME | DEFAULT datetime.utcnow ONUPDATE | |

**Relationships:**
- `devices[]` → Device (cascade delete)

---

#### `devices`

Physical or logical data source (analyser, PLC, sensor, etc.).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `station_id` | INTEGER | NOT NULL FK → stations(id) ON DELETE CASCADE INDEX | Parent station |
| `name` | VARCHAR(120) | NOT NULL INDEX | Device display name |
| `device_type` | VARCHAR(20) | DEFAULT 'ANALYZER' | Enum: ANALYZER, PLC, DATALOGGER, RTU, SENSOR, CONTROLLER, CUSTOM |
| `protocol` | VARCHAR(20) | DEFAULT 'modbus_tcp' | Enum: modbus_tcp, modbus_rtu, tcp_custom, udp_custom, csv |
| `host` | VARCHAR(100) | NULLABLE | TCP/IP hostname or IP |
| `port` | INTEGER | NULLABLE | TCP/UDP port |
| `slave_id` | INTEGER | DEFAULT 1 | Modbus slave ID |
| `serial_port` | VARCHAR(30) | NULLABLE | COM port (e.g. COM3) |
| `baud_rate` | INTEGER | DEFAULT 9600 | Serial baud rate |
| `data_bits` | INTEGER | DEFAULT 8 | Serial data bits |
| `parity` | VARCHAR(5) | DEFAULT 'N' | Serial parity: N/E/O |
| `stop_bits` | INTEGER | DEFAULT 1 | Serial stop bits |
| `csv_path` | VARCHAR(500) | NULLABLE | Full path to CSV file |
| `csv_folder` | VARCHAR(500) | NULLABLE | Watch folder for dated CSV files |
| `csv_filename_pattern` | VARCHAR(200) | NULLABLE | Pattern with {date} placeholder |
| `csv_delimiter` | VARCHAR(5) | DEFAULT ',' | CSV column delimiter |
| `csv_timestamp_col` | INTEGER | NULLABLE | Column index with timestamp |
| `request_hex` | VARCHAR(500) | NULLABLE | Raw hex request for TCP/UDP custom |
| `response_delimiter` | VARCHAR(20) | DEFAULT 'newline' | Response frame delimiter |
| `poll_interval` | INTEGER | DEFAULT 5 | Polling interval in seconds |
| `timeout` | INTEGER | DEFAULT 5 | Connection/read timeout in seconds |
| `retry_count` | INTEGER | DEFAULT 3 | Retries on failure |
| `is_active` | BOOLEAN | DEFAULT 1 | Enable/disable polling |
| `status` | VARCHAR(20) | DEFAULT 'offline' | online/offline/fault |
| `last_poll` | DATETIME | NULLABLE | Last successful poll |
| `last_error` | TEXT | NULLABLE | Last error message |
| `created_at` | DATETIME | DEFAULT datetime.utcnow | |
| `updated_at` | DATETIME | DEFAULT datetime.utcnow ONUPDATE | |

**Relationships:**
- `station` → Station (parent)
- `parameters[]` → Parameter (cascade delete)

---

#### `parameters`

A measured variable — register mapping + alarm thresholds + parse config.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `device_id` | INTEGER | NOT NULL FK → devices(id) ON DELETE CASCADE INDEX | Parent device |
| `name` | VARCHAR(120) | NOT NULL INDEX | Human-readable name |
| `tag_name` | VARCHAR(60) | NOT NULL INDEX | Short unique tag (e.g. PM10, SO2) |
| `description` | TEXT | NULLABLE | |
| `unit` | VARCHAR(30) | NULLABLE | µg/m³, ppm, °C, etc. |
| `register_type` | VARCHAR(20) | DEFAULT 'holding' | Enum: holding, input_reg, coil, discrete_input |
| `register_address` | INTEGER | NOT NULL | Starting register address (0-based) |
| `register_count` | INTEGER | DEFAULT 2 | Number of registers to read |
| `data_type` | VARCHAR(20) | DEFAULT 'float32' | Enum: float32, int16, uint16, int32, uint32, int64, bool, string |
| `byte_order` | VARCHAR(20) | DEFAULT 'big' | Enum: big, little, big_swap, little_swap |
| `scale_factor` | FLOAT | DEFAULT 1.0 | value × scale + offset |
| `offset` | FLOAT | DEFAULT 0.0 | value × scale + offset |
| `min_valid` | FLOAT | NULLABLE | Data quality range min |
| `max_valid` | FLOAT | NULLABLE | Data quality range max |
| `alarm_low_low` | FLOAT | NULLABLE | Emergency low threshold |
| `alarm_low` | FLOAT | NULLABLE | Warning low threshold |
| `alarm_high` | FLOAT | NULLABLE | Warning high threshold |
| `alarm_high_high` | FLOAT | NULLABLE | Emergency high threshold |
| `alarm_severity` | VARCHAR(20) | DEFAULT 'warning' | Enum: info, warning, critical, emergency |
| `alarm_enabled` | BOOLEAN | DEFAULT 1 | Enable alarm evaluation |
| `alarm_deadband` | FLOAT | DEFAULT 0.0 | Hysteresis window |
| `parse_method` | VARCHAR(30) | DEFAULT 'csv_col' | TCP/UDP parse method: csv_col, position, regex, delimiter, length_prefix |
| `parse_config` | TEXT | NULLABLE | JSON config for parser |
| `host` | VARCHAR(100) | NULLABLE | Connection override per param |
| `port` | INTEGER | NULLABLE | Connection override per param |
| `serial_port` | VARCHAR(50) | NULLABLE | Connection override per param |
| `baud_rate` | INTEGER | NULLABLE | Connection override per param |
| `data_bits` | INTEGER | NULLABLE | Connection override per param |
| `parity` | VARCHAR(5) | NULLABLE | Connection override per param |
| `stop_bits` | INTEGER | NULLABLE | Connection override per param |
| `slave_id` | INTEGER | NULLABLE | Connection override per param |
| `display_order` | INTEGER | DEFAULT 0 | Sort order in UI |
| `is_active` | BOOLEAN | DEFAULT 1 | Enable/disable polling |
| `created_at` | DATETIME | DEFAULT datetime.utcnow | |
| `updated_at` | DATETIME | DEFAULT datetime.utcnow ONUPDATE | |

**Relationships:**
- `device` → Device (parent)
- `live_data[]` → LiveData (cascade delete)
- `historical_data[]` → HistoricalData (cascade delete)
- `averages[]` → Averages (cascade delete)
- `alarms[]` → Alarm (cascade delete)
- `server_mappings[]` → ServerParameterMapping (cascade delete)
- `calibration_jobs[]` → CalibrationJob (cascade delete)

---

#### `live_data`

Single latest row per parameter (hypertable-style upsert).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `parameter_id` | INTEGER | PK (composite #1) FK → parameters(id) ON DELETE CASCADE INDEX | |
| `timestamp` | DATETIME | PK (composite #2) INDEX | |
| `value` | FLOAT | NULLABLE | Scaled value |
| `raw_value` | FLOAT | NULLABLE | Pre-scaling raw value |
| `quality` | VARCHAR(5) | DEFAULT 'U' | DataQuality enum char |
| `source` | VARCHAR(30) | DEFAULT 'poll' | poll/calc/manual |

**Composite PK:** `(parameter_id, timestamp)`  
**Indexes:** `(parameter_id, timestamp)`, `(timestamp)`  
**Access pattern:** Upsert on each poll. Only latest row per parameter matters (highest timestamp).

---

#### `historical_data`

Time-series raw readings.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `parameter_id` | INTEGER | PK (composite #1) FK → parameters(id) ON DELETE CASCADE INDEX | |
| `timestamp` | DATETIME | PK (composite #2) INDEX | |
| `value` | FLOAT | NULLABLE | |
| `raw_value` | FLOAT | NULLABLE | |
| `quality` | VARCHAR(5) | DEFAULT 'U' INDEX | Indexed for quality queries |
| `source` | VARCHAR(30) | DEFAULT 'poll' | |

**Composite PK:** `(parameter_id, timestamp)`  
**Indexes:** `(parameter_id, timestamp)`, `(timestamp)`, `(timestamp, quality)`  
**Access pattern:** Bulk insert on each poll. Periodic cleanup of rows older than retention period.

---

#### `averages`

Pre-computed aggregate values across time windows.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `parameter_id` | INTEGER | PK (composite #1) FK → parameters(id) ON DELETE CASCADE INDEX | |
| `timestamp` | DATETIME | PK (composite #2) INDEX | Window start time |
| `avg_type` | VARCHAR(15) | PK (composite #3) INDEX | Enum: raw, avg_1min, avg_5min, ... avg_daily |
| `value` | FLOAT | NULLABLE | Mean value |
| `quality` | VARCHAR(5) | DEFAULT 'U' | |
| `source` | VARCHAR(30) | DEFAULT 'calc' | |

**Composite PK:** `(parameter_id, timestamp, avg_type)`  
**Indexes:** `(parameter_id, avg_type, timestamp)`, `(timestamp)`  
**Access pattern:** Batch upsert every 60s. Queried by UI for trend charts.

---

#### `alarms`

Lifecycle-tracked alarm events.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `parameter_id` | INTEGER | NOT NULL FK → parameters(id) ON DELETE CASCADE INDEX | |
| `severity` | VARCHAR(20) | NOT NULL | info / warning / critical / emergency |
| `message` | TEXT | NOT NULL | Human-readable alarm description |
| `threshold_type` | VARCHAR(20) | NULLABLE | low_low / low / high / high_high |
| `threshold_value` | FLOAT | NULLABLE | The threshold that was crossed |
| `actual_value` | FLOAT | NULLABLE | The value at trigger time |
| `state` | VARCHAR(20) | DEFAULT 'active' | active / acknowledged / cleared |
| `triggered_at` | DATETIME | DEFAULT datetime.utcnow INDEX | |
| `acknowledged_at` | DATETIME | NULLABLE | |
| `acknowledged_by` | VARCHAR(100) | NULLABLE | Username |
| `cleared_at` | DATETIME | NULLABLE | Auto-cleared when value returns |
| `notes` | TEXT | NULLABLE | User notes on acknowledgment |

**Relationships:**
- `parameter` → Parameter

---

#### `system_logs`

Audit trail — poll events, comms failures, auth actions, system messages.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `log_type` | VARCHAR(30) | NOT NULL INDEX | comm / system / audit / alarm |
| `level` | VARCHAR(15) | DEFAULT 'INFO' | DEBUG / INFO / WARNING / ERROR |
| `source` | VARCHAR(100) | NULLABLE | Module/function name |
| `message` | TEXT | NOT NULL | Log message |
| `details` | TEXT | NULLABLE | JSON blob with extra context |
| `timestamp` | DATETIME | DEFAULT datetime.utcnow INDEX | |

---

#### `pending_uploads`

Queue of failed external API pushes (TGPCB live/delay) for retry.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `server_config_id` | INTEGER | NOT NULL FK → server_config(id) ON DELETE CASCADE INDEX | |
| `url` | VARCHAR(500) | NOT NULL | Target URL |
| `payload` | TEXT (JSON) | NOT NULL | JSON payload |
| `mode` | VARCHAR(20) | DEFAULT 'live' | live / delay |
| `retry_count` | INTEGER | DEFAULT 0 | Current retry attempt |
| `last_error` | VARCHAR(500) | NULLABLE | Last error message |
| `created_at` | DATETIME | DEFAULT datetime.utcnow | |
| `updated_at` | DATETIME | DEFAULT datetime.utcnow ONUPDATE | |

---

#### `broadcasts`

Broadcast messages received from RajAPI.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `message` | TEXT | NOT NULL | |
| `severity` | VARCHAR(20) | DEFAULT 'info' | info / warn / critical |
| `is_active` | BOOLEAN | DEFAULT 1 | |
| `created_at` | DATETIME | DEFAULT datetime.utcnow | |
| `expires_at` | DATETIME | NULLABLE | Auto-deactivate after |

---

#### `users`

Local user accounts (plant-level, not RajAPI).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `username` | VARCHAR(80) | NOT NULL UNIQUE INDEX | Login name |
| `hashed_password` | VARCHAR(200) | NOT NULL | bcrypt-hashed |
| `role` | VARCHAR(20) | DEFAULT 'client' | admin / client |
| `full_name` | VARCHAR(150) | NULLABLE | |
| `is_active` | BOOLEAN | DEFAULT 1 | |
| `created_at` | DATETIME | DEFAULT datetime.utcnow | |
| `created_by` | VARCHAR(80) | NULLABLE | Username of creator |
| `last_login` | DATETIME | NULLABLE | |

---

#### `server_config`

External server connection configs (TGPCB, CPCB file, LED display).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `name` | VARCHAR(100) | NULLABLE UNIQUE INDEX | Friendly name |
| `protocol` | VARCHAR(20) | DEFAULT 'tspcb' | tspcb / cpcb / led |
| `live_url` | VARCHAR(500) | NULLABLE | TGPCB live push URL |
| `delay_url` | VARCHAR(500) | NULLABLE | TGPCB delay push URL |
| `cpcb_file_path` | VARCHAR(500) | NULLABLE | CPCB export directory |
| `is_active` | BOOLEAN | DEFAULT 1 | |
| `is_cpcb_active` | BOOLEAN | DEFAULT 1 | |
| `led_station_name` | VARCHAR(100) | NULLABLE | LED display station label |

**Relationships:**
- `mappings[]` → ServerParameterMapping (cascade delete)
- `pending_uploads[]` → PendingUpload (cascade delete)

---

#### `server_parameter_mapping`

Maps internal parameters → external server field names.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `server_id` | INTEGER | NOT NULL FK → server_config(id) ON DELETE CASCADE | |
| `parameter_id` | INTEGER | NOT NULL FK → parameters(id) ON DELETE CASCADE | |
| `is_active` | BOOLEAN | DEFAULT 1 | |
| `api_id` | VARCHAR(100) | NULLABLE | TSPCB DeviceID |
| `api_name` | VARCHAR(100) | NULLABLE | TSPCB API-Name |
| `api_password` | VARCHAR(100) | NULLABLE | TSPCB Password |
| `api_vname` | VARCHAR(100) | NULLABLE | TSPCB var-name |
| `api_unit` | VARCHAR(50) | NULLABLE | Unit override |
| `cpcb_station_name` | VARCHAR(100) | NULLABLE | CPCB station |
| `cpcb_parameter` | VARCHAR(100) | NULLABLE | CPCB param name |
| `led_channel_name` | VARCHAR(100) | NULLABLE | LED label |
| `led_unit` | VARCHAR(50) | NULLABLE | LED unit override |

**Relationships:**
- `server` → ServerConfig
- `parameter` → Parameter (selectin load)

---

#### `cpcb_station_config`

CPCB export configuration per station. 1:1 with `stations`.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `station_id` | INTEGER | NOT NULL UNIQUE FK → stations(id) ON DELETE CASCADE INDEX | 1:1 with station |
| `station_name` | VARCHAR(100) | NOT NULL INDEX | CPCB-style station name |
| `station_code` | VARCHAR(50) | NULLABLE | Internal code |
| `export_enabled` | BOOLEAN | DEFAULT 1 | |
| `export_path` | VARCHAR(500) | NOT NULL DEFAULT 'C:\\Data' | Output directory for CSVs |
| `cpcb_enabled` | BOOLEAN | DEFAULT 1 | |
| `timezone` | VARCHAR(50) | DEFAULT 'Asia/Kolkata' | |
| `retention_count` | INTEGER | DEFAULT 97 | FIFO: max CSV files per param |
| `calibration_mode` | BOOLEAN | DEFAULT 0 | Flag applied to export records |
| `maintenance_mode` | BOOLEAN | DEFAULT 0 | Flag applied to export records |
| `created_at` | DATETIME | DEFAULT datetime.utcnow | |
| `updated_at` | DATETIME | DEFAULT datetime.utcnow ONUPDATE | |

**Relationships:**
- `station` → Station (1:1)

---

#### `cpcb_parameter_mapping`

Global mapping from internal parameter names → CPCB standard parameter names.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `internal_parameter` | VARCHAR(100) | NOT NULL | Internal tag name |
| `cpcb_parameter` | VARCHAR(100) | NOT NULL INDEX | CPCB standard name (24 items) |
| `unit` | VARCHAR(20) | DEFAULT 'ppm' | |
| `conversion_factor` | FLOAT | DEFAULT 1.0 | Multiply internal value by this |
| `enabled` | BOOLEAN | DEFAULT 1 | |
| `created_at` | DATETIME | DEFAULT datetime.utcnow | |
| `updated_at` | DATETIME | DEFAULT datetime.utcnow ONUPDATE | |

**Note:** This is a standalone reference table, not station-specific. 24 default CPCB parameter rows are seeded on first run.

---

#### `cpcb_export_records`

Generated 15-minute CPCB average records (the data written to Annexure-I CSVs).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `station_name` | VARCHAR(100) | NOT NULL INDEX | CPCB station name |
| `parameter` | VARCHAR(100) | NOT NULL INDEX | CPCB parameter name |
| `date_from` | DATETIME | NOT NULL | Window start (aligned: 00/15/30/45) |
| `date_to` | DATETIME | NOT NULL | Window end |
| `value` | FLOAT | NULLABLE | 15-min average |
| `calibration_flag` | INTEGER | DEFAULT 0 | 1 if calibration is active |
| `maintenance_flag` | INTEGER | DEFAULT 0 | 1 if maintenance is active |
| `remark` | VARCHAR(200) | DEFAULT 'Normal' | Quality remark |
| `created_at` | DATETIME | DEFAULT datetime.utcnow | |

**Unique constraint:** `(station_name, parameter, date_from, date_to)`  
**Index:** `(date_from, date_to)` (for backfill range queries)

---

#### `cpcb_export_logs`

Audit trail for each CPCB export pipeline execution.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `station_name` | VARCHAR(100) | NOT NULL INDEX | |
| `record_count` | INTEGER | DEFAULT 0 | Records written |
| `status` | VARCHAR(20) | DEFAULT 'success' | success / failed / partial |
| `message` | TEXT | NULLABLE | Error details on failure |
| `execution_time_ms` | INTEGER | NULLABLE | Pipeline duration |
| `created_at` | DATETIME | DEFAULT datetime.utcnow INDEX | |

---

#### `calibration_jobs`

Calibration workflow root entity.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `station_id` | INTEGER | NOT NULL FK → stations(id) ON DELETE CASCADE INDEX | |
| `parameter_id` | INTEGER | NOT NULL FK → parameters(id) ON DELETE CASCADE INDEX | |
| `job_name` | VARCHAR(200) | NOT NULL | |
| `calibration_type` | VARCHAR(20) | NOT NULL | zero / span / full |
| `sequence` | VARCHAR(20) | DEFAULT 'zero_first' | zero_first / span_first |
| `status` | VARCHAR(20) | DEFAULT 'pending' | pending / running / completed / approved / rejected |
| `scheduled_start` | DATETIME | NULLABLE | |
| `actual_start` | DATETIME | NULLABLE | |
| `actual_end` | DATETIME | NULLABLE | |
| `triggered_by` | VARCHAR(100) | NULLABLE | Username |
| `created_at` | DATETIME | DEFAULT datetime.utcnow | |
| `updated_at` | DATETIME | DEFAULT datetime.utcnow ONUPDATE | |

**Relationships:**
- `station` → Station
- `parameter` → Parameter
- `results[]` → CalibrationResult (cascade delete)
- `approvals[]` → CalibrationApproval (cascade delete)

---

#### `calibration_results`

Measured values for each calibration phase.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `calibration_job_id` | INTEGER | NOT NULL FK → calibration_jobs(id) ON DELETE CASCADE INDEX | |
| `phase` | VARCHAR(10) | NOT NULL | zero / span |
| `start_time` | DATETIME | NOT NULL | |
| `end_time` | DATETIME | NULLABLE | |
| `min_value` | FLOAT | NULLABLE | |
| `max_value` | FLOAT | NULLABLE | |
| `avg_value` | FLOAT | NULLABLE | |
| `std_dev` | FLOAT | NULLABLE | |
| `values_json` | TEXT (JSON) | NULLABLE | Raw readings array |
| `created_at` | DATETIME | DEFAULT datetime.utcnow | |

---

#### `calibration_approvals`

Approval/rejection records for completed calibrations.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `calibration_job_id` | INTEGER | NOT NULL FK → calibration_jobs(id) ON DELETE CASCADE INDEX | |
| `approved_by` | VARCHAR(100) | NOT NULL | Username |
| `approved_at` | DATETIME | DEFAULT datetime.utcnow | |
| `status` | VARCHAR(10) | NOT NULL | approved / rejected |
| `comments` | TEXT | NULLABLE | |
| `control_chart_data_json` | TEXT (JSON) | NULLABLE | Control chart points |

---

#### `plant_settings`

Singleton row for plant branding.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | Only one row expected |
| `plant_name` | VARCHAR(200) | NOT NULL DEFAULT 'UltrON Industrial Plant' | |
| `plant_address` | VARCHAR(500) | NOT NULL DEFAULT 'Industrial Zone, Block A' | |
| `plant_logo` | TEXT | NOT NULL DEFAULT '' | Base64 encoded image |
| `updated_at` | DATETIME | DEFAULT datetime.utcnow ONUPDATE | |

---

### 1.3 DataQuality Enum (CPCB Standard)

| Python Name | DB Value | Meaning | CPCB Code |
|-------------|----------|---------|-----------|
| `good` | `U` | Within range, no errors | U |
| `bad` | `B` | General bad quality | — |
| `uncertain` | `I` | Uncertain measurement | — |
| `out_of_range` | `O` | Outside min_valid/max_valid | O |
| `comms_fail` | `E` | Communication failure | E |
| `sensor_fail` | `F` | Sensor fault | — |
| `maintenance` | `M` | Maintenance mode | — |
| `negative` | `N` | Negative (no data) | N |

---

## 2. Server Database (PostgreSQL — `ultron_central`)

**Driver:** `asyncpg`  
**Host:** localhost:5432 (Docker container)  
**Auth:** user `ultron_admin` with password

### 2.1 Entity Relationship Diagram

```
industry_sites ──1:N──> devices ──1:N──> parameters ──1:N──> telemetry_data
     │                      │
     │                      └──> alarms
     │
     ├──> pending_commands
     ├──> broadcasts (via target_site_id or target_all)
     └──> ota_deployments ──N:1──> software_versions
```

### 2.2 Full Table Schemas

---

#### `industry_sites`

Root entity for each client plant on the RajAPI server.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK GENERATED ALWAYS AS IDENTITY | |
| `name` | VARCHAR | NULLABLE INDEX | Plant name |
| `api_key` | VARCHAR | UNIQUE INDEX | Static auth key (plaintext) |
| `location` | VARCHAR | NULLABLE | |
| `is_active` | BOOLEAN | DEFAULT TRUE | |
| `amc_expiry` | TIMESTAMPTZ | NULLABLE | AMC expiration |
| `last_sync` | TIMESTAMPTZ | NULLABLE | Last heartbeat |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `lock_status` | VARCHAR | DEFAULT 'unlocked' | unlocked / manual_lock / amc_expired |
| `lock_reason` | TEXT | NULLABLE | |
| `lock_updated_at` | TIMESTAMPTZ | NULLABLE | |
| `last_error` | TEXT | NULLABLE | Last sync error |
| `last_error_at` | TIMESTAMPTZ | NULLABLE | |
| `client_version` | VARCHAR | NULLABLE | UltrON version reported |
| `notes` | TEXT | NULLABLE | Admin notes |

**Relationships:**
- `devices[]` → Device (cascade delete)
- `telemetry[]` → TelemetryData (cascade delete)
- `pending_commands[]` → PendingCommand
- `ota_deployments[]` → OTADeployment

---

#### `devices` (Server)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK GENERATED ALWAYS AS IDENTITY | |
| `site_id` | INTEGER | FK → industry_sites(id) INDEX | |
| `name` | VARCHAR | NULLABLE | |
| `status` | VARCHAR | DEFAULT 'offline' | |
| `api_key` | VARCHAR | UNIQUE INDEX | Per-device key (optional) |

---

#### `parameters` (Server)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK GENERATED ALWAYS AS IDENTITY | |
| `device_id` | INTEGER | FK → devices(id) INDEX | |
| `name` | VARCHAR | NULLABLE | |
| `tag_name` | VARCHAR | NULLABLE | |
| `unit` | VARCHAR | NULLABLE | |

---

#### `telemetry_data` (Server)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | BIGINT | PK GENERATED ALWAYS AS IDENTITY | Use BIGINT for high volume |
| `site_id` | INTEGER | FK → industry_sites(id) INDEX | |
| `parameter_id` | INTEGER | FK → parameters(id) INDEX | |
| `value` | DOUBLE PRECISION | NULLABLE | |
| `quality` | VARCHAR(5) | NULLABLE | |
| `timestamp` | TIMESTAMPTZ | DEFAULT now() INDEX | |

---

#### `alarms` (Server)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK GENERATED ALWAYS AS IDENTITY | |
| `site_id` | INTEGER | FK → industry_sites(id) INDEX | |
| `parameter_id` | INTEGER | FK → parameters(id) | |
| `value` | DOUBLE PRECISION | NULLABLE | |
| `quality` | VARCHAR(10) | NULLABLE | |
| `message` | TEXT | NULLABLE | |
| `status` | VARCHAR(20) | DEFAULT 'active' | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `acknowledged_at` | TIMESTAMPTZ | NULLABLE | |

---

#### `pending_commands` (Server)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK GENERATED ALWAYS AS IDENTITY | |
| `site_id` | INTEGER | FK → industry_sites(id) | |
| `station_id` | VARCHAR | NULLABLE INDEX | |
| `action` | VARCHAR | NOT NULL | RESTART_POLLING / REBOOT_SYSTEM / FACTORY_RESET |
| `status` | VARCHAR | DEFAULT 'pending' | pending / delivered / completed / failed |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `delivered_at` | TIMESTAMPTZ | NULLABLE | |
| `completed_at` | TIMESTAMPTZ | NULLABLE | |
| `error` | TEXT | NULLABLE | |

---

#### `broadcasts` (Server)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK DEFAULT gen_random_uuid() | |
| `message` | TEXT | NOT NULL | |
| `message_type` | VARCHAR | DEFAULT 'info' | info / warning / critical |
| `is_active` | BOOLEAN | DEFAULT TRUE | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `expires_at` | TIMESTAMPTZ | NULLABLE | |
| `target_all` | BOOLEAN | DEFAULT TRUE | |
| `target_site_id` | INTEGER | FK → industry_sites(id) | NULL if target_all |

---

#### `software_versions`

OTA version registry.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK GENERATED ALWAYS AS IDENTITY | |
| `version` | VARCHAR | NOT NULL UNIQUE INDEX | Semver string |
| `description` | TEXT | NULLABLE | Release notes |
| `file_path` | VARCHAR | NULLABLE | Path to EXE on server |
| `checksum` | VARCHAR | NULLABLE | SHA256 of EXE |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

---

#### `ota_deployments`

Per-site deployment records.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK GENERATED ALWAYS AS IDENTITY | |
| `site_id` | INTEGER | NOT NULL FK → industry_sites(id) | |
| `version_id` | INTEGER | NOT NULL FK → software_versions(id) | |
| `status` | VARCHAR | DEFAULT 'pending' | pending / in_progress / success / failed |
| `progress` | INTEGER | DEFAULT 0 | 0-100 |
| `logs` | TEXT | NULLABLE | Deployment log |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() ONUPDATE now() | |

---

## 3. Schema Versioning Notes

The client database uses **in-code migrations** via `ALTER TABLE` in `database.py:172` — f-string DDL with guard against non-allowlisted column names. No Alembic or version table.

Items migrated this way (all additive — adding columns):
- CPCB export record columns
- Calibration mode flags
- LED display fields

**Recommended:** Replace with alembic or a `schema_version` table to track applied migrations.
