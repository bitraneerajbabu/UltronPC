import React, { useContext, useState, useEffect, useMemo, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { T, GLASS_CARD } from '../theme';

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

  const abortRef = useRef<AbortController | null>(null);

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
    </div>
  );
};
