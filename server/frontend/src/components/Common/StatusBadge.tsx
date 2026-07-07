import { Chip } from '@mui/material';
import { 
  Wifi, WifiOff, AlertTriangle, AlertOctagon, CheckCircle2, 
  Wrench, HelpCircle, Lock, Unlock, Clock
} from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  size?: 'small' | 'medium';
}

const statusConfig: Record<string, { 
  color: 'success' | 'error' | 'warning' | 'info' | 'default'; 
  label: string;
  icon: any;
}> = {
  online: { color: 'success', label: 'Online', icon: Wifi },
  active: { color: 'success', label: 'Active', icon: CheckCircle2 },
  live: { color: 'success', label: 'Live', icon: Wifi },
  healthy: { color: 'success', label: 'Healthy', icon: CheckCircle2 },
  unlocked: { color: 'success', label: 'Unlocked', icon: Unlock },
  offline: { color: 'error', label: 'Offline', icon: WifiOff },
  inactive: { color: 'error', label: 'Inactive', icon: AlertOctagon },
  error: { color: 'error', label: 'Error', icon: AlertOctagon },
  critical: { color: 'error', label: 'Critical', icon: AlertOctagon },
  locked: { color: 'error', label: 'Locked', icon: Lock },
  warning: { color: 'warning', label: 'Warning', icon: AlertTriangle },
  maintenance: { color: 'info', label: 'Maintenance', icon: Wrench },
  pending: { color: 'warning', label: 'Pending', icon: Clock },
  acknowledged: { color: 'default', label: 'Acknowledged', icon: CheckCircle2 },
  unknown: { color: 'default', label: 'Unknown', icon: HelpCircle },
};

export default function StatusBadge({ status, size = 'small' }: StatusBadgeProps) {
  const config = statusConfig[status.toLowerCase()] || { 
    color: 'default' as const, 
    label: status,
    icon: HelpCircle
  };
  const IconComponent = config.icon;
  const iconSize = size === 'small' ? 12 : 14;

  return (
    <Chip
      icon={<IconComponent size={iconSize} />}
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

