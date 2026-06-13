/**
 * UltrON Admin Panel — Shared API Layer
 * Connects to the local UltrON FastAPI backend at localhost:8000
 * Auto-handles JWT auth with silent login using default credentials.
 */

export const BACKEND_URL = "http://localhost:8000/api/v1";
export const WS_URL = "ws://localhost:8000/ws/live";

const TOKEN_KEY = "ultron_backend_token";

// ─── Auth ─────────────────────────────────────────────────────────────────────
export async function loginToBackend(): Promise<string | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "Master", password: "Ultron123.0" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const token = data.access_token || null;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ─── Fetch Helper ─────────────────────────────────────────────────────────────
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  let token = getToken();

  // Auto-login if no token
  if (!token) {
    token = await loginToBackend();
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BACKEND_URL}${path}`, { ...options, headers });

  // Token expired — retry once after re-login
  if (res.status === 401 && retry) {
    clearToken();
    token = await loginToBackend();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      const retryRes = await fetch(`${BACKEND_URL}${path}`, { ...options, headers });
      if (!retryRes.ok) {
        const err = await retryRes.json().catch(() => ({ detail: `HTTP ${retryRes.status}` }));
        throw new Error(err.detail || `HTTP ${retryRes.status}`);
      }
      return retryRes.json() as Promise<T>;
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Typed API calls ─────────────────────────────────────────────────────────

// Stations
export const api = {
  // ── Settings ──────────────────────────────────────────────────
  getInfo: () => apiFetch<AppInfo>("/settings/info"),
  getPollingStatus: () => apiFetch<PollingStatus>("/settings/polling-status"),
  reloadPolling: () => apiFetch("/settings/reload-polling", { method: "POST" }),
  getFirmware: () => apiFetch<FirmwareInfo>("/settings/firmware"),
  downloadFirmware: () => apiFetch<FirmwareDownloadStatus>("/settings/firmware/download", { method: "POST" }),
  getFirmwareDownloadStatus: () => apiFetch<FirmwareDownloadStatus>("/settings/firmware/download-status"),
  triggerCpcb: () => apiFetch("/settings/trigger-cpcb", { method: "POST" }),

  // ── Stations ──────────────────────────────────────────────────
  getStations: () => apiFetch<Station[]>("/stations/"),
  createStation: (data: Partial<Station>) => apiFetch<Station>("/stations/", { method: "POST", body: JSON.stringify(data) }),
  updateStation: (id: number, data: Partial<Station>) => apiFetch<Station>(`/stations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteStation: (id: number) => apiFetch(`/stations/${id}`, { method: "DELETE" }),

  // ── Devices ───────────────────────────────────────────────────
  getDevices: (stationId?: number) => apiFetch<Device[]>(`/devices/${stationId ? `?station_id=${stationId}` : ""}`),
  getDevice: (id: number) => apiFetch<Device>(`/devices/${id}`),
  createDevice: (data: Partial<Device>) => apiFetch<Device>("/devices/", { method: "POST", body: JSON.stringify(data) }),
  updateDevice: (id: number, data: Partial<Device>) => apiFetch<Device>(`/devices/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteDevice: (id: number) => apiFetch(`/devices/${id}`, { method: "DELETE" }),
  testDeviceConnection: (id: number) => apiFetch<ConnectionTestResult>(`/devices/${id}/test-connection`, { method: "POST" }),

  // ── Parameters ────────────────────────────────────────────────
  getParameters: (deviceId?: number) => apiFetch<Parameter[]>(`/parameters/${deviceId ? `?device_id=${deviceId}` : ""}`),
  createParameter: (data: Partial<Parameter>) => apiFetch<Parameter>("/parameters/", { method: "POST", body: JSON.stringify(data) }),
  updateParameter: (id: number, data: Partial<Parameter>) => apiFetch<Parameter>(`/parameters/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteParameter: (id: number) => apiFetch(`/parameters/${id}`, { method: "DELETE" }),

  // ── Server Config ─────────────────────────────────────────────
  getServers: () => apiFetch<ServerConfig[]>("/server-config/"),
  createServer: (data: Partial<ServerConfig>) => apiFetch<ServerConfig>("/server-config/", { method: "POST", body: JSON.stringify(data) }),
  updateServer: (id: number, data: Partial<ServerConfig>) => apiFetch<ServerConfig>(`/server-config/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteServer: (id: number) => apiFetch(`/server-config/${id}`, { method: "DELETE" }),
  getMappings: () => apiFetch<ParameterMappingResponse[]>("/server-config/mappings"),
  updateMappings: (updates: BulkMappingUpdate[]) => apiFetch("/server-config/mappings", { method: "PUT", body: JSON.stringify(updates) }),
  testServerPush: (id: number) => apiFetch(`/server-config/${id}/test-push`, { method: "POST" }),
  generateHistoricalCpcb: async (id: number, date: string): Promise<string> => {
    let token = getToken();
    if (!token) token = await loginToBackend();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BACKEND_URL}/server-config/${id}/generate-historical?date=${date}`, {
      method: "POST",
      headers,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },
};

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface AppInfo {
  app_name: string;
  version: string;
  debug: boolean;
  db_type: string;
  stations: number;
  devices: number;
  parameters: number;
}

export interface PollingStatus {
  running: boolean;
  active_poll_loops: number;
  device_ids: number[];
}

export interface FirmwareInfo {
  current_version: string;
  latest_version: string;
  release_name: string;
  update_available: boolean;
  release_notes: string;
  published_at: string;
  download_url: string;
  asset_size_bytes: number;
  release_url: string;
  repository: string;
}

export interface FirmwareDownloadStatus {
  state: "idle" | "downloading" | "done" | "error";
  percent: number;
  message: string;
  restart_required: boolean;
}

export interface Station {
  id: number;
  name: string;
  station_type: string;
  status: string;
  is_active: boolean;
  last_seen?: string;
  devices?: Device[];
}

export interface Device {
  id: number;
  station_id: number;
  name: string;
  protocol: string;
  host?: string;
  port?: number;
  slave_id?: number;
  serial_port?: string;
  baud_rate?: number;
  data_bits?: number;
  parity?: string;
  stop_bits?: number;
  csv_path?: string;
  csv_delimiter?: string;
  poll_interval: number;
  timeout: number;
  is_active: boolean;
  status: string;
  last_poll?: string;
  last_error?: string;
  parameters?: Parameter[];
}

export interface Parameter {
  id: number;
  device_id: number;
  name: string;
  tag_name: string;
  unit?: string;
  register_address: number;
  register_count: number;
  register_type: string;
  data_type: string;
  byte_order: string;
  scale_factor: number;
  offset: number;
  min_valid?: number;
  max_valid?: number;
  is_active: boolean;
  display_order: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latency_ms?: number;
}

export interface ServerConfig {
  id: number;
  name: string;
  protocol: string;
  live_url?: string;
  delay_url?: string;
  cpcb_file_path?: string;
  is_active: boolean;
  is_cpcb_active: boolean;
}

export interface ServerMappingBase {
  server_id: number;
  is_active: boolean;
  api_id?: string;
  api_name?: string;
  api_password?: string;
  api_vname?: string;
  api_unit?: string;
  cpcb_station_name?: string;
  cpcb_parameter?: string;
}

export interface ParameterMappingResponse {
  parameter_id: number;
  parameter_name: string;
  station_name: string;
  channel_no: number;
  mappings: Record<number, ServerMappingBase>;
}

export interface BulkMappingUpdate {
  parameter_id: number;
  mappings: Record<number, ServerMappingBase>;
}

export interface LiveDataPoint {
  parameter_id: number;
  tag_name: string;
  station_name: string;
  device_name: string;
  value: number | null;
  unit: string;
  quality: string;
  timestamp: string;
}

export interface WsMessage {
  type: "live_data" | "alarm" | "heartbeat" | "connected" | "pong";
  device_id?: number;
  data?: LiveDataPoint[];
  ts?: string;
  clients?: number;
}
