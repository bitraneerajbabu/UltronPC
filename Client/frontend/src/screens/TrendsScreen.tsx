import React, { useContext, useState, useEffect, useRef, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

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

export const TrendsScreen = () => {
  const { stations, devices, parameters, API_BASE, showToast, parseUtcDate, authFetch } = useContext(AppContext);

  const [stationId, setStationId] = useState('');
  const [paramId, setParamId] = useState('');
  const [resolution, setResolution] = useState('raw');
  const [startDate, setStartDate] = useState(defaultDate(-1));
  const [startTime, setStartTime] = useState('00:00');
  const [endDate, setEndDate] = useState(defaultDate(0));
  const [endTime, setEndTime] = useState('23:59');
  const [seriesData, setSeriesData] = useState<any>(null);
  const [tableRows, setTableRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<ChartJS | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  const allStations = useMemo(() =>
    stations.map(s => ({ id: String(s.id), name: s.name })),
  [stations]);

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

  useEffect(() => {
    if (filteredParams.length) setParamId(filteredParams[0].id);
    else setParamId('');
  }, [filteredParams]);

  function defaultDate(daysOffset = 0) {
    const d = new Date(Date.now() + daysOffset * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const pad = (n: number) => String(n).padStart(2, '0');

  function formatShortDate(isoString: string) {
    const d = parseUtcDate(isoString);
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const handleGenerate = async () => {
    if (!paramId) { showToast('Select a valid parameter to analyze.', 'warn'); return; }
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    const startIso = `${startDate}T${startTime}:00Z`;
    const endIso = `${endDate}T${endTime}:59Z`;

    try {
      const url = `${API_BASE}/trends/chart-data?parameter_ids=${paramId}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${resolution}&limit=100000`;
      const res = await authFetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resData = await res.json();
      const series = resData.series && resData.series[0];
      if (!series || !series.labels.length) {
        showToast('No telemetry data points found in range.', 'warn');
        setSeriesData(null);
        setTableRows([]);
        if (chartInstanceRef.current) { chartInstanceRef.current.destroy(); chartInstanceRef.current = null; }
        return;
      }

      setSeriesData(series);

      const rows = series.labels.map((ts: string, idx: number) => ({
        timestamp: formatShortDate(ts),
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
      setTableRows(rows);

      if (chartRef.current) {
        if (chartInstanceRef.current) chartInstanceRef.current.destroy();

        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;
        const shortLabels = series.labels.map((lbl: string) => formatShortDate(lbl));

        const paramObj = parameters.find(p => String(p.id) === String(paramId)) || {};
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
              borderColor: '#0f766e',
              backgroundColor: 'rgba(15,118,110,0.07)',
              fill: true,
              tension: resolution === 'raw' ? 0 : 0.3,
              pointBackgroundColor: '#0f766e',
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

      showToast(`Historical trend loaded with ${series.labels.length} points.`);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      showToast('Failed to fetch historical trends.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStartDate(defaultDate(-1));
    setStartTime('00:00');
    setEndDate(defaultDate(0));
    setEndTime('23:59');
    setResolution('raw');
    showToast('Filters reset.');
  };

  const downloadPNG = async () => {
    if (!chartInstanceRef.current) return showToast('Generate a trend first.', 'warn');
    const dataUrl = chartInstanceRef.current.toBase64Image();
    const blob = await (await fetch(dataUrl)).blob();
    const name = `Trend_${seriesData?.name}_${Date.now()}.png`;
    await saveAs(blob, name, 'image/png');
    showToast('Trend image exported as PNG.');
  };

  const downloadPDF = async () => {
    if (!paramId) return showToast('Generate a trend first.', 'warn');
    setLoading(true);
    const startIso = `${startDate}T${startTime}:00Z`;
    const endIso = `${endDate}T${endTime}:59Z`;
    try {
      const url = `${API_BASE}/reports/pdf?parameter_ids=${paramId}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${resolution}&station_name=${encodeURIComponent(stationId)}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const name = `Trend_${seriesData?.name || 'report'}_${Date.now()}.pdf`;
      await saveAs(blob, name, 'application/pdf');
      showToast('PDF saved — also available in the Reports folder next to the app.');
    } catch (e: any) {
      showToast('PDF export failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = async () => {
    if (!paramId) return showToast('Generate a trend first.', 'warn');
    setLoading(true);
    const startIso = `${startDate}T${startTime}:00Z`;
    const endIso = `${endDate}T${endTime}:59Z`;
    try {
      const url = `${API_BASE}/trends/export-csv?parameter_ids=${paramId}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${resolution}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const name = `TrendData_${seriesData?.name || 'trend'}_${Date.now()}.csv`;
      await saveAs(blob, name, 'text/csv');
      showToast('CSV saved — also available in the Reports folder next to the app.');
    } catch (e: any) {
      showToast('CSV export failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen active" id="trendsScreen">
      <div className="card">
        <div className="section-title">Trend Analysis</div>
        <div className="filter-grid">
          <div className="form-group">
            <label className="form-label">Station Name</label>
            <select className="form-select" value={stationId} onChange={e => setStationId(e.target.value)}>
              {allStations.map(st => <option value={st.id} key={st.id}>{st.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Parameter</label>
            <select className="form-select" value={paramId} onChange={e => setParamId(e.target.value)}>
              {filteredParams.map(p => <option value={p.id} key={p.id}>{p.name} ({p.tag_name})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Resolution</label>
            <select className="form-select" value={resolution} onChange={e => setResolution(e.target.value)}>
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
            <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Start Time</label>
            <input type="time" className="form-input" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">End Date</label>
            <input type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">End Time</label>
            <input type="time" className="form-input" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: '20px' }}>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>Generate Trend</button>
          <button className="btn" onClick={handleReset} disabled={loading}>Reset Filters</button>
          <button className="btn" onClick={downloadPNG} disabled={loading}>Export PNG</button>
          <button className="btn" onClick={downloadPDF} disabled={loading}>Export PDF</button>
          <button className="btn" onClick={exportCSV} disabled={loading}>Export CSV</button>
        </div>
        {loading && <div className="spinner" style={{ marginTop: '12px' }}>Loading...</div>}
      </div>

      <div className="card">
        <div className="section-title">Historical Trend Graph</div>
        {!seriesData && !loading && <div className="table-empty" style={{ padding: '40px', textAlign: 'center' }}>Configure filters and click "Generate Trend" to load data.</div>}
        <canvas ref={chartRef} id="historicalTrendChart" height="100" style={{ display: seriesData ? 'block' : 'none' }}></canvas>
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
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-empty">
                    Configure filters and click "Generate Trend" to load telemetry points.
                  </td>
                </tr>
              ) : (
                tableRows.map((r, idx) => (
                  <tr key={idx}>
                    <td>{r.timestamp}</td>
                    <td>{r.parameter}</td>
                    <td><strong>{r.value}</strong></td>
                    <td>{r.unit}</td>
                    <td>
                      <span className={r.quality === 'GOOD' ? 'badge-success' : 'badge-error'}>
                        {r.quality}
                      </span>
                    </td>
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
