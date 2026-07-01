import React, { useContext, useState, useEffect, useRef, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, LineController, Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, LineController, Filler);

export const TrendsScreen = () => {
  const { stations, devices, parameters, API_BASE, showToast, parseUtcDate, authFetch } = useContext(AppContext);
  
  // Filter Inputs
  const [stationId, setStationId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [paramId, setParamId] = useState('');
  const [resolution, setResolution] = useState('raw');
  const [startDate, setStartDate] = useState(defaultDate(-1));
  const [startTime, setStartTime] = useState('00:00');
  const [endDate, setEndDate] = useState(defaultDate(0));
  const [endTime, setEndTime] = useState('23:59');

  // Query Result State
  const [seriesData, setSeriesData] = useState(null);
  const [tableRows, setTableRows] = useState([]);
  
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);

  // Cleanup chart instance on unmount
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  // Set default filter dropdown selections
  useEffect(() => {
    if (stations.length && !stationId) {
      setStationId(stations[0].id);
    }
  }, [stations, stationId]);

  // Filter devices when station changes
  const filteredDevices = useMemo(() => {
    return devices.filter(d => d.station_id === Number(stationId));
  }, [devices, stationId]);

  useEffect(() => {
    if (filteredDevices.length) {
      setDeviceId(filteredDevices[0].id);
    } else {
      setDeviceId('');
    }
  }, [filteredDevices]);

  // Filter parameters when device changes
  const filteredParams = useMemo(() => {
    return parameters.filter(p => p.device_id === Number(deviceId));
  }, [parameters, deviceId]);

  useEffect(() => {
    if (filteredParams.length) {
      setParamId(filteredParams[0].id);
    } else {
      setParamId('');
    }
  }, [filteredParams]);

  // Format Helpers
  function defaultDate(daysOffset = 0) {
    const d = new Date(Date.now() + daysOffset * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const pad = (n: number) => String(n).padStart(2, '0');

  function formatShortDate(isoString: string) {
    const d = parseUtcDate(isoString);
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Generate historical trends
  const handleGenerate = async () => {
    if (!paramId) {
      showToast('Select a valid parameter to analyze.', 'warn');
      return;
    }

    const startIso = `${startDate}T${startTime}:00Z`;
    const endIso = `${endDate}T${endTime}:59Z`;

    try {
      const url = `${API_BASE}/trends/chart-data?parameter_ids=${paramId}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${resolution}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resData = await res.json();
      
      const series = resData.series && resData.series[0];
      if (!series || !series.labels.length) {
        showToast('No telemetry data points found in range.', 'warn');
        setSeriesData(null);
        setTableRows([]);
        if (chartInstanceRef.current) {
          chartInstanceRef.current.destroy();
          chartInstanceRef.current = null;
        }
        return;
      }

      setSeriesData(series);

      // Build data table rows
      const rows = series.labels.map((ts, idx) => ({
        timestamp: formatTimestamp(parseUtcDate(ts)),
        parameter: series.name,
        value: series.values[idx] !== null ? series.values[idx].toFixed(2) : 'NA',
        unit: series.unit || '',
        quality: (() => {
          const q = series.qualities[idx] ? series.qualities[idx].toUpperCase() : 'GOOD';
          if (q === 'U' || q === 'GOOD') return 'GOOD';
          if (q === 'O' || q === 'OUT_OF_RANGE') return 'OUT_OF_RANGE';
          if (q === 'E' || q === 'COMMS_FAIL' || q === 'SENSOR_FAIL') return 'ERROR';
          if (q === 'N' || q === 'NEGATIVE') return 'NEGATIVE';
          return q;
        })(),
        source: 'POLL'
      }));
      setTableRows(rows);

      // Draw Chart.js Line graph
      if (chartRef.current) {
        if (chartInstanceRef.current) {
          chartInstanceRef.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        const shortLabels = series.labels.map(lbl => formatShortDate(lbl));

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
              tension: 0.3,
              pointBackgroundColor: '#0f766e',
              pointBorderColor: '#fff',
              pointRadius: 2,
              pointHoverRadius: 5
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: {
                labels: {
                  color: '#475569',
                  font: { weight: 600, family: 'Inter, sans-serif' }
                }
              }
            },
            scales: {
              x: { ticks: { color: '#94a3b8', font: { size: 10 }, maxTicksLimit: 15 }, grid: { color: '#f1f5f9' } },
              y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#f1f5f9' } }
            }
          }
        });
      }

      showToast(`Historical trend loaded with ${series.labels.length} points.`);

    } catch (e) {
      console.error(e);
      showToast('Failed to fetch historical trends.', 'error');
    }
  };

  const formatTimestamp = (date) => {
    return `${date.getFullYear()}/${pad(date.getMonth()+1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const handleReset = () => {
    setStartDate(defaultDate(-1));
    setStartTime('00:00');
    setEndDate(defaultDate(0));
    setEndTime('23:59');
    setResolution('raw');
    showToast('Filters reset.');
  };

  // Export functions
  const downloadPNG = () => {
    if (!chartInstanceRef.current) return showToast('Generate a trend first.', 'warn');
    const url = chartInstanceRef.current.toBase64Image();
    const a = document.createElement('a');
    a.href = url;
    a.download = `Trend_${seriesData?.name}_${Date.now()}.png`;
    a.click();
    showToast('Trend image exported as PNG.');
  };

  const downloadPDF = () => {
    if (!chartInstanceRef.current) return showToast('Generate a trend first.', 'warn');
    const img = chartInstanceRef.current.toBase64Image();
    const html = `
      <html>
        <head><style>body{margin:24px;font-family:sans-serif;}h2{color:#0f172a;}img{width:100%;border:1px solid #e2e8f0;border-radius:8px;}</style></head>
        <body>
          <h2>Historical Trend Analysis — ${seriesData?.name}</h2>
          <div style="font-size:13px;color:#64748b;margin-bottom:15px;">
            Range: ${startDate} ${startTime} to ${endDate} ${endTime}
          </div>
          <img src="${img}">
          <script>
            window.onload = () => { window.print(); setTimeout(() => window.close(), 800); };
          <\/script>
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(url); }, 5000);
    showToast('PDF print dialog opened.');
  };

  const exportCSV = () => {
    if (!tableRows.length) return showToast('Generate a trend first.', 'warn');
    const headers = ['Timestamp', 'Parameter', 'Value', 'Unit', 'Quality', 'Source'];
    const rows = [headers, ...tableRows.map(r => [r.timestamp, r.parameter, r.value, r.unit, r.quality, r.source])];
    const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `TrendData_${seriesData?.name}_${Date.now()}.csv`;
    a.click();
    showToast('Trend data exported to CSV.');
  };

  const exportExcel = () => {
    if (!tableRows.length) return showToast('Generate a trend first.', 'warn');
    const headers = ['Timestamp', 'Parameter', 'Value', 'Unit', 'Quality', 'Source'];
    const tsv = [headers, ...tableRows.map(r => [r.timestamp, r.parameter, r.value, r.unit, r.quality, r.source])]
      .map(r => r.join('\t')).join('\n');

    const blob = new Blob([tsv], { type: 'application/vnd.ms-excel' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `TrendData_${seriesData?.name}_${Date.now()}.xls`;
    a.click();
    showToast('Trend data exported as Excel.');
  };

  return (
    <div className="screen active" id="trendsScreen">
      
      {/* Filters Panel */}
      <div className="card">
        <div className="section-title">Trend Analysis</div>
        
        <div className="filter-grid">
          <div className="form-group">
            <label className="form-label">Station</label>
            <select className="form-select" value={stationId} onChange={e => setStationId(e.target.value)}>
              {stations.map(st => <option value={st.id} key={st.id}>{st.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Device</label>
            <select className="form-select" value={deviceId} onChange={e => setDeviceId(e.target.value)}>
              {filteredDevices.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}
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
          <button className="btn btn-primary" onClick={handleGenerate}>Generate Trend</button>
          <button className="btn" onClick={handleReset}>Reset Filters</button>
          <button className="btn" onClick={downloadPNG}>Export PNG</button>
          <button className="btn" onClick={downloadPDF}>Export PDF</button>
          <button className="btn" onClick={exportCSV}>Export CSV</button>
          <button className="btn" onClick={exportExcel}>Export Excel</button>
        </div>
      </div>

      {/* Line Chart */}
      <div className="card">
        <div className="section-title">Historical Trend Graph</div>
        <canvas ref={chartRef} id="historicalTrendChart" height="100"></canvas>
      </div>

      {/* Trend Data Table */}
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
