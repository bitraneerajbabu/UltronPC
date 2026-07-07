import { Box, Typography, Divider, Drawer } from '@mui/material';
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
      { id: 'settings_tab', label: 'Settings', icon: <Icon name="Settings" size={22} /> },
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
  settings_tab: 'settings_tab',
};

const activeItemMapping: Record<string, string> = {
  dashboard: 'dashboard',
  alarms: 'notifications_tab',
  commands: 'configuration',
  broadcasts: 'broadcasts',
  locks: 'amc',
  quality: 'quality',
  settings_tab: 'settings_tab',
};

export default function Sidebar({ activeTab, onTabChange, collapsed, onToggle, onLogout }: SidebarProps) {
  const handleNav = (id: string) => {
    const mapped = tabMapping[id] || 'dashboard';
    onTabChange(mapped);
  };

  const isSelected = (id: string) => {
    return activeItemMapping[activeTab] === id;
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: collapsed ? 72 : 260,
        flexShrink: 0,
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        '& .MuiDrawer-paper': {
          width: collapsed ? 72 : 260,
          transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          borderRight: '1px solid rgba(0,0,0,0.06)',
          backgroundColor: '#FFFFFF',
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
            borderBottom: '1px solid rgba(0,0,0,0.06)',
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
              <Typography variant="h4" sx={{ fontSize: '18px', fontWeight: 800, lineHeight: 1.2, color: '#111827', mb: 0.5 }}>
                RajAPI
              </Typography>
              <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, display: 'block', lineHeight: 1.2 }}>
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
                      backgroundColor: selected ? '#EFF6FF' : 'transparent',
                      color: selected ? '#2563EB' : '#4B5563',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        backgroundColor: selected ? '#EFF6FF' : '#F5F7FA',
                        color: selected ? '#2563EB' : '#111827',
                      },
                    }}
                  >
                    <Box sx={{
                      display: 'flex',
                      color: selected ? '#2563EB' : '#9CA3AF',
                      transition: 'color 0.15s ease',
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
        <Box sx={{ borderTop: '1px solid rgba(0,0,0,0.06)', px: collapsed ? 1 : 2, py: 1.5, backgroundColor: '#FFFFFF' }}>
          {/* Collapse Button */}
          <Box
            onClick={onToggle}
            sx={{
              display: 'flex', alignItems: 'center', gap: 2,
              px: collapsed ? 1.5 : 2, py: 1.25, borderRadius: '8px',
              cursor: 'pointer', color: '#6B7280',
              justifyContent: collapsed ? 'center' : 'flex-start',
              transition: 'all 0.15s ease',
              mb: 0.5,
              '&:hover': { backgroundColor: '#F5F7FA', color: '#111827' },
            }}
          >
            <Icon name={collapsed ? 'ChevronRight' : 'ChevronLeft'} size={22} />
            {!collapsed && (
              <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '13px' }}>
                Collapse Menu
              </Typography>
            )}
          </Box>

          {/* Logout Button */}
          <Box
            onClick={onLogout}
            sx={{
              display: 'flex', alignItems: 'center', gap: 2,
              px: collapsed ? 1.5 : 2, py: 1.25, borderRadius: '8px',
              cursor: 'pointer', color: '#EF4444',
              justifyContent: collapsed ? 'center' : 'flex-start',
              transition: 'all 0.15s ease',
              '&:hover': { backgroundColor: '#FEF2F2' },
            }}
          >
            <Icon name="LogOut" size={22} />
            {!collapsed && (
              <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '13px' }}>
                Logout
              </Typography>
            )}
          </Box>
          {!collapsed && (
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: '#9CA3AF', mt: 1.5, fontSize: '10px' }}>
              Powered by Sunshine Technologies
            </Typography>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
