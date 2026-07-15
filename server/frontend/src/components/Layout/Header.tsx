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
  onOpenMobile?: () => void;
  isMobile?: boolean;
}

export default function Header({
  activeTab, searchQuery, onSearchChange,
  darkMode, onToggleDark,
  notifPermission, onRequestNotif, onLogout,
  onOpenMobile, isMobile,
}: HeaderProps) {
  const getBreadcrumbs = () => {
    switch (activeTab) {
      case 'dashboard':
        return ['Neeraj', 'Dashboard'];
      case 'alarms':
        return ['Neeraj', 'Monitoring', 'Notifications'];
      case 'commands':
        return ['Neeraj', 'Management', 'Configuration'];
      case 'broadcasts':
        return ['Neeraj', 'Management', 'Broadcast Center'];
      case 'locks':
        return ['Neeraj', 'Management', 'AMC Management'];
      case 'quality':
        return ['Neeraj', 'Reports', 'Audit Logs'];
      default:
        return ['Neeraj', 'Dashboard'];
    }
  };

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: { xs: 60, md: 70 }, px: { xs: 1.5, md: 3 },
        borderBottom: 1, borderColor: 'divider',
        bgcolor: 'background.paper',
        gap: 1,
      }}
    >
      {/* Left: Hamburger (mobile) or Breadcrumbs (desktop) */}
      {isMobile ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={onOpenMobile} size="small" sx={{ color: 'text.secondary' }}>
            <Icon name="Menu" size={22} />
          </IconButton>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '14px' }}>
            {getBreadcrumbs().slice(-1)[0]}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 240 }}>
          {getBreadcrumbs().map((b, index, arr) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: index === arr.length - 1 ? 600 : 400,
                  color: index === arr.length - 1 ? 'text.primary' : 'text.secondary',
                  fontSize: '14px',
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

      {/* Center: Search (hidden on mobile) */}
      {!isMobile && (
        <Box sx={{ flex: 2, display: 'flex', justifyContent: 'center' }}>
          <SearchBar
            value={searchQuery}
            onChange={onSearchChange}
            placeholder="Search Plants, Gateways, Customers..."
          />
        </Box>
      )}

      {/* Right: Actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, justifyContent: 'flex-end' }}>
        <Tooltip title={darkMode ? 'Light Mode' : 'Dark Mode'}>
          <IconButton onClick={onToggleDark} size="small" sx={{ color: 'text.secondary' }}>
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

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 1, pl: 2, borderLeft: 1, borderColor: 'divider' }}>
          <Avatar sx={{ width: 36, height: 36, bgcolor: '#2563EB', fontSize: '14px', fontWeight: 700 }}>
            <Icon name="User" size={18} />
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

