import { Box, Typography, Divider, Drawer, useTheme, alpha } from '@mui/material';
import Icon from '../Common/Icon';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
  variant?: 'permanent' | 'temporary';
  open?: boolean;
  onClose?: () => void;
}

const navGroups: NavGroup[] = [
  {
    items: [{ id: 'dashboard', label: 'Dashboard', icon: <Icon name="LayoutDashboard" size={22} /> }],
  },
  {
    title: 'Monitoring',
    items: [
      { id: 'live', label: 'Live Monitoring', icon: <Icon name="Radio" size={22} /> },
      { id: 'plants', label: 'Plants', icon: <Icon name="Factory" size={22} /> },
      { id: 'notifications_tab', label: 'Notifications', icon: <Icon name="BellRing" size={22} /> },
    ],
  },
  {
    title: 'Management',
    items: [
      { id: 'configuration', label: 'Configuration', icon: <Icon name="Sliders" size={22} /> },
      { id: 'broadcasts', label: 'Broadcast Center', icon: <Icon name="Megaphone" size={22} /> },
      { id: 'amc', label: 'AMC Management', icon: <Icon name="CalendarRange" size={22} /> },
    ],
  },
  {
    title: 'Reports',
    items: [
      { id: 'quality', label: 'Audit Logs', icon: <Icon name="History" size={22} /> },
    ],
  },
];

const tabMapping: Record<string, string> = {
  dashboard: 'dashboard',
  live: 'dashboard',
  plants: 'dashboard',
  notifications_tab: 'alarms',
  configuration: 'commands',
  broadcasts: 'broadcasts',
  amc: 'locks',
  quality: 'quality',
};

const activeItemMapping: Record<string, string> = {
  dashboard: 'dashboard',
  alarms: 'notifications_tab',
  commands: 'configuration',
  broadcasts: 'broadcasts',
  locks: 'amc',
  quality: 'quality',
};

