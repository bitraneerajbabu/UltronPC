import React, { useContext, useState, useEffect, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { T, GLASS_CARD, BTN, INP, SEL } from '../theme';

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

const dlDate = (daysOffset = 0) => {
  const d = new Date(Date.now() + daysOffset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtTs = (date) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${p(date.getMonth() + 1)}/${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
};

const secStyle = { ...GLASS_CARD, padding: '22px', marginTop: '18px' };
const titleStyle = { fontSize: '16px', fontWeight: '700', color: T.text, marginBottom: '16px' };
const gridStyle = { display: 'flex', flexWrap: 'wrap' as const, gap: '12px' };
const labelStyle = { fontSize: '11px', fontWeight: '600', color: T.textLabel, marginBottom: '4px' };
const btnRowStyle = { display: 'flex', gap: '10px', marginTop: '16px' };

const ReportSection = ({ title, intervalOptions, fromDate, setFromDate, fromTime, setFromTime, toDate, setToDate, toTime, setToTime, interval, setInterval, onExportPDF, onExportCSV, previewHeaders, previewRows }: any) => (
  <div style={secStyle}>
    <div style={titleStyle}>{title}</div>
    <div style={gridStyle}>
      <div>
        <div style={labelStyle}>Interval</div>
        <select style={SEL} value={interval} onChange={e => setInterval(e.target.value)}>
          {intervalOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <div style={labelStyle}>From Date</div>
        <input type="date" style={INP} value={fromDate} onChange={e => setFromDate(e.target.value)} />
      </div>
      <div>
        <div style={labelStyle}>From Time</div>
        <input type="time" style={INP} value={fromTime} onChange={e => setFromTime(e.target.value)} />
      </div>
      <div>
        <div style={labelStyle}>To Date</div>
        <input type="date" style={INP} value={toDate} onChange={e => setToDate(e.target.value)} />
      </div>
      <div>
        <div style={labelStyle}>To Time</div>
        <input type="time" style={INP} value={toTime} onChange={e => setToTime(e.target.value)} />
      </div>
    </div>
    <div style={btnRowStyle}>
      <button style={BTN.primary} onClick={onExportPDF}>Export PDF</button>
      <button style={BTN.ghost} onClick={onExportCSV}>Export CSV</button>
    </div>
    {(previewHeaders.length > 0 && previewRows.length > 0) && (
      <div style={{ marginTop: '16px', maxHeight: '300px', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr>
              {previewHeaders.map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '600', position: 'sticky', top: 0, background: T.glass }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.slice(0, 50).map((row, idx) => (
              <tr key={idx}>
                <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}` }}>{row['Date & Time']}</td>
                {previewHeaders.slice(1).map(h => {
                  const val = row[h];
                  return <td key={h} style={{ padding: '5px 8px', borderBottom: `1px solid ${T.borderSoft}`, fontWeight: val !== 'NA' ? '600' : '400' }}>{val}</td>;
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
  const [normalHeaders, setNormalHeaders] = useState([]);
  const [normalRows, setNormalRows] = useState([]);

  const [selectedParamIds, setSelectedParamIds] = useState<string[]>([]);

  const [avgInterval, setAvgInterval] = useState('avg_1hr');
  const [avgFromDate, setAvgFromDate] = useState(dlDate(-1));
  const [avgFromTime, setAvgFromTime] = useState('00:00');
  const [avgToDate, setAvgToDate] = useState(dlDate(0));
  const [avgToTime, setAvgToTime] = useState('23:59');
  const [avgHeaders, setAvgHeaders] = useState([]);
  const [avgRows, setAvgRows] = useState([]);

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

  useEffect(() => {
    if (allStations.length && !stationId) setStationId(allStations[0].id);
  }, [allStations, stationId]);

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
    setSelectedParamIds(filteredParams.map(p => String(p.id)));
  }, [filteredParams]);

  const toggleParam = (id: string) => {
    setSelectedParamIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
  };

  const fetchData = async (isNormal: boolean) => {
    if (!selectedParamIds.length) { showToast('No parameters selected.', 'warn'); return null; }
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
      const url = `${API_BASE}/trends/chart-data?parameter_ids=${paramIds}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${avgType}`;
      const res = await authFetch(url);
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
        s.labels.forEach((lbl, idx) => { if (dataByTs[lbl]) dataByTs[lbl][s.name] = s.values[idx]; });
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
          row[headers[idx + 1]] = val !== null && val !== undefined ? val.toFixed(2) : 'NA';
        });
        return row;
      });

      return { headers, rows };
    } catch (e) {
      showToast('Could not fetch data.', 'error');
      return null;
    }
  };

  const handlePreview = async (isNormal: boolean) => {
    const result = await fetchData(isNormal);
    if (result) {
      if (isNormal) { setNormalHeaders(result.headers); setNormalRows(result.rows); }
      else { setAvgHeaders(result.headers); setAvgRows(result.rows); }
      showToast(`${result.rows.length} rows loaded.`);
    }
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

    // Estimate rows and warn if > 15 days or > 21600 rows
    const numMinutes = (new Date(`${toD}T${toT}`).getTime() - new Date(`${fromD}T${fromT}`).getTime()) / 60000;
    const numDays = numMinutes / 1440;
    const estRows = isNormal
      ? Math.ceil(numMinutes / Math.max(stepMin, 1))
      : Math.ceil(numMinutes / ({ avg_15min: 15, avg_30min: 30, avg_1hr: 60, avg_3hr: 180, avg_6hr: 360, avg_12hr: 720, avg_24hr: 1440 }[avgInterval] || 60));
    if (numDays > 15 || estRows > 21600) {
      const proceed = window.confirm(
        `This export covers ${numDays.toFixed(1)} days (~${estRows.toLocaleString()} rows per parameter). ` +
        `Proceeding may take time or memory. PDF is capped at 15 days (21600 rows). Continue?`
      );
      if (!proceed) return;
    }

    if (format === 'csv') {
      const result = await fetchData(isNormal);
      if (!result || !result.rows.length) return showToast('No data for CSV export.', 'warn');
      const csvContent = [
        result.headers,
        ...result.rows.map(r => result.headers.map(h => {
          const val = r[h] ?? '';
          return `"${String(val).replace(/"/g, '""')}"`;
        }))
      ].map(row => row.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${isNormal ? 'Normal' : 'Average'}_Report_${fromD}_to_${toD}.csv`;
      a.click();
      showToast('CSV exported.');
      return;
    }

    try {
      const avgType = isNormal ? 'raw' : avgInterval;
      const url = `${API_BASE}/reports/pdf?parameter_ids=${paramIds}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&avg_type=${avgType}&step_minutes=${stepMin}&station_name=${encodeURIComponent(stName)}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = objUrl;
      document.body.appendChild(iframe);
      setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(objUrl); }, 5000);
      showToast('PDF opened.');
    } catch (e) {
      showToast(`PDF export failed: ${e.message}`, 'error');
    }
  };

  return (
    <div className="screen active" id="reportsScreen">
      <div style={{ ...GLASS_CARD, padding: '20px', marginBottom: '2px' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: T.text, marginBottom: '14px' }}>Report Filters</div>
        <div style={gridStyle}>
          <div>
            <div style={labelStyle}>Station name (Device & Config)</div>
            <select style={SEL} value={stationId} onChange={e => setStationId(e.target.value)}>
              {allStations.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </div>

          <div>
            <div style={labelStyle}>Parameter</div>
            <div style={{ ...INP, height: 'auto', minHeight: '38px', maxHeight: '180px', overflowY: 'auto', padding: '4px 8px', width: '220px' }}>
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
            <button style={{ ...BTN.ghost, padding: '7px 18px' }} onClick={() => handlePreview(true)}>Refresh Preview</button>
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
      />
    </div>
  );
};
