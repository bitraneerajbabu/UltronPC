-- =============================================================================
-- UltrON Central Database Schema Migration
-- Designed for secure, multi-tenant industrial telemetry on Supabase.
-- =============================================================================

-- ─── 1. Extensions & Custom Enums ───────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('super_admin', 'client_admin', 'engineer', 'operator');
CREATE TYPE command_type AS ENUM ('restart', 'start_polling', 'stop_polling', 'run_report');
CREATE TYPE command_status AS ENUM ('pending', 'sent', 'done', 'failed');
CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected');

-- ─── 2. Base Core Tables ─────────────────────────────────────────────────────

-- Tenants table (Client companies)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- User Profiles table (Linked 1:1 to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'operator',
    full_name VARCHAR(255) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Client Devices table (PCs running on site)
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    machine_uuid VARCHAR(255) UNIQUE NOT NULL, -- Hardware motherboard/CPU unique ID
    status VARCHAR(50) NOT NULL DEFAULT 'offline',
    last_seen_at TIMESTAMP WITH TIME ZONE,
    app_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    activation_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Device configuration table
CREATE TABLE IF NOT EXISTS device_config (
    device_id UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    sensor_list JSONB NOT NULL DEFAULT '[]'::jsonb,
    polling_interval INTEGER NOT NULL DEFAULT 60, -- in seconds
    thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,
    report_schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Commands Queue table
CREATE TABLE IF NOT EXISTS commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    command command_type NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status command_status NOT NULL DEFAULT 'pending',
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- App Releases versions table
CREATE TABLE IF NOT EXISTS app_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(50) UNIQUE NOT NULL,
    download_url VARCHAR(2048) NOT NULL,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    rollout_percent INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Device Activation requests table
CREATE TABLE IF NOT EXISTS activation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(50),
    site_name VARCHAR(255) NOT NULL,
    machine_uuid VARCHAR(255) NOT NULL,
    status request_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- System Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    target VARCHAR(255) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─── 3. Telemetry Partitioning (Sensor Readings) ─────────────────────────────
CREATE TABLE IF NOT EXISTS sensor_readings (
    id UUID NOT NULL,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric VARCHAR(100) NOT NULL,
    value NUMERIC NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Pre-define baseline partitions for 2026/2027
CREATE TABLE IF NOT EXISTS sensor_readings_y2026m06 PARTITION OF sensor_readings
    FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS sensor_readings_y2026m07 PARTITION OF sensor_readings
    FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS sensor_readings_y2026m08 PARTITION OF sensor_readings
    FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS sensor_readings_default PARTITION OF sensor_readings DEFAULT;

-- ─── 4. Query Performance Indexes ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sensor_readings_query ON sensor_readings (device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_tenant ON sensor_readings (tenant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON profiles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices (tenant_id);
CREATE INDEX IF NOT EXISTS idx_commands_device ON commands (device_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log (tenant_id, created_at DESC);

-- ─── 5. Security & Tenant Context Helper Functions ───────────────────────────

-- Helper functions using SECURITY DEFINER to bypass RLS recursion limits
CREATE OR REPLACE FUNCTION get_auth_tenant_id()
RETURNS UUID 
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION get_auth_role()
RETURNS user_role 
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE;

-- ─── 6. User Lifecycle Trigger Hooks ──────────────────────────────────────────

-- Automatically create a public profile when a new user signs up in auth.users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'operator' -- Default role
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── 7. Row-Level Security (RLS) Rules ────────────────────────────────────────

-- Tenants RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_select ON tenants 
    FOR SELECT USING (id = get_auth_tenant_id() OR get_auth_role() = 'super_admin');
CREATE POLICY tenants_all_super ON tenants 
    FOR ALL USING (get_auth_role() = 'super_admin');

-- Profiles RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select ON profiles 
    FOR SELECT USING (tenant_id = get_auth_tenant_id() OR get_auth_role() = 'super_admin');
CREATE POLICY profiles_admin_write ON profiles 
    FOR ALL USING (
        (tenant_id = get_auth_tenant_id() AND get_auth_role() = 'client_admin') 
        OR get_auth_role() = 'super_admin'
    );

-- Devices RLS
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY devices_select ON devices 
    FOR SELECT USING (tenant_id = get_auth_tenant_id() OR get_auth_role() = 'super_admin');
CREATE POLICY devices_admin_write ON devices 
    FOR ALL USING (
        (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('client_admin', 'engineer')) 
        OR get_auth_role() = 'super_admin'
    );

-- Device Config RLS
ALTER TABLE device_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY device_config_select ON device_config 
    FOR SELECT USING (tenant_id = get_auth_tenant_id() OR get_auth_role() = 'super_admin');
CREATE POLICY device_config_write ON device_config 
    FOR ALL USING (
        (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('client_admin', 'engineer')) 
        OR get_auth_role() = 'super_admin'
    );

-- Sensor Readings RLS
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY sensor_readings_select ON sensor_readings 
    FOR SELECT USING (tenant_id = get_auth_tenant_id() OR get_auth_role() = 'super_admin');
-- Allow clients to upload data (assuming client auth / device claims or public with secure code validation)
CREATE POLICY sensor_readings_insert ON sensor_readings 
    FOR INSERT WITH CHECK (tenant_id = get_auth_tenant_id() OR get_auth_role() = 'super_admin');

-- Commands RLS
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY commands_select ON commands 
    FOR SELECT USING (tenant_id = get_auth_tenant_id() OR get_auth_role() = 'super_admin');
CREATE POLICY commands_write ON commands 
    FOR ALL USING (
        (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('client_admin', 'engineer')) 
        OR get_auth_role() = 'super_admin'
    );

-- App Versions RLS (Read-only for updates checks, super_admin full control)
ALTER TABLE app_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_versions_select ON app_versions 
    FOR SELECT USING (true);
CREATE POLICY app_versions_write ON app_versions 
    FOR ALL USING (get_auth_role() = 'super_admin');

-- Activation Requests RLS (Clients submit, super_admin manages)
ALTER TABLE activation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY activation_requests_insert ON activation_requests 
    FOR INSERT WITH CHECK (true);
CREATE POLICY activation_requests_admin ON activation_requests 
    FOR ALL USING (get_auth_role() = 'super_admin');

-- Audit Log RLS (Internal write only, tenant members can read)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_select ON audit_log 
    FOR SELECT USING (tenant_id = get_auth_tenant_id() OR get_auth_role() = 'super_admin');

-- ─── 8. Seed Sandbox Data (Commented Out) ────────────────────────────────────
/*
-- 1. Create Demo Tenant
INSERT INTO tenants (id, name, status) 
VALUES ('c3b9b47e-8516-43b6-bf2a-6ea5bde6dc63', 'Apex Manufacturing Inc.', 'active');

-- 2. Provision Super Admin Account
-- Set up user record in auth.users first, then run this profile bind:
INSERT INTO profiles (id, tenant_id, role, full_name, email)
VALUES (
  'auth-user-uuid-from-supabase', -- Replace with auth.users ID
  'c3b9b47e-8516-43b6-bf2a-6ea5bde6dc63', 
  'super_admin', 
  'Monorepo Super User', 
  'admin@ultron.tech'
);
*/