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
    items: [{ id: 'dashboard', label: 'Dashboard', icon: <Icon name="LayoutDashboard" size={20} /> }],
  },
  {
    title: 'Monitoring',
    items: [
      { id: 'sites', label: 'Sites', icon: <Icon name="Factory" size={20} /> },
      { id: 'clients', label: 'UltrON Clients', icon: <Icon name="Server" size={20} /> },
    ],
  },
  {
    title: 'Control',
    items: [
      { id: 'broadcasts', label: 'Broadcast Center', icon: <Icon name="Megaphone" size={20} /> },
      { id: 'amc', label: 'AMC & Control', icon: <Icon name="Lock" size={20} /> },
    ],
  },
  {
    title: 'Compliance',
    items: [
      { id: 'cpcb', label: 'Regulatory', icon: <Icon name="ShieldCheck" size={20} /> },
      { id: 'reports', label: 'Reports', icon: <Icon name="FileBarChart2" size={20} /> },
    ],
  },
  {
    title: 'Operations',
    items: [
      { id: 'commands', label: 'Commands', icon: <Icon name="Send" size={20} /> },
      { id: 'notifications', label: 'Notifications', icon: <Icon name="BellRing" size={20} /> },
      { id: 'activity', label: 'Activity', icon: <Icon name="History" size={20} /> },
    ],
  },
  {
    title: 'Administration',
    items: [
      { id: 'users', label: 'Users', icon: <Icon name="Users" size={20} /> },
      { id: 'roles', label: 'Roles', icon: <Icon name="UserShield" size={20} /> },
      { id: 'settings', label: 'Settings', icon: <Icon name="Settings" size={20} /> },
      { id: 'audit', label: 'Audit Trail', icon: <Icon name="ClipboardList" size={20} /> },
    ],
  },
];

export default function Sidebar({ activeTab, onTabChange, collapsed, onToggle, onLogout, variant = 'permanent', open, onClose }: SidebarProps) {
  const theme = useTheme();
  const isTemp = variant === 'temporary';

  const handleNav = (id: string) => {
    onTabChange(id);
    if (isTemp) onClose?.();
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
              <Typography variant="h4" sx={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.2, color: 'text.primary', mb: 0.5 }}>
                UltrON
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
                    color: '#5D6663', fontSize: '10px', fontWeight: 700,
                    letterSpacing: '0.08em',
                  }}
                >
                  {group.title}
                </Typography>
              )}
              {group.items.map((item) => {
                const selected = activeTab === item.id;
                return (
                  <Box
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 2,
                      px: collapsed ? 1.5 : 2, py: 1.1,
                      mx: 0.5,
                      my: 0.25,
                      borderRadius: 2,
                      cursor: 'pointer',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      backgroundColor: selected ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                      color: selected ? theme.palette.primary.main : '#5D6663',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        backgroundColor: selected ? alpha(theme.palette.primary.main, 0.12) : '#F3F4F2',
                        color: selected ? theme.palette.primary.main : '#1A1D1C',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', color: selected ? theme.palette.primary.main : '#5D6663', flexShrink: 0 }}>
                      {item.icon}
                    </Box>
                    {!collapsed && (
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: selected ? 600 : 500,
                          fontSize: '14px',
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
                <Divider sx={{ my: 1.5, mx: 2, borderColor: 'rgba(0, 0, 0, 0.08)' }} />
              )}
            </Box>
          ))}
        </Box>

        {/* Action Controls + Logout Footer */}
        <Box sx={{ borderTop: 1, borderColor: 'divider', px: collapsed ? 1 : 2, py: 1.5, bgcolor: 'background.paper' }}>
          {!isTemp && (
            <Box
              onClick={onToggle}
              sx={{
                display: 'flex', alignItems: 'center', gap: 2,
                px: collapsed ? 1.5 : 2, py: 1.1, borderRadius: 2,
                cursor: 'pointer', color: 'text.secondary',
                justifyContent: collapsed ? 'center' : 'flex-start',
                transition: 'all 0.15s ease',
                mb: 0.5,
                '&:hover': { backgroundColor: '#F3F4F2', color: '#1A1D1C' },
              }}
            >
              <Icon name={collapsed ? 'ChevronRight' : 'ChevronLeft'} size={20} />
              {!collapsed && (
                <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '13px' }}>
                  Collapse Menu
                </Typography>
              )}
            </Box>
          )}

          <Box
            onClick={onLogout}
            sx={{
              display: 'flex', alignItems: 'center', gap: 2,
              px: collapsed ? 1.5 : 2, py: 1.1, borderRadius: 2,
              cursor: 'pointer', color: '#E24B4A',
              justifyContent: collapsed ? 'center' : 'flex-start',
              transition: 'all 0.15s ease',
              '&:hover': { backgroundColor: '#FCEBEB' },
            }}
          >
            <Icon name="LogOut" size={20} />
            {!collapsed && (
              <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '13px' }}>
                Logout
              </Typography>
            )}
          </Box>
          {!collapsed && !isTemp && (
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: '#5D6663', mt: 1.5, fontSize: '10px' }}>
              UltrON · Sunshine Technologies
            </Typography>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}