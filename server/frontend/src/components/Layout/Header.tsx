import { Box, Typography, IconButton, Avatar, Badge, Tooltip } from '@mui/material';
import Icon from '../Common/Icon';
import SearchBar from '../Common/SearchBar';

interface HeaderProps {
  activeTab: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  darkMode: boolean;
  onToggleDark: () => void;
  notifPermission: NotificationPermission | 'unsupported';
  onRequestNotif: () => void;
  onLogout: () => void;
  collapsed: boolean;
  onToggleSidebar: () => void;
}

export default function Header({
  activeTab, searchQuery, onSearchChange,
  darkMode, onToggleDark,
  notifPermission, onRequestNotif, onLogout,
}: HeaderProps) {
  const getBreadcrumbs = () => {
    switch (activeTab) {
      case 'dashboard':
        return ['RajAPI', 'Dashboard'];
      case 'alarms':
        return ['RajAPI', 'Monitoring', 'Notifications'];
      case 'commands':
        return ['RajAPI', 'Management', 'Configuration'];
      case 'broadcasts':
        return ['RajAPI', 'Management', 'Broadcast Center'];
      case 'locks':
        return ['RajAPI', 'Management', 'AMC Management'];
      case 'quality':
        return ['RajAPI', 'Reports', 'Audit Logs'];
      case 'settings_tab':
        return ['RajAPI', 'Reports', 'Settings'];
      default:
        return ['RajAPI', 'Dashboard'];
    }
  };

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 70, px: 3,
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        backgroundColor: '#FFFFFF',
        gap: 2,
      }}
    >
      {/* Left: Breadcrumbs */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 240 }}>
        {getBreadcrumbs().map((b, index, arr) => (
          <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: index === arr.length - 1 ? 600 : 400,
                color: index === arr.length - 1 ? '#111827' : '#6B7280',
                fontSize: '14px',
              }}
            >
              {b}
            </Typography>
            {index < arr.length - 1 && (
              <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '12px' }}>
                /
              </Typography>
            )}
          </Box>
        ))}
      </Box>

      {/* Center: Search */}
      <Box sx={{ flex: 2, display: 'flex', justifyContent: 'center' }}>
        <SearchBar
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search Plants, Gateways, Customers..."
        />
      </Box>

      {/* Right: Actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, justifyContent: 'flex-end' }}>
        <Tooltip title={darkMode ? 'Light Mode' : 'Dark Mode'}>
          <IconButton onClick={onToggleDark} size="small" sx={{ color: '#6B7280' }}>
            {darkMode ? <Icon name="Sun" size={20} /> : <Icon name="Moon" size={20} />}
          </IconButton>
        </Tooltip>

        <Tooltip title={notifPermission === 'granted' ? 'Notifications enabled' : 'Enable notifications'}>
          <IconButton
            onClick={onRequestNotif}
            size="small"
            sx={{ color: notifPermission === 'granted' ? '#2563EB' : '#6B7280' }}
          >
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

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 1, pl: 2, borderLeft: '1px solid rgba(0,0,0,0.06)' }}>
          <Avatar sx={{ width: 36, height: 36, bgcolor: '#2563EB', fontSize: '14px', fontWeight: 700 }}>
            <Icon name="User" size={18} />
          </Avatar>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>Admin</Typography>
            <Typography variant="caption" sx={{ color: '#9CA3AF' }}>Super Admin</Typography>
          </Box>
          <IconButton onClick={onLogout} size="small" sx={{ color: '#9CA3AF', ml: 0.5 }}>
            <Icon name="LogOut" size={18} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}

