import { Box, Typography, useMediaQuery } from '@mui/material';
import { useState } from 'react';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  darkMode: boolean;
  onToggleDark: () => void;
  notifPermission: NotificationPermission | 'unsupported';
  onRequestNotif: () => void;
}

export default function Layout({
  children, activeTab, onTabChange, onLogout,
  searchQuery, onSearchChange,
  darkMode, onToggleDark, notifPermission, onRequestNotif,
}: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const effectiveCollapsed = isMobile ? true : collapsed;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F5F7FA' }}>
      <Sidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        collapsed={effectiveCollapsed}
        onToggle={() => setCollapsed(!collapsed)}
        onLogout={onLogout}
      />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header
          activeTab={activeTab}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          darkMode={darkMode}
          onToggleDark={onToggleDark}
          notifPermission={notifPermission}
          onRequestNotif={onRequestNotif}
          onLogout={onLogout}
          collapsed={effectiveCollapsed}
          onToggleSidebar={() => setCollapsed(!collapsed)}
        />
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          {children}
        </Box>
        {/* Footer */}
        <Box
          component="footer"
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            px: 3, py: 1.5,
            borderTop: '1px solid rgba(0,0,0,0.06)',
            backgroundColor: '#FFFFFF',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <img src="/assets/Ultron_logo.png" alt="" style={{ height: 16, width: 16 }} />
            <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
              RajAPI v2.0 — Powered by Sunshine Technologies
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
