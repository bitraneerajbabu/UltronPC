import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { T, BTN, INP, GLASS_CARD } from '../theme';

const s = () => ({ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' });
const ipt = { width: '100%', background: '#fff', border: '1px solid #e2e8f0', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#0f172a', outline: 'none', fontFamily: T.fontMono, transition: 'border-color 0.15s', boxSizing: 'border-box' as const };

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <div onClick={onChange} style={{ position: 'relative', width: 34, height: 18, cursor: 'pointer', flexShrink: 0 }}>
    <div style={{ position: 'absolute', inset: 0, borderRadius: 99, background: checked ? '#0f766e' : '#cbd5e1', transition: 'background 0.2s' }} />
    <div style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', pointerEvents: 'none' }} />
  </div>
);
const Plus = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const Trash = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>;

const CPCB_PARAMS = [
  'CO', 'SO2', 'NO', 'NO2', 'NOx', 'Ozone', 'PM10', 'PM2.5', 'Temp',
  'WS', 'WD', 'AT', 'RH', 'BP', 'SR', 'RF', 'VWS',
  'Benzene', 'Toluene', 'Xylene', 'Eth-Benzene', 'MP-Xylene',
  'CH4', 'NH3', 'HCHO', 'Hg',
];

const formatError = (detail: any, fallback: string) => {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(d => `${d.loc ? `[${d.loc.join('.')}] ` : ''}${d.msg || JSON.stringify(d)}`).join('; ');
  return detail.message || JSON.stringify(detail);
};

export const ServerManagementScreen = () => {
  const { API_BASE, showToast, authFetch, parameters, stations, currentUser } = useContext(AppContext);

  const [servers, setServers] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [editedMappings, setEditedMappings] = useState<any>({});
  const [pushLoading, setPushLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lanIp, setLanIp] = useState('127.0.0.1');
  const _tempCounter = React.useRef(0);

  const [testingPush, setTestingPush] = useState<any>({});
  const [testingDelayPush, setTestingDelayPush] = useState<any>({});
  const [testResultModal, setTestResultModal] = useState<any>(null);
  const [pendingCounts, setPendingCounts] = useState<any>({});
  const [historicalDates, setHistoricalDates] = useState<any>({});
  const [generatingHistorical, setGeneratingHistorical] = useState<any>({});

  const [rajapiUrl, setRajapiUrl] = useState('');
  const [rajapiKey, setRajapiKey] = useState('');
  const [rajapiAmcKey, setRajapiAmcKey] = useState('');
  const [rajapiStatus, setRajapiStatus] = useState<any>(null);
  const [rajapiSaving, setRajapiSaving] = useState(false);

  useEffect(() => { loadPushData(); }, []);

  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const res = await authFetch(`${API_BASE}/server-config/pending-counts`);
        if (res.ok) setPendingCounts(await res.json());
      } catch {}
    }, 15000);
    return () => clearInterval(iv);
  }, []);

  const loadPushData = async () => {
    setPushLoading(true);
    try {
      const [srvRes, mapRes, netRes] = await Promise.all([
        authFetch(`${API_BASE}/server-config/`),
        authFetch(`${API_BASE}/server-config/mappings`),
        authFetch(`${API_BASE}/settings/network-info`),
      ]);
      const serversData = await srvRes.json();
      setServers(serversData);
      if (netRes.ok) {
        const netData = await netRes.json();
        setLanIp(netData.lan_ip || '127.0.0.1');
      }
      if (mapRes.ok) {
        const mapData = await mapRes.json();
        setMappings(mapData);
        const edited: any = {};
        serversData.forEach((srv: any) => {
          mapData.forEach((p: any) => {
            const serverMapping = p.server_mappings?.find((sm: any) => sm.server_id === srv.id);
            if (serverMapping) {
              if (!edited[p.parameter_id]) edited[p.parameter_id] = {};
              edited[p.parameter_id][srv.id] = { ...serverMapping };
            }
          });
        });
        setEditedMappings(edited);
      }
    } catch (e: any) { showToast(`Failed to load server data: ${e.message}`, 'error'); }
    finally { setPushLoading(false); }
  };

  const handleServerFieldChange = (index: number, e: any) => {
    const { name, type, checked, value } = e.target;
    setServers((prev: any) => { const u = [...prev]; u[index] = { ...u[index], [name]: type === 'checkbox' ? checked : value }; return u; });
  };

  const addServer = (protocol: string) => {
    const base: any = { _tempId: ++_tempCounter.current, name: '', protocol, is_active: true };
    if (protocol === 'tspcb') setServers((prev: any) => [...prev, { ...base, live_url: '', delay_url: '' }]);
    else if (protocol === 'cpcb') setServers((prev: any) => [...prev, { ...base, cpcb_file_path: '' }]);
    else setServers((prev: any) => [...prev, { ...base }]);
  };

  const removeServer = async (index: number, id: number) => {
    if (id) {
      if (!confirm('Delete this server permanently?')) return;
      try { await authFetch(`${API_BASE}/server-config/${id}`, { method: 'DELETE' }); showToast('Deleted.', 'success'); } catch { showToast('Delete failed.', 'error'); return; }
    }
    setServers((prev: any) => prev.filter((_: any, i: number) => i !== index));
  };

  const handleSave = async (section?: string) => {
    setSaving(true);
    try {
      let filter: ((s: any) => boolean) | null = null;
      let label = '';
      if (section === 'spcb') { filter = (s: any) => s.protocol === 'tspcb' || s.protocol === 'both'; label = 'SPCB'; }
      else if (section === 'cpcb') { filter = (s: any) => s.protocol === 'cpcb' || s.protocol === 'both'; label = 'CPCB'; }
      else if (section === 'led') { filter = (s: any) => s.protocol === 'led'; label = 'LED'; }
      const targetServers = filter ? servers.filter(filter) : servers;
      if (targetServers.length === 0) { showToast('No servers to save.', 'warn'); setSaving(false); return; }
      const savedServers: any[] = [];
      const tempIdToRealId: any = {};
      for (const conf of targetServers) {
        if (!conf.name?.trim()) { showToast(`${label}: Server name required.`, 'warn'); setSaving(false); return; }
        const payload: any = { name: conf.name, protocol: conf.protocol, is_active: conf.is_active ?? true };
        if (conf.live_url !== undefined) payload.live_url = conf.live_url;
        if (conf.delay_url !== undefined) payload.delay_url = conf.delay_url;
        if (conf.cpcb_file_path !== undefined) payload.cpcb_file_path = conf.cpcb_file_path;
        const url = conf.id ? `${API_BASE}/server-config/${conf.id}` : `${API_BASE}/server-config/`;
        const method = conf.id ? 'PATCH' : 'POST';
        const res = await authFetch(url, { method, body: JSON.stringify(payload) });
        if (!res.ok) { showToast(`${label}: Save failed — ${formatError(await res.json().catch(() => null), res.statusText)}`, 'error'); setSaving(false); return; }
        const savedSrv = await res.json();
        savedServers.push(savedSrv);
        if (!conf.id) tempIdToRealId[conf._tempId] = savedSrv.id;
      }
      savedServers.forEach((srv: any) => {
        const originalServer = targetServers.find((s: any) => s.id === srv.id || (s._tempId && tempIdToRealId[s._tempId] === srv.id));
        const tempKey = originalServer?._tempId;
        const mapped = editedMappings[tempKey] || editedMappings[String(tempKey)] || {};
        if (Object.keys(mapped).length) {
          if (!editedMappings[srv.id]) editedMappings[srv.id] = {};
          Object.assign(editedMappings[srv.id], mapped);
          delete editedMappings[tempKey];
        }
      });
      const payload = Object.entries(editedMappings).flatMap(([srvId, params]: [string, any]) =>
        Object.entries(params).length ? [{ server_id: parseInt(srvId), mappings: Object.entries(params).map(([pid, data]: [string, any]) => ({ parameter_id: parseInt(pid), ...data })) }] : []
      );
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 25000);
      const res = await authFetch(`${API_BASE}/server-config/mappings`, { method: 'PUT', body: JSON.stringify(payload), signal: controller.signal });
      if (!res.ok) { showToast('Mappings save failed.', 'error'); }
      showToast(`${label}: Servers saved successfully.`); await loadPushData();
    } catch (e: any) {
      if (e.name === 'AbortError') { showToast('Save timed out. Check connection.', 'error'); return; }
      showToast(`Save failed: ${e.message}`, 'error');
      try { localStorage.setItem('cached_api_servers', JSON.stringify(servers)); showToast('Saved offline. Will sync when online.', 'warn'); } catch {}
    }
    finally { setSaving(false); }
  };

  const handleTestPush = async (serverId: number) => {
    setTestingPush((prev: any) => ({ ...prev, [serverId]: true }));
    try {
      const res = await authFetch(`${API_BASE}/server-config/${serverId}/test-push`, { method: 'POST' });
      const data = await res.json();
      setTestResultModal({ success: res.ok, title: 'Live Push Test', status: res.status, response: JSON.stringify(data, null, 2) });
    } catch (e: any) { setTestResultModal({ success: false, title: 'Live Push Test', status: 0, response: e.message }); }
    finally { setTestingPush((prev: any) => ({ ...prev, [serverId]: false })); }
  };

  const handleTestDelayPush = async (serverId: number) => {
    setTestingDelayPush((prev: any) => ({ ...prev, [serverId]: true }));
    try {
      const res = await authFetch(`${API_BASE}/server-config/${serverId}/test-delay-push`, { method: 'POST' });
      const data = await res.json();
      setTestResultModal({ success: res.ok, title: 'Delay Push Test', status: res.status, response: JSON.stringify(data, null, 2) });
    } catch (e: any) { setTestResultModal({ success: false, title: 'Delay Push Test', status: 0, response: e.message }); }
    finally { setTestingDelayPush((prev: any) => ({ ...prev, [serverId]: false })); }
  };

  const handleClearPending = async (serverId: number) => {
    if (!confirm('Delete all pending upload records for this server?')) return;
    try {
      await authFetch(`${API_BASE}/server-config/${serverId}/pending-records`, { method: 'DELETE' });
      setPendingCounts((prev: any) => ({ ...prev, [serverId]: 0 })); showToast('Pending records cleared.', 'success');
    } catch { showToast('Clear failed.', 'error'); }
  };

  const handleRajapiVerify = async () => {
    if (!rajapiUrl.trim() || !rajapiKey.trim()) { showToast('API URL and Token required.', 'error'); return; }
    setRajapiSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/server-config/rajapi/verify`, {
        method: 'POST', body: JSON.stringify({ url: rajapiUrl, api_key: rajapiKey, amc_key: rajapiAmcKey }),
      });
      if (res.ok) { showToast('Central sync configured successfully.', 'success'); setRajapiStatus('active'); }
      else { const d = await res.json().catch(() => null); showToast(`Verification failed: ${formatError(d, res.statusText)}`, 'error'); }
    } catch (e: any) { showToast(`Error: ${e.message}`, 'error'); }
    finally { setRajapiSaving(false); }
  };

  const handleGenerateHistorical = async (serverId: number, serverName: string) => {
    const date = historicalDates[serverId] || new Date().toISOString().split('T')[0];
    setGeneratingHistorical((prev: any) => ({ ...prev, [serverId]: true }));
    try {
      const res = await authFetch(`${API_BASE}/server-config/${serverId}/generate-historical?date=${date}`, { method: 'POST' });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${serverName.replace(/\s+/g, '_')}_makeup_${date}.txt`; a.click(); a.remove(); window.URL.revokeObjectURL(url);
      showToast('Historical data downloaded.', 'success');
    } catch { showToast('Generation failed.', 'error'); }
    finally { setGeneratingHistorical((prev: any) => ({ ...prev, [serverId]: false })); }
  };

  const handleMappingChange = (paramId: number, serverId: number | string, field: string, value: any) => {
    setEditedMappings((prev: any) => ({ ...prev, [paramId]: { ...prev[paramId], [serverId]: { ...(prev[paramId]?.[serverId] || {}), [field]: value } } }));
  };

  const sectionHeader = (num: number, title: string, desc: string, color: string, onSave?: any) => (
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

  const renderServerCard = (conf: any, idx: number, protocolType: string, extraFields: any, subRow: any) => {
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

  const renderMappingTable = (serverFilter: (s: any) => boolean) => {
    const filteredServers = servers.filter((s: any) => (s.id || s._tempId) && s.is_active && serverFilter(s));
    if (filteredServers.length === 0) return null;

    return (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginTop: '10px' }}>
        {filteredServers.map((srv: any) => {
          const isCpcb = srv.protocol === 'cpcb';
          const isBoth = srv.protocol === 'both';
          const isLed = srv.protocol === 'led';
          const showCpcbCols = isCpcb || isBoth;
          const showTgpcbCols = srv.protocol === 'tspcb' || isBoth;
          return (
            <div key={srv.id ?? srv._tempId}>
              <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '12px', fontWeight: '700', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {srv.name || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Unsaved Server</span>}
                <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '99px', background: isLed ? '#fff7ed' : isCpcb ? '#fef3c7' : '#f0fdfa', color: isLed ? '#ea580c' : isCpcb ? '#ca8a04' : '#0f766e' }}>{isLed ? 'LED' : isCpcb ? 'CPCB' : isBoth ? 'Both' : 'TGPCB'}</span>
                {!srv.id && <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '99px', background: '#fef3c7', color: '#92400e' }}>⚠ Save server first to enable Test Push</span>}
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
                      mappings.map((param: any) => {
                        const srvKey = srv.id ?? srv._tempId;
                        const state = editedMappings[param.parameter_id]?.[srvKey] || editedMappings[param.parameter_id]?.[String(srvKey)] || { is_active: false, api_id: '', api_name: '', api_password: '', api_vname: '', api_unit: '', cpcb_station_name: '', cpcb_parameter: '', led_channel_name: '', led_unit: '' };
                        const cellChg = (f: string, v: any) => handleMappingChange(param.parameter_id, srvKey, f, v);
                        const inpS: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '5px 6px', border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', borderRadius: '4px', background: 'transparent', fontSize: '12px', color: '#334155', outline: 'none', fontFamily: T.fontMono };
                        return (
                          <tr key={param.parameter_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 10px', fontWeight: '700', color: '#0f172a', fontSize: '12px' }}>{param.channel_no}</td>
                            <td style={{ padding: '6px 10px', color: '#475569', fontSize: '12px' }}>{param.station_name}</td>
                            <td style={{ padding: '6px 10px', fontWeight: '700', color: '#0f766e', fontSize: '12px' }}>{param.parameter_name}</td>
                            <td style={{ padding: '6px 10px' }}><Toggle checked={!!state.is_active} onChange={() => cellChg('is_active', !state.is_active)} /></td>
                            {isLed ? (
                              <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="LED Name" value={state.led_channel_name || ''} onChange={e => cellChg('led_channel_name', e.target.value)} /></td>
                            ) : (
                              <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="vname" value={state.api_vname || ''} onChange={e => cellChg('api_vname', e.target.value)} /></td>
                            )}
                            {isLed ? (
                              <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="Unit" value={state.led_unit || ''} onChange={e => cellChg('led_unit', e.target.value)} /></td>
                            ) : (
                              <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="unit" value={state.api_unit || ''} onChange={e => cellChg('api_unit', e.target.value)} /></td>
                            )}
                            {showCpcbCols && <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="St. Name" value={state.cpcb_station_name || ''} onChange={e => cellChg('cpcb_station_name', e.target.value)} /></td>}
                            {showCpcbCols && (
                              <td style={{ padding: '4px 6px' }}>
                                <select style={{ ...inpS, cursor: 'pointer' }} value={state.cpcb_parameter || ''} onChange={e => cellChg('cpcb_parameter', e.target.value)}>
                                  <option value="">--</option>
                                  {CPCB_PARAMS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                              </td>
                            )}
                            {showTgpcbCols && <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="ID" value={state.api_id || ''} onChange={e => cellChg('api_id', e.target.value)} /></td>}
                            {showTgpcbCols && <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="Username" value={state.api_name || ''} onChange={e => cellChg('api_name', e.target.value)} /></td>}
                            {showTgpcbCols && <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="Password" value={state.api_password || ''} onChange={e => cellChg('api_password', e.target.value)} /></td>}
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

  if (pushLoading) return <p style={{ color: T.textFaint, padding: '24px' }}>Loading server configuration...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc', fontFamily: T.fontBase, overflow: 'hidden' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 28px', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em' }}>Server Management</h1>
        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8', fontWeight: '600' }}>SPCB push, CPCB export, LED boards & Central Sync</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* 1. SPCB (TGPCB) Push */}
          <div className="card" style={{ padding: '20px' }}>
            {sectionHeader(1, 'SPCB (TGPCB) Push', 'JSON HTTP push to State Pollution Control Board — live (1 min) and delay (15 min) URLs', '#0f766e', () => handleSave('spcb'))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {servers.map((conf: any, idx: number) => (conf.protocol === 'tspcb' || conf.protocol === 'both') ? renderServerCard(conf, idx, 'tspcb',
                <><div style={{ flex: '1 1 200px' }}><label style={s()}>Live URL</label><input type="text" name="live_url" value={conf.live_url || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="https://.../live" style={ipt} /></div><div style={{ flex: '1 1 200px' }}><label style={s()}>Delay URL</label><input type="text" name="delay_url" value={conf.delay_url || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="https://.../delay" style={ipt} /></div></>,
                <><label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: '600', color: '#475569' }}><Toggle checked={!!conf.is_active} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_active', type: 'checkbox', checked: !conf.is_active } })} />{conf.is_active ? 'Enabled' : 'Disabled'}</label>{conf.protocol === 'both' && <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: '600', color: '#475569' }}><Toggle checked={conf.is_cpcb_active ?? true} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_cpcb_active', type: 'checkbox', checked: !(conf.is_cpcb_active ?? true) } })} />CPCB Push</label>}{conf.id && <div style={{ display: 'flex', gap: '6px' }}><button onClick={() => handleTestPush(conf.id)} disabled={testingPush[conf.id]} style={{ background: '#0f766e', color: '#fff', border: 'none', height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{testingPush[conf.id] ? '...' : 'Test Live'}</button><button onClick={() => handleTestDelayPush(conf.id)} disabled={testingDelayPush[conf.id]} style={{ background: '#7c3aed', color: '#fff', border: 'none', height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{testingDelayPush[conf.id] ? '...' : 'Test Delay'}</button></div>}</>
              ) : null)}
              {servers.filter((s: any) => s.protocol === 'tspcb' || s.protocol === 'both').length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px', border: '1.5px dashed #e2e8f0', borderRadius: '10px' }}>No SPCB server configured. <button onClick={() => addServer('tspcb')} style={{ background: 'none', border: 'none', color: '#0f766e', fontWeight: '700', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Add SPCB Server</button></div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button onClick={() => addServer('tspcb')} style={{ background: 'transparent', border: '1.5px solid #0f766e', borderRadius: '8px', color: '#0f766e', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus /> Add SPCB Server</button>
            </div>
            {renderMappingTable((s: any) => s.protocol === 'tspcb' || s.protocol === 'both')}
          </div>

          {/* 2. CPCB TXT File Generation */}
          <div className="card" style={{ padding: '20px' }}>
            {sectionHeader(2, 'CPCB TXT File Generation', 'Annexure-I format CSV/TXT file with 15-min averaged data', '#ca8a04', () => handleSave('cpcb'))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {servers.map((conf: any, idx: number) => (conf.protocol === 'cpcb' || conf.protocol === 'both') ? renderServerCard(conf, idx, 'cpcb',
                <><div style={{ flex: '1 1 300px' }}><label style={s()}>Output File Path</label><input type="text" name="cpcb_file_path" value={conf.cpcb_file_path || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="C:\Data\readings.txt" style={ipt} /></div></>,
                <><label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: '600', color: '#475569' }}><Toggle checked={!!conf.is_active} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_active', type: 'checkbox', checked: !conf.is_active } })} />{conf.is_active ? 'Enabled' : 'Disabled'}</label>{conf.id && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="date" value={historicalDates[conf.id] || new Date().toISOString().split('T')[0]} max={new Date().toISOString().split('T')[0]} onChange={e => setHistoricalDates((prev: any) => ({ ...prev, [conf.id]: e.target.value }))} style={{ ...ipt, padding: '4px 8px', height: '30px', fontSize: '12px', width: '130px' }} /><button onClick={() => handleGenerateHistorical(conf.id, conf.name)} disabled={generatingHistorical[conf.id]} style={{ background: '#ca8a04', color: '#fff', border: 'none', height: '30px', padding: '0 12px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{generatingHistorical[conf.id] ? '...' : 'Makeup'}</button></div>}</>
              ) : null)}
              {servers.filter((s: any) => s.protocol === 'cpcb' || s.protocol === 'both').length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px', border: '1.5px dashed #e2e8f0', borderRadius: '10px' }}>No CPCB server configured. <button onClick={() => addServer('cpcb')} style={{ background: 'none', border: 'none', color: '#ca8a04', fontWeight: '700', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Add CPCB Server</button></div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button onClick={() => addServer('cpcb')} style={{ background: 'transparent', border: '1.5px solid #ca8a04', borderRadius: '8px', color: '#ca8a04', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus /> Add CPCB Server</button>
            </div>
            {renderMappingTable((s: any) => s.protocol === 'cpcb' || s.protocol === 'both')}
          </div>

          {/* 3. Central Sync (rajapi.com) */}
          <div className="card" style={{ padding: '20px' }}>
            {sectionHeader(3, 'Central Sync (rajapi.com)', 'Default telemetry posting to rajapi.com central server — every 60 seconds', '#7c3aed', null)}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px', background: rajapiStatus === 'active' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${rajapiStatus === 'active' ? '#bbf7d0' : '#fecaca'}` }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: rajapiStatus === 'active' ? '#22c55e' : '#ef4444' }} />
                <span style={{ fontSize: '13px', fontWeight: '700', color: rajapiStatus === 'active' ? '#166534' : '#991b1b' }}>
                  {rajapiStatus === 'active' ? 'Licensed & Connected' : rajapiStatus === 'inactive' ? 'Not Configured' : 'Checking...'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={s()}>API URL</label>
                  <input type="text" value={rajapiUrl} onChange={e => setRajapiUrl(e.target.value)} placeholder="https://rajapi.com/api/v1/sync/" style={ipt} />
                </div>
                <div>
                  <label style={s()}>AMC Token (Site Key)</label>
                  <input type="password" value={rajapiKey} onChange={e => setRajapiKey(e.target.value)} placeholder="Enter site API key" style={ipt} />
                </div>
                <div>
                  <label style={s()}>AMC Key (Device Key)</label>
                  <input type="password" value={rajapiAmcKey} onChange={e => setRajapiAmcKey(e.target.value)} placeholder="Enter device API key" style={ipt} />
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

          {/* 4. LED Board (LAN) */}
          <div className="card" style={{ padding: '20px' }}>
            {sectionHeader(4, 'LED Board (LAN)', 'Generates JSON endpoint for networked LED display cards — polled via GET', '#ea580c', () => handleSave('led'))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {servers.map((conf: any, idx: number) => conf.protocol === 'led' ? renderServerCard(conf, idx, 'led',
                null,
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: '600', color: '#475569' }}>
                      <Toggle checked={!!conf.is_active} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_active', type: 'checkbox', checked: !conf.is_active } })} />
                      {conf.is_active ? 'Enabled' : 'Disabled'}
                    </label>
                  </div>
                  {conf.id && (() => {
                    const srvId = conf.id;
                    const activeParamIds = mappings
                      .filter((p: any) => {
                        const state = editedMappings[p.parameter_id]?.[srvId];
                        return state && state.is_active;
                      })
                      .map((p: any) => p.parameter_id);
                    const pcbList = activeParamIds.join(',');
                    const ledUrl = `http://${lanIp}/api/v1/led/?auth=${currentUser || 'admin'}&PCB=${pcbList || '1,2'}`;
                    const fallbackUrl = `http://${lanIp}:8765/api/v1/led/?auth=${currentUser || 'admin'}&PCB=${pcbList || '1,2'}`;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '8px', marginTop: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: '700', color: '#c2410c' }}>Dynamic LED Board LAN URL</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(ledUrl);
                              showToast('LED URL copied to clipboard!');
                            }}
                            style={{ background: '#ea580c', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}
                          >Copy URL</button>
                        </div>
                        <div style={{ fontSize: '11px', color: '#475569', wordBreak: 'break-all', fontFamily: 'monospace', background: '#fff', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>{ledUrl}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>If port 80 is blocked, try: <strong>{fallbackUrl}</strong></div>
                      </div>
                    );
                  })()}
                </div>
              ) : null)}
              {servers.filter((s: any) => s.protocol === 'led').length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px', border: '1.5px dashed #e2e8f0', borderRadius: '10px' }}>No LED board configured. <button onClick={() => addServer('led')} style={{ background: 'none', border: 'none', color: '#ea580c', fontWeight: '700', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Add LED Board</button></div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button onClick={() => addServer('led')} style={{ background: 'transparent', border: '1.5px solid #ea580c', borderRadius: '8px', color: '#ea580c', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus /> Add LED Board</button>
            </div>
            {renderMappingTable((s: any) => s.protocol === 'led')}
          </div>

        </div>
      </div>

      {/* Test Response Modal */}
      {testResultModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,79,73,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(6px)' }}>
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
              <pre style={{ margin: 0, padding: '14px', background: '#0d4f49', color: '#ccfbf1', borderRadius: '8px', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'Consolas, monospace' }}>{testResultModal.response || '<Empty>'}</pre>
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