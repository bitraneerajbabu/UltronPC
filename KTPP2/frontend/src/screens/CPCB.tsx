import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { T, BTN, INP, GLASS_CARD } from '../theme';

const CPCB_PARAMS = [
  'CO', 'SO2', 'NO', 'NO2', 'NOx', 'Ozone', 'PM10', 'PM2.5', 'Temp',
  'WS', 'WD', 'AT', 'RH', 'BP', 'SR', 'RF', 'VWS',
  'Benzene', 'Toluene', 'Xylene', 'Eth-Benzene', 'MP-Xylene',
  'CH4', 'NH3', 'HCHO', 'Hg',
];

interface StationConfig {
  id: number; station_id: number; station_name: string; station_code: string | null;
  export_enabled: boolean; export_path: string; cpcb_enabled: boolean;
  timezone: string; retention_count: number;
  calibration_mode: boolean; maintenance_mode: boolean;
}
interface Mapping {
  id: number; internal_parameter: string; cpcb_parameter: string;
  unit: string; conversion_factor: number; enabled: boolean;
}
interface ExportLog {
  id: number; station_name: string; record_count: number;
  status: string; message: string | null; execution_time_ms: number | null; created_at: string;
}
interface ExportStatus {
  enabled_stations: number; total_mappings: number; total_export_records: number; last_log: any;
}

