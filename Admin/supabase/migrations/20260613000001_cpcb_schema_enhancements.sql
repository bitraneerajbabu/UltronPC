-- =============================================================================
-- Supabase Schema Enhancement: CPCB/SPCB Regulatory & Domain Fields
-- Phase 2c Migration: Additive adjustments to live schema.
-- =============================================================================

-- ─── 1. Industry Categories Reference ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS industry_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed category references safely if they don't exist
INSERT INTO industry_categories (name) VALUES
    ('Pharmaceuticals'),
    ('Distillery'),
    ('Iron & Steel'),
    ('Sugar'),
    ('Chemicals'),
    ('Dyes & Dye Intermediates'),
    ('Food Processing'),
    ('CETP'),
    ('Pulp & Paper'),
    ('Cement'),
    ('Thermal Power Plants'),
    ('Petrochemicals'),
    ('Oil Refineries'),
    ('Textiles'),
    ('Fertilisers'),
    ('Other')
ON CONFLICT (name) DO NOTHING;

-- ─── 2. Alter tenants Table ──────────────────────────────────────────────────
ALTER TABLE tenants 
    ADD COLUMN IF NOT EXISTS industry_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS category VARCHAR(100),
    ADD COLUMN IF NOT EXISTS latitude NUMERIC,
    ADD COLUMN IF NOT EXISTS longitude NUMERIC,
    ADD COLUMN IF NOT EXISTS amc_expiry TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS cpcb_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS spcb_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS sms_status BOOLEAN DEFAULT true NOT NULL,
    ADD COLUMN IF NOT EXISTS client_status VARCHAR(50) DEFAULT 'active' NOT NULL;

-- ─── 3. Alter devices Table ──────────────────────────────────────────────────
ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS station_type VARCHAR(50) DEFAULT 'EFFLUENT' NOT NULL,
    ADD COLUMN IF NOT EXISTS masked_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS station_status VARCHAR(50) DEFAULT 'active' NOT NULL,
    ADD COLUMN IF NOT EXISTS sms_status BOOLEAN DEFAULT true NOT NULL;

-- Enforce station type categories
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devices_station_type_check') THEN
        ALTER TABLE devices ADD CONSTRAINT devices_station_type_check CHECK (station_type IN ('EFFLUENT', 'EMISSION', 'AMBIENT', 'ETP', 'CAMERA'));
    END IF;
END $$;

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devices_station_status_check') THEN
        ALTER TABLE devices ADD CONSTRAINT devices_station_status_check CHECK (station_status IN ('active', 'inactive'));
    END IF;
END $$;

-- ─── 4. Device Secrets Table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_secrets (
    device_id UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    site_name VARCHAR(255),
    site_password VARCHAR(255),
    station_user VARCHAR(255),
    station_password VARCHAR(255),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─── 5. Device Parameters Table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    min_measure NUMERIC,
    max_measure NUMERIC,
    low_limit NUMERIC,
    high_limit NUMERIC,
    std_limit NUMERIC,
    alert_sms BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT device_parameters_device_name_key UNIQUE (device_id, name)
);

-- ─── 6. Alerts Table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
    parameter VARCHAR(100) NOT NULL,
    value NUMERIC NOT NULL,
    limit_breached VARCHAR(50) NOT NULL, -- 'low', 'high', 'std'
    severity VARCHAR(50) DEFAULT 'warning' NOT NULL, -- 'info', 'warning', 'critical'
    status VARCHAR(50) DEFAULT 'open' NOT NULL, -- 'open', 'acknowledged', 'closed'
    notified_via VARCHAR(100), -- 'sms', 'whatsapp', 'email'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    acknowledged_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMP WITH TIME ZONE
);

-- ─── 7. Service Reports (Tickets) Table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    industry_address TEXT NOT NULL,
    whatsapp_numbers TEXT,
    mail_to TEXT,
    cc TEXT,
    request_type VARCHAR(100) NOT NULL,
    service_type VARCHAR(100) NOT NULL,
    message_body TEXT NOT NULL,
    service_status VARCHAR(50) DEFAULT 'pending' NOT NULL, -- 'pending', 'in_progress', 'resolved', 'closed'
    serviced_on TIMESTAMP WITH TIME ZONE,
    attachments TEXT[], -- Array of storage paths/URLs
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─── 8. Cameras Table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cameras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    stream_url VARCHAR(2048) NOT NULL,
    status VARCHAR(50) DEFAULT 'active' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─── 9. Query Performance Indexes ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_device_parameters_device ON device_parameters (device_id);
CREATE INDEX IF NOT EXISTS idx_device_parameters_tenant ON device_parameters (tenant_id);
CREATE INDEX IF NOT EXISTS idx_alerts_device_parameter ON alerts (device_id, parameter);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON alerts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_tenant ON service_reports (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cameras_device ON cameras (device_id);
CREATE INDEX IF NOT EXISTS idx_cameras_tenant ON cameras (tenant_id);

-- ─── 10. Row-Level Security (RLS) Rules & Policies ───────────────────────────

-- industry_categories
ALTER TABLE industry_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY industry_categories_select ON industry_categories FOR SELECT USING (true);
CREATE POLICY industry_categories_all_super ON industry_categories FOR ALL USING (get_auth_role() = 'super_admin');

-- device_secrets (Strictly Super Admin / Service Role)
ALTER TABLE device_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY device_secrets_all_super ON device_secrets FOR ALL USING (get_auth_role() = 'super_admin');

-- device_parameters
ALTER TABLE device_parameters ENABLE ROW LEVEL SECURITY;
CREATE POLICY device_parameters_select ON device_parameters 
    FOR SELECT USING (tenant_id = get_auth_tenant_id() OR get_auth_role() = 'super_admin');
CREATE POLICY device_parameters_write ON device_parameters 
    FOR ALL USING (
        (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('client_admin', 'engineer')) 
        OR get_auth_role() = 'super_admin'
    );

-- alerts
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY alerts_select ON alerts 
    FOR SELECT USING (tenant_id = get_auth_tenant_id() OR get_auth_role() = 'super_admin');
CREATE POLICY alerts_write ON alerts 
    FOR ALL USING (
        (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('client_admin', 'engineer', 'operator')) 
        OR get_auth_role() = 'super_admin'
    );

-- service_reports
ALTER TABLE service_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_reports_select ON service_reports 
    FOR SELECT USING (tenant_id = get_auth_tenant_id() OR get_auth_role() = 'super_admin');
CREATE POLICY service_reports_write ON service_reports 
    FOR ALL USING (
        (tenant_id = get_auth_tenant_id()) 
        OR get_auth_role() = 'super_admin'
    );

-- cameras
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;
CREATE POLICY cameras_select ON cameras 
    FOR SELECT USING (tenant_id = get_auth_tenant_id() OR get_auth_role() = 'super_admin');
CREATE POLICY cameras_write ON cameras 
    FOR ALL USING (
        (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('client_admin', 'engineer')) 
        OR get_auth_role() = 'super_admin'
    );
