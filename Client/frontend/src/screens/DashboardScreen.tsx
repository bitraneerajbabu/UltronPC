import React, { useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AppContext, LiveDataContext } from '../context/AppContext';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, LineController, Filler } from 'chart.js';
import { T, getParamState, getParamTheme } from '../theme';
import { Sparkline } from '../components/Sparkline';
import { AlarmsInspectorModal } from '../components/AlarmsInspectorModal';
import { 
  IconBuildingFactory, IconShieldCheck, IconShieldX, IconBell, 
  IconTemperature, IconDroplet, IconWind, IconCloudFog, IconFlask2, IconAtom2, 
  IconActivity, IconX, IconGauge, IconGaugeFilled, IconSum, IconTestPipe, 
  IconDroplets, IconCloudStorm, IconBuildingFactory2, IconCloudRain, IconCompass, 
  IconAlertOctagon, IconAlertTriangle, IconInfoCircle, IconRefresh, IconReportAnalytics, 
  IconMail
} from '@tabler/icons-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, LineController, Filler);

const formatCurrentTime = () => {
  const date = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getDate())}-${p(date.getMonth()+1)}-${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
};

const stationIconFor = (name: string) => {
  const n = (name || '').toLowerCase();
  const size = 16;
  if (n.includes('aaqms')) return <IconWind size={size} stroke={1.75} color="var(--primary-600)" />;
  if (n.includes('cems')) return <IconBuildingFactory2 size={size} stroke={1.75} color="var(--primary-600)" />;
  if (n.includes('eqms')) return <IconDroplet size={size} stroke={1.75} color="var(--primary-600)" />;
  if (n.includes('weather')) return <IconCloudStorm size={size} stroke={1.75} color="var(--primary-600)" />;
  return <IconBuildingFactory size={size} stroke={1.75} color="var(--primary-600)" />;
};

const formatValPrecision = (val: any): string => {
  if (val === null || val === undefined || val === '') return '0.00';
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return '0.00';
  const str = num.toString();
  if (str.includes('.')) {
    const decimals = str.split('.')[1].length;
    if (decimals > 2) {
      return num.toFixed(Math.min(decimals, 4));
    }
  }
  return num.toFixed(2);
};

