-- ============================================================================
-- CPCB CAAQM Legacy File Export Module - PostgreSQL Migration
-- ============================================================================
-- Run on the RajAPI central server PostgreSQL instance:
--   psql -U ultron_admin -d ultron_central -f migrations_cpcb.sql
-- ============================================================================

-- 1. CPCB Station Configuration
CREATE TABLE IF NOT EXISTS cpcb_station_config (
    id SERIAL PRIMARY KEY,
    station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    station_name VARCHAR(100) NOT NULL,
    station_code VARCHAR(50),
    export_enabled BOOLEAN DEFAULT TRUE,
    export_path VARCHAR(500) NOT NULL DEFAULT 'C:\Data',
    cpcb_enabled BOOLEAN DEFAULT TRUE,
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    retention_count INTEGER DEFAULT 97,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (station_id)
);
CREATE INDEX IF NOT EXISTS idx_cpcb_station_config_name ON cpcb_station_config(station_name);

-- 2. CPCB Parameter Mapping
CREATE TABLE IF NOT EXISTS cpcb_parameter_mapping (
    id SERIAL PRIMARY KEY,
    internal_parameter VARCHAR(100) NOT NULL,
    cpcb_parameter VARCHAR(100) NOT NULL,
    unit VARCHAR(20) DEFAULT 'ppm',
    conversion_factor DOUBLE PRECISION DEFAULT 1.0,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cpcb_param_mapping_cpcb ON cpcb_parameter_mapping(cpcb_parameter);

-- 3. CPCB Export Records
CREATE TABLE IF NOT EXISTS cpcb_export_records (
    id SERIAL PRIMARY KEY,
    station_name VARCHAR(100) NOT NULL,
    parameter VARCHAR(100) NOT NULL,
    date_from TIMESTAMP NOT NULL,
    date_to TIMESTAMP NOT NULL,
    value DOUBLE PRECISION,
    calibration_flag INTEGER DEFAULT 0,
    maintenance_flag INTEGER DEFAULT 0,
    remark VARCHAR(200) DEFAULT 'Normal',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (station_name, parameter, date_from, date_to)
);
CREATE INDEX IF NOT EXISTS idx_cpcb_export_from_to ON cpcb_export_records(date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_cpcb_export_station ON cpcb_export_records(station_name);

-- 4. CPCB Export Logs
CREATE TABLE IF NOT EXISTS cpcb_export_logs (
    id SERIAL PRIMARY KEY,
    station_name VARCHAR(100) NOT NULL,
    record_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'success',
    message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cpcb_export_logs_time ON cpcb_export_logs(created_at);

-- ============================================================================
-- Seed Default CPCB Parameter Mappings
-- ============================================================================
INSERT INTO cpcb_parameter_mapping (internal_parameter, cpcb_parameter, unit, conversion_factor, enabled) VALUES
    ('CO', 'CO', 'ppm', 1.145, TRUE),
    ('SO2', 'SO2', 'ppb', 0.00262, TRUE),
    ('NO', 'NO', 'ppb', 0.00123, TRUE),
    ('NO2', 'NO2', 'ppb', 0.00188, TRUE),
    ('NOX', 'NOx', 'ppb', 0.001, TRUE),
    ('OZONE', 'Ozone', 'ppb', 0.00196, TRUE),
    ('PM10', 'PM10', 'ug/m3', 1.0, TRUE),
    ('PM25', 'PM2.5', 'ug/m3', 1.0, TRUE),
    ('WS', 'WS', 'm/s', 1.0, TRUE),
    ('WD', 'WD', 'degree', 1.0, TRUE),
    ('AT', 'AT', 'degC', 1.0, TRUE),
    ('RH', 'RH', '%', 1.0, TRUE),
    ('BP', 'BP', 'hPa', 1.0, TRUE),
    ('SR', 'SR', 'W/m2', 1.0, TRUE),
    ('RF', 'RF', 'mm', 1.0, TRUE),
    ('VWS', 'VWS', 'm/s', 1.0, TRUE),
    ('BENZENE', 'Benzene', 'ppb', 0.00319, TRUE),
    ('TOLUENE', 'Toluene', 'ppb', 0.00377, TRUE),
    ('XYLENE', 'Xylene', 'ppb', 0.00434, TRUE),
    ('ETH_BENZENE', 'Eth-Benzene', 'ppb', 0.001, TRUE),
    ('MP_XYLENE', 'MP-Xylene', 'ppb', 0.001, TRUE),
    ('CH4', 'CH4', 'ppb', 0.00065, TRUE),
    ('NH3', 'NH3', 'ppb', 0.00070, TRUE),
    ('HCHO', 'HCHO', 'ppb', 0.00123, TRUE),
    ('HG', 'Hg', 'ppb', 0.00820, TRUE)
ON CONFLICT DO NOTHING;
