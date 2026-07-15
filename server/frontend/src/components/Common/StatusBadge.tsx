import { Chip } from '@mui/material';
import { Circle } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  size?: 'small' | 'medium';
}

const statusConfig: Record<string, { color: 'success' | 'error' | 'warning' | 'info' | 'default'; label: string }> = {
  online: { color: 'success', label: 'Online' },
  active: { color: 'success', label: 'Active' },
  live: { color: 'success', label: 'Live' },
  healthy: { color: 'success', label: 'Healthy' },
  unlocked: { color: 'success', label: 'Unlocked' },
  offline: { color: 'error', label: 'Offline' },
  inactive: { color: 'error', label: 'Inactive' },
  error: { color: 'error', label: 'Error' },
  critical: { color: 'error', label: 'Critical' },
  locked: { color: 'error', label: 'Locked' },
  warning: { color: 'warning', label: 'Warning' },
  maintenance: { color: 'info', label: 'Maintenance' },
  pending: { color: 'warning', label: 'Pending' },
  acknowledged: { color: 'default', label: 'Acknowledged' },
  nc: { color: 'default', label: 'NC' },
  unknown: { color: 'default', label: 'Unknown' },
};

export default function StatusBadge({ status, size = 'small' }: StatusBadgeProps) {
  const config = statusConfig[status.toLowerCase()] || { color: 'default' as const, label: status };
  return (
    <Chip
      icon={<Circle size={size === 'small' ? 8 : 10} fill="currentColor" />}
      label={config.label}
      color={config.color === 'default' ? undefined : config.color}
      variant="outlined"
      size={size}
      sx={{
        fontWeight: 600,
        '& .MuiChip-icon': { marginLeft: '6px', marginRight: '-4px' },
      }}
    />
  );
}
