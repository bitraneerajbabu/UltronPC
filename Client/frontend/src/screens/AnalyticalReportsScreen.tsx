import React, { useContext, useState, useEffect, useRef, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { T, GLASS_CARD, BTN, INP, SEL } from '../theme';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, BarController, PointElement, LineElement, LineController, ScatterController, Title, Tooltip, Legend, Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, PointElement, LineElement, LineController, ScatterController, Title, Tooltip, Legend, Filler);

const REPORT_TABS = [
  { key: 'histogram', label: 'Histogram Report' },
  { key: 'percentile', label: 'Percentile Report' },
  { key: 'scatter', label: 'Scatter Plot' },
  { key: 'uptime', label: 'Uptime Report' },
  { key: 'shift', label: 'Shift Report' },
  { key: 'fortnight', label: 'Fortnight Report' },
];

const dlDate = (daysOffset = 0) => {
  const d = new Date(Date.now() + daysOffset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const secStyle = { ...GLASS_CARD, padding: '22px', marginTop: '18px' };
const titleStyle = { fontSize: '16px', fontWeight: '700', color: T.text, marginBottom: '16px' };
const gridStyle = { display: 'flex', flexWrap: 'wrap' as const, gap: '12px' };
const labelStyle = { fontSize: '11px', fontWeight: '600', color: T.textLabel, marginBottom: '4px' };
const btnRowStyle = { display: 'flex', gap: '10px', marginTop: '16px' };
const sampleNoteStyle = { fontSize: '12px', color: '#92400e', backgroundColor: '#fef3c7', fontWeight: '700', marginTop: '8px', padding: '8px 14px', borderRadius: '6px', border: '1px solid #f59e0b' };

function genMockHistogram() {
  const ranges = ['0-10', '10-20', '20-30', '30-40', '40-50', '50-60', '60-70', '70-80', '80-90', '90-100'];
  const bins = ranges.map(r => ({ range: r, count: Math.floor(Math.random() * 30) + 1 }));
  const total = bins.reduce((s, b) => s + b.count, 0);
  return { bins, total };
}

function genMockPercentile() {
  return {
    p10: +(Math.random() * 20 + 5).toFixed(1),
    p25: +(Math.random() * 20 + 20).toFixed(1),
    p50: +(Math.random() * 15 + 35).toFixed(1),
    p75: +(Math.random() * 15 + 55).toFixed(1),
    p90: +(Math.random() * 10 + 75).toFixed(1),
    p95: +(Math.random() * 5 + 88).toFixed(1),
    p99: +(Math.random() * 3 + 95).toFixed(1),
  };
}

function genMockScatter() {
  const points = [];
  for (let i = 0; i < 50; i++) {
    const x = +(Math.random() * 100).toFixed(1);
    const y = +(x * 0.7 + Math.random() * 20 + 5).toFixed(1);
    points.push({ x, y });
  }
  return { points };
}

function genMockUptime() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    const total = 1440;
    const valid = Math.floor(Math.random() * 200 + 1240);
    days.push({ date: dateStr, total_points: total, valid_points: valid, availability_pct: +((valid / total) * 100).toFixed(1) });
  }
  return { days };
}

function genMockShift() {
  return {
    shifts: [
      { name: 'Morning (06-14)', avg: +(Math.random() * 30 + 30).toFixed(1), min: +(Math.random() * 10 + 5).toFixed(1), max: +(Math.random() * 20 + 60).toFixed(1) },
      { name: 'Evening (14-22)', avg: +(Math.random() * 30 + 25).toFixed(1), min: +(Math.random() * 10 + 5).toFixed(1), max: +(Math.random() * 20 + 55).toFixed(1) },
      { name: 'Night (22-06)', avg: +(Math.random() * 25 + 20).toFixed(1), min: +(Math.random() * 10 + 5).toFixed(1), max: +(Math.random() * 20 + 45).toFixed(1) },
    ],
  };
}

function genMockFortnight() {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const month = monthNames[now.getMonth()];
  const blocks = [
    { label: `1-15 ${month}`, availability_pct: +(Math.random() * 10 + 88).toFixed(1), parameters: { PM2_5: +(Math.random() * 50 + 20).toFixed(1), PM10: +(Math.random() * 80 + 30).toFixed(1), NO2: +(Math.random() * 20 + 10).toFixed(1) } },
    { label: `16-${now.getDate()} ${month}`, availability_pct: +(Math.random() * 10 + 88).toFixed(1), parameters: { PM2_5: +(Math.random() * 50 + 20).toFixed(1), PM10: +(Math.random() * 80 + 30).toFixed(1), NO2: +(Math.random() * 20 + 10).toFixed(1) } },
  ];
  return { blocks };
}

function computeLinearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const p of points) {
    sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumX2 += p.x * p.x;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const xMin = Math.min(...points.map(p => p.x));
  const xMax = Math.max(...points.map(p => p.x));
  return [
    { x: xMin, y: +(slope * xMin + intercept).toFixed(1) },
    { x: xMax, y: +(slope * xMax + intercept).toFixed(1) },
  ];
}

export const AnalyticalReportsScreen = () => {
  const { stations, devices, parameters, API_BASE, showToast, parseUtcDate, authFetch } = useContext(AppContext);

  const [activeTab, setActiveTab] = useState('histogram');
  const [stationId, setStationId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [usingSampleData, setUsingSampleData] = useState(false);
  const usingSampleDataRef = useRef(usingSampleData);
  usingSampleDataRef.current = usingSampleData;
  const [generating, setGenerating] = useState<string | null>(null);

  const filteredDevices = useMemo(() => devices.filter(d => d.station_id === Number(stationId)), [devices, stationId]);
  const filteredParams = useMemo(() => parameters.filter(p => p.device_id === Number(deviceId)), [parameters, deviceId]);

  useEffect(() => {
    if (stations.length && !stationId) setStationId(stations[0].id);
  }, [stations, stationId]);
  useEffect(() => {
    if (filteredDevices.length) setDeviceId(filteredDevices[0].id);
    else setDeviceId('');
  }, [filteredDevices]);

  // ── Histogram state ──
  const [histParamId, setHistParamId] = useState('');
  const [histFrom, setHistFrom] = useState(dlDate(-7));
  const [histTo, setHistTo] = useState(dlDate(0));
  const [histResult, setHistResult] = useState(null);
  const histChartRef = useRef(null);
  const histChartInstance = useRef(null);

  // ── Percentile state ──
  const [percParamId, setPercParamId] = useState('');
  const [percFrom, setPercFrom] = useState(dlDate(-7));
  const [percTo, setPercTo] = useState(dlDate(0));
  const [percResult, setPercResult] = useState(null);
  const percChartRef = useRef(null);
  const percChartInstance = useRef(null);

  // ── Scatter state ──
  const [scatterXParamId, setScatterXParamId] = useState('');
  const [scatterYParamId, setScatterYParamId] = useState('');
  const [scatterFrom, setScatterFrom] = useState(dlDate(-7));
  const [scatterTo, setScatterTo] = useState(dlDate(0));
  const [scatterShowTrend, setScatterShowTrend] = useState(true);
  const [scatterResult, setScatterResult] = useState(null);
  const scatterChartRef = useRef(null);
  const scatterChartInstance = useRef(null);

  // ── Uptime state ──
  const [uptimeFrom, setUptimeFrom] = useState(dlDate(-7));
  const [uptimeTo, setUptimeTo] = useState(dlDate(0));
  const [uptimeResult, setUptimeResult] = useState(null);
  const uptimeChartRef = useRef(null);
  const uptimeChartInstance = useRef(null);

  // ── Shift state ──
  const [shiftFrom, setShiftFrom] = useState(dlDate(-7));
  const [shiftTo, setShiftTo] = useState(dlDate(0));
  const [shiftResult, setShiftResult] = useState(null);
  const shiftChartRef = useRef(null);
  const shiftChartInstance = useRef(null);

  // ── Fortnight state ──
  const [fortMonth, setFortMonth] = useState(dlDate(0).slice(0, 7));
  const [fortResult, setFortResult] = useState(null);
  const fortChartRef = useRef(null);
  const fortChartInstance = useRef(null);

  useEffect(() => {
    if (filteredParams.length) {
      if (!histParamId) setHistParamId(filteredParams[0]?.id);
      if (!percParamId) setPercParamId(filteredParams[0]?.id);
      if (!scatterXParamId) setScatterXParamId(filteredParams[0]?.id);
      if (!scatterYParamId) setScatterYParamId(filteredParams[1]?.id || filteredParams[0]?.id);
    }
  }, [filteredParams]);

  // ── Cleanup ──
  const allChartInstances = [histChartInstance, percChartInstance, scatterChartInstance, uptimeChartInstance, shiftChartInstance, fortChartInstance];
  useEffect(() => {
    return () => {
      allChartInstances.forEach(ref => { if (ref.current) { ref.current.destroy(); ref.current = null; } });
    };
  }, []);

  const destroyChart = (ref) => {
    if (ref.current) { ref.current.destroy(); ref.current = null; }
  };

  const mockWatermark = {
    id: 'mockWatermark',
    beforeDraw(chart: any) {
      if (!usingSampleDataRef.current) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = 'bold 40px sans-serif';
      ctx.fillStyle = 'rgba(220,38,38,0.07)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cx = chart.width / 2;
      const cy = chart.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate(-0.4);
      ctx.fillText('SIMULATED', 0, 0);
      ctx.restore();
    }
  };

  const mc = (base: string, isMock: boolean) =>
    isMock ? base.replace('0.6', '0.12').replace('0.15', '0.04') : base;

  const buildHistogramChart = (bins, total) => {
    destroyChart(histChartInstance);
    if (!histChartRef.current) return;
    const ctx = histChartRef.current.getContext('2d');
    const labels = bins.map(b => b.range);
    const data = bins.map(b => b.count);
    const pcts = bins.map(b => +((b.count / total) * 100).toFixed(1));
    histChartInstance.current = new ChartJS(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Frequency',
          data,
          backgroundColor: mc('rgba(15,118,110,0.6)', usingSampleDataRef.current),
          borderColor: usingSampleDataRef.current ? 'rgba(15,118,110,0.3)' : '#0f766e',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#475569',           font: { weight: 600, family: T.fontBase } } },
          tooltip: {
            callbacks: {
              afterLabel: (ctx) => `Percentage: ${pcts[ctx.dataIndex]}%`,
            },
          },
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#f1f5f9' } },
          y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#f1f5f9' }, beginAtZero: true },
        },
      },
      plugins: [mockWatermark],
    });
  };

  const buildPercentileChart = (p) => {
    destroyChart(percChartInstance);
    if (!percChartRef.current) return;
    const ctx = percChartRef.current.getContext('2d');
    const labels = ['P10', 'P25', 'P50', 'P75', 'P90', 'P95', 'P99'];
    const values = [p.p10, p.p25, p.p50, p.p75, p.p90, p.p95, p.p99];
    percChartInstance.current = new ChartJS(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Value',
          data: values,
          backgroundColor: mc('rgba(56,189,248,0.6)', usingSampleDataRef.current),
          borderColor: usingSampleDataRef.current ? 'rgba(56,189,248,0.3)' : '#38bdf8',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#475569', font: { weight: 600, family: T.fontBase } } } },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#f1f5f9' } },
          y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#f1f5f9' }, beginAtZero: true },
        },
      },
      plugins: [mockWatermark],
    });
  };

  const buildScatterChart = (points, showTrend) => {
    destroyChart(scatterChartInstance);
    if (!scatterChartRef.current) return;
    const ctx = scatterChartRef.current.getContext('2d');
    const datasets: any[] = [{
      label: 'Data Points',
      data: points,
          backgroundColor: mc('rgba(15,118,110,0.6)', usingSampleDataRef.current),
          borderColor: usingSampleDataRef.current ? 'rgba(15,118,110,0.3)' : '#0f766e',
      pointRadius: usingSampleDataRef.current ? 3 : 4,
      pointHoverRadius: usingSampleDataRef.current ? 4 : 6,
    }];
    if (showTrend) {
      const trendLine = computeLinearRegression(points);
      if (trendLine) {
        datasets.push({
          label: 'Trend Line',
          data: trendLine,
          type: 'line',
          borderColor: '#ef4444',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0,
        });
      }
    }
    scatterChartInstance.current = new ChartJS(ctx, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#475569', font: { weight: 600, family: T.fontBase } } } },
        scales: {
          x: { type: 'linear', position: 'bottom', ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#f1f5f9' } },
          y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#f1f5f9' } },
        },
      },
      plugins: [mockWatermark],
    });
  };

  const buildUptimeChart = (days) => {
    destroyChart(uptimeChartInstance);
    if (!uptimeChartRef.current) return;
    const ctx = uptimeChartRef.current.getContext('2d');
    const labels = days.map(d => d.date);
    const avail = days.map(d => d.availability_pct);
    uptimeChartInstance.current = new ChartJS(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Availability %',
          data: avail,
          backgroundColor: usingSampleDataRef.current
            ? avail.map(v => v >= 95 ? 'rgba(16,185,129,0.12)' : v >= 85 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)')
            : avail.map(v => v >= 95 ? 'rgba(16,185,129,0.6)' : v >= 85 ? 'rgba(245,158,11,0.6)' : 'rgba(239,68,68,0.6)'),
          borderColor: usingSampleDataRef.current ? 'rgba(148,163,184,0.3)' : undefined,
          borderWidth: usingSampleDataRef.current ? 0 : 1,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#475569', font: { weight: 600, family: T.fontBase } } },
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: '#f1f5f9' } },
          y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#f1f5f9' }, min: 0, max: 100 },
        },
      },
      plugins: [mockWatermark],
    });
  };

  const buildShiftChart = (shifts) => {
    destroyChart(shiftChartInstance);
    if (!shiftChartRef.current) return;
    const ctx = shiftChartRef.current.getContext('2d');
    const labels = shifts.map(s => s.name);
    const avgs = shifts.map(s => s.avg);
    const mins = shifts.map(s => s.min);
    const maxs = shifts.map(s => s.max);
    shiftChartInstance.current = new ChartJS(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Average', data: avgs,           backgroundColor: mc('rgba(15,118,110,0.6)', 
usingSampleDataRef.current),
          borderColor: usingSampleDataRef.current ? 
'rgba(15,118,110,0.3)' : '#0f766e', borderWidth: 1 },
          { label: 'Min', data: mins, backgroundColor: mc('rgba(56,189,248,0.6)', usingSampleDataRef.current), borderColor: usingSampleDataRef.current ? 'rgba(56,189,248,0.3)' : '#38bdf8', borderWidth: 1 },
          { label: 'Max', data: maxs, backgroundColor: mc('rgba(239,68,68,0.6)', usingSampleDataRef.current), borderColor: usingSampleDataRef.current ? 'rgba(239,68,68,0.3)' : '#ef4444', borderWidth: 1 },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#475569', font: { weight: 600, family: T.fontBase } } } },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#f1f5f9' } },
          y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#f1f5f9' }, beginAtZero: true },
        },
      },
      plugins: [mockWatermark],
    });
  };

  const buildFortnightChart = (blocks) => {
    destroyChart(fortChartInstance);
    if (!fortChartRef.current) return;
    const ctx = fortChartRef.current.getContext('2d');
    const labels = blocks.map(b => b.label);
    const avail = blocks.map(b => b.availability_pct);
    fortChartInstance.current = new ChartJS(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Data Availability %',
          data: avail,
          backgroundColor: mc('rgba(15,118,110,0.6)', usingSampleDataRef.current),
          borderColor: usingSampleDataRef.current ? 'rgba(15,118,110,0.3)' : '#0f766e',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#475569', font: { weight: 600, family: T.fontBase } } } },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#f1f5f9' } },
          y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#f1f5f9' }, min: 0, max: 100 },
        },
      },
      plugins: [mockWatermark],
    });
  };

  const fetchOrMock = async (endpoint: string, params: Record<string, any>, mockFn: () => any, reportLabel: string) => {
    setGenerating(reportLabel);
    setUsingSampleData(false);
    try {
      const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
      const url = `${API_BASE}/reports/${endpoint}?${qs}`;
      const res = await authFetch(url);
      if (res.status === 401 || res.status === 403) {
        sessionStorage.removeItem('ultron_token');
        window.location.href = '/#/login';
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data;
    } catch {
      setUsingSampleData(true);
      showToast(`${reportLabel}: API unavailable, using sample data.`, 'info');
      return mockFn();
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateHistogram = async () => {
    if (!histParamId) { showToast('Select a parameter.', 'warn'); return; }
    const data = await fetchOrMock('histogram', {
      station: stationId, parameter: histParamId, start: histFrom, end: histTo,
    }, genMockHistogram, 'Histogram');
    setHistResult(data);
    if (data?.bins?.length) buildHistogramChart(data.bins, data.total);
  };

  const handleGeneratePercentile = async () => {
    if (!percParamId) { showToast('Select a parameter.', 'warn'); return; }
    const data = await fetchOrMock('percentile', {
      station: stationId, parameter: percParamId, start: percFrom, end: percTo,
    }, genMockPercentile, 'Percentile');
    setPercResult(data);
    buildPercentileChart(data);
  };

  const handleGenerateScatter = async () => {
    if (!scatterXParamId || !scatterYParamId) { showToast('Select both X and Y parameters.', 'warn'); return; }
    const data = await fetchOrMock('scatter', {
      x_param: scatterXParamId, y_param: scatterYParamId, station: stationId, start: scatterFrom, end: scatterTo,
    }, genMockScatter, 'Scatter');
    setScatterResult(data);
    if (data?.points?.length) buildScatterChart(data.points, scatterShowTrend);
  };

  const handleGenerateUptime = async () => {
    const data = await fetchOrMock('uptime', {
      station: stationId, start: uptimeFrom, end: uptimeTo,
    }, genMockUptime, 'Uptime');
    setUptimeResult(data);
    if (data?.days?.length) buildUptimeChart(data.days);
  };

  const handleGenerateShift = async () => {
    const data = await fetchOrMock('shift', {
      station: stationId, start: shiftFrom, end: shiftTo,
    }, genMockShift, 'Shift');
    setShiftResult(data);
    if (data?.shifts?.length) buildShiftChart(data.shifts);
  };

  const handleGenerateFortnight = async () => {
    const [yr, mo] = fortMonth.split('-');
    const data = await fetchOrMock('fortnight', {
      station: stationId, month: mo, year: yr,
    }, genMockFortnight, 'Fortnight');
    setFortResult(data);
    if (data?.blocks?.length) buildFortnightChart(data.blocks);
  };

  const renderTabBar = () => (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
      {REPORT_TABS.map(tab => (
        <button
          key={tab.key}
          style={{
            ...(activeTab === tab.key ? BTN.primary : BTN.ghost),
            fontSize: '12px',
            padding: '7px 16px',
          }}
          onClick={() => setActiveTab(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const renderStationSelector = (extraControls) => (
    <div style={gridStyle}>
      <div>
        <div style={labelStyle}>Station</div>
        <select style={SEL} value={stationId} onChange={e => setStationId(e.target.value)}>
          {stations.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
      </div>
      <div>
        <div style={labelStyle}>Device</div>
        <select style={SEL} value={deviceId} onChange={e => setDeviceId(e.target.value)}>
          {filteredDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      {extraControls}
    </div>
  );

  const sampleNote = usingSampleDataRef.current ? <div style={sampleNoteStyle}>⚠ Sample Data — API endpoint returned an error. Values shown are simulated, not actual readings.</div> : null;

  // ── Render Histogram ──
  const renderHistogram = () => (
    <div style={secStyle}>
      <div style={titleStyle}>Histogram Report — Frequency Distribution</div>
      {renderStationSelector(
        <>
          <div>
            <div style={labelStyle}>Parameter</div>
            <select style={SEL} value={histParamId} onChange={e => setHistParamId(e.target.value)}>
              {filteredParams.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>From Date</div>
            <input type="date" style={INP} value={histFrom} onChange={e => setHistFrom(e.target.value)} />
          </div>
          <div>
            <div style={labelStyle}>To Date</div>
            <input type="date" style={INP} value={histTo} onChange={e => setHistTo(e.target.value)} />
          </div>
        </>
      )}
      <div style={btnRowStyle}>
        <button style={BTN.primary} onClick={handleGenerateHistogram} disabled={generating === 'Histogram'}>
          {generating === 'Histogram' ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {sampleNote}
      <div style={{ marginTop: '16px' }}>
        <canvas ref={histChartRef} style={{ maxHeight: '300px' }} />
      </div>
      {histResult && (
        <div style={{ marginTop: '16px', maxHeight: '300px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>Range</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>Count</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>%</th>
              </tr>
            </thead>
            <tbody>
              {histResult.bins.map((b, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}` }}>{b.range}</td>
                  <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, textAlign: 'right', fontWeight: '600' }}>{b.count}</td>
                  <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, textAlign: 'right' }}>{((b.count / histResult.total) * 100).toFixed(1)}%</td>
                </tr>
              ))}
              <tr style={{ fontWeight: '700', background: T.primaryBg }}>
                <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}` }}>Total</td>
                <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, textAlign: 'right' }}>{histResult.total}</td>
                <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, textAlign: 'right' }}>100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Render Percentile ──
  const renderPercentile = () => {
    const p = percResult;
    return (
      <div style={secStyle}>
        <div style={titleStyle}>Percentile Report — Statistical Distribution</div>
        {renderStationSelector(
          <>
            <div>
              <div style={labelStyle}>Parameter</div>
              <select style={SEL} value={percParamId} onChange={e => setPercParamId(e.target.value)}>
                {filteredParams.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>From Date</div>
              <input type="date" style={INP} value={percFrom} onChange={e => setPercFrom(e.target.value)} />
            </div>
            <div>
              <div style={labelStyle}>To Date</div>
              <input type="date" style={INP} value={percTo} onChange={e => setPercTo(e.target.value)} />
            </div>
          </>
        )}
        <div style={btnRowStyle}>
          <button style={BTN.primary} onClick={handleGeneratePercentile} disabled={generating === 'Percentile'}>
            {generating === 'Percentile' ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {sampleNote}
        {p && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
              {[
                { label: 'P10', value: p.p10 },
                { label: 'P25', value: p.p25 },
                { label: 'P50', value: p.p50 },
                { label: 'P75', value: p.p75 },
                { label: 'P90', value: p.p90 },
                { label: 'P95', value: p.p95 },
                { label: 'P99', value: p.p99 },
              ].map(item => (
                <div key={item.label} style={{ ...GLASS_CARD, padding: '10px 18px', textAlign: 'center', minWidth: '80px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: T.primary, marginTop: '4px' }}>{item.value}</div>
                </div>
              ))}
            </div>
            <canvas ref={percChartRef} style={{ maxHeight: '250px' }} />
          </div>
        )}
      </div>
    );
  };

  // ── Render Scatter ──
  const renderScatter = () => (
    <div style={secStyle}>
      <div style={titleStyle}>Scatter Plot — Parameter Correlation</div>
      {renderStationSelector(
        <>
          <div>
            <div style={labelStyle}>X Parameter</div>
            <select style={SEL} value={scatterXParamId} onChange={e => setScatterXParamId(e.target.value)}>
              {filteredParams.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Y Parameter</div>
            <select style={SEL} value={scatterYParamId} onChange={e => setScatterYParamId(e.target.value)}>
              {filteredParams.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>From Date</div>
            <input type="date" style={INP} value={scatterFrom} onChange={e => setScatterFrom(e.target.value)} />
          </div>
          <div>
            <div style={labelStyle}>To Date</div>
            <input type="date" style={INP} value={scatterTo} onChange={e => setScatterTo(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: T.textLabel, cursor: 'pointer' }}>
              <input type="checkbox" checked={scatterShowTrend} onChange={e => setScatterShowTrend(e.target.checked)} />
              Trend line
            </label>
          </div>
        </>
      )}
      <div style={btnRowStyle}>
        <button style={BTN.primary} onClick={handleGenerateScatter} disabled={generating === 'Scatter'}>
          {generating === 'Scatter' ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {sampleNote}
      <div style={{ marginTop: '16px' }}>
        <canvas ref={scatterChartRef} style={{ maxHeight: '350px' }} />
      </div>
      {scatterResult && (
        <div style={{ marginTop: '12px', fontSize: '11px', color: T.textLabel }}>
          {scatterResult.points.length} data points plotted
        </div>
      )}
    </div>
  );

  // ── Render Uptime ──
  const renderUptime = () => (
    <div style={secStyle}>
      <div style={titleStyle}>Uptime Report — Data Availability</div>
      {renderStationSelector(
        <>
          <div>
            <div style={labelStyle}>From Date</div>
            <input type="date" style={INP} value={uptimeFrom} onChange={e => setUptimeFrom(e.target.value)} />
          </div>
          <div>
            <div style={labelStyle}>To Date</div>
            <input type="date" style={INP} value={uptimeTo} onChange={e => setUptimeTo(e.target.value)} />
          </div>
        </>
      )}
      <div style={btnRowStyle}>
        <button style={BTN.primary} onClick={handleGenerateUptime} disabled={generating === 'Uptime'}>
          {generating === 'Uptime' ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {sampleNote}
      <div style={{ marginTop: '16px' }}>
        <canvas ref={uptimeChartRef} style={{ maxHeight: '250px' }} />
      </div>
      {uptimeResult && (
        <div style={{ marginTop: '16px', maxHeight: '300px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>Date</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>Total Points</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>Valid Points</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>Availability %</th>
              </tr>
            </thead>
            <tbody>
              {uptimeResult.days.map((d, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}` }}>{d.date}</td>
                  <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, textAlign: 'right' }}>{d.total_points}</td>
                  <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, textAlign: 'right', fontWeight: '600' }}>{d.valid_points}</td>
                  <td style={{
                    padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, textAlign: 'right', fontWeight: '700',
                    color: d.availability_pct >= 95 ? T.success : d.availability_pct >= 85 ? T.warning : T.danger,
                  }}>{d.availability_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Render Shift ──
  const renderShift = () => (
    <div style={secStyle}>
      <div style={titleStyle}>Shift Report — Per-Shift Statistics</div>
      {renderStationSelector(
        <>
          <div>
            <div style={labelStyle}>From Date</div>
            <input type="date" style={INP} value={shiftFrom} onChange={e => setShiftFrom(e.target.value)} />
          </div>
          <div>
            <div style={labelStyle}>To Date</div>
            <input type="date" style={INP} value={shiftTo} onChange={e => setShiftTo(e.target.value)} />
          </div>
        </>
      )}
        <div style={btnRowStyle}>
          <button style={BTN.primary} onClick={handleGenerateShift} disabled={generating === 'Shift'}>
            {generating === 'Shift' ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {sampleNote}
      <div style={{ marginTop: '16px' }}>
        <canvas ref={shiftChartRef} style={{ maxHeight: '250px' }} />
      </div>
      {shiftResult && (
        <div style={{ marginTop: '16px', maxHeight: '300px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>Shift</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>Average</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>Min</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>Max</th>
              </tr>
            </thead>
            <tbody>
              {shiftResult.shifts.map((s, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, fontWeight: '600' }}>{s.name}</td>
                  <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, textAlign: 'right' }}>{s.avg}</td>
                  <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, textAlign: 'right' }}>{s.min}</td>
                  <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, textAlign: 'right', fontWeight: '600' }}>{s.max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Render Fortnight ──
  const renderFortnight = () => {
    const paramKeys = fortResult?.blocks?.[0]?.parameters ? Object.keys(fortResult.blocks[0].parameters) : [];
    return (
      <div style={secStyle}>
        <div style={titleStyle}>Fortnight Report — 15-Day Blocks</div>
        {renderStationSelector(
          <>
            <div>
              <div style={labelStyle}>Month</div>
              <input type="month" style={INP} value={fortMonth} onChange={e => setFortMonth(e.target.value)} />
            </div>
          </>
        )}
        <div style={btnRowStyle}>
          <button style={BTN.primary} onClick={handleGenerateFortnight} disabled={generating === 'Fortnight'}>
            {generating === 'Fortnight' ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {sampleNote}
        <div style={{ marginTop: '16px' }}>
          <canvas ref={fortChartRef} style={{ maxHeight: '250px' }} />
        </div>
        {fortResult && (
          <div style={{ marginTop: '16px', maxHeight: '300px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>Block</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>Availability %</th>
                  {paramKeys.map(k => (
                    <th key={k} style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fortResult.blocks.map((b, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, fontWeight: '600' }}>{b.label}</td>
                    <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, textAlign: 'right', fontWeight: '700', color: b.availability_pct >= 90 ? T.success : T.warning }}>{b.availability_pct}%</td>
                    {paramKeys.map(k => (
                      <td key={k} style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, textAlign: 'right' }}>{b.parameters[k]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="screen active" id="analyticalReportsScreen">
      <div style={{ ...GLASS_CARD, padding: '20px', marginBottom: '2px' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: T.text, marginBottom: '14px' }}>Analytical Reports</div>
        {renderTabBar()}
      </div>
      {activeTab === 'histogram' && renderHistogram()}
      {activeTab === 'percentile' && renderPercentile()}
      {activeTab === 'scatter' && renderScatter()}
      {activeTab === 'uptime' && renderUptime()}
      {activeTab === 'shift' && renderShift()}
      {activeTab === 'fortnight' && renderFortnight()}
    </div>
  );
};
