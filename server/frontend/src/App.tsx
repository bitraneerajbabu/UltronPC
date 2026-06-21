import { useState, useEffect, useCallback } from 'react'

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
}

interface LockSummary {
  id: number;
  lock_status: string;
  lock_reason?: string;
  lock_updated_at?: string;
}

function getConnectionStatus(last_sync?: string): { label: string; pulse: boolean; color: string } {
  if (!last_sync) return { label: 'Never Connected', pulse: false, color: 'text-slate-400' };
  const utcStr = last_sync.endsWith('Z') ? last_sync : last_sync + 'Z';
  const diffMs = Date.now() - new Date(utcStr).getTime();
  const diffMins = diffMs / 60000;
  if (diffMins < 5) return { label: 'Client Live', pulse: true, color: 'text-emerald-400' };
  if (diffMins < 60) return { label: `${Math.floor(diffMins)}m ago`, pulse: false, color: 'text-yellow-400' };
  const diffHrs = diffMins / 60;
  if (diffHrs < 24) return { label: `${Math.floor(diffHrs)}h ago`, pulse: false, color: 'text-orange-400' };
  return { label: `${Math.floor(diffHrs/24)}d ago`, pulse: false, color: 'text-red-400' };
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(sessionStorage.getItem('rajapi_auth') === 'true')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sites, setSites] = useState<Site[]>([])
  const [locks, setLocks] = useState<LockSummary[]>([])
  const [broadcasts, setBroadcasts] = useState<BroadcastItem[]>([])
  
  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [newSiteLocation, setNewSiteLocation] = useState('')
  const [newSiteAmcExpiry, setNewSiteAmcExpiry] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  
  // Broadcast Modal State
  const [showBcModal, setShowBcModal] = useState(false)
  const [bcMessage, setBcMessage] = useState('')
  const [bcType, setBcType] = useState('info')
  const [bcExpiry, setBcExpiry] = useState('')
  const [isCreatingBc, setIsCreatingBc] = useState(false)
  const [editingBc, setEditingBc] = useState<BroadcastItem | null>(null)

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

  const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }
    document.body.removeChild(textArea);
  };

  const copyToClipboard = (text: string) => {
    if (!navigator.clipboard) {
      fallbackCopyTextToClipboard(text);
      return;
    }
    navigator.clipboard.writeText(text).catch(() => {
      fallbackCopyTextToClipboard(text);
    });
  };

  const handleLogout = () => { sessionStorage.removeItem('rajapi_auth'); setIsLoggedIn(false); }; const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    const valid = (username === 'Master' && password === 'Ultron123.0') ||
                  (username === 'Master' && password === 'Master');
    if (valid) {
      sessionStorage.setItem('rajapi_auth', 'true')
      setIsLoggedIn(true)
      setLoginError('')
    } else {
      setLoginError('Invalid credentials')
    }
  }

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    try {
      const payload: any = { name: newSiteName, location: newSiteLocation };
      if (newSiteAmcExpiry) {
        payload.amc_expiry = new Date(newSiteAmcExpiry).toISOString();
      }
      
      const res = await fetch('/api/v1/sites/', {
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
        console.error("Failed to create site")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsCreating(false)
    }
  }

  const handleToggleStatus = async (siteId: number, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/v1/sites/${siteId}/status?is_active=${!currentStatus}`, {
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
      const res = await fetch(`/api/v1/sites/${siteId}/renew`, {
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
      const res = await fetch(`/api/v1/sites/${siteId}`, { method: 'DELETE' });
      if (res.ok) {
        setSites(sites.filter(s => s.id !== siteId));
        if (activeSite?.id === siteId) { setActiveSite(null); setLiveData([]); }
      }
    } catch (err) { console.error(err); }
  };

  const handleSaveExpiry = async (siteId: number) => {
    if (!editExpiryVal) return;
    setSavingExpiry(true);
    try {
      const res = await fetch(`/api/v1/sites/${siteId}/amc-expiry`, {
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
      const res = await fetch('/api/v1/sites/telemetry/prune-all?keep_days=7', { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        alert(`✅ Pruned ${data.deleted_rows.toLocaleString()} old telemetry rows. rajapi.com should be faster now.`);
      }
    } catch (err) { console.error(err); }
  };


  useEffect(() => {
    if (!isLoggedIn) return;
    const load = () => {
      fetch('/api/v1/sites/')
        .then(res => res.json())
        .then(data => setSites(data))
        .catch(err => console.error(err));
      fetch('/api/v1/broadcasts/')
        .then(res => res.json())
        .then(data => setBroadcasts(data))
        .catch(err => console.error(err));
      fetch('/api/v1/sites/locks/summary')
        .then(res => res.json())
        .then(data => setLocks(data))
        .catch(err => console.error(err));
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [isLoggedIn])

  const fetchLiveData = useCallback(async (siteId: number) => {
    setLiveDataLoading(true);
    try {
      const res = await fetch(`/api/v1/sites/${siteId}/telemetry/latest`);
      if (res.ok) {
        const data = await res.json();
        setLiveData(data);
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

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-teal-950 flex items-center justify-center font-sans text-white p-4">
        <div className="w-full max-w-md bg-teal-900 p-8 rounded-2xl border border-teal-800 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-teal-300">
              RajAPI Secure Login
            </h1>
            <p className="text-slate-300 mt-2">Central Telemetry Dashboard</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-teal-950 border border-teal-800 rounded-lg p-3 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-teal-950 border border-teal-800 rounded-lg p-3 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                required
              />
            </div>
            {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
            <button 
              type="submit"
              className="w-full bg-teal-600 hover:bg-teal-500 text-white font-semibold py-3 px-4 rounded-lg transition-colors shadow-lg shadow-teal-900/50"
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
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return site.name.toLowerCase().includes(q) || 
             site.api_key.toLowerCase().includes(q) || 
             (site.location && site.location.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-teal-950 font-sans text-slate-100 overflow-hidden flex flex-col relative">
      {/* Background decoration - simple gradient, no external requests */}
      <div className="absolute inset-0 bg-gradient-to-br from-teal-950 via-teal-900 to-emerald-950/40 z-0" />
      
      {/* Top Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-3 bg-teal-950 border-b border-teal-800">
        <div className="flex items-center gap-4">
          <img src="/assets/Ultron_logo.png" alt="UltrON Logo" className="h-8 drop-shadow-md" />
          <nav className="flex items-center gap-1 ml-4">
            {['dashboard', 'broadcasts', 'locks'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  activeTab === tab ? 'bg-teal-600 text-white' : 'text-slate-300 hover:text-white hover:bg-teal-900'
                }`}
              >{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
            ))}
          </nav>
        </div>
        
        {/* Search Bar */}
        <div className="flex-1 max-w-2xl px-4">
          <div className="relative flex items-center w-full h-12 rounded-full bg-teal-900/80 hover:bg-teal-800/80 focus-within:bg-white focus-within:text-teal-950 transition-colors px-4 border border-teal-700/50 shadow-inner">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-300 focus-within:text-slate-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Search sites..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none text-base placeholder-slate-400"
            />
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4 w-64 justify-end">
          <span className="text-xs font-bold text-teal-400 bg-teal-900/40 px-2 py-0.5 rounded-full border border-teal-700/50">v1.0.8</span>
          <a 
            href="/api/v1/downloads/latest-client" 
            title="Download Latest Client v1.0.8"
            className="p-2 rounded-full text-slate-300 hover:bg-teal-800/50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
          <button 
            onClick={handlePruneAll}
            title="Prune old telemetry (keep 7 days) — speeds up rajapi.com"
            className="p-2 rounded-full text-slate-300 hover:bg-red-900/30 hover:text-red-400 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button 
            onClick={handleLogout}
            title="Logout"
            className="p-2 rounded-full text-slate-300 hover:bg-teal-800/50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
          <div className="h-8 w-8 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold ml-2 shadow-md">
            M
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
            onClick={() => setShowModal(true)}
            className="flex items-center gap-3 bg-teal-600 hover:bg-teal-500 text-white px-5 py-4 rounded-2xl font-medium transition-colors shadow-lg shadow-teal-900/50 mb-4 w-48 border border-teal-500/50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Register Site
          </button>

          <nav className="flex flex-col gap-1">
            {['All Sites', 'Online', 'Offline'].map(category => (
              <button 
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`flex items-center justify-between px-4 py-2 rounded-r-full transition-colors ${
                  selectedCategory === category 
                  ? 'bg-teal-900/40 text-teal-300 font-semibold border-l-4 border-teal-500' 
                  : 'text-slate-300 hover:bg-teal-900/50 border-l-4 border-transparent'
                }`}
              >
                <span>{category}</span>
                {category === 'All Sites' && <span className="text-xs bg-teal-800/50 px-2 py-0.5 rounded-full">{sites.length}</span>}
                {category === 'Online' && <span className="text-xs bg-emerald-900/40 text-emerald-400 px-2 py-0.5 rounded-full">{sites.filter(s=>s.is_active).length}</span>}
                {category === 'Offline' && <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full">{sites.filter(s=>!s.is_active).length}</span>}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content Area (Glassmorphism List) */}
        <main className="flex-1 bg-teal-900/60 border border-teal-800 rounded-tl-xl shadow-lg overflow-hidden flex flex-col mr-2 mt-2 mb-2">
          
          {/* List Header */}
          <div className="flex items-center px-6 py-3 border-b border-white/10 bg-black/20">
            <div className="flex items-center gap-2 text-teal-300 border-b-2 border-teal-500 pb-2 px-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="font-medium text-sm">{selectedCategory} Dashboard</span>
            </div>
            <div className="ml-auto text-xs text-slate-300">
              {filteredSites.length > 0 ? `1-${filteredSites.length} of ${filteredSites.length}` : '0'}
            </div>
          </div>

          {/* List Items */}
          <div className="flex-1 overflow-y-auto">
            {filteredSites.length === 0 ? (
              <div className="p-12 text-center text-slate-300">
                <p>No sites found matching your criteria.</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {filteredSites.map(site => (
                  <div key={site.id} onClick={() => setActiveSite(site)} className={`group flex items-center px-4 py-2 border-b border-teal-800/50 hover:bg-teal-800/40 transition-colors cursor-pointer text-sm ${activeSite?.id === site.id ? 'bg-teal-900/20 border-l-2 border-l-teal-500' : ''}`}>
                    {/* Left Actions */}
                    <div className="flex items-center gap-3 w-16 text-slate-400">
                      <input type="checkbox" className="rounded border-teal-700 bg-teal-900 text-teal-500 focus:ring-teal-500/50 cursor-pointer" />
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 hover:text-yellow-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </div>

                    {/* Site Details */}
                    <div className="flex-1 grid grid-cols-12 items-center gap-4">
                      <div className="col-span-3 font-bold text-slate-100 truncate">{site.name}</div>
                      
                      <div className="col-span-3 flex flex-col gap-0.5">
                        <span className="text-slate-300 truncate flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${site.is_active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`}></span>
                          {site.location || 'Unknown Location'}
                        </span>
                        {(() => {
                          const conn = getConnectionStatus(site.last_sync);
                          return (
                            <span className={`flex items-center gap-1 text-xs font-medium ${conn.color} pl-4`}>
                              {conn.pulse && <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                              </span>}
                              {!conn.pulse && <span className="w-2 h-2 rounded-full bg-current opacity-60"></span>}
                              {conn.label}
                            </span>
                          );
                        })()}
                      </div>
                      
                      {/* Token Section */}
                      <div className="col-span-4 flex items-center gap-2 text-slate-300 truncate">
                        <span className="bg-black/30 border border-white/10 px-2 py-0.5 rounded text-xs text-slate-300 font-mono truncate max-w-[150px]">
                          {site.api_key}
                        </span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(site.api_key);
                            alert("AMC Token copied to clipboard!");
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-teal-300 transition-all"
                          title="Copy AMC Token"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                      
                      {/* Expiry Date */}
                      <div className="col-span-2 text-right font-medium text-slate-300 pr-4">
                        {site.amc_expiry ? new Date(site.amc_expiry).toLocaleDateString(undefined, {month:'short', day:'numeric'}) : '-'}
                      </div>
                    </div>

                    {/* Quick Actions (Hover) */}
                    <div className="w-32 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Edit Expiry */}
                      {editingExpiry === site.id ? (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <input type="date" value={editExpiryVal} onChange={e => setEditExpiryVal(e.target.value)}
                            className="bg-teal-950 border border-teal-700 rounded text-xs text-white px-1 py-0.5 w-28"
                          />
                          <button onClick={() => handleSaveExpiry(site.id)} disabled={savingExpiry}
                            className="px-1.5 py-0.5 bg-teal-600 hover:bg-teal-500 text-white rounded text-xs font-bold"
                          >{savingExpiry ? '...' : '✓'}</button>
                          <button onClick={() => setEditingExpiry(null)} className="text-slate-300 hover:text-white text-xs px-1">✕</button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingExpiry(site.id); setEditExpiryVal(site.amc_expiry ? site.amc_expiry.split('T')[0] : ''); }}
                            className="p-2 rounded-full hover:bg-teal-800/50 text-slate-300 hover:text-yellow-400 transition-colors"
                            title="Edit AMC Expiry"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleToggleStatus(site.id, site.is_active); }}
                            className="p-2 rounded-full hover:bg-teal-800/50 text-slate-300 hover:text-white transition-colors"
                            title={site.is_active ? "Suspend" : "Activate"}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleRenewAmc(site.id); }}
                            className="p-2 rounded-full hover:bg-teal-800/50 text-slate-300 hover:text-blue-400 transition-colors"
                            title="Renew AMC (generates new key)"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteSite(site.id, site.name); }}
                            className="p-2 rounded-full hover:bg-red-900/40 text-slate-300 hover:text-red-400 transition-colors"
                            title="Delete Site"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Live Data Side Panel */}
        {activeSite && (
          <aside className="w-96 flex flex-col bg-teal-900 border-l border-teal-800 shadow-xl overflow-hidden mt-2 mb-2 mr-2 rounded-xl">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-black/30">
              <div>
                <h2 className="font-bold text-white text-base truncate">{activeSite.name}</h2>
                <p className="text-xs text-slate-300">{activeSite.location || 'Unknown Location'}</p>
              </div>
              <button
                onClick={() => { setActiveSite(null); setLiveData([]); }}
                className="p-1.5 rounded-full hover:bg-teal-800/60 text-slate-300 hover:text-white transition-colors ml-2 flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Auto-refresh indicator */}
            <div className="flex items-center gap-2 px-5 py-2 bg-teal-900/20 border-b border-teal-800/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
              </span>
              <span className="text-xs text-teal-400 font-medium">Live — refreshing every 10s</span>
              {liveDataLoading && <span className="ml-auto text-xs text-slate-400 animate-pulse">Fetching...</span>}
            </div>

            {/* Data Table */}
            <div className="flex-1 overflow-y-auto">
              {liveData.length === 0 && !liveDataLoading ? (
                <div className="p-8 text-center text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-sm">No telemetry data yet.</p>
                  <p className="text-xs mt-1">UltrON client will sync data here.</p>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-teal-900">
                    <tr className="text-slate-400 border-b border-white/10">
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
                        <tr key={pt.tag_name} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-2">
                            <div className="font-mono text-teal-300 font-medium">{pt.tag_name}</div>
                            {pt.name !== pt.tag_name && <div className="text-slate-400 truncate max-w-[130px]">{pt.name}</div>}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-white">
                            {pt.value !== null && pt.value !== undefined ? pt.value.toFixed(2) : '—'}
                            {pt.unit && <span className="ml-1 text-slate-300 font-normal">{pt.unit}</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              isGood ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
                            }`}>
                              {pt.quality}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-slate-400">{ago} ago</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </aside>
        )}
      </>)}

        {activeTab === 'broadcasts' && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Broadcast Messages</h2>
              <button onClick={() => { setEditingBc(null); setBcMessage(''); setBcType('info'); setBcExpiry(''); setShowBcModal(true); }}
                className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
              >+ New Broadcast</button>
            </div>
            {broadcasts.length === 0 ? (
              <div className="text-center text-slate-400 py-20">
                <p className="text-lg">No broadcasts yet.</p>
                <p className="text-sm mt-1">Create one to send messages to all UltrON clients.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {broadcasts.map(bc => (
                  <div key={bc.id} className={`bg-teal-900 border rounded-xl p-4 transition-colors ${
                    bc.message_type === 'critical' ? 'border-red-700/50' :
                    bc.message_type === 'warning' ? 'border-yellow-700/50' :
                    'border-teal-800'
                  }`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            bc.message_type === 'critical' ? 'bg-red-900/50 text-red-400' :
                            bc.message_type === 'warning' ? 'bg-yellow-900/50 text-yellow-400' :
                            'bg-teal-900/50 text-teal-400'
                          }`}>{bc.message_type.toUpperCase()}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${bc.is_active ? 'bg-emerald-900/50 text-emerald-400' : 'bg-teal-800 text-slate-300'}`}>
                            {bc.is_active ? 'Active' : 'Inactive'}
                          </span>
                          {bc.expires_at && <span className="text-xs text-slate-400">Expires: {new Date(bc.expires_at).toLocaleDateString()}</span>}
                        </div>
                        <p className="text-white text-sm">{bc.message}</p>
                        <p className="text-xs text-slate-400 mt-1">Created: {new Date(bc.created_at).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={async () => {
                          await fetch(`/api/v1/broadcasts/${bc.id}/toggle`, {method: 'PUT'});
                          const res = await fetch('/api/v1/broadcasts/');
                          setBroadcasts(await res.json());
                        }} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          bc.is_active ? 'bg-yellow-600/30 text-yellow-400 hover:bg-yellow-600/50' : 'bg-emerald-600/30 text-emerald-400 hover:bg-emerald-600/50'
                        }`}>{bc.is_active ? 'Deactivate' : 'Activate'}</button>
                        <button onClick={async () => {
                          if (!confirm('Delete this broadcast?')) return;
                          await fetch(`/api/v1/broadcasts/${bc.id}`, {method: 'DELETE'});
                          setBroadcasts(broadcasts.filter(b => b.id !== bc.id));
                        }} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'locks' && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-2">Lock Control</h2>
            <p className="text-sm text-slate-300 mb-6">Locked sites stop sending SPCB/CPCB data. Use for AMC non-renewal or violations.</p>
            {locks.length === 0 ? (
              <div className="text-center text-slate-400 py-20">
                <p className="text-lg">No lock data available.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {locks.map(lock => {
                  const site = sites.find(s => s.id === lock.id);
                  const isLocked = lock.lock_status && lock.lock_status !== 'unlocked';
                  return (
                    <div key={lock.id} className="bg-teal-900 border border-teal-800 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-white font-bold">{site?.name || `Site #${lock.id}`}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            isLocked ? 'bg-red-900/50 text-red-400' : 'bg-emerald-900/50 text-emerald-400'
                          }`}>{isLocked ? lock.lock_status : 'Unlocked'}</span>
                        </div>
                        {isLocked && lock.lock_reason && <p className="text-xs text-slate-300 mt-1">Reason: {lock.lock_reason}</p>}
                        {lock.lock_updated_at && <p className="text-xs text-slate-400 mt-0.5">Updated: {new Date(lock.lock_updated_at).toLocaleString()}</p>}
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
      </div>

      {/* Create Industry Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-teal-900 p-8 rounded-2xl border border-teal-800 shadow-2xl relative">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-slate-300 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 className="text-2xl font-bold text-white mb-6">Register New Industry</h2>
            <form onSubmit={handleCreateSite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Industry Name</label>
                <input 
                  type="text" 
                  value={newSiteName}
                  onChange={e => setNewSiteName(e.target.value)}
                  className="w-full bg-teal-950 border border-teal-800 rounded-lg p-3 text-white focus:outline-none focus:border-teal-500"
                  required
                  placeholder="e.g. Acme Corp Factory 1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Location</label>
                <input 
                  type="text" 
                  value={newSiteLocation}
                  onChange={e => setNewSiteLocation(e.target.value)}
                  className="w-full bg-teal-950 border border-teal-800 rounded-lg p-3 text-white focus:outline-none focus:border-teal-500"
                  required
                  placeholder="e.g. Hyderabad, India"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">AMC Expiry Date (Optional)</label>
                <input 
                  type="date" 
                  value={newSiteAmcExpiry}
                  onChange={e => setNewSiteAmcExpiry(e.target.value)}
                  className="w-full bg-teal-950 border border-teal-800 rounded-lg p-3 text-white focus:outline-none focus:border-teal-500"
                />
                <p className="text-xs text-slate-400 mt-1">If left blank, it will default to 1 year from today.</p>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isCreating}
                  className="bg-teal-600 hover:bg-teal-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
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
        <div className="w-full max-w-lg bg-teal-900 p-8 rounded-2xl border border-teal-800 shadow-2xl relative">
          <button onClick={() => setShowBcModal(false)} className="absolute top-4 right-4 text-slate-300 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold text-white mb-6">{editingBc ? 'Edit Broadcast' : 'New Broadcast'}</h2>
          <form onSubmit={async (e) => {
            e.preventDefault();
            setIsCreatingBc(true);
            try {
              const payload: any = { message: bcMessage, message_type: bcType };
              if (bcExpiry) payload.expires_at = new Date(bcExpiry).toISOString();
              const url = editingBc ? `/api/v1/broadcasts/${editingBc.id}` : '/api/v1/broadcasts/';
              const method = editingBc ? 'PUT' : 'POST';
              await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
              setShowBcModal(false);
              setBcMessage('');
              setBcType('info');
              setBcExpiry('');
              setEditingBc(null);
              const res = await fetch('/api/v1/broadcasts/');
              setBroadcasts(await res.json());
            } catch (err) { console.error(err); }
            finally { setIsCreatingBc(false); }
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Message</label>
              <textarea value={bcMessage} onChange={e => setBcMessage(e.target.value)}
                className="w-full bg-teal-950 border border-teal-800 rounded-lg p-3 text-white focus:outline-none focus:border-teal-500 h-24" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Type</label>
              <select value={bcType} onChange={e => setBcType(e.target.value)}
                className="w-full bg-teal-950 border border-teal-800 rounded-lg p-3 text-white focus:outline-none focus:border-teal-500">
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Expires At (optional)</label>
              <input type="datetime-local" value={bcExpiry} onChange={e => setBcExpiry(e.target.value)}
                className="w-full bg-teal-950 border border-teal-800 rounded-lg p-3 text-white focus:outline-none focus:border-teal-500" />
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setShowBcModal(false)}
                className="px-4 py-2 text-slate-300 hover:text-white transition-colors">Cancel</button>
              <button type="submit" disabled={isCreatingBc}
                className="bg-teal-600 hover:bg-teal-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors disabled:opacity-50">
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
        <div className="w-full max-w-md bg-teal-900 p-8 rounded-2xl border border-teal-800 shadow-2xl relative">
          <button onClick={() => setLockModal(null)} className="absolute top-4 right-4 text-slate-300 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-white mb-2">{lockModal.status === 'unlocked' ? 'Unlock' : 'Lock'} Site</h2>
          <p className="text-sm text-slate-300 mb-4">{lockModal.name}</p>
          {lockModal.status !== 'unlocked' ? (
            <>
              <p className="text-sm text-white mb-4">Lock this site? It will stop sending SPCB/CPCB data until unlocked.</p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-1">Lock Reason</label>
                <input type="text" value={lockModal.reason} onChange={e => setLockModal({...lockModal, reason: e.target.value})}
                  placeholder="e.g. AMC not renewed"
                  className="w-full bg-teal-950 border border-teal-800 rounded-lg p-3 text-white focus:outline-none focus:border-teal-500" />
              </div>
            </>
          ) : (
            <p className="text-sm text-emerald-400 mb-4 p-3 bg-emerald-900/20 rounded-lg">Unlock this site? It will resume normal operation.</p>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={() => setLockModal(null)} className="px-4 py-2 text-slate-300 hover:text-white transition-colors">Cancel</button>
            <button onClick={async () => {
              if (!lockModal) return;
              const status = lockModal.status === 'unlocked' ? 'unlocked' : 'manual_lock';
              await fetch(`/api/v1/sites/${lockModal.id}/lock`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lock_status: status, lock_reason: lockModal.reason })
              });
              setLockModal(null);
              const [sitesRes, locksRes] = await Promise.all([
                fetch('/api/v1/sites/'),
                fetch('/api/v1/sites/locks/summary')
              ]);
              setSites(await sitesRes.json());
              setLocks(await locksRes.json());
            }} className={`px-6 py-2 rounded-lg text-white font-bold transition-colors ${
              lockModal.status === 'unlocked' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
            }`}>{lockModal.status === 'unlocked' ? 'Unlock' : 'Lock'}</button>
          </div>
        </div>
      </div>
    )}
    </div>
  )
}

export default App
