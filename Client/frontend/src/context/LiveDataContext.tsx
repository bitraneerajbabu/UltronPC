import React, { createContext, useState, useCallback, useRef } from 'react';

export const LiveDataContext = createContext(null);

export const LiveDataProvider = ({ children, authFetch, API_BASE, parametersRef }) => {
  const [liveData, setLiveData] = useState({});
  const [kpis, setKpis] = useState({
    totalStations: 0,
    onlineDevices: 0,
    offlineDevices: 0,
    activeAlarms: 0,
  });
  const wsKpiLastFetch = useRef(0);

  const formatTimestamp = (date) => {
    const p = n => String(n).padStart(2, '0');
    return `${p(date.getDate())}-${p(date.getMonth()+1)}-${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
  };

  const parseUtcDate = (dateStr) => {
    if (!dateStr || dateStr === '—') return new Date();
    if (dateStr instanceof Date) return dateStr;
    let cleanStr = String(dateStr).trim();
    if (!cleanStr.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(cleanStr)) {
      if (!cleanStr.includes('T')) cleanStr = cleanStr.replace(' ', 'T');
      cleanStr += 'Z';
    }
    return new Date(cleanStr);
  };

  const fetchLatestTelemetryAndKpis = useCallback(async (paramsList = null) => {
    try {
      const [telRes, kpiRes] = await Promise.all([
        authFetch(`${API_BASE}/telemetry/latest`),
        authFetch(`${API_BASE}/telemetry/dashboard-summary`),
      ]);

      if (telRes.ok) {
        const telemetryData = await telRes.json();
        const activeParams = paramsList || parametersRef?.current || [];
        setLiveData(prev => {
          const newLiveData = { ...prev };
          telemetryData.forEach(p => {
            const param = activeParams.find(paramObj => paramObj.id == p.parameter_id);
            if (param) {
              const prevPt = prev[param.tag_name];
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
      console.error('[LiveData] Failed to fetch telemetry/KPIs:', err);
    }
  }, [authFetch, API_BASE, parametersRef]);

  // Called by WebSocket handler in AppContext — updates liveData inline without full fetch
  const updateLiveDataFromWs = useCallback((points) => {
    setLiveData(prev => {
      const next = { ...prev };
      points.forEach(pt => {
        const isOnline = pt.quality === 'good' || pt.quality === 'out_of_range' || pt.quality === 'uncertain' || pt.quality === 'U' || pt.quality === 'O' || pt.quality === 'N';
        const prevPoint = prev[pt.tag_name];
        let ts = formatTimestamp(parseUtcDate(pt.timestamp));
        if (!isOnline && prevPoint && prevPoint.timestamp) ts = prevPoint.timestamp;
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
  }, []);

  const refreshKpisFromWs = useCallback(async () => {
    const now = Date.now();
    if (now - wsKpiLastFetch.current > 30000) {
      wsKpiLastFetch.current = now;
      try {
        const res = await authFetch(`${API_BASE}/telemetry/dashboard-summary`);
        if (res.ok) {
          const kpisData = await res.json();
          setKpis({
            totalStations: kpisData.total_stations || 0,
            onlineDevices: kpisData.online_stations || 0,
            offlineDevices: kpisData.offline_stations || 0,
            activeAlarms: kpisData.active_alarms || 0,
          });
        }
      } catch {}
    }
  }, [authFetch, API_BASE]);

  return (
    <LiveDataContext.Provider value={{
      liveData, kpis, setLiveData, setKpis,
      fetchLatestTelemetryAndKpis,
      updateLiveDataFromWs,
      refreshKpisFromWs,
    }}>
      {children}
    </LiveDataContext.Provider>
  );
};
