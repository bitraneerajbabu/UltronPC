import React, { useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { T, getParamTheme } from '../theme';
import { 
  IconChartLine, IconFileText, IconPhoto, 
  IconRefresh, IconActivity, IconArrowUpRight, IconArrowDownRight, 
  IconAdjustmentsHorizontal, IconCalendar, IconDatabase
} from '@tabler/icons-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const TIME_RANGES = [
  { id: '1h', label: '1 Hr', hours: 1 },
  { id: '6h', label: '6 Hr', hours: 6 },
  { id: '12h', label: '12 Hr', hours: 12 },
  { id: '1d', label: '1 Day', hours: 24 },
  { id: '7d', label: '7 Days', hours: 168 },
  { id: '30d', label: '30 Days', hours: 720 },
];

export const TrendsScreen = React.memo(() => {
  const { parameters, devices, stations, authFetch, API_BASE, parseUtcDate, showToast } = useContext(AppContext);

  const [selectedParamId, setSelectedParamId] = useState<number | ''>('');
  const [selectedRange, setSelectedRange] = useState<string>('1d');
  const [avgType, setAvgType] = useState<string>('raw');
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState<{ labels: string[]; values: (number | null)[]; qualities: string[] }>({
    labels: [],
    values: [],
    qualities: []
  });

  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<ChartJS | null>(null);

  // Initialize selected parameter
  useEffect(() => {
    if (parameters && parameters.length > 0 && !selectedParamId) {
      setSelectedParamId(parameters[0].id);
    }
  }, [parameters, selectedParamId]);

  const selectedParam = useMemo(() => {
    return (parameters || []).find((p: any) => p.id === Number(selectedParamId));
  }, [parameters, selectedParamId]);

  const selectedDevice = useMemo(() => {
    if (!selectedParam) return null;
    return (devices || []).find((d: any) => d.id === selectedParam.device_id);
  }, [devices, selectedParam]);

  const selectedStation = useMemo(() => {
    if (!selectedDevice) return null;
    return (stations || []).find((s: any) => s.id === selectedDevice.station_id);
  }, [stations, selectedDevice]);

  // Fetch trend data
  const fetchTrends = useCallback(async () => {
    if (!selectedParamId) return;
    setLoading(true);

    try {
      const rangeObj = TIME_RANGES.find(r => r.id === selectedRange) || TIME_RANGES[3];
      const end = new Date();
      const start = new Date(end.getTime() - rangeObj.hours * 60 * 60 * 1000);

      const url = `${API_BASE}/trends/chart-data?parameter_ids=${selectedParamId}&start=${start.toISOString()}&end=${end.toISOString()}&avg_type=${avgType}&limit=10000`;
      const res = await authFetch(url);

      if (res.ok) {
        const json = await res.json();
        const paramData = json[selectedParamId] || { labels: [], values: [], qualities: [] };
        setChartData({
          labels: paramData.labels || [],
          values: paramData.values || [],
          qualities: paramData.qualities || [],
        });
      } else {
        showToast('Failed to load trend data', 'error');
      }
    } catch (e) {
      console.error('[TrendsScreen] Error fetching trends:', e);
      showToast('Error connecting to backend', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedParamId, selectedRange, avgType, authFetch, API_BASE, showToast]);

  useEffect(() => {
    fetchTrends();
  }, [fetchTrends]);

  // Render Chart.js
  useEffect(() => {
    if (!chartRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    const formattedLabels = chartData.labels.map(lbl => {
      const d = parseUtcDate(lbl);
      const p = (n: number) => String(n).padStart(2, '0');
      if (selectedRange === '1h' || selectedRange === '6h' || selectedRange === '12h') {
        return `${p(d.getHours())}:${p(d.getMinutes())}`;
      }
      return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
    });

    const paramTheme = getParamTheme(selectedParam?.tag_name);

    chartInstanceRef.current = new ChartJS(ctx, {
      type: 'line',
      data: {
        labels: formattedLabels,
        datasets: [{
          label: `${selectedParam?.name || 'Value'} (${selectedParam?.unit || ''})`,
          data: chartData.values,
          borderColor: paramTheme.color || '#1D9E75',
          backgroundColor: paramTheme.glow || 'rgba(29, 158, 117, 0.12)',
          borderWidth: 2.2,
          pointRadius: chartData.values.length > 80 ? 0 : 3,
          pointHoverRadius: 6,
          pointBackgroundColor: paramTheme.color || '#1D9E75',
          tension: 0.25,
          fill: true,
          spanGaps: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            grid: { color: 'rgba(15, 110, 86, 0.05)' },
            ticks: {
              color: 'var(--text-secondary)',
              font: { size: 10, weight: 'bold' },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12,
            }
          },
          y: {
            grid: { color: 'rgba(15, 110, 86, 0.05)' },
            ticks: {
              color: 'var(--text-secondary)',
              font: { size: 11, weight: 'bold' }
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(4, 52, 44, 0.95)',
            titleColor: '#FFFFFF',
            bodyColor: '#FFFFFF',
            borderColor: 'rgba(29, 158, 117, 0.4)',
            borderWidth: 1,
            padding: 10,
            boxPadding: 4,
            usePointStyle: true,
            callbacks: {
              label: (context) => {
                const val = context.parsed.y;
                return ` ${context.dataset.label}: ${val !== null ? val.toFixed(2) : '—'}`;
              }
            }
          }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [chartData, selectedParam, selectedRange, parseUtcDate]);

  // Calculate live summary stats
  const stats = useMemo(() => {
    const validVals = chartData.values.filter((v): v is number => v !== null && !isNaN(v));
    if (validVals.length === 0) {
      return { current: '—', min: '—', max: '—', avg: '—', count: 0 };
    }
    const current = validVals[validVals.length - 1];
    const min = Math.min(...validVals);
    const max = Math.max(...validVals);
    const sum = validVals.reduce((acc, v) => acc + v, 0);
    const avg = sum / validVals.length;

    return {
      current: current.toFixed(2),
      min: min.toFixed(2),
      max: max.toFixed(2),
      avg: avg.toFixed(2),
      count: validVals.length
    };
  }, [chartData]);

  // Export handlers
  const handleExportPNG = () => {
    if (!chartInstanceRef.current) return;
    const link = document.createElement('a');
    link.download = `Trend_${selectedParam?.tag_name || 'Param'}_${selectedRange}_${Date.now()}.png`;
    link.href = chartInstanceRef.current.toBase64Image();
    link.click();
    showToast('Chart exported as PNG');
  };

  const handleExportPDF = () => {
    if (!chartInstanceRef.current) return;
    const img = chartInstanceRef.current.toBase64Image();
    const html = [
      '<html><head><title>Trend Report</title><style>body{margin:24px;font-family:sans-serif;color:#1E293B}h2{margin-bottom:4px}h4{margin-top:0;color:#64748B}img{width:100%;border:1px solid #CBD5E1;border-radius:12px;margin-top:12px}</style></head>',
      `<body><h2>${selectedParam?.name || selectedParam?.tag_name || 'Telemetry'} — Trend Analysis (${selectedRange.toUpperCase()})</h2>`,
      `<h4>Station: ${selectedStation?.name || 'All'} &bull; Parameter: ${selectedParam?.name || selectedParam?.tag_name} (${selectedParam?.unit || ''})</h4>`,
      `<img src="${img}" />`,
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
    showToast('PDF print dialog opened');
  };

  return (
    <div className="screen active dash-screen" id="trendsScreen" style={{ padding: '16px 20px' }}>
      
      {/* ─── TOP CONTROL BAR ────────────────────────────────────────── */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Parameter:</span>
            <select
              value={selectedParamId}
              onChange={(e) => setSelectedParamId(Number(e.target.value))}
              style={{
                padding: '7px 14px',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: 'var(--surface-muted)',
                color: 'var(--text-primary)',
                fontWeight: '700',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {(parameters || []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.tag_name} ({p.unit || ''})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Mode:</span>
            <select
              value={avgType}
              onChange={(e) => setAvgType(e.target.value)}
              style={{
                padding: '7px 12px',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: 'var(--surface-muted)',
                color: 'var(--text-primary)',
                fontWeight: '700',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="raw">Raw Telemetry</option>
              <option value="avg_15min">15-Min Average</option>
              <option value="avg_1hr">1-Hour Average</option>
            </select>
          </div>
        </div>

        {/* Quick Range Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-muted)', padding: '4px', borderRadius: '14px', border: '1px solid var(--border)' }}>
          {TIME_RANGES.map(range => (
            <button
              key={range.id}
              onClick={() => setSelectedRange(range.id)}
              style={{
                padding: '6px 12px',
                borderRadius: '10px',
                border: 'none',
                background: selectedRange === range.id ? 'var(--primary-dark, #04342C)' : 'transparent',
                color: selectedRange === range.id ? '#FFFFFF' : 'var(--text-secondary)',
                fontWeight: '800',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {range.label}
            </button>
          ))}
        </div>

        {/* Export and Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={fetchTrends}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '12px',
              background: 'var(--surface-muted)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontWeight: '700', fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            <IconRefresh size={15} stroke={2} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            onClick={handleExportPNG}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '12px',
              background: 'var(--surface-muted)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontWeight: '700', fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            <IconPhoto size={15} stroke={2} /> PNG
          </button>
          <button
            onClick={handleExportPDF}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '12px',
              background: 'rgba(15, 110, 86, 0.08)', border: '1px solid var(--primary-600)',
              color: 'var(--primary-600)', fontWeight: '800', fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            <IconFileText size={15} stroke={2} /> Export PDF
          </button>
        </div>
      </div>

      {/* ─── LIVE SUMMARY STATS STRIP (5 Cards) ──────────────────────── */}
      <div className="dash-kpi-grid" style={{ marginBottom: '16px' }}>
        <div className="kpi-tile">
          <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Current Value</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: 'auto' }}>
            <span style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: T.fontMono }}>{stats.current}</span>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>{selectedParam?.unit || ''}</span>
          </div>
        </div>

        <div className="kpi-tile">
          <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Minimum</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: 'auto' }}>
            <span style={{ fontSize: '22px', fontWeight: '800', color: '#378ADD', fontFamily: T.fontMono }}>{stats.min}</span>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>{selectedParam?.unit || ''}</span>
          </div>
        </div>

        <div className="kpi-tile">
          <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Maximum</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: 'auto' }}>
            <span style={{ fontSize: '22px', fontWeight: '800', color: '#E24B4A', fontFamily: T.fontMono }}>{stats.max}</span>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>{selectedParam?.unit || ''}</span>
          </div>
        </div>

        <div className="kpi-tile">
          <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Average</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: 'auto' }}>
            <span style={{ fontSize: '22px', fontWeight: '800', color: '#1D9E75', fontFamily: T.fontMono }}>{stats.avg}</span>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>{selectedParam?.unit || ''}</span>
          </div>
        </div>

        <div className="kpi-tile">
          <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Sample Points</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: 'auto' }}>
            <span style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: T.fontMono }}>{stats.count}</span>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Points</span>
          </div>
        </div>
      </div>

      {/* ─── MAIN CHART CONTAINER ───────────────────────────────────── */}
      <div className="card" style={{ padding: '24px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
              {selectedParam?.name || selectedParam?.tag_name || 'Telemetry'} Trend Analysis
            </div>
            {selectedStation && (
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary-600)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '2px' }}>
                {selectedStation.name} &bull; {selectedDevice?.name || 'Device'}
              </div>
            )}
          </div>
          <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>
            True CPCB Straight-line Telemetry
          </span>
        </div>

        <div style={{ position: 'relative', width: '100%', height: '420px' }}>
          <canvas ref={chartRef}></canvas>
        </div>
      </div>
    </div>
  );
});
