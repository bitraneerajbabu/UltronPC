import { useState, useEffect } from 'react'

interface Site {
  id: number;
  name: string;
  api_key: string;
  location: string;
  is_active: boolean;
  amc_expiry?: string;
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(sessionStorage.getItem('rajapi_auth') === 'true')
  const [sites, setSites] = useState<Site[]>([])
  
  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [newSiteLocation, setNewSiteLocation] = useState('')
  const [newSiteAmcExpiry, setNewSiteAmcExpiry] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (username === 'Master' && password === 'Ultron123.0') {
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

  const handleUpdateAmcExpiry = async (siteId: number, newDateStr: string) => {
    try {
      const res = await fetch(`/api/v1/sites/${siteId}/amc-expiry`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amc_expiry: new Date(newDateStr).toISOString() })
      });
      if (res.ok) {
        const updatedSite = await res.json();
        setSites(sites.map(s => s.id === siteId ? updatedSite : s));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    fetch('/api/v1/sites/')
      .then(res => res.json())
      .then(data => setSites(data))
      .catch(err => console.error(err))
  }, [])

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans text-white p-4">
        <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-teal-300">
              RajAPI Secure Login
            </h1>
            <p className="text-slate-400 mt-2">Central Telemetry Dashboard</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
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

  return (
    <div className="min-h-screen p-8 bg-slate-900 text-white font-sans">
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-teal-400">
            RajAPI Central Dashboard
          </h1>
          <p className="text-gray-400 mt-2">Global Industry Telemetry Orchestration</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-teal-900/50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Register New Industry
          </button>
          <a 
            href="/api/v1/downloads/latest-client" 
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-teal-800/50 text-teal-300 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Latest Client
          </a>
          <button 
            onClick={() => {
              sessionStorage.removeItem('rajapi_auth')
              setIsLoggedIn(false)
            }}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-x-auto">
        {sites.length === 0 ? (
          <div className="p-8 flex flex-col items-center justify-center text-gray-400">
            <p>No industry sites connected yet.</p>
            <p className="text-sm mt-2">Deploy UltrON clients with your API key to see them here.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/50 border-b border-slate-700 text-slate-400 text-sm">
                <th className="p-4 font-medium">Industry Name</th>
                <th className="p-4 font-medium">Location</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium w-48">AMC Expiry</th>
                <th className="p-4 font-medium">API Key</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sites.map(site => (
                <tr key={site.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                  <td className="p-4 font-semibold text-white">{site.name}</td>
                  <td className="p-4 text-sm text-gray-400">{site.location || 'Unknown'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${site.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {site.is_active ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      {site.amc_expiry && new Date(site.amc_expiry) < new Date() && (
                        <span className="text-[10px] w-fit bg-red-900/40 text-red-400 px-2 py-0.5 rounded border border-red-800/50 mb-1">Expired</span>
                      )}
                      <input 
                        type="date" 
                        value={site.amc_expiry ? site.amc_expiry.split('T')[0] : ''}
                        onChange={(e) => handleUpdateAmcExpiry(site.id, e.target.value)}
                        className="bg-slate-900/50 p-1.5 rounded text-sm text-teal-300 focus:outline-none border border-slate-700 focus:border-teal-500"
                      />
                    </div>
                  </td>
                  <td className="p-4">
                    <code className="text-xs bg-black/50 p-1.5 rounded text-teal-300 break-all max-w-[150px] inline-block truncate" title={site.api_key}>
                      {site.api_key}
                    </code>
                  </td>
                  <td className="p-4 flex gap-2 justify-end">
                    <button 
                      onClick={() => handleToggleStatus(site.id, site.is_active)}
                      className={`py-1.5 px-3 rounded text-xs font-semibold transition-colors border ${
                        site.is_active 
                          ? 'border-red-900/50 text-red-400 hover:bg-red-900/20' 
                          : 'border-emerald-900/50 text-emerald-400 hover:bg-emerald-900/20'
                      }`}
                    >
                      {site.is_active ? 'Suspend' : 'Activate'}
                    </button>
                    <button 
                      onClick={() => handleRenewAmc(site.id)}
                      className="py-1.5 px-3 rounded text-xs font-semibold text-blue-400 border border-blue-900/50 hover:bg-blue-900/20 transition-colors"
                    >
                      Renew
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Industry Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl relative">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 className="text-2xl font-bold text-white mb-6">Register New Industry</h2>
            <form onSubmit={handleCreateSite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Industry Name</label>
                <input 
                  type="text" 
                  value={newSiteName}
                  onChange={e => setNewSiteName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-teal-500"
                  required
                  placeholder="e.g. Acme Corp Factory 1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Location</label>
                <input 
                  type="text" 
                  value={newSiteLocation}
                  onChange={e => setNewSiteLocation(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-teal-500"
                  required
                  placeholder="e.g. Hyderabad, India"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">AMC Expiry Date (Optional)</label>
                <input 
                  type="date" 
                  value={newSiteAmcExpiry}
                  onChange={e => setNewSiteAmcExpiry(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-teal-500"
                />
                <p className="text-xs text-slate-500 mt-1">If left blank, it will default to 1 year from today.</p>
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
    </div>
  )
}

export default App
