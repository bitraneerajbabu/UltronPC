import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import type { AlarmItem, AlarmStats, BroadcastItem, CpcbStatusItem, CpcbSummaryItem, LockSummary, QualitySite, Site, FleetHierarchyResponse } from './types';
import { adminFetch } from './api';
import theme from './theme';

import Layout from './components/Layout/Layout';
import DashboardScreen from './screens/DashboardScreen';
import SitesScreen from './screens/SitesScreen';
import SiteDetailScreen from './screens/SiteDetailScreen';
import ClientsScreen from './screens/ClientsScreen';
import BroadcastsScreen from './screens/BroadcastsScreen';
import AmcScreen from './screens/AmcScreen';
import RegulatoryScreen from './screens/RegulatoryScreen';
import ReportsScreen from './screens/ReportsScreen';
import CommandsScreen from './screens/CommandsScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import ActivityScreen from './screens/ActivityScreen';
import PendingScreen from './screens/PendingScreen';

const PENDING_REQUIREMENTS: Record<string, string[]> = {
  users: [
    'User CRUD endpoints (create, list, update, delete) with role assignment',
    'Password hashing and session management',
    'Role-based access control on the server',
  ],
  roles: [
    'Role model and permission matrix on the backend',
    'Role assignment to users',
    'Permission checks enforced server-side',
  ],
  settings: [
    'System settings storage (key-value or table)',
    'Server-level configuration endpoints',
    'Audit logging of configuration changes',
  ],
  audit: [
    'Audit log table for admin actions (logins, broadcasts, commands, locks, deletions)',
    'Query endpoint with filters (actor, action, date range)',
  ],
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(sessionStorage.getItem('rajapi_auth') === 'true');
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [locks, setLocks] = useState<LockSummary[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastItem[]>([]);
  const [cpcbStatus, setCpcbStatus] = useState<CpcbStatusItem[]>([]);
  const [cpcbSummary, setCpcbSummary] = useState<CpcbSummaryItem[]>([]);
  const [qualitySummary, setQualitySummary] = useState<QualitySite[]>([]);
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [alarmStats, setAlarmStats] = useState<AlarmStats | null>(null);
  const [hierarchy, setHierarchy] = useState<FleetHierarchyResponse | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported'
  );

  const refreshData = useCallback(async () => {
    const res = await Promise.all([
      adminFetch('/api/v1/sites/'),
      adminFetch('/api/v1/sites/locks/summary'),
      adminFetch('/api/v1/broadcasts/'),
      adminFetch('/api/v1/cpcb/status'),
      adminFetch('/api/v1/cpcb/summary'),
      adminFetch('/api/v1/quality/'),
      adminFetch('/api/v1/alarms/'),
      adminFetch('/api/v1/alarms/stats'),
      adminFetch('/api/v1/fleet/hierarchy'),
    ]);
    const [s, l, b, cs, csm, q, a, ast, h] = res;
    if (s.ok) { const d = await s.json(); if (Array.isArray(d)) setSites(d as Site[]); }
    if (l.ok) { const d = await l.json(); if (Array.isArray(d)) setLocks(d as LockSummary[]); }
    if (b.ok) { const d = await b.json(); if (Array.isArray(d)) setBroadcasts(d as BroadcastItem[]); }
    if (cs.ok) { const d = await cs.json(); if (Array.isArray(d)) setCpcbStatus(d as CpcbStatusItem[]); }
    if (csm.ok) { const d = await csm.json(); if (Array.isArray(d)) setCpcbSummary(d as CpcbSummaryItem[]); }
    if (q.ok) { const d = await q.json(); if (Array.isArray(d)) setQualitySummary(d as QualitySite[]); }
    if (a.ok) { const d = await a.json(); if (Array.isArray(d)) setAlarms(d as AlarmItem[]); }
    if (ast.ok) setAlarmStats(await ast.json() as AlarmStats);
    if (h.ok) { const d = await h.json(); setHierarchy(d as FleetHierarchyResponse); }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    const load = async () => {
      try { await refreshData(); } catch { /* transient */ }
      setInitialLoading(false);
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [isLoggedIn, refreshData]);

  const handleLogout = () => {
    sessionStorage.removeItem('rajapi_auth');
    sessionStorage.removeItem('rajapi_admin_key');
    setIsLoggedIn(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const data = await res.json();
        sessionStorage.setItem('rajapi_auth', 'true');
        sessionStorage.setItem('rajapi_admin_key', data.admin_key || password);
        setIsLoggedIn(true);
        setLoginError('');
      } else {
        setLoginError('Invalid credentials');
      }
    } catch {
      setLoginError('Network error — could not reach server');
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification('UltrON Notifications Enabled', { body: 'You will receive plant status alerts here.', icon: '/pwa-192x192.png' });
      });
    }
  };

  const openSite = (site: Site) => {
    setSelectedSite(site);
    setActiveTab('sites');
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab !== 'sites') setSelectedSite(null);
  };

  const renderContent = () => {
    if (initialLoading) {
      return <Box sx={{ textAlign: 'center', py: 10 }}><div className="loader"></div></Box>;
    }
    if (activeTab === 'sites' && selectedSite) {
      return <SiteDetailScreen hierarchy={hierarchy} site={selectedSite} onBack={() => setSelectedSite(null)} onSiteChanged={setSelectedSite} onRefresh={refreshData} />;
    }
    switch (activeTab) {
      case 'dashboard':
        return <DashboardScreen hierarchy={hierarchy} sites={sites} alarms={alarms} broadcasts={broadcasts} cpcbStatus={cpcbStatus} onSelectSite={openSite} onNewSite={() => { setActiveTab('sites'); }} />;
      case 'sites':
        return <SitesScreen sites={sites} onSelectSite={openSite} onRefresh={refreshData} />;
      case 'clients':
        return <ClientsScreen sites={sites} onSelectSite={openSite} />;
      case 'broadcasts':
        return <BroadcastsScreen broadcasts={broadcasts} sites={sites} onRefresh={refreshData} />;
      case 'amc':
        return <AmcScreen sites={sites} locks={locks} onRefresh={refreshData} />;
      case 'cpcb':
        return <RegulatoryScreen cpcbStatus={cpcbStatus} cpcbSummary={cpcbSummary} />;
      case 'reports':
        return <ReportsScreen sites={sites} qualitySummary={qualitySummary} />;
      case 'commands':
        return <CommandsScreen sites={sites} />;
      case 'notifications':
        return <NotificationsScreen alarms={alarms} alarmStats={alarmStats} onRefresh={refreshData} />;
      case 'activity':
        return <ActivityScreen alarms={alarms} broadcasts={broadcasts} />;
      case 'users':
        return <PendingScreen title="Users" subtitle="Manage administrator accounts." requirements={PENDING_REQUIREMENTS.users} />;
      case 'roles':
        return <PendingScreen title="Roles" subtitle="Define role-based access control." requirements={PENDING_REQUIREMENTS.roles} />;
      case 'settings':
        return <PendingScreen title="Settings" subtitle="System-wide configuration." requirements={PENDING_REQUIREMENTS.settings} />;
      case 'audit':
        return <PendingScreen title="Audit Trail" subtitle="Record of administrative actions." requirements={PENDING_REQUIREMENTS.audit} />;
      default:
        return <DashboardScreen hierarchy={hierarchy} sites={sites} alarms={alarms} broadcasts={broadcasts} cpcbStatus={cpcbStatus} onSelectSite={openSite} onNewSite={() => { setActiveTab('sites'); }} />;
    }
  };

  const loginPage = (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
      <Paper elevation={0} sx={{ p: { xs: 3, sm: 4 }, maxWidth: 420, width: '100%', borderRadius: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4, textAlign: 'center' }}>
          <img src="/assets/Ultron_logo.png" alt="UltrON" style={{ height: 80, width: 80, objectFit: 'contain', marginBottom: 16 }} />
          <Typography variant="h4" sx={{ fontWeight: 700, fontSize: '24px', mb: 0.5 }}>UltrON</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Super Admin Portal</Typography>
        </Box>
        <Box component="form" onSubmit={handleLogin} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField label="Username" value={username} onChange={e => setUsername(e.target.value)} required fullWidth />
          <TextField label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required fullWidth />
          {loginError && <Alert severity="error">{loginError}</Alert>}
          <Button type="submit" variant="contained" size="large" fullWidth sx={{ py: 1.5 }}>Sign In</Button>
        </Box>
      </Paper>
    </Box>
  );

  const mainApp = (
    <Layout
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onLogout={handleLogout}
      notifPermission={notifPermission}
      onRequestNotif={requestNotificationPermission}
    >
      {renderContent()}
    </Layout>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {isLoggedIn ? mainApp : loginPage}
    </ThemeProvider>
  );
}

export default App;