import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';

export const AppContext = createContext(null);

// When served by FastAPI (python run.py), use same-origin relative URLs.
// When running via `npm run dev` (Vite dev server on :5173), proxy handles /api → :8000.
const _isDevServer = window.location.port === '5173';
const API_BASE = _isDevServer ? 'http://localhost:8000/api/v1' : '/api/v1';
const WS_BASE  = _isDevServer ? 'ws://localhost:8000/ws/live'  : `ws://${window.location.host}/ws/live`;


export const AppProvider = ({ children }) => {
  const [stations, setStations] = useState([]);
  const [devices, setDevices] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [logs, setLogs] = useState([]);
  const [liveData, setLiveData] = useState({});
  const [kpis, setKpis] = useState({
    totalStations: 0,
    onlineDevices: 0,
    offlineDevices: 0,
    activeAlarms: 0,
  });
  const [activeScreen, setActiveScreen] = useState('dashboardScreen');
  const [currentUser, setCurrentUser] = useState(sessionStorage.getItem('ultron_user') || null);
  const [currentUserRole, setCurrentUserRole] = useState(sessionStorage.getItem('ultron_role') || null);
  const [authToken, setAuthToken] = useState(sessionStorage.getItem('ultron_token') || null);
  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [amcExpiry, setAmcExpiry] = useState<string | null>(null);

  // User management state (admin only)
  const [usersList, setUsersList] = useState([]);

  // Load plant configuration from localStorage
  const localSettings = JSON.parse(localStorage.getItem('ultron_local_settings') || '{}');
  const [plantName, setPlantName] = useState(localSettings.plantName || 'UltrON Industrial Plant');
  const [plantAddress, setPlantAddress] = useState(localSettings.plantAddress || 'Industrial Zone, Block A');
  const [plantLogo, setPlantLogo] = useState(localSettings.plantLogo || '');

  const wsRef = useRef(null);
  const wsReconnectTimerRef = useRef(null);
  const wsKpiLastFetch = useRef(0);
  const wsIsClosing = useRef(false);

  const parametersRef = useRef([]);
  // Sync parametersRef with parameters state
  useEffect(() => {
    parametersRef.current = parameters;
  }, [parameters]);

  // Show dynamic toast notifications
  const showToast = useCallback((msg, type = 'success') => {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type !== 'success' ? type : ''}`.trim();
    t.textContent = msg;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, 3800);
  }, []);

  // ─── Authenticated fetch helper ────────────────────────────────────────────
  const authFetch = useCallback(async (url: string, options: any = {}) => {
    const token = sessionStorage.getItem('ultron_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };
    try {
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401) {
        sessionStorage.removeItem('ultron_token');
        sessionStorage.removeItem('ultron_user');
        sessionStorage.removeItem('ultron_role');
        setAuthToken(null);
        setCurrentUser(null);
        setCurrentUserRole(null);
        if (wsRef.current) wsRef.current.close();
        showToast('Session expired. Please log in again.', 'error');
      }
      return res;
    } catch (err) {
      throw err;
    }
  }, [showToast]);

  // ─── Shared API error extractor ───────────────────────────────────────────
  // Reads the JSON body from a non-ok response and returns the detail string.
  const extractApiError = async (res, fallback = 'An error occurred.') => {
    try {
      const body = await res.json();
      if (body && body.detail) {
        if (typeof body.detail === 'string') return body.detail;
        if (Array.isArray(body.detail)) return body.detail.map(d => d.msg || JSON.stringify(d)).join('; ');
      }
    } catch (_) { /* ignore parse errors */ }
    return fallback;
  };

  // Save local settings helper
  const saveLocalSettings = useCallback(async (cfg) => {
    localStorage.setItem('ultron_local_settings', JSON.stringify(cfg));
    setPlantName(cfg.plantName || 'UltrON Industrial Plant');
    setPlantAddress(cfg.plantAddress || 'Industrial Zone, Block A');
    setPlantLogo(cfg.plantLogo || '');
    
    try {
      const res = await authFetch(`${API_BASE}/settings/plant`, {
        method: 'POST',
        body: JSON.stringify({
          plantName: cfg.plantName || 'UltrON Industrial Plant',
          plantAddress: cfg.plantAddress || 'Industrial Zone, Block A',
          plantLogo: cfg.plantLogo || '',
        })
      });
      if (res.ok) {
        showToast('System configuration saved permanently.');
      } else {
        showToast('Local settings saved, but failed to sync with server.', 'warn');
      }
    } catch (e) {
      console.error('[AppContext] Failed to save settings to server:', e);
      showToast('Local settings saved, but backend server is unreachable.', 'warn');
    }
  }, [showToast, authFetch, API_BASE]);

  // Helper mappings
  const parseUtcDate = (dateStr) => {
    if (!dateStr || dateStr === '—') return new Date();
    if (dateStr instanceof Date) return dateStr;
    let cleanStr = String(dateStr).trim();
    if (!cleanStr.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(cleanStr)) {
      if (!cleanStr.includes('T')) {
        cleanStr = cleanStr.replace(' ', 'T');
      }
      cleanStr += 'Z';
    }
    return new Date(cleanStr);
  };

  const formatTimestamp = (date) => {
    const p = n => String(n).padStart(2, '0');
    return `${p(date.getDate())}-${p(date.getMonth()+1)}-${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
  };

  const mapLogTypeBack = (type) => {
    if (type === 'comm') return 'Communication';
    if (type === 'system') return 'System';
    if (type === 'audit') return 'Audit';
    if (type === 'alarm') return 'Alarm';
    return 'System';
  };

  // Fetch latest telemetry & KPIs — both calls fire in parallel
  const fetchLatestTelemetryAndKpis = useCallback(async (paramsList = null) => {
    try {
      const [telRes, kpiRes] = await Promise.all([
        authFetch(`${API_BASE}/telemetry/latest`),
        authFetch(`${API_BASE}/telemetry/dashboard-summary`),
      ]);

      if (telRes.ok) {
        const telemetryData = await telRes.json();
        const activeParams = paramsList || parametersRef.current || [];
        setLiveData(prev => {
          const newLiveData = { ...prev };
          telemetryData.forEach(p => {
            const param = activeParams.find(paramObj => paramObj.id === p.parameter_id);
            if (param) {
              newLiveData[param.tag_name] = {
                value: p.value,
                unit: param.unit || '',
                status: (p.quality === 'good' || p.quality === 'out_of_range' || p.quality === 'uncertain' || p.quality === 'U' || p.quality === 'O' || p.quality === 'N') ? 'online' : 'offline',
                timestamp: formatTimestamp(parseUtcDate(p.timestamp))
              };
            }
          });
          return newLiveData;
        });
      }

      if (kpiRes.ok) {
        const kpisData = await kpiRes.json();
        setKpis({
          totalStations: kpisData.total_stations || 0,
          onlineDevices: kpisData.online_stations || 0,
          offlineDevices: kpisData.offline_stations || 0,
          activeAlarms: kpisData.active_alarms || 0,
        });
      }
    } catch (err) {
      console.error('[AppContext] Failed to fetch latest telemetry/KPIs:', err);
    }
  }, [authFetch, API_BASE]);

  // Fetch initial data — all independent calls fire in parallel via Promise.all
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      // Fire all independent fetches simultaneously instead of one-by-one
      const [plantRes, stationsRes, devicesRes, parametersRes, logsRes] = await Promise.all([
        authFetch(`${API_BASE}/settings/plant`).catch(() => null),
        authFetch(`${API_BASE}/stations/`),
        authFetch(`${API_BASE}/devices/`),
        authFetch(`${API_BASE}/parameters/`),
        authFetch(`${API_BASE}/logs/?limit=100`),
      ]);

      // Plant settings
      if (plantRes && plantRes.ok) {
        try {
          const plantData = await plantRes.json();
          setPlantName(plantData.plantName || 'UltrON Industrial Plant');
          setPlantAddress(plantData.plantAddress || 'Industrial Zone, Block A');
          setPlantLogo(plantData.plantLogo || '');
          localStorage.setItem('ultron_local_settings', JSON.stringify({
            ...JSON.parse(localStorage.getItem('ultron_local_settings') || '{}'),
            plantName: plantData.plantName,
            plantAddress: plantData.plantAddress,
            plantLogo: plantData.plantLogo,
          }));
        } catch (e) { /* ignore parse errors */ }
      }

      // Stations, devices
      const stationsData = stationsRes.ok ? await stationsRes.json() : [];
      setStations(stationsData || []);

      const devicesData = devicesRes.ok ? await devicesRes.json() : [];
      setDevices(devicesData || []);

      // Parameters — must resolve before telemetry fetch (needs param IDs)
      const parametersData = parametersRes.ok ? await parametersRes.json() : [];
      setParameters(parametersData || []);

      // Logs
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        const formattedLogs = (logsData || []).map(l => ({
          id: l.id,
          timestamp: formatTimestamp(parseUtcDate(l.timestamp)),
          station: l.source || 'System',
          logType: mapLogTypeBack(l.log_type),
          message: l.message,
          status: l.level === 'WARNING' ? 'WARN' : l.level === 'INFO' ? 'INFO' : l.level === 'ERROR' ? 'ERROR' : 'SUCCESS'
        }));
        setLogs(formattedLogs);
      }

      // Telemetry + KPIs — depends on parametersData so runs after above, but
      // both its internal sub-calls (telemetry/latest & dashboard-summary) are already parallel
      await fetchLatestTelemetryAndKpis(parametersData);
      setHasLoadedOnce(true);

      // Fetch active broadcasts
      try {
        const bcRes = await authFetch(`${API_BASE}/broadcasts/`);
        if (bcRes.ok) setBroadcasts(await bcRes.json());
      } catch {}

      // Fetch license/AMC info
      try {
        const licRes = await authFetch(`${API_BASE}/license/status`);
        if (licRes.ok) {
          const licData = await licRes.json();
          if (licData.amc_expiry) setAmcExpiry(licData.amc_expiry);
        }
      } catch {}

    } catch (err) {
      console.error('[AppContext] Failed to fetch data:', err);
      showToast('Backend connection failed. Please check FastAPI server.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, authFetch, fetchLatestTelemetryAndKpis]);

  // WebSocket Live telemetry channel
  const connectWebSocket = useCallback(() => {
    // Clear any pending reconnect timer
    if (wsReconnectTimerRef.current) {
      clearTimeout(wsReconnectTimerRef.current);
      wsReconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
    }

    wsIsClosing.current = false;
    const ws = new WebSocket(WS_BASE);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[AppContext] Live WebSocket stream connected.');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'live_data') {
          const points = msg.data || [];
          setLiveData(prev => {
            const next = { ...prev };
          points.forEach(pt => {
              const isOnline = pt.quality === 'good' || pt.quality === 'out_of_range' || pt.quality === 'uncertain' || pt.quality === 'U' || pt.quality === 'O' || pt.quality === 'N';
              const prevPoint = prev[pt.tag_name];
              let ts = formatTimestamp(parseUtcDate(pt.timestamp));
              if (!isOnline && prevPoint && prevPoint.timestamp) {
                ts = prevPoint.timestamp;
              }
              next[pt.tag_name] = {
                value: pt.value,
                unit: pt.unit,
                status: isOnline ? 'online' : 'offline',
                timestamp: ts
              };
            });
            return next;
          });

          // Throttle KPI refresh: at most once every 30 seconds
          const now = Date.now();
          if (now - wsKpiLastFetch.current > 30000) {
            wsKpiLastFetch.current = now;
            authFetch(`${API_BASE}/telemetry/dashboard-summary`)
              .then(r => r.json())
              .then(kpisData => {
                setKpis({
                  totalStations: kpisData.total_stations || 0,
                  onlineDevices: kpisData.online_stations || 0,
                  offlineDevices: kpisData.offline_stations || 0,
                  activeAlarms: kpisData.active_alarms || 0,
                });
              })
              .catch(() => {/* network may be offline, ignore */});
          }

        } else if (msg.type === 'alarm') {
          showToast(`Alarm: ${msg.message}`, 'error');
          setLogs(prev => [
            {
              id: Date.now(),
              timestamp: formatTimestamp(new Date()),
              station: 'Alarm Engine',
              logType: 'Alarm',
              message: msg.message,
              status: 'ERROR'
            },
            ...prev
          ]);
        }
      } catch (e) {
        console.error('[AppContext] WS parse error:', e);
      }
    };

    ws.onclose = () => {
      if (wsIsClosing.current) return; // deliberate close, don't reconnect
      console.log('[AppContext] WS disconnected. Retrying in 5 seconds...');
      wsReconnectTimerRef.current = setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = (err) => {
      console.error('[AppContext] WS error:', err);
    };
  }, [showToast, authFetch]);

  useEffect(() => {
    if (currentUser) {
      loadAllData();
      connectWebSocket();
    }
    return () => {
      wsIsClosing.current = true;
      if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [currentUser, loadAllData, connectWebSocket]);

  // Periodic broadcast refresh (every 30s)
  useEffect(() => {
    if (!currentUser) return;
    const iv = setInterval(async () => {
      try {
        const bcRes = await authFetch(`${API_BASE}/broadcasts/`);
        if (bcRes.ok) setBroadcasts(await bcRes.json());
      } catch {}
    }, 30000);
    return () => clearInterval(iv);
  }, [currentUser, authFetch]);

  // ─── Login / Logout ────────────────────────────────────────────────────────
  const login = async (username, password) => {
    if (!username || !password) {
      showToast('Username and password are required.', 'error');
      return false;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.status === 401) {
        showToast('Invalid username or password.', 'error');
        return false;
      }
      if (res.status === 403) {
        showToast('Account is disabled. Contact your administrator.', 'error');
        return false;
      }
      if (!res.ok) {
        showToast('Login failed. Please try again.', 'error');
        return false;
      }

      const data = await res.json();
      // Persist token + role
      sessionStorage.setItem('ultron_token', data.access_token);
      sessionStorage.setItem('ultron_user', data.username);
      sessionStorage.setItem('ultron_role', data.role);
      setAuthToken(data.access_token);
      setCurrentUser(data.username);
      setCurrentUserRole(data.role);

      // Reset to dashboard on login
      setActiveScreen('dashboardScreen');
      showToast(`Welcome, ${data.full_name || data.username}!`);
      return true;

    } catch (err) {
      console.error('[AppContext] Login error:', err);
      showToast('Cannot reach server. Is the backend running?', 'error');
      return false;
    }
  };

  const logout = async () => {
    try {
      const token = sessionStorage.getItem('ultron_token');
      if (token) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      }
    } catch (e) {
      // Ignore network errors on logout
    }
    sessionStorage.removeItem('ultron_token');
    sessionStorage.removeItem('ultron_user');
    sessionStorage.removeItem('ultron_role');
    setAuthToken(null);
    setCurrentUser(null);
    setCurrentUserRole(null);
    if (wsRef.current) wsRef.current.close();
    showToast('Logged out of UltrON.');
  };

  // ─── User Management (admin only) ─────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/users/`);
      if (!res.ok) return;
      const data = await res.json();
      setUsersList(data || []);
    } catch (e) {
      console.error('[AppContext] Failed to load users:', e);
    }
  }, [authFetch]);

  const addUser = async (payload) => {
    try {
      const res = await authFetch(`${API_BASE}/users/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.status === 409) {
        showToast('Username already exists.', 'error');
        return false;
      }
      if (!res.ok) throw new Error();
      const newUser = await res.json();
      setUsersList(prev => [...prev, newUser]);
      showToast(`User '${newUser.username}' created successfully.`);
      return true;
    } catch (e) {
      showToast('Failed to create user.', 'error');
      return false;
    }
  };

  const editUser = async (id, payload) => {
    try {
      const res = await authFetch(`${API_BASE}/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setUsersList(prev => prev.map(u => u.id === id ? updated : u));
      showToast('User updated successfully.');
      return true;
    } catch (e) {
      showToast('Failed to update user.', 'error');
      return false;
    }
  };

  const deleteUser = async (id) => {
    try {
      const res = await authFetch(`${API_BASE}/users/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setUsersList(prev => prev.filter(u => u.id !== id));
      showToast('User deleted.');
      return true;
    } catch (e) {
      showToast('Failed to delete user.', 'error');
      return false;
    }
  };

  // ─── Station REST methods ──────────────────────────────────────────────────
  const addStation = async (payload) => {
    const res = await authFetch(`${API_BASE}/stations/`, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) { showToast(await extractApiError(res, 'Failed to create station.'), 'error'); return false; }
    const newStation = await res.json();
    setStations(prev => [...prev, newStation]);
    showToast('Station added successfully.');
    loadAllData(); return true;
  };

  const editStation = async (id, payload) => {
    const res = await authFetch(`${API_BASE}/stations/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    if (!res.ok) { showToast(await extractApiError(res, 'Failed to update station.'), 'error'); return false; }
    const updated = await res.json();
    setStations(prev => prev.map(s => s.id === id ? updated : s));
    showToast('Station updated successfully.');
    loadAllData(); return true;
  };

  const deleteStation = async (id) => {
    const res = await authFetch(`${API_BASE}/stations/${id}`, { method: 'DELETE' });
    if (!res.ok) { showToast(await extractApiError(res, 'Failed to delete station.'), 'error'); return false; }
    setStations(prev => prev.filter(s => s.id !== id));
    showToast('Station deleted.'); loadAllData(); return true;
  };

  // ─── Device REST methods ───────────────────────────────────────────────────
  const addDevice = async (payload) => {
    const res = await authFetch(`${API_BASE}/devices/`, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) { showToast(await extractApiError(res, 'Failed to create device.'), 'error'); return false; }
    const newDevice = await res.json();
    setDevices(prev => [...prev, newDevice]);
    showToast('Device added successfully.');
    loadAllData(); return true;
  };

  const editDevice = async (id, payload) => {
    const res = await authFetch(`${API_BASE}/devices/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    if (!res.ok) { showToast(await extractApiError(res, 'Failed to update device.'), 'error'); return false; }
    const updated = await res.json();
    setDevices(prev => prev.map(d => d.id === id ? updated : d));
    showToast('Device updated successfully.');
    loadAllData(); return true;
  };

  const deleteDevice = async (id) => {
    const res = await authFetch(`${API_BASE}/devices/${id}`, { method: 'DELETE' });
    if (!res.ok) { showToast(await extractApiError(res, 'Failed to delete device.'), 'error'); return false; }
    setDevices(prev => prev.filter(d => d.id !== id));
    showToast('Device deleted.'); loadAllData(); return true;
  };

  // ─── Parameter REST methods ────────────────────────────────────────────────
  const addParameter = async (payload) => {
    const res = await authFetch(`${API_BASE}/parameters/`, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) { showToast(await extractApiError(res, 'Failed to map parameter.'), 'error'); return false; }
    const newParam = await res.json();
    setParameters(prev => [...prev, newParam]);
    showToast('Parameter mapped successfully.');
    loadAllData(); return true;
  };

  const editParameter = async (id, payload) => {
    const res = await authFetch(`${API_BASE}/parameters/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    if (!res.ok) { showToast(await extractApiError(res, 'Failed to update parameter.'), 'error'); return false; }
    const updated = await res.json();
    setParameters(prev => prev.map(p => p.id === id ? updated : p));
    showToast('Parameter updated.'); loadAllData(); return true;
  };

  const deleteParameter = async (id) => {
    const res = await authFetch(`${API_BASE}/parameters/${id}`, { method: 'DELETE' });
    if (!res.ok) { showToast(await extractApiError(res, 'Failed to delete parameter.'), 'error'); return false; }
    setParameters(prev => prev.filter(p => p.id !== id));
    showToast('Parameter mapping deleted.'); loadAllData(); return true;
  };

  const testDeviceConnection = async (id) => {
    try {
      const dev = devices.find(d => d.id === id);
      if (!dev) return false;
      const res = await authFetch(`${API_BASE}/devices/${id}/test-connection`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        const latencyStr = data.latency_ms != null ? ` (${data.latency_ms}ms)` : '';
        showToast(`${data.message}${latencyStr}`);
        return true;
      } else {
        showToast(data.message || 'Connection test failed.', 'error');
        return false;
      }
    } catch (e) {
      showToast('Connection test failed — backend unreachable.', 'error');
      return false;
    }
  };

  const testParameterConnection = async (id) => {
    try {
      const res = await authFetch(`${API_BASE}/parameters/${id}/test-read`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        return data;
      } else {
        showToast(data.message || 'Analyser read test failed.', 'error');
        return data;
      }
    } catch (e) {
      showToast('Analyser read test failed — backend unreachable.', 'error');
      return { success: false, message: 'Backend unreachable.' };
    }
  };

  return (
    <AppContext.Provider value={{
      stations, devices, parameters, logs, liveData, kpis,
      activeScreen, setActiveScreen,
      currentUser, currentUserRole, authToken, login, logout,
      usersList, loadUsers, addUser, editUser, deleteUser,
      addStation, editStation, deleteStation,
      addDevice, editDevice, deleteDevice,
      addParameter, editParameter, deleteParameter,
      testDeviceConnection, testParameterConnection,
      loadAllData, fetchLatestTelemetryAndKpis, showToast, API_BASE, WS_BASE, authFetch,
      plantName, plantAddress, plantLogo, saveLocalSettings,
      loading, parseUtcDate, hasLoadedOnce,
      broadcasts, amcExpiry
    }}>
      {children}
    </AppContext.Provider>
  );
};
