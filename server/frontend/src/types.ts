export interface Device {
  id: number;
  site_id: number;
  name: string;
  status: string;
  api_key?: string | null;
}

export interface Site {
  id: number;
  name: string;
  api_key: string;
  location: string | null;
  is_active: boolean;
  amc_expiry?: string | null;
  last_sync?: string | null;
  lock_status?: string;
  lock_reason?: string | null;
  lock_updated_at?: string | null;
  last_error?: string | null;
  last_error_at?: string | null;
  client_version?: string | null;
  notes?: string | null;
  devices?: Device[];
}

export interface LatestPoint {
  id: number;
  tag_name: string;
  name: string;
  unit?: string | null;
  value?: number | null;
  quality: string;
  timestamp: string;
  std_limit?: number | null;
  station_name?: string | null;
}

export interface TelemetryPoint {
  id?: number;
  value: number | null;
  quality: string;
  timestamp: string;
}

export interface BroadcastItem {
  id: string;
  message: string;
  message_type: string;
  is_active: boolean;
  created_at: string;
  expires_at?: string | null;
  target_all: boolean;
  target_site_id?: number | null;
}

export interface LockSummary {
  id: number;
  lock_status: string;
  lock_reason?: string | null;
  lock_updated_at?: string | null;
}

export interface AlarmItem {
  id: number;
  site_id: number;
  site_name?: string | null;
  parameter_id?: number | null;
  value?: number | null;
  quality: string;
  message: string;
  status: string;
  created_at: string;
  acknowledged_at?: string | null;
}

export interface AlarmStats {
  total_active: number;
  total_today: number;
  by_severity: Record<string, number>;
}

export interface CpcbStatusItem {
  site_id: number;
  site_name: string;
  last_tgpcb_sync?: string | null;
  total_records_synced_today: number;
  last_error?: string | null;
}

export interface CpcbSummaryItem {
  site_id: number;
  site_name: string;
  daily_counts: { date: string; record_count: number }[];
}

export type QualityKey = 'U' | 'O' | 'E' | 'N';

export interface QualitySite {
  site_id: number;
  site_name: string;
  total_points: number;
  quality: Record<QualityKey, { count: number; percentage: number }>;
}

export interface QualityDetailItem {
  parameter_id: number;
  parameter_name: string;
  tag_name: string;
  unit?: string | null;
  total_points: number;
  quality: Record<QualityKey, { count: number }>;
}

export interface Station {
  id: number;
  site_id: number;
  station_id: string;
  username: string;
  category: string;
  station_name: string;
  is_active: boolean;
  created_at: string;
}

export interface HierarchyParameter {
  id: number;
  name: string;
  tag_name: string;
  value: number | null;
  unit: string | null;
  status: string;
  received_at: string | null;
}

export interface HierarchyDevice {
  id: number;
  name: string;
  status: string;
  protocol: string;
  last_contact: string | null;
  parameters: HierarchyParameter[];
}

export interface HierarchyStation {
  name: string;
  device_count: number;
  parameter_count: number;
  last_sync: string | null;
  last_telemetry: string | null;
  devices: HierarchyDevice[];
}

export interface HierarchyIndustry {
  id: number;
  name: string;
  location: string | null;
  last_sync: string | null;
  is_active: boolean;
  amc_expiry: string | null;
  stations: HierarchyStation[];
}

export interface FleetHierarchyResponse {
  industries: HierarchyIndustry[];
}