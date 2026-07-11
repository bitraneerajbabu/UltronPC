import React, { useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, LineController, Filler } from 'chart.js';
import { T, GLASS_CARD, getParamState, getParamTheme } from '../theme';
import { Sparkline } from '../components/Sparkline';
import { AlarmsInspectorModal } from '../components/AlarmsInspectorModal';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, LineController, Filler);

const formatCurrentTime = () => {
  const date = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(date.getDate())}-${p(date.getMonth()+1)}-${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
};

const StationIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255,255,255,0.85)' }}>
    <path d="M22 22H2" />
    <path d="M17 22V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v17" />
  </svg>
);

const OnlineIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255,255,255,0.85)' }}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 11 2 2 4-4" />
  </svg>
);

const OfflineIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255,255,255,0.85)' }}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const AlarmIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255,255,255,0.85)' }}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9z" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const NetworkIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255,255,255,0.85)' }}>
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </svg>
);

// Isolated and optimized Parameter Card component
interface ParameterCardProps {
  p: any;
  data: any;
  currentTime: string;
  avgVal: any;
  history: any[];
  deviceName: string;
  isSelected: boolean;
  onClick: () => void;
}

const ParameterCard = React.memo(({ p, data, currentTime, avgVal, history, deviceName, isSelected, onClick }: ParameterCardProps) => {
  const isOffline = !data || data.status !== 'online';
  const valFloat = parseFloat(data?.value);
  const formattedVal = isOffline 
    ? 'N/A' 
    : (!isNaN(valFloat) 
        ? valFloat.toFixed(2)
        : '0.00');
  const displayTimestamp = isOffline ? (data?.timestamp && data?.timestamp !== '—' ? data.timestamp : '—') : currentTime;
  const state = getParamState(p, data);

  const avgFloat = parseFloat(avgVal);
  const formattedAvgVal = isOffline 
    ? 'N/A' 
    : (!isNaN(avgFloat) 
        ? avgFloat.toFixed(2)
        : '0.00');

  let formattedTimestamp = '—';
  if (displayTimestamp !== '—') {
    const parts = displayTimestamp.split(' ');
    if (parts.length === 2) {
      const dateParts = parts[0].split('-');
      if (dateParts.length === 3) {
        formattedTimestamp = `${dateParts[2]}:${dateParts[1]}:${dateParts[0]}  ${parts[1]}`;
      } else {
        formattedTimestamp = displayTimestamp;
      }
    } else {
      formattedTimestamp = displayTimestamp;
    }
  }
  const unit = p.unit || '';
  const limit = p.alarm_high !== null ? `>${p.alarm_high}` : '—';
  const range = `${p.min_valid !== null ? p.min_valid : '0'} - ${p.max_valid !== null ? p.max_valid : '1000'}`;

  // Get parameter-specific styling theme
  const paramTheme = getParamTheme(p.tag_name);

  // Dynamic status-blended sparkline and icon styling
  // Nominal states use parameter theme colors; warning/critical use their warning/danger states
  const isGood = state.cls === 'sensor-card-good';
  const sparklineColor = isGood ? paramTheme.color : state.dot;

  // Custom Icon based on tag name
  const renderIcon = () => {
    const name = (p.tag_name || '').toLowerCase();
    const strokeColor = paramTheme.color;
    
    if (name.includes('temp')) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
        </svg>
      );
    }
    if (name.includes('hum')) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
        </svg>
      );
    }
    if (name.includes('wind') || name.includes('ws') || name.includes('wd') || name.includes('speed') || name.includes('dir')) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
        </svg>
      );
    }
    if (name.includes('pm') || name.includes('co') || name.includes('so2') || name.includes('no') || name.includes('o3') || name.includes('dust') || name.includes('ozone')) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.5 19A3.5 3.5 0 0 0 21 15.5c0-2.79-2.54-4.5-5-4.5-.42-1.89-1.78-3.5-3.5-3.5a4.34 4.34 0 0 0-4 3c-2.42.36-4.5 2.21-4.5 4.5A3.5 3.5 0 0 0 7.5 19z"/>
        </svg>
      );
    }
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
      </svg>
    );
  };

  return (
    <div className={`sensor-card ${state.cls}`} onClick={onClick} style={{ 
      display: 'flex', flexDirection: 'column', padding: '20px', 
      borderRadius: '12px', 
      borderLeft: `5px solid ${isSelected ? paramTheme.color : (isGood ? paramTheme.border : state.dot)}`,
      borderTop: '1px solid rgba(235, 225, 205, 0.4)',
      borderRight: '1px solid rgba(235, 225, 205, 0.4)',
      borderBottom: '1px solid rgba(235, 225, 205, 0.4)',
      backgroundColor: 'rgba(252, 248, 238, 0.85)', 
      boxShadow: isSelected ? `0 4px 16px ${paramTheme.glow}` : '0 2px 10px rgba(0,0,0,0.02)',
      position: 'relative', cursor: 'pointer', transition: 'all 0.2s ease'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', backgroundColor: paramTheme.bg, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {renderIcon()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>{p.tag_name}</span>
            {deviceName && deviceName.trim().toLowerCase() !== 'global gateway' && (
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>{deviceName}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', backgroundColor: state.dot, borderRadius: '50%', boxShadow: `0 0 8px ${state.dot}` }}></span>
          <span style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{state.cls === 'alarm' ? 'ALARM' : (isOffline ? 'OFFLINE' : 'NOMINAL')}</span>
        </div>
      </div>

      {/* Main Value Block */}
      <div style={{ backgroundColor: 'rgba(245, 238, 224, 0.5)', borderRadius: '8px', padding: '16px', marginBottom: '16px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', fontFamily: T.fontMono, lineHeight: '1' }}>{formattedVal}</span>
        <span style={{ fontSize: '14px', fontWeight: '700', color: '#64748b' }}>{unit}</span>
      </div>

      {/* Details List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Average (15m):</span>
          <span style={{ fontSize: '12px', fontWeight: '800', color: '#10b981' }}>{formattedAvgVal} {unit}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Warning Limit:</span>
          <span style={{ fontSize: '12px', fontWeight: '800', color: '#ef4444' }}>{limit} {unit}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Parameter Range:</span>
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>{range} {unit}</span>
        </div>
      </div>

      {/* Sparkline Block */}
      <div style={{ backgroundColor: 'rgba(245, 238, 224, 0.5)', borderRadius: '8px', padding: '12px', marginBottom: '16px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
         <div style={{ position: 'absolute', top: '10px', left: '10%', right: '10%', borderTop: '1px dotted #ef4444', opacity: 0.4 }}></div>
         <div style={{ position: 'absolute', top: '20px', left: '10%', right: '10%', borderTop: '1px dotted #f97316', opacity: 0.4 }}></div>
         <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '10px' }}>
           <Sparkline data={history} color={sparklineColor} width={180} height={20} />
         </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
        <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Raw Feed: {data?.raw_value != null ? parseFloat(data.raw_value).toFixed(2) : formattedVal} {unit}</span>
        <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Received: <span style={{ color: '#475569', fontWeight: '700' }}>{formattedTimestamp}</span></span>
      </div>
    </div>
  );
});

export const DashboardScreen = () => {
  const { kpis, stations, devices, parameters, liveData, showToast, authFetch, API_BASE, parseUtcDate, fetchLatestTelemetryAndKpis, amcExpiry, broadcasts } = useContext(AppContext);
  const [selectedParam, setSelectedParam] = useState('');
  const [currentTime, setCurrentTime] = useState(formatCurrentTime());
  const [showAlarmsModal, setShowAlarmsModal] = useState(false);
  const [isTrendsModalOpen, setIsTrendsModalOpen] = useState(false);
  const [avg15Mins, setAvg15Mins] = useState({});
  const [networkInfo, setNetworkInfo] = useState<{ lan_ip: string; internet_connected: boolean; hostname: string } | null>(null);
  const [dismissedBroadcasts, setDismissedBroadcasts] = useState<Set<number>>(() => {
    const stored = localStorage.getItem('ultron_dismissed_broadcasts');
    return new Set<number>(stored ? JSON.parse(stored) : []);
  });

  // Poll latest telemetry every 5s, KPIs are pushed via WebSocket + cached on backend
  useEffect(() => {
    if (fetchLatestTelemetryAndKpis) {
      fetchLatestTelemetryAndKpis();
      const interval = setInterval(() => {
        fetchLatestTelemetryAndKpis();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [fetchLatestTelemetryAndKpis]);

  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const dataPointsRef = useRef({
    labels: [],
    datasets: {}
  });
  const lastTimestampRef = useRef('');

  // Fetch network info (PC IP + internet)
  const fetchNetworkInfo = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/settings/network-info`);
      if (res.ok) {
        const data = await res.json();
        setNetworkInfo(data);
      }
    } catch {
      // silently ignore
    }
  }, [authFetch, API_BASE]);

  useEffect(() => {
    fetchNetworkInfo();
    const interval = setInterval(fetchNetworkInfo, 30000);
    return () => clearInterval(interval);
  }, [fetchNetworkInfo]);

  // Keep clock running
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(formatCurrentTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetch15MinAverages = useCallback(async () => {
    if (!parameters || parameters.length === 0) return;
    try {
      const paramIds = parameters.map(p => p.id).join(',');
      // Use the trends/chart-data endpoint which correctly queries the Averages table
      const res = await authFetch(`${API_BASE}/trends/chart-data?parameter_ids=${paramIds}&avg_type=avg_15min&limit=1`);
      if (res.ok) {
        const data = await res.json();
        const mapping = {};
        const seriesList = data.series || [];
        seriesList.forEach(series => {
          if (series.values && series.values.length > 0) {
            const lastVal = series.values[series.values.length - 1];
            if (lastVal !== null && lastVal !== undefined) {
              mapping[series.parameter_id] = lastVal;
            }
          }
        });
        setAvg15Mins(mapping);
      }
    } catch (err) {
      console.error("Failed to fetch 15-minute averages:", err);
    }
  }, [parameters, authFetch, API_BASE]);

  useEffect(() => {
    fetch15MinAverages();
    const interval = setInterval(fetch15MinAverages, 30000);
    return () => clearInterval(interval);
  }, [fetch15MinAverages]);

  // Keep selectedParam in sync with available parameters
  useEffect(() => {
    if (parameters && parameters.length > 0) {
      if (!selectedParam || !parameters.some(p => p.tag_name === selectedParam)) {
        setSelectedParam(parameters[0].tag_name);
      }
    } else {
      setSelectedParam('');
    }
  }, [parameters, selectedParam]);

  // Load historical trend data and draw the chart ONLY when the modal is open.
  // The canvas element (chartRef) is conditionally rendered inside the modal,
  // so this effect must guard on isTrendsModalOpen to ensure chartRef.current exists.
  useEffect(() => {
    if (!isTrendsModalOpen) return;           // canvas not in DOM yet — skip
    if (!parameters || parameters.length === 0) return;

    let isMounted = true;

    const fetchHistoricalData = async () => {
      try {
        const paramIds = parameters.map(p => p.id).join(',');
        const res = await authFetch(`${API_BASE}/trends/chart-data?parameter_ids=${paramIds}&limit=20&avg_type=avg_1min`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        if (!isMounted) return;

        const labels = [];
        const datasets = {};
        
        parameters.forEach(p => {
          datasets[p.tag_name] = [];
        });

        const seriesList = data.series || [];
        let maxLabelsSeries = seriesList.reduce((max, s) => ((s.labels && s.labels.length) > (max.labels && max.labels.length) ? s : max), { labels: [] });
        
        if (maxLabelsSeries.labels && maxLabelsSeries.labels.length > 0) {
          maxLabelsSeries.labels.forEach(isoStr => {
            const dateVal = parseUtcDate(isoStr);
            const hourStr = `${String(dateVal.getHours()).padStart(2, '0')}:${String(dateVal.getMinutes()).padStart(2, '0')}`;
            labels.push(hourStr);
          });

          parameters.forEach(p => {
            const s = seriesList.find(ser => ser.parameter_id == p.id);
            if (s && s.values) {
              datasets[p.tag_name] = s.values.map(v => v !== null ? Number(parseFloat(v).toFixed(2)) : 0);
            } else {
              datasets[p.tag_name] = new Array(labels.length).fill(0);
            }
          });
        }

        dataPointsRef.current = { labels, datasets };

        const activeParam = selectedParam || parameters[0]?.tag_name;
        const activeParamObj = parameters.find(p => p.tag_name === activeParam);
        const activeSeries = activeParamObj ? seriesList.find(s => s.parameter_id == activeParamObj.id) : null;
        if (activeSeries && activeSeries.labels && activeSeries.labels.length > 0) {
          const lastLabel = activeSeries.labels[activeSeries.labels.length - 1];
          const parsed = parseUtcDate(lastLabel);
          const p = n => String(n).padStart(2, '0');
          const formattedLastGoodTs = `${p(parsed.getDate())}-${p(parsed.getMonth()+1)}-${parsed.getFullYear()} ${p(parsed.getHours())}:${p(parsed.getMinutes())}:${p(parsed.getSeconds())}`;
          lastTimestampRef.current = formattedLastGoodTs;
        } else {
          lastTimestampRef.current = '';
        }
        // Render Chart — canvas is guaranteed to be mounted because isTrendsModalOpen is true
        if (chartRef.current && activeParam) {
          if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
            chartInstanceRef.current = null;
          }

          const ctx = chartRef.current.getContext('2d');
          const paramObj = activeParamObj || {};
          const unit = paramObj.unit || '';
          
          const activeParamTheme = getParamTheme(activeParam);
          
          const limitLines: { value: number; color: string; label: string }[] = [];
          if (paramObj.alarm_high_high != null && !isNaN(Number(paramObj.alarm_high_high))) {
            limitLines.push({ value: Number(paramObj.alarm_high_high), color: '#ef4444', label: 'H/H' });
          }
          if (paramObj.alarm_high != null && !isNaN(Number(paramObj.alarm_high))) {
            limitLines.push({ value: Number(paramObj.alarm_high), color: '#f59e0b', label: 'High' });
          }
          if (paramObj.alarm_low != null && !isNaN(Number(paramObj.alarm_low))) {
            limitLines.push({ value: Number(paramObj.alarm_low), color: '#f59e0b', label: 'Low' });
          }
          if (paramObj.alarm_low_low != null && !isNaN(Number(paramObj.alarm_low_low))) {
            limitLines.push({ value: Number(paramObj.alarm_low_low), color: '#ef4444', label: 'L/L' });
          }

          const maxLimit = limitLines.length > 0 ? Math.max(...limitLines.map(ll => ll.value)) : undefined;
          const minLimit = limitLines.length > 0 ? Math.min(...limitLines.map(ll => ll.value)) : undefined;

          chartInstanceRef.current = new ChartJS(ctx, {
            type: 'line',
            data: {
              labels: dataPointsRef.current.labels,
              datasets: [{
                label: `${paramObj.name || activeParam} (${unit})`,
                data: dataPointsRef.current.datasets[activeParam] || [],
                borderColor: activeParamTheme.color,
                backgroundColor: activeParamTheme.glow,
                fill: true,
                tension: 0.35,
                pointBackgroundColor: activeParamTheme.color,
                pointBorderColor: '#fff',
                pointRadius: 3,
                pointHoverRadius: 6
              }]
            },
            options: {
              responsive: true,
              animation: { duration: 400 },
              plugins: {
                legend: {
                  labels: {
                    color: T.textMuted,
                    font: { weight: 600, family: T.fontBase }
                  }
                }
              },
              scales: {
                x: { ticks: { color: T.textFaint, font: { size: 11 } }, grid: { color: '#f1f5f9' } },
                y: { 
                  ticks: { color: T.textFaint, font: { size: 11 } }, 
                  grid: { color: '#f1f5f9' },
                  suggestedMax: maxLimit !== undefined ? maxLimit * 1.1 : undefined,
                  suggestedMin: minLimit !== undefined ? Math.min(0, minLimit * 0.9) : 0
                }
              }
            },
            plugins: [{
              id: 'limitLines',
              afterDraw(chart) {
                const yScale = chart.scales.y;
                const ctx2 = chart.ctx;
                limitLines.forEach(ll => {
                  const y = yScale.getPixelForValue(ll.value);
                  if (y < 0 || y > chart.height) return;
                  ctx2.save();
                  ctx2.beginPath();
                  ctx2.setLineDash([5, 4]);
                  ctx2.strokeStyle = ll.color;
                  ctx2.lineWidth = 1.5;
                  ctx2.moveTo(chart.chartArea.left, y);
                  ctx2.lineTo(chart.chartArea.right, y);
                  ctx2.stroke();
                  ctx2.setLineDash([]);
                  ctx2.fillStyle = ll.color;
                  ctx2.font = '10px sans-serif';
                  ctx2.textAlign = 'right';
                  ctx2.fillText(`${ll.label} (${ll.value})`, chart.chartArea.right - 5, y - 4);
                  ctx2.restore();
                });
              }
            }]
          });
        }
      } catch (err) {
        console.error("Failed to load historical trend data:", err);
      }
    };

    fetchHistoricalData();

    return () => {
      isMounted = false;
      // Destroy the chart when the modal closes or deps change,
      // so Chart.js doesn't complain about a canvas already in use on re-open.
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [parameters, selectedParam, authFetch, API_BASE, isTrendsModalOpen]);


  // Update chart when liveData receives a push
  useEffect(() => {
    if (!chartInstanceRef.current || !parameters || parameters.length === 0 || !selectedParam) return;

    const currentData = liveData[selectedParam];
    if (!currentData || !currentData.timestamp || currentData.timestamp === '—') return;

    const currentVal = parseFloat(currentData.value);
    if (isNaN(currentVal)) return;

    if (currentData.timestamp === lastTimestampRef.current) {
      return;
    }
    lastTimestampRef.current = currentData.timestamp;

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const presentTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    if (!dataPointsRef.current.labels) {
      dataPointsRef.current.labels = [];
    }
    
    const labelsCount = dataPointsRef.current.labels.length;
    if (labelsCount > 0 && dataPointsRef.current.labels[labelsCount - 1] === presentTimeStr) {
      parameters.forEach(p => {
        if (!dataPointsRef.current.datasets[p.tag_name]) {
          dataPointsRef.current.datasets[p.tag_name] = [];
        }
        const val = parseFloat(liveData[p.tag_name]?.value) || 0;
        dataPointsRef.current.datasets[p.tag_name][labelsCount - 1] = Number(val.toFixed(2));
      });
    } else {
      dataPointsRef.current.labels.push(presentTimeStr);
      if (dataPointsRef.current.labels.length > 20) {
        dataPointsRef.current.labels.shift();
      }

      parameters.forEach(p => {
        if (!dataPointsRef.current.datasets[p.tag_name]) {
          dataPointsRef.current.datasets[p.tag_name] = [];
        }
        const val = parseFloat(liveData[p.tag_name]?.value) || 0;
        dataPointsRef.current.datasets[p.tag_name].push(Number(val.toFixed(2)));
        if (dataPointsRef.current.datasets[p.tag_name].length > 20) {
          dataPointsRef.current.datasets[p.tag_name].shift();
        }
      });
    }

    const currentParamObj = parameters.find(p => p.tag_name === selectedParam) || {};
    const unit = currentParamObj.unit || '';
    const activeParamTheme = getParamTheme(selectedParam);
    
    chartInstanceRef.current.data.labels = dataPointsRef.current.labels;
    chartInstanceRef.current.data.datasets[0].label = `${currentParamObj.name || selectedParam} (${unit})`;
    chartInstanceRef.current.data.datasets[0].data = dataPointsRef.current.datasets[selectedParam] || [];
    chartInstanceRef.current.data.datasets[0].borderColor = activeParamTheme.color;
    chartInstanceRef.current.data.datasets[0].backgroundColor = activeParamTheme.glow;
    chartInstanceRef.current.data.datasets[0].pointBackgroundColor = activeParamTheme.color;
    chartInstanceRef.current.update('none');

  }, [liveData, selectedParam, parameters]);

  const handleParamChange = (e) => {
    setSelectedParam(e.target.value);
  };

  const downloadPNG = () => {
    if (!chartInstanceRef.current) return;
    const url = chartInstanceRef.current.toBase64Image();
    const a = document.createElement('a');
    a.href = url;
    a.download = `LiveTrend_${selectedParam}_${Date.now()}.png`;
    a.click();
    showToast('Live trend image exported as PNG.');
  };

  const downloadPDF = () => {
    if (!chartInstanceRef.current) return;
    const img = chartInstanceRef.current.toBase64Image();
    const html = [
      '<html><head><style>body{margin:20px;font-family:sans-serif}img{width:100%;border:1px solid #cbd5e1;border-radius:8px}</style></head>',
      `<body><h2>Live Trend — ${selectedParam}</h2><img src="${img}" />`,
      '<script>window.onload=function(){window.print();setTimeout(function(){window.close()},800)};<\/script>',
      '</body></html>'
    ].join('');
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(() => {
      document.body.removeChild(iframe);
      URL.revokeObjectURL(url);
    }, 60000);
    showToast('PDF print dialog opened.');
  };

  // Performance memoizations
  const groupedBySensor = useMemo(() => {
    const grouped = {};
    const assignedParams = parameters.filter(p => devices.some(d => d.id == p.device_id));
    assignedParams.forEach(p => {
      const device = devices.find(d => d.id == p.device_id);
      const station = stations.find(s => s.id == device?.station_id);
      const key = station?.name || p.description || '—';
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(p);
    });
    return grouped;
  }, [parameters, devices, stations]);

  const unassignedParameters = useMemo(() => {
    return parameters.filter(p => !devices.some(d => d.id == p.device_id));
  }, [devices, parameters]);

  // AMC expiry warning (45 days early)
  const amcWarning = (() => {
    if (!amcExpiry) return null;
    try {
      const expiry = new Date(amcExpiry);
      const now = new Date();
      const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) return { msg: `AMC has expired! Please renew immediately.`, severity: 'critical' };
      if (diffDays <= 45) return { msg: `AMC expires in ${diffDays} day${diffDays === 1 ? '' : 's'} (${amcExpiry}). Contact Neeraj for renewal.`, severity: 'warn' };
    } catch {}
    return null;
  })();

  const isEmpty = !parameters || parameters.length === 0;

  return (
    <div className="screen active" id="dashboardScreen">
      
      {/* AMC Warning Banner */}
      {amcWarning && (
        <div style={{ padding: '12px 20px', marginBottom: '16px', background: amcWarning.severity === 'critical' ? '#fef2f2' : '#fffbeb', border: `1px solid ${amcWarning.severity === 'critical' ? '#fecaca' : '#fde68a'}`, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>{amcWarning.severity === 'critical' ? '🚨' : '⚠️'}</span>
          <span style={{ fontSize: '13px', fontWeight: '600', color: amcWarning.severity === 'critical' ? '#991b1b' : '#92400e', flex: 1 }}>{amcWarning.msg}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="card">
        <div className="section-title">System Summary</div>
        <div className="grid-5">
          <div className="kpi-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Total Stations</span>
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f766e, #14b8a6)' }}>
                <StationIcon />
              </div>
            </div>
            <div style={{ fontSize: '30px', fontWeight: '800', color: '#0f172a', fontFamily: T.fontMono, lineHeight: '1.15', letterSpacing: '-0.03em' }}>
              {String(kpis.totalStations).padStart(2, '0')}
            </div>
          </div>

          <div className="kpi-card kpi-green">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Online Parameters</span>
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #059669, #10b981)' }}>
                <OnlineIcon />
              </div>
            </div>
            <div style={{ fontSize: '30px', fontWeight: '800', color: '#0f172a', fontFamily: T.fontMono, lineHeight: '1.15', letterSpacing: '-0.03em' }}>
              {String(kpis.onlineDevices).padStart(2, '0')}
            </div>
          </div>

          <div className="kpi-card kpi-red">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Offline Parameters</span>
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #dc2626, #ef4444)' }}>
                <OfflineIcon />
              </div>
            </div>
            <div style={{ fontSize: '30px', fontWeight: '800', color: '#0f172a', fontFamily: T.fontMono, lineHeight: '1.15', letterSpacing: '-0.03em' }}>
              {String(kpis.offlineDevices).padStart(2, '0')}
            </div>
          </div>

          <div className="kpi-card kpi-amber" onClick={() => setShowAlarmsModal(true)} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Active Alarms</span>
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #b45309, #f59e0b)' }}>
                <AlarmIcon />
              </div>
            </div>
            <div style={{ fontSize: '30px', fontWeight: '800', color: '#0f172a', fontFamily: T.fontMono, lineHeight: '1.15', letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {String(kpis.activeAlarms).padStart(2, '0')}
              {kpis.activeAlarms > 0 && (
                <span style={{ width: '7px', height: '7px', background: '#ef4444', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 8px #ef4444' }}></span>
              )}
            </div>
          </div>

          <div className="kpi-card kpi-blue">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>PC Network</span>
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0369a1, #38bdf8)' }}>
                <NetworkIcon />
              </div>
            </div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', fontFamily: T.fontMono, lineHeight: '1.15', marginBottom: '4px' }}>
              {networkInfo?.lan_ip || '---'}
            </div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block', backgroundColor: networkInfo?.internet_connected ? '#10b981' : '#ef4444', boxShadow: networkInfo?.internet_connected ? '0 0 6px #10b981' : '0 0 6px #ef4444' }}></span>
                {networkInfo === null ? '...' : networkInfo.internet_connected ? 'Online' : 'Offline'}
              </span>
              {networkInfo?.hostname && <span>{networkInfo.hostname}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Body — conditional: empty state vs live telemetry */}
      {isEmpty ? (
        <div className="card" style={{ padding: '40px 20px', textAlign: 'center', ...GLASS_CARD, boxShadow: T.shadowSm }}>
          <div style={{ fontSize: '18px', fontWeight: '600', color: T.textLabel, marginBottom: '10px' }}>
            No mapped parameters found.
          </div>
          <div style={{ color: T.textFaint, fontSize: '14px' }}>
            Please configure your station, devices, and map parameters in the Parameter Mapping screen to start viewing live telemetry.
          </div>
        </div>
      ) : (
        <>
          {/* Live Trends Modal */}
          {isTrendsModalOpen && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(13, 79, 73, 0.6)', backdropFilter: 'blur(4px)',
              zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            }} onClick={() => setIsTrendsModalOpen(false)}>
              <div style={{
                backgroundColor: 'rgba(253, 250, 242, 0.95)', backdropFilter: 'blur(25px)', WebkitBackdropFilter: 'blur(25px)',
                border: '1px solid rgba(235, 225, 205, 0.9)',
                borderRadius: '16px', width: '100%', maxWidth: '900px',
                padding: '24px', boxShadow: T.shadowLg, position: 'relative'
              }} onClick={e => e.stopPropagation()}>
                <button onClick={() => setIsTrendsModalOpen(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: T.textFaint }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div className="section-title" style={{ margin: 0, fontSize: '20px' }}>Live Trends</div>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', paddingRight: '32px' }}>
                    <select value={selectedParam} onChange={handleParamChange} style={{ padding: '8px 16px', borderRadius: '8px', border: `1.5px solid ${T.borderSoft}`, fontSize: '14px', fontWeight: '700', color: T.text, backgroundColor: '#f8fafc', outline: 'none', cursor: 'pointer' }}>
                      {parameters.map(p => <option key={p.id} value={p.tag_name}>{p.name || p.tag_name}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={downloadPNG} style={{ background: '#f8fafc', border: `1px solid ${T.borderSoft}`, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: T.textMuted, fontWeight: '700' }}>PNG</button>
                      <button onClick={downloadPDF} style={{ background: '#f8fafc', border: `1px solid ${T.borderSoft}`, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: T.textMuted, fontWeight: '700' }}>PDF</button>

                    </div>
                  </div>
                </div>
                <div style={{ position: 'relative', width: '100%', minHeight: '350px' }}>
                  <canvas ref={chartRef}></canvas>
                </div>
              </div>
            </div>
          )}

          {/* Sensor telemetry Grid */}
          <div className="card">
            <div className="section-title">Live Parameters</div>
            {Object.entries(groupedBySensor).map(([sensorName, params]) => (
              <div key={sensorName} style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${T.borderSoft}`, paddingBottom: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '800', color: T.primary, background: T.primaryBg, padding: '2px 10px', borderRadius: T.rFull, letterSpacing: '0.03em' }}>
                    {sensorName}
                  </span>
                </div>
                <div className="grid-4">
                  {(params as any[]).map(p => (
                    <ParameterCard key={p.id} p={p} data={liveData[p.tag_name]} currentTime={currentTime} avgVal={avg15Mins[p.id]} history={dataPointsRef.current.datasets[p.tag_name] || []} deviceName="" isSelected={selectedParam === p.tag_name} onClick={() => { setSelectedParam(p.tag_name); setIsTrendsModalOpen(true); }} />
                  ))}
                </div>
              </div>
            ))}
            {unassignedParameters.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: T.textLabel, marginBottom: '12px', borderBottom: '1px solid rgba(100, 116, 139, 0.15)', paddingBottom: '6px' }}>
                  Unassigned Parameters
                </div>
                <div className="grid-4">
                  {unassignedParameters.map(p => (
                    <ParameterCard key={p.id} p={p} data={liveData[p.tag_name]} currentTime={currentTime} avgVal={avg15Mins[p.id]} history={dataPointsRef.current.datasets[p.tag_name] || []} deviceName="Unassigned" isSelected={selectedParam === p.tag_name} onClick={() => { setSelectedParam(p.tag_name); setIsTrendsModalOpen(true); }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <AlarmsInspectorModal isOpen={showAlarmsModal} onClose={() => setShowAlarmsModal(false)} />

      {broadcasts && broadcasts.length > 0 && localStorage.getItem('ultron_broadcast_enabled') !== 'false' && (() => {
        const visible = (broadcasts as any[]).find((b: any) => !dismissedBroadcasts.has(b.id));
        if (!visible) return null;
        const sev = visible.severity || 'info';
        const colors: Record<string,any> = {
          critical: { bg: '#fef2f2', border: '#fecaca', icon: '🚨', title: '#991b1b', text: '#7f1d1d', label: 'Critical Broadcast' },
          warn:     { bg: '#fffbeb', border: '#fde68a', icon: '⚠️',  title: '#92400e', text: '#78350f', label: 'Warning Broadcast' },
          info:     { bg: '#eff6ff', border: '#bfdbfe', icon: 'ℹ️',  title: '#1e40af', text: '#1e3a5f', label: 'Broadcast Message' },
        };
        const c = colors[sev] || colors.info;
        const dismiss = () => {
          const next = new Set(dismissedBroadcasts);
          next.add(visible.id);
          setDismissedBroadcasts(next);
          localStorage.setItem('ultron_dismissed_broadcasts', JSON.stringify([...next]));
        };
        return (
          <div style={{ position: 'fixed', bottom: '80px', right: '24px', zIndex: 9999, maxWidth: '400px', padding: '16px 20px', background: c.bg, border: `1px solid ${c.border}`, borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <span style={{ fontSize: '24px', flexShrink: 0 }}>{c.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: c.title, marginBottom: '4px' }}>{c.label}</div>
              <div style={{ fontSize: '12px', color: c.text }}>{visible.message}</div>
            </div>
            <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: c.title, padding: '0 0 0 8px', lineHeight: 1 }}>×</button>
          </div>
        );
      })()}

    </div>
  );
};
