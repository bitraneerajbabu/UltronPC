import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { T, BTN, INP, GLASS_CARD } from '../theme';

interface Status {
  enabled_stations: number;
  total_mappings: number;
  total_export_records: number;
  last_log: any;
}

export const CPCBExportScreen = () => {
  const { API_BASE, showToast, authFetch } = useContext(AppContext);
  const [status, setStatus] = useState<Status | null>(null);
  const [exporting, setExporting] = useState(false);
  const [backfillStation, setBackfillStation] = useState('');
  const [backfillStart, setBackfillStart] = useState('');
  const [backfillEnd, setBackfillEnd] = useState('');
  const [backfilling, setBackfilling] = useState(false);
  const [stations, setStations] = useState<any[]>([]);

  const loadStatus = async () => {
    try {
      const res = await authFetch(`${API_BASE}/cpcb/status`);
      if (res.ok) setStatus(await res.json());
    } catch { }
  };

  const loadStations = async () => {
    try {
      const res = await authFetch(`${API_BASE}/cpcb/config`);
      if (res.ok) setStations(await res.json());
    } catch { }
  };

  useEffect(() => { loadStatus(); loadStations(); }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await authFetch(`${API_BASE}/cpcb/export`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        showToast(`Export complete: ${d.records_exported} records`);
        await loadStatus();
      } else {
        const d = await res.json();
        showToast(d.detail || 'Export failed', 'error');
      }
    } catch { showToast('Export request failed', 'error'); }
    finally { setExporting(false); }
  };

  const handleBackfill = async () => {
    if (!backfillStation || !backfillStart || !backfillEnd) {
      showToast('Station, start date, and end date required', 'error');
      return;
    }
    setBackfilling(true);
    try {
      const res = await authFetch(`${API_BASE}/cpcb/backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ station_name: backfillStation, start_date: backfillStart, end_date: backfillEnd }),
      });
      if (res.ok) {
        const d = await res.json();
        showToast(`Backfill complete: ${d.records_created} records created`);
        await loadStatus();
      } else {
        const d = await res.json();
        showToast(d.detail || 'Backfill failed', 'error');
      }
    } catch { showToast('Backfill request failed', 'error'); }
    finally { setBackfilling(false); }
  };

  const handleDownload = async (stationName: string) => {
    try {
      const res = await authFetch(`${API_BASE}/cpcb/download/${encodeURIComponent(stationName)}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${stationName}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Downloaded ${stationName}.txt`);
      } else {
        showToast('File not found. Run export first.', 'error');
      }
    } catch { showToast('Download failed', 'error'); }
  };

  return (
    <div className="screen active" id="cpcbExportScreen">
      {/* Status Cards */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="section-title">CPCB Export Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          <div style={{ ...GLASS_CARD, padding: '16px', borderLeft: `4px solid ${T.primary}` }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase' }}>Active Stations</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: T.text, fontFamily: T.fontMono }}>{status?.enabled_stations ?? '—'}</div>
          </div>
          <div style={{ ...GLASS_CARD, padding: '16px', borderLeft: `4px solid ${T.info}` }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase' }}>Parameter Mappings</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: T.text, fontFamily: T.fontMono }}>{status?.total_mappings ?? '—'}</div>
          </div>
          <div style={{ ...GLASS_CARD, padding: '16px', borderLeft: `4px solid ${T.success}` }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase' }}>Export Records</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: T.text, fontFamily: T.fontMono }}>{status?.total_export_records ?? '—'}</div>
          </div>
          <div style={{ ...GLASS_CARD, padding: '16px', borderLeft: `4px solid ${status?.last_log?.status === 'success' ? T.success : T.warning}` }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase' }}>Last Export</div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: T.text }}>
              {status?.last_log ? new Date(status.last_log.created_at).toLocaleString() : 'Never'}
            </div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: T.textFaint }}>
              {status?.last_log ? `${status.last_log.record_count} records` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Manual Export */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="section-title">Manual Export</div>
        <p style={{ fontSize: '12px', color: T.textFaint, marginBottom: '12px' }}>
          Trigger an immediate CPCB file export for all configured stations.
        </p>
        <button style={BTN.primary} onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting...' : 'Export Now'}
        </button>
      </div>

      {/* Backfill */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="section-title">Historical Backfill</div>
        <p style={{ fontSize: '12px', color: T.textFaint, marginBottom: '12px' }}>
          Recalculate and regenerate CPCB records for a date range.
        </p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '4px' }}>Station</label>
            <select style={INP} value={backfillStation} onChange={e => setBackfillStation(e.target.value)}>
              <option value="">Select station...</option>
              {stations.map(s => <option key={s.id} value={s.station_name}>{s.station_name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '4px' }}>Start Date (DD-MM-YYYY)</label>
            <input style={INP} value={backfillStart} onChange={e => setBackfillStart(e.target.value)} placeholder="01-05-2026" />
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '4px' }}>End Date (DD-MM-YYYY)</label>
            <input style={INP} value={backfillEnd} onChange={e => setBackfillEnd(e.target.value)} placeholder="15-05-2026" />
          </div>
          <button style={BTN.primary} onClick={handleBackfill} disabled={backfilling}>
            {backfilling ? 'Generating...' : 'Generate Backfill'}
          </button>
        </div>
      </div>

      {/* Download */}
      <div className="card">
        <div className="section-title">Download Files</div>
        <p style={{ fontSize: '12px', color: T.textFaint, marginBottom: '12px' }}>
          Download generated CPCB export files per station.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {stations.map(s => (
            <button key={s.id} style={BTN.ghost} onClick={() => handleDownload(s.station_name)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                {s.station_name}.txt
              </span>
            </button>
          ))}
          {stations.length === 0 && <span style={{ fontSize: '12px', color: T.textFaint }}>No stations configured. Add CPCB station config first.</span>}
        </div>
      </div>
    </div>
  );
};
