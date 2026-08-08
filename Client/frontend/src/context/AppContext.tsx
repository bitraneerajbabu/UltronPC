import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';

export const AppContext = createContext(null);
import { LiveDataContext } from './LiveDataContext';
export { LiveDataContext };

// When running via `npm run dev` (Vite dev server on :5173) or production, proxy/server handles routing.
// Using relative/same-origin URLs makes it dynamically compatible with any local port (8000, 8765, etc.).
const API_BASE = '/api/v1';
const WS_BASE  = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/live`;


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
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('ultron_user') || null);
  const [currentUserRole, setCurrentUserRole] = useState(localStorage.getItem('ultron_role') || null);
  const [allowServerMgmt, setAllowServerMgmt] = useState(() => localStorage.getItem('ultron_allow_sm') !== '0');
  const [authToken, setAuthToken] = useState(localStorage.getItem('ultron_token') || null);
  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [amcExpiry, setAmcExpiry] = useState<string | null>(null);
  const [isLicensed, setIsLicensed] = useState<boolean>(true);
  const [lockStatus, setLockStatus] = useState<string>('unlocked');
  const [lockReason, setLockReason] = useState<string | null>(null);

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

  const pendingRequestsRef = useRef<Record<string, AbortController>>({});
  const [pendingStatus, setPendingStatus] = useState<Record<string, string>>({});

  // ─── Startup token validation with auto-refresh ─────────────────────────────
  // On first load, verify the stored token. If expired (401), try refresh.
  // Only clear and force re-login if both token and refresh fail.
  useEffect(() => {
    const storedToken = localStorage.getItem('ultron_token');
    const storedUser  = localStorage.getItem('ultron_user');
    if (!storedToken || !storedUser) return;
    const doRefresh = async () => {
      const rt = localStorage.getItem('ultron_refresh');
      if (!rt) { clearAuth(); return; }
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: rt }),
        });
        if (!res.ok) { clearAuth(); return; }
        const data = await res.json();
        localStorage.setItem('ultron_token', data.access_token);
        localStorage.setItem('ultron_refresh', data.refresh_token);
        setAuthToken(data.access_token);
      } catch { clearAuth(); }
    };
    const clearAuth = () => {
      localStorage.removeItem('ultron_token');
      localStorage.removeItem('ultron_refresh');
      localStorage.removeItem('ultron_user');
      localStorage.removeItem('ultron_role');
      setAuthToken(null);
      setCurrentUser(null);
      setCurrentUserRole(null);
    };
    fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${storedToken}` },
    })
      .then(res => { if (res.status === 401) doRefresh(); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ─── Authenticated fetch helper with auto-refresh ──────────────────────────
  const refreshToken = useCallback(async (): Promise<string | null> => {
    const rt = localStorage.getItem('ultron_refresh');
    if (!rt) return null;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      localStorage.setItem('ultron_token', data.access_token);
      localStorage.setItem('ultron_refresh', data.refresh_token);
      setAuthToken(data.access_token);
      return data.access_token;
    } catch {
      return null;
    }
  }, []);

  const authFetch = useCallback(async (url: string, options: any = {}) => {
    const attempt = async (token: string | null): Promise<Response> => {
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      };
      return fetch(url, { ...options, headers });
    };
    let token = localStorage.getItem('ultron_token');
    let res = await attempt(token);
    if (res.status === 401 && token) {
      const newToken = await refreshToken();
      if (newToken) {
        res = await attempt(newToken);
      }
      if (res.status === 401) {
        localStorage.removeItem('ultron_token');
        localStorage.removeItem('ultron_refresh');
        localStorage.removeItem('ultron_user');
        localStorage.removeItem('ultron_role');
        setAuthToken(null);
        setCurrentUser(null);
        setCurrentUserRole(null);
      }
    }
    return res;
  }, [refreshToken]);

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

  const optimisticEdit = useCallback(async <T,>(
    resourceKey: string,
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    items: T[],
    itemId: number | string,
    idField: string,
    newItem: Partial<T>,
    apiCall: (signal: AbortSignal) => Promise<Response>,
    onSuccess: (res: Response) => Promise<void>,
  ) => {
    if (pendingRequestsRef.current[resourceKey]) {
      pendingRequestsRef.current[resourceKey].abort();
    }
    const controller = new AbortController();
    pendingRequestsRef.current[resourceKey] = controller;
    setPendingStatus(prev => ({ ...prev, [resourceKey]: 'pending' }));
    const snapshot = items;
    setter(prev => prev.map(item => (item as any)[idField] === itemId ? { ...item, ...newItem } : item));
    try {
      const res = await apiCall(controller.signal);
      if (controller.signal.aborted) return false;
      if (res.ok) {
        await onSuccess(res);
        setPendingStatus(prev => ({ ...prev, [resourceKey]: '' }));
        return true;
      }
      const errDetailEdit = await extractApiError(res, 'Failed to update item.');
      showToast(errDetailEdit, 'error');
      setter(snapshot);
      setPendingStatus(prev => ({ ...prev, [resourceKey]: 'error' }));
      return false;
    } catch {
      if (controller.signal.aborted) return false;
      setter(snapshot);
      setPendingStatus(prev => ({ ...prev, [resourceKey]: 'error' }));
      return false;
    } finally {
      if (pendingRequestsRef.current[resourceKey] === controller) {
        delete pendingRequestsRef.current[resourceKey];
      }
    }
  }, [extractApiError, showToast]);

  const optimisticAdd = useCallback(async <T,>(
    resourceKey: string,
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    newItem: T,
    apiCall: (signal: AbortSignal) => Promise<Response>,
    onSuccess: (res: Response) => Promise<T>,
  ) => {
    setPendingStatus(prev => ({ ...prev, [resourceKey]: 'pending' }));
    setter(prev => [...prev, newItem]);
    try {
      const res = await apiCall(new AbortController().signal);
      if (res.ok) {
        const serverItem = await onSuccess(res);
        setter(prev => prev.map(item => item === newItem ? serverItem : item));
        setPendingStatus(prev => ({ ...prev, [resourceKey]: '' }));
        return serverItem;
      }
      const errDetailAdd = await extractApiError(res, 'Failed to save item.');
      showToast(errDetailAdd, 'error');
      setter(prev => prev.filter(item => item !== newItem));
      setPendingStatus(prev => ({ ...prev, [resourceKey]: 'error' }));
      return false;
    } catch {
      setter(prev => prev.filter(item => item !== newItem));
      setPendingStatus(prev => ({ ...prev, [resourceKey]: 'error' }));
      return false;
    }
  }, [extractApiError, showToast]);

  const optimisticRemove = useCallback(async <T,>(
    resourceKey: string,
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    items: T[],
    itemId: number | string,
    idField: string,
    apiCall: (signal: AbortSignal) => Promise<Response>,
    onSuccess: () => void,
  ) => {
    setPendingStatus(prev => ({ ...prev, [resourceKey]: 'pending' }));
    const snapshot = items;
    const removedItem = items.find(item => (item as any)[idField] === itemId);
    setter(prev => prev.filter(item => (item as any)[idField] !== itemId));
    try {
      const res = await apiCall(new AbortController().signal);
      if (res.ok) {
        onSuccess();
        setPendingStatus(prev => ({ ...prev, [resourceKey]: '' }));
        return true;
      }
      if (removedItem) setter(prev => [...prev, removedItem]);
      setPendingStatus(prev => ({ ...prev, [resourceKey]: 'error' }));
      return false;
    } catch {
      if (removedItem) setter(prev => [...prev, removedItem]);
      setPendingStatus(prev => ({ ...prev, [resourceKey]: 'error' }));
      return false;
    }
  }, []);

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
            const param = activeParams.find(paramObj => paramObj.id == p.parameter_id);
            if (param) {
              const prevPt = (prev || {})[param.tag_name];
              const isOnline = p.quality === 'good' || p.quality === 'out_of_range' || p.quality === 'uncertain' || p.quality === 'U' || p.quality === 'O' || p.quality === 'N';
              newLiveData[param.tag_name] = {
                value: p.value,
                raw_value: p.raw_value,
                unit: param.unit || '',
                status: isOnline ? 'online' : 'offline',
                timestamp: !isOnline && prevPt?.timestamp ? prevPt.timestamp : formatTimestamp(parseUtcDate(p.timestamp))
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
      if (stationsRes.ok) {
        const stationsData = await stationsRes.json();
        setStations(stationsData || []);
      } else if (stationsRes.status !== 401) {
        const errText = await extractApiError(stationsRes, 'Failed to load stations.');
        showToast(`Stations: ${errText}`, 'error');
      }

      if (devicesRes.ok) {
        const devicesData = await devicesRes.json();
        setDevices(devicesData || []);
      } else if (devicesRes.status !== 401) {
        const errText = await extractApiError(devicesRes, 'Failed to load devices.');
        showToast(`Devices: ${errText}`, 'error');
      }

      // Parameters — must resolve before telemetry fetch (needs param IDs)
      let parametersData = [];
      if (parametersRes.ok) {
        parametersData = await parametersRes.json();
        setParameters(parametersData || []);
      } else if (parametersRes.status !== 401) {
        const errText = await extractApiError(parametersRes, 'Failed to load parameters.');
        showToast(`Parameters: ${errText}`, 'error');
      }

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
      } else if (logsRes.status !== 401) {
        const errText = await extractApiError(logsRes, 'Failed to load logs.');
        showToast(`Logs: ${errText}`, 'error');
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
          setIsLicensed(licData.licensed);
          if (licData.amc_expiry) setAmcExpiry(licData.amc_expiry);
          if (licData.lock_status) setLockStatus(licData.lock_status);
          if (licData.lock_reason) setLockReason(licData.lock_reason);
        }
      } catch {}

    } catch (err) {
      console.error('[AppContext] Failed to fetch data:', err);
      showToast('Backend connection failed. Please check FastAPI server.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, authFetch, fetchLatestTelemetryAndKpis]);

  // ─── Screen Prefetch Manager ─────────────────────────────────────────────
  const lastPrefetchedRef = useRef<Record<string, number>>({});

  const prefetchScreen = useCallback(async (screenKey: string) => {
    const now = Date.now();
    const last = lastPrefetchedRef.current[screenKey] || 0;
    if (now - last < 15000) return; // 15s TTL cache
    lastPrefetchedRef.current[screenKey] = now;

    try {
      if (screenKey === 'dashboardScreen') {
        await fetchLatestTelemetryAndKpis();
      } else if (screenKey === 'devicesScreen') {
        const [sRes, dRes, pRes] = await Promise.all([
          authFetch(`${API_BASE}/stations/`),
          authFetch(`${API_BASE}/devices/`),
          authFetch(`${API_BASE}/parameters/`),
        ]);
        if (sRes.ok) setStations(await sRes.json());
        if (dRes.ok) setDevices(await dRes.json());
        if (pRes.ok) setParameters(await pRes.json());
      } else if (screenKey === 'reportsScreen') {
        const pRes = await authFetch(`${API_BASE}/parameters/`);
        if (pRes.ok) setParameters(await pRes.json());
      } else if (screenKey === 'cpcbScreen') {
        await Promise.all([
          authFetch(`${API_BASE}/server-config/`),
          authFetch(`${API_BASE}/server-config/mappings`),
        ]);
      } else if (screenKey === 'calibrationScreen') {
        await authFetch(`${API_BASE}/calibration/jobs?limit=200`);
      } else if (screenKey === 'settingsScreen') {
        await Promise.all([
          authFetch(`${API_BASE}/settings/general`),
          authFetch(`${API_BASE}/settings/plant`),
          authFetch(`${API_BASE}/users/`).then(async r => { if (r.ok) setUsersList(await r.json()); }),
        ]);
      }
    } catch (e) {
      console.warn(`[Prefetch] Error prefetching for ${screenKey}:`, e);
    }
  }, [authFetch, fetchLatestTelemetryAndKpis]);

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
    const token = localStorage.getItem('ultron_token');
    const ws = new WebSocket(WS_BASE);
    wsRef.current = ws;

    ws.onopen = () => {
      if (token) ws.send(JSON.stringify({ type: 'auth', token }));
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
              const prevPoint = (prev || {})[pt.tag_name];
              let ts = formatTimestamp(parseUtcDate(pt.timestamp));
              if (!isOnline && prevPoint && prevPoint.timestamp) {
                ts = prevPoint.timestamp;
              }
              const prevVal = prevPoint?.value;
              const frozenVal = (!isOnline && (pt.value == null || pt.value === '')) ? prevVal : pt.value;
              next[pt.tag_name] = {
                value: frozenVal,
                raw_value: pt.raw_value,
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
      if (!data.access_token) {
        showToast('Login failed: no access token received.', 'error');
        return false;
      }
      localStorage.setItem('ultron_token', data.access_token);
      localStorage.setItem('ultron_refresh', data.refresh_token);
      localStorage.setItem('ultron_user', data.username);
      localStorage.setItem('ultron_role', data.role);
      localStorage.setItem('ultron_allow_sm', data.allow_server_mgmt === undefined || data.allow_server_mgmt ? '1' : '0');
      setAuthToken(data.access_token);
      setCurrentUser(data.username);
      setCurrentUserRole(data.role);
      setAllowServerMgmt(data.allow_server_mgmt === undefined || data.allow_server_mgmt);

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
      const token = localStorage.getItem('ultron_token');
      if (token) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      }
    } catch (e) {
      // Ignore network errors on logout
    }
    localStorage.removeItem('ultron_token');
    localStorage.removeItem('ultron_refresh');
    localStorage.removeItem('ultron_user');
    localStorage.removeItem('ultron_role');
    localStorage.removeItem('ultron_allow_sm');
    setAuthToken(null);
    setCurrentUser(null);
    setCurrentUserRole(null);
    setAllowServerMgmt(true);
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

  // ─── Station REST methods (optimistic) ─────────────────────────────────────
  const addStation = async (payload) => {
    const tempId = Date.now();
    const optimistic = { id: tempId, ...payload };
    return optimisticAdd(
      `station:new`, setStations, optimistic,
      (signal) => authFetch(`${API_BASE}/stations/`, { method: 'POST', body: JSON.stringify(payload), signal }),
      async (res) => { const s = await res.json(); showToast('Station added successfully.'); return s; },
    );
  };

  const editStation = async (id, payload) => {
    return optimisticEdit(
      `station:${id}`, setStations, stations, id, 'id', payload,
      (signal) => authFetch(`${API_BASE}/stations/${id}`, { method: 'PATCH', body: JSON.stringify(payload), signal }),
      async (res) => { const updated = await res.json(); setStations(prev => prev.map(s => s.id === id ? updated : s)); showToast('Station updated successfully.'); },
    );
  };

  const deleteStation = async (id) => {
    return optimisticRemove(
      `station:${id}`, setStations, stations, id, 'id',
      (signal) => authFetch(`${API_BASE}/stations/${id}`, { method: 'DELETE', signal }),
      () => showToast('Station deleted.'),
    );
  };

  // ─── Device REST methods (optimistic) ──────────────────────────────────────
  const addDevice = async (payload) => {
    const tempId = Date.now();
    const optimistic = { id: tempId, ...payload };
    const result = await optimisticAdd(
      `device:new`, setDevices, optimistic,
      (signal) => authFetch(`${API_BASE}/devices/`, { method: 'POST', body: JSON.stringify(payload), signal }),
      async (res) => {
        const d = await res.json();
        showToast('Device added successfully.');
        // Refresh stations list
        authFetch(`${API_BASE}/stations/`).then(r => { if (r.ok) r.json().then(s => setStations(s)); }).catch(() => {});
        return d;
      },
    );
    return result;
  };

  const editDevice = async (id, payload) => {
    return optimisticEdit(
      `device:${id}`, setDevices, devices, id, 'id', payload,
      (signal) => authFetch(`${API_BASE}/devices/${id}`, { method: 'PATCH', body: JSON.stringify(payload), signal }),
      async (res) => {
        const updated = await res.json();
        setDevices(prev => prev.map(d => d.id == id ? updated : d));
        showToast('Device updated successfully.');
        // Refresh stations list
        authFetch(`${API_BASE}/stations/`).then(r => { if (r.ok) r.json().then(s => setStations(s)); }).catch(() => {});
      },
    );
  };

  const deleteDevice = async (id) => {
    return optimisticRemove(
      `device:${id}`, setDevices, devices, id, 'id',
      (signal) => authFetch(`${API_BASE}/devices/${id}`, { method: 'DELETE', signal }),
      () => showToast('Device deleted.'),
    );
  };

  // ─── Parameter REST methods (optimistic) ────────────────────────────────────
  const addParameter = async (payload) => {
    const tempId = Date.now();
    const optimistic = { id: tempId, ...payload };
    const result = await optimisticAdd(
      `param:new`, setParameters, optimistic,
      (signal) => authFetch(`${API_BASE}/parameters/`, { method: 'POST', body: JSON.stringify(payload), signal }),
      async (res) => { const p = await res.json(); showToast('Parameter mapped successfully.'); return p; },
    );
    return result;
  };

  const editParameter = async (id, payload) => {
    return optimisticEdit(
      `param:${id}`, setParameters, parameters, id, 'id', payload,
      (signal) => authFetch(`${API_BASE}/parameters/${id}`, { method: 'PATCH', body: JSON.stringify(payload), signal }),
      async (res) => { const updated = await res.json(); setParameters(prev => prev.map(p => p.id == id ? updated : p)); showToast('Parameter updated.'); },
    );
  };

  const deleteParameter = async (id) => {
    return optimisticRemove(
      `param:${id}`, setParameters, parameters, id, 'id',
      (signal) => authFetch(`${API_BASE}/parameters/${id}`, { method: 'DELETE', signal }),
      () => showToast('Parameter mapping deleted.'),
    );
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

  const refreshStations = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/stations/`);
      if (res.ok) {
        const data = await res.json();
        setStations(data || []);
        return data;
      }
    } catch (e) {
      console.error('[AppContext] Failed to refresh stations:', e);
    }
  }, [authFetch]);

  return (
    <AppContext.Provider value={{
      stations, refreshStations, devices, parameters, logs, liveData, kpis,
      activeScreen, setActiveScreen,
      currentUser, currentUserRole, allowServerMgmt, authToken, login, logout,
      usersList, loadUsers, addUser, editUser, deleteUser,
      addStation, editStation, deleteStation,
      addDevice, editDevice, deleteDevice,
      addParameter, editParameter, deleteParameter,
      testDeviceConnection, testParameterConnection,
      loadAllData, fetchLatestTelemetryAndKpis, prefetchScreen, showToast, API_BASE, WS_BASE, authFetch,
      plantName, plantAddress, plantLogo, saveLocalSettings, pendingStatus,
      loading, parseUtcDate, hasLoadedOnce,
      broadcasts, amcExpiry,
      isLicensed, setIsLicensed, lockStatus, setLockStatus, lockReason, setLockReason
    }}>
      <LiveDataContext.Provider value={{
        liveData, kpis,
        fetchLatestTelemetryAndKpis,
      }}>
        {children}
      </LiveDataContext.Provider>
    </AppContext.Provider>
  );
};