const s = () => ({ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' });
const ipt = { width: '100%', background: '#fff', border: '1px solid #e2e8f0', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#0f172a', outline: 'none', fontFamily: T.fontMono, transition: 'border-color 0.15s', boxSizing: 'border-box' as const };

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <div onClick={onChange} style={{ position: 'relative', width: 34, height: 18, cursor: 'pointer', flexShrink: 0 }}>
    <div style={{ position: 'absolute', inset: 0, borderRadius: 99, background: checked ? '#0f766e' : '#cbd5e1', transition: 'background 0.2s' }} />
    <div style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', pointerEvents: 'none' }} />
  </div>
);

const TAB_STYLE = (active: boolean) => ({
  padding: '10px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
  border: 'none', background: active ? '#0f766e' : 'transparent', color: active ? '#fff' : '#64748b',
  borderRadius: active ? '8px' : '8px', transition: 'all 0.15s',
});

export const CPCB = () => {
  const { API_BASE, showToast, authFetch, stations } = useContext(AppContext);
  const [tab, setTab] = useState('servers');

  // ─── Tab 1: Push Servers (from ApiMappingsScreen Section 2) ───
  const [servers, setServers] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [editedMappings, setEditedMappings] = useState<any>({});
  const [historicalDates, setHistoricalDates] = useState<any>({});
  const [generatingHistorical, setGeneratingHistorical] = useState<any>({});
  const [pushLoading, setPushLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ─── Tab 2: Station Config ───
  const [configs, setConfigs] = useState<StationConfig[]>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [editingConfigId, setEditingConfigId] = useState<number | null>(null);
  const [configForm, setConfigForm] = useState<Partial<StationConfig>>({
    station_name: '', station_code: '', export_path: 'C:\\Data',
    export_enabled: true, cpcb_enabled: true, timezone: 'Asia/Kolkata', retention_count: 97,
    calibration_mode: false, maintenance_mode: false,
  });

  // ─── Tab 3: Mappings ───
  const [cpcbMappings, setCpcbMappings] = useState<Mapping[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [editingMapId, setEditingMapId] = useState<number | null>(null);
  const [mapForm, setMapForm] = useState<Partial<Mapping>>({ internal_parameter: '', cpcb_parameter: '', unit: 'ppm', conversion_factor: 1.0, enabled: true });

  // ─── Tab 4: Export ───
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const [exporting, setExporting] = useState(false);
  const [backfillStation, setBackfillStation] = useState('');
  const [backfillStart, setBackfillStart] = useState('');
  const [backfillEnd, setBackfillEnd] = useState('');
  const [backfilling, setBackfilling] = useState(false);

  // ─── Tab 5: Logs ───
  const [logs, setLogs] = useState<ExportLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  // ─── Loaders ───
  useEffect(() => { if (tab === 'servers') loadPushData(); }, [tab]);
  useEffect(() => { if (tab === 'config') loadConfigs(); }, [tab]);
  useEffect(() => { if (tab === 'mappings') loadCpcbMappings(); }, [tab]);
  useEffect(() => { if (tab === 'export') { loadExportStatus(); loadConfigs(); } }, [tab]);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab]);

  useEffect(() => {
    if (tab === 'logs') {
      const iv = setInterval(loadLogs, 30000);
      return () => clearInterval(iv);
    }
  }, [tab]);

  // ─── Push Server functions ───
  const loadPushData = async () => {
    setPushLoading(true);
    try {
      const [srvRes, mapRes] = await Promise.all([
        authFetch(`${API_BASE}/server-config/`),
        authFetch(`${API_BASE}/server-config/mappings`),
      ]);
      if (!srvRes.ok || !mapRes.ok) throw new Error('Failed to load');
      const serversData = await srvRes.json();
      const mappingsData = await mapRes.json();
      setServers(serversData);
      setMappings(mappingsData);
      const initialEdits: any = {};
      mappingsData.forEach((param: any) => {
        initialEdits[param.parameter_id] = {};
        serversData.forEach((srv: any) => {
          const existing = param.mappings?.[srv.id] || param.mappings?.[String(srv.id)] || {};
          initialEdits[param.parameter_id][srv.id] = {
            is_active: existing.is_active ?? false, api_id: existing.api_id || '', api_name: existing.api_name || '',
            api_password: existing.api_password || '', api_vname: existing.api_vname || '', api_unit: existing.api_unit || '',
            cpcb_station_name: existing.cpcb_station_name || '', cpcb_parameter: existing.cpcb_parameter || '',
            led_channel_name: existing.led_channel_name || '', led_unit: existing.led_unit || '',
          };
        });
      });
      setEditedMappings(initialEdits);
    } catch { } finally { setPushLoading(false); }
  };

  const handleServerFieldChange = (index: number, e: any) => {
    const { name, value, type, checked } = e.target;
    setServers((prev: any) => { const u = [...prev]; u[index] = { ...u[index], [name]: type === 'checkbox' ? checked : value }; return u; });
  };

  const addServer = () => {
    setServers((prev: any) => [...prev, { name: '', protocol: 'cpcb', is_active: true, is_cpcb_active: true, cpcb_file_path: '' }]);
  };

  const removeServer = async (index: number, id: number) => {
    if (id) {
      if (!confirm('Delete this server permanently?')) return;
      try { await authFetch(`${API_BASE}/server-config/${id}`, { method: 'DELETE' }); showToast('Deleted.', 'success'); } catch { showToast('Delete failed.', 'error'); return; }
    }
    setServers((prev: any) => prev.filter((_: any, i: number) => i !== index));
  };

  const handleMappingChange = (paramId: number, serverId: number, field: string, value: any) => {
    setEditedMappings((prev: any) => ({ ...prev, [paramId]: { ...prev[paramId], [serverId]: { ...(prev[paramId]?.[serverId] || {}), [field]: value } } }));
  };

  const handleSavePush = async () => {
    setSaving(true);
    try {
      const targetServers = servers.filter((s: any) => s.protocol === 'cpcb' || s.protocol === 'both');
      if (targetServers.length === 0) { showToast('No servers to save.', 'warn'); setSaving(false); return; }
      const savedServers: any[] = [];
      for (const conf of targetServers) {
        if (!conf.name?.trim()) { showToast('Server name required.', 'warn'); setSaving(false); return; }
        const method = conf.id ? 'PUT' : 'POST';
        const url = conf.id ? `${API_BASE}/server-config/${conf.id}` : `${API_BASE}/server-config/`;
        const res = await authFetch(url, { method, body: JSON.stringify(conf) });
        if (!res.ok) throw new Error('Save failed');
        savedServers.push(await res.json());
      }
      const payload = mappings.map((param: any) => {
        const paramUpdates: any = {};
        savedServers.forEach((srv: any) => {
          paramUpdates[srv.id] = { server_id: srv.id, is_active: false, api_id: '', api_name: '', api_password: '', api_vname: '', api_unit: '', cpcb_station_name: '', cpcb_parameter: '', led_channel_name: '', led_unit: '', ...(editedMappings[param.parameter_id]?.[srv.id] || {}) };
        });
        return { parameter_id: param.parameter_id, mappings: paramUpdates };
      });
      const res = await authFetch(`${API_BASE}/server-config/mappings`, { method: 'PUT', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Mapping save failed');
      showToast('CPCB push servers saved.', 'success');
      loadPushData();
    } catch (e: any) { showToast(`Save failed: ${e.message}`, 'error'); } finally { setSaving(false); }
  };

  const handleTestPush = async (serverId: number) => {
    try {
      const res = await authFetch(`${API_BASE}/server-config/${serverId}/test-push`, { method: 'POST' });
      if (!res.ok) throw new Error('Test failed');
      const data = await res.json();
      if (data.results?.length > 0) showToast(`HTTP ${data.results[0].status_code} — ${data.results[0].success ? 'OK' : 'FAIL'}`);
    } catch (e: any) { showToast(`Failed: ${e.message}`, 'error'); }
  };

  const handleGenerateHistorical = async (serverId: number, serverName: string) => {
    const date = historicalDates[serverId] || new Date().toISOString().split('T')[0];
    if (!date) { showToast('Select a date.', 'warn'); return; }
    setGeneratingHistorical((prev: any) => ({ ...prev, [serverId]: true }));
    try {
      const res = await authFetch(`${API_BASE}/server-config/${serverId}/generate-historical?date=${date}`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${serverName.replace(/\s+/g, '_')}_makeup_${date}.txt`; a.click(); a.remove(); window.URL.revokeObjectURL(url);
      showToast('Historical file downloaded.', 'success');
    } catch (e: any) { showToast(`Failed: ${e.message}`, 'error'); } finally { setGeneratingHistorical((prev: any) => ({ ...prev, [serverId]: false })); }
  };

  // ─── Config functions ───
  const loadConfigs = async () => {
    try {
      const res = await authFetch(`${API_BASE}/cpcb/config`);
      if (res.ok) setConfigs(await res.json());
    } catch { } finally { setConfigLoading(false); }
  };

  const handleSaveConfig = async (stationId: number) => {
    const payload = { ...configForm, station_id: stationId };
    const isNew = !configs.find(c => c.station_id === stationId);
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew ? `${API_BASE}/cpcb/config` : `${API_BASE}/cpcb/config/${stationId}`;
    try {
      const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) { showToast('CPCB station config saved'); setEditingConfigId(null); await loadConfigs(); }
      else { const d = await res.json(); showToast(d.detail || 'Save failed', 'error'); }
    } catch { showToast('Save failed', 'error'); }
  };

  // ─── Mapping functions ───
  const loadCpcbMappings = async () => {
    try {
      const res = await authFetch(`${API_BASE}/cpcb/mappings`);
      if (res.ok) setCpcbMappings(await res.json());
    } catch { } finally { setMapLoading(false); }
  };

  const handleSaveMapping = async () => {
    if (!mapForm.internal_parameter || !mapForm.cpcb_parameter) { showToast('Internal and CPCB parameters required', 'error'); return; }
    const isNew = editingMapId === -1;
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew ? `${API_BASE}/cpcb/mappings` : `${API_BASE}/cpcb/mappings/${editingMapId}`;
    try {
      const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mapForm) });
      if (res.ok) {
        showToast(isNew ? 'Mapping created' : 'Mapping updated');
        setEditingMapId(null);
        setMapForm({ internal_parameter: '', cpcb_parameter: '', unit: 'ppm', conversion_factor: 1.0, enabled: true });
        await loadCpcbMappings();
      } else { const d = await res.json(); showToast(d.detail || 'Save failed', 'error'); }
    } catch { showToast('Save failed', 'error'); }
  };

  const handleDeleteMapping = async (id: number) => {
    try {
      const res = await authFetch(`${API_BASE}/cpcb/mappings/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Mapping deleted'); await loadCpcbMappings(); }
      else showToast('Delete failed', 'error');
    } catch { showToast('Delete failed', 'error'); }
  };

  const startEditMapping = (m: Mapping | null) => {
    if (m) { setEditingMapId(m.id); setMapForm({ ...m }); }
    else { setEditingMapId(-1); setMapForm({ internal_parameter: '', cpcb_parameter: '', unit: 'ppm', conversion_factor: 1.0, enabled: true }); }
  };

  // ─── Export functions ───
  const loadExportStatus = async () => {
    try {
      const res = await authFetch(`${API_BASE}/cpcb/status`);
      if (res.ok) setExportStatus(await res.json());
    } catch { }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await authFetch(`${API_BASE}/cpcb/export`, { method: 'POST' });
      if (res.ok) { const d = await res.json(); showToast(`Export complete: ${d.records_exported} records`); await loadExportStatus(); }
      else { const d = await res.json(); showToast(d.detail || 'Export failed', 'error'); }
    } catch { showToast('Export request failed', 'error'); } finally { setExporting(false); }
  };

  const handleBackfill = async () => {
    if (!backfillStation || !backfillStart || !backfillEnd) { showToast('Station, start, and end date required', 'error'); return; }
    setBackfilling(true);
    try {
      const res = await authFetch(`${API_BASE}/cpcb/backfill`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ station_name: backfillStation, start_date: backfillStart, end_date: backfillEnd }) });
      if (res.ok) { const d = await res.json(); showToast(`Backfill complete: ${d.records_created} records`); await loadExportStatus(); }
      else { const d = await res.json(); showToast(d.detail || 'Backfill failed', 'error'); }
    } catch { showToast('Backfill request failed', 'error'); } finally { setBackfilling(false); }
  };

  const handleDownload = async (stationName: string) => {
    try {
      const res = await authFetch(`${API_BASE}/cpcb/download/${encodeURIComponent(stationName)}`);
      if (res.ok) { const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${stationName}.txt`; a.click(); URL.revokeObjectURL(url); showToast(`Downloaded ${stationName}.txt`); }
      else showToast('File not found. Run export first.', 'error');
    } catch { showToast('Download failed', 'error'); }
  };

  // ─── Logs functions ───
  const loadLogs = async () => {
    try {
      const res = await authFetch(`${API_BASE}/cpcb/logs?limit=200`);
      if (res.ok) setLogs(await res.json());
    } catch { } finally { setLogsLoading(false); }
  };

  const statusColor = (s: string) => s === 'success' ? T.success : s === 'partial_failure' ? T.warning : T.danger;

  // ─── Render tab content ───
  const renderServersTab = () => {
    const cpcbServers = servers.filter((s: any) => s.protocol === 'cpcb' || s.protocol === 'both');
    const cpcbMappedServers = servers.filter((s: any) => s.id && s.is_active && (s.protocol === 'cpcb' || s.protocol === 'both'));

    if (pushLoading) return <p style={{ color: T.textFaint }}>Loading...</p>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <div className="section-title">CPCB TXT File Generation</div>
              <p style={{ fontSize: '12px', color: T.textFaint, margin: '2px 0 0' }}>Annexure-I format CSV/TXT file with 15-min averaged data</p>
            </div>
            <button onClick={handleSavePush} disabled={saving} style={{ ...BTN.primary }}>{saving ? 'Saving...' : 'Save Push Servers'}</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {cpcbServers.map((conf: any, idx: number) => (
              <div key={conf.id || idx} style={{ ...GLASS_CARD, padding: '14px 16px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 160px' }}>
                    <label style={s()}>Server Name</label>
                    <input type="text" name="name" value={conf.name || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="e.g. CPCB Gujarat" style={ipt} />
                  </div>
                  <div style={{ flex: '1 1 300px' }}>
                    <label style={s()}>Output File Path</label>
                    <input type="text" name="cpcb_file_path" value={conf.cpcb_file_path || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="C:\Data\readings.txt" style={ipt} />
                  </div>
                  <div style={{ flexShrink: 0, display: 'flex', gap: '4px', paddingBottom: '2px' }}>
                    <button onClick={() => removeServer(idx, conf.id)} style={{ ...BTN.danger, padding: '8px 12px' }}>Delete</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#475569' }}>
                    <Toggle checked={!!conf.is_active} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_active', type: 'checkbox', checked: !conf.is_active } })} />
                    {conf.is_active ? 'Enabled' : 'Disabled'}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#475569' }}>
                    <Toggle checked={conf.is_cpcb_active ?? true} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_cpcb_active', type: 'checkbox', checked: !(conf.is_cpcb_active ?? true) } })} />
                    CPCB Push
                  </label>
                  {conf.id && (
                    <>
                      <button onClick={() => handleTestPush(conf.id)} style={{ background: '#0f766e', color: '#fff', border: 'none', height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>Test Push</button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input type="date" value={historicalDates[conf.id] || new Date().toISOString().split('T')[0]} max={new Date().toISOString().split('T')[0]} onChange={e => setHistoricalDates((prev: any) => ({ ...prev, [conf.id]: e.target.value }))} style={{ ...ipt, padding: '4px 8px', height: '30px', fontSize: '12px', width: '130px' }} />
                        <button onClick={() => handleGenerateHistorical(conf.id, conf.name)} disabled={generatingHistorical[conf.id]} style={{ background: '#ca8a04', color: '#fff', border: 'none', height: '30px', padding: '0 12px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{generatingHistorical[conf.id] ? '...' : 'Makeup'}</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
            {cpcbServers.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px', border: '1.5px dashed #e2e8f0', borderRadius: '10px' }}>
                No CPCB push server configured. Click below to add one.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button onClick={addServer} style={{ background: 'transparent', border: '1.5px solid #ca8a04', borderRadius: '8px', color: '#ca8a04', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>+ Add CPCB Server</button>
          </div>

          {/* Parameter mapping table for CPCB servers */}
          {cpcbMappedServers.length > 0 && mappings.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: T.text, marginBottom: '10px' }}>Parameter Mappings</div>
              {cpcbMappedServers.map((srv: any) => (
                <div key={srv.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px' }}>
                  <div style={{ padding: '8px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '12px', fontWeight: '700', color: '#0f766e' }}>{srv.name}</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
                          <th style={{ padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Ch</th>
                          <th style={{ padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Station</th>
                          <th style={{ padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Parameter</th>
                          <th style={{ padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Push</th>
                          <th style={{ padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>vname</th>
                          <th style={{ padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Unit</th>
                          <th style={{ padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>CPCB St.</th>
                          <th style={{ padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>CPCB Param</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mappings.map((param: any) => {
                          const state = editedMappings[param.parameter_id]?.[srv.id] || { is_active: false, api_vname: '', api_unit: '', cpcb_station_name: '', cpcb_parameter: '' };
                          const inpS: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '4px 6px', border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', borderRadius: '4px', background: 'transparent', fontSize: '12px', color: '#334155', outline: 'none', fontFamily: T.fontMono };
                          return (
                            <tr key={param.parameter_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '4px 10px', fontWeight: '700', color: '#0f172a', fontSize: '12px' }}>{param.channel_no}</td>
                              <td style={{ padding: '4px 10px', color: '#475569', fontSize: '12px' }}>{param.station_name}</td>
                              <td style={{ padding: '4px 10px', fontWeight: '700', color: '#0f766e', fontSize: '12px' }}>{param.parameter_name}</td>
                              <td style={{ padding: '4px 10px' }}><Toggle checked={!!state.is_active} onChange={() => handleMappingChange(param.parameter_id, srv.id, 'is_active', !state.is_active)} /></td>
                              <td style={{ padding: '2px 6px' }}><input style={inpS} value={state.api_vname || ''} onChange={e => handleMappingChange(param.parameter_id, srv.id, 'api_vname', e.target.value)} /></td>
                              <td style={{ padding: '2px 6px' }}><input style={inpS} value={state.api_unit || ''} onChange={e => handleMappingChange(param.parameter_id, srv.id, 'api_unit', e.target.value)} /></td>
                              <td style={{ padding: '2px 6px' }}><input style={inpS} value={state.cpcb_station_name || ''} onChange={e => handleMappingChange(param.parameter_id, srv.id, 'cpcb_station_name', e.target.value)} placeholder="St. Name" /></td>
                              <td style={{ padding: '2px 6px' }}>
                                <select style={{ ...inpS, cursor: 'pointer' }} value={state.cpcb_parameter || ''} onChange={e => handleMappingChange(param.parameter_id, srv.id, 'cpcb_parameter', e.target.value)}>
                                  <option value="">--</option>
                                  {CPCB_PARAMS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderConfigTab = () => {
    if (configLoading) return <p style={{ color: T.textFaint }}>Loading...</p>;
    return (
      <div className="card" style={{ padding: '20px' }}>
        <div className="section-title">CPCB Station Configuration</div>
        <p style={{ fontSize: '12px', color: T.textFaint, marginBottom: '16px' }}>Configure station-level CPCB CAAQM legacy file export settings.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {stations.map((station: any) => {
            const config = configs.find(c => c.station_id === station.id);
            const isEditing = editingConfigId === station.id;
            const f: any = isEditing ? configForm : (config || { station_name: station.name, station_code: '', export_path: 'C:\\Data', retention_count: 97, export_enabled: true, cpcb_enabled: true, timezone: 'Asia/Kolkata', calibration_mode: false, maintenance_mode: false });
            return (
              <div key={station.id} style={{ ...GLASS_CARD, padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: T.primary }}>{station.name}</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!config ? (
                      <button style={BTN.primary} onClick={() => { setEditingConfigId(station.id); setConfigForm({ station_name: station.name, export_path: 'C:\\Data', retention_count: 97, export_enabled: true, cpcb_enabled: true, timezone: 'Asia/Kolkata', calibration_mode: false, maintenance_mode: false }); }}>Add Config</button>
                    ) : isEditing ? (
                      <>
                        <button style={BTN.primary} onClick={() => handleSaveConfig(station.id)}>Save</button>
                        <button style={BTN.ghost} onClick={() => setEditingConfigId(null)}>Cancel</button>
                      </>
                    ) : (
                      <button style={BTN.ghost} onClick={() => { setEditingConfigId(station.id); setConfigForm({ ...config }); }}>Edit</button>
                    )}
                  </div>
                </div>
                {(isEditing || config) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '4px' }}>Station Name (CPCB)</label>
                      <input style={INP} value={isEditing ? (f.station_name || '') : config!.station_name} onChange={e => setConfigForm(p => ({ ...p, station_name: e.target.value }))} disabled={!isEditing} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '4px' }}>Station Code</label>
                      <input style={INP} value={isEditing ? (f.station_code || '') : (config?.station_code || '')} onChange={e => setConfigForm(p => ({ ...p, station_code: e.target.value }))} disabled={!isEditing} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '4px' }}>Export Path</label>
                      <input style={INP} value={isEditing ? (f.export_path || '') : config!.export_path} onChange={e => setConfigForm(p => ({ ...p, export_path: e.target.value }))} disabled={!isEditing} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '4px' }}>Retention Count</label>
                      <input style={INP} type="number" value={isEditing ? (f.retention_count ?? 97) : config!.retention_count} onChange={e => setConfigForm(p => ({ ...p, retention_count: parseInt(e.target.value) || 97 }))} disabled={!isEditing} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '4px' }}>Timezone</label>
                      <input style={INP} value={isEditing ? (f.timezone || '') : config!.timezone} onChange={e => setConfigForm(p => ({ ...p, timezone: e.target.value }))} disabled={!isEditing} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', paddingBottom: '4px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: T.textLabel, cursor: 'pointer' }}>
                        <input type="checkbox" checked={isEditing ? (f.export_enabled ?? true) : config!.export_enabled} onChange={e => setConfigForm(p => ({ ...p, export_enabled: e.target.checked }))} disabled={!isEditing} />
                        Export Enabled
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: T.textLabel, cursor: 'pointer' }}>
                        <input type="checkbox" checked={isEditing ? (f.cpcb_enabled ?? true) : config!.cpcb_enabled} onChange={e => setConfigForm(p => ({ ...p, cpcb_enabled: e.target.checked }))} disabled={!isEditing} />
                        CPCB Enabled
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: T.warning, cursor: 'pointer' }}>
                        <input type="checkbox" checked={isEditing ? (f.calibration_mode ?? false) : (config?.calibration_mode ?? false)} onChange={e => setConfigForm(p => ({ ...p, calibration_mode: e.target.checked }))} disabled={!isEditing} />
                        Calibration
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: T.danger, cursor: 'pointer' }}>
                        <input type="checkbox" checked={isEditing ? (f.maintenance_mode ?? false) : (config?.maintenance_mode ?? false)} onChange={e => setConfigForm(p => ({ ...p, maintenance_mode: e.target.checked }))} disabled={!isEditing} />
                        Maintenance
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMappingsTab = () => {
    if (mapLoading) return <p style={{ color: T.textFaint }}>Loading...</p>;
    return (
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div className="section-title" style={{ margin: 0 }}>CPCB Parameter Mapping</div>
          <button style={BTN.primary} onClick={() => startEditMapping(null)}>+ Add Mapping</button>
        </div>

        {editingMapId !== null && (
          <div style={{ ...GLASS_CARD, padding: '16px', marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '3px' }}>Internal Parameter</label>
              <input style={INP} value={mapForm.internal_parameter || ''} onChange={e => setMapForm(p => ({ ...p, internal_parameter: e.target.value }))} placeholder="e.g. CO" />
            </div>
            <div>
              <label style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '3px' }}>CPCB Parameter</label>
              <input style={INP} value={mapForm.cpcb_parameter || ''} onChange={e => setMapForm(p => ({ ...p, cpcb_parameter: e.target.value }))} placeholder="e.g. CO" />
            </div>
            <div>
              <label style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '3px' }}>Unit</label>
              <input style={INP} value={mapForm.unit || ''} onChange={e => setMapForm(p => ({ ...p, unit: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '3px' }}>Conversion Factor</label>
              <input style={INP} type="number" step="0.0001" value={mapForm.conversion_factor ?? 1.0} onChange={e => setMapForm(p => ({ ...p, conversion_factor: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <label style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '3px' }}>Enabled</label>
              <input type="checkbox" checked={mapForm.enabled ?? true} onChange={e => setMapForm(p => ({ ...p, enabled: e.target.checked }))} style={{ marginTop: '8px', cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button style={BTN.primary} onClick={handleSaveMapping}>Save</button>
              <button style={BTN.ghost} onClick={() => setEditingMapId(null)}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: T.primaryBg, borderBottom: `2px solid ${T.primaryBorder}` }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Internal Parameter</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>CPCB Parameter</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Unit</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Conversion Factor</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Enabled</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cpcbMappings.map(m => (
                <tr key={m.id} style={{ borderBottom: `1px solid ${T.borderSoft}`, background: m.enabled ? 'transparent' : '#f8fafc' }}>
                  <td style={{ padding: '10px 12px', fontWeight: '700', color: T.text }}>{m.internal_parameter}</td>
                  <td style={{ padding: '10px 12px', fontWeight: '600', color: T.primary }}>{m.cpcb_parameter}</td>
                  <td style={{ padding: '10px 12px', color: T.textMuted }}>{m.unit}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: T.fontMono, color: T.textMuted }}>{m.conversion_factor.toFixed(4)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{ color: m.enabled ? T.success : T.danger, fontWeight: '700', fontSize: '11px' }}>{m.enabled ? 'Yes' : 'No'}</span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button style={BTN.ghost} onClick={() => startEditMapping(m)}>Edit</button>
                      <button style={BTN.danger} onClick={() => handleDeleteMapping(m.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
              {cpcbMappings.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: T.textFaint }}>No mappings configured. Click "+ Add Mapping" to create one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderExportTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="card" style={{ padding: '20px' }}>
        <div className="section-title">CPCB Export Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          <div style={{ ...GLASS_CARD, padding: '16px', borderLeft: `4px solid ${T.primary}` }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase' }}>Active Stations</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: T.text, fontFamily: T.fontMono }}>{exportStatus?.enabled_stations ?? '—'}</div>
          </div>
          <div style={{ ...GLASS_CARD, padding: '16px', borderLeft: `4px solid ${T.info}` }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase' }}>Parameter Mappings</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: T.text, fontFamily: T.fontMono }}>{exportStatus?.total_mappings ?? '—'}</div>
          </div>
          <div style={{ ...GLASS_CARD, padding: '16px', borderLeft: `4px solid ${T.success}` }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase' }}>Export Records</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: T.text, fontFamily: T.fontMono }}>{exportStatus?.total_export_records ?? '—'}</div>
          </div>
          <div style={{ ...GLASS_CARD, padding: '16px', borderLeft: `4px solid ${exportStatus?.last_log?.status === 'success' ? T.success : T.warning}` }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase' }}>Last Export</div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: T.text }}>{exportStatus?.last_log ? new Date(exportStatus.last_log.created_at).toLocaleString() : 'Never'}</div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: T.textFaint }}>{exportStatus?.last_log ? `${exportStatus.last_log.record_count} records` : '—'}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '20px' }}>
        <div className="section-title">Manual Export</div>
        <p style={{ fontSize: '12px', color: T.textFaint, marginBottom: '12px' }}>Trigger an immediate CPCB file export for all configured stations.</p>
        <button style={BTN.primary} onClick={handleExport} disabled={exporting}>{exporting ? 'Exporting...' : 'Export Now'}</button>
      </div>

      <div className="card" style={{ padding: '20px' }}>
        <div className="section-title">Historical Backfill</div>
        <p style={{ fontSize: '12px', color: T.textFaint, marginBottom: '12px' }}>Recalculate and regenerate CPCB records for a date range.</p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '4px' }}>Station</label>
            <select style={INP} value={backfillStation} onChange={e => setBackfillStation(e.target.value)}>
              <option value="">Select station...</option>
              {configs.map(s => <option key={s.id} value={s.station_name}>{s.station_name}</option>)}
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
          <button style={BTN.primary} onClick={handleBackfill} disabled={backfilling}>{backfilling ? 'Generating...' : 'Generate Backfill'}</button>
        </div>
      </div>

      <div className="card" style={{ padding: '20px' }}>
        <div className="section-title">Download Files</div>
        <p style={{ fontSize: '12px', color: T.textFaint, marginBottom: '12px' }}>Download generated CPCB export files per station.</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {configs.map(s => (
            <button key={s.id} style={BTN.ghost} onClick={() => handleDownload(s.station_name)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                {s.station_name}.txt
              </span>
            </button>
          ))}
          {configs.length === 0 && <span style={{ fontSize: '12px', color: T.textFaint }}>No stations configured. Add CPCB station config first.</span>}
        </div>
      </div>
    </div>
  );

  const renderLogsTab = () => {
    if (logsLoading) return <p style={{ color: T.textFaint }}>Loading...</p>;
    return (
      <div className="card" style={{ padding: '20px' }}>
        <div className="section-title">CPCB Export Logs</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: T.primaryBg, borderBottom: `2px solid ${T.primaryBorder}` }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Time</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Station</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Records</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Duration (ms)</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                  <td style={{ padding: '10px 12px', fontFamily: T.fontMono, fontSize: '12px', color: T.textMuted }}>{new Date(log.created_at).toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', fontWeight: '700', color: T.text }}>{log.station_name}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: T.fontMono, fontWeight: '700', color: T.text }}>{log.record_count}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{ background: `${statusColor(log.status)}22`, color: statusColor(log.status), padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>{log.status}</span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: T.fontMono, color: T.textMuted }}>{log.execution_time_ms ?? '—'}</td>
                  <td style={{ padding: '10px 12px', color: T.textFaint, fontSize: '12px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.message || '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: T.textFaint }}>No export logs yet. Run an export first.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const TABS = [
    { key: 'servers', label: 'Push Servers' },
    { key: 'config', label: 'Station Config' },
    { key: 'mappings', label: 'Parameter Mappings' },
    { key: 'export', label: 'Export' },
    { key: 'logs', label: 'Logs' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc', fontFamily: T.fontBase }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 28px', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em' }}>CPCB</h1>
        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8', fontWeight: '600' }}>Central Pollution Control Board — Push servers, station config, parameter mappings, file export & logs</p>
      </div>

      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '8px 28px', display: 'flex', gap: '6px' }}>
        {TABS.map(t => (
          <button key={t.key} style={TAB_STYLE(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {tab === 'servers' && renderServersTab()}
        {tab === 'config' && renderConfigTab()}
        {tab === 'mappings' && renderMappingsTab()}
        {tab === 'export' && renderExportTab()}
        {tab === 'logs' && renderLogsTab()}
      </div>
    </div>
  );
};
