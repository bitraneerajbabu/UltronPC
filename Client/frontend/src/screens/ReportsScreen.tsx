import React, { useContext, useState, useEffect, useMemo, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { T, GLASS_CARD } from '../theme';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface ReportSectionProps {
  title: string;
  intervalOptions: { label: string; value: string | number }[];
  fromDate: string; setFromDate: (v: string) => void;
  fromTime: string; setFromTime: (v: string) => void;
  toDate: string; setToDate: (v: string) => void;
  toTime: string; setToTime: (v: string) => void;
  interval: string; setInterval: (v: string) => void;
  onExportPDF: () => void;
  onExportCSV: () => void;
  previewHeaders: string[];
  previewRows: Record<string, any>[];
  loading: boolean;
}

const NORMAL_INTERVALS = [
  { label: '1 min', value: 1 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hr', value: 60 },
  { label: '3 hr', value: 180 },
  { label: '6 hr', value: 360 },
  { label: '12 hr', value: 720 },
  { label: '24 hr', value: 1440 },
];

const AVG_INTERVALS = [
  { label: '15 min avg', value: 'avg_15min' },
  { label: '30 min avg', value: 'avg_30min' },
  { label: '1 hr avg', value: 'avg_1hr' },
  { label: '3 hr avg', value: 'avg_3hr' },
  { label: '6 hr avg', value: 'avg_6hr' },
  { label: '12 hr avg', value: 'avg_12hr' },
  { label: '24 hr avg', value: 'avg_24hr' },
];

const saveAs = async (blob: Blob, name: string, mime: string) => {
  try {
    if ('showSaveFilePicker' in window) {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'Document', accept: { [mime]: ['.' + name.split('.').pop()] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    }
  } catch (e: any) {
    if (e.name === 'AbortError') return false;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
};

const dlDate = (daysOffset = 0) => {
  const d = new Date(Date.now() + daysOffset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtTs = (date: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${p(date.getMonth() + 1)}/${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
};

const ReportSection = ({
  title, intervalOptions,
  fromDate, setFromDate, fromTime, setFromTime,
  toDate, setToDate, toTime, setToTime,
  interval, setInterval,
  onExportPDF, onExportCSV,
  previewHeaders, previewRows, loading,
}: ReportSectionProps) => (
  <div className="card" style={{ marginTop: '18px' }}>
    <div className="section-title">{title}</div>
    {loading && <div className="spinner" style={{ margin: '12px 0' }}>Loading...</div>}
    <div className="filter-grid">
      <div className="form-group">
        <label className="form-label">Interval</label>
        <select className="form-select" value={interval} onChange={e => setInterval(e.target.value)}>
          {intervalOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">From Date</label>
        <input type="date" className="form-input" value={fromDate} onChange={e => setFromDate(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">From Time</label>
        <input type="time" className="form-input" value={fromTime} onChange={e => setFromTime(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">To Date</label>
        <input type="date" className="form-input" value={toDate} onChange={e => setToDate(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">To Time</label>
        <input type="time" className="form-input" value={toTime} onChange={e => setToTime(e.target.value)} />
      </div>
    </div>
    <div className="toolbar" style={{ marginTop: '16px' }}>
      <button className="btn btn-primary" onClick={onExportPDF} disabled={loading}>Export PDF</button>
      <button className="btn" onClick={onExportCSV} disabled={loading}>Export CSV</button>
    </div>
    {(previewHeaders.length > 0 && previewRows.length > 0) && (
      <div className="table-wrapper" style={{ marginTop: '16px' }}>
        <table className="table">
          <thead>
            <tr>
              {previewHeaders.map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {previewRows.slice(0, 50).map((row, idx) => (
              <tr key={idx}>
                <td>{row['Date & Time']}</td>
                {previewHeaders.slice(1).map(h => {
                  const val = row[h];
                  return <td key={h} style={{ fontWeight: val !== 'NA' ? '600' : '400' }}>{val}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export const ReportsScreen = () => {
  const { stations, devices, parameters, API_BASE, showToast, parseUtcDate, authFetch } = useContext(AppContext);

  const [stationId, setStationId] = useState('');
  const [normalInterval, setNormalInterval] = useState('1');
  const [normalFromDate, setNormalFromDate] = useState(dlDate(-1));
  const [normalFromTime, setNormalFromTime] = useState('00:00');
  const [normalToDate, setNormalToDate] = useState(dlDate(0));
  const [normalToTime, setNormalToTime] = useState('23:59');
  const [normalHeaders, setNormalHeaders] = useState<string[]>([]);
  const [normalRows, setNormalRows] = useState<Record<string, any>[]>([]);
  const [normalLoading, setNormalLoading] = useState(false);

  const [selectedParamIds, setSelectedParamIds] = useState<string[]>([]);

  const [avgInterval, setAvgInterval] = useState('avg_1hr');
  const [avgFromDate, setAvgFromDate] = useState(dlDate(-1));
  const [avgFromTime, setAvgFromTime] = useState('00:00');
  const [avgToDate, setAvgToDate] = useState(dlDate(0));
  const [avgToTime, setAvgToTime] = useState('23:59');
  const [avgHeaders, setAvgHeaders] = useState<string[]>([]);
  const [avgRows, setAvgRows] = useState<Record<string, any>[]>([]);
  const [avgLoading, setAvgLoading] = useState(false);

  // ─── Trend Chart state ──────────────────────────────────────
  const [trendParamId, setTrendParamId] = useState('');
  const [trendResolution, setTrendResolution] = useState('raw');
  const [trendFromDate, setTrendFromDate] = useState(dlDate(-1));
  const [trendFromTime, setTrendFromTime] = useState('00:00');
  const [trendToDate, setTrendToDate] = useState(dlDate(0));
  const [trendToTime, setTrendToTime] = useState('23:59');
  const [trendSeries, setTrendSeries] = useState<any>(null);
  const [trendRows, setTrendRows] = useState<any[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<ChartJS | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const allStations = useMemo(() => {
    return stations
      .filter(st => {
        return parameters.some(p => {
          const dev = devices.find(d => String(d.id) === String(p.device_id));
          return dev && String(dev.station_id) === String(st.id);
        });
      })
      .map(s => ({ id: String(s.id), name: s.name }));
  }, [stations, parameters, devices]);

  useEffect(() => {
    if (allStations.length && !stationId) setStationId(allStations[0].id);
  }, [allStations, stationId]);

  const filteredParams = useMemo(() => {
    return parameters.filter(p => {
      if (!stationId) return true;
      const dev = devices.find(d => String(d.id) === String(p.device_id));
      if (!dev) return false;
      return String(dev.station_id) === stationId;
    });
  }, [parameters, stationId, devices]);

  // Chart cleanup
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) { chartInstanceRef.current.destroy(); chartInstanceRef.current = null; }
    };
  }, []);

  // Auto-select first param for trend
  useEffect(() => {
    if (filteredParams.length) setTrendParamId(filteredParams[0].id);
    else setTrendParamId('');
  }, [filteredParams]);

  const fmtShortDate = (isoString: string) => {
    const d = parseUtcDate(isoString);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const handleGenerateTrend = async () => {
    if (!trendParamId) { showToast('Select a parameter.', 'warn'); return; }
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setTrendLoading(true);
    const startIso = `${trendFromDate}T${trendFromTime}:00Z`;
    const endIso = `${trendToDate}T${trendToTime}:59Z`;

    try {
      const url = `${API_BASE}/trends/chart-data?parameter_ids=${trendParamId}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${trendResolution}&limit=100000`;
      const res = await authFetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resData = await res.json();
      const series = resData.series && resData.series[0];
      if (!series || !series.labels.length) {
        showToast('No telemetry data found.', 'warn');
        setTrendSeries(null); setTrendRows([]);
        if (chartInstanceRef.current) { chartInstanceRef.current.destroy(); chartInstanceRef.current = null; }
        return;
      }

      setTrendSeries(series);
      const rows = series.labels.map((ts: string, idx: number) => ({
        timestamp: fmtShortDate(ts),
        parameter: series.name,
        value: series.values[idx] !== null ? Number(series.values[idx]).toFixed(2) : 'NA',
        unit: series.unit || '',
        quality: (() => {
          const raw = series.qualities[idx];
          const q = raw ? raw.toUpperCase() : 'GOOD';
          return ({ U: 'GOOD', O: 'OUT_OF_RANGE', E: 'ERROR', N: 'NEGATIVE' } as Record<string, string>)[q] || q;
        })(),
        source: 'POLL'
      }));
      setTrendRows(rows);

      if (chartRef.current) {
        if (chartInstanceRef.current) chartInstanceRef.current.destroy();
        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;
        const shortLabels = series.labels.map((lbl: string) => fmtShortDate(lbl));
        const paramObj = parameters.find(p => String(p.id) === String(trendParamId)) || {};
        const limitLines: { value: number; color: string; label: string }[] = [
          ['alarm_high_high', '#ef4444', 'H/H'],
          ['alarm_high', '#f59e0b', 'High'],
          ['alarm_low', '#f59e0b', 'Low'],
          ['alarm_low_low', '#ef4444', 'L/L'],
        ].filter(([k]) => (paramObj as any)[k] != null && !isNaN(Number((paramObj as any)[k])))
         .map(([k, c, l]) => ({ value: Number((paramObj as any)[k]), color: c as string, label: l as string }));
        const maxLimit = limitLines.length > 0 ? Math.max(...limitLines.map(ll => ll.value)) : undefined;
        const minLimit = limitLines.length > 0 ? Math.min(...limitLines.map(ll => ll.value)) : undefined;

        chartInstanceRef.current = new ChartJS(ctx, {
          type: 'line',
          data: {
            labels: shortLabels,
            datasets: [{
              label: `${series.name} (${series.unit})`,
              data: series.values,
              borderColor: '#0d4f49',
              backgroundColor: 'rgba(13,79,73,0.07)',
              fill: true,
              tension: trendResolution === 'raw' ? 0 : 0.3,
              pointBackgroundColor: '#0d4f49',
              pointBorderColor: '#fff',
              pointRadius: 2,
              pointHoverRadius: 5
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: { labels: { color: '#475569', font: { weight: 600, family: 'Inter, sans-serif' } } }
            },
            scales: {
              x: { ticks: { color: '#94a3b8', font: { size: 10 }, maxTicksLimit: 15 }, grid: { color: '#f1f5f9' } },
              y: {
                ticks: { color: '#94a3b8', font: { size: 11 } },
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
      showToast(`Trend loaded — ${series.labels.length} points.`);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      showToast('Failed to fetch trend.', 'error');
    } finally {
      setTrendLoading(false);
    }
  };

  const handleResetTrend = () => {
    setTrendFromDate(dlDate(-1)); setTrendFromTime('00:00');
    setTrendToDate(dlDate(0)); setTrendToTime('23:59');
    setTrendResolution('raw');
    showToast('Filters reset.');
  };

  const downloadTrendPNG = async () => {
    if (!chartInstanceRef.current) return showToast('Generate a trend first.', 'warn');
    const dataUrl = chartInstanceRef.current.toBase64Image();
    const blob = await (await fetch(dataUrl)).blob();
    const name = `Trend_${trendSeries?.name}_${Date.now()}.png`;
    await saveAs(blob, name, 'image/png');
    showToast('Trend image exported as PNG.');
  };

  const downloadTrendPDF = async () => {
    if (!trendParamId) return showToast('Generate a trend first.', 'warn');
    setTrendLoading(true);
    const startIso = `${trendFromDate}T${trendFromTime}:00Z`;
    const endIso = `${trendToDate}T${trendToTime}:59Z`;
    try {
      const url = `${API_BASE}/reports/pdf?parameter_ids=${trendParamId}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${trendResolution}&station_name=${encodeURIComponent(stationId)}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const name = `Trend_${trendSeries?.name || 'report'}_${Date.now()}.pdf`;
      await saveAs(blob, name, 'application/pdf');
      showToast('PDF saved.');
    } catch (e: any) {
      showToast('PDF export failed.', 'error');
    } finally {
      setTrendLoading(false);
    }
  };

  const exportTrendCSV = async () => {
    if (!trendParamId) return showToast('Generate a trend first.', 'warn');
    setTrendLoading(true);
    const startIso = `${trendFromDate}T${trendFromTime}:00Z`;
    const endIso = `${trendToDate}T${trendToTime}:59Z`;
    try {
      const url = `${API_BASE}/trends/export-csv?parameter_ids=${trendParamId}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${trendResolution}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const name = `TrendData_${trendSeries?.name || 'trend'}_${Date.now()}.csv`;
      await saveAs(blob, name, 'text/csv');
      showToast('CSV saved.');
    } catch (e: any) {
      showToast('CSV export failed.', 'error');
    } finally {
      setTrendLoading(false);
    }
  };

  useEffect(() => {
    setSelectedParamIds(filteredParams.map(p => String(p.id)));
  }, [filteredParams]);

  const toggleParam = (id: string) => {
    setSelectedParamIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
  };

  const fetchData = async (isNormal: boolean) => {
    if (!selectedParamIds.length) { showToast('No parameters selected.', 'warn'); return null; }
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const paramIds = selectedParamIds.join(',');
    const fromD = isNormal ? normalFromDate : avgFromDate;
    const fromT = isNormal ? normalFromTime : avgFromTime;
    const toD = isNormal ? normalToDate : avgToDate;
    const toT = isNormal ? normalToTime : avgToTime;
    const startIso = `${fromD}T${fromT}:00Z`;
    const endIso = `${toD}T${toT}:59Z`;
    const stepMin = isNormal ? Number(normalInterval) : 0;
    const avgType = isNormal ? 'raw' : avgInterval;

    try {
      const url = `${API_BASE}/trends/chart-data?parameter_ids=${paramIds}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${avgType}&limit=100000`;
      const res = await authFetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resData: any = await res.json();
      const seriesList: any[] = resData.series || [];
      if (!seriesList.length || !seriesList[0].labels.length) {
        showToast('No telemetry data for selected range.', 'warn');
        return null;
      }

      const headers = ['Date & Time', ...seriesList.map(s => s.name)];
      const timestamps = [...new Set(seriesList.flatMap(s => s.labels))].sort();
      const dataByTs: Record<string, Record<string, any>> = {};
      timestamps.forEach(ts => { dataByTs[ts] = {}; });
      seriesList.forEach(s => {
        s.labels.forEach((lbl: string, idx: number) => { if (dataByTs[lbl]) dataByTs[lbl][s.name] = s.values[idx]; });
      });

      let filteredTimestamps = timestamps;
      if (isNormal && stepMin > 1) {
        const seen = new Set<string>();
        filteredTimestamps = timestamps.filter(ts => {
          const d = new Date(ts);
          const bucketKey = Math.floor(d.getUTCMinutes() / stepMin);
          const key = `${d.toISOString().slice(0,10)}:${d.getUTCHours()}:${bucketKey}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (filteredTimestamps.length > 0 && timestamps.length > 0) {
          if (filteredTimestamps[0] !== timestamps[0]) filteredTimestamps.unshift(timestamps[0]);
          if (filteredTimestamps[filteredTimestamps.length - 1] !== timestamps[timestamps.length - 1]) filteredTimestamps.push(timestamps[timestamps.length - 1]);
        }
      }

      const rows = filteredTimestamps.map(ts => {
        const row: Record<string, any> = { 'Date & Time': fmtTs(parseUtcDate(ts)) };
        seriesList.forEach((s, idx) => {
          const val = dataByTs[ts][s.name];
          row[headers[idx + 1]] = val !== null && val !== undefined ? Number(val).toFixed(2) : 'NA';
        });
        return row;
      });

      return { headers, rows };
    } catch (e: any) {
      if (e.name === 'AbortError') return null;
      showToast('Could not fetch data.', 'error');
      return null;
    }
  };

  const handlePreview = async (isNormal: boolean) => {
    if (isNormal) setNormalLoading(true); else setAvgLoading(true);
    const result = await fetchData(isNormal);
    if (result) {
      if (isNormal) { setNormalHeaders(result.headers); setNormalRows(result.rows); }
      else { setAvgHeaders(result.headers); setAvgRows(result.rows); }
      showToast(`${result.rows.length} rows loaded.`);
    }
    if (isNormal) setNormalLoading(false); else setAvgLoading(false);
  };

  const handleExport = async (isNormal: boolean, format: 'pdf' | 'csv') => {
    if (!selectedParamIds.length) return showToast('No parameters selected.', 'warn');
    const paramIds = selectedParamIds.join(',');
    const fromD = isNormal ? normalFromDate : avgFromDate;
    const fromT = isNormal ? normalFromTime : avgFromTime;
    const toD = isNormal ? normalToDate : avgToDate;
    const toT = isNormal ? normalToTime : avgToTime;
    const startIso = `${fromD}T${fromT}:00Z`;
    const endIso = `${toD}T${toT}:59Z`;
    const resolvedSt = stations.find(s => String(s.id) === stationId || s.name === stationId);
    const stName = resolvedSt?.name || stationId || 'UltrON Station';
    const stepMin = isNormal ? Number(normalInterval) : 0;
    const avgType = isNormal ? 'raw' : avgInterval;

    const numMinutes = (new Date(`${toD}T${toT}`).getTime() - new Date(`${fromD}T${fromT}`).getTime()) / 60000;
    const numDays = numMinutes / 1440;
    const estRows = isNormal
      ? Math.ceil(numMinutes / Math.max(stepMin, 1))
      : Math.ceil(numMinutes / ({ avg_15min: 15, avg_30min: 30, avg_1hr: 60, avg_3hr: 180, avg_6hr: 360, avg_12hr: 720, avg_24hr: 1440 } as Record<string, number>)[avgInterval] || 60);
    if (numDays > 15 || estRows > 21600) {
      if (!window.confirm(`This export covers ${numDays.toFixed(1)} days (~${estRows.toLocaleString()} rows). Continue?`)) return;
    }

    if (isNormal) setNormalLoading(true); else setAvgLoading(true);

    try {
      const endpoint = format === 'csv' ? '/reports/export-csv' : '/reports/pdf';
      const url = `${API_BASE}${endpoint}?parameter_ids=${paramIds}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${avgType}&step_minutes=${stepMin}&station_name=${encodeURIComponent(stName)}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = format === 'csv' ? 'csv' : 'pdf';
      const name = `UltrON_Report_${fromD}_to_${toD}.${ext}`;
      const mime = format === 'csv' ? 'text/csv' : 'application/pdf';
      await saveAs(blob, name, mime);
      showToast(`${format.toUpperCase()} saved — also available in the Reports folder next to the app.`);
    } catch (e: any) {
      showToast(`${format.toUpperCase()} export failed.`, 'error');
    } finally {
      if (isNormal) setNormalLoading(false); else setAvgLoading(false);
    }
  };

  return (
    <div className="screen active" id="reportsScreen">
      <div className="card" style={{ marginBottom: '2px' }}>
        <div className="section-title">Report Filters</div>
        <div className="filter-grid">
          <div className="form-group">
            <label className="form-label">Station Name</label>
            <select className="form-select" value={stationId} onChange={e => setStationId(e.target.value)}>
              {allStations.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Parameter</label>
            <div className="form-input" style={{ height: 'auto', minHeight: '38px', maxHeight: '180px', overflowY: 'auto', padding: '4px 8px', width: '220px' }}>
              {filteredParams.length === 0 ? (
                <div style={{ color: T.textFaint, fontSize: '12px', padding: '4px 0' }}>No parameters</div>
              ) : (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', fontSize: '12px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedParamIds.length === filteredParams.length} onChange={e => setSelectedParamIds(e.target.checked ? filteredParams.map(p => String(p.id)) : [])} />
                    <span style={{ fontWeight: '600' }}>Select All</span>
                  </label>
                  {filteredParams.map(p => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', fontSize: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedParamIds.includes(String(p.id))} onChange={() => toggleParam(String(p.id))} />
                      <span>{p.id}: {p.tag_name}</span>
                    </label>
                  ))}
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn" style={{ padding: '7px 18px' }} onClick={() => handlePreview(true)} disabled={normalLoading}>Refresh Preview</button>
          </div>
        </div>
      </div>

      <ReportSection
        title="Normal Reports"
        intervalOptions={NORMAL_INTERVALS}
        fromDate={normalFromDate} setFromDate={setNormalFromDate}
        fromTime={normalFromTime} setFromTime={setNormalFromTime}
        toDate={normalToDate} setToDate={setNormalToDate}
        toTime={normalToTime} setToTime={setNormalToTime}
        interval={normalInterval} setInterval={setNormalInterval}
        onExportPDF={() => handleExport(true, 'pdf')}
        onExportCSV={() => handleExport(true, 'csv')}
        previewHeaders={normalHeaders}
        previewRows={normalRows}
        loading={normalLoading}
      />

      <ReportSection
        title="Average Reports"
        intervalOptions={AVG_INTERVALS}
        fromDate={avgFromDate} setFromDate={setAvgFromDate}
        fromTime={avgFromTime} setFromTime={setAvgFromTime}
        toDate={avgToDate} setToDate={setAvgToDate}
        toTime={avgToTime} setToTime={setAvgToTime}
        interval={avgInterval} setInterval={setAvgInterval}
        onExportPDF={() => handleExport(false, 'pdf')}
        onExportCSV={() => handleExport(false, 'csv')}
        previewHeaders={avgHeaders}
        previewRows={avgRows}
        loading={avgLoading}
      />

      {/* ─── Trend Chart Section ──────────────────────────── */}
      <div className="card" style={{ marginTop: '18px' }}>
        <div className="section-title">Trend Chart</div>
        <div className="filter-grid">
          <div className="form-group">
            <label className="form-label">Parameter</label>
            <select className="form-select" value={trendParamId} onChange={e => setTrendParamId(e.target.value)}>
              {filteredParams.map(p => <option value={p.id} key={p.id}>{p.name} ({p.tag_name})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Resolution</label>
            <select className="form-select" value={trendResolution} onChange={e => setTrendResolution(e.target.value)}>
              <option value="raw">1 Minute Raw</option>
              <option value="avg_5min">5 Minute Average</option>
              <option value="avg_15min">15 Minute Average</option>
              <option value="avg_30min">30 Minute Average</option>
              <option value="avg_1hr">1 Hour Average</option>
              <option value="avg_3hr">3 Hour Average</option>
              <option value="avg_6hr">6 Hour Average</option>
              <option value="avg_12hr">12 Hour Average</option>
              <option value="avg_24hr">24 Hour Average</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Start Date</label>
            <input type="date" className="form-input" value={trendFromDate} onChange={e => setTrendFromDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Start Time</label>
            <input type="time" className="form-input" value={trendFromTime} onChange={e => setTrendFromTime(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">End Date</label>
            <input type="date" className="form-input" value={trendToDate} onChange={e => setTrendToDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">End Time</label>
            <input type="time" className="form-input" value={trendToTime} onChange={e => setTrendToTime(e.target.value)} />
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: '20px' }}>
          <button className="btn btn-primary" onClick={handleGenerateTrend} disabled={trendLoading}>Generate Trend</button>
          <button className="btn" onClick={handleResetTrend} disabled={trendLoading}>Reset Filters</button>
          <button className="btn" onClick={downloadTrendPNG} disabled={trendLoading}>Export PNG</button>
          <button className="btn" onClick={downloadTrendPDF} disabled={trendLoading}>Export PDF</button>
          <button className="btn" onClick={exportTrendCSV} disabled={trendLoading}>Export CSV</button>
        </div>
        {trendLoading && <div className="spinner" style={{ marginTop: '12px' }}>Loading...</div>}
      </div>

      <div className="card">
        <div className="section-title">Trend Graph</div>
        {!trendSeries && !trendLoading && <div className="table-empty" style={{ padding: '40px', textAlign: 'center' }}>Set filters and click "Generate Trend".</div>}
        <canvas ref={chartRef} id="trendChart" height="100" style={{ display: trendSeries ? 'block' : 'none' }}></canvas>
      </div>

      <div className="card">
        <div className="section-title">Trend Data Table</div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Parameter</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Quality</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {trendRows.length === 0 ? (
                <tr><td colSpan={6} className="table-empty">Set filters and click "Generate Trend".</td></tr>
              ) : (
                trendRows.map((r, idx) => (
                  <tr key={idx}>
                    <td>{r.timestamp}</td>
                    <td>{r.parameter}</td>
                    <td><strong>{r.value}</strong></td>
                    <td>{r.unit}</td>
                    <td><span className={r.quality === 'GOOD' ? 'badge-success' : 'badge-error'}>{r.quality}</span></td>
                    <td>{r.source}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
