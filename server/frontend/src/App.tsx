import { useState, useEffect, useCallback, useRef } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)
import {
  Box, Typography, TextField, Button, Alert, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, IconButton, Tooltip, Select, MenuItem,
  FormControl, InputLabel, Chip, Grid, Card, CardContent,
  Dialog, DialogTitle, DialogContent, DialogActions, Skeleton,
} from '@mui/material'
import Icon from './components/Common/Icon'
import { getTheme } from './theme'

// --- State Interfaces ---
interface Site { id: number; name: string; api_key: string; location: string; is_active: boolean; amc_expiry?: string; last_sync?: string; lock_status?: string; lock_reason?: string; lock_updated_at?: string; last_error?: string; last_error_at?: string; client_version?: string; notes?: string; }
interface TelemetryPoint { id?: number; value: number | null; quality: string; timestamp: string; }
interface LatestPoint { tag_name: string; name: string; unit?: string; value?: number; quality: string; timestamp: string; }
interface BroadcastItem { id: string; message: string; message_type: string; is_active: boolean; created_at: string; expires_at?: string; target_all: boolean; target_site_id?: number | null; }
interface LockSummary { id: number; lock_status: string; lock_reason?: string; lock_updated_at?: string; }

import Layout from './components/Layout/Layout'
import PageHeader from './components/Common/PageHeader'
import KpiCard from './components/Common/KpiCard'
import StatusBadge from './components/Common/StatusBadge'
import SectionCard from './components/Common/SectionCard'
import EmptyState from './components/Common/EmptyState'

import CreateSiteDialog from './components/Dialogs/CreateSiteDialog'
import EditSiteDialog from './components/Dialogs/EditSiteDialog'
import BroadcastDialog from './components/Dialogs/BroadcastDialog'
import LockDialog from './components/Dialogs/LockDialog'
import Telemetry3DVisualizer from './components/Common/Telemetry3DVisualizer'

function getConnectionStatus(last_sync?: string): { label: string; color: string; statusKey: string } {
  if (!last_sync) return { label: 'NC', color: '#9CA3AF', statusKey: 'nc' };
  const utcStr = last_sync.endsWith('Z') ? last_sync : last_sync + 'Z';
  const diffMs = Date.now() - new Date(utcStr).getTime();
  const diffMins = diffMs / 60000;
  if (diffMins < 5) return { label: 'online', color: '#16A34A', statusKey: 'online' };
  return { label: 'offline', color: '#DC2626', statusKey: 'offline' };
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(sessionStorage.getItem('rajapi_auth') === 'true')
  const [initialLoading, setInitialLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sites, setSites] = useState<Site[]>([])
  const [locks, setLocks] = useState<LockSummary[]>([])

  // History Browser State
  const [historySiteId, setHistorySiteId] = useState<number | null>(null)
  const [historyParams, setHistoryParams] = useState<{ id: number; tag_name: string; name: string }[]>([])
  const [historyParamId, setHistoryParamId] = useState<number | null>(null)
  const [historyFrom, setHistoryFrom] = useState('')
  const [historyTo, setHistoryTo] = useState('')
  const [historyData, setHistoryData] = useState<TelemetryPoint[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [broadcasts, setBroadcasts] = useState<BroadcastItem[]>([])
  const historyChartRef = useRef<HTMLCanvasElement>(null)
  const historyChartInstance = useRef<Chart | null>(null)

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [editSiteModal, setEditSiteModal] = useState<{ id: number; name: string; location: string; notes: string } | null>(null)
  const [lockModal, setLockModal] = useState<{ id: number; name: string; status: string; reason: string } | null>(null)

  // Broadcast Modal State
  const [showBcModal, setShowBcModal] = useState(false)
  const [editingBc, setEditingBc] = useState<BroadcastItem | null>(null)
  const [confirmDeleteBc, setConfirmDeleteBc] = useState<BroadcastItem | null>(null)
  const [deletingBc, setDeletingBc] = useState(false)

  // Plant Action Dialog States
  const [confirmDeleteSite, setConfirmDeleteSite] = useState<Site | null>(null)
  const [deletingSite, setDeletingSite] = useState(false)
  const [confirmRenewSite, setConfirmRenewSite] = useState<Site | null>(null)
  const [renewingSite, setRenewingSite] = useState(false)

  // Gmail-style UI State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All Sites')

  // Live Data Panel State
  const [activeSite, setActiveSite] = useState<Site | null>(null)
  const [liveData, setLiveData] = useState<LatestPoint[]>([])
  const [liveDataLoading, setLiveDataLoading] = useState(false)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [editingExpiry, setEditingExpiry] = useState<number | null>(null)
  const [editExpiryVal, setEditExpiryVal] = useState('')
  const [savingExpiry, setSavingExpiry] = useState(false)

  // Devices state
  const [siteStations, setSiteStations] = useState<{ id: number; site_id: number; station_id: string; username: string; category: string; station_name: string; is_active: boolean; created_at: string }[]>([])
  const [showAddStation, setShowAddStation] = useState(false)
  const [newStation, setNewStation] = useState({ station_id: '', username: '', category: 'emission', station_name: '' })
  const [editingStationId, setEditingStationId] = useState<number | null>(null)
  const [editStationForm, setEditStationForm] = useState({ station_id: '', username: '', category: '', station_name: '' })

  // CPCB Dashboard State
  const [cpcbStatus, setCpcbStatus] = useState<any[]>([])
  const [cpcbSummary, setCpcbSummary] = useState<any[]>([])

  // Quality Dashboard State
  const [qualitySummary, setQualitySummary] = useState<any[]>([])
  const [qualityDetail, setQualityDetail] = useState<any[] | null>(null)
  const [selectedQualitySite, setSelectedQualitySite] = useState<number | null>(null)

  // Alarms State
  const [alarms, setAlarms] = useState<any[]>([])
  const [alarmStats, setAlarmStats] = useState<any>(null)
  const [alarmAcking, setAlarmAcking] = useState<number | null>(null)

  // Notification state
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported'
  )
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('rajapi_dark');
    if (saved !== null) {
      return saved === 'true';
    }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });


  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setNotifPermission(perm)
    if (perm === 'granted') {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification('UltrON Notifications Enabled', {
          body: 'You will receive plant status alerts here.',
          icon: '/pwa-192x192.png',
        })
      })
    }
  }

  const adminFetch = (url: string, options: RequestInit = {}): Promise<Response> => {
    const adminKey = sessionStorage.getItem('rajapi_admin_key') || '';
    return fetch(url, {
      ...options,
      headers: { ...options.headers, 'X-Admin-Key': adminKey } as Record<string, string>,
    });
  };

  const handleLogout = () => { sessionStorage.removeItem('rajapi_auth'); sessionStorage.removeItem('rajapi_admin_key'); setIsLoggedIn(false); };
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      if (res.ok) {
        const data = await res.json()
        sessionStorage.setItem('rajapi_auth', 'true')
        sessionStorage.setItem('rajapi_admin_key', data.admin_key || password)
        setIsLoggedIn(true)
        setLoginError('')
      } else {
        setLoginError('Invalid credentials')
      }
    } catch {
      setLoginError('Network error — could not reach server')
    }
  }

  const handleCreateSite = async (name: string, location: string, amcExpiry: string) => {
    const payload: any = { name, location };
    if (amcExpiry) payload.amc_expiry = new Date(amcExpiry).toISOString();
    if (!sessionStorage.getItem('rajapi_admin_key')) throw new Error('Session expired');
    const res = await adminFetch('/api/v1/sites/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Server error: ${body}`);
    }
    const newSite = await res.json();
    setSites([...sites, newSite]);
  };

  const handleToggleStatus = async (siteId: number, currentStatus: boolean) => {
    try {
      const res = await adminFetch(`/api/v1/sites/${siteId}/status?is_active=${!currentStatus}`, { method: 'PUT' });
      if (res.ok) {
        const updatedSite = await res.json();
        setSites(sites.map(s => s.id === siteId ? updatedSite : s));
      }
    } catch (err) { console.error(err); }
  };

  const handleRenewAmc = (site: Site) => {
    setConfirmRenewSite(site);
  };

  const handleDeleteSite = (site: Site) => {
    setConfirmDeleteSite(site);
  };

  const handleUpdateSite = async (id: number, name: string, location: string, notes: string) => {
    const res = await adminFetch(`/api/v1/sites/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, location, notes })
    });
    if (res.ok) {
      const updated = await res.json();
      setSites(sites.map(s => s.id === id ? updated : s));
      if (activeSite?.id === id) setActiveSite(updated);
    } else {
      const d = await res.json();
      alert('Failed: ' + (d.detail || 'Unknown error'));
    }
  };

  const handleSaveExpiry = async (siteId: number) => {
    if (!editExpiryVal) return;
    setSavingExpiry(true);
    try {
      const res = await adminFetch(`/api/v1/sites/${siteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amc_expiry: new Date(editExpiryVal).toISOString() })
      });
      if (res.ok) {
        const updated = await res.json();
        setSites(sites.map(s => s.id === siteId ? updated : s));
        if (activeSite?.id === siteId) setActiveSite(updated);
        setEditingExpiry(null);
      }
    } catch (err) { console.error(err); } finally { setSavingExpiry(false); }
  };

  const handleLockSave = async (id: number, lockStatus: string, reason: string) => {
    await adminFetch(`/api/v1/sites/${id}/lock`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lock_status: lockStatus, lock_reason: reason })
    });
    const [sitesRes, locksRes] = await Promise.all([
      adminFetch('/api/v1/sites/'),
      adminFetch('/api/v1/sites/locks/summary')
    ]);
    const newSites = sitesRes.ok ? await sitesRes.json() : [];
    const newLocks = locksRes.ok ? await locksRes.json() : [];
    if (Array.isArray(newSites)) setSites(newSites);
    if (Array.isArray(newLocks)) setLocks(newLocks);
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    const load = async () => {
      await Promise.all([
        adminFetch('/api/v1/sites/').then(res => res.ok ? res.json() : []).then(data => Array.isArray(data) && setSites(data)).catch(() => {}),
        adminFetch('/api/v1/broadcasts/').then(res => res.ok ? res.json() : []).then(data => Array.isArray(data) && setBroadcasts(data)).catch(() => {}),
        adminFetch('/api/v1/sites/locks/summary').then(res => res.ok ? res.json() : []).then(data => Array.isArray(data) && setLocks(data)).catch(() => {}),
        adminFetch('/api/v1/cpcb/status').then(res => res.ok ? res.json() : []).then(data => Array.isArray(data) && setCpcbStatus(data)).catch(() => {}),
        adminFetch('/api/v1/cpcb/summary').then(res => res.ok ? res.json() : []).then(data => Array.isArray(data) && setCpcbSummary(data)).catch(() => {}),
        adminFetch('/api/v1/quality/').then(res => res.ok ? res.json() : []).then(data => Array.isArray(data) && setQualitySummary(data)).catch(() => {}),
        adminFetch('/api/v1/alarms/').then(res => res.ok ? res.json() : []).then(data => Array.isArray(data) && setAlarms(data)).catch(() => {}),
        adminFetch('/api/v1/alarms/stats').then(res => res.ok ? res.json() : null).then(data => data && setAlarmStats(data)).catch(() => {})
      ]);
      setInitialLoading(false);
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [isLoggedIn])

  useEffect(() => {
    if (!historySiteId) { setHistoryParams([]); return; }
    adminFetch(`/api/v1/sites/${historySiteId}/telemetry/latest`)
      .then(res => res.ok ? res.json() : [])
      .then((data: { id: number; tag_name: string; name: string }[]) => {
        if (Array.isArray(data)) setHistoryParams(data.map(p => ({ id: p.id, tag_name: p.tag_name, name: p.name })));
      })
      .catch(() => {});
  }, [historySiteId])

  const fetchHistory = async () => {
    if (!historySiteId || !historyParamId) return;
    setHistoryLoading(true);
    setHistoryCursor(null);
    try {
      const params = new URLSearchParams();
      params.set('parameter_id', String(historyParamId));
      if (historyFrom) params.set('from_date', new Date(historyFrom).toISOString());
      if (historyTo) params.set('to_date', new Date(historyTo).toISOString());
      const res = await adminFetch(`/api/v1/sites/${historySiteId}/telemetry/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setHistoryData(data);
        if (Array.isArray(data) && data.length > 0) setHistoryCursor(data[data.length - 1].timestamp);
      }
    } catch (err) { console.error(err); }
    finally { setHistoryLoading(false); }
  }

  const fetchHistoryMore = async () => {
    if (!historySiteId || !historyParamId || !historyCursor) return;
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('parameter_id', String(historyParamId));
      if (historyFrom) params.set('from_date', new Date(historyFrom).toISOString());
      if (historyTo) params.set('to_date', new Date(historyTo).toISOString());
      params.set('before', historyCursor);
      const res = await adminFetch(`/api/v1/sites/${historySiteId}/telemetry/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setHistoryData(prev => [...(prev || []), ...data]);
        if (Array.isArray(data) && data.length > 0) setHistoryCursor(data[data.length - 1].timestamp);
      }
    } catch (err) { console.error(err); }
    finally { setHistoryLoading(false); }
  }

  useEffect(() => {
    if (!historyChartRef.current || !historyData) return;
    if (historyChartInstance.current) { historyChartInstance.current.destroy(); historyChartInstance.current = null; }
    const pts = historyData.slice().reverse();
    const labels = pts.map(p => new Date(p.timestamp).toLocaleString());
    const values = pts.map(p => p.value);
    const ctx = historyChartRef.current.getContext('2d');
    if (!ctx) return;
    const lineColor = darkMode ? '#60A5FA' : '#2563eb';
    const fillColor = darkMode ? 'rgba(96,165,250,0.1)' : 'rgba(37,99,235,0.1)';
    const gridColor = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const tickColor = darkMode ? '#94A3B8' : '#64748B';
    historyChartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Value', data: values,
          borderColor: lineColor, backgroundColor: fillColor,
          fill: true, tension: 0.1, spanGaps: false, pointRadius: 2,
          pointBackgroundColor: values.map(v => v == null ? 'transparent' : lineColor),
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 10, font: { size: 10 }, color: tickColor }, grid: { color: gridColor } },
          y: { beginAtZero: false, ticks: { color: tickColor }, grid: { color: gridColor } }
        }
      }
    });
    return () => { if (historyChartInstance.current) { historyChartInstance.current.destroy(); historyChartInstance.current = null; } };
  }, [historyData, darkMode])

  const fetchLiveData = useCallback(async (siteId: number) => {
    setLiveDataLoading(true);
    try {
      const res = await adminFetch(`/api/v1/sites/${siteId}/telemetry/latest`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setLiveData(data);
      }
    } catch (err) { console.error(err); }
    finally { setLiveDataLoading(false); }
  }, []);

  useEffect(() => {
    if (!activeSite) return;
    fetchLiveData(activeSite.id);
    const interval = setInterval(() => fetchLiveData(activeSite.id), 10000);
    return () => clearInterval(interval);
  }, [activeSite, fetchLiveData]);

  useEffect(() => {
    if (!activeSite) { setSiteStations([]); return; }
    adminFetch(`/api/v1/stations/?site_id=${activeSite.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d)) setSiteStations(d); });
  }, [activeSite]);

  // --- LOGIN PAGE ---
  const loginPage = (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
      <Paper elevation={0} sx={{ p: { xs: 3, sm: 4 }, maxWidth: 420, width: '100%', borderRadius: '16px' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4, textAlign: 'center' }}>
          <img 
            src="/assets/Ultron_logo.png" 
            alt="UltrON" 
            style={{ height: 80, width: 80, objectFit: 'contain', marginBottom: 16 }} 
          />
          <Typography variant="h4" sx={{ fontWeight: 800, fontSize: '24px', mb: 0.5 }}>Neeraj</Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>Super Admin Portal</Typography>
        </Box>
        <Box component="form" onSubmit={handleLogin} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField label="Username" value={username} onChange={e => setUsername(e.target.value)} required fullWidth />
          <TextField label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required fullWidth />
          {loginError && <Alert severity="error">{loginError}</Alert>}
          <Button type="submit" variant="contained" size="large" fullWidth sx={{ py: 1.5 }}>
            Sign In
          </Button>
        </Box>
      </Paper>
    </Box>
  );

  const filteredSites = sites.filter(site => {
    if (selectedCategory === 'Online' && !site.is_active) return false;
    if (selectedCategory === 'Offline' && site.is_active) return false;
    if (selectedCategory === 'Sync Issues' && !site.last_error) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return site.name.toLowerCase().includes(q) || (site.location && site.location.toLowerCase().includes(q));
    }
    return true;
  });

  const kpiData = [
    { id: 'total', icon: <Icon name="Factory" size={26} />, label: 'Total Plants', value: sites.length, color: '#2563EB', trend: { value: `${sites.length} registered`, positive: true } },
    { id: 'online', icon: <Icon name="Wifi" size={26} />, label: 'Online', value: sites.filter(s => s.is_active && getConnectionStatus(s.last_sync).statusKey === 'online').length, color: '#16A34A', trend: { value: `${Math.round(sites.filter(s => s.is_active).length / Math.max(sites.length, 1) * 100)}% uptime`, positive: true } },
    { id: 'offline', icon: <Icon name="WifiOff" size={26} />, label: 'Offline', value: sites.filter(s => !s.is_active).length, color: '#DC2626', trend: { value: `${sites.filter(s => !s.is_active && s.last_error).length} with errors`, positive: false } },
    { id: 'alarms', icon: <Icon name="AlertTriangle" size={26} />, label: 'Critical Alerts', value: alarmStats?.total_active || 0, color: '#F59E0B', subtitle: `${alarmStats?.total_today || 0} triggered today` },
    { id: 'notif', icon: <Icon name="BellRing" size={26} />, label: 'Notifications', value: alarms.filter((a: any) => a.status === 'active').length, color: '#8B5CF6' },
    { id: 'amc', icon: <Icon name="CalendarRange" size={26} />, label: 'AMC Expiring', value: sites.filter(s => s.amc_expiry && new Date(s.amc_expiry) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).length, color: '#EC4899' },
  ];


  const renderSkeleton = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Skeleton variant="text" width="40%" height={40} />
        <Skeleton variant="text" width="60%" height={24} />
      </Box>
      <Grid container spacing={3}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 2 }} />
          </Grid>
        ))}
      </Grid>
      <Box sx={{ display: 'flex', gap: 3, mt: 2, flexDirection: { xs: 'column', lg: 'row' } }}>
        <Box sx={{ flex: 2 }}>
          <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 2 }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 2 }} />
        </Box>
      </Box>
    </Box>
  );

  const renderContent = () => {
    if (initialLoading) return renderSkeleton();
    switch (activeTab) {
      case 'dashboard': return renderDashboard();
      case 'broadcasts': return renderBroadcasts();
      case 'commands': return renderCommands();
      case 'history': return renderHistory();
      case 'locks': return renderLocks();
      case 'cpcb': return renderCpcb();
      case 'quality': return renderQuality();
      case 'alarms': return renderAlarms();
      case 'fleet': return renderDashboard();
      default: return renderDashboard();
    }
  };

  // --- DASHBOARD ---
  const renderDashboard = () => (
    <>
      <PageHeader title="Fleet Operations Overview" subtitle="Real-time monitoring of all UltrON gateways." />
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {kpiData.map(kpi => (
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }} key={kpi.id}>
            <KpiCard icon={kpi.icon} label={kpi.label} value={kpi.value} subtitle={kpi.subtitle} trend={kpi.trend} color={kpi.color} />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <SectionCard title="Registered Plants" subtitle={`${filteredSites.length} plants match your criteria`}
            action={
              <Box sx={{ display: 'flex', gap: 1 }}>
                {['All Sites', 'Online', 'Offline', 'Sync Issues'].map(cat => (
                  <Chip key={cat} label={cat} size="small"
                    onClick={() => setSelectedCategory(cat)}
                    variant={selectedCategory === cat ? 'filled' : 'outlined'}
                    color={selectedCategory === cat ? 'primary' : 'default'}
                    sx={{ cursor: 'pointer', fontWeight: 500 }}
                  />
                ))}
              </Box>
            }
          >
            {filteredSites.length === 0 ? (
              <EmptyState icon={<Icon name="Factory" size={56} />} title="No Plants Added"
                description="Register your first plant to start monitoring."
                action={{ label: 'Register Plant', onClick: () => setShowModal(true) }}
              />
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Plant</TableCell>
                      <TableCell>Location</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Connectivity</TableCell>
                      <TableCell>AMC Expiry</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredSites.map(site => {
                      const conn = getConnectionStatus(site.last_sync);
                      return (
                        <TableRow key={site.id} hover
                          onClick={() => setActiveSite(site)}
                          sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 'none' }, bgcolor: activeSite?.id === site.id ? 'primary.light' : 'inherit' }}
                        >
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{site.name}</Typography>
                            {site.client_version && <Typography variant="caption" sx={{ color: 'text.secondary' }}>v{site.client_version}</Typography>}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{site.location || 'Unknown'}</Typography>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={conn.statusKey} />
                          </TableCell>
                          <TableCell>
                            {site.last_error && <Tooltip title={site.last_error}><Icon name="AlertTriangle" size={18} color="#DC2626" /></Tooltip>}
                          </TableCell>
                          <TableCell>
                            {editingExpiry === site.id ? (
                              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                                <input type="date" value={editExpiryVal} onChange={e => setEditExpiryVal(e.target.value)}
                                  style={{ width: 100, padding: '2px 4px', border: '1px solid #E5E7EB', borderRadius: 4, fontSize: 12 }}
                                />
                                <IconButton size="small" onClick={() => handleSaveExpiry(site.id)} disabled={savingExpiry} sx={{ color: 'primary.main' }}><Icon name="RefreshCw" size={18} /></IconButton>
                                <IconButton size="small" onClick={() => setEditingExpiry(null)} sx={{ color: 'text.secondary' }}><Icon name="X" size={18} /></IconButton>
                              </Box>
                            ) : (
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {site.amc_expiry ? new Date(site.amc_expiry).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                              <Tooltip title="Edit AMC Expiry"><IconButton size="small" onClick={() => { setEditingExpiry(site.id); setEditExpiryVal(site.amc_expiry?.split('T')[0] || ''); }} sx={{ color: 'text.secondary' }}><Icon name="CalendarRange" size={18} /></IconButton></Tooltip>
                              <Tooltip title={site.is_active ? 'Deactivate' : 'Activate'}><IconButton size="small" onClick={() => handleToggleStatus(site.id, site.is_active)} sx={{ color: 'text.secondary' }}><Icon name="Power" size={18} /></IconButton></Tooltip>
                              <Tooltip title="Renew AMC"><IconButton size="small" onClick={() => handleRenewAmc(site)} sx={{ color: 'text.secondary' }}><Icon name="RotateCcw" size={18} /></IconButton></Tooltip>
                              <Tooltip title="Edit"><IconButton size="small" onClick={() => setEditSiteModal({ id: site.id, name: site.name, location: site.location || '', notes: site.notes || '' })} sx={{ color: 'text.secondary' }}><Icon name="Pencil" size={18} /></IconButton></Tooltip>
                              <Tooltip title="Delete"><IconButton size="small" onClick={() => handleDeleteSite(site)} sx={{ color: 'text.secondary' }}><Icon name="Trash2" size={18} /></IconButton></Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </SectionCard>
        </Grid>

        {/* Right Panel: Live Data & Fleet Telemetry Globe */}
        <Grid size={{ xs: 12, lg: 5 }} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <SectionCard 
            title="Fleet Telemetry Globe" 
            subtitle="Drag to rotate globe. Hover nodes to view status. Click node to select."
          >
            <Telemetry3DVisualizer sites={sites} activeSite={activeSite} onSelectSite={setActiveSite} />
          </SectionCard>

          {activeSite ? (
            <SectionCard
              title={activeSite.name}
              subtitle={activeSite.location || 'Unknown Location'}
              action={
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Tooltip title="Restart Polling"><span><IconButton size="small"
                    disabled={getConnectionStatus(activeSite.last_sync).statusKey !== 'online'}
                    onClick={async () => {
                      if (!confirm(`Send "Restart Polling" to ${activeSite.name}?`)) return;
                      const res = await adminFetch(`/api/v1/commands/sites/${activeSite.id}/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restart_polling' }) });
                      const d = await res.json();
                      alert(res.ok ? `✅ Restart Polling sent` : `❌ ${d.detail || 'Failed'}`);
                    }}
                    sx={{ color: 'text.secondary' }}><Icon name="RefreshCw" size={18} /></IconButton></span></Tooltip>
                  <Tooltip title="Close"><IconButton size="small" onClick={() => { setActiveSite(null); setLiveData([]); }} sx={{ color: 'text.secondary' }}><Icon name="X" size={18} /></IconButton></Tooltip>
                </Box>
              }
            >
              {(() => {
                const c = getConnectionStatus(activeSite.last_sync);
                return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c.color }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{c.label}</Typography>
                  {c.statusKey === 'online' && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#16A34A', animation: 'pulse 2s infinite', ml: 1 }} />}
                  {activeSite.last_sync && <Typography variant="caption" sx={{ color: 'text.disabled', ml: 1 }}>Last sync: {new Date(activeSite.last_sync).toLocaleString()}</Typography>}
                </Box>;
              })()}

              {activeSite.api_key && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, bgcolor: 'action.hover', px: 1.5, py: 0.75, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 10 }}>Site Key:</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'mono', color: 'text.primary', fontSize: 10 }}>
                    {activeSite.api_key.length > 25 ? `${activeSite.api_key.substring(0, 15)}...${activeSite.api_key.substring(activeSite.api_key.length - 10)}` : activeSite.api_key}
                  </Typography>
                  <IconButton size="small" onClick={() => { navigator.clipboard.writeText(activeSite.api_key); }} sx={{ color: 'text.secondary', ml: 'auto', p: 0.25 }}>
                    <Icon name="Copy" size={16} />
                  </IconButton>
                </Box>
              )}

              {/* Live data table */}
              {liveData.length === 0 && !liveDataLoading ? (
                <EmptyState icon={<Icon name="Radio" size={56} />} title="No Telemetry Data" description="UltrON client will sync data here." />
              ) : (
                <TableContainer>
                  <Table size="small" sx={{ '& .MuiTableCell-root': { px: 1, py: 1 } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Tag</TableCell>
                        <TableCell align="right">Value</TableCell>
                        <TableCell align="center">Quality</TableCell>
                        <TableCell align="right">Time</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {liveDataLoading && liveData.length === 0 ? (
                        <TableRow><TableCell colSpan={4} sx={{ textAlign: 'center', py: 4 }}><div className="loader"></div></TableCell></TableRow>
                      ) : liveData.map((pt) => {
                        const isGood = pt.quality?.toLowerCase() === 'good';
                        const ago = pt.timestamp ? (() => {
                          const utcTs = pt.timestamp.endsWith('Z') ? pt.timestamp : pt.timestamp + 'Z';
                          const diff = Math.floor((Date.now() - new Date(utcTs).getTime()) / 1000);
                          if (diff < 60) return `${diff}s`; if (diff < 3600) return `${Math.floor(diff / 60)}m`; return `${Math.floor(diff / 3600)}h`;
                        })() : '-';
                        return (
                          <TableRow key={pt.tag_name} hover>
                            <TableCell>
                              <Typography variant="caption" sx={{ fontWeight: 600, fontFamily: 'mono' }}>{pt.tag_name}</Typography>
                              {pt.name !== pt.tag_name && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{pt.name}</Typography>}
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>{pt.value != null ? Number(pt.value).toFixed(2) : '—'}</Typography>
                              {pt.unit && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{pt.unit}</Typography>}
                            </TableCell>
                            <TableCell align="center"><StatusBadge status={isGood ? 'healthy' : 'error'} size="small" /></TableCell>
                            <TableCell align="right"><Typography variant="caption" sx={{ color: 'text.secondary' }}>{ago}</Typography></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}


              <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Typography variant="overline" sx={{ color: 'text.secondary' }}>Stations</Typography>
                  <Button size="small" variant="outlined" startIcon={<Icon name="Plus" size={14} />}
                    onClick={() => setShowAddStation(!showAddStation)}>Add</Button>
                </Box>
                {showAddStation && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5, p: 1.5, bgcolor: 'action.focus', borderRadius: 1 }}>
                    <TextField size="small" label="Station ID" value={newStation.station_id} onChange={e => setNewStation({ ...newStation, station_id: e.target.value })} />
                    <TextField size="small" label="Username" value={newStation.username} onChange={e => setNewStation({ ...newStation, username: e.target.value })} />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      {['emission', 'effluent', 'ambient'].map(c => (
                        <Button key={c} size="small" variant={newStation.category === c ? 'contained' : 'outlined'}
                          onClick={() => setNewStation({ ...newStation, category: c })} sx={{ textTransform: 'capitalize' }}>{c}</Button>
                      ))}
                    </Box>
                    <TextField size="small" label="Station Name" value={newStation.station_name} onChange={e => setNewStation({ ...newStation, station_name: e.target.value })} />
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                      <Button size="small" onClick={() => { setShowAddStation(false); setNewStation({ station_id: '', username: '', category: 'emission', station_name: '' }); }}>Cancel</Button>
                      <Button size="small" variant="contained" onClick={async () => {
                        if (!newStation.station_id || !newStation.username || !newStation.station_name) return;
                        const res = await adminFetch(`/api/v1/stations/?site_id=${activeSite!.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newStation) });
                        if (res.ok) { const c = await res.json(); setSiteStations([...siteStations, c]); setShowAddStation(false); setNewStation({ station_id: '', username: '', category: 'emission', station_name: '' }); }
                      }}>Create</Button>
                    </Box>
                  </Box>
                )}
                {siteStations.length === 0 ? (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>No stations configured.</Typography>
                ) : siteStations.map(s => (
                  <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'action.hover', borderRadius: 1, px: 1.5, py: 1, mb: 0.5 }}>
                    {editingStationId === s.id ? (
                      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <TextField size="small" label="Station ID" value={editStationForm.station_id} onChange={e => setEditStationForm({ ...editStationForm, station_id: e.target.value })} />
                        <TextField size="small" label="Username" value={editStationForm.username} onChange={e => setEditStationForm({ ...editStationForm, username: e.target.value })} />
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          {['emission', 'effluent', 'ambient'].map(c => (
                            <Button key={c} size="small" variant={editStationForm.category === c ? 'contained' : 'outlined'}
                              onClick={() => setEditStationForm({ ...editStationForm, category: c })} sx={{ textTransform: 'capitalize' }}>{c}</Button>
                          ))}
                        </Box>
                        <TextField size="small" label="Station Name" value={editStationForm.station_name} onChange={e => setEditStationForm({ ...editStationForm, station_name: e.target.value })} />
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                          <Button size="small" onClick={() => { setEditingStationId(null); }}>Cancel</Button>
                          <Button size="small" variant="contained" onClick={async () => {
                            const res = await adminFetch(`/api/v1/stations/${s.id}?site_id=${activeSite!.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editStationForm) });
                            if (res.ok) { const u = await res.json(); setSiteStations(siteStations.map(x => x.id === s.id ? u : x)); setEditingStationId(null); }
                          }}>Save</Button>
                        </Box>
                      </Box>
                    ) : (
                      <>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{s.station_name}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {s.station_id} · {s.username} · <Box component="span" sx={{ textTransform: 'capitalize' }}>{s.category}</Box>
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.25 }}>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => { setEditingStationId(s.id); setEditStationForm({ station_id: s.station_id, username: s.username, category: s.category, station_name: s.station_name }); }} sx={{ color: 'text.secondary' }}><Icon name="Pencil" size={18} /></IconButton></Tooltip>
                          <Tooltip title="Delete"><IconButton size="small" onClick={async () => {
                            if (!confirm(`Delete station "${s.station_name}"?`)) return;
                            const res = await adminFetch(`/api/v1/stations/${s.id}?site_id=${activeSite!.id}`, { method: 'DELETE' });
                            if (res.ok) setSiteStations(siteStations.filter(x => x.id !== s.id));
                          }} sx={{ color: 'text.secondary' }}><Icon name="Trash2" size={18} /></IconButton></Tooltip>
                        </Box>
                      </>
                    )}
                  </Box>
                ))}
              </Box>
            </SectionCard>
          ) : (
            <SectionCard title="Live Monitoring">
              <EmptyState icon={<Icon name="Radio" size={56} />} title="Select a Plant"
                description="Click on a plant from the list to view live telemetry data."
              />
            </SectionCard>
          )}
        </Grid>
      </Grid>
    </>
  );

  // --- BROADCASTS ---
  const renderBroadcasts = () => (
    <>
      <PageHeader title="Broadcast Center" subtitle="Send announcements to UltrON clients."
        action={<Button variant="contained" startIcon={<Icon name="Megaphone" size={20} />}
          onClick={() => { setEditingBc(null); setShowBcModal(true); }}>New Broadcast</Button>}
      />
      {broadcasts.length === 0 ? (
        <SectionCard><EmptyState icon={<Icon name="Megaphone" size={56} />} title="No Broadcasts"
          description="Create one to send messages to all UltrON clients."
          action={{ label: 'New Broadcast', onClick: () => { setEditingBc(null); setShowBcModal(true); } }}
        /></SectionCard>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {broadcasts.map(bc => (
            <SectionCard key={bc.id}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                    <Chip label={bc.message_type.toUpperCase()} size="small"
                      color={bc.message_type === 'critical' ? 'error' : bc.message_type === 'warning' ? 'warning' : 'primary'}
                      variant="outlined" sx={{ fontWeight: 700 }}
                    />
                    <StatusBadge status={bc.is_active ? 'active' : 'inactive'} />
                    {bc.expires_at && <Typography variant="caption" sx={{ color: 'text.secondary' }}>Expires: {new Date(bc.expires_at).toLocaleDateString()}</Typography>}
                  </Box>
                  <Typography variant="body1" sx={{ mb: 1 }}>{bc.message}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label={bc.target_all ? 'All Sites' : `Site #${bc.target_site_id}`} size="small" variant="outlined" />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{new Date(bc.created_at).toLocaleString()}</Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                  <Button size="small" variant="outlined"
                    onClick={async () => {
                      await adminFetch(`/api/v1/broadcasts/${bc.id}/toggle`, { method: 'PUT' });
                      const res = await adminFetch('/api/v1/broadcasts/');
                      if (res.ok) setBroadcasts(await res.json());
                    }}
                    color={bc.is_active ? 'warning' : 'success'}
                  >{bc.is_active ? 'Deactivate' : 'Activate'}</Button>
                  <Button size="small"
                    onClick={() => { setEditingBc(bc); setShowBcModal(true); }}
                  >Edit</Button>
                  <Button size="small" color="error"
                    onClick={() => setConfirmDeleteBc(bc)}
                  >Delete</Button>
                </Box>
              </Box>
            </SectionCard>
          ))}
        </Box>
      )}

      {/* Broadcast Delete Confirmation Dialog */}
      <Dialog open={!!confirmDeleteBc} onClose={() => !deletingBc && setConfirmDeleteBc(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Broadcast?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Are you sure you want to delete this broadcast? This cannot be undone.
          </Typography>
          {confirmDeleteBc && (
            <Typography variant="body2" sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontStyle: 'italic' }}>
              "{confirmDeleteBc.message}"
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setConfirmDeleteBc(null)} disabled={deletingBc}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={deletingBc}
            onClick={async () => {
              if (!confirmDeleteBc) return;
              setDeletingBc(true);
              try {
                const res = await adminFetch(`/api/v1/broadcasts/${confirmDeleteBc.id}`, { method: 'DELETE' });
                if (res.ok) {
                  setBroadcasts(prev => prev.filter(b => b.id !== confirmDeleteBc.id));
                  setConfirmDeleteBc(null);
                } else {
                  const err = await res.json().catch(() => ({}));
                  alert('Delete failed: ' + (err.detail || res.statusText));
                }
              } catch {
                alert('Network error — could not delete broadcast');
              } finally {
                setDeletingBc(false);
              }
            }}
          >
            {deletingBc ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );

  // --- COMMANDS ---
  const renderCommands = () => (
    <>
      <PageHeader title="Remote Commands" subtitle="Send restart, reboot, and reset commands to UltrON clients."
        action={<Chip label="Client polls every 60s" size="small" variant="outlined" icon={<Icon name="Activity" size={18} />} />}
      />
      {sites.length === 0 ? (
        <SectionCard><EmptyState icon={<Icon name="Factory" size={56} />} title="No Plants Registered" /></SectionCard>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {sites.map(site => {
            const conn = getConnectionStatus(site.last_sync);
            return (
              <SectionCard key={site.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: conn.color }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{site.name}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{site.location || ''}</Typography>
                      {site.last_sync && <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>{new Date(site.last_sync).toLocaleString()}</Typography>}
                    </Box>
                    <StatusBadge status={conn.statusKey} />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" variant="outlined" disabled={conn.statusKey !== 'online'}
                      onClick={async () => {
                        if (!confirm(`Send "Restart Polling" to ${site.name}?`)) return;
                        try {
                          const res = await adminFetch(`/api/v1/commands/sites/${site.id}/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restart_polling' }) });
                          if (res.ok) alert(`✅ Restart Polling sent to ${site.name}`); else { const d = await res.json(); alert(`❌ ${d.detail || 'Failed'}`); }
                        } catch { alert('❌ Network error'); }
                      }}
                      startIcon={<Icon name="RefreshCw" size={20} />}
                    >Restart Polling</Button>
                    <Button size="small" variant="outlined" color="warning" disabled={conn.statusKey !== 'online'}
                      onClick={async () => {
                        if (!confirm(`⚠️ Send "Reboot System" to ${site.name}? The PC will restart immediately.`)) return;
                        try {
                          const res = await adminFetch(`/api/v1/commands/sites/${site.id}/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reboot_system' }) });
                          if (res.ok) alert(`✅ Reboot sent to ${site.name}`); else { const d = await res.json(); alert(`❌ ${d.detail || 'Failed'}`); }
                        } catch { alert('❌ Network error'); }
                      }}
                      startIcon={<Icon name="Power" size={20} />}
                    >Reboot PC</Button>
                    <Button size="small" variant="outlined" color="error" disabled={conn.statusKey !== 'online'}
                      onClick={async () => {
                        if (!confirm(`☠️ Send "Factory Reset" to ${site.name}? ALL data on that PC will be erased!`)) return;
                        if (!confirm(`ARE YOU SURE? This will DESTROY all local data on ${site.name}.`)) return;
                        try {
                          const res = await adminFetch(`/api/v1/commands/sites/${site.id}/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'factory_reset' }) });
                          if (res.ok) alert(`✅ Factory Reset sent to ${site.name}`); else { const d = await res.json(); alert(`❌ ${d.detail || 'Failed'}`); }
                        } catch { alert('❌ Network error'); }
                      }}
                      startIcon={<Icon name="AlertTriangle" size={20} />}
                    >Factory Reset</Button>
                  </Box>
                </Box>
              </SectionCard>
            );
          })}
        </Box>
      )}
    </>
  );

  // --- HISTORY ---
  const renderHistory = () => (
    <>
      <PageHeader title="Telemetry History" subtitle="Browse historical telemetry data for any site and parameter." />
      <SectionCard sx={{ mb: 3 }}>
        <Grid container spacing={2} sx={{ alignItems: 'flex-end' }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Site</InputLabel>
              <Select value={historySiteId || ''} label="Site" onChange={e => { setHistorySiteId(e.target.value ? Number(e.target.value) : null); setHistoryParamId(null); setHistoryData(null); }}>
                <MenuItem value=""><em>Select a site...</em></MenuItem>
                {sites.filter(s => s.is_active).map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Parameter</InputLabel>
              <Select value={historyParamId || ''} label="Parameter" onChange={e => setHistoryParamId(e.target.value ? Number(e.target.value) : null)} disabled={!historySiteId}>
                <MenuItem value=""><em>Select parameter...</em></MenuItem>
                {historyParams.map(p => <MenuItem key={p.id} value={p.id}>{p.tag_name} — {p.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField label="From" type="datetime-local" value={historyFrom} onChange={e => setHistoryFrom(e.target.value)} fullWidth size="small" slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField label="To" type="datetime-local" value={historyTo} onChange={e => setHistoryTo(e.target.value)} fullWidth size="small" slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <Button variant="contained" fullWidth onClick={fetchHistory} disabled={!historySiteId || !historyParamId || historyLoading}>
              {historyLoading ? 'Loading...' : 'Load'}
            </Button>
          </Grid>
        </Grid>
      </SectionCard>

      {historyData && (
        <>
          <Card sx={{ mb: 3, height: 280 }}>
            <CardContent sx={{ p: 2, height: '100%' }}>
              <canvas ref={historyChartRef} style={{ height: '100%', width: '100%' }} />
            </CardContent>
          </Card>
          <SectionCard>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Timestamp</TableCell>
                    <TableCell align="right">Value</TableCell>
                    <TableCell align="center">Quality</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyData.length === 0 ? (
                    <TableRow><TableCell colSpan={3} align="center" sx={{ py: 6, color: 'text.secondary' }}>No data in this range.</TableCell></TableRow>
                  ) : historyData.map((p, i) => (
                    <TableRow key={p.id ?? i} hover>
                      <TableCell><Typography variant="caption" sx={{ fontFamily: 'mono' }}>{new Date(p.timestamp).toLocaleString()}</Typography></TableCell>
                      <TableCell align="right"><Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'mono' }}>{p.value != null ? Number(p.value).toFixed(2) : '—'}</Typography></TableCell>
                      <TableCell align="center"><StatusBadge status={p.quality} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {historyData.length > 0 && (
              <Box sx={{ textAlign: 'center', py: 1.5, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <Button size="small" onClick={fetchHistoryMore} disabled={historyLoading}>
                  {historyLoading ? 'Loading...' : 'Load older data'}
                </Button>
              </Box>
            )}
          </SectionCard>
        </>
      )}
    </>
  );

  // --- LOCKS ---
  const renderLocks = () => (
    <>
      <PageHeader title="AMC Management" subtitle="Locked sites stop sending CPCB data. Use for AMC non-renewal or violations." />
      {locks.length === 0 ? (
        <SectionCard><EmptyState icon={<Icon name="CalendarRange" size={56} />} title="No Lock Data Available" description="Lock status appears when sites are registered." /></SectionCard>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {locks.map(lock => {
            const site = sites.find(s => s.id === lock.id);
            const isLocked = lock.lock_status && lock.lock_status !== 'unlocked';
            return (
              <SectionCard key={lock.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>{site?.name || `Site #${lock.id}`}</Typography>
                      <StatusBadge status={isLocked ? 'locked' : 'unlocked'} />
                    </Box>
                    {isLocked && lock.lock_reason && <Typography variant="caption" sx={{ color: 'text.secondary' }}>Reason: {lock.lock_reason}</Typography>}
                    {lock.lock_updated_at && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Updated: {new Date(lock.lock_updated_at).toLocaleString()}</Typography>}
                  </Box>
                  <Button variant="contained"
                    color={isLocked ? 'success' : 'error'}
                    onClick={() => setLockModal({ id: lock.id, name: site?.name || `Site #${lock.id}`, status: isLocked ? 'unlocked' : 'manual_lock', reason: '' })}
                  >{isLocked ? 'Unlock' : 'Lock'}</Button>
                </Box>
              </SectionCard>
            );
          })}
        </Box>
      )}
    </>
  );

  // --- CPCB ---
  const renderCpcb = () => {
    return (
      <>
        <PageHeader title="CPCB Compliance" subtitle="CPCB compliance sync status and daily record counts." />
        {cpcbStatus.length === 0 ? (
          <SectionCard><EmptyState icon={<Icon name="FileBarChart2" size={56} />} title="No CPCB Data Available" /></SectionCard>
        ) : (
          <>
            <Grid container spacing={2.5} sx={{ mb: 3 }}>
              {cpcbStatus.map(site => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={site.site_id}>
                  <SectionCard title={site.site_name}
                    action={<Chip label={site.last_error ? 'Error' : 'OK'} color={site.last_error ? 'error' : 'success'} size="small" variant="outlined" />}
                  >
                    <Typography variant="h3" sx={{ fontSize: '32px', fontWeight: 700, color: '#2563EB', mb: 0.5 }}>
                      {site.total_records_synced_today?.toLocaleString() || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>records synced today</Typography>
                    {site.last_tgpcb_sync && (
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                        Last sync: {new Date(site.last_tgpcb_sync).toLocaleString()}
                      </Typography>
                    )}
                    {site.last_error && (
                      <Alert severity="error" sx={{ mt: 1, py: 0, '& .MuiAlert-message': { fontSize: 12 } }}>
                        {site.last_error}
                      </Alert>
                    )}
                  </SectionCard>
                </Grid>
              ))}
            </Grid>
          </>
        )}
        {cpcbSummary.length > 0 && (
          <SectionCard title="30-Day Daily Record Counts">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {cpcbSummary.map(site => (
                <Box key={site.site_id}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>{site.site_name}</Typography>
                  {site.daily_counts.length === 0 ? (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>No data in last 30 days.</Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {site.daily_counts.map((d: any, i: number) => (
                        <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', bgcolor: 'action.hover', borderRadius: 1, px: 1.5, py: 0.75, minWidth: 52 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', fontFamily: 'mono' }}>{d.record_count}</Typography>
                          <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>{new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          </SectionCard>
        )}
      </>
    );
  };

  // --- QUALITY ---
  const renderQuality = () => (
    <>
      <PageHeader title="Audit Logs" subtitle="U/O/E/N quality breakdown per site (CPCB standard)." />
      {selectedQualitySite ? (
        <>
          <Button size="small" startIcon={<Icon name="SkipBack" size={20} />} onClick={() => { setSelectedQualitySite(null); setQualityDetail(null); }} sx={{ mb: 2 }}>
            Back to site summary
          </Button>
          {qualityDetail === null ? (
            <Box sx={{ textAlign: 'center', py: 4 }}><div className="loader"></div></Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {qualityDetail.map(p => (
                <SectionCard key={p.parameter_id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.parameter_name}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{p.tag_name}{p.unit ? ` (${p.unit})` : ''}</Typography>
                    </Box>
                    <Chip label={`${p.total_points} points`} size="small" variant="outlined" />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {[
                      { key: 'U', label: 'Valid', color: 'success' as const },
                      { key: 'O', label: 'Invalid', color: 'error' as const },
                      { key: 'E', label: 'Error', color: 'warning' as const },
                      { key: 'N', label: 'None', color: 'default' as const },
                    ].map(({ key, label, color }) => (
                      <Chip key={key} label={`${p.quality[key]?.count || 0} ${label}`} color={color} variant="outlined" size="small" sx={{ fontWeight: 600 }} />
                    ))}
                  </Box>
                </SectionCard>
              ))}
            </Box>
          )}
        </>
      ) : (
        <>
          {qualitySummary.length === 0 ? (
            <SectionCard><EmptyState icon={<Icon name="History" size={56} />} title="No Quality Data Available" /></SectionCard>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {qualitySummary.map(site => (
                <SectionCard key={site.site_id} sx={{ cursor: 'pointer', '&:hover': { borderColor: '#2563EB' } }}
                  onClick={() => {
                    setSelectedQualitySite(site.site_id);
                    adminFetch(`/api/v1/quality/${site.site_id}`).then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) && setQualityDetail(d)).catch(() => {});
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{site.site_name}</Typography>
                    <Chip label={`${site.total_points} total points`} size="small" variant="outlined" />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {[
                      { key: 'U', label: 'Valid', color: 'success' as const },
                      { key: 'O', label: 'Invalid', color: 'error' as const },
                      { key: 'E', label: 'Error', color: 'warning' as const },
                      { key: 'N', label: 'None', color: 'default' as const },
                    ].map(({ key, label, color }) => {
                      const q = site.quality?.[key];
                      return (
                        <Chip key={key} label={`${q?.count || 0} (${q?.percentage || 0}%) ${label}`} color={color} variant="outlined" size="small" sx={{ fontWeight: 600 }} />
                      );
                    })}
                  </Box>
                </SectionCard>
              ))}
            </Box>
          )}
        </>
      )}
    </>
  );

  // --- ALARMS ---
  const renderAlarms = () => (
    <>
      <PageHeader title="Notifications" subtitle="Active and recent alarms across all sites."
        action={alarmStats ? (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ textAlign: 'center', px: 2, py: 1, bgcolor: 'error.light', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'error.main' }}>{alarmStats.total_active}</Typography>
              <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 500 }}>Active</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', px: 2, py: 1, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.secondary' }}>{alarmStats.total_today}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>Today</Typography>
            </Box>
          </Box>
        ) : null}
      />
      {alarms.length === 0 ? (
        <SectionCard><EmptyState icon={<Icon name="BellRing" size={56} />} title="No Notifications"
          description="Alarms appear when quality issues are detected." /></SectionCard>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {alarms.map(a => (
            <SectionCard key={a.id} sx={{ borderColor: a.status === 'active' ? '#FECACA' : undefined }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                    <Chip label={`Q${a.quality}`} size="small" variant="outlined"
                      color={a.quality === 'E' ? 'error' : a.quality === 'O' ? 'warning' : 'default'}
                      sx={{ fontWeight: 700 }}
                    />
                    <StatusBadge status={a.status} />
                    {a.site_name && <Typography variant="caption" sx={{ fontWeight: 500 }}>{a.site_name}</Typography>}
                  </Box>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>{a.message}</Typography>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    {a.parameter_id && <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'mono' }}>Param #{a.parameter_id}</Typography>}
                    {a.value != null && <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'mono' }}>Value: {a.value}</Typography>}
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{new Date(a.created_at).toLocaleString()}</Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                  {a.status === 'active' && (
                    <Button size="small" variant="contained" color="success"
                      disabled={alarmAcking === a.id}
                      onClick={async () => {
                        setAlarmAcking(a.id);
                        try {
                          const res = await adminFetch(`/api/v1/alarms/${a.id}/ack`, { method: 'POST' });
                          if (res.ok) {
                            setAlarms(alarms.map(x => x.id === a.id ? { ...x, status: 'acknowledged', acknowledged_at: new Date().toISOString() } : x));
                            const sRes = await adminFetch('/api/v1/alarms/stats');
                            if (sRes.ok) setAlarmStats(await sRes.json());
                          }
                        } finally { setAlarmAcking(null); }
                      }}
                    >{alarmAcking === a.id ? '...' : 'Acknowledge'}</Button>
                  )}
                  {a.acknowledged_at && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', alignSelf: 'center' }}>
                      Acked: {new Date(a.acknowledged_at).toLocaleString()}
                    </Typography>
                  )}
                </Box>
              </Box>
            </SectionCard>
          ))}
        </Box>
      )}
    </>
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const theme = getTheme(darkMode ? 'dark' : 'light');

  const mainApp = (
    <>
      <Layout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogout={handleLogout}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(prev => {
          const next = !prev;
          localStorage.setItem('rajapi_dark', String(next));
          return next;
        })}
        notifPermission={notifPermission}
        onRequestNotif={requestNotificationPermission}
      >
        {renderContent()}
      </Layout>

      {/* Dialogs */}
      <CreateSiteDialog open={showModal} onClose={() => setShowModal(false)} onCreate={handleCreateSite} />
      <EditSiteDialog open={!!editSiteModal} site={editSiteModal} onClose={() => setEditSiteModal(null)} onSave={handleUpdateSite} />
      <BroadcastDialog open={showBcModal} editData={editingBc} sites={sites} onClose={() => { setShowBcModal(false); setEditingBc(null); }} onSave={async (payload: any) => {
        const url = editingBc ? `/api/v1/broadcasts/${editingBc.id}` : '/api/v1/broadcasts/';
        const method = editingBc ? 'PUT' : 'POST';
        await adminFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const res = await adminFetch('/api/v1/broadcasts/');
        if (res.ok) setBroadcasts(await res.json());
      }} />
      <LockDialog open={!!lockModal} site={lockModal} onClose={() => setLockModal(null)} onSave={handleLockSave} />

      {/* Delete Plant Confirmation Dialog */}
      <Dialog open={!!confirmDeleteSite} onClose={() => !deletingSite && setConfirmDeleteSite(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Plant?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Are you sure you want to permanently delete this plant and ALL of its telemetry data? This cannot be undone.
          </Typography>
          {confirmDeleteSite && (
            <Typography variant="body2" sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontWeight: 600 }}>
              {confirmDeleteSite.name} ({confirmDeleteSite.location || 'No location'})
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setConfirmDeleteSite(null)} disabled={deletingSite}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={deletingSite}
            onClick={async () => {
              if (!confirmDeleteSite) return;
              setDeletingSite(true);
              try {
                const res = await adminFetch(`/api/v1/sites/${confirmDeleteSite.id}`, { method: 'DELETE' });
                if (res.ok) {
                  setSites(prev => prev.filter(s => s.id !== confirmDeleteSite.id));
                  if (activeSite?.id === confirmDeleteSite.id) { setActiveSite(null); setLiveData([]); }
                  setConfirmDeleteSite(null);
                } else {
                  const body = await res.text();
                  alert(`Delete failed: ${body}`);
                }
              } catch {
                alert('Network error — could not delete plant');
              } finally {
                setDeletingSite(false);
              }
            }}
          >
            {deletingSite ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Renew AMC Confirmation Dialog */}
      <Dialog open={!!confirmRenewSite} onClose={() => !renewingSite && setConfirmRenewSite(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Renew AMC?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Are you sure you want to renew the AMC? This will permanently invalidate the current API key and disconnect the client until they enter the new key.
          </Typography>
          {confirmRenewSite && (
            <Typography variant="body2" sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontWeight: 600 }}>
              {confirmRenewSite.name}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setConfirmRenewSite(null)} disabled={renewingSite}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            disabled={renewingSite}
            onClick={async () => {
              if (!confirmRenewSite) return;
              setRenewingSite(true);
              try {
                const res = await adminFetch(`/api/v1/sites/${confirmRenewSite.id}/renew`, { method: 'POST' });
                if (res.ok) {
                  const updatedSite = await res.json();
                  setSites(prev => prev.map(s => s.id === confirmRenewSite.id ? updatedSite : s));
                  setConfirmRenewSite(null);
                  alert(`AMC renewed! New API Key generated. Copy it from the plant details.`);
                } else {
                  const body = await res.text();
                  alert(`Renewal failed: ${body}`);
                }
              } catch {
                alert('Network error — could not renew AMC');
              } finally {
                setRenewingSite(false);
              }
            }}
          >
            {renewingSite ? 'Renewing…' : 'Renew'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {isLoggedIn ? mainApp : loginPage}
    </ThemeProvider>
  );
}

export default App
