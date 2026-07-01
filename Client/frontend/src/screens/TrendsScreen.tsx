import React, { useContext, useState, useEffect, useRef, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, LineController, Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, LineController, Filler);

export const TrendsScreen = () => {
  const { stations, devices, parameters, API_BASE, showToast, parseUtcDate, authFetch } = useContext(AppContext);
  
  // Filter Inputs
  const [stationId, setStationId] = useState('');
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

  // Merge actual stations with unique parameter descriptions to support custom virtual stations
  const allStations = useMemo(() => {
    const list = stations.map(s => ({ id: String(s.id), name: s.name }));
    parameters.forEach(p => {
      if (p.description && p.description.trim()) {
        const desc = p.description.trim();
        if (!list.some(s => s.name === desc)) {
          list.push({ id: desc, name: desc });
        }
      }
    });
    return list;
  }, [stations, parameters]);

  // Set default filter dropdown selections
  useEffect(() => {
    if (allStations.length && !stationId) {
      setStationId(allStations[0].id);
    }
  }, [allStations, stationId]);

  // Filter parameters when station changes
  const filteredParams = useMemo(() => {
    return parameters.filter(p => {
      if (!stationId) return true;
      if (p.description === stationId) return true;
      const dev = devices.find(d => String(d.id) === String(p.device_id));
      if (!dev) return false;
      const st = stations.find(s => String(s.id) === String(dev.station_id));
      if (st && st.name === stationId) return true;
      if (String(dev.station_id) === stationId) return true;
      return false;
    });
  }, [parameters, stationId, stations, devices]);

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

        const paramObj = parameters.find(p => String(p.id) === String(paramId)) || {};
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
