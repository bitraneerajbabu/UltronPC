import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { T } from '../theme';

const CPCB_PARAMS = [
  'CO', 'SO2', 'NO', 'NO2', 'NOx', 'Ozone', 'PM10', 'PM2.5', 'Temp',
  'WS', 'WD', 'AT', 'RH', 'BP', 'SR', 'RF', 'VWS',
  'Benzene', 'Toluene', 'Xylene', 'Eth-Benzene', 'MP-Xylene',
  'CH4', 'NH3', 'HCHO', 'Hg',
];

const formatError = (detail, fallback) => {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(d => `${d.loc ? `[${d.loc.join('.')}] ` : ''}${d.msg || JSON.stringify(d)}`).join('; ');
  return detail.message || JSON.stringify(detail);
};

const s = () => ({ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' });
const ipt = { width: '100%', background: '#fff', border: '1px solid #e2e8f0', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#0f172a', outline: 'none', fontFamily: T.fontMono, transition: 'border-color 0.15s', boxSizing: 'border-box' as const };

const Toggle = ({ checked, onChange }) => (
  <div onClick={onChange} style={{ position: 'relative', width: 34, height: 18, cursor: 'pointer', flexShrink: 0 }}>
    <div style={{ position: 'absolute', inset: 0, borderRadius: 99, background: checked ? '#0f766e' : '#cbd5e1', transition: 'background 0.2s' }} />
    <div style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', pointerEvents: 'none' }} />
  </div>
);

const Plus = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const Trash = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>;

export const ApiMappingsScreen = () => {
  const { API_BASE, showToast, authFetch } = useContext(AppContext);
  const [servers, setServers] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedMappings, setEditedMappings] = useState({});
  const [historicalDates, setHistoricalDates] = useState({});
  const [generatingHistorical, setGeneratingHistorical] = useState({});

  const [testingPush, setTestingPush] = useState({});
  const [testingDelayPush, setTestingDelayPush] = useState({});
  const [testResultModal, setTestResultModal] = useState(null);
  const [pendingCounts, setPendingCounts] = useState({});

  const [rajapiUrl, setRajapiUrl] = useState('');
  const [rajapiKey, setRajapiKey] = useState('');
  const [rajapiStatus, setRajapiStatus] = useState(null);
  const [rajapiSaving, setRajapiSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const infoRes = await authFetch(`${API_BASE}/led/info`);
      if (infoRes.ok) {

      }
    } catch (_) {}

    try {
      const [srvRes, mapRes, licRes, pendRes] = await Promise.all([
        authFetch(`${API_BASE}/server-config/`),
        authFetch(`${API_BASE}/server-config/mappings`),
        authFetch(`${API_BASE}/license/status`),
        authFetch(`${API_BASE}/server-config/pending-counts`),
      ]);
      if (!srvRes.ok || !mapRes.ok) throw new Error('Failed to load');
      const serversData = await srvRes.json();
      const mappingsData = await mapRes.json();
      setServers(serversData);
      setMappings(mappingsData);
      if (pendRes.ok) setPendingCounts(await pendRes.json());

      const initialEdits = {};
      mappingsData.forEach(param => {
        initialEdits[param.parameter_id] = {};
        serversData.forEach(srv => {
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

      if (licRes.ok) {
        const licData = await licRes.json();
        setRajapiStatus(licData.licensed ? 'active' : 'inactive');
      }
    } catch (e) {
      try {
        const cm = localStorage.getItem('cached_api_mappings');
        const cs = localStorage.getItem('cached_api_servers');
        if (cm && cs) {
          setEditedMappings(JSON.parse(cm));
          setServers(JSON.parse(cs));
        }
      } catch (_) { localStorage.removeItem('cached_api_mappings'); localStorage.removeItem('cached_api_servers'); }
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await authFetch(`${API_BASE}/server-config/pending-counts`);
        if (res.ok) setPendingCounts(await res.json());
      } catch (_) {}
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const handleMappingChange = (paramId, serverId, field, value) => {
    setEditedMappings(prev => ({ ...prev, [paramId]: { ...prev[paramId], [serverId]: { ...(prev[paramId]?.[serverId] || {}), [field]: value } } }));
  };

  const handleServerFieldChange = (index, e) => {
    const { name, value, type, checked } = e.target;
    setServers(prev => { const u = [...prev]; u[index] = { ...u[index], [name]: type === 'checkbox' ? checked : value }; return u; });
  };

  const addServer = (protocol) => {
    const base = { name: '', protocol, is_active: true, is_cpcb_active: true, led_channel_id: null, led_station_name: '' };
    if (protocol === 'tspcb') setServers(prev => [...prev, { ...base, live_url: '', delay_url: '' }]);
    else if (protocol === 'cpcb') setServers(prev => [...prev, { ...base, cpcb_file_path: '' }]);
    else setServers(prev => [...prev, { ...base }]);
  };

  const removeServer = async (index, id) => {
    if (id) {
      if (!confirm('Delete this server permanently?')) return;
      try { await authFetch(`${API_BASE}/server-config/${id}`, { method: 'DELETE' }); showToast('Deleted.', 'success'); } catch { showToast('Delete failed.', 'error'); return; }
    }
    setServers(prev => prev.filter((_, i) => i !== index));
  };

  const SECTION_FILTERS = {
    spcb: s => s.protocol === 'tspcb' || s.protocol === 'both',
    cpcb: s => s.protocol === 'cpcb' || s.protocol === 'both',
    led: s => s.protocol === 'led',
  };
  const SECTION_LABELS = { spcb: 'SPCB', cpcb: 'CPCB', led: 'LED' };

  const handleSave = async (section) => {
    setSaving(true);
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);
    const filter = section ? SECTION_FILTERS[section] : null;
    const label = section ? SECTION_LABELS[section] : 'All';
    try {
      const targetServers = filter ? servers.filter(filter) : servers;
      if (targetServers.length === 0) { showToast('No servers to save.', 'warn'); setSaving(false); clearTimeout(tid); return; }
      const savedServers = [];
      for (const conf of targetServers) {
        if (!conf.name?.trim()) { showToast(`${label}: Server name required.`, 'warn'); setSaving(false); clearTimeout(tid); return; }
        const method = conf.id ? 'PUT' : 'POST';
        const url = conf.id ? `${API_BASE}/server-config/${conf.id}` : `${API_BASE}/server-config/`;
        const res = await authFetch(url, { method, body: JSON.stringify(conf), signal: controller.signal });
        if (!res.ok) throw new Error(formatError((await res.json().catch(() => ({}))).detail, `${label} save failed (${res.status})`));
        savedServers.push(await res.json());
      }
      const payload = mappings.map(param => {
        const paramUpdates = {};
        savedServers.forEach(srv => {
          paramUpdates[srv.id] = { server_id: srv.id, is_active: false, api_id: '', api_name: '', api_password: '', api_vname: '', api_unit: '', cpcb_station_name: '', cpcb_parameter: '', led_channel_name: '', led_unit: '', ...(editedMappings[param.parameter_id]?.[srv.id] || editedMappings[param.parameter_id]?.[String(srv.id)] || {}) };
        });
        return { parameter_id: param.parameter_id, mappings: paramUpdates };
      });
      const res = await authFetch(`${API_BASE}/server-config/mappings`, { method: 'PUT', body: JSON.stringify(payload), signal: controller.signal });
      if (!res.ok) throw new Error(formatError((await res.json().catch(() => ({}))).detail, 'Mapping save failed'));
      clearTimeout(tid);
      showToast(`${label} configurations saved.`, 'success');
      loadData();
    } catch (e) {
      clearTimeout(tid);
      if (e.name === 'AbortError' || !navigator.onLine) {
        localStorage.setItem('cached_api_mappings', JSON.stringify(editedMappings));
        localStorage.setItem('cached_api_servers', JSON.stringify(servers));
        showToast('Saved offline. Will sync when online.', 'warn');
      } else showToast(`Save failed: ${e.message}`, 'error');
    } finally { setSaving(false); }
  };

  const handleGenerateHistorical = async (serverId, serverName) => {
    const date = historicalDates[serverId] || new Date().toISOString().split('T')[0];
    if (!date) { showToast('Select a date.', 'warn'); return; }
    setGeneratingHistorical(prev => ({ ...prev, [serverId]: true }));
    try {
      const res = await authFetch(`${API_BASE}/server-config/${serverId}/generate-historical?date=${date}`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Failed (${res.status})`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${serverName.replace(/\s+/g, '_')}_makeup_${date}.txt`; a.click(); a.remove(); window.URL.revokeObjectURL(url);
      showToast('Historical file downloaded.', 'success');
    } catch (err) { showToast(`Failed: ${err.message}`, 'error'); }
    finally { setGeneratingHistorical(prev => ({ ...prev, [serverId]: false })); }
  };

  const handleTestPush = async (serverId) => {
    setTestingPush(prev => ({ ...prev, [serverId]: true }));
    try {
      const res = await authFetch(`${API_BASE}/server-config/${serverId}/test-push`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Test failed (${res.status})`);
      const data = await res.json();
      if (data.results?.length > 0) setTestResultModal({ title: 'Live Push', status: data.results[0].status_code, response: data.results[0].response, success: data.results[0].success });
      else showToast('No payloads sent.', 'warn');
    } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
    finally { setTestingPush(prev => ({ ...prev, [serverId]: false })); }
  };

  const handleTestDelayPush = async (serverId) => {
    setTestingDelayPush(prev => ({ ...prev, [serverId]: true }));
    try {
      const res = await authFetch(`${API_BASE}/server-config/${serverId}/test-delay-push`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Test failed (${res.status})`);
      setTestResultModal({ ...(await res.json()), title: 'Delay Push Test', success: true });
    } catch (err) { setTestResultModal({ title: 'Delay Push Test', response: err.message, status: 0, success: false }); }
    finally { setTestingDelayPush(prev => ({ ...prev, [serverId]: false })); }
  };

  const handleClearPending = async (serverId) => {
    if (!confirm('Delete all pending upload records for this server?')) return;
    try {
      const res = await authFetch(`${API_BASE}/server-config/${serverId}/pending-records`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      const data = await res.json();
      setPendingCounts(prev => ({ ...prev, [serverId]: 0 }));
      showToast(`Cleared ${data.deleted} pending record(s).`, 'success');
    } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
  };

  const handleRajapiVerify = async () => {
    if (!rajapiUrl || !rajapiKey) { showToast('URL and API Key required.', 'warn'); return; }
    setRajapiSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/license/verify`, { method: 'POST', body: JSON.stringify({ api_url: rajapiUrl, api_key: rajapiKey }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Verify failed');
      showToast('Central sync configured successfully.', 'success');
      setRajapiStatus('active');
    } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
    finally { setRajapiSaving(false); }
  };

  const sectionHeader = (num, title, desc, color, onSave) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
      <div style={{ width: 28, height: 28, borderRadius: '8px', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', flexShrink: 0, marginTop: '2px' }}>{num}</div>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>{title}</h3>
        {desc && <p style={{ margin: '1px 0 0', fontSize: '11px', color: '#94a3b8' }}>{desc}</p>}
      </div>
      {onSave && (
        <button onClick={onSave} disabled={saving} style={{
          background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: '#fff', border: 'none',
          borderRadius: '6px', padding: '6px 14px', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '6px', opacity: saving ? 0.6 : 1, flexShrink: 0,
        }}><Plus /> {saving ? '...' : 'Save'}</button>
      )}
    </div>
  );

  const renderMappingTable = (serverFilter) => {
    const filteredServers = servers.filter(s => s.id && s.is_active && serverFilter(s));
    if (filteredServers.length === 0) return null;

    return (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginTop: '10px' }}>
        {filteredServers.map(srv => {
          const isCpcb = srv.protocol === 'cpcb';
          const isBoth = srv.protocol === 'both';
          const isLed = srv.protocol === 'led';
          const showCpcbCols = isCpcb || isBoth;
          const showTgpcbCols = srv.protocol === 'tspcb' || isBoth;
          return (
            <div key={srv.id}>
              <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '12px', fontWeight: '700', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {srv.name}
                <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '99px', background: isLed ? '#fff7ed' : isCpcb ? '#fef3c7' : '#f0fdfa', color: isLed ? '#ea580c' : isCpcb ? '#ca8a04' : '#0f766e' }}>{isLed ? 'LED' : isCpcb ? 'CPCB' : isBoth ? 'Both' : 'TGPCB'}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
                      <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Ch</th>
                      <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Station</th>
                      <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Parameter</th>
                      <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Push</th>
                      {isLed ? (
                        <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>LED Name</th>
                      ) : (
                        <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>vname</th>
                      )}
                      {isLed ? (
                        <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Unit</th>
                      ) : (
                        <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>unit</th>
                      )}
                      {showCpcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>CPCB Station</th>}
                      {showCpcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>CPCB Param</th>}
                      {showTgpcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Device ID</th>}
                      {showTgpcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Username</th>}
                      {showTgpcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Password</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.length === 0 ? (
                      <tr><td colSpan={12} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>No parameters found. Add devices and parameters first.</td></tr>
                    ) : (
                      mappings.map(param => {
                        const state = editedMappings[param.parameter_id]?.[srv.id] || { is_active: false, api_id: '', api_name: '', api_password: '', api_vname: '', api_unit: '', cpcb_station_name: '', cpcb_parameter: '', led_channel_name: '', led_unit: '' };
                        const cellChg = (f, v) => handleMappingChange(param.parameter_id, srv.id, f, v);
                        const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '5px 6px', border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', borderRadius: '4px', background: 'transparent', fontSize: '12px', color: '#334155', outline: 'none', fontFamily: T.fontMono };
                        return (
                          <tr key={param.parameter_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 10px', fontWeight: '700', color: '#0f172a', fontSize: '12px' }}>{param.channel_no}</td>
                            <td style={{ padding: '6px 10px', color: '#475569', fontSize: '12px' }}>{param.station_name}</td>
                            <td style={{ padding: '6px 10px', fontWeight: '700', color: '#0f766e', fontSize: '12px' }}>{param.parameter_name}</td>
                            <td style={{ padding: '6px 10px' }}><Toggle checked={!!state.is_active} onChange={() => cellChg('is_active', !state.is_active)} /></td>
                            {isLed ? (
                              <td style={{ padding: '4px 6px' }}><input style={inp} placeholder="LED Name" value={state.led_channel_name || ''} onChange={e => cellChg('led_channel_name', e.target.value)} /></td>
                            ) : (
                              <td style={{ padding: '4px 6px' }}><input style={inp} placeholder="vname" value={state.api_vname || ''} onChange={e => cellChg('api_vname', e.target.value)} /></td>
                            )}
                            {isLed ? (
                              <td style={{ padding: '4px 6px' }}><input style={inp} placeholder="Unit" value={state.led_unit || ''} onChange={e => cellChg('led_unit', e.target.value)} /></td>
                            ) : (
                              <td style={{ padding: '4px 6px' }}><input style={inp} placeholder="unit" value={state.api_unit || ''} onChange={e => cellChg('api_unit', e.target.value)} /></td>
                            )}
                            {showCpcbCols && <td style={{ padding: '4px 6px' }}><input style={inp} placeholder="St. Name" value={state.cpcb_station_name || ''} onChange={e => cellChg('cpcb_station_name', e.target.value)} /></td>}
                            {showCpcbCols && (
                              <td style={{ padding: '4px 6px' }}>
                                <select style={{ ...inp, cursor: 'pointer' }} value={state.cpcb_parameter || ''} onChange={e => cellChg('cpcb_parameter', e.target.value)}>
                                  <option value="">--</option>
                                  {CPCB_PARAMS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                              </td>
                            )}
                            {showTgpcbCols && <td style={{ padding: '4px 6px' }}><input style={inp} placeholder="ID" value={state.api_id || ''} onChange={e => cellChg('api_id', e.target.value)} /></td>}
                            {showTgpcbCols && <td style={{ padding: '4px 6px' }}><input style={inp} placeholder="Username" value={state.api_name || ''} onChange={e => cellChg('api_name', e.target.value)} /></td>}
                            {showTgpcbCols && <td style={{ padding: '4px 6px' }}><input style={inp} placeholder="Password" value={state.api_password || ''} onChange={e => cellChg('api_password', e.target.value)} /></td>}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderServerCard = (conf, idx, protocolType, extraFields, subRow) => {
    const pendCount = pendingCounts[conf.id] || 0;
    return (
      <div key={conf.id || idx} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', background: '#fff' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={s()}>Server Name</label>
            <input type="text" name="name" value={conf.name || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="e.g. TGPCB Gujarat" style={ipt} />
          </div>
          {extraFields}
          <div style={{ flexShrink: 0, display: 'flex', gap: '4px', paddingBottom: '2px' }}>
            {pendCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0 10px', borderRadius: '99px', background: '#fef3c7', border: '1px solid #fbbf24', fontSize: '11px', fontWeight: '700', color: '#92400e' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                {pendCount} pending
                <button onClick={() => handleClearPending(conf.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '10px', fontWeight: '700', padding: '2px 4px', marginLeft: '2px', textDecoration: 'underline' }}>Clear</button>
              </div>
            )}
            <button onClick={() => removeServer(idx, conf.id)} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash /></button>
          </div>
        </div>
        {subRow && <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>{subRow}</div>}
      </div>
    );
  };

  if (loading) return (
    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8' }}>Loading mappings...</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc', fontFamily: T.fontBase }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em' }}>Push & Mappings Configuration</h1>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8', fontWeight: '600' }}>Configure SPCB, CPCB, Central Sync, and LED Board push servers</p>
        </div>
        <button onClick={handleSave} disabled={saving} style={{
          background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: '#fff', border: 'none',
          borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(15,118,110,0.3)', opacity: saving ? 0.7 : 1,
        }}><Plus /> {saving ? 'Saving...' : 'Save All'}</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* ─── 1. SPCB (TGPCB) Push ─── */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          {sectionHeader(1, 'SPCB (TGPCB) Push', 'JSON HTTP push to State Pollution Control Board — live (1 min) and delay (15 min) URLs', '#0f766e', () => handleSave('spcb'))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {servers.map((conf, idx) => (conf.protocol === 'tspcb' || conf.protocol === 'both') ? renderServerCard(conf, idx, 'tspcb',
              <><div style={{ flex: '1 1 200px' }}><label style={s()}>Live URL</label><input type="text" name="live_url" value={conf.live_url || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="https://.../live" style={ipt} /></div><div style={{ flex: '1 1 200px' }}><label style={s()}>Delay URL</label><input type="text" name="delay_url" value={conf.delay_url || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="https://.../delay" style={ipt} /></div></>,
              <><label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: '600', color: '#475569' }}><Toggle checked={!!conf.is_active} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_active', type: 'checkbox', checked: !conf.is_active } })} />{conf.is_active ? 'Enabled' : 'Disabled'}</label>{conf.protocol === 'both' && <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: '600', color: '#475569' }}><Toggle checked={conf.is_cpcb_active ?? true} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_cpcb_active', type: 'checkbox', checked: !(conf.is_cpcb_active ?? true) } })} />CPCB Push</label>}{conf.id && <div style={{ display: 'flex', gap: '6px' }}><button onClick={() => handleTestPush(conf.id)} disabled={testingPush[conf.id]} style={{ background: '#0f766e', color: '#fff', border: 'none', height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{testingPush[conf.id] ? '...' : 'Test Live'}</button><button onClick={() => handleTestDelayPush(conf.id)} disabled={testingDelayPush[conf.id]} style={{ background: '#7c3aed', color: '#fff', border: 'none', height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{testingDelayPush[conf.id] ? '...' : 'Test Delay'}</button></div>}</>
            ) : null)}
            {servers.filter(s => s.protocol === 'tspcb' || s.protocol === 'both').length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px', border: '1.5px dashed #e2e8f0', borderRadius: '10px' }}>No SPCB server configured. <button onClick={() => addServer('tspcb')} style={{ background: 'none', border: 'none', color: '#0f766e', fontWeight: '700', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Add SPCB Server</button></div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button onClick={() => addServer('tspcb')} style={{ background: 'transparent', border: '1.5px solid #0f766e', borderRadius: '8px', color: '#0f766e', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus /> Add SPCB Server</button>
          </div>
          {renderMappingTable(s => s.protocol === 'tspcb' || s.protocol === 'both')}
        </div>

        {/* ─── 2. CPCB TXT File Generation ─── */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          {sectionHeader(2, 'CPCB TXT File Generation', 'Annexure-I format CSV/TXT file with 15-min averaged data', '#ca8a04', () => handleSave('cpcb'))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {servers.map((conf, idx) => (conf.protocol === 'cpcb' || conf.protocol === 'both') ? renderServerCard(conf, idx, 'cpcb',
              <><div style={{ flex: '1 1 300px' }}><label style={s()}>Output File Path</label><input type="text" name="cpcb_file_path" value={conf.cpcb_file_path || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="C:\Data\readings.txt" style={ipt} /></div></>,
              <><label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: '600', color: '#475569' }}><Toggle checked={!!conf.is_active} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_active', type: 'checkbox', checked: !conf.is_active } })} />{conf.is_active ? 'Enabled' : 'Disabled'}</label>{conf.id && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="date" value={historicalDates[conf.id] || new Date().toISOString().split('T')[0]} max={new Date().toISOString().split('T')[0]} onChange={e => setHistoricalDates(prev => ({ ...prev, [conf.id]: e.target.value }))} style={{ ...ipt, padding: '4px 8px', height: '30px', fontSize: '12px', width: '120px' }} /><button onClick={() => handleGenerateHistorical(conf.id, conf.name)} disabled={generatingHistorical[conf.id]} style={{ background: '#ca8a04', color: '#fff', border: 'none', height: '30px', padding: '0 12px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{generatingHistorical[conf.id] ? '...' : 'Makeup'}</button></div>}</>
            ) : null)}
            {servers.filter(s => s.protocol === 'cpcb' || s.protocol === 'both').length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px', border: '1.5px dashed #e2e8f0', borderRadius: '10px' }}>No CPCB server configured. <button onClick={() => addServer('cpcb')} style={{ background: 'none', border: 'none', color: '#ca8a04', fontWeight: '700', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Add CPCB Server</button></div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button onClick={() => addServer('cpcb')} style={{ background: 'transparent', border: '1.5px solid #ca8a04', borderRadius: '8px', color: '#ca8a04', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus /> Add CPCB Server</button>
          </div>
          {renderMappingTable(s => s.protocol === 'cpcb' || s.protocol === 'both')}
        </div>

        {/* ─── 3. Central Sync (rajapi.com) ─── */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          {sectionHeader(3, 'Central Sync (rajapi.com)', 'Default telemetry posting to rajapi.com central server — every 60 seconds', '#7c3aed')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px', background: rajapiStatus === 'active' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${rajapiStatus === 'active' ? '#bbf7d0' : '#fecaca'}` }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: rajapiStatus === 'active' ? '#22c55e' : '#ef4444' }} />
              <span style={{ fontSize: '13px', fontWeight: '700', color: rajapiStatus === 'active' ? '#166534' : '#991b1b' }}>
                {rajapiStatus === 'active' ? 'Licensed & Connected' : rajapiStatus === 'inactive' ? 'Not Configured' : 'Checking...'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={s()}>API URL</label>
                <input type="text" value={rajapiUrl} onChange={e => setRajapiUrl(e.target.value)} placeholder="https://rajapi.com/api/v1/sync/" style={ipt} />
              </div>
              <div>
                <label style={s()}>API Key</label>
                <input type="password" value={rajapiKey} onChange={e => setRajapiKey(e.target.value)} placeholder="Enter API key" style={ipt} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleRajapiVerify} disabled={rajapiSaving} style={{
                background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px',
                fontSize: '13px', fontWeight: '700', cursor: 'pointer', opacity: rajapiSaving ? 0.7 : 1,
              }}>{rajapiSaving ? 'Verifying...' : 'Verify & Save'}</button>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.6, padding: '10px 14px', background: '#f8fafc', borderRadius: '8px' }}>
              All live telemetry data is pushed to rajapi.com every 60 seconds in TGPCB JSON format. The API key is encrypted and stored locally.
            </div>
          </div>
        </div>

        {/* ─── 4. LED Board (LAN) ─── */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          {sectionHeader(4, 'LED Board (LAN)', 'Generates JSON endpoint for networked LED display cards — polled via GET', '#ea580c', () => handleSave('led'))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {servers.map((conf, idx) => conf.protocol === 'led' ? renderServerCard(conf, idx, 'led',
              <><div style={{ flex: '0 1 120px' }}><label style={s()}>Channel ID</label><input type="number" name="led_channel_id" value={conf.led_channel_id || ''} onChange={e => handleServerFieldChange(idx, { target: { name: 'led_channel_id', value: e.target.value ? parseInt(e.target.value) : null, type: 'text' } })} placeholder="7003" style={ipt} /></div><div style={{ flex: '1 1 160px' }}><label style={s()}>Station Name</label><input type="text" name="led_station_name" value={conf.led_station_name || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="e.g. AAQMS" style={ipt} /></div></>,
              <><label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: '600', color: '#475569' }}><Toggle checked={!!conf.is_active} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_active', type: 'checkbox', checked: !conf.is_active } })} />{conf.is_active ? 'Enabled' : 'Disabled'}</label></>
            ) : null)}
            {servers.filter(s => s.protocol === 'led').length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px', border: '1.5px dashed #e2e8f0', borderRadius: '10px' }}>No LED board configured. <button onClick={() => addServer('led')} style={{ background: 'none', border: 'none', color: '#ea580c', fontWeight: '700', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Add LED Board</button></div>
            )}

          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button onClick={() => addServer('led')} style={{ background: 'transparent', border: '1.5px solid #ea580c', borderRadius: '8px', color: '#ea580c', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus /> Add LED Board</button>
          </div>
          {renderMappingTable(s => s.protocol === 'led')}
        </div>

      </div>

      {/* ─── Test Response Modal ─── */}
      {testResultModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(6px)' }}>
          <div style={{ width: '100%', maxWidth: '600px', background: '#fff', borderRadius: '14px', display: 'flex', flexDirection: 'column', maxHeight: '80vh', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: testResultModal.success ? '#f0fdf4' : '#fef2f2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '800', color: testResultModal.success ? '#166534' : '#991b1b' }}>{testResultModal.success ? 'Success' : 'Failed'}</span>
                {testResultModal.title && <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>{testResultModal.title}</span>}
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '99px', background: testResultModal.success ? '#dcfce7' : '#fee2e2', color: testResultModal.success ? '#15803d' : '#b91c1c' }}>HTTP {testResultModal.status}</span>
              </div>
              <button onClick={() => setTestResultModal(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', fontSize: '18px' }}>&times;</button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, background: '#f8fafc' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Response</div>
              <pre style={{ margin: 0, padding: '14px', background: '#1e293b', color: '#e2e8f0', borderRadius: '8px', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'Consolas, monospace' }}>{testResultModal.response || '<Empty>'}</pre>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', background: '#fff' }}>
              <button onClick={() => setTestResultModal(null)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
