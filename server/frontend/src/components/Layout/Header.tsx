import { Box, Typography, IconButton, Avatar, Badge, Tooltip } from '@mui/material';
import Icon from '../Common/Icon';

interface HeaderProps {
  activeTab: string;
  notifPermission: NotificationPermission | 'unsupported';
  onRequestNotif: () => void;
  onLogout: () => void;
  onOpenMobile?: () => void;
  isMobile?: boolean;
}

const BREADCRUMBS: Record<string, string[]> = {
  dashboard: ['UltrON', 'Dashboard'],
  sites: ['UltrON', 'Monitoring', 'Sites'],
  clients: ['UltrON', 'Monitoring', 'UltrON Clients'],
  broadcasts: ['UltrON', 'Control', 'Broadcast Center'],
  amc: ['UltrON', 'Control', 'AMC & Control'],
  cpcb: ['UltrON', 'Compliance', 'Regulatory'],
  reports: ['UltrON', 'Compliance', 'Reports'],
  commands: ['UltrON', 'Operations', 'Commands'],
  notifications: ['UltrON', 'Operations', 'Notifications'],
  activity: ['UltrON', 'Operations', 'Activity'],
  users: ['UltrON', 'Administration', 'Users'],
  roles: ['UltrON', 'Administration', 'Roles'],
  settings: ['UltrON', 'Administration', 'Settings'],
  audit: ['UltrON', 'Administration', 'Audit Trail'],
};

export default function Header({
  activeTab, notifPermission, onRequestNotif, onLogout, onOpenMobile, isMobile,
}: HeaderProps) {
  const crumbs = BREADCRUMBS[activeTab] || BREADCRUMBS.dashboard;

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: { xs: 60, md: 64 }, px: { xs: 1.5, md: 3 },
        borderBottom: 1, borderColor: 'divider',
        bgcolor: 'background.paper',
        gap: 1,
      }}
    >
      {isMobile ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={onOpenMobile} size="small" sx={{ color: 'text.secondary' }}>
            <Icon name="Menu" size={22} />
          </IconButton>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '14px' }}>
            {crumbs[crumbs.length - 1]}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 240 }}>
          {crumbs.map((b, index, arr) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: index === arr.length - 1 ? 600 : 400,
                  color: index === arr.length - 1 ? 'text.primary' : 'text.secondary',
                  fontSize: '13px',
                }}
              >
                {b}
              </Typography>
              {index < arr.length - 1 && (
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '12px' }}>
                  /
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
        <Tooltip title={notifPermission === 'granted' ? 'Notifications enabled' : 'Enable notifications'}>
          <IconButton onClick={onRequestNotif} size="small" sx={{ color: notifPermission === 'granted' ? '#378ADD' : '#5D6663' }}>
            <Badge
              variant="dot"
              color="error"
              invisible={notifPermission !== 'granted'}
              sx={{ '& .MuiBadge-dot': { width: 8, height: 8, borderRadius: '50%' } }}
            >
              <Icon name="Bell" size={20} />
            </Badge>
          </IconButton>
        </Tooltip>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 1, pl: 2, borderLeft: 1, borderColor: 'divider' }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: '#0F6E56', fontSize: '13px', fontWeight: 700 }}>
            <Icon name="User" size={16} />
          </Avatar>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>Admin</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Super Admin</Typography>
          </Box>
          <IconButton onClick={onLogout} size="small" sx={{ color: 'text.secondary', ml: 0.5 }}>
            <Icon name="LogOut" size={18} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}