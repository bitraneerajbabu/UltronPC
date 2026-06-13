/**
 * Shared Type Definitions for the UltrON Platform.
 */

export interface Tenant {
  id: string;
  name: string;
  created_at: string;
}

export interface Device {
  id: string;
  tenant_id: string;
  machine_id: string; // Hardware UUID/MAC lock
  name: string;
  status: 'online' | 'offline' | 'error';
}

export interface TelemetryPacket {
  device_id: string;
  timestamp: string;
  data: Record<string, number | string | null>;
}\n