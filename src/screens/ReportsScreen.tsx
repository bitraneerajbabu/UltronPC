import React, { useContext, useState, useEffect, useMemo } from 'react';
import { AppContext } from '../context/AppContext';

export const ReportsScreen = () => {
  const { stations, devices, parameters, API_BASE, showToast, parseUtcDate, authFetch } = useContext(AppContext);

  // Filter Inputs
  const [stationId, setStationId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [resolution, setResolution] = useState('avg_1hr');
  const [fromDate, setFromDate] = useState(defaultDate(-1));
  const [fromTime, setFromTime] = useState('00:00');
  const [toDate, setToDate] = useState(defaultDate(0));
  const [toTime, setToTime] = useState('23:59');

  // Preview Result State
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);

  // Selections
  useEffect(() => {
    if (stations.length && !stationId) {
      setStationId(stations[0].id);
    }
  }, [stations, stationId]);

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

  const filteredParams = useMemo(() => {
    return parameters.filter(p => p.device_id === Number(deviceId));
  }, [parameters, deviceId]);

  function defaultDate(daysOffset = 0) {
    const d = new Date(Date.now() + daysOffset * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const formatTimestamp = (date) => {
    const p = n => String(n).padStart(2, '0');
    return `${p(date.getDate())}-${p(date.getMonth()+1)}-${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
  };

  // Generate Preview
  const handleGenerateReport = async () => {
    if (!filteredParams.length) {
      showToast('No mapped parameters for selected device.', 'warn');
      return;
    }

    const paramIds = filteredParams.map(p => p.id).join(',');
    const startIso = `${fromDate}T${fromTime}:00Z`;
    const endIso = `${toDate}T${toTime}:59Z`;

    try {
      const url = `${API_BASE}/trends/chart-data?parameter_ids=${paramIds}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${resolution}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resData = await res.json();
      
      const seriesList = resData.series || [];
      if (!seriesList.length || !seriesList[0].labels.length) {
        showToast('No telemetry data available for report in selected range.', 'warn');
        setPreviewHeaders([]);
        setPreviewRows([]);
        return;
      }

      // Build Headers: Timestamp, Param1, Param2...
      const headers = ['Timestamp', ...seriesList.map(s => `${s.name} (${s.unit})`)];
      setPreviewHeaders(headers);

      // Pivot rows by timestamp
      const timestamps = sortedTimestamps(seriesList);
      const dataByTs: Record<string, Record<string, any>> = {};
      timestamps.forEach(ts => {
        dataByTs[ts] = {};
      });

      seriesList.forEach(s => {
        s.labels.forEach((lbl, index) => {
          if (dataByTs[lbl]) {
            dataByTs[lbl][s.name] = s.values[index];
          }
        });
      });

      const rows = timestamps.map(ts => {
        const row = { Timestamp: formatTimestamp(parseUtcDate(ts)) };
        seriesList.forEach(s => {
          const val = dataByTs[ts][s.name];
          row[s.name] = val !== null && val !== undefined ? val.toFixed(2) : '—';
        });
        return row;
      });

      setPreviewRows(rows);
      showToast(`Report compiled successfully. ${rows.length} rows parsed.`);

    } catch (e) {
      console.error(e);
      showToast('Could not generate report. Check server connection.', 'error');
    }
  };

  const sortedTimestamps = (seriesList: any[]): string[] => {
    const set = new Set<string>();
    seriesList.forEach(s => {
      s.labels.forEach((lbl: any) => set.add(lbl));
    });
    return (Array.from(set) as string[]).sort();
  };

  // Export handlers linking to the real FastAPI excel/pdf engine
  const handleExportPDF = () => {
    if (!previewRows.length) return showToast('Generate report preview first.', 'warn');
    const paramIds = filteredParams.map(p => p.id).join(',');
    const startIso = `${fromDate}T${fromTime}:00Z`;
    const endIso = `${toDate}T${toTime}:59Z`;
    const stName = stations.find(s => s.id === Number(stationId))?.name || 'UltrON Station';

    const url = `${API_BASE}/reports/pdf?parameter_ids=${paramIds}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${resolution}&station_name=${encodeURIComponent(stName)}`;
    window.open(url, '_blank');
    showToast('Report PDF stream request dispatched.');
  };

  const handleExportExcel = () => {
    if (!previewRows.length) return showToast('Generate report preview first.', 'warn');
    const paramIds = filteredParams.map(p => p.id).join(',');
    const startIso = `${fromDate}T${fromTime}:00Z`;
    const endIso = `${toDate}T${toTime}:59Z`;
    const stName = stations.find(s => s.id === Number(stationId))?.name || 'UltrON Station';

    const url = `${API_BASE}/reports/excel?parameter_ids=${paramIds}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${resolution}&station_name=${encodeURIComponent(stName)}`;
    window.location.href = url;
    showToast('Report Excel export download requested.');
  };

  const handleExportCSV = () => {
    if (!previewRows.length) return showToast('Generate report preview first.', 'warn');
    const csvHeaders = ['Timestamp', ...filteredParams.map(p => p.name)];
    const csvRows = [
      csvHeaders,
      ...previewRows.map(r => [
        r.Timestamp,
        ...filteredParams.map(p => r[p.name] ?? '')
      ])
    ];

    const csvContent = csvRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Report_${Date.now()}.csv`;
    a.click();
    showToast('Report CSV sheet saved.');
  };

  const handleExportJSON = () => {
    if (!previewRows.length) return showToast('Generate report preview first.', 'warn');
    const dataStr = JSON.stringify(previewRows, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Report_${Date.now()}.json`;
    a.click();
    showToast('Report JSON dataset exported.');
  };

  return (
    <div className="screen active" id="reportsScreen">
      
      {/* Report Filters */}
      <div className="card">
        <div className="section-title">Report Generation</div>
        
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
            <label className="form-label">Report Resolution</label>
            <select className="form-select" value={resolution} onChange={e => setResolution(e.target.value)}>
              <option value="raw">1 Minute Raw</option>
              <option value="avg_5min">5 Minute Average</option>
              <option value="avg_15min">15 Minute Average</option>
              <option value="avg_1hr">1 Hour Average</option>
              <option value="avg_8hr">8 Hour Average</option>
              <option value="avg_daily">Daily Average</option>
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

        <div className="toolbar" style={{ marginTop: '20px' }}>
          <button className="btn btn-primary" onClick={handleGenerateReport}>Generate Report</button>
          <button className="btn" onClick={handleExportPDF}>Export PDF</button>
          <button className="btn" onClick={handleExportCSV}>Export CSV</button>
          <button className="btn" onClick={handleExportExcel}>Export Excel</button>
          <button className="btn" onClick={handleExportJSON}>Export JSON</button>
        </div>
      </div>

      {/* Preview Table */}
      <div className="card">
        <div className="section-title">Report Preview</div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                {previewHeaders.length === 0 ? (
                  <th>Timestamp</th>
                ) : (
                  previewHeaders.map(h => <th key={h}>{h}</th>)
                )}
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 ? (
                <tr>
                  <td className="table-empty">
                    Configure filters and click "Generate Report" to compile preview rows.
                  </td>
                </tr>
              ) : (
                previewRows.map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.Timestamp}</td>
                    {previewHeaders.slice(1).map(h => {
                      // h is "ParamName (unit)" — strip trailing " (unit)" to get the key
                      const paramName = h.replace(/ \([^)]*\)$/, '');
                      const cellVal = row[paramName] ?? '—';
                      return (
                        <td key={h}>
                          {cellVal === '—' ? (
                            <span className="na-text">—</span>
                          ) : (
                            <strong>{cellVal}</strong>
                          )}
                        </td>
                      );
                    })}
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
