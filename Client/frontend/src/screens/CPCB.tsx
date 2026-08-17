import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { T } from '../theme';
import { Modal } from '../components/Modal';

interface PushServer {
  _tempId?: string;
  id?: number;
  name: string;
  protocol: string;
  is_active: boolean;
  is_cpcb_active?: boolean;
  led_station_name?: string;
  live_url?: string;
  delay_url?: string;
  cpcb_file_path?: string;
  appcb_site_id?: string;
  appcb_site_uid?: string;
  appcb_encryption_key?: string;
}
interface MappingEdit {
  is_active: boolean;
  api_id: string;
  api_name: string;
  api_password: string;
  api_vname: string;
  api_unit: string;
  cpcb_station_name: string;
  cpcb_parameter: string;
  led_channel_name: string;
  led_unit: string;
  appcb_monitoring_unit_id: string;
  appcb_analyzer_id: string;
  appcb_parameter_id: string;
  appcb_parameter_name: string;
  appcb_unit_id: string;
}
interface TestResult { title: string; status: number; response: string; success: boolean; }

const s = () => ({ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' });
const ipt = { width: '100%', background: '#fff', border: '1px solid var(--border)', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', outline: 'none', fontFamily: T.fontMono, transition: 'border-color 0.15s', boxSizing: 'border-box' as const };

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <div onClick={onChange} style={{ position: 'relative', width: 34, height: 18, cursor: 'pointer', flexShrink: 0 }}>
    <div style={{ position: 'absolute', inset: 0, borderRadius: 99, background: checked ? 'var(--primary-600)' : 'var(--border)', transition: 'background 0.2s' }} />
    <div style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', pointerEvents: 'none' }} />
  </div>
);

const Plus = () => <IconPlus size={14} stroke={2.5} />;
const Trash = () => <IconTrash size={13} stroke={2.5} />;

const CPCB_PARAMS = [
  'CO', 'SO2', 'NO', 'NO2', 'NOx', 'Ozone', 'PM10', 'PM2.5', 'Temp',
  'WS', 'WD', 'AT', 'RH', 'BP', 'SR', 'RF', 'VWS',
  'Benzene', 'Toluene', 'Xylene', 'Eth-Benzene', 'MP-Xylene',
  'CH4', 'NH3', 'HCHO', 'Hg',
];

const formatError = (detail: unknown, fallback: string): string => {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return (detail as any[]).map(d => `${d.loc ? `[${d.loc.join('.')}] ` : ''}${d.msg || JSON.stringify(d)}`).join('; ');
  return (detail as Record<string, string>).message || JSON.stringify(detail);
};

const SUB_TABS = [
  { key: 'spcb', label: 'SPCB server', icon: 'var(--primary-600)' },
  { key: 'tnpcb', label: 'TNPCB Server', icon: 'var(--info)' },
  { key: 'appcb', label: 'APPCB Server', icon: 'var(--success)' },
  { key: 'cpcb', label: 'CPCB TXT File Generation', icon: 'var(--warning)' },
  { key: 'led', label: 'LED Board (LAN)', icon: 'var(--warning)' },
];

export const CPCB = React.memo(() => {
  const { API_BASE, showToast, authFetch, currentUser } = useContext(AppContext);
  const [subTab, setSubTab] = useState('spcb');

  // ─── Push Servers (SPCB / CPCB / Central Sync / LED) ───
  const [servers, setServers] = useState<PushServer[]>([]);
  const [mappings, setMappings] = useState<Record<string, any>[]>([]);
  const [editedMappings, setEditedMappings] = useState<Record<number, Record<string, MappingEdit>>>({});
  const [pushLoading, setPushLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lanIp, setLanIp] = useState('127.0.0.1');
  const _tempCounter = React.useRef(0);

  const [testingPush, setTestingPush] = useState<Record<number, boolean>>({});
  const [testingDelayPush, setTestingDelayPush] = useState<Record<number, boolean>>({});
  const [testingUrlCheck, setTestingUrlCheck] = useState<Record<number, boolean>>({});
  const [testResultModal, setTestResultModal] = useState<TestResult | null>(null);
  const [pendingCounts, setPendingCounts] = useState<Record<number, number>>({});
  const [historicalDates, setHistoricalDates] = useState<Record<number, string>>({});
  const [generatingHistorical, setGeneratingHistorical] = useState<Record<number, boolean>>({});

  useEffect(() => { loadPushData(); }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await authFetch(`${API_BASE}/server-config/pending-counts`);
        if (res.ok) setPendingCounts(await res.json());
      } catch (_) {}
    }, 30000);
    return () => clearInterval(id);
  }, []);

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

      const initialEdits: Record<number, Record<string, MappingEdit>> = {};
      mappingsData.forEach((param) => {
        initialEdits[param.parameter_id] = {};
        serversData.forEach((srv) => {
          const existing = param.mappings?.[srv.id] || param.mappings?.[String(srv.id)] || {};
          initialEdits[param.parameter_id][srv.id] = {
            is_active: existing.is_active ?? false, api_id: existing.api_id || '', api_name: existing.api_name || '',
            api_password: existing.api_password || '', api_vname: existing.api_vname || '', api_unit: existing.api_unit || '',
            cpcb_station_name: existing.cpcb_station_name || '', cpcb_parameter: existing.cpcb_parameter || '',
            led_channel_name: existing.led_channel_name || '', led_unit: existing.led_unit || '',
            appcb_monitoring_unit_id: existing.appcb_monitoring_unit_id || '', appcb_analyzer_id: existing.appcb_analyzer_id || '',
            appcb_parameter_id: existing.appcb_parameter_id || '', appcb_parameter_name: existing.appcb_parameter_name || '', appcb_unit_id: existing.appcb_unit_id || ''
          };
        });
      });
      setEditedMappings(initialEdits);
    } catch { } finally { setPushLoading(false); }
  };

  const handleServerFieldChange = (index: number, e: { target: { name: string; value?: string; type?: string; checked?: boolean } }) => {
    const { name, value, type, checked } = e.target;
    setServers((prev: PushServer[]) => { const u = [...prev]; u[index] = { ...u[index], [name]: type === 'checkbox' ? checked : value } as PushServer; return u; });
  };

  const addServer = (protocol: string) => {
    _tempCounter.current += 1;
    const _tempId = `_tmp_${_tempCounter.current}`;
    const base: PushServer = { _tempId, name: '', protocol, is_active: true, is_cpcb_active: true, led_station_name: '' };
    if (protocol === 'tspcb') setServers((prev: PushServer[]) => [...prev, { ...base, live_url: '', delay_url: '' }]);
    else if (protocol === 'cpcb') setServers((prev: PushServer[]) => [...prev, { ...base, cpcb_file_path: '' }]);
    else if (protocol === 'appcb') setServers((prev: PushServer[]) => [...prev, { ...base, live_url: '', appcb_site_id: '', appcb_site_uid: '', appcb_encryption_key: '' }]);
    else setServers((prev: PushServer[]) => [...prev, { ...base }]);
  };

  const removeServer = async (conf: PushServer, index: number) => {
    const id = conf.id;
    if (id) {
      try {
        const res = await authFetch(`${API_BASE}/server-config/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Delete failed (${res.status})`);
        showToast('Server deleted successfully.', 'success');
      } catch (e: unknown) {
        showToast(`Delete failed: ${(e as Error).message}`, 'error');
        return;
      }
    }
    setServers((prev: PushServer[]) => prev.filter((s) => s !== conf && (id ? s.id !== id : s._tempId !== conf._tempId)));
  };

  const SECTION_FILTERS: Record<string, (s: PushServer) => boolean> = {
    spcb: (s) => s.protocol === 'tspcb' || s.protocol === 'both',
    tnpcb: (s) => s.protocol === 'tnpcb',
    appcb: (s) => s.protocol === 'appcb',
    cpcb: (s) => s.protocol === 'cpcb' || s.protocol === 'both',
    led: (s) => s.protocol === 'led',
  };
  const SECTION_LABELS: Record<string, string> = { spcb: 'SPCB', tnpcb: 'TNPCB', appcb: 'APPCB', cpcb: 'CPCB', led: 'LED' };

  const handleSave = async (section?: string) => {
    setSaving(true);
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);
    const filter = section ? SECTION_FILTERS[section] : null;
    const label = section ? SECTION_LABELS[section] : 'All';
    try {
      const targetServers = filter ? servers.filter(filter) : servers;
      if (targetServers.length === 0) { showToast('No servers to save.', 'warn'); setSaving(false); clearTimeout(tid); return; }
      const savedServers: PushServer[] = [];
      const tempIdToRealId: Record<string, number> = {};
      for (const conf of targetServers) {
        if (!conf.name?.trim()) { showToast(`${label}: Server name required.`, 'warn'); setSaving(false); clearTimeout(tid); return; }
        const method = conf.id ? 'PUT' : 'POST';
        const url = conf.id ? `${API_BASE}/server-config/${conf.id}` : `${API_BASE}/server-config/`;
        const { _tempId, ...confForApi } = conf;
        const res = await authFetch(url, { method, body: JSON.stringify(confForApi), signal: controller.signal });
        if (!res.ok) throw new Error(formatError((await res.json().catch(() => ({}))).detail, `${label} save failed (${res.status})`));
        const savedSrv = await res.json();
        if (_tempId) tempIdToRealId[_tempId] = savedSrv.id;
        savedServers.push(savedSrv);
      }
      const payload = mappings.map((param) => {
        const paramUpdates: Record<number, any> = {};
        savedServers.forEach((srv) => {
          const originalServer = targetServers.find((s) => s.id === srv.id || (s._tempId && tempIdToRealId[s._tempId] === srv.id));
          const tempKey = originalServer?._tempId;
          const mapped =
            editedMappings[param.parameter_id]?.[srv.id] ||
            editedMappings[param.parameter_id]?.[String(srv.id)] ||
            (tempKey && editedMappings[param.parameter_id]?.[tempKey]) ||
            ({} as MappingEdit);
          paramUpdates[srv.id] = { server_id: srv.id, is_active: false, api_id: '', api_name: '', api_password: '', api_vname: '', api_unit: '', cpcb_station_name: '', cpcb_parameter: '', led_channel_name: '', led_unit: '', appcb_monitoring_unit_id: '', appcb_analyzer_id: '', appcb_parameter_id: '', appcb_parameter_name: '', appcb_unit_id: '', ...mapped };
        });
        return { parameter_id: param.parameter_id, mappings: paramUpdates };
      });
      const res = await authFetch(`${API_BASE}/server-config/mappings`, { method: 'PUT', body: JSON.stringify(payload), signal: controller.signal });
      if (!res.ok) throw new Error(formatError((await res.json().catch(() => ({}))).detail, 'Mapping save failed'));
      clearTimeout(tid);
      showToast(`${label} configurations saved.`, 'success');
      loadPushData();
    } catch (e: unknown) {
      clearTimeout(tid);
      const err = e as { name?: string; message?: string };
      if (err.name === 'AbortError' || !navigator.onLine) {
        localStorage.setItem('cached_api_mappings', JSON.stringify(editedMappings));
        localStorage.setItem('cached_api_servers', JSON.stringify(servers));
        showToast('Saved offline. Will sync when online.', 'warn');
      } else showToast(`Save failed: ${err.message}`, 'error');
    } finally { setSaving(false); }
  };

  interface TestTargetOptions {
    parameterId?: number;
    apiId?: string;
    deviceId?: number;
    stationName?: string;
  }

  const handleTestPush = async (serverId: number, opts?: TestTargetOptions | number) => {
    const options: TestTargetOptions = typeof opts === 'number' ? { parameterId: opts } : (opts || {});
    const { parameterId, apiId, deviceId, stationName } = options;
    const key = parameterId
      ? `${serverId}_p${parameterId}`
      : apiId
      ? `${serverId}_a${apiId}`
      : deviceId
      ? `${serverId}_d${deviceId}`
      : stationName
      ? `${serverId}_s${stationName}`
      : String(serverId);

    setTestingPush((prev) => ({ ...prev, [key]: true }));
    try {
      const params = new URLSearchParams();
      if (parameterId) params.append('parameter_id', String(parameterId));
      if (apiId) params.append('api_id', String(apiId));
      if (deviceId) params.append('device_id', String(deviceId));
      if (stationName) params.append('station_name', stationName);
      const q = params.toString() ? `?${params.toString()}` : '';

      const res = await authFetch(`${API_BASE}/server-config/${serverId}/test-push${q}`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Test failed (${res.status})`);
      const data: any = await res.json();
      if (data.results?.length > 0) {
        const allSuccess = data.results.every((r: any) => r.success);
        const firstStatus = data.results[0].status_code;
        const titleLabel = stationName ? `Live Push Test (${stationName})` : apiId ? `Live Push Test (Device ID: ${apiId})` : 'Live Push Test';
        const formattedResp = data.results.map((r: any) =>
          `[Device ID: ${r.device_id}]\nStatus: ${r.status_code === 0 ? 'HTTP 0 (Failed / Unreachable)' : `HTTP ${r.status_code}`}\nResponse:\n${r.response}`
        ).join('\n\n' + '='.repeat(50) + '\n\n');

        setTestResultModal({ title: titleLabel, status: firstStatus, response: formattedResp, success: allSuccess });
      } else showToast('No payloads sent.', 'warn');
    } catch (e: unknown) { showToast(`Failed: ${(e as Error).message}`, 'error'); }
    finally { setTestingPush((prev) => ({ ...prev, [key]: false })); }
  };

  const handleTestDelayPush = async (serverId: number, opts?: TestTargetOptions | number) => {
    const options: TestTargetOptions = typeof opts === 'number' ? { parameterId: opts } : (opts || {});
    const { parameterId, apiId, deviceId, stationName } = options;
    const key = parameterId
      ? `${serverId}_p${parameterId}`
      : apiId
      ? `${serverId}_a${apiId}`
      : deviceId
      ? `${serverId}_d${deviceId}`
      : stationName
      ? `${serverId}_s${stationName}`
      : String(serverId);

    setTestingDelayPush((prev) => ({ ...prev, [key]: true }));
    try {
      const params = new URLSearchParams();
      if (parameterId) params.append('parameter_id', String(parameterId));
      if (apiId) params.append('api_id', String(apiId));
      if (deviceId) params.append('device_id', String(deviceId));
      if (stationName) params.append('station_name', stationName);
      const q = params.toString() ? `?${params.toString()}` : '';

      const res = await authFetch(`${API_BASE}/server-config/${serverId}/test-delay-push${q}`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Test failed (${res.status})`);
      const data: any = await res.json();
      if (data.results?.length > 0) {
        const allSuccess = data.results.every((r: any) => r.success);
        const firstStatus = data.results[0].status_code;
        const titleLabel = stationName ? `Delay Push Test (${stationName})` : apiId ? `Delay Push Test (Device ID: ${apiId})` : 'Delay Push Test';
        const formattedResp = data.results.map((r: any) =>
          `[Device ID: ${r.device_id}]\nStatus: ${r.status_code === 0 ? 'HTTP 0 (Failed / Unreachable)' : `HTTP ${r.status_code}`}\nResponse:\n${r.response}`
        ).join('\n\n' + '='.repeat(50) + '\n\n');

        setTestResultModal({ title: titleLabel, status: firstStatus, response: formattedResp, success: allSuccess });
      } else showToast('No payloads sent.', 'warn');
    } catch (err: unknown) { setTestResultModal({ title: 'Delay Push Test', response: (err as Error).message, status: 0, success: false }); }
    finally { setTestingDelayPush((prev) => ({ ...prev, [key]: false })); }
  };

  const handleTestUrlCheck = async (serverId: number) => {
    const conf = servers.find((s) => s.id === serverId);
    setTestingUrlCheck((prev) => ({ ...prev, [serverId]: true }));
    try {
      const res = await authFetch(`${API_BASE}/server-config/${serverId}/test-url`, { method: 'POST', body: JSON.stringify({ live_url: conf?.live_url || '', delay_url: conf?.delay_url || '' }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Check failed (${res.status})`);
      const data: any = await res.json();
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const parts = (data.results || []).map((r: any) => {
        const head = `<div style="font:600 13px/1.5 system-ui;padding:8px 12px;background:var(--surface-muted);border-bottom:1px solid var(--border)">${esc(r.label)}: ${r.reachable ? `OK (HTTP ${r.status_code}, ${r.latency_ms}ms)` : `FAILED — ${esc(r.error || 'unreachable')}`}<div style="font-weight:400;color:var(--text-secondary);font-size:12px">${esc(r.url || '')}</div></div>`;
        return `<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:10px;font-family:system-ui">${head}${r.body ? `<div style="padding:12px">${r.body}</div>` : ''}</div>`;
      }).join('');
      setTestResultModal({ title: 'URL Check', response: parts || 'No URLs to check.', status: 0, success: (data.results || []).every((r: any) => r.reachable) });
    } catch (err: unknown) { setTestResultModal({ title: 'URL Check', response: (err as Error).message, status: 0, success: false }); }
    finally { setTestingUrlCheck((prev) => ({ ...prev, [serverId]: false })); }
  };

  const handleClearPending = async (serverId: number) => {
    try {
      const res = await authFetch(`${API_BASE}/server-config/${serverId}/pending-records`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      const data: any = await res.json();
      setPendingCounts((prev) => ({ ...prev, [serverId]: 0 }));
      showToast(`Cleared ${data.deleted} pending record(s).`, 'success');
    } catch (e: unknown) { showToast(`Failed: ${(e as Error).message}`, 'error'); }
  };



  const handleGenerateHistorical = async (serverId: number, serverName: string) => {
    const date = historicalDates[serverId] || new Date().toISOString().split('T')[0];
    if (!date) { showToast('Select a date.', 'warn'); return; }
    setGeneratingHistorical((prev) => ({ ...prev, [serverId]: true }));
    try {
      const res = await authFetch(`${API_BASE}/server-config/${serverId}/generate-historical?date=${date}`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Failed (${res.status})`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${serverName.replace(/\s+/g, '_')}_makeup_${date}.txt`; a.click(); a.remove(); window.URL.revokeObjectURL(url);
      showToast('Historical file downloaded.', 'success');
    } catch (err: unknown) { showToast(`Failed: ${(err as Error).message}`, 'error'); }
    finally { setGeneratingHistorical((prev) => ({ ...prev, [serverId]: false })); }
  };

  const handleMappingChange = (paramId: number, serverId: number | string, field: string, value: string | boolean) => {
    setEditedMappings((prev) => ({ ...prev, [paramId]: { ...prev[paramId], [serverId]: { ...(prev[paramId]?.[serverId] || {} as MappingEdit), [field]: value } } }));
  };

  // ─── Shared render helpers (Push Servers tab) ───
  const sectionHeader = (num: number, title: string, desc: string, color: string, onSave?: (() => void) | null) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
      <div style={{ width: 28, height: 28, borderRadius: '8px', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', flexShrink: 0, marginTop: '2px' }}>{num}</div>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>{title}</h3>
        {desc && <p style={{ margin: '1px 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>{desc}</p>}
      </div>
      {onSave && (
        <button onClick={onSave} disabled={saving} style={{
          background: 'linear-gradient(135deg, var(--primary-600), var(--primary-400))', color: '#fff', border: 'none',
          borderRadius: '6px', padding: '6px 14px', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '6px', opacity: saving ? 0.6 : 1, flexShrink: 0,
        }}><Plus /> {saving ? '...' : 'Save'}</button>
      )}
    </div>
  );

  const renderServerCard = (conf: PushServer, idx: number, protocolType: string, extraFields: React.ReactNode, subRow: React.ReactNode) => {
    const pendCount = pendingCounts[conf.id] || 0;
    return (
      <div key={conf.id || idx} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px', background: '#fff' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={s()}>Server Name</label>
            <input type="text" name="name" value={conf.name || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="e.g. SPCB Gujarat" style={ipt} />
          </div>
          {extraFields}
          <div style={{ flexShrink: 0, display: 'flex', gap: '4px', paddingBottom: '2px' }}>
            {pendCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0 10px', borderRadius: '99px', background: 'var(--warning-bg)', border: '1px solid var(--warning)', fontSize: '11px', fontWeight: '700', color: 'var(--warning-text)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)', display: 'inline-block' }} />
                {pendCount} pending
                <button onClick={() => handleClearPending(conf.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '10px', fontWeight: '700', padding: '2px 4px', marginLeft: '2px', textDecoration: 'underline' }}>Clear</button>
              </div>
            )}
            <button onClick={() => removeServer(conf, idx)} style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--danger-bg)', background: 'var(--danger-bg)', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash /></button>
          </div>
        </div>
        {subRow && <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--surface-muted)', flexWrap: 'wrap' }}>{subRow}</div>}
      </div>
    );
  };

  const renderMappingTable = (serverFilter: (s: PushServer) => boolean, forceStationName?: string) => {
    const filteredServers = servers.filter((s) => (s.id || s._tempId) && serverFilter(s));
    if (filteredServers.length === 0) return null;

    const primarySrv = filteredServers[0];
    const isCpcb = primarySrv.protocol === 'cpcb';
    const isBoth = primarySrv.protocol === 'both';
    const isLed = primarySrv.protocol === 'led';
    const isAppcb = primarySrv.protocol === 'appcb';
    const showCpcbCols = isCpcb || isBoth;
    const showTgpcbCols = primarySrv.protocol === 'tspcb' || primarySrv.protocol === 'spcb' || isBoth;
    const showAppcbCols = isAppcb;

    const handleSharedMappingChange = (paramId: number, field: string, value: string | boolean) => {
      filteredServers.forEach((srv) => {
        const srvKey = srv.id ?? srv._tempId;
        if (srvKey) handleMappingChange(paramId, srvKey, field, value);
      });
    };

    return (
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', overflowX: 'auto', marginTop: '10px' }}>
        <div style={{ padding: '10px 14px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: '700', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Parameter Mappings (Shared for all {filteredServers.length} {filteredServers.length === 1 ? 'Server' : 'Servers'})
          <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '99px', background: isLed ? 'var(--warning-bg)' : isAppcb ? 'var(--success-bg)' : isCpcb ? 'var(--warning-bg)' : 'var(--primary-50)', color: isLed ? 'var(--warning)' : isAppcb ? 'var(--success)' : isCpcb ? 'var(--warning)' : 'var(--primary-600)' }}>{isLed ? 'LED' : isAppcb ? 'APPCB' : isCpcb ? 'CPCB' : isBoth ? 'Both' : 'SPCB'}</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Ch</th>
                <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Station Name</th>
                <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Parameter</th>
                <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Push</th>
                {isLed ? (
                  <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>LED Name</th>
                ) : (
                  <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>vname</th>
                )}
                {isLed ? (
                  <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Unit</th>
                ) : !isAppcb && (
                  <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>unit</th>
                )}
                {showCpcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>CPCB Station</th>}
                {showCpcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>CPCB Param</th>}
                {showAppcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Unit ID</th>}
                {showAppcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Analyzer ID</th>}
                {showAppcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Param ID</th>}
                {showAppcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Param Name</th>}
                {showAppcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>UOM ID</th>}
                {showTgpcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Device ID</th>}
                {showTgpcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Username</th>}
                {showTgpcbCols && <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Password</th>}
                <th style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>Test Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.length === 0 ? (
                <tr><td colSpan={13} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>No parameters found. Add devices and parameters first.</td></tr>
              ) : (
                mappings.map((param) => {
                  const srvKey = primarySrv.id ?? primarySrv._tempId;
                  const state: MappingEdit = editedMappings[param.parameter_id]?.[srvKey] || editedMappings[param.parameter_id]?.[String(srvKey)] || { is_active: false, api_id: '', api_name: '', api_password: '', api_vname: '', api_unit: '', cpcb_station_name: '', cpcb_parameter: '', led_channel_name: '', led_unit: '' };
                  const cellChg = (f: string, v: string | boolean) => handleSharedMappingChange(param.parameter_id, f, v);
                  const inpS: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '5px 6px', border: '1px solid transparent', borderBottom: '1px solid var(--border)', borderRadius: '4px', background: 'transparent', fontSize: '12px', color: 'var(--text-primary)', outline: 'none', fontFamily: T.fontMono };
                  const testKey = primarySrv.id ? `${primarySrv.id}_p${param.parameter_id}` : '';
                  return (
                    <tr key={param.parameter_id} style={{ borderBottom: '1px solid var(--surface-muted)' }}>
                      <td style={{ padding: '6px 10px', fontWeight: '700', color: 'var(--text-primary)', fontSize: '12px' }}>{param.channel_no}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-secondary)', fontSize: '12px' }}>{forceStationName || param.station_name}</td>
                      <td style={{ padding: '6px 10px', fontWeight: '700', color: 'var(--primary-600)', fontSize: '12px' }}>{param.parameter_name}</td>
                      <td style={{ padding: '6px 10px' }}><Toggle checked={!!state.is_active} onChange={() => cellChg('is_active', !state.is_active)} /></td>
                      {isLed ? (
                        <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="LED Name" value={state.led_channel_name || ''} onChange={e => cellChg('led_channel_name', e.target.value)} /></td>
                      ) : (
                        <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="vname" value={state.api_vname || ''} onChange={e => cellChg('api_vname', e.target.value)} /></td>
                      )}
                      {isLed ? (
                        <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="Unit" value={state.led_unit || ''} onChange={e => cellChg('led_unit', e.target.value)} /></td>
                      ) : !isAppcb && (
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
                      {showAppcbCols && <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="Unit ID" value={state.appcb_monitoring_unit_id || ''} onChange={e => cellChg('appcb_monitoring_unit_id', e.target.value)} /></td>}
                      {showAppcbCols && <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="Analyzer ID" value={state.appcb_analyzer_id || ''} onChange={e => cellChg('appcb_analyzer_id', e.target.value)} /></td>}
                      {showAppcbCols && <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="Param ID" value={state.appcb_parameter_id || ''} onChange={e => cellChg('appcb_parameter_id', e.target.value)} /></td>}
                      {showAppcbCols && <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="Param Name" value={state.appcb_parameter_name || ''} onChange={e => cellChg('appcb_parameter_name', e.target.value)} /></td>}
                      {showAppcbCols && <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="UOM ID" value={state.appcb_unit_id || ''} onChange={e => cellChg('appcb_unit_id', e.target.value)} /></td>}
                      {showTgpcbCols && <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="ID" value={state.api_id || ''} onChange={e => cellChg('api_id', e.target.value)} /></td>}
                      {showTgpcbCols && <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="Username" value={state.api_name || ''} onChange={e => cellChg('api_name', e.target.value)} /></td>}
                      {showTgpcbCols && <td style={{ padding: '4px 6px' }}><input style={inpS} placeholder="Password" value={state.api_password || ''} onChange={e => cellChg('api_password', e.target.value)} /></td>}
                      <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                        {primarySrv.id ? (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={() => handleTestPush(primarySrv.id!, { parameterId: param.parameter_id })}
                              disabled={!!testingPush[testKey]}
                              style={{ background: 'var(--primary-600)', color: '#fff', border: 'none', height: '24px', padding: '0 8px', fontSize: '10px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' }}
                            >
                              {testingPush[testKey] ? '...' : 'Test Live'}
                            </button>
                            <button
                              onClick={() => handleTestDelayPush(primarySrv.id!, { parameterId: param.parameter_id })}
                              disabled={!!testingDelayPush[testKey]}
                              style={{ background: 'var(--info)', color: '#fff', border: 'none', height: '24px', padding: '0 8px', fontSize: '10px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' }}
                            >
                              {testingDelayPush[testKey] ? '...' : 'Test Delay'}
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Save first</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };
  const renderSpcbSection = () => {

    if (pushLoading) return <p style={{ color: T.textFaint }}>Loading...</p>;
    return (
      <div className="card" style={{ padding: '20px' }}>
        {sectionHeader(1, 'SPCB server', '', 'var(--primary-600)', () => handleSave('spcb'))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {servers.map((conf, idx) => (conf.protocol === 'tspcb' || conf.protocol === 'spcb' || conf.protocol === 'both') ? renderServerCard(conf, idx, conf.protocol,
            <><div style={{ flex: '1 1 200px' }}><label style={s()}>Live URL</label><input type="text" name="live_url" value={conf.live_url || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="https://.../live" style={ipt} /></div><div style={{ flex: '1 1 200px' }}><label style={s()}>Delay URL</label><input type="text" name="delay_url" value={conf.delay_url || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="https://.../delay" style={ipt} /></div></>,
            <><label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}><Toggle checked={!!conf.is_active} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_active', type: 'checkbox', checked: !conf.is_active } })} />{conf.is_active ? 'Enabled' : 'Disabled'}</label>{conf.protocol === 'both' && <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}><Toggle checked={conf.is_cpcb_active ?? true} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_cpcb_active', type: 'checkbox', checked: !(conf.is_cpcb_active ?? true) } })} />CPCB Push</label>}{conf.id && <div style={{ display: 'flex', gap: '6px' }}><button onClick={() => handleTestUrlCheck(conf.id)} disabled={testingUrlCheck[conf.id]} style={{ background: 'var(--warning)', color: '#fff', border: 'none', height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{testingUrlCheck[conf.id] ? '...' : 'Url Check'}</button><button onClick={() => handleTestPush(conf.id)} disabled={testingPush[conf.id]} style={{ background: 'var(--primary-600)', color: '#fff', border: 'none', height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{testingPush[conf.id] ? '...' : 'Test Live'}</button><button onClick={() => handleTestDelayPush(conf.id)} disabled={testingDelayPush[conf.id]} style={{ background: 'var(--info)', color: '#fff', border: 'none', height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{testingDelayPush[conf.id] ? '...' : 'Test Delay'}</button></div>}</>
          ) : null)}
          {servers.filter((s) => s.protocol === 'tspcb' || s.protocol === 'spcb' || s.protocol === 'both').length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px', border: '1.5px dashed var(--border)', borderRadius: '10px' }}>No SPCB server configured. <button onClick={() => addServer('tspcb')} style={{ background: 'none', border: 'none', color: 'var(--primary-600)', fontWeight: '700', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Add SPCB Server</button></div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button onClick={() => addServer('tspcb')} style={{ background: 'transparent', border: '1.5px solid var(--primary-600)', borderRadius: '8px', color: 'var(--primary-600)', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus /> Add SPCB Server</button>
        </div>
        {renderMappingTable((s) => s.protocol === 'tspcb' || s.protocol === 'spcb' || s.protocol === 'both')}
      </div>
    );
  };

  const renderTnpcbSection = () => {
    if (pushLoading) return <p style={{ color: T.textFaint }}>Loading...</p>;
    return (
      <div className="card" style={{ padding: '20px' }}>
        {sectionHeader(2, 'TNPCB Server', '', 'var(--info)', () => handleSave('tnpcb'))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {servers.map((conf, idx) => conf.protocol === 'tnpcb' ? renderServerCard(conf, idx, 'tnpcb', null,
            <><label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}><Toggle checked={!!conf.is_active} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_active', type: 'checkbox', checked: !conf.is_active } })} />{conf.is_active ? 'Enabled' : 'Disabled'}</label>{conf.id && <div style={{ display: 'flex', gap: '6px' }}><button onClick={() => handleTestUrlCheck(conf.id)} disabled={testingUrlCheck[conf.id]} style={{ background: 'var(--warning)', color: '#fff', border: 'none', height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{testingUrlCheck[conf.id] ? '...' : 'Url Check'}</button><button onClick={() => handleTestPush(conf.id)} disabled={testingPush[conf.id]} style={{ background: 'var(--info)', color: '#fff', border: 'none', height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{testingPush[conf.id] ? '...' : 'Test TNPCB Push'}</button></div>}</>
          ) : null)}
          {servers.filter((s) => s.protocol === 'tnpcb').length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px', border: '1.5px dashed var(--border)', borderRadius: '10px' }}>No TNPCB server configured. <button onClick={() => addServer('tnpcb')} style={{ background: 'none', border: 'none', color: 'var(--info)', fontWeight: '700', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Add TNPCB Server</button></div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button onClick={() => addServer('tnpcb')} style={{ background: 'transparent', border: '1.5px solid var(--info)', borderRadius: '8px', color: 'var(--info)', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus /> Add TNPCB Server</button>
        </div>
        {renderMappingTable((s) => s.protocol === 'tnpcb')}
      </div>
    );
  };

  const renderAppcbSection = () => {
    if (pushLoading) return <p style={{ color: T.textFaint }}>Loading...</p>;
    return (
      <div className="card" style={{ padding: '20px' }}>
        {sectionHeader(3, 'APPCB Server', '', 'var(--success)', () => handleSave('appcb'))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {servers.map((conf, idx) => conf.protocol === 'appcb' ? renderServerCard(conf, idx, 'appcb',
            <><div style={{ flex: '1 1 120px' }}><label style={s()}>Site ID</label><input type="text" name="appcb_site_id" value={conf.appcb_site_id || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="e.g. site_1392" style={ipt} /></div><div style={{ flex: '1 1 200px' }}><label style={s()}>Site UID</label><input type="text" name="appcb_site_uid" value={conf.appcb_site_uid || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="UUID" style={ipt} /></div><div style={{ flex: '1 1 200px' }}><label style={s()}>Encryption Key</label><input type="password" name="appcb_encryption_key" value={conf.appcb_encryption_key || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="AES-128 Key (16 bytes)" style={ipt} /></div><div style={{ flex: '1 1 200px' }}><label style={s()}>Live URL</label><input type="text" name="live_url" value={conf.live_url || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="https://.../api/..." style={ipt} /></div><div style={{ flex: '1 1 200px' }}><label style={s()}>Delay URL</label><input type="text" name="delay_url" value={conf.delay_url || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="https://.../delay" style={ipt} /></div></>,
            <><label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}><Toggle checked={!!conf.is_active} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_active', type: 'checkbox', checked: !conf.is_active } })} />{conf.is_active ? 'Enabled' : 'Disabled'}</label>{conf.id && <div style={{ display: 'flex', gap: '6px' }}><button onClick={() => handleTestUrlCheck(conf.id)} disabled={testingUrlCheck[conf.id]} style={{ background: 'var(--warning)', color: '#fff', border: 'none', height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{testingUrlCheck[conf.id] ? '...' : 'Url Check'}</button><button onClick={() => handleTestPush(conf.id)} disabled={testingPush[conf.id]} style={{ background: 'var(--success)', color: '#fff', border: 'none', height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{testingPush[conf.id] ? '...' : 'Test APPCB Push'}</button><button onClick={() => handleTestDelayPush(conf.id)} disabled={testingDelayPush[conf.id]} style={{ background: 'var(--info)', color: '#fff', border: 'none', height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{testingDelayPush[conf.id] ? '...' : 'Test Delay'}</button></div>}</>
          ) : null)}
          {servers.filter((s) => s.protocol === 'appcb').length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px', border: '1.5px dashed var(--border)', borderRadius: '10px' }}>No APPCB server configured. <button onClick={() => addServer('appcb')} style={{ background: 'none', border: 'none', color: 'var(--success)', fontWeight: '700', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Add APPCB Server</button></div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button onClick={() => addServer('appcb')} style={{ background: 'transparent', border: '1.5px solid var(--success)', borderRadius: '8px', color: 'var(--success)', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus /> Add APPCB Server</button>
        </div>
        {renderMappingTable((s) => s.protocol === 'appcb')}
      </div>
    );
  };

  const renderCpcbSection = () => {
    if (pushLoading) return <p style={{ color: T.textFaint }}>Loading...</p>;
    return (
      <div className="card" style={{ padding: '20px' }}>
        {sectionHeader(4, 'CPCB TXT File Generation', '', 'var(--warning)', () => handleSave('cpcb'))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {servers.map((conf, idx) => (conf.protocol === 'cpcb' || conf.protocol === 'both') ? renderServerCard(conf, idx, 'cpcb',
            <><div style={{ flex: '1 1 300px' }}><label style={s()}>Output File Path</label><input type="text" name="cpcb_file_path" value={conf.cpcb_file_path || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="C:\Data\readings.txt" style={ipt} /></div></>,
            <><label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}><Toggle checked={!!conf.is_active} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_active', type: 'checkbox', checked: !conf.is_active } })} />{conf.is_active ? 'Enabled' : 'Disabled'}</label>{conf.id && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="date" value={historicalDates[conf.id] || new Date().toISOString().split('T')[0]} max={new Date().toISOString().split('T')[0]} onChange={e => setHistoricalDates((prev) => ({ ...prev, [conf.id!]: e.target.value }))} style={{ ...ipt, padding: '4px 8px', height: '30px', fontSize: '12px', width: '130px' }} /><button onClick={() => handleGenerateHistorical(conf.id, conf.name)} disabled={generatingHistorical[conf.id]} style={{ background: 'var(--warning)', color: '#fff', border: 'none', height: '30px', padding: '0 12px', fontSize: '11px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{generatingHistorical[conf.id] ? '...' : 'Makeup'}</button></div>}</>
          ) : null)}
          {servers.filter((s) => s.protocol === 'cpcb' || s.protocol === 'both').length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px', border: '1.5px dashed var(--border)', borderRadius: '10px' }}>No CPCB server configured. <button onClick={() => addServer('cpcb')} style={{ background: 'none', border: 'none', color: 'var(--warning)', fontWeight: '700', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Add CPCB Server</button></div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button onClick={() => addServer('cpcb')} style={{ background: 'transparent', border: '1.5px solid var(--warning)', borderRadius: '8px', color: 'var(--warning)', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus /> Add CPCB Server</button>
        </div>
        {renderMappingTable((s) => s.protocol === 'cpcb' || s.protocol === 'both')}
      </div>
    );
  };



  const renderLedSection = () => {
    if (pushLoading) return <p style={{ color: T.textFaint }}>Loading...</p>;
    return (
      <div className="card" style={{ padding: '20px' }}>
        {sectionHeader(5, 'LED Board (LAN)', '', 'var(--warning)', () => handleSave('led'))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {servers.map((conf, idx) => conf.protocol === 'led' ? renderServerCard(conf, idx, 'led',
            null,
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  <Toggle checked={!!conf.is_active} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_active', type: 'checkbox', checked: !conf.is_active } })} />
                  {conf.is_active ? 'Enabled' : 'Disabled'}
                </label>
              </div>
              {conf.id && (() => {
                const srvId = conf.id;
                const activeParamIds = mappings
                  .filter((p) => {
                    const state = editedMappings[p.parameter_id]?.[srvId];
                    return state && state.is_active;
                  })
                  .map((p) => p.parameter_id);
                const pcbList = activeParamIds.join(',');
                const ledUrl = `http://${lanIp}/api/v1/led/?auth=${currentUser || 'admin'}&PCB=${pcbList || '1,2'}`;
                const fallbackUrl = `http://${lanIp}:8765/api/v1/led/?auth=${currentUser || 'admin'}&PCB=${pcbList || '1,2'}`;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--warning-bg)', border: '1px solid var(--warning-bg)', borderRadius: '8px', marginTop: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--warning)' }}>Dynamic LED Board LAN URL</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(ledUrl);
                          showToast('LED URL copied to clipboard!');
                        }}
                        style={{ background: 'var(--warning)', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}
                      >
                        Copy URL
                      </button>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all', fontFamily: 'monospace', background: '#fff', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      {ledUrl}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                      If port 80 is blocked by your OS, try: <strong>{fallbackUrl}</strong>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : null)}
          {servers.filter((s) => s.protocol === 'led').length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px', border: '1.5px dashed var(--border)', borderRadius: '10px' }}>No LED board configured. <button onClick={() => addServer('led')} style={{ background: 'none', border: 'none', color: 'var(--warning)', fontWeight: '700', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Add LED Board</button></div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button onClick={() => addServer('led')} style={{ background: 'transparent', border: '1.5px solid var(--warning)', borderRadius: '8px', color: 'var(--warning)', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus /> Add LED Board</button>
        </div>
        {renderMappingTable((s) => s.protocol === 'led')}
      </div>
    );
  };

  // ─── Test Response Modal ───

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-muted)', fontFamily: T.fontBase }}>
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '16px 28px 0', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Server Management</h1>

        <div style={{ display: 'flex', gap: '4px' }}>
          {SUB_TABS.map(t => (
            <button key={t.key} onClick={() => { setSubTab(t.key); loadPushData(); }}
              style={{
              padding: '8px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
              border: 'none', borderBottom: `3px solid ${subTab === t.key ? t.icon : 'transparent'}`,
              background: 'transparent', color: subTab === t.key ? t.icon : 'var(--text-secondary)',
              transition: 'all 0.15s', marginBottom: '-1px',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {subTab === 'spcb' && renderSpcbSection()}
        {subTab === 'tnpcb' && renderTnpcbSection()}
        {subTab === 'appcb' && renderAppcbSection()}
        {subTab === 'cpcb' && renderCpcbSection()}
        {subTab === 'led' && renderLedSection()}
      </div>

      <Modal isOpen={testResultModal !== null} title={testResultModal?.success ? 'Success' : 'Connection Failed'} onClose={() => setTestResultModal(null)}>
        {testResultModal && (
          <div>
            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {testResultModal.title && <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>{testResultModal.title}</span>}
              <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '99px', background: testResultModal.success ? 'var(--success-bg)' : 'var(--danger-bg)', color: testResultModal.success ? 'var(--success-text)' : 'var(--danger-text)' }}>
                {testResultModal.status === 0 ? 'HTTP 0 (No Response)' : `HTTP ${testResultModal.status}`}
              </span>
            </div>
            {testResultModal.title === 'URL Check'
              ? <iframe key={Date.now()} sandbox="" title="URL Check" srcDoc={testResultModal.response} style={{ width: '100%', height: '280px', border: '1px solid var(--border)', borderRadius: '8px', background: '#fff' }} />
              : <pre style={{ margin: 0, padding: '14px', background: 'var(--primary-600)', color: 'var(--primary-50)', borderRadius: '8px', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'Consolas, monospace' }}>
                  {testResultModal.response && testResultModal.response.trim() !== ''
                    ? testResultModal.response
                    : (testResultModal.status === 0
                        ? "Connection Failed (HTTP 0): Unable to connect to the target SPCB server.\n\nPlease check:\n1. Target Server IP and Port URL configuration\n2. SPCB server host is running and online\n3. Local network / firewall connectivity"
                        : '<No Response Body>')}
                </pre>}
          </div>
        )}
      </Modal>
    </div>
  );
});