// ─── Modern Porcelain Parameter Card ───────────────────────────────────────────
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
  const state = getParamState(p, data);
  const isOffline = state.badge === 'OFFLINE';
  const isUnconfigured = state.badge === 'NOT CONFIGURED';
  const hasValue = data && data.value !== null && data.value !== undefined && data.value !== '' && !isNaN(Number(data.value));
  const rawVal = hasValue ? parseFloat(data.value) : null;
  const formattedVal = hasValue ? formatValPrecision(rawVal) : (isOffline ? 'Offline' : (isUnconfigured ? 'Not Configured' : '—'));
  const displayTimestamp = data?.timestamp && data.timestamp !== '—' ? data.timestamp : currentTime;

  const avgFloat = parseFloat(avgVal);
  const formattedAvgVal = (!isNaN(avgFloat)) ? formatValPrecision(avgFloat) : (hasValue ? formatValPrecision(rawVal) : 'N/A');

  let formattedTimestamp = '—';
  if (displayTimestamp !== '—') {
    const parts = displayTimestamp.split(' ');
    if (parts.length === 2) {
      const dateParts = parts[0].split('-');
      if (dateParts.length === 3) {
        formattedTimestamp = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]} ${parts[1]}`;
      } else {
        formattedTimestamp = displayTimestamp;
      }
    } else {
      formattedTimestamp = displayTimestamp;
    }
  }
  const unit = p.unit || '';
  const limit = p.alarm_high !== null && p.alarm_high !== undefined ? `>${p.alarm_high}` : '—';
  const range = `${p.min_valid !== null && p.min_valid !== undefined ? p.min_valid : '0'} - ${p.max_valid !== null && p.max_valid !== undefined ? p.max_valid : '1000'}`;

  // Get parameter-specific styling theme
  const paramTheme = getParamTheme(p.tag_name);

  // Custom Icon based on tag name
  const renderIcon = () => {
    const name = `${p.tag_name || ''} ${p.name || ''}`.toLowerCase();
    const strokeColor = isOffline ? '#FFFFFF' : paramTheme.color;
    
    if (name.includes('temp')) return <IconTemperature size={22} stroke={2} color={strokeColor} />;
    if (name.includes('hum')) return <IconDroplet size={22} stroke={2} color={strokeColor} />;
    if (name.includes('press')) return <IconGauge size={22} stroke={2} color={strokeColor} />;
    if (name.includes('so2') || name.includes('sulfur')) return <IconFlask2 size={22} stroke={2} color={strokeColor} />;
    if (name.includes('pm') || name.includes('dust')) return <IconAtom2 size={22} stroke={2} color={strokeColor} />;
    if (name.includes('no') || name.includes('nox') || name.includes('nitro')) return <IconWind size={22} stroke={2} color={strokeColor} />;
    if (name.includes('wind') || name.includes('ws') || name.includes('wd') || name.includes('speed') || name.includes('dir')) return <IconWind size={22} stroke={2} color={strokeColor} />;
    if (name.includes('flow')) return <IconGaugeFilled size={22} stroke={2} color={strokeColor} />;
    if (name.includes('total')) return <IconSum size={22} stroke={2} color={strokeColor} />;
    if (name.includes('ph')) return <IconTestPipe size={22} stroke={2} color={strokeColor} />;
    if (name.includes('tds')) return <IconDroplets size={22} stroke={2} color={strokeColor} />;
    if (name.includes('rain')) return <IconCloudRain size={22} stroke={2} color={strokeColor} />;
    if (name.includes('magnetic') || name.includes('compass') || name.includes('bearing')) return <IconCompass size={22} stroke={2} color={strokeColor} />;
    if (name.includes('co') || name.includes('o3') || name.includes('ozone') || name.includes('carbon')) return <IconCloudFog size={22} stroke={2} color={strokeColor} />;
    return <IconActivity size={22} stroke={2} color={strokeColor} />;
  };

  return (
    <div className={`sensor-card ${state.cls}`} onClick={onClick} style={{ 
      display: 'flex', flexDirection: 'column', padding: '16px 18px', 
      borderRadius: '22px', 
      width: '100%',
      minWidth: 0,
      borderLeft: isOffline ? 'none' : `4px solid ${state.dot}`,
      borderTop: isOffline ? 'none' : '1px solid var(--border)',
      borderRight: isOffline ? 'none' : '1px solid var(--border)',
      borderBottom: isOffline ? 'none' : '1px solid var(--border)',
      backgroundColor: isOffline ? '#DE4949' : (isUnconfigured ? 'var(--surface-muted)' : 'var(--surface)'), 
      color: isOffline ? '#FFFFFF' : 'var(--text-primary)',
      position: 'relative', cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      boxShadow: isOffline ? '0 8px 24px -4px rgba(222, 73, 73, 0.4)' : '0 6px 20px -3px rgba(4, 52, 44, 0.05)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <div style={{ width: '36px', height: '36px', backgroundColor: isOffline ? 'rgba(0, 0, 0, 0.12)' : paramTheme.bg, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {renderIcon()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            <span style={{ fontSize: '15px', fontWeight: '900', color: isOffline ? '#FFFFFF' : 'var(--text-primary)', lineHeight: '1.2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || p.tag_name}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <span style={{ width: '7px', height: '7px', backgroundColor: isOffline ? 'rgba(255, 255, 255, 0.7)' : state.dot, borderRadius: '50%', animation: isOffline || state.cls === 'sensor-card-critical' ? 'alertPulse 1.4s ease-in-out infinite' : 'none' }}></span>
          <span style={{ fontSize: '9px', fontWeight: '800', color: isOffline ? '#FFFFFF' : state.dot, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{state.badge}</span>
        </div>
      </div>

      {/* Main Value Block */}
      <div style={{ backgroundColor: isOffline ? 'rgba(0, 0, 0, 0.12)' : 'var(--surface-muted)', borderRadius: '14px', padding: '10px 14px', marginBottom: '12px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: '22px', fontWeight: '800', color: isOffline ? '#FFFFFF' : 'var(--text-primary)', fontFamily: T.fontMono, lineHeight: '1' }}>{formattedVal}</span>
        <span style={{ fontSize: '13px', fontWeight: '700', color: isOffline ? '#FFFFFF' : 'var(--text-secondary)' }}>{unit}</span>
      </div>

      {/* Details List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: isOffline ? '#FFFFFF' : 'var(--text-secondary)' }}>Average (15m):</span>
          <span style={{ fontSize: '11px', fontWeight: '800', color: isOffline ? '#FFFFFF' : 'var(--text-primary)' }}>{formattedAvgVal} {unit}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: isOffline ? '#FFFFFF' : 'var(--text-secondary)' }}>Warning Limit:</span>
          <span style={{ fontSize: '11px', fontWeight: '800', color: isOffline ? '#FFFFFF' : 'var(--text-primary)' }}>{limit} {unit}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: isOffline ? '#FFFFFF' : 'var(--text-secondary)' }}>Parameter Range:</span>
          <span style={{ fontSize: '11px', fontWeight: '800', color: isOffline ? '#FFFFFF' : 'var(--text-secondary)' }}>{range} {unit}</span>
        </div>
      </div>

      {/* Sparkline Block */}
      <div style={{ backgroundColor: isOffline ? 'rgba(0, 0, 0, 0.1)' : 'var(--surface-muted)', borderRadius: '10px', padding: '4px 8px', marginBottom: '10px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
         <div style={{ position: 'absolute', top: '7px', left: '8%', right: '8%', borderTop: isOffline ? '1px dotted rgba(255, 255, 255, 0.35)' : '1px dotted var(--danger)', opacity: 0.5 }}></div>
         <div style={{ position: 'absolute', top: '15px', left: '8%', right: '8%', borderTop: isOffline ? '1px dotted rgba(255, 255, 255, 0.35)' : '1px dotted var(--warning)', opacity: 0.5 }}></div>
         <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
           <Sparkline data={history} color={isOffline ? '#FFFFFF' : paramTheme.color} isOffline={isOffline} width={120} height={18} />
         </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', flexWrap: 'wrap', gap: '3px' }}>
        <span style={{ fontSize: '10.5px', fontWeight: '700', color: isOffline ? '#FFFFFF' : 'var(--text-secondary)' }}>Received: <span style={{ color: isOffline ? '#FFFFFF' : 'var(--text-primary)', fontWeight: '800' }}>{formattedTimestamp}</span></span>
      </div>
    </div>
  );
});

export const DashboardScreen = React.memo(() => {
  const { stations, devices, parameters, showToast, authFetch, API_BASE, parseUtcDate, amcExpiry, broadcasts, setActiveScreen } = useContext(AppContext);
  const liveDataCtx = useContext(LiveDataContext) || {};
  const liveData = liveDataCtx.liveData || {};
  const kpis = liveDataCtx.kpis || {};
  const fetchLatestTelemetryAndKpis = liveDataCtx.fetchLatestTelemetryAndKpis;

  const [currentTime, setCurrentTime] = useState(formatCurrentTime());
  const [selectedParam, setSelectedParam] = useState('');
  const [isTrendsModalOpen, setIsTrendsModalOpen] = useState(false);
  const [showAlarmsModal, setShowAlarmsModal] = useState(false);
  const [dismissedBroadcasts, setDismissedBroadcasts] = useState<Set<number>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('ultron_dismissed_broadcasts') || '[]'));
    } catch {
      return new Set();
    }
  });

  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<ChartJS | null>(null);
  const lastTimestampRef = useRef<string | null>(null);

  const [avg15Mins, setAvg15Mins] = useState<Record<number, string>>({});

  const dataPointsRef = useRef<{ labels: string[]; datasets: Record<string, (number | null)[]> }>({
    labels: [],
    datasets: {}
  });

  // Clock ticker for top bar & display sync
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(formatCurrentTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch 15-minute rolling averages
  const fetch15MinAverages = useCallback(async () => {
    if (!parameters || parameters.length === 0) return;
    try {
      const ids = parameters.map((p: any) => p.id).join(',');
      const res = await authFetch(`${API_BASE}/telemetry/averages?parameter_ids=${ids}&avg_type=avg_15min`);
      if (res.ok) {
        const data = await res.json();
        const map: Record<number, string> = {};
        data.forEach((item: any) => {
          if (item.value !== null && item.value !== undefined) {
            map[item.parameter_id] = formatValPrecision(item.value);
          }
        });
        setAvg15Mins(map);
      }
    } catch (e) {
      console.error('[DashboardScreen] Failed to fetch 15m averages:', e);
    }
  }, [parameters, authFetch, API_BASE]);

  useEffect(() => {
    fetch15MinAverages();
    const interval = setInterval(fetch15MinAverages, 60000);
    return () => clearInterval(interval);
  }, [fetch15MinAverages]);

  // Set default selected parameter
  useEffect(() => {
    if (parameters && parameters.length > 0 && !selectedParam) {
      setSelectedParam(parameters[0].tag_name);
    }
  }, [parameters, selectedParam]);

  // Handle Chart.js modal creation
  useEffect(() => {
    if (!isTrendsModalOpen || !selectedParam || !parameters || parameters.length === 0) return;

    let isMounted = true;
    const activeParam = parameters.find((p: any) => p.tag_name === selectedParam);
    if (!activeParam) return;

    const fetchHistoricalData = async () => {
      try {
        const res = await authFetch(`${API_BASE}/trends/chart-data?parameter_ids=${activeParam.id}&avg_type=raw&limit=30`);
        if (res.ok && isMounted) {
          const json = await res.json();
          const seriesData = json[activeParam.id] || { labels: [], values: [] };
          
          const rawLabels = seriesData.labels || [];
          const rawVals = seriesData.values || [];

          const formattedLabels = rawLabels.map((lbl: string) => {
            const date = parseUtcDate(lbl);
            const p = (n: number) => String(n).padStart(2, '0');
            return `${p(date.getHours())}:${p(date.getMinutes())}`;
          });

          dataPointsRef.current.labels = formattedLabels;
          if (!dataPointsRef.current.datasets) dataPointsRef.current.datasets = {};
          dataPointsRef.current.datasets[selectedParam] = rawVals;

          if (chartRef.current) {
            if (chartInstanceRef.current) {
              chartInstanceRef.current.destroy();
            }

            const ctx = chartRef.current.getContext('2d');
            if (ctx) {
              const activeParamTheme = getParamTheme(selectedParam);
              chartInstanceRef.current = new ChartJS(ctx, {
                type: 'line',
                data: {
                  labels: formattedLabels,
                  datasets: [{
                    label: `${activeParam.name || selectedParam} (${activeParam.unit || ''})`,
                    data: rawVals,
                    borderColor: activeParamTheme.color,
                    backgroundColor: activeParamTheme.glow,
                    borderWidth: 2,
                    pointRadius: 2.5,
                    pointHoverRadius: 5,
                    tension: 0.35,
                    fill: true,
                  }]
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    x: {
                      grid: { color: 'rgba(15, 110, 86, 0.06)' },
                      ticks: { color: 'var(--text-secondary)', font: { size: 10 } }
                    },
                    y: {
                      grid: { color: 'rgba(15, 110, 86, 0.06)' },
                      ticks: { color: 'var(--text-secondary)', font: { size: 10 } }
                    }
                  },
                  plugins: {
                    legend: { display: true, labels: { color: 'var(--text-primary)', font: { size: 12, weight: 'bold' } } },
                    tooltip: { mode: 'index', intersect: false }
                  }
                }
              });
            }
          }
        }
      } catch (err) {
        console.error('[DashboardScreen] Failed to load modal trend chart data:', err);
      }
    };

    fetchHistoricalData();

    return () => {
      isMounted = false;
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [isTrendsModalOpen, selectedParam, parameters, authFetch, API_BASE, parseUtcDate]);

  // Update chart when liveData receives a push
  useEffect(() => {
    if (!chartInstanceRef.current || !parameters || parameters.length === 0 || !selectedParam) return;

    const currentData = liveData[selectedParam];
    if (!currentData || !currentData.timestamp || currentData.timestamp === '—') return;

    const currentVal = parseFloat(currentData.value);
    if (isNaN(currentVal)) return;

    if (currentData.timestamp === lastTimestampRef.current) return;
    lastTimestampRef.current = currentData.timestamp;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const presentTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    if (!dataPointsRef.current.labels) dataPointsRef.current.labels = [];
    const labelsCount = dataPointsRef.current.labels.length;

    const _chartVal = (tag: string) => {
      const v = liveData[tag]?.value;
      const n = v != null ? parseFloat(v) : NaN;
      return isNaN(n) ? null : Number(n.toFixed(2));
    };

    if (labelsCount > 0 && dataPointsRef.current.labels[labelsCount - 1] === presentTimeStr) {
      parameters.forEach((p: any) => {
        if (!dataPointsRef.current.datasets[p.tag_name]) dataPointsRef.current.datasets[p.tag_name] = [];
        dataPointsRef.current.datasets[p.tag_name][labelsCount - 1] = _chartVal(p.tag_name);
      });
    } else {
      dataPointsRef.current.labels.push(presentTimeStr);
      if (dataPointsRef.current.labels.length > 30) dataPointsRef.current.labels.shift();

      parameters.forEach((p: any) => {
        if (!dataPointsRef.current.datasets[p.tag_name]) dataPointsRef.current.datasets[p.tag_name] = [];
        dataPointsRef.current.datasets[p.tag_name].push(_chartVal(p.tag_name));
        if (dataPointsRef.current.datasets[p.tag_name].length > 30) dataPointsRef.current.datasets[p.tag_name].shift();
      });
    }

    const currentParamObj = parameters.find((p: any) => p.tag_name === selectedParam) || {};
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

  const handleParamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
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
      '<html><head><style>body{margin:20px;font-family:sans-serif}img{width:100%;border:1px solid var(--border);border-radius:8px}</style></head>',
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

  const exportTrendCSV = () => {
    if (!selectedParam || !dataPointsRef.current.labels) {
      showToast('Generate a trend first.', 'warn');
      return;
    }
    const headers = ['Time', selectedParam];
    const rows = dataPointsRef.current.labels.map((label, i) => {
      const val = dataPointsRef.current.datasets[selectedParam]?.[i];
      return `${label},${val != null ? val : ''}`;
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `LiveTrend_${selectedParam}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Live trend CSV exported.');
  };

  // Performance memoizations
  const groupedBySensor = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    const assignedParams = (parameters || []).filter((p: any) => (devices || []).some((d: any) => d.id == p.device_id));
    assignedParams.forEach((p: any) => {
      const device = (devices || []).find((d: any) => d.id == p.device_id);
      const station = (stations || []).find((s: any) => s.id == device?.station_id);
      const key = station?.name || p.description || 'General Parameters';
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(p);
    });
    return grouped;
  }, [parameters, devices, stations]);

  const unassignedParameters = useMemo(() => {
    return (parameters || []).filter((p: any) => !(devices || []).some((d: any) => d.id == p.device_id));
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
    <div className="screen active dash-screen" id="dashboardScreen" style={{ padding: '16px 20px' }}>
      
      {/* AMC Warning Banner */}
      {amcWarning && (
        <div style={{ padding: '12px 20px', marginBottom: '16px', background: amcWarning.severity === 'critical' ? 'var(--danger-bg)' : 'var(--warning-bg)', border: `1px solid ${amcWarning.severity === 'critical' ? 'var(--danger-bg)' : 'var(--warning-bg)'}`, borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>{amcWarning.severity === 'critical' ? <IconAlertOctagon size={20} stroke={1.75} color="var(--danger)" /> : <IconAlertTriangle size={20} stroke={1.75} color="var(--warning)" />}</span>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', flex: 1 }}>{amcWarning.msg}</span>
        </div>
      )}

      {/* ─── MAIN DASHBOARD 2-COLUMN LAYOUT ───────────────────────── */}
      <div className="dash-layout" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        
        {/* Left Main Column: Top 5 KPIs Strip + Live Parameters / Empty State */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* ─── TOP 5 KPI METRICS STRIP (1 Single Line) ────────────────── */}
          <div className="dash-kpi-grid" style={{ marginBottom: 0 }}>
            {/* KPI 1: Online Devices */}
            <div className="kpi-tile">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Online Devices</span>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(29, 158, 117, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconShieldCheck size={16} stroke={2} color="#1D9E75" />
                </div>
              </div>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: T.fontMono, lineHeight: '1' }}>{String(kpis?.onlineDevices || 0).padStart(2, '0')}</span>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#1D9E75' }}>Active</span>
              </div>
            </div>

            {/* KPI 2: Offline Devices */}
            <div className="kpi-tile">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Offline Devices</span>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(226, 75, 74, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconShieldX size={16} stroke={2} color="#E24B4A" />
                </div>
              </div>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: T.fontMono, lineHeight: '1' }}>{String(kpis?.offlineDevices || 0).padStart(2, '0')}</span>
                <span style={{ fontSize: '11px', fontWeight: '700', color: Number(kpis?.offlineDevices || 0) > 0 ? '#E24B4A' : 'var(--text-secondary)' }}>Unreachable</span>
              </div>
            </div>

            {/* KPI 3: Total Stations */}
            <div className="kpi-tile">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Total Stations</span>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(15, 110, 86, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconBuildingFactory size={16} stroke={2} color="var(--primary-600)" />
                </div>
              </div>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: T.fontMono, lineHeight: '1' }}>{String(kpis?.totalStations || stations?.length || 0).padStart(2, '0')}</span>
                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary-600)' }}>Configured</span>
              </div>
            </div>

            {/* KPI 4: Active Alarms */}
            <div className="kpi-tile" onClick={() => setShowAlarmsModal(true)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Active Alarms</span>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(239, 159, 39, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconBell size={16} stroke={2} color="#EF9F27" />
                </div>
              </div>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: '800', color: Number(kpis?.activeAlarms || 0) > 0 ? '#E24B4A' : 'var(--text-primary)', fontFamily: T.fontMono, lineHeight: '1' }}>{String(kpis?.activeAlarms || 0).padStart(2, '0')}</span>
                <span style={{ fontSize: '11px', fontWeight: '700', color: Number(kpis?.activeAlarms || 0) > 0 ? '#E24B4A' : '#1D9E75' }}>{Number(kpis?.activeAlarms || 0) > 0 ? 'Pending Ack' : 'All Clear'}</span>
              </div>
            </div>

            {/* KPI 5: Transmission Health */}
            <div className="kpi-tile">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Transmission Health</span>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(29, 158, 117, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconActivity size={16} stroke={2} color="#1D9E75" />
                </div>
              </div>
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: T.fontMono, lineHeight: '1' }}>99.8%</span>
                  <span style={{ fontSize: '10.5px', fontWeight: '700', color: '#1D9E75' }}>Real-time</span>
                </div>
                <div style={{ width: '100%', height: '5px', backgroundColor: 'var(--surface-muted)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: '99.8%', height: '100%', background: 'linear-gradient(90deg, #1D9E75, #085041)', borderRadius: '999px' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Area: Parameters Grid or Empty Placeholder */}
          {isEmpty ? (
            <div className="card" style={{ padding: '54px 24px', textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
                No mapped parameters found.
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '580px', margin: '0 auto', lineHeight: 1.5 }}>
                Please configure your station, devices, and map parameters in the Parameter Mapping screen to start viewing live telemetry.
              </div>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 0, padding: '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div className="section-title" style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>Live Parameters</div>
                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Click any card to inspect live trend</span>
              </div>

              {Object.entries(groupedBySensor).map(([sensorName, params]) => (
                <div key={sensorName} style={{ marginBottom: '22px' }}>
                  <div style={{ fontSize: '13px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid var(--border-soft)`, paddingBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--primary-dark, #04342C)', background: 'rgba(15, 110, 86, 0.08)', padding: '3px 12px', borderRadius: '999px', letterSpacing: '0.03em', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {stationIconFor(sensorName)}
                      {sensorName}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>({(params as any[]).length} Parameters)</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '12px' }}>
                    {(params as any[]).map(p => (
                      <ParameterCard key={p.id} p={p} data={liveData?.[p.tag_name]} currentTime={currentTime} avgVal={avg15Mins?.[p.id]} history={dataPointsRef.current?.datasets?.[p.tag_name] || []} deviceName="" isSelected={selectedParam === p.tag_name} onClick={() => { setSelectedParam(p.tag_name); setIsTrendsModalOpen(true); }} />
                    ))}
                  </div>
                </div>
              ))}

              {unassignedParameters.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '12px', borderBottom: '1px solid var(--border-soft)', paddingBottom: '6px' }}>
                    Unassigned Parameters
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '12px' }}>
                    {unassignedParameters.map(p => (
                      <ParameterCard key={p.id} p={p} data={liveData?.[p.tag_name]} currentTime={currentTime} avgVal={avg15Mins?.[p.id]} history={dataPointsRef.current?.datasets?.[p.tag_name] || []} deviceName="Unassigned" isSelected={selectedParam === p.tag_name} onClick={() => { setSelectedParam(p.tag_name); setIsTrendsModalOpen(true); }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side Column: QUICK ACTIONS */}
        <aside className="dash-sidebar" style={{ width: '220px', flexShrink: 0 }}>
          <div className="card" style={{ padding: '18px 16px', marginBottom: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--primary-800)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--primary-600)', fontWeight: '900' }}>|</span> QUICK ACTIONS
            </div>
            <button className="dash-action" onClick={() => { fetchLatestTelemetryAndKpis(); showToast('Telemetry refreshed'); }}>
              <IconRefresh size={16} stroke={2} /> Refresh Data
            </button>
            <button className="dash-action" onClick={() => setActiveScreen('reportsScreen')}>
              <IconReportAnalytics size={16} stroke={1.75} /> View Reports
            </button>
            <button className="dash-action" onClick={() => setShowAlarmsModal(true)}>
              <IconBell size={16} stroke={1.75} /> Active Alarms
            </button>
            <button className="dash-action" onClick={() => setActiveScreen('trendsScreen')}>
              <IconActivity size={16} stroke={1.75} /> Trends & Analytics
            </button>
            <button className="dash-action" onClick={() => setActiveScreen('contactScreen')}>
              <IconMail size={16} stroke={1.75} /> Contact Support
            </button>
          </div>
        </aside>
      </div>

      <AlarmsInspectorModal isOpen={showAlarmsModal} onClose={() => setShowAlarmsModal(false)} />

      {broadcasts && broadcasts.length > 0 && localStorage.getItem('ultron_broadcast_enabled') !== 'false' && (() => {
        const visible = (broadcasts as any[]).find((b: any) => !dismissedBroadcasts.has(b.id));
        if (!visible) return null;
        const sev = visible.severity || 'info';
        const colors: Record<string,any> = {
          critical: { bg: 'var(--danger-bg)', border: 'var(--danger-bg)', icon: <IconAlertOctagon size={22} stroke={1.75} color="var(--danger-text)" />, title: 'var(--danger-text)', text: 'var(--danger-text)', label: 'Critical Broadcast' },
          warn:     { bg: 'var(--warning-bg)', border: 'var(--warning-bg)', icon: <IconAlertTriangle size={22} stroke={1.75} color="var(--warning-text)" />,  title: 'var(--warning-text)', text: 'var(--warning-text)', label: 'Warning Broadcast' },
          info:     { bg: 'var(--info-bg)', border: 'var(--info-bg)', icon: <IconInfoCircle size={22} stroke={1.75} color="var(--info-text)" />,  title: 'var(--info-text)', text: 'var(--info-text)', label: 'Broadcast Message' },
        };
        const c = colors[sev] || colors.info;
        const dismiss = () => {
          const next = new Set(dismissedBroadcasts);
          next.add(visible.id);
          setDismissedBroadcasts(next);
          localStorage.setItem('ultron_dismissed_broadcasts', JSON.stringify([...next]));
        };
        return (
          <div style={{ position: 'fixed', bottom: '80px', right: '24px', left: '24px', zIndex: 9999, maxWidth: '400px', padding: '16px 20px', background: c.bg, border: `1px solid ${c.border}`, borderRadius: '14px', boxShadow: '0 8px 30px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'flex-start', gap: '12px', margin: '0 auto' }}>
            <span style={{ fontSize: '24px', flexShrink: 0 }}>{c.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: c.title, marginBottom: '4px' }}>{c.label}</div>
              <div style={{ fontSize: '12px', color: c.text }}>{visible.message}</div>
            </div>
            <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>
              <IconX size={16} stroke={2} />
            </button>
          </div>
        );
      })()}
    </div>
  );
});
