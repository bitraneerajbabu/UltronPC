import React, { useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, LineController, Filler } from 'chart.js';
import { T, GLASS_CARD, getParamState } from '../theme';
import { Sparkline } from '../components/Sparkline';
import { AlarmsInspectorModal } from '../components/AlarmsInspectorModal';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, LineController, Filler);

const formatCurrentTime = () => {
  const date = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(date.getDate())}-${p(date.getMonth()+1)}-${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
};

const StackIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: T.primaryLight }}>
    <path d="M2 22h20" />
    <path d="M17 22l-2-12h-6l-2 12" />
    <path d="M11 10h2" />
    <path d="M10 14h4" />
    <path d="M9 18h6" />
    <path d="M12 7c.2-.8.8-.8 1 0s.8.8 1 0" />
    <path d="M10 5c.2-.8.8-.8 1 0s.8.8 1 0" />
  </svg>
);

const getTimeAgo = (timestampStr, currentTimeStr) => {
  if (!timestampStr || timestampStr === '—') return '—';
  try {
    const parts = timestampStr.split(' ');
    const dateParts = parts[0].split('-');
    const timeParts = parts[1].split(':');
    const tsDate = new Date(
      parseInt(dateParts[2]),
      parseInt(dateParts[1]) - 1,
      parseInt(dateParts[0]),
      parseInt(timeParts[0]),
      parseInt(timeParts[1]),
      parseInt(timeParts[2])
    );
    const diffMs = Date.now() - tsDate.getTime();
    if (isNaN(diffMs) || diffMs < 0) return 'Just now';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec} seconds ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} minutes ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} hours ago`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay} days ago`;
  } catch (e) {
    return '—';
  }
};

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
  const formattedVal = isOffline 
    ? 'N/A' 
    : (!isNaN(parseFloat(data.value)) 
        ? parseFloat(data.value).toFixed(p.tag_name === 'CO' ? 2 : (p.tag_name === 'Temperature' || p.tag_name === 'Humidity') ? 1 : 2)
        : '0.00');
  const displayTimestamp = isOffline ? (data?.timestamp && data?.timestamp !== '—' ? data.timestamp : '—') : currentTime;
  const state = getParamState(p, data);

  const formattedAvgVal = isOffline 
    ? 'N/A' 
    : (!isNaN(parseFloat(avgVal)) 
        ? parseFloat(avgVal).toFixed(p.tag_name === 'CO' ? 2 : (p.tag_name === 'Temperature' || p.tag_name === 'Humidity') ? 1 : 2)
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

  const SensorIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#475569' }}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  );

  return (
    <div className={`sensor-card ${state.cls}`} onClick={onClick} style={{ 
      display: 'flex', flexDirection: 'column', padding: '20px', 
      borderRadius: '12px', border: isSelected ? '2px solid #0f766e' : `1px solid ${state.dot}`, 
      backgroundColor: '#fff', boxShadow: isSelected ? '0 4px 12px rgba(15,118,110,0.15)' : '0 2px 10px rgba(0,0,0,0.02)',
      position: 'relative', cursor: 'pointer', transition: 'all 0.2s ease'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', backgroundColor: '#f8fafc', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SensorIcon />
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
      <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '16px', marginBottom: '16px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
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
      <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '12px', marginBottom: '16px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
         <div style={{ position: 'absolute', top: '10px', left: '10%', right: '10%', borderTop: '1px dotted #ef4444', opacity: 0.4 }}></div>
         <div style={{ position: 'absolute', top: '20px', left: '10%', right: '10%', borderTop: '1px dotted #f97316', opacity: 0.4 }}></div>
         <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '10px' }}>
           <Sparkline data={history} color={state.dot} width={180} height={20} />
         </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
        <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Raw Feed: {formattedVal} {unit}</span>
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
  const [dismissedBroadcast, setDismissedBroadcast] = useState<number | null>(null);

  // Poll latest telemetry and KPIs every 5 seconds for dashboard updates
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
            const s = seriesList.find(ser => ser.parameter_id === p.id);
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
        const activeSeries = activeParamObj ? seriesList.find(s => s.parameter_id === activeParamObj.id) : null;
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
          const paramObj = parameters.find(p => p.tag_name === activeParam) || {};
          const unit = paramObj.unit || '';
          
          chartInstanceRef.current = new ChartJS(ctx, {
            type: 'line',
            data: {
              labels: dataPointsRef.current.labels,
              datasets: [{
                label: `${paramObj.name || activeParam} (${unit})`,
                data: dataPointsRef.current.datasets[activeParam] || [],
                borderColor: T.primary,
                backgroundColor: 'rgba(15,118,110,0.07)',
                fill: true,
                tension: 0.35,
                pointBackgroundColor: T.primary,
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
                y: { ticks: { color: T.textFaint, font: { size: 11 } }, grid: { color: '#f1f5f9' } }
              }
            }
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
    chartInstanceRef.current.data.labels = dataPointsRef.current.labels;
    chartInstanceRef.current.data.datasets[0].label = `${currentParamObj.name || selectedParam} (${unit})`;
    chartInstanceRef.current.data.datasets[0].data = dataPointsRef.current.datasets[selectedParam] || [];
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

  const exportCSV = () => {
    if (!selectedParam || !dataPointsRef.current.datasets[selectedParam]) return;
    const rows = [['Timestamp', 'Parameter', 'Value', 'Unit']];
    const currentParamObj = parameters.find(p => p.tag_name === selectedParam) || {};
    const unit = currentParamObj.unit || '';
    
    dataPointsRef.current.labels.forEach((ts, idx) => {
      const val = dataPointsRef.current.datasets[selectedParam][idx];
      rows.push([ts, selectedParam, val, unit]);
    });

    const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `LiveTrend_${selectedParam}_${Date.now()}.csv`;
    a.click();
    showToast('Live trend telemetry exported to CSV.');
  };

  const exportExcel = () => {
    if (!selectedParam || !dataPointsRef.current.datasets[selectedParam]) return;
    const rows = [['Timestamp', 'Parameter', 'Value', 'Unit']];
    const currentParamObj = parameters.find(p => p.tag_name === selectedParam) || {};
    const unit = currentParamObj.unit || '';

    dataPointsRef.current.labels.forEach((ts, idx) => {
      const val = dataPointsRef.current.datasets[selectedParam][idx];
      rows.push([ts, selectedParam, val !== undefined ? val : '', unit]);
    });

    const tsvContent = rows.map(r => r.join('\t')).join('\n');
    const blob = new Blob([tsvContent], { type: 'application/vnd.ms-excel' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `LiveTrend_${selectedParam}_${Date.now()}.xls`;
    a.click();
    showToast('Live trend telemetry exported to Excel.');
  };

  // Performance memoizations
  const groupedParametersByStation = useMemo(() => {
    const grouped = {};
    parameters.forEach(p => {
      const device = devices.find(d => d.id === p.device_id);
      const stationId = device ? (device.station_id || 'unassigned') : 'unassigned';
      if (!grouped[stationId]) {
        grouped[stationId] = [];
      }
      grouped[stationId].push({
        ...p,
        deviceName: device ? device.name : 'Unknown'
      });
    });
    return grouped;
  }, [devices, parameters]);

  const unassignedParameters = useMemo(() => {
    return parameters.filter(p => !devices.some(d => d.id === p.device_id));
  }, [devices, parameters]);

  // AMC expiry warning (45 days early)
  const amcWarning = (() => {
    if (!amcExpiry) return null;
    try {
      const expiry = new Date(amcExpiry);
      const now = new Date();
      const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) return { msg: `AMC has expired! Please renew immediately.`, severity: 'critical' };
      if (diffDays <= 45) return { msg: `AMC expires in ${diffDays} day${diffDays === 1 ? '' : 's'} (${amcExpiry}). Contact Sunshine Technologies for renewal.`, severity: 'warn' };
    } catch {}
    return null;
  })();

  if (!parameters || parameters.length === 0) {
    return (
      <div className="screen active" id="dashboardScreen">
        
        {/* AMC Warning Banner */}
        {amcWarning && (
          <div className="card" style={{ padding: '12px 20px', marginBottom: '16px', background: amcWarning.severity === 'critical' ? '#fef2f2' : '#fffbeb', border: `1px solid ${amcWarning.severity === 'critical' ? '#fecaca' : '#fde68a'}`, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>{amcWarning.severity === 'critical' ? '🚨' : '⚠️'}</span>
            <span style={{ fontSize: '13px', fontWeight: '600', color: amcWarning.severity === 'critical' ? '#991b1b' : '#92400e', flex: 1 }}>{amcWarning.msg}</span>
          </div>
        )}

        {/* KPI Cards */}
        <div className="card">
          <div className="section-title">System Summary</div>
          <div className="grid-5">
            <div className="kpi-card" style={{ ...GLASS_CARD, padding: '16px 20px', boxShadow: T.shadowSm, borderLeft: `4px solid ${T.primary}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Stations</div>
                <div style={{ fontSize: '26px', fontWeight: '800', color: T.text, marginTop: '4px', fontFamily: T.fontMono }}>
                  {String(kpis.totalStations).padStart(2, '0')}
                </div>
              </div>
            </div>

            <div className="kpi-card" style={{ ...GLASS_CARD, padding: '16px 20px', boxShadow: T.shadowSm, borderLeft: `4px solid ${T.success}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Online Parameters</div>
                <div style={{ fontSize: '26px', fontWeight: '800', color: T.success, marginTop: '4px', fontFamily: T.fontMono }}>
                  {String(kpis.onlineDevices).padStart(2, '0')}
                </div>
              </div>
            </div>

            <div className="kpi-card" style={{ ...GLASS_CARD, padding: '16px 20px', boxShadow: T.shadowSm, borderLeft: `4px solid ${T.danger}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Offline Parameters</div>
                <div style={{ fontSize: '26px', fontWeight: '800', color: T.danger, marginTop: '4px', fontFamily: T.fontMono }}>
                  {String(kpis.offlineDevices).padStart(2, '0')}
                </div>
              </div>
            </div>

            <div className="kpi-card" onClick={() => setShowAlarmsModal(true)} style={{
              ...GLASS_CARD,
              padding: '16px 20px',
              boxShadow: T.shadowSm,
              borderLeft: `4px solid ${kpis.activeAlarms > 0 ? T.danger : T.primary}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer'
            }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Alarms</div>
                <div style={{ fontSize: '26px', fontWeight: '800', color: kpis.activeAlarms > 0 ? T.danger : T.text, marginTop: '4px', fontFamily: T.fontMono, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {String(kpis.activeAlarms).padStart(2, '0')}
                </div>
              </div>
            </div>

            <div className="kpi-card" style={{ ...GLASS_CARD, padding: '16px 20px', boxShadow: T.shadowSm, borderLeft: `4px solid ${T.info}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ width: '100%' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>PC Network</div>
                <div style={{ fontSize: '13px', fontWeight: '800', color: T.text, fontFamily: T.fontMono, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{networkInfo?.lan_ip || '---'}</span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '10px', fontWeight: '700', textTransform: 'uppercase',
                    color: networkInfo?.internet_connected ? T.success : T.danger
                  }}>
                    <span style={{
                      width: '7px', height: '7px', borderRadius: '50%',
                      backgroundColor: networkInfo?.internet_connected ? T.success : T.danger,
                      boxShadow: networkInfo?.internet_connected ? `0 0 6px ${T.success}` : `0 0 6px ${T.danger}`,
                      display: 'inline-block'
                    }}></span>
                    {networkInfo === null ? '...' : networkInfo.internet_connected ? 'Online' : 'Offline'}
                  </span>
                </div>
                {networkInfo?.hostname && (
                  <div style={{ fontSize: '10px', fontWeight: '600', color: T.textFaint, marginTop: '4px' }}>
                    {networkInfo.hostname}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* No Mapped Parameters Message */}
        <div className="card" style={{ padding: '40px 20px', textAlign: 'center', ...GLASS_CARD, boxShadow: T.shadowSm }}>
          <div style={{ fontSize: '18px', fontWeight: '600', color: T.textLabel, marginBottom: '10px' }}>
            No mapped parameters found.
          </div>
          <div style={{ color: T.textFaint, fontSize: '14px' }}>
            Please configure your station, devices, and map parameters in the Parameter Mapping screen to start viewing live telemetry.
          </div>
        </div>

        <AlarmsInspectorModal isOpen={showAlarmsModal} onClose={() => setShowAlarmsModal(false)} />

        {broadcasts && broadcasts.length > 0 && (() => {
          const critical = broadcasts.find((b: any) => b.severity === 'critical' && b.id !== dismissedBroadcast);
          if (!critical) return null;
          return (
            <div style={{
              position: 'fixed', bottom: '80px', right: '24px', zIndex: 9999,
              maxWidth: '400px', padding: '16px 20px',
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
              display: 'flex', alignItems: 'flex-start', gap: '12px',
            }}>
              <span style={{ fontSize: '24px', flexShrink: 0 }}>🚨</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#991b1b', marginBottom: '4px' }}>Broadcast Message</div>
                <div style={{ fontSize: '12px', color: '#7f1d1d' }}>{critical.message}</div>
              </div>
              <button onClick={() => setDismissedBroadcast(critical.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '18px', color: '#991b1b', padding: '0 0 0 8px', lineHeight: 1
              }}>×</button>
            </div>
          );
        })()}

      </div>
    );
  }

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
          <div className="kpi-card" style={{ ...GLASS_CARD, padding: '16px 20px', boxShadow: T.shadowSm, borderLeft: `4px solid ${T.primary}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Stations</div>
              <div style={{ fontSize: '26px', fontWeight: '800', color: T.text, marginTop: '4px', fontFamily: T.fontMono }}>
                {String(kpis.totalStations).padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="kpi-card" style={{ ...GLASS_CARD, padding: '16px 20px', boxShadow: T.shadowSm, borderLeft: `4px solid ${T.success}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Online Parameters</div>
              <div style={{ fontSize: '26px', fontWeight: '800', color: T.success, marginTop: '4px', fontFamily: T.fontMono }}>
                {String(kpis.onlineDevices).padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="kpi-card" style={{ ...GLASS_CARD, padding: '16px 20px', boxShadow: T.shadowSm, borderLeft: `4px solid ${T.danger}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Offline Parameters</div>
              <div style={{ fontSize: '26px', fontWeight: '800', color: T.danger, marginTop: '4px', fontFamily: T.fontMono }}>
                {String(kpis.offlineDevices).padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="kpi-card" onClick={() => setShowAlarmsModal(true)} style={{
            ...GLASS_CARD,
            padding: '16px 20px',
            boxShadow: T.shadowSm,
            borderLeft: `4px solid ${kpis.activeAlarms > 0 ? T.danger : T.primary}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = T.shadowMd;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = T.shadowSm;
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Alarms</div>
              <div style={{ fontSize: '26px', fontWeight: '800', color: kpis.activeAlarms > 0 ? T.danger : T.text, marginTop: '4px', fontFamily: T.fontMono, display: 'flex', alignItems: 'center', gap: '8px' }}>
                {String(kpis.activeAlarms).padStart(2, '0')}
                {kpis.activeAlarms > 0 && (
                  <span style={{
                    width: '8px',
                    height: '8px',
                    background: T.danger,
                    borderRadius: '50%',
                    display: 'inline-block',
                    boxShadow: `0 0 8px ${T.danger}`
                  }}></span>
                )}
              </div>
            </div>
          </div>

          <div className="kpi-card" style={{ ...GLASS_CARD, padding: '16px 20px', boxShadow: T.shadowSm, borderLeft: `4px solid ${T.info}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ width: '100%' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>PC Network</div>
              <div style={{ fontSize: '13px', fontWeight: '800', color: T.text, fontFamily: T.fontMono, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{networkInfo?.lan_ip || '---'}</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '10px', fontWeight: '700', textTransform: 'uppercase',
                  color: networkInfo?.internet_connected ? T.success : T.danger
                }}>
                  <span style={{
                    width: '7px', height: '7px', borderRadius: '50%',
                    backgroundColor: networkInfo?.internet_connected ? T.success : T.danger,
                    boxShadow: networkInfo?.internet_connected ? `0 0 6px ${T.success}` : `0 0 6px ${T.danger}`,
                    display: 'inline-block'
                  }}></span>
                  {networkInfo === null ? '...' : networkInfo.internet_connected ? 'Online' : 'Offline'}
                </span>
              </div>
              {networkInfo?.hostname && (
                <div style={{ fontSize: '10px', fontWeight: '600', color: T.textFaint, marginTop: '4px' }}>
                  {networkInfo.hostname}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Live Trends Modal */}
      {isTrendsModalOpen && parameters && parameters.length > 0 && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={() => setIsTrendsModalOpen(false)}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '900px',
            padding: '24px', boxShadow: T.shadowLg, position: 'relative'
          }} onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setIsTrendsModalOpen(false)}
              title="Close modal"
              aria-label="Close modal"
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: T.textFaint }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div className="section-title" style={{ margin: 0, fontSize: '20px' }}>Live Trends</div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', paddingRight: '32px' }}>
                <select 
                  value={selectedParam} 
                  onChange={handleParamChange}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: `1.5px solid ${T.borderSoft}`,
                    fontSize: '14px',
                    fontWeight: '700',
                    color: T.text,
                    backgroundColor: '#f8fafc',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {parameters.map(p => (
                    <option key={p.id} value={p.tag_name}>{p.name || p.tag_name}</option>
                  ))}
                </select>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={downloadPNG} style={{ background: '#f8fafc', border: `1px solid ${T.borderSoft}`, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: T.textMuted, fontWeight: '700' }}>PNG</button>
                  <button onClick={downloadPDF} style={{ background: '#f8fafc', border: `1px solid ${T.borderSoft}`, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: T.textMuted, fontWeight: '700' }}>PDF</button>
                  <button onClick={exportCSV} style={{ background: '#f8fafc', border: `1px solid ${T.borderSoft}`, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: T.textMuted, fontWeight: '700' }}>CSV</button>
                  <button onClick={exportExcel} style={{ background: '#f8fafc', border: `1px solid ${T.borderSoft}`, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: T.textMuted, fontWeight: '700' }}>Excel</button>
                </div>
              </div>
            </div>
            
            <div style={{ position: 'relative', width: '100%', minHeight: '350px' }}>
              <canvas ref={chartRef}></canvas>
            </div>
          </div>
        </div>
      )}

      {/* Sensor telemetry Grid grouped by station */}
      <div className="card">
        <div className="section-title">Live Parameters</div>
        {stations.map(station => {
          const stationParams = groupedParametersByStation[station.id] || [];
          if (stationParams.length === 0) return null;

          const stationDevices = devices.filter(d => d.station_id === station.id);
          const isStationOnline = stationDevices.some(d => d.status === 'online');

          return (
            <div key={station.id} style={{ marginBottom: '24px' }}>
              <div style={{
                fontSize: '14px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderBottom: `1px solid ${T.borderSoft}`,
                paddingBottom: '6px'
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: isStationOnline ? T.success : T.danger,
                  boxShadow: isStationOnline ? `0 0 6px ${T.success}` : `0 0 6px ${T.danger}`,
                  display: 'inline-block'
                }}></span>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '800',
                  color: T.primary,
                  background: T.primaryBg,
                  padding: '2px 10px',
                  borderRadius: T.rFull,
                  letterSpacing: '0.03em'
                }}>
                  {station.name}
                </span>
              </div>
              <div className="grid-4">
                {stationParams.map(p => (
                  <ParameterCard
                    key={p.id}
                    p={p}
                    data={liveData[p.tag_name]}
                    currentTime={currentTime}
                    avgVal={avg15Mins[p.id]}
                    history={dataPointsRef.current.datasets[p.tag_name] || []}
                    deviceName={p.deviceName}
                    isSelected={selectedParam === p.tag_name}
                    onClick={() => { setSelectedParam(p.tag_name); setIsTrendsModalOpen(true); }}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Fallback for parameters belonging to devices with no station */}
        {(() => {
          const unassignedStationParams = groupedParametersByStation['unassigned'] || [];
          const filteredParams = unassignedStationParams.filter(p => devices.some(d => d.id === p.device_id));
          if (filteredParams.length === 0) return null;

          return (
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                fontSize: '14px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderBottom: `1px solid ${T.borderSoft}`,
                paddingBottom: '6px'
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: T.danger,
                  boxShadow: `0 0 6px ${T.danger}`,
                  display: 'inline-block'
                }}></span>
                <span style={{ fontSize: '13px', fontWeight: '800', color: T.textLabel }}>
                  Unassigned Station
                </span>
              </div>
              <div className="grid-4">
                {filteredParams.map(p => (
                  <ParameterCard
                    key={p.id}
                    p={p}
                    data={liveData[p.tag_name]}
                    currentTime={currentTime}
                    avgVal={avg15Mins[p.id]}
                    history={dataPointsRef.current.datasets[p.tag_name] || []}
                    deviceName={p.deviceName}
                    isSelected={selectedParam === p.tag_name}
                    onClick={() => { setSelectedParam(p.tag_name); setIsTrendsModalOpen(true); }}
                  />
                ))}
              </div>
            </div>
          );
        })()}

        {/* Fallback for unmapped parameters (no device at all) */}
        {unassignedParameters.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{
              fontSize: '14px',
              fontWeight: '700',
              color: T.textLabel,
              marginBottom: '12px',
              borderBottom: '1px solid rgba(100, 116, 139, 0.15)',
              paddingBottom: '6px'
            }}>
              Unassigned Parameters
            </div>
            <div className="grid-4">
              {unassignedParameters.map(p => (
                <ParameterCard
                  key={p.id}
                  p={p}
                  data={liveData[p.tag_name]}
                  currentTime={currentTime}
                  avgVal={avg15Mins[p.id]}
                  history={dataPointsRef.current.datasets[p.tag_name] || []}
                  deviceName="Unassigned"
                  isSelected={selectedParam === p.tag_name}
                  onClick={() => { setSelectedParam(p.tag_name); setIsTrendsModalOpen(true); }}
                />
              ))}
            </div>
          </div>
        )}
      </div>



      <AlarmsInspectorModal isOpen={showAlarmsModal} onClose={() => setShowAlarmsModal(false)} />

      {/* Broadcast Popup — latest critical broadcast shown as dismissible overlay */}
      {broadcasts && broadcasts.length > 0 && (() => {
        const critical = broadcasts.find((b: any) => b.severity === 'critical' && b.id !== dismissedBroadcast);
        if (!critical) return null;
        return (
          <div style={{
            position: 'fixed', bottom: '80px', right: '24px', zIndex: 9999,
            maxWidth: '400px', padding: '16px 20px',
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'flex-start', gap: '12px',
          }}>
            <span style={{ fontSize: '24px', flexShrink: 0 }}>🚨</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#991b1b', marginBottom: '4px' }}>Broadcast Message</div>
              <div style={{ fontSize: '12px', color: '#7f1d1d' }}>{critical.message}</div>
            </div>
            <button onClick={() => setDismissedBroadcast(critical.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '18px', color: '#991b1b', padding: '0 0 0 8px', lineHeight: 1
            }}>×</button>
          </div>
        );
      })()}

    </div>
  );
};