export default function Sidebar({ activeTab, onTabChange, collapsed, onToggle, onLogout, variant = 'permanent', open, onClose }: SidebarProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isTemp = variant === 'temporary';

  const handleNav = (id: string) => {
    const mapped = tabMapping[id] || 'dashboard';
    onTabChange(mapped);
    if (isTemp) onClose?.();
  };

  const isSelected = (id: string) => {
    return activeItemMapping[activeTab] === id;
  };

  const drawerWidth = collapsed ? 72 : 260;

  return (
    <Drawer
      variant={variant}
      open={isTemp ? open : undefined}
      onClose={isTemp ? onClose : undefined}
      sx={isTemp ? {
        '& .MuiDrawer-paper': {
          width: 260,
          borderRight: 1, borderColor: 'divider',
          bgcolor: 'background.paper',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        },
      } : {
        width: drawerWidth,
        flexShrink: 0,
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          borderRight: 1, borderColor: 'divider',
          bgcolor: 'background.paper',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Logo Section */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: collapsed ? 'row' : 'column',
            alignItems: 'center',
            justifyContent: 'center',
            px: 2, py: 2.5,
            borderBottom: 1, borderColor: 'divider',
            gap: 1.5,
          }}
        >
          <img
            src="/assets/Ultron_logo.png"
            alt="UltrON"
            style={{ height: collapsed ? 36 : 48, width: collapsed ? 36 : 48, objectFit: 'contain' }}
          />
          {!collapsed && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" sx={{ fontSize: '18px', fontWeight: 800, lineHeight: 1.2, color: 'text.primary', mb: 0.5 }}>
                Neeraj
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', lineHeight: 1.2 }}>
                Super Admin Portal
              </Typography>
            </Box>
          )}
        </Box>

        {/* Navigation - Scrollable Area */}
        <Box sx={{ flex: 1, overflowY: 'auto', py: 1.5, px: collapsed ? 0.5 : 1.5 }}>
          {navGroups.map((group, gi) => (
            <Box key={gi} sx={{ mb: 2 }}>
              {group.title && !collapsed && (
                <Typography
                  variant="overline"
                  sx={{
                    display: 'block', px: 2, py: 0.75,
                    color: '#9CA3AF', fontSize: '10px', fontWeight: 700,
                    letterSpacing: '0.08em',
                  }}
                >
                  {group.title}
                </Typography>
              )}
              {group.items.map((item) => {
                const selected = isSelected(item.id);
                return (
                  <Box
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 2,
                      px: collapsed ? 1.5 : 2, py: 1.25,
                      mx: 0.5,
                      my: 0.25,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      backgroundColor: selected ? alpha(theme.palette.primary.main, isDark ? 0.15 : 0.08) : 'transparent',
                      color: selected ? theme.palette.primary.main : (isDark ? '#8899B4' : '#4B5563'),
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        backgroundColor: selected ? alpha(theme.palette.primary.main, isDark ? 0.2 : 0.12) : (isDark ? 'rgba(255,255,255,0.04)' : '#F5F7FA'),
                        color: selected ? theme.palette.primary.main : (isDark ? '#F0F4FF' : '#111827'),
                      },
                      boxShadow: selected && isDark ? `inset 0 0 0 1px ${alpha(theme.palette.primary.main, 0.15)}` : 'none',
                    }}
                  >
                    <Box sx={{
                      display: 'flex',
                      color: selected ? theme.palette.primary.main : (isDark ? '#64748B' : '#9CA3AF'),
                      transition: 'color 0.2s ease',
                      flexShrink: 0,
                    }}>
                      {item.icon}
                    </Box>
                    {!collapsed && (
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 500, // Font Weight: 500
                          fontSize: '15px', // Text: 15px
                          color: 'inherit',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.label}
                      </Typography>
                    )}
                  </Box>
                );
              })}
              {gi < navGroups.length - 1 && !collapsed && (
                <Divider sx={{ my: 1.5, mx: 2, borderColor: '#F3F4F6' }} />
              )}
            </Box>
          ))}
        </Box>

        {/* Action Controls + Logout Footer */}
        <Box sx={{ borderTop: 1, borderColor: 'divider', px: collapsed ? 1 : 2, py: 1.5, bgcolor: 'background.paper' }}>
          {/* Collapse Button (desktop only) */}
          {!isTemp && (
            <Box
              onClick={onToggle}
              sx={{
                display: 'flex', alignItems: 'center', gap: 2,
                px: collapsed ? 1.5 : 2, py: 1.25, borderRadius: '8px',
              cursor: 'pointer', color: 'text.secondary',
              justifyContent: collapsed ? 'center' : 'flex-start',
              transition: 'all 0.2s ease',
              mb: 0.5,
              '&:hover': { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F7FA', color: isDark ? '#F0F4FF' : '#111827' },
              }}
            >
              <Icon name={collapsed ? 'ChevronRight' : 'ChevronLeft'} size={22} />
              {!collapsed && (
                <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '13px' }}>
                  Collapse Menu
                </Typography>
              )}
            </Box>
          )}

          {/* Logout Button */}
          <Box
            onClick={onLogout}
            sx={{
              display: 'flex', alignItems: 'center', gap: 2,
              px: collapsed ? 1.5 : 2, py: 1.25, borderRadius: '8px',
              cursor: 'pointer', color: isDark ? '#EF4444' : '#EF4444',
              justifyContent: collapsed ? 'center' : 'flex-start',
              transition: 'all 0.2s ease',
              '&:hover': { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2' },
            }}
          >
            <Icon name="LogOut" size={22} />
            {!collapsed && (
              <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '13px' }}>
                Logout
              </Typography>
            )}
          </Box>
          {!collapsed && !isTemp && (
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: '#9CA3AF', mt: 1.5, fontSize: '10px' }}>
              All Rights Reserved to Neeraj
            </Typography>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
