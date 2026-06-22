import React, { useContext, useState, useEffect, useRef, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { T } from '../theme';
import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const pad = (n: number) => String(n).padStart(2, '0');

const dlDate = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const WIND_DIRECTIONS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function generateMockWindrose(): { labels: string[]; datasets: { label: string; data: number[]; backgroundColor: string; borderColor: string; borderWidth: number }[] } {
  const speeds = [
    { label: '0.5–2 m/s', max: 12 },
    { label: '2–4 m/s', max: 20 },
    { label: '4–6 m/s', max: 15 },
    { label: '6–8 m/s', max: 8 },
    { label: '>8 m/s', max: 4 },
  ];
  const colors = ['rgba(15,118,110,0.2)', 'rgba(15,118,110,0.4)', 'rgba(15,118,110,0.6)', 'rgba(15,118,110,0.8)', 'rgba(15,118,110,1)'];

  return {
    labels: WIND_DIRECTIONS,
    datasets: speeds.map((s, i) => ({
      label: s.label,
      data: WIND_DIRECTIONS.map(() => Math.floor(Math.random() * s.max) + 1),
      backgroundColor: colors[i],
      borderColor: colors[i].replace('0.', '0.9'),
      borderWidth: 1,
    })),
  };
}

function generateMockPollutionrose(): { labels: string[]; datasets: { label: string; data: number[]; backgroundColor: string; borderColor: string; borderWidth: number }[] } {
  const pollutants = ['PM2.5', 'PM10', 'NO2', 'SO2', 'O3', 'CO'];
  const colors = ['rgba(239,68,68,0.3)', 'rgba(245,158,11,0.3)', 'rgba(59,130,246,0.3)', 'rgba(168,85,247,0.3)', 'rgba(34,197,94,0.3)', 'rgba(236,72,153,0.3)'];

  return {
    labels: WIND_DIRECTIONS,
    datasets: pollutants.map((p, i) => ({
      label: p,
      data: WIND_DIRECTIONS.map(() => Math.floor(Math.random() * 50) + 5),
      backgroundColor: colors[i],
      borderColor: colors[i].replace('0.', '0.9'),
      borderWidth: 1,
    })),
  };
}

export const WindroseScreen = () => {
  const { stations, parameters, API_BASE, showToast, authFetch } = useContext(AppContext);

  const [stationId, setStationId] = useState('');
  const [dateFrom, setDateFrom] = useState(dlDate(-7));
  const [dateTo, setDateTo] = useState(dlDate(0));
  const [selectedParamId, setSelectedParamId] = useState('');
  const [chartMode, setChartMode] = useState<'windrose' | 'pollutionrose'>('windrose');
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<ChartJS | null>(null);

  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) { chartInstanceRef.current.destroy(); chartInstanceRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (stations.length && !stationId) setStationId(stations[0].id);
  }, [stations, stationId]);

  const stationDevices = useMemo(() => {
    return parameters.filter(p => {
      const station = stations.find(s => s.id === Number(stationId));
      return station && p.device_id === station.id;
    });
  }, [parameters, stations, stationId]);

  const checkApi = async () => {
    try {
      const res = await fetch(`${API_BASE}/reports/windrose?station_id=${Number(stationId) || 1}&date_from=${dateFrom}&date_to=${dateTo}`, {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('ultron_token')}` },
      });
      setApiAvailable(res.ok);
    } catch {
      setApiAvailable(false);
    }
  };

  useEffect(() => {
    checkApi();
  }, []);

  const renderChart = (data: any) => {
    if (!chartRef.current) return;
    if (chartInstanceRef.current) chartInstanceRef.current.destroy();

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    chartInstanceRef.current = new ChartJS(ctx, {
      type: 'radar',
      data,
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#475569', font: { weight: 600, size: 11, family: 'Inter, sans-serif' as any }, boxWidth: 14, padding: 16 },
          },
        },
        scales: {
          r: {
            grid: { color: 'rgba(15,118,110,0.12)' },
            angleLines: { color: 'rgba(15,118,110,0.15)' },
            pointLabels: { color: '#0f172a', font: { weight: 600, size: 11, family: 'Inter, sans-serif' as any } },
            ticks: { color: '#94a3b8', backdropColor: 'transparent', font: { size: 10 } },
            suggestedMin: 0,
          },
        },
      },
    });
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      if (apiAvailable) {
        const pParam = chartMode === 'pollutionrose' && selectedParamId ? `&parameter_id=${selectedParamId}` : '';
        const res = await authFetch(`${API_BASE}/reports/windrose?station_id=${Number(stationId) || 1}&date_from=${dateFrom}&date_to=${dateTo}${pParam}`);
        if (res.ok) {
          const data = await res.json();
          const formatted: any = {
            labels: data.labels || WIND_DIRECTIONS,
            datasets: (data.datasets || []).map((ds: any, i: number) => ({
              label: ds.label,
              data: ds.data,
              backgroundColor: `rgba(15,118,110,${0.15 + i * 0.2})`,
              borderColor: '#0f766e',
              borderWidth: 1,
            })),
          };
          setChartData(formatted);
          renderChart(formatted);
          showToast('Windrose data loaded.');
          setLoading(false);
          return;
        }
      }

      const mock = chartMode === 'windrose' ? generateMockWindrose() : generateMockPollutionrose();
      setChartData(mock);
      renderChart(mock);
      showToast('Sample windrose data (API endpoint not yet available).', 'info');
    } catch {
      const mock = chartMode === 'windrose' ? generateMockWindrose() : generateMockPollutionrose();
      setChartData(mock);
      renderChart(mock);
      showToast('Using sample data. Backend endpoint coming soon.', 'info');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (chartData) {
      renderChart(chartData);
    }
  }, [chartMode]);

  const handleReset = () => {
    setDateFrom(dlDate(-7));
    setDateTo(dlDate(0));
    setSelectedParamId('');
    setChartData(null);
    if (chartInstanceRef.current) { chartInstanceRef.current.destroy(); chartInstanceRef.current = null; }
    showToast('Filters reset.');
  };

  const downloadPNG = () => {
    if (!chartInstanceRef.current) return showToast('Generate a chart first.', 'warn');
    const url = chartInstanceRef.current.toBase64Image();
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chartMode === 'windrose' ? 'Windrose' : 'Pollutionrose'}_${Date.now()}.png`;
    a.click();
    showToast('Chart exported as PNG.');
  };

  return (
    <div className="screen active" id="windroseScreen">
      <div className="card">
        <div className="section-title">Windrose / Pollutionrose Analysis</div>

        <div className="filter-grid">
          <div className="form-group">
            <label className="form-label">Chart Mode</label>
            <select className="form-select" value={chartMode} onChange={e => setChartMode(e.target.value as any)}>
              <option value="windrose">Windrose (Wind Speed / Direction)</option>
              <option value="pollutionrose">Pollutionrose (Pollutant Concentration)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Station</label>
            <select className="form-select" value={stationId} onChange={e => setStationId(e.target.value)}>
              {stations.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">From Date</label>
            <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">To Date</label>
            <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          {chartMode === 'pollutionrose' && (
            <div className="form-group">
              <label className="form-label">Parameter</label>
              <select className="form-select" value={selectedParamId} onChange={e => setSelectedParamId(e.target.value)}>
                <option value="">All Parameters</option>
                {parameters.map(p => <option key={p.id} value={p.id}>{p.name} ({p.tag_name})</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="toolbar" style={{ marginTop: '20px' }}>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? 'Generating…' : 'Generate Chart'}
          </button>
          <button className="btn" onClick={handleReset}>Reset Filters</button>
          <button className="btn" onClick={downloadPNG}>Export PNG</button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          {chartMode === 'windrose' ? 'Windrose' : 'Pollutionrose'} Chart
          {apiAvailable === false && (
            <span style={{ fontSize: '11px', fontWeight: 400, color: T.textLabel, marginLeft: '12px' }}>
              (API endpoint coming soon — showing sample data)
            </span>
          )}
        </div>
        {chartData ? (
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <canvas ref={chartRef} height="400"></canvas>
          </div>
        ) : (
          <div className="table-empty">
            Select filters and click "Generate Chart" to display {chartMode === 'windrose' ? 'windrose' : 'pollutionrose'} data.
          </div>
        )}
      </div>

      {chartData && (
        <div className="card">
          <div className="section-title">Data Table</div>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Direction</th>
                  {(chartData.datasets || []).map((ds: any) => <th key={ds.label}>{ds.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {chartData.labels.map((label: string, i: number) => (
                  <tr key={label}>
                    <td><strong>{label}</strong></td>
                    {(chartData.datasets || []).map((ds: any) => (
                      <td key={ds.label}>{ds.data[i]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
