import React, { useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { T, GLASS_CARD } from '../theme';
import { DateTimeRangePicker } from '../components/DateTimeRangePicker';
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
  onExportExcel: () => void;
  previewHeaders: string[];
  previewRows: Record<string, any>[];
  loading: boolean;
}

const NORMAL_INTERVALS = [
  { label: '1 min', value: 1 },
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hr', value: 60 },
  { label: '3 hr', value: 180 },
  { label: '6 hr', value: 360 },
  { label: '12 hr', value: 720 },
  { label: '24 hr', value: 1440 },
];

const AVG_INTERVALS = [
  { label: '5 min avg', value: 'avg_5min' },
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

export const ReportsScreen = React.memo(() => {
  const { stations, devices, parameters, API_BASE, showToast, parseUtcDate, authFetch } = useContext(AppContext);

  // ─── Report State ──────────────────────────────────────────
  const [stationId, setStationId] = useState('');
  const [reportMode, setReportMode] = useState<'normal' | 'average'>('normal');
  const [interval, setInterval] = useState('1');
  const [fromDate, setFromDate] = useState(dlDate(-1));
  const [fromTime, setFromTime] = useState('00:00');
  const [toDate, setToDate] = useState(dlDate(0));
  const [toTime, setToTime] = useState('23:59');
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, any>[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedParamIds, setSelectedParamIds] = useState<string[]>([]);

  // ─── Trend Chart State ─────────────────────────────────────
  const [trendParamId, setTrendParamId] = useState('');
  const [trendResolution, setTrendResolution] = useState('raw');
  const [trendType, setTrendType] = useState<'line' | 'step'>('line');
  const [timePreset, setTimePreset] = useState<'1h' | '6h' | '12h' | '1d' | '7d' | '30d' | 'custom'>('1d');
  const [trendFromDate, setTrendFromDate] = useState(dlDate(-1));
  const [trendFromTime, setTrendFromTime] = useState('00:00');
  const [trendToDate, setTrendToDate] = useState(dlDate(0));
  const [trendToTime, setTrendToTime] = useState('23:59');
  const [trendSeries, setTrendSeries] = useState<any>(null);
  const [trendRows, setTrendRows] = useState<any[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendGenerated, setTrendGenerated] = useState(false);
  const [trendStats, setTrendStats] = useState<{ current: string; min: string; max: string; avg: string } | null>(null);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<ChartJS | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleModeChange = (mode: 'normal' | 'average') => {
    setReportMode(mode);
    if (mode === 'normal') {
      setInterval('1');
    } else {
      setInterval('avg_1hr');
    }
  };

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
    if (stations.length && !stationId) setStationId(String(stations[0].id));
  }, [stations, stationId]);

  const filteredParams = useMemo(() => {
    if (!stationId) return parameters;
    return parameters.filter(p => {
      const dev = devices.find(d => String(d.id) === String(p.device_id));
      if (!dev) return false;
      return String(dev.station_id) === String(stationId);
    });
  }, [parameters, stationId, devices]);

  // Sync selected parameters when filtered params change
  useEffect(() => {
    setSelectedParamIds(filteredParams.map(p => String(p.id)));
  }, [filteredParams]);

  // Chart cleanup
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) { chartInstanceRef.current.destroy(); chartInstanceRef.current = null; }
    };
  }, []);

  // Auto-select first param for trend
  useEffect(() => {
    if (filteredParams.length) setTrendParamId(String(filteredParams[0].id));
    else setTrendParamId('');
  }, [filteredParams]);

  const fmtShortDate = (isoString: string) => {
    const d = parseUtcDate(isoString);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const fmtExactIso = (isoString: string) => {
    const d = parseUtcDate(isoString);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  // ─── Fetch & Render Trend ──────────────────────────────────
  const fetchAndRenderTrend = useCallback(async (
    paramToUse: string,
    fDate: string,
    fTime: string,
    tDate: string,
    tTime: string,
    resType: string,
    tType: 'line' | 'step'
  ) => {
    if (!paramToUse) { showToast('Select a parameter to analyze.', 'warn'); return; }
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setTrendLoading(true);
    setTrendGenerated(true);

    const startIso = `${fDate}T${fTime}:00Z`;
    const endIso = `${tDate}T${tTime}:59Z`;

    try {
      const url = `${API_BASE}/trends/chart-data?parameter_ids=${paramToUse}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${resType}&limit=100000`;
      const res = await authFetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resData = await res.json();
      const series = resData.series && resData.series[0];
      if (!series || !series.labels.length) {
        showToast('No telemetry data in this range.', 'warn');
        setTrendSeries({ empty: true });
        setTrendRows([]);
        setTrendStats(null);
        if (chartInstanceRef.current) { chartInstanceRef.current.destroy(); chartInstanceRef.current = null; }
        return;
      }

      setTrendSeries(series);

      // Compute exact summary stats from raw values
      const validVals: number[] = series.values.filter((v: any) => v !== null && v !== undefined && !isNaN(Number(v))).map(Number);
      if (validVals.length > 0) {
        const lastVal = validVals[validVals.length - 1];
        const minVal = Math.min(...validVals);
        const maxVal = Math.max(...validVals);
        const avgVal = validVals.reduce((a, b) => a + b, 0) / validVals.length;
        const fmtVal = (n: number) => n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') || '0';
        setTrendStats({
          current: `${fmtVal(lastVal)} ${series.unit || ''}`.trim(),
          min: `${fmtVal(minVal)} ${series.unit || ''}`.trim(),
          max: `${fmtVal(maxVal)} ${series.unit || ''}`.trim(),
          avg: `${fmtVal(avgVal)} ${series.unit || ''}`.trim(),
        });
      } else {
        setTrendStats(null);
      }

      const rows = series.labels.map((ts: string, idx: number) => ({
        timestamp: fmtShortDate(ts),
        exactTimestamp: fmtExactIso(ts),
        parameter: series.name,
        value: series.values[idx] !== null && series.values[idx] !== undefined ? Number(series.values[idx]).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : 'NA',
        unit: series.unit || '',
        quality: (() => {
          const raw = series.qualities ? series.qualities[idx] : null;
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
        const paramObj = parameters.find(p => String(p.id) === String(paramToUse)) || {};

        // Alarm limit lines (Warning / Critical)
        const limitLines: { value: number; color: string; label: string }[] = [
          ['alarm_high_high', '#ef4444', 'Critical High (H/H)'],
          ['alarm_high', '#f59e0b', 'Warning High (High)'],
          ['alarm_low', '#f59e0b', 'Warning Low (Low)'],
          ['alarm_low_low', '#ef4444', 'Critical Low (L/L)'],
        ].filter(([k]) => (paramObj as any)[k] != null && !isNaN(Number((paramObj as any)[k])))
         .map(([k, c, l]) => ({ value: Number((paramObj as any)[k]), color: c as string, label: l as string }));

        const maxLimit = limitLines.length > 0 ? Math.max(...limitLines.map(ll => ll.value)) : undefined;
        const minLimit = limitLines.length > 0 ? Math.min(...limitLines.map(ll => ll.value)) : undefined;

        const dataMax = validVals.length > 0 ? Math.max(...validVals) : 10;
        const dataMin = validVals.length > 0 ? Math.min(...validVals) : 0;
        const margin = Math.max((dataMax - dataMin) * 0.1, 0.5);

        const ySuggestedMax = maxLimit !== undefined ? Math.max(maxLimit * 1.05, dataMax + margin) : dataMax + margin;
        const ySuggestedMin = minLimit !== undefined ? Math.min(minLimit * 0.95, dataMin - margin) : Math.max(0, dataMin - margin);

        chartInstanceRef.current = new ChartJS(ctx, {
          type: 'line',
          data: {
            labels: shortLabels,
            datasets: [{
              label: `${series.name} (${series.unit || ''})`,
              data: series.values,
              borderColor: '#0F766E',
              backgroundColor: 'rgba(15, 118, 110, 0.08)',
              fill: true,
              // Standard industrial line: tension 0 (no artificial spline smoothing), stepped only if step type
              tension: 0,
              stepped: tType === 'step' ? 'before' : false,
              spanGaps: false, // Preserves visual gaps for missing telemetry records
              pointBackgroundColor: '#0F766E',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 1.5,
              pointRadius: shortLabels.length > 200 ? 0 : 3,
              pointHoverRadius: 6,
              borderWidth: 2,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: {
                display: true,
                position: 'top',
                labels: {
                  color: '#334155',
                  font: { size: 12, weight: 600, family: "'Inter', 'Source Sans 3', sans-serif" },
                  usePointStyle: true,
                }
              },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                titleColor: '#f8fafc',
                bodyColor: '#f8fafc',
                padding: 10,
                boxPadding: 4,
                cornerRadius: 6,
                callbacks: {
                  title: (items: any[]) => {
                    if (!items.length) return '';
                    const idx = items[0].dataIndex;
                    return `Timestamp: ${rows[idx]?.exactTimestamp || items[0].label}`;
                  },
                  label: (item: any) => {
                    const idx = item.dataIndex;
                    const val = item.raw !== null && item.raw !== undefined ? item.raw : 'NA';
                    const q = rows[idx]?.quality || 'GOOD';
                    return [
                      `Parameter: ${series.name}`,
                      `Value: ${val} ${series.unit || ''}`,
                      `Quality: ${q}`,
                    ];
                  }
                }
              }
            },
            scales: {
              x: {
                ticks: {
                  color: '#64748b',
                  font: { size: 10, family: "'Inter', 'Source Sans 3', sans-serif" },
                  maxTicksLimit: 12,
                  maxRotation: 0,
                },
                grid: { color: 'rgba(15, 110, 86, 0.06)' },
              },
              y: {
                title: {
                  display: true,
                  text: series.unit ? `Value (${series.unit})` : 'Value',
                  color: '#64748b',
                  font: { size: 11, weight: 600 }
                },
                ticks: {
                  color: '#64748b',
                  font: { size: 11, family: "'Inter', 'Source Sans 3', sans-serif" },
                },
                grid: { color: 'rgba(15, 110, 86, 0.06)' },
                suggestedMax: ySuggestedMax,
                suggestedMin: ySuggestedMin,
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
      showToast(`Historical trend loaded — ${series.labels.length} readings.`);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      showToast('Failed to fetch trend.', 'error');
    } finally {
      setTrendLoading(false);
    }
  }, [API_BASE, authFetch, parseUtcDate, parameters, showToast]);

  const handleGenerateTrend = () => {
    fetchAndRenderTrend(trendParamId, trendFromDate, trendFromTime, trendToDate, trendToTime, trendResolution, trendType);
  };

  // ─── Time Preset Click Handler ─────────────────────────────
  const handleSelectPreset = (preset: '1h' | '6h' | '12h' | '1d' | '7d' | '30d' | 'custom') => {
    setTimePreset(preset);
    if (preset === 'custom') return;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toD = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const toT = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    let fromMs = now.getTime();
    let res = 'raw';
    if (preset === '1h') { fromMs -= 3600 * 1000; res = 'raw'; }
    else if (preset === '6h') { fromMs -= 6 * 3600 * 1000; res = 'raw'; }
    else if (preset === '12h') { fromMs -= 12 * 3600 * 1000; res = 'raw'; }
    else if (preset === '1d') { fromMs -= 24 * 3600 * 1000; res = 'raw'; }
    else if (preset === '7d') { fromMs -= 7 * 86400 * 1000; res = 'avg_15min'; }
    else if (preset === '30d') { fromMs -= 30 * 86400 * 1000; res = 'avg_1hr'; }

    const fromDateObj = new Date(fromMs);
    const fromD = `${fromDateObj.getFullYear()}-${pad(fromDateObj.getMonth() + 1)}-${pad(fromDateObj.getDate())}`;
    const fromT = `${pad(fromDateObj.getHours())}:${pad(fromDateObj.getMinutes())}`;

    setTrendFromDate(fromD);
    setTrendFromTime(fromT);
    setTrendToDate(toD);
    setTrendToTime(toT);
    setTrendResolution(res);

    if (trendParamId) {
      fetchAndRenderTrend(trendParamId, fromD, fromT, toD, toT, res, trendType);
    }
  };

  const handleTypeChange = (newType: 'line' | 'step') => {
    setTrendType(newType);
    if (trendSeries && !trendSeries.empty) {
      fetchAndRenderTrend(trendParamId, trendFromDate, trendFromTime, trendToDate, trendToTime, trendResolution, newType);
    }
  };

  const handleResetTrend = () => {
    setTrendFromDate(dlDate(-1)); setTrendFromTime('00:00');
    setTrendToDate(dlDate(0)); setTrendToTime('23:59');
    setTrendResolution('raw');
    setTrendType('line');
    setTimePreset('1d');
    setTrendSeries(null); setTrendRows([]); setTrendGenerated(false); setTrendStats(null);
    if (chartInstanceRef.current) { chartInstanceRef.current.destroy(); chartInstanceRef.current = null; }
    showToast('Filters reset.');
  };

  const downloadTrendPNG = async () => {
    const canvas = chartRef.current;
    if (!canvas || !chartInstanceRef.current) return showToast('No chart data to export.', 'warn');
    const dataUrl = canvas.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1]);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const blob = new Blob([buf], { type: 'image/png' });
    const name = `Trend_${trendSeries?.name || 'chart'}_${Date.now()}.png`;
    await saveAs(blob, name, 'image/png');
    showToast('Trend image exported as PNG.');
  };

  const downloadTrendPDF = async () => {
    if (!chartInstanceRef.current) return showToast('No chart data to export.', 'warn');
    setTrendLoading(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pw = 297, ph = 210;

      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.src = '/assets/sunshine_logo.png';
      await new Promise<void>(res => { logoImg.onload = () => res(); logoImg.onerror = () => res(); });
      if (logoImg.complete && logoImg.naturalWidth > 0) {
        const lw = 40, lh = logoImg.naturalHeight * (lw / logoImg.naturalWidth);
        doc.addImage(logoImg, 'PNG', (pw - lw) / 2, 6, lw, lh);
      }

      doc.setFontSize(14);
      doc.text('Historical Trend Chart', pw / 2, logoImg.complete && logoImg.naturalWidth > 0 ? 32 : 18, { align: 'center' });

      const canvas = chartRef.current;
      if (canvas) {
        const chartImg = canvas.toDataURL('image/png');
        const cw = 260, ch = 130;
        doc.addImage(chartImg, 'PNG', (pw - cw) / 2, 42, cw, ch);
      }

      doc.setFontSize(9);
      const stName = allStations.find(s => s.id === stationId)?.name || stationId;
      const paramObj = parameters.find(p => String(p.id) === String(trendParamId));
      const label = paramObj ? `${paramObj.name} (${paramObj.tag_name})` : `Param #${trendParamId}`;
      doc.text(`Station: ${stName}  |  Parameter: ${label}  |  Resolution: ${trendResolution}`, pw / 2, 190, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, pw / 2, 197, { align: 'center' });

      const blob = doc.output('blob');
      const name = `Trend_${trendSeries?.name || 'chart'}_${Date.now()}.pdf`;
      await saveAs(blob, name, 'application/pdf');
      showToast('Trend chart PDF exported.');
    } catch (e: any) {
      showToast('PDF export failed.', 'error');
    } finally {
      setTrendLoading(false);
    }
  };

  const downloadTrendCSV = async () => {
    if (!trendRows.length) return showToast('No trend data to export.', 'warn');
    const cols = ['Timestamp', 'Parameter', 'Value', 'Unit', 'Quality', 'Source'];
    const rows = trendRows.map(r => [r.exactTimestamp || r.timestamp, r.parameter, r.value, r.unit, r.quality, r.source]);
    const csv = [cols.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const name = `Trend_${trendSeries?.name || 'chart'}_${Date.now()}.csv`;
    await saveAs(blob, name, 'text/csv');
    showToast('Trend data exported as CSV.');
  };

  const toggleParam = (id: string) => {
    setSelectedParamIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
  };

  const fetchData = async () => {
    if (!selectedParamIds.length) { showToast('No parameters selected.', 'warn'); return null; }
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const paramIds = selectedParamIds.join(',');
    const startIso = `${fromDate}T${fromTime}:00Z`;
    const endIso = `${toDate}T${toTime}:59Z`;
    const isNormal = reportMode === 'normal';
    const stepMin = isNormal ? Number(interval) : 0;
    const avgType = isNormal ? 'raw' : interval;

    try {
      const url = `${API_BASE}/trends/chart-data?parameter_ids=${paramIds}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${avgType}&step_minutes=${stepMin}&limit=100000`;
      const res = await authFetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resData: any = await res.json();
      const seriesList: any[] = resData.series || [];
      if (!seriesList.length || !seriesList[0].labels.length) {
        const naHeaders = ['Date & Time', ...selectedParamIds.map(id => {
          const p = parameters.find(p => String(p.id) === id);
          return p ? `${p.name} (${p.tag_name})` : `Param #${id}`;
        })];
        return { headers: naHeaders, rows: [] };
      }

      const headers = ['Date & Time', ...seriesList.map(s => `${s.name}${s.unit ? ' (' + s.unit + ')' : ''}`)];
      const timestamps = seriesList[0].labels;

      const dataByTs: Record<string, Record<string, any>> = {};
      timestamps.forEach((ts: string, idx: number) => {
        dataByTs[ts] = {};
        seriesList.forEach(s => {
          const v = s.values[idx];
          dataByTs[ts][s.name] = (v !== null && v !== undefined) ? Number(v).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : 'NA';
        });
      });

      const rows = timestamps.map((ts: string) => {
        const row: Record<string, any> = { 'Date & Time': fmtTs(parseUtcDate(ts)) };
        seriesList.forEach((s, idx) => {
          row[headers[idx + 1]] = dataByTs[ts][s.name] ?? 'NA';
        });
        return row;
      });

      return { headers, rows };
    } catch (e: any) {
      showToast('Could not fetch data.', 'error');
      return null;
    }
  };

  const handlePreview = async () => {
    setReportLoading(true);
    const result = await fetchData();
    if (result) {
      setPreviewHeaders(result.headers);
      setPreviewRows(result.rows);
      showToast(`${result.rows.length} rows loaded.`);
    }
    setReportLoading(false);
  };

  const handleExport = async (format: 'pdf' | 'csv' | 'excel') => {
    if (!selectedParamIds.length) return showToast('No parameters selected.', 'warn');
    const paramIds = selectedParamIds.join(',');
    const startIso = `${fromDate}T${fromTime}:00Z`;
    const endIso = `${toDate}T${toTime}:59Z`;
    const isNormal = reportMode === 'normal';
    const stepMin = isNormal ? Number(interval) : 0;
    const avgType = isNormal ? 'raw' : interval;
    const resolvedSt = stations.find(s => String(s.id) === stationId || s.name === stationId);
    const stName = resolvedSt?.name || stationId || 'AAQMS 1';

    setReportLoading(true);

    try {
      const endpoint = format === 'excel' ? '/reports/excel' : format === 'pdf' ? '/reports/pdf' : '/reports/export-csv';
      const url = `${API_BASE}${endpoint}?parameter_ids=${paramIds}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${avgType}&step_minutes=${stepMin}&station_name=${encodeURIComponent(stName)}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = format === 'csv' ? 'csv' : format === 'excel' ? 'xlsx' : 'pdf';
      const mime = format === 'csv' ? 'text/csv' : format === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
      const fname = `UltrON_${isNormal ? 'Normal' : 'Average'}_Report_${fromDate.replace(/-/g, '')}_${toDate.replace(/-/g, '')}.${ext}`;
      await saveAs(blob, fname, mime);
      showToast(`${format.toUpperCase()} report exported successfully.`);
    } catch (e: any) {
      showToast(`${format.toUpperCase()} export failed: ${e?.message || e}`, 'error');
    } finally {
      setReportLoading(false);
    }
  };

  const currentParamObj = parameters.find(p => String(p.id) === String(trendParamId));

  return (
    <div className="screen active" id="reportsScreen">
      {/* ─── 1. Reports & Data Export Card ─── */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="section-title">Reports & Data Export</div>
        {reportLoading && <div className="loader" style={{ margin: '12px 0' }}></div>}
        
        <div className="filter-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', alignItems: 'flex-start' }}>
          {/* Station Name */}
          <div className="form-group">
            <label className="form-label">Station Name</label>
            <select
              className="form-select"
              value={stationId}
              onChange={e => setStationId(e.target.value)}
            >
              {stations.map(st => (
                <option key={st.id} value={String(st.id)}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>

          {/* Parameter Selection */}
          <div className="form-group">
            <label className="form-label">Parameter</label>
            <div className="form-input" style={{ height: 'auto', minHeight: '38px', maxHeight: '150px', overflowY: 'auto', padding: '4px 8px' }}>
              {filteredParams.length === 0 ? (
                <div style={{ color: T.textFaint, fontSize: '12px', padding: '4px 0' }}>No parameters</div>
              ) : (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', fontSize: '12px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedParamIds.length === filteredParams.length && filteredParams.length > 0} onChange={e => setSelectedParamIds(e.target.checked ? filteredParams.map(p => String(p.id)) : [])} />
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

          {/* Report Type Selector */}
          <div className="form-group">
            <label className="form-label">Report Type</label>
            <select className="form-select" value={reportMode} onChange={e => handleModeChange(e.target.value as 'normal' | 'average')}>
              <option value="normal">Normal (Raw Data)</option>
              <option value="average">Average Data</option>
            </select>
          </div>

          {/* Interval Selector */}
          <div className="form-group">
            <label className="form-label">Interval</label>
            <select className="form-select" value={interval} onChange={e => setInterval(e.target.value)}>
              {(reportMode === 'normal' ? NORMAL_INTERVALS : AVG_INTERVALS).map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Date & Time Range Picker */}
          <div className="form-group" style={{ gridColumn: 'span 2', minWidth: '320px' }}>
            <label className="form-label">Date & Time Range</label>
            <DateTimeRangePicker
              fromDate={fromDate} setFromDate={setFromDate}
              fromTime={fromTime} setFromTime={setFromTime}
              toDate={toDate} setToDate={setToDate}
              toTime={toTime} setToTime={setToTime}
            />
          </div>
        </div>

        {/* Toolbar Action Buttons */}
        <div className="toolbar" style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => handleExport('pdf')} disabled={reportLoading}>Export PDF</button>
          <button className="btn" onClick={() => handleExport('csv')} disabled={reportLoading}>Export CSV</button>
          <button className="btn" onClick={handlePreview} disabled={reportLoading}>Refresh Preview</button>
        </div>

        {/* Preview Data Table */}
        {(previewHeaders.length > 0 && previewRows.length > 0) && (
          <div className="table-wrapper" style={{ marginTop: '16px' }}>
            <div style={{ padding: '10px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#166534' }}>
                📊 Showing Latest 30 Records (Current 30 Minutes) — True Precision
              </span>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#15803d' }}>
                Total Range Records: {previewRows.length}
              </span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  {previewHeaders.map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(-30).reverse().map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: '700', color: '#0f172a' }}>{row['Date & Time']}</td>
                    {previewHeaders.slice(1).map(h => {
                      const val = row[h];
                      return <td key={h} style={{ fontWeight: val !== 'NA' ? '600' : '400', color: val !== 'NA' ? '#0f766e' : '#94a3b8' }}>{val}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── 2. Trend Chart Card ─── */}
      <div className="card" style={{ marginTop: '18px' }}>
        <div className="section-title">Trend Chart</div>
        
        <div className="filter-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label className="form-label">Station Name</label>
            <select
              className="form-select"
              value={stationId}
              onChange={e => setStationId(e.target.value)}
            >
              {stations.map(st => (
                <option key={st.id} value={String(st.id)}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>
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
          {/* Date & Time Range Picker */}
          <div className="form-group" style={{ gridColumn: 'span 2', minWidth: '320px' }}>
            <label className="form-label">Date & Time Range</label>
            <DateTimeRangePicker
              fromDate={trendFromDate} setFromDate={setTrendFromDate}
              fromTime={trendFromTime} setFromTime={setTrendFromTime}
              toDate={trendToDate} setToDate={setTrendToDate}
              toTime={trendToTime} setToTime={setTrendToTime}
            />
          </div>
        </div>

        {/* Time Presets & Trend Type Toggle */}
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginRight: '4px' }}>Range:</span>
            {(['1h', '6h', '12h', '1d', '7d', '30d', 'custom'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => handleSelectPreset(p)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  border: timePreset === p ? '1px solid #0F766E' : '1px solid var(--border)',
                  background: timePreset === p ? '#0F766E' : 'var(--surface)',
                  color: timePreset === p ? '#ffffff' : 'var(--text-secondary)',
                }}
              >
                {p === '1h' ? '1 Hr' : p === '6h' ? '6 Hr' : p === '12h' ? '12 Hr' : p === '1d' ? '1 Day' : p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : 'Custom'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Trend Type:</span>
            <div style={{ display: 'inline-flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => handleTypeChange('line')}
                style={{
                  padding: '5px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: trendType === 'line' ? '#0F766E' : 'var(--surface)',
                  color: trendType === 'line' ? '#ffffff' : 'var(--text-secondary)',
                }}
              >
                Line (Default)
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('step')}
                style={{
                  padding: '5px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  borderLeft: '1px solid var(--border)',
                  background: trendType === 'step' ? '#0F766E' : 'var(--surface)',
                  color: trendType === 'step' ? '#ffffff' : 'var(--text-secondary)',
                }}
              >
                Step
              </button>
            </div>
          </div>
        </div>

        <div className="toolbar" style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button className="btn btn-primary" onClick={handleGenerateTrend} disabled={trendLoading}>Generate Trend</button>
          <button className="btn" onClick={handleResetTrend} disabled={trendLoading}>Reset Filters</button>
          <button className="btn" onClick={downloadTrendPNG} disabled={trendLoading}>Export PNG</button>
          <button className="btn" onClick={downloadTrendPDF} disabled={trendLoading}>Export PDF</button>
          <button className="btn" onClick={downloadTrendCSV} disabled={trendLoading}>Export CSV</button>
        </div>
        {trendLoading && <div className="loader" style={{ marginTop: '12px' }}></div>}
      </div>

      {/* ─── 3. Trend Graph Card ─── */}
      <div className="card" style={{ marginTop: '18px', minHeight: '340px' }}>
        <div className="section-title">Trend Graph</div>
        
        {/* Trend Header & Live Summary Statistics */}
        {trendStats && currentParamObj && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            margin: '6px 0 16px 0',
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
          }}>
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0F766E' }}>TREND</div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', marginTop: '1px' }}>
                {currentParamObj.name} ({currentParamObj.tag_name})
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{
                padding: '4px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(15, 118, 110, 0.1)',
                border: '1px solid rgba(15, 118, 110, 0.25)',
                color: '#0F766E',
                fontSize: '15px',
                fontWeight: 800,
                fontFamily: 'monospace',
              }}>
                Current: {trendStats.current}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'flex', gap: '10px' }}>
                <span>Min: <strong style={{ color: '#0f172a' }}>{trendStats.min}</strong></span>
                <span>•</span>
                <span>Max: <strong style={{ color: '#0f172a' }}>{trendStats.max}</strong></span>
                <span>•</span>
                <span>Avg: <strong style={{ color: '#0f172a' }}>{trendStats.avg}</strong></span>
              </div>
            </div>
          </div>
        )}

        {!trendGenerated && !trendLoading && (
          <div className="table-empty" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Set filters and click "Generate Trend".
          </div>
        )}
        {trendGenerated && !trendLoading && trendSeries && (trendSeries as any).empty && (
          <div className="table-empty" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No telemetry data (NA) recorded in this range.
          </div>
        )}

        <div style={{ flex: 1, minHeight: '300px', position: 'relative', display: trendSeries && !(trendSeries as any).empty ? 'block' : 'none' }}>
          <canvas ref={chartRef} id="trendChart" style={{ width: '100%', height: '300px' }}></canvas>
        </div>
      </div>

    </div>
  );
});
