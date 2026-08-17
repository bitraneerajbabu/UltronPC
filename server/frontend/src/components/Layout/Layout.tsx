import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useState } from 'react';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  notifPermission: NotificationPermission | 'unsupported';
  onRequestNotif: () => void;
}

export default function Layout({
  children, activeTab, onTabChange, onLogout, notifPermission, onRequestNotif,
}: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, bgcolor: 'background.default' }}>
      {isMobile ? (
        <Sidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          collapsed={false}
          onToggle={() => {}}
          onLogout={onLogout}
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />
      ) : (
        <Sidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          onLogout={onLogout}
        />
      )}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header
          activeTab={activeTab}
          notifPermission={notifPermission}
          onRequestNotif={onRequestNotif}
          onLogout={onLogout}
          onOpenMobile={() => setMobileOpen(true)}
          isMobile={isMobile}
        />
        <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 1.5, md: 3 } }}>
          {children}
        </Box>
        <Box
          component="footer"
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            px: { xs: 1.5, md: 3 }, py: 1.25,
            borderTop: 1, borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <img src="/assets/Ultron_logo.png" alt="" style={{ height: 16, width: 16 }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              UltrON Super Admin Portal — All Rights Reserved to Neeraj
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}