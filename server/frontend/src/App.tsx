import { useState, useEffect, useCallback, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

interface Site {
  id: number;
  name: string;
  api_key: string;
  location: string;
  is_active: boolean;
  amc_expiry?: string;
  last_sync?: string;
  lock_status?: string;
  lock_reason?: string;
  lock_updated_at?: string;
  last_error?: string;
  last_error_at?: string;
  client_version?: string;
  notes?: string;
}

interface TelemetryPoint {
  id?: number;
  value: number | null;
  quality: string;
  timestamp: string;
}

interface LatestPoint {
  tag_name: string;
  name: string;
  unit?: string;
  value?: number;
  quality: string;
  timestamp: string;
}

interface BroadcastItem {
  id: number;
  message: string;
  message_type: string;
  is_active: boolean;
  created_at: string;
  expires_at?: string;
  target_all: boolean;
  target_site_id?: number | null;
}

interface LockSummary {
  id: number;
  lock_status: string;
  lock_reason?: string;
  lock_updated_at?: string;
}

function getConnectionStatus(last_sync?: string): { label: string; pulse: boolean; color: string } {
  if (!last_sync) return { label: 'Never Connected', pulse: false, color: 'text-gray-500' };
  const utcStr = last_sync.endsWith('Z') ? last_sync : last_sync + 'Z';
  const diffMs = Date.now() - new Date(utcStr).getTime();
  const diffMins = diffMs / 60000;
  if (diffMins < 5) return { label: 'Client Live', pulse: true, color: 'text-emerald-600' };
  if (diffMins < 60) return { label: `${Math.floor(diffMins)}m ago`, pulse: false, color: 'text-yellow-400' };
  const diffHrs = diffMins / 60;
  if (diffHrs < 24) return { label: `${Math.floor(diffHrs)}h ago`, pulse: false, color: 'text-orange-400' };
  return { label: `${Math.floor(diffHrs/24)}d ago`, pulse: false, color: 'text-red-600' };
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(sessionStorage.getItem('rajapi_auth') === 'true')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sites, setSites] = useState<Site[]>([])
  const [locks, setLocks] = useState<LockSummary[]>([])

  // History Browser State
  const [historySiteId, setHistorySiteId] = useState<number | null>(null)
  const [historyParams, setHistoryParams] = useState<{id: number; tag_name: string; name: string}[]>([])
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
  const [newSiteName, setNewSiteName] = useState('')
  const [newSiteLocation, setNewSiteLocation] = useState('')
  const [newSiteAmcExpiry, setNewSiteAmcExpiry] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  
  // Broadcast Modal State
  const [showBcModal, setShowBcModal] = useState(false)
  const [bcMessage, setBcMessage] = useState('')
  const [bcType, setBcType] = useState('info')
  const [bcExpiry, setBcExpiry] = useState('')
  const [isCreatingBc, setIsCreatingBc] = useState(false)
  const [editingBc, setEditingBc] = useState<BroadcastItem | null>(null)
  const [bcTargetAll, setBcTargetAll] = useState(true)
  const [bcTargetSiteId, setBcTargetSiteId] = useState<number | null>(null)

  // Edit Site Modal State
  const [editSiteModal, setEditSiteModal] = useState<{id: number; name: string; location: string; notes: string} | null>(null)
  const [savingSite, setSavingSite] = useState(false)

  // Lock Modal State
  const [lockModal, setLockModal] = useState<{id: number; name: string; status: string; reason: string} | null>(null)

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
  const [siteDevices, setSiteDevices] = useState<{id:number;site_id:number;name:string;status:string;api_key?:string}[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [newDeviceName, setNewDeviceName] = useState('')
  const [editingDeviceId, setEditingDeviceId] = useState<number|null>(null)
  const [editingDeviceName, setEditingDeviceName] = useState('')

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

  const handleLogout = () => { sessionStorage.removeItem('rajapi_auth'); sessionStorage.removeItem('rajapi_admin_key'); setIsLoggedIn(false); }; const handleLogin = async (e: React.FormEvent) => {
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

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')
    setIsCreating(true)
    try {
      const payload: any = { name: newSiteName, location: newSiteLocation };
      if (newSiteAmcExpiry) {
        payload.amc_expiry = new Date(newSiteAmcExpiry).toISOString();
      }
      if (!sessionStorage.getItem('rajapi_admin_key')) {
        setCreateError('Session expired — please log out and log back in.');
        return;
      }
      const res = await adminFetch('/api/v1/sites/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        const newSite = await res.json()
        setSites([...sites, newSite])
        setShowModal(false)
        setNewSiteName('')
        setNewSiteLocation('')
        setNewSiteAmcExpiry('')
      } else {
        const body = await res.text();
        setCreateError(`Server error: ${body}`);
      }
    } catch (err) {
      setCreateError('Network error — could not reach server');
    } finally {
      setIsCreating(false)
    }
  }

  const handleToggleStatus = async (siteId: number, currentStatus: boolean) => {
    try {
      const res = await adminFetch(`/api/v1/sites/${siteId}/status?is_active=${!currentStatus}`, {
        method: 'PUT'
      });
      if (res.ok) {
        const updatedSite = await res.json();
        setSites(sites.map(s => s.id === siteId ? updatedSite : s));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRenewAmc = async (siteId: number) => {
    if (!window.confirm("Are you sure? This will permanently invalidate the current API key and disconnect the client until they enter the new key.")) {
      return;
    }
    try {
      const res = await adminFetch(`/api/v1/sites/${siteId}/renew`, {
        method: 'POST'
      });
      if (res.ok) {
        const updatedSite = await res.json();
        setSites(sites.map(s => s.id === siteId ? updatedSite : s));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSite = async (siteId: number, siteName: string) => {
    if (!window.confirm(`Permanently delete "${siteName}" and ALL its telemetry data? This cannot be undone.`)) return;
    try {
      const res = await adminFetch(`/api/v1/sites/${siteId}`, { method: 'DELETE' });
      if (res.ok) {
        setSites(sites.filter(s => s.id !== siteId));
        if (activeSite?.id === siteId) { setActiveSite(null); setLiveData([]); }
      } else {
        const body = await res.text();
        alert(`Delete failed: ${body}`);
      }
    } catch (err) { console.error(err); alert('Network error — could not delete site'); }
  };

  const handleUpdateSite = async (id: number, name: string, location: string, notes: string) => {
    setSavingSite(true);
    try {
      const res = await adminFetch(`/api/v1/sites/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, location, notes })
      });
      if (res.ok) {
        const updated = await res.json();
        setSites(sites.map(s => s.id === id ? updated : s));
        if (activeSite?.id === id) setActiveSite(updated);
        setEditSiteModal(null);
      } else {
        const d = await res.json();
        alert('Failed: ' + (d.detail || 'Unknown error'));
      }
    } catch (err) {
      alert('Network error');
    } finally {
      setSavingSite(false);
    }
  };

  const handleSaveExpiry = async (siteId: number) => {
    if (!editExpiryVal) return;
    setSavingExpiry(true);
    try {
      const res = await adminFetch(`/api/v1/sites/${siteId}/amc-expiry`, {
        method: 'PUT',
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

  const handlePruneAll = async () => {
    if (!window.confirm('Delete all telemetry data older than 7 days from ALL sites? This will speed up rajapi.com.')) return;
    try {
      const res = await adminFetch('/api/v1/sites/telemetry/prune-all?keep_days=7', { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        alert(`âœ… Pruned ${data.deleted_rows.toLocaleString()} old telemetry rows. rajapi.com should be faster now.`);
      }
    } catch (err) { console.error(err); }
  };


  useEffect(() => {
    if (!isLoggedIn) return;
    const load = () => {
      adminFetch('/api/v1/sites/')
        .then(res => res.ok ? res.json() : [])
        .then(data => Array.isArray(data) && setSites(data))
        .catch(err => console.error(err));
      adminFetch('/api/v1/broadcasts/')
        .then(res => res.ok ? res.json() : [])
        .then(data => Array.isArray(data) && setBroadcasts(data))
        .catch(err => console.error(err));
      adminFetch('/api/v1/sites/locks/summary')
        .then(res => res.ok ? res.json() : [])
        .then(data => Array.isArray(data) && setLocks(data))
        .catch(err => console.error(err));
      adminFetch('/api/v1/cpcb/status')
        .then(res => res.ok ? res.json() : [])
        .then(data => Array.isArray(data) && setCpcbStatus(data))
        .catch(err => console.error(err));
      adminFetch('/api/v1/cpcb/summary')
        .then(res => res.ok ? res.json() : [])
        .then(data => Array.isArray(data) && setCpcbSummary(data))
        .catch(err => console.error(err));
      adminFetch('/api/v1/quality/')
        .then(res => res.ok ? res.json() : [])
        .then(data => Array.isArray(data) && setQualitySummary(data))
        .catch(err => console.error(err));
      adminFetch('/api/v1/alarms/')
        .then(res => res.ok ? res.json() : [])
        .then(data => Array.isArray(data) && setAlarms(data))
        .catch(err => console.error(err));
      adminFetch('/api/v1/alarms/stats')
        .then(res => res.ok ? res.json() : null)
        .then(data => data && setAlarmStats(data))
        .catch(err => console.error(err));
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [isLoggedIn])

  // Load parameters for history when a site is selected
  useEffect(() => {
    if (!historySiteId) { setHistoryParams([]); return; }
    adminFetch(`/api/v1/sites/${historySiteId}/telemetry/latest`)
      .then(res => res.ok ? res.json() : [])
      .then((data: {id: number; tag_name: string; name: string}[]) => {
        if (Array.isArray(data)) setHistoryParams(data.map(p => ({id: p.id, tag_name: p.tag_name, name: p.name})));
      })
      .catch(err => console.error(err));
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
    if (historyChartInstance.current) {
      historyChartInstance.current.destroy();
      historyChartInstance.current = null;
    }
    const pts = historyData.slice().reverse();
    const labels = pts.map(p => new Date(p.timestamp).toLocaleString());
    const values = pts.map(p => p.value);
    const ctx = historyChartRef.current.getContext('2d');
    if (!ctx) return;
    historyChartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Value',
          data: values,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.1)',
          fill: true,
          tension: 0.1,
          spanGaps: false,
          pointRadius: 2,
          pointBackgroundColor: values.map(v => v == null ? 'transparent' : '#2563eb'),
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 10, font: { size: 10 } } },
          y: { beginAtZero: false }
        }
      }
    });
    return () => { if (historyChartInstance.current) { historyChartInstance.current.destroy(); historyChartInstance.current = null; } };
  }, [historyData])

  const fetchLiveData = useCallback(async (siteId: number) => {
    setLiveDataLoading(true);
    try {
      const res = await adminFetch(`/api/v1/sites/${siteId}/telemetry/latest`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setLiveData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLiveDataLoading(false);
    }
  }, []);

  // Auto-refresh live data every 10 seconds while a site panel is open
  useEffect(() => {
    if (!activeSite) return;
    fetchLiveData(activeSite.id);
    const interval = setInterval(() => fetchLiveData(activeSite.id), 10000);
    return () => clearInterval(interval);
  }, [activeSite, fetchLiveData]);

  // Load devices when site panel opens
  useEffect(() => {
    if (!activeSite) { setSiteDevices([]); return; }
    setLoadingDevices(true);
    adminFetch(`/api/v1/sites/${activeSite.id}/devices`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d)) setSiteDevices(d); setLoadingDevices(false); })
      .catch(() => setLoadingDevices(false));
  }, [activeSite]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center font-sans text-gray-800 p-4">
        <div className="w-full max-w-md bg-brand-card p-8 rounded-2xl border border-brand-border shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800">
              RajAPI Secure Login
            </h1>
            <p className="text-gray-600 mt-2">Central Telemetry Dashboard</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg p-3 text-gray-800 focus:outline-none focus:border-brand-btn focus:ring-1 focus:ring-brand-btn"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg p-3 text-gray-800 focus:outline-none focus:border-brand-btn focus:ring-1 focus:ring-brand-btn"
                required
              />
            </div>
            {loginError && <p className="text-red-600 text-sm">{loginError}</p>}
            <button 
              type="submit"
              className="w-full bg-brand-btn hover:bg-brand-btn-hover text-white font-semibold py-3 px-4 rounded-lg transition-colors shadow-lg shadow-brand-btn/30"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    )
  }

  const filteredSites = sites.filter(site => {
    if (selectedCategory === 'Online' && !site.is_active) return false;
    if (selectedCategory === 'Offline' && site.is_active) return false;
    if (selectedCategory === 'Sync Issues' && !site.last_error) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return site.name.toLowerCase().includes(q) || 
             (site.location && site.location.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-brand-bg font-sans text-gray-800 overflow-hidden flex flex-col relative">
      {/* Background decoration - simple gradient, no external requests */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-bg via-brand-card to-brand-border/40 z-0" />
      
      {/* Top Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-3 bg-brand-bg border-b border-brand-border">
        <div className="flex items-center gap-4">
          <img src="/assets/Ultron_logo.png" alt="UltrON Logo" className="h-8 drop-shadow-md" />
          <nav className="flex items-center gap-1 ml-4">
            {['dashboard', 'broadcasts', 'cpcb', 'quality', 'alarms', 'commands', 'history', 'locks'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  activeTab === tab ? 'bg-brand-btn text-white' : 'text-gray-600 hover:text-gray-800 hover:bg-brand-card'
                }`}
              >{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
            ))}
          </nav>
        </div>
        
        {/* Search Bar */}
        <div className="flex-1 max-w-2xl px-4">
          <div className="relative flex items-center w-full h-12 rounded-full bg-brand-card/80 hover:bg-brand-border/80 focus-within:bg-white focus-within:text-gray-900 transition-colors px-4 border border-brand-border/50 shadow-inner">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600 focus-within:text-slate-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Search sites..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none text-base placeholder-gray-400"
            />
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4 w-64 justify-end">
          <span className="text-xs font-bold text-brand-accent bg-brand-card/40 px-2 py-0.5 rounded-full border border-brand-border/50">v1.0.10</span>
          <a 
            href="/api/v1/downloads/latest-client" 
            title="Download Latest Client v1.0.10"
            className="p-2 rounded-full text-gray-600 hover:bg-brand-border/50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
          <button 
            onClick={handlePruneAll}
            title="Prune old telemetry (keep 7 days) — speeds up rajapi.com"
            className="p-2 rounded-full text-gray-600 hover:bg-red-800/30 hover:text-red-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button
            onClick={requestNotificationPermission}
            title={notifPermission === 'granted' ? 'Notifications enabled' : notifPermission === 'denied' ? 'Notifications blocked' : 'Enable notifications'}
            className="p-2 rounded-full transition-colors relative"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${notifPermission === 'granted' ? 'text-brand-accent' : notifPermission === 'denied' ? 'text-red-400' : 'text-gray-600 hover:text-gray-800'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {notifPermission === 'granted' && <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full" />}
          </button>
          <button 
            onClick={handleLogout}
            title="Logout"
            className="p-2 rounded-full text-gray-600 hover:bg-brand-border/50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
          <div className="h-8 w-8 rounded-full bg-brand-btn flex items-center justify-center text-white font-bold text-xs ml-2 shadow-md">
            Neeraj
          </div>
        </div>
      </header>

      {/* Main App Area */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
         {activeTab === 'dashboard' && (
        <>
        {/* Left Sidebar */}
        <aside className="w-64 flex flex-col py-4 px-3 gap-2">
          <button 
            onClick={() => { setShowModal(true); setCreateError(''); }}
            className="flex items-center gap-3 bg-brand-btn hover:bg-brand-btn-hover text-white px-5 py-4 rounded-2xl font-medium transition-colors shadow-lg shadow-brand-btn/30 mb-4 w-48 border border-brand-btn/50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Register Site
          </button>

          <nav className="flex flex-col gap-1">
            {['All Sites', 'Online', 'Offline', 'Sync Issues'].map(category => (
              <button 
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`flex items-center justify-between px-4 py-2 rounded-r-full transition-colors ${
                  selectedCategory === category 
                  ? 'bg-brand-card/40 text-brand-accent font-semibold border-l-4 border-brand-btn' 
                  : 'text-gray-600 hover:bg-brand-card/50 border-l-4 border-transparent'
                }`}
              >
                <span>{category}</span>
                {category === 'All Sites' && <span className="text-xs bg-brand-border/50 px-2 py-0.5 rounded-full">{sites.length}</span>}
                {category === 'Online' && <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">{sites.filter(s=>s.is_active).length}</span>}
                {category === 'Offline' && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{sites.filter(s=>!s.is_active).length}</span>}
                {category === 'Sync Issues' && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{sites.filter(s=>s.last_error).length}</span>}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content Area (Glassmorphism List) */}
        <main className="flex-1 bg-brand-card/60 border border-brand-border rounded-tl-xl shadow-lg overflow-hidden flex flex-col mr-2 mt-2 mb-2">
          
          {/* List Header */}
          <div className="flex items-center px-6 py-3 border-b border-brand-border/40 bg-brand-border/30">
            <div className="flex items-center gap-2 text-brand-accent border-b-2 border-brand-btn pb-2 px-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="font-medium text-sm">{selectedCategory} Dashboard</span>
            </div>
            <div className="ml-auto text-xs text-gray-600">
              {filteredSites.length > 0 ? `1-${filteredSites.length} of ${filteredSites.length}` : '0'}
            </div>
          </div>

          {/* Column Headers */}
          <div className="flex items-center px-4 py-1.5 border-b border-brand-border/30 bg-brand-border/20 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            <div className="w-16 flex-shrink-0"></div>
            <div className="flex-1 grid grid-cols-12 items-center gap-4">
              <div className="col-span-4">Site</div>
              <div className="col-span-5">Location / Status</div>
              <div className="col-span-3 text-right pr-4">Expiry</div>
            </div>
          </div>

          {/* List Items */}
          <div className="flex-1 overflow-y-auto">
            {filteredSites.length === 0 ? (
              <div className="p-12 text-center text-gray-600">
                <p>No sites found matching your criteria.</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {filteredSites.map(site => (
                  <div key={site.id} onClick={() => setActiveSite(site)} className={`group flex items-center px-4 py-2 border-b border-brand-border/50 hover:bg-brand-border/40 transition-colors cursor-pointer text-sm ${activeSite?.id === site.id ? 'bg-brand-card/20 border-l-2 border-l-teal-500' : ''}`}>
                    {/* Left Actions */}
                    <div className="flex items-center gap-3 w-16 text-gray-500">
                      <input type="checkbox" className="rounded border-brand-border bg-brand-card text-brand-btn-hover focus:ring-brand-btn/50 cursor-pointer" />
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 hover:text-yellow-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </div>

                    {/* Site Details */}
                    <div className="flex-1 grid grid-cols-12 items-center gap-4">
                      <div className="col-span-4 font-bold text-gray-800 truncate">{site.name}</div>
                       
                      <div className="col-span-5 flex flex-col gap-0.5">
                        <span className="text-gray-600 truncate flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${site.is_active ? 'bg-emerald-600' : 'bg-red-500'}`}></span>
                          {site.location || 'Unknown Location'}
                        </span>
                        {(() => {
                          const conn = getConnectionStatus(site.last_sync);
                          return (
                            <span className={`flex items-center gap-1 text-xs font-medium ${conn.color} pl-4`}>
                              {conn.pulse && <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                              </span>}
                              {!conn.pulse && <span className="w-2 h-2 rounded-full bg-current opacity-60"></span>}
                              {conn.label}
                            </span>
                          );
                        })()}
                        {site.last_error && (
                          <span className="flex items-center gap-1 text-xs text-red-600 pl-4" title={site.last_error_at ? `Since ${new Date(site.last_error_at).toLocaleString()}` : ''}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            {site.last_error}
                          </span>
                        )}
                        <div className="flex items-center gap-2 pl-4 mt-0.5">
                          {site.client_version && (
                            <span className="text-[10px] font-mono bg-gray-200/70 text-gray-600 px-1.5 py-0.5 rounded">
                              v{site.client_version}
                            </span>
                          )}
                          {site.notes && (
                            <span className="text-[10px] text-gray-400 flex items-center gap-1" title={site.notes}>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                              </svg>
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Expiry Date */}
                      <div className="col-span-3 text-right font-medium text-gray-600 pr-4">
                        {site.amc_expiry ? new Date(site.amc_expiry).toLocaleDateString(undefined, {month:'short', day:'numeric'}) : '-'}
                      </div>
                    </div>

                    {/* Quick Actions (Hover) */}
                    {editingExpiry === site.id ? (
                      <div className="w-32 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <input type="date" value={editExpiryVal} onChange={e => setEditExpiryVal(e.target.value)}
                          className="bg-brand-bg border border-brand-border rounded text-xs text-gray-800 px-1 py-0.5 w-28"
                        />
                        <button onClick={() => handleSaveExpiry(site.id)} disabled={savingExpiry}
                          className="px-1.5 py-0.5 bg-brand-btn hover:bg-brand-btn-hover text-white rounded text-xs font-bold"
                        >{savingExpiry ? '...' : '✓'}</button>
                        <button onClick={() => setEditingExpiry(null)} className="text-gray-600 hover:text-gray-800 text-xs px-1">✕</button>
                      </div>
                    ) : (
                      <div className="w-32 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingExpiry(site.id); setEditExpiryVal(site.amc_expiry ? site.amc_expiry.split('T')[0] : ''); }}
                          className="p-2 rounded-full hover:bg-brand-border/50 text-gray-600 hover:text-yellow-400 transition-colors"
                          title="Edit AMC Expiry"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleToggleStatus(site.id, site.is_active); }}
                          className="p-2 rounded-full hover:bg-brand-border/50 text-gray-600 hover:text-gray-800 transition-colors"
                          title={site.is_active ? "Suspend" : "Activate"}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleRenewAmc(site.id); }}
                          className="p-2 rounded-full hover:bg-brand-border/50 text-gray-600 hover:text-blue-400 transition-colors"
                          title="Renew AMC (generates new key)"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditSiteModal({ id: site.id, name: site.name, location: site.location || '', notes: site.notes || '' }); }}
                          className="p-2 rounded-full hover:bg-brand-border/50 text-gray-600 hover:text-brand-btn transition-colors"
                          title="Edit Name/Location"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSite(site.id, site.name); }}
                      className="ml-2 p-2 rounded-full hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors"
                      title="Delete Site"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Live Data Side Panel */}
        {activeSite && (
          <aside className="w-96 flex flex-col bg-brand-card border-l border-brand-border shadow-xl overflow-hidden mt-2 mb-2 mr-2 rounded-xl">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border/40 bg-brand-border/40">
              <div>
                <h2 className="font-bold text-gray-800 text-base truncate">{activeSite.name}</h2>
                <p className="text-xs text-gray-600">{activeSite.location || 'Unknown Location'}</p>
                {(() => {
                  const c = getConnectionStatus(activeSite.last_sync);
                  return <span className={`text-xs font-medium ${c.color}`}>{c.label}</span>;
                })()}
              </div>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <button disabled={getConnectionStatus(activeSite.last_sync).label !== 'Client Live'}
                  onClick={async () => {
                    if (!confirm(`Send "Restart Polling" to ${activeSite.name}?`)) return;
                    const res = await adminFetch(`/api/v1/commands/sites/${activeSite.id}/command`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'restart_polling' })
                    });
                    const d = await res.json();
                    alert(res.ok ? `âœ… Restart Polling sent` : `âŒ ${d.detail || 'Failed'}`);
                  }}
                  className="p-1.5 rounded-full hover:bg-brand-border/60 text-gray-600 hover:text-brand-accent transition-colors disabled:opacity-30"
                  title="Restart Polling"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button disabled={getConnectionStatus(activeSite.last_sync).label !== 'Client Live'}
                  onClick={async () => {
                    if (!confirm(`âš ï¸ Reboot PC "${activeSite.name}"? It will restart immediately.`)) return;
                    const res = await adminFetch(`/api/v1/commands/sites/${activeSite.id}/command`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'reboot_system' })
                    });
                    const d = await res.json();
                    alert(res.ok ? `âœ… Reboot sent` : `âŒ ${d.detail || 'Failed'}`);
                  }}
                  className="p-1.5 rounded-full hover:bg-brand-border/60 text-gray-600 hover:text-orange-400 transition-colors disabled:opacity-30"
                  title="Reboot PC"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
                <button
                  onClick={() => { setActiveSite(null); setLiveData([]); }}
                  className="p-1.5 rounded-full hover:bg-brand-border/60 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Auto-refresh indicator */}
            <div className="flex items-center gap-2 px-5 py-2 bg-brand-card/20 border-b border-brand-border/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-btn opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-btn"></span>
              </span>
              <span className="text-xs text-brand-accent font-medium">Live — refreshing every 10s</span>
              {liveDataLoading && <span className="ml-auto text-xs text-gray-500 animate-pulse">Fetching...</span>}
            </div>

            {/* Data Table */}
            <div className="flex-1 overflow-y-auto">
              {liveData.length === 0 && !liveDataLoading ? (
                <div className="p-8 text-center text-gray-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-sm">No telemetry data yet.</p>
                  <p className="text-xs mt-1">UltrON client will sync data here.</p>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-brand-card">
                    <tr className="text-gray-500 border-b border-brand-border/40">
                      <th className="px-4 py-2 text-left font-medium">Tag</th>
                      <th className="px-3 py-2 text-right font-medium">Value</th>
                      <th className="px-3 py-2 text-center font-medium">Quality</th>
                      <th className="px-3 py-2 text-right font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveData.map((pt) => {
                      const isGood = pt.quality?.toLowerCase() === 'good';
                      const ago = pt.timestamp ? (() => {
                        const utcTs = pt.timestamp.endsWith('Z') ? pt.timestamp : pt.timestamp + 'Z';
                        const diff = Math.floor((Date.now() - new Date(utcTs).getTime()) / 1000);
                        if (diff < 60) return `${diff}s`;
                        if (diff < 3600) return `${Math.floor(diff/60)}m`;
                        return `${Math.floor(diff/3600)}h`;
                      })() : '-';
                      return (
                        <tr key={pt.tag_name} className="border-b border-white/5 hover:bg-brand-card/30 transition-colors">
                          <td className="px-4 py-2">
                            <div className="font-mono text-brand-accent font-medium">{pt.tag_name}</div>
                            {pt.name !== pt.tag_name && <div className="text-gray-500 truncate max-w-[130px]">{pt.name}</div>}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-gray-800">
                            {pt.value !== null && pt.value !== undefined ? pt.value.toFixed(2) : '—'}
                            {pt.unit && <span className="ml-1 text-gray-600 font-normal">{pt.unit}</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              isGood ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                            }`}>
                              {pt.quality}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">{ago} ago</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Devices Section */}
            <div className="border-t border-brand-border/30 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Devices / Stations</h3>
                {loadingDevices && <span className="text-xs text-gray-500">Loading...</span>}
              </div>
              {siteDevices.length === 0 && !loadingDevices && (
                <p className="text-xs text-gray-500 mb-2">No devices yet. They appear when the client syncs.</p>
              )}
              <div className="flex flex-col gap-1.5">
                {siteDevices.map(d => (
                  <div key={d.id} className="flex items-center justify-between bg-brand-bg rounded-lg px-3 py-2">
                    {editingDeviceId === d.id ? (
                      <input type="text" value={editingDeviceName}
                        onChange={e => setEditingDeviceName(e.target.value)}
                        className="flex-1 bg-white border border-brand-border rounded text-xs px-2 py-1"
                        autoFocus
                        onKeyDown={async e => {
                          if (e.key === 'Escape') setEditingDeviceId(null);
                          if (e.key === 'Enter' && editingDeviceName.trim()) {
                            await adminFetch(`/api/v1/sites/${activeSite.id}/devices/${d.id}`, {
                              method: 'PATCH',
                              headers: {'Content-Type':'application/json'},
                              body: JSON.stringify({name: editingDeviceName.trim(), status: d.status})
                            });
                            setSiteDevices(siteDevices.map(x => x.id === d.id ? {...x, name: editingDeviceName.trim()} : x));
                            setEditingDeviceId(null);
                          }
                        }}
                      />
                    ) : (
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-800">{d.name}</span>
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                          d.status === 'online' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'
                        }`}>{d.status}</span>
                        {d.api_key && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[10px] font-mono text-gray-400 truncate max-w-[120px]">{d.api_key}</span>
                            <button onClick={() => { navigator.clipboard.writeText(d.api_key!); alert('Device key copied!'); }}
                              className="text-gray-400 hover:text-brand-accent transition-colors" title="Copy device API key">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-1 ml-2">
                      <button onClick={async () => {
                        if (!confirm(`Regenerate API key for "${d.name}"? Old key will stop working.`)) return;
                        const res = await adminFetch(`/api/v1/sites/${activeSite.id}/devices/${d.id}/renew-key`, {method: 'POST'});
                        if (res.ok) { const updated = await res.json(); setSiteDevices(siteDevices.map(x => x.id === d.id ? updated : x)); }
                      }} className="p-1 rounded hover:bg-amber-100 text-gray-500 hover:text-amber-600 transition-colors" title="Regenerate API key">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </button>
                      <button onClick={() => { setEditingDeviceId(d.id); setEditingDeviceName(d.name); }}
                        className="p-1 rounded hover:bg-brand-border/50 text-gray-500 hover:text-brand-btn transition-colors"
                        title="Rename"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={async () => {
                        if (!confirm(`Delete device "${d.name}"?`)) return;
                        const res = await adminFetch(`/api/v1/sites/${activeSite.id}/devices/${d.id}`, {method: 'DELETE'});
                        if (res.ok) setSiteDevices(siteDevices.filter(x => x.id !== d.id));
                      }} className="p-1 rounded hover:bg-red-100 text-gray-500 hover:text-red-600 transition-colors" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input type="text" value={newDeviceName}
                  onChange={e => setNewDeviceName(e.target.value)}
                  placeholder="Add device..."
                  className="flex-1 bg-brand-bg border border-brand-border rounded text-xs px-2 py-1.5 text-gray-800 placeholder-gray-400"
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && newDeviceName.trim()) {
                      const res = await adminFetch(`/api/v1/sites/${activeSite.id}/devices`, {
                        method: 'POST',
                        headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({name: newDeviceName.trim()})
                      });
                      if (res.ok) {
                        const created = await res.json();
                        setSiteDevices([...siteDevices, created]);
                        setNewDeviceName('');
                      }
                    }
                  }}
                />
                <button onClick={async () => {
                  if (!newDeviceName.trim()) return;
                  const res = await adminFetch(`/api/v1/sites/${activeSite.id}/devices`, {
                    method: 'POST',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({name: newDeviceName.trim()})
                  });
                  if (res.ok) {
                    const created = await res.json();
                    setSiteDevices([...siteDevices, created]);
                    setNewDeviceName('');
                  }
                }} className="bg-brand-btn hover:bg-brand-btn-hover text-white rounded-lg px-3 py-1.5 text-xs font-bold transition-colors">+</button>
              </div>
            </div>
          </aside>
        )}
      </>)}

        {activeTab === 'broadcasts' && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">Broadcast Messages</h2>
              <button onClick={() => { setEditingBc(null); setBcMessage(''); setBcType('info'); setBcExpiry(''); setBcTargetAll(true); setBcTargetSiteId(null); setShowBcModal(true); }}
                className="bg-brand-btn hover:bg-brand-btn-hover text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
              >+ New Broadcast</button>
            </div>
            {broadcasts.length === 0 ? (
              <div className="text-center text-gray-500 py-20">
                <p className="text-lg text-gray-700">No broadcasts yet.</p>
                <p className="text-sm mt-1">Create one to send messages to all UltrON clients.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {broadcasts.map(bc => (
                  <div key={bc.id} className={`bg-brand-card border rounded-xl p-4 transition-colors ${
                    bc.message_type === 'critical' ? 'border-red-700/50' :
                    bc.message_type === 'warning' ? 'border-yellow-700/50' :
                    'border-brand-border'
                  }`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            bc.message_type === 'critical' ? 'bg-red-100 text-red-600' :
                            bc.message_type === 'warning' ? 'bg-yellow-100 text-yellow-600' :
                            'bg-brand-card/50 text-brand-accent'
                          }`}>{bc.message_type.toUpperCase()}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${bc.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-brand-border text-gray-600'}`}>
                            {bc.is_active ? 'Active' : 'Inactive'}
                          </span>
                          {bc.expires_at && <span className="text-xs text-gray-500">Expires: {new Date(bc.expires_at).toLocaleDateString()}</span>}
                        </div>
                        <p className="text-gray-800 text-sm">{bc.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-brand-border/40 text-brand-accent font-mono text-[10px]">
                            {bc.target_all ? 'All Sites' : `Site #${bc.target_site_id}`}
                          </span>
                          <p className="text-xs text-gray-500">Created: {new Date(bc.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={async () => {
                          await adminFetch(`/api/v1/broadcasts/${bc.id}/toggle`, {method: 'PUT'});
                          const res = await fetch('/api/v1/broadcasts/');
                          setBroadcasts(await res.json());
                        }} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          bc.is_active ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        }`}>{bc.is_active ? 'Deactivate' : 'Activate'}</button>
                        <button onClick={async () => {
                          setEditingBc(bc);
                          setBcMessage(bc.message);
                          setBcType(bc.message_type);
                          setBcExpiry(bc.expires_at ? bc.expires_at.slice(0, 16) : '');
                          setBcTargetAll(bc.target_all);
                          setBcTargetSiteId(bc.target_site_id ?? null);
                          setShowBcModal(true);
                        }} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-btn-hover hover:bg-brand-btn text-white transition-colors mr-1">Edit</button>
                        <button onClick={async () => {
                          if (!confirm('Delete this broadcast?')) return;
                          await adminFetch(`/api/v1/broadcasts/${bc.id}`, {method: 'DELETE'});
                          setBroadcasts(broadcasts.filter(b => b.id !== bc.id));
                        }} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-800/50 transition-colors">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'commands' && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">Remote Commands</h2>
              <span className="text-xs text-gray-500 bg-brand-card/40 px-2 py-1 rounded-full border border-brand-border">Commands queued via HTTP — client polls every 60s</span>
            </div>
            {sites.length === 0 ? (
              <div className="text-center text-gray-500 py-20">
                <p className="text-lg">No sites registered.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {sites.map(site => {
                  const conn = getConnectionStatus(site.last_sync);
                  const isOnline = conn.label === 'Client Live';
                  return (
                    <div key={site.id} className="bg-brand-card border border-brand-border rounded-xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-emerald-600' : 'bg-slate-500'}`}></span>
                            <span className="text-gray-800 font-bold">{site.name}</span>
                            <span className={`text-xs font-medium ${conn.color}`}>{conn.label}</span>
                          </div>
                          {site.location && <span className="text-xs text-gray-500 ml-4">{site.location}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button disabled={!isOnline}
                          onClick={async () => {
                            if (!confirm(`Send "Restart Polling" to ${site.name}?`)) return;
                            try {
                              const res = await adminFetch(`/api/v1/commands/sites/${site.id}/command`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'restart_polling' })
                              });
                              if (res.ok) alert(`âœ… Restart Polling command sent to ${site.name}`);
                              else { const d = await res.json(); alert(`âŒ ${d.detail || 'Failed'}`); }
                            } catch (e) { alert('âŒ Network error'); }
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-btn-hover hover:bg-brand-btn text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >Restart Polling</button>
                        <button disabled={!isOnline}
                          onClick={async () => {
                            if (!confirm(`âš ï¸ Send "Reboot System" to ${site.name}? The PC will restart immediately.`)) return;
                            try {
                              const res = await adminFetch(`/api/v1/commands/sites/${site.id}/command`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'reboot_system' })
                              });
                              if (res.ok) alert(`âœ… Reboot command sent to ${site.name}`);
                              else { const d = await res.json(); alert(`âŒ ${d.detail || 'Failed'}`); }
                            } catch (e) { alert('âŒ Network error'); }
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-700 hover:bg-orange-600 text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >Reboot PC</button>
                        <button disabled={!isOnline}
                          onClick={async () => {
                            if (!confirm(`â˜ ï¸ Send "Factory Reset" to ${site.name}? ALL data on that PC will be erased!`)) return;
                            if (!confirm(`ARE YOU SURE? This will DESTROY all local data on ${site.name}.`)) return;
                            try {
                              const res = await adminFetch(`/api/v1/commands/sites/${site.id}/command`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'factory_reset' })
                              });
                              if (res.ok) alert(`âœ… Factory Reset command sent to ${site.name}`);
                              else { const d = await res.json(); alert(`âŒ ${d.detail || 'Failed'}`); }
                            } catch (e) { alert('âŒ Network error'); }
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-800 hover:bg-red-700 text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >Factory Reset</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-1">Telemetry History</h2>
            <p className="text-sm text-gray-600 mb-4">Browse historical telemetry data for any site and parameter.</p>

            <div className="bg-brand-card border border-brand-border rounded-xl p-4 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Site</label>
                  <select value={historySiteId || ''} onChange={e => { setHistorySiteId(e.target.value ? Number(e.target.value) : null); setHistoryParamId(null); setHistoryData(null); }}
                    className="w-full border border-brand-light/30 rounded-lg p-2 text-sm bg-white">
                    <option value="">Select a site...</option>
                    {sites.filter(s => s.is_active).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Parameter</label>
                  <select value={historyParamId || ''} onChange={e => setHistoryParamId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border border-brand-light/30 rounded-lg p-2 text-sm bg-white" disabled={!historySiteId}>
                    <option value="">Select parameter...</option>
                    {historyParams.map(p => (
                      <option key={p.id} value={p.id}>{p.tag_name} — {p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                  <input type="datetime-local" value={historyFrom} onChange={e => setHistoryFrom(e.target.value)}
                    className="w-full border border-brand-light/30 rounded-lg p-2 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                  <input type="datetime-local" value={historyTo} onChange={e => setHistoryTo(e.target.value)}
                    className="w-full border border-brand-light/30 rounded-lg p-2 text-sm bg-white" />
                </div>
              </div>
              <button onClick={fetchHistory} disabled={!historySiteId || !historyParamId}
                className="mt-4 bg-brand-btn text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-brand-btn-hover disabled:opacity-40 transition-colors">
                {historyLoading ? 'Loading...' : 'Load History'}
              </button>
            </div>

            {historyData && (
              <>
              <div className="bg-brand-card border border-brand-border rounded-xl p-4 mb-6" style={{height:'280px'}}>
                <canvas ref={historyChartRef} />
              </div>
              <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-brand-border/50 sticky top-0">
                      <tr>
                        <th className="text-left p-3 text-gray-600 font-semibold">Timestamp</th>
                        <th className="text-right p-3 text-gray-600 font-semibold">Value</th>
                        <th className="text-center p-3 text-gray-600 font-semibold">Quality</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.length === 0 ? (
                        <tr><td colSpan={3} className="text-center text-gray-400 p-8">No data in this range.</td></tr>
                      ) : historyData.map((p, i) => (
                        <tr key={p.id ?? i} className="border-t border-brand-border/30 hover:bg-brand-border/20">
                          <td className="p-3 text-gray-700 font-mono text-xs">{new Date(p.timestamp).toLocaleString()}</td>
                          <td className="p-3 text-right text-gray-800 font-mono">{p.value != null ? Number(p.value).toFixed(2) : '—'}</td>
                          <td className="p-3 text-center">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${p.quality === 'good' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {p.quality}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {historyData.length > 0 && (
                  <div className="p-3 border-t border-brand-border/30 text-center">
                    <button onClick={fetchHistoryMore} disabled={historyLoading}
                      className="text-sm text-brand-btn hover:underline disabled:opacity-40">
                      {historyLoading ? 'Loading...' : 'Load older data...'}
                    </button>
                  </div>
                )}
              </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'locks' && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Lock Control</h2>
            <p className="text-sm text-gray-600 mb-6">Locked sites stop sending SPCB/CPCB data. Use for AMC non-renewal or violations.</p>
            {locks.length === 0 ? (
              <div className="text-center text-gray-500 py-20">
                <p className="text-lg">No lock data available.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {locks.map(lock => {
                  const site = sites.find(s => s.id === lock.id);
                  const isLocked = lock.lock_status && lock.lock_status !== 'unlocked';
                  return (
                    <div key={lock.id} className="bg-brand-card border border-brand-border rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-800 font-bold">{site?.name || `Site #${lock.id}`}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            isLocked ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                          }`}>{isLocked ? lock.lock_status : 'Unlocked'}</span>
                        </div>
                        {isLocked && lock.lock_reason && <p className="text-xs text-gray-600 mt-1">Reason: {lock.lock_reason}</p>}
                        {lock.lock_updated_at && <p className="text-xs text-gray-500 mt-0.5">Updated: {new Date(lock.lock_updated_at).toLocaleString()}</p>}
                      </div>
                      <button onClick={() => setLockModal({
                        id: lock.id,
                        name: site?.name || `Site #${lock.id}`,
                        status: isLocked ? 'unlocked' : 'manual_lock',
                        reason: ''
                      })} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                        isLocked ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-red-600 text-white hover:bg-red-500'
                      }`}>{isLocked ? 'Unlock' : 'Lock'}</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'cpcb' && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-1">CPCB Dashboard</h2>
            <p className="text-sm text-gray-600 mb-4">CPCB compliance sync status and daily record counts.</p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              {cpcbStatus.map(site => (
                <div key={site.site_id} className="bg-brand-card border border-brand-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-gray-800 text-sm">{site.site_name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      site.last_error ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>{site.last_error ? 'Error' : 'OK'}</span>
                  </div>
                  <div className="text-2xl font-bold text-brand-accent mb-1">{site.total_records_synced_today.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">records synced today</div>
                  {site.last_tgpcb_sync && (
                    <div className="text-xs text-gray-500 mt-2">
                      Last sync: {new Date(site.last_tgpcb_sync).toLocaleString()}
                    </div>
                  )}
                  {site.last_error && (
                    <div className="text-xs text-red-600 mt-2 bg-red-50 rounded p-2" title={site.last_error}>
                      ⚠ {site.last_error}
                    </div>
                  )}
                </div>
              ))}
              {cpcbStatus.length === 0 && (
                <div className="col-span-full text-center text-gray-500 py-12">
                  <p>No CPCB data available.</p>
                </div>
              )}
            </div>

            <h3 className="font-bold text-gray-800 mb-3">30-Day Daily Record Counts</h3>
            <div className="flex flex-col gap-3">
              {cpcbSummary.map(site => (
                <div key={site.site_id} className="bg-brand-card border border-brand-border rounded-xl p-4">
                  <h4 className="font-bold text-gray-800 text-sm mb-3">{site.site_name}</h4>
                  {site.daily_counts.length === 0 ? (
                    <p className="text-xs text-gray-500">No data in last 30 days.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {site.daily_counts.map((d: any, i: number) => (
                        <div key={i} className="flex flex-col items-center bg-brand-bg rounded-lg px-2 py-1 min-w-[48px]">
                          <span className="text-xs font-mono font-bold text-brand-accent">{d.record_count}</span>
                          <span className="text-[8px] text-gray-500">{new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'quality' && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-1">Data Quality Dashboard</h2>
            <p className="text-sm text-gray-600 mb-4">U/O/E/N quality breakdown per site (CPCB standard). <span className="text-xs text-gray-500 ml-1">U=Valid, O=Invalid, E=Error, N=None</span></p>

            {selectedQualitySite ? (
              <>
                <button onClick={() => { setSelectedQualitySite(null); setQualityDetail(null); }}
                  className="text-sm text-brand-btn hover:underline mb-4 inline-flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to site summary
                </button>
                {qualityDetail === null ? (
                  <p className="text-gray-500">Loading...</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {qualityDetail.map(p => (
                      <div key={p.parameter_id} className="bg-brand-card border border-brand-border rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="font-bold text-gray-800 text-sm">{p.parameter_name}</span>
                            <span className="text-xs text-gray-500 ml-2 font-mono">{p.tag_name}</span>
                            {p.unit && <span className="text-xs text-gray-500 ml-1">({p.unit})</span>}
                          </div>
                          <span className="text-xs text-gray-500">{p.total_points} points</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            {key:'U', label:'Valid', color:'bg-emerald-100 text-emerald-700'},
                            {key:'O', label:'Invalid', color:'bg-red-100 text-red-700'},
                            {key:'E', label:'Error', color:'bg-orange-100 text-orange-700'},
                            {key:'N', label:'None', color:'bg-gray-100 text-gray-600'},
                          ].map(({key, label, color}) => (
                            <div key={key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${color}`}>
                              <span className="font-bold">{p.quality[key].count}</span>
                              <span>{label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-2">
                {qualitySummary.map(site => (
                  <div key={site.site_id} onClick={() => {
                    setSelectedQualitySite(site.site_id);
                    adminFetch(`/api/v1/quality/${site.site_id}`)
                      .then(r => r.ok ? r.json() : [])
                      .then(d => Array.isArray(d) && setQualityDetail(d))
                      .catch(() => {});
                  }} className="bg-brand-card border border-brand-border rounded-xl p-4 hover:bg-brand-border/30 cursor-pointer transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-gray-800 text-sm">{site.site_name}</h3>
                      <span className="text-xs text-gray-500">{site.total_points} total points</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        {key:'U', label:'Valid', color:'bg-emerald-100 text-emerald-700'},
                        {key:'O', label:'Invalid', color:'bg-red-100 text-red-700'},
                        {key:'E', label:'Error', color:'bg-orange-100 text-orange-700'},
                        {key:'N', label:'None', color:'bg-gray-100 text-gray-600'},
                      ].map(({key, label, color}) => {
                        const q = site.quality[key];
                        return (
                          <div key={key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${color}`}>
                            <span className="font-bold">{q.count}</span>
                            <span>{q.percentage}%</span>
                            <span className="opacity-70">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {qualitySummary.length === 0 && (
                  <div className="text-center text-gray-500 py-12">
                    <p>No quality data available.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'alarms' && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Alarms</h2>
                <p className="text-sm text-gray-600">Active and recent alarms across all sites.</p>
              </div>
              {alarmStats && (
                <div className="flex items-center gap-4">
                  <div className="bg-red-100 text-red-600 px-4 py-2 rounded-xl text-center">
                    <div className="text-2xl font-bold">{alarmStats.total_active}</div>
                    <div className="text-xs font-medium">Active</div>
                  </div>
                  <div className="bg-brand-border/40 text-gray-600 px-4 py-2 rounded-xl text-center">
                    <div className="text-2xl font-bold">{alarmStats.total_today}</div>
                    <div className="text-xs font-medium">Today</div>
                  </div>
                </div>
              )}
            </div>

            {alarms.length === 0 ? (
              <div className="text-center text-gray-500 py-20">
                <p className="text-lg">No alarms yet.</p>
                <p className="text-sm mt-1">Alarms appear when quality issues are detected.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {alarms.map(a => (
                  <div key={a.id} className={`bg-brand-card border rounded-xl p-4 transition-colors ${
                    a.status === 'active' ? 'border-red-700/50' : 'border-brand-border opacity-60'
                  }`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            a.quality === 'E' ? 'bg-red-100 text-red-600' :
                            a.quality === 'O' ? 'bg-orange-100 text-orange-600' :
                            'bg-yellow-100 text-yellow-600'
                          }`}>Q{a.quality}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            a.status === 'active' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                          }`}>{a.status}</span>
                          {a.site_name && <span className="text-xs text-gray-500 font-medium">{a.site_name}</span>}
                        </div>
                        <p className="text-sm text-gray-800">{a.message}</p>
                        <div className="flex items-center gap-3 mt-1">
                          {a.parameter_id && <span className="text-[10px] font-mono text-gray-500">Param #{a.parameter_id}</span>}
                          {a.value != null && <span className="text-[10px] font-mono text-gray-500">Value: {a.value}</span>}
                          <span className="text-[10px] text-gray-500">{new Date(a.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {a.status === 'active' && (
                          <button disabled={alarmAcking === a.id}
                            onClick={async () => {
                              setAlarmAcking(a.id);
                              try {
                                const res = await adminFetch(`/api/v1/alarms/${a.id}/ack`, {method: 'POST'});
                                if (res.ok) {
                                  setAlarms(alarms.map(x => x.id === a.id ? {...x, status: 'acknowledged', acknowledged_at: new Date().toISOString()} : x));
                                  const sRes = await adminFetch('/api/v1/alarms/stats');
                                  if (sRes.ok) setAlarmStats(await sRes.json());
                                }
                              } finally { setAlarmAcking(null); }
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors"
                          >{alarmAcking === a.id ? '...' : 'Acknowledge'}</button>
                        )}
                        {a.acknowledged_at && (
                          <span className="text-[10px] text-gray-500">Acked: {new Date(a.acknowledged_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Industry Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-brand-card p-8 rounded-2xl border border-brand-border shadow-2xl relative">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-600 hover:text-gray-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Register New Industry</h2>
            <form onSubmit={handleCreateSite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Industry Name</label>
                <input 
                  type="text" 
                  value={newSiteName}
                  onChange={e => setNewSiteName(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg p-3 text-gray-800 focus:outline-none focus:border-brand-btn"
                  required
                  placeholder="e.g. Acme Corp Factory 1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Location</label>
                <input 
                  type="text" 
                  value={newSiteLocation}
                  onChange={e => setNewSiteLocation(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg p-3 text-gray-800 focus:outline-none focus:border-brand-btn"
                  required
                  placeholder="e.g. Hyderabad, India"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">AMC Expiry Date (Optional)</label>
                <input 
                  type="date" 
                  value={newSiteAmcExpiry}
                  onChange={e => setNewSiteAmcExpiry(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg p-3 text-gray-800 focus:outline-none focus:border-brand-btn"
                />
                <p className="text-xs text-gray-500 mt-1">If left blank, it will default to 1 year from today.</p>
              </div>
              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  {createError}
                </div>
              )}
              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => { setShowModal(false); setCreateError(''); }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isCreating}
                  className="bg-brand-btn hover:bg-brand-btn-hover text-white font-semibold py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isCreating ? 'Creating...' : 'Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
    )}

    {/* Broadcast Create/Edit Modal */}
    {showBcModal && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-lg bg-brand-card p-8 rounded-2xl border border-brand-border shadow-2xl relative">
          <button onClick={() => setShowBcModal(false)} className="absolute top-4 right-4 text-gray-600 hover:text-gray-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold text-gray-800 mb-6">{editingBc ? 'Edit Broadcast' : 'New Broadcast'}</h2>
          <form onSubmit={async (e) => {
            e.preventDefault();
            setIsCreatingBc(true);
            try {
              const payload: any = { message: bcMessage, message_type: bcType, target_all: bcTargetAll };
              if (!bcTargetAll) payload.target_site_id = bcTargetSiteId;
              if (bcExpiry) payload.expires_at = new Date(bcExpiry).toISOString();
              const url = editingBc ? `/api/v1/broadcasts/${editingBc.id}` : '/api/v1/broadcasts/';
              const method = editingBc ? 'PUT' : 'POST';
              await adminFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
              setShowBcModal(false);
              setBcMessage('');
              setBcType('info');
              setBcExpiry('');
              setBcTargetAll(true);
              setBcTargetSiteId(null);
              setEditingBc(null);
              const res = await fetch('/api/v1/broadcasts/');
              setBroadcasts(await res.json());
            } catch (err) { console.error(err); }
            finally { setIsCreatingBc(false); }
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Message</label>
              <textarea value={bcMessage} onChange={e => setBcMessage(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg p-3 text-gray-800 focus:outline-none focus:border-brand-btn h-24" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Type</label>
              <select value={bcType} onChange={e => setBcType(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg p-3 text-gray-800 focus:outline-none focus:border-brand-btn">
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Target</label>
              <select value={bcTargetAll ? 'all' : 'site'} onChange={e => {
                if (e.target.value === 'all') { setBcTargetAll(true); setBcTargetSiteId(null); }
                else { setBcTargetAll(false); if (sites.length > 0) setBcTargetSiteId(sites[0].id); }
              }} className="w-full bg-brand-bg border border-brand-border rounded-lg p-3 text-gray-800 focus:outline-none focus:border-brand-btn mb-2">
                <option value="all">All Sites</option>
                <option value="site">Specific Site</option>
              </select>
              {!bcTargetAll && (
                <select value={bcTargetSiteId ?? ''} onChange={e => setBcTargetSiteId(Number(e.target.value))}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg p-3 text-gray-800 focus:outline-none focus:border-brand-btn">
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}{s.location ? ` (${s.location})` : ''}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Expires At (optional)</label>
              <input type="datetime-local" value={bcExpiry} onChange={e => setBcExpiry(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg p-3 text-gray-800 focus:outline-none focus:border-brand-btn" />
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setShowBcModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
              <button type="submit" disabled={isCreatingBc}
                className="bg-brand-btn hover:bg-brand-btn-hover text-white font-semibold py-2 px-6 rounded-lg transition-colors disabled:opacity-50">
                {isCreatingBc ? 'Saving...' : editingBc ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Lock Modal */}
    {lockModal && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-md bg-brand-card p-8 rounded-2xl border border-brand-border shadow-2xl relative">
          <button onClick={() => setLockModal(null)} className="absolute top-4 right-4 text-gray-600 hover:text-gray-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-gray-800 mb-2">{lockModal.status === 'unlocked' ? 'Unlock' : 'Lock'} Site</h2>
          <p className="text-sm text-gray-600 mb-4">{lockModal.name}</p>
          {lockModal.status !== 'unlocked' ? (
            <>
              <p className="text-sm text-gray-800 mb-4">Lock this site? It will stop sending SPCB/CPCB data until unlocked.</p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-600 mb-1">Lock Reason</label>
                <input type="text" value={lockModal.reason} onChange={e => setLockModal({...lockModal, reason: e.target.value})}
                  placeholder="e.g. AMC not renewed"
                  className="w-full bg-brand-bg border border-brand-border rounded-lg p-3 text-gray-800 focus:outline-none focus:border-brand-btn" />
              </div>
            </>
          ) : (
            <p className="text-sm text-emerald-600 mb-4 p-3 bg-emerald-50 rounded-lg">Unlock this site? It will resume normal operation.</p>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={() => setLockModal(null)} className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
            <button onClick={async () => {
              if (!lockModal) return;
              const status = lockModal.status === 'unlocked' ? 'unlocked' : 'manual_lock';
              await adminFetch(`/api/v1/sites/${lockModal.id}/lock`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lock_status: status, lock_reason: lockModal.reason })
              });
              setLockModal(null);
              const [sitesRes, locksRes] = await Promise.all([
                adminFetch('/api/v1/sites/'),
                adminFetch('/api/v1/sites/locks/summary')
              ]);
              const newSites = sitesRes.ok ? await sitesRes.json() : [];
              const newLocks = locksRes.ok ? await locksRes.json() : [];
              if (Array.isArray(newSites)) setSites(newSites);
              if (Array.isArray(newLocks)) setLocks(newLocks);
            }} className={`px-6 py-2 rounded-lg text-gray-800 font-bold transition-colors ${
              lockModal.status === 'unlocked' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
            }`}>{lockModal.status === 'unlocked' ? 'Unlock' : 'Lock'}</button>
          </div>
        </div>
      </div>
    )}

    {/* Edit Site Modal */}
    {editSiteModal && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-brand-border shadow-2xl relative">
          <button onClick={() => setEditSiteModal(null)} className="absolute top-4 right-4 text-gray-600 hover:text-gray-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Edit Site</h2>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!editSiteModal) return;
            await handleUpdateSite(editSiteModal.id, editSiteModal.name, editSiteModal.location, editSiteModal.notes);
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Industry Name</label>
              <input type="text" value={editSiteModal.name} onChange={e => setEditSiteModal({...editSiteModal, name: e.target.value})}
                className="w-full bg-white border border-brand-border rounded-lg p-3 text-gray-800 focus:outline-none focus:border-brand-btn"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Location / Address</label>
              <input type="text" value={editSiteModal.location} onChange={e => setEditSiteModal({...editSiteModal, location: e.target.value})}
                className="w-full bg-white border border-brand-border rounded-lg p-3 text-gray-800 focus:outline-none focus:border-brand-btn"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Notes / Contact</label>
              <textarea rows={2} value={editSiteModal.notes} onChange={e => setEditSiteModal({...editSiteModal, notes: e.target.value})}
                className="w-full bg-white border border-brand-border rounded-lg p-3 text-gray-800 focus:outline-none focus:border-brand-btn resize-none" />
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setEditSiteModal(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
              <button type="submit" disabled={savingSite}
                className="bg-brand-btn hover:bg-brand-btn-hover text-white font-semibold py-2 px-6 rounded-lg transition-colors disabled:opacity-50">
                {savingSite ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    </div>
  )
}

export default App



