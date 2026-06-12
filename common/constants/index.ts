/**
 * Shared Constants and Enums for the UltrON Platform.
 */

export const COMMAND_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed'
} as const;

export const SENSOR_TYPES = {
  MODBUS_TCP: 'modbus_tcp',
  MODBUS_RTU: 'modbus_rtu',
  TCP_CUSTOM: 'tcp_custom',
  CSV_WATCHER: 'csv'
} as const;\n