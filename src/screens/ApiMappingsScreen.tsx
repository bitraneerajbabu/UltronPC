import React, { useContext, useState, useEffect, useMemo } from 'react';
import { AppContext } from '../context/AppContext';

// ─── CPCB standard parameter abbreviations (for quick-select helper) ──────────
const CPCB_PARAMS = [
  'CO', 'SO2', 'NO', 'NO2', 'NOx', 'Ozone', 'PM10', 'PM2.5', 'Temp',
  'WS', 'WD', 'AT', 'RH', 'BP', 'SR', 'RF', 'VWS',
  'Benzene', 'Toluene', 'Xylene', 'Eth-Benzene', 'MP-Xylene',
  'CH4', 'NH3', 'HCHO', 'Hg',
];

// ─── Format backend validation/detail errors ────────────────────────────────
const formatErrorMsg = (detail, fallback) => {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(d => {
      const locStr = d.loc ? `[${d.loc.join('.')}] ` : '';
      return `${locStr}${d.msg || JSON.stringify(d)}`;
    }).join('; ');
  }
  if (typeof detail === 'object') {
    return detail.message || JSON.stringify(detail);
  }
  return fallback;
};

export const ApiMappingsScreen = () => {
  const { API_BASE, showToast, authFetch } = useContext(AppContext);
  const [servers, setServers] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedMappings, setEditedMappings] = useState({});
  const [historicalDates, setHistoricalDates] = useState({});
  const [generatingHistorical, setGeneratingHistorical] = useState({});
  const [activeServerTab, setActiveServerTab] = useState(null);
  const [selectedParamId, setSelectedParamId] = useState(null);

  const theme = {
    primary: '#0f766e',        // Primary Dark Teal Green
    lightBg: '#80cbc4',        // Soft mint/teal card background
    border: '#4db6ac',         // Soft border teal
    lightRow: '#e6f4f2',       // Clean light mint table row background
    darkLabel: '#115e59',      // Dark teal green label
    selectHighlight: '#b2dfdb', // Highlighted row background
    cpcbBg: '#ca8a04',
    primaryLight: '#14b8a6',
  };

  const localINP = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: '6px',
    border: `1.5px solid ${theme.border}`,
    background: '#fff',
    fontSize: '12px',
    color: '#000',
    fontWeight: 'bold',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };

  const localSEL = {
    ...localINP,
    cursor: 'pointer',
  };

  const Toggle = ({ checked, onChange, color = theme.primary }) => (
    <div onClick={onChange} style={{ position:'relative', width:34, height:18, cursor:'pointer', flexShrink:0 }}>
      <div style={{
        position:'absolute', inset:0, borderRadius:99,
        background: checked ? color : '#cbd5e1',
        transition:'background 0.2s',
      }}/>
      <div style={{
        position:'absolute', top:2, left: checked ? 18 : 2,
        width:14, height:14, borderRadius:'50%', background:'#fff',
        boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left 0.2s', pointerEvents:'none',
      }}/>
    </div>
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const [srvRes, mapRes] = await Promise.all([
        authFetch(`${API_BASE}/server-config/`),
        authFetch(`${API_BASE}/server-config/mappings`)
      ]);

      if (!srvRes.ok || !mapRes.ok) throw new Error('Failed to load online data');

      const serversData = await srvRes.json();
      const mappingsData = await mapRes.json();

      setServers(serversData);
      setMappings(mappingsData);
      if (mappingsData.length > 0) {
        setSelectedParamId(mappingsData[0].parameter_id);
      }

      // Set default active tab to the first active server
      const firstActive = serversData.find(s => s.is_active);
      if (firstActive) {
        setActiveServerTab(firstActive.id);
      } else if (serversData.length > 0) {
        setActiveServerTab(serversData[0].id);
      }

      const initialEdits = {};
      mappingsData.forEach(param => {
        initialEdits[param.parameter_id] = {};
        serversData.forEach(srv => {
          const existing = param.mappings?.[srv.id] || param.mappings?.[String(srv.id)] || {};
          initialEdits[param.parameter_id][srv.id] = {
            is_active: existing.is_active ?? false,
            api_id: existing.api_id || '',
            api_name: existing.api_name || '',
            api_password: existing.api_password || '',
            api_vname: existing.api_vname || '',
            api_unit: existing.api_unit || '',
            cpcb_station_name: existing.cpcb_station_name || '',
            cpcb_parameter: existing.cpcb_parameter || '',
          };
        });
      });
      setEditedMappings(initialEdits);

    } catch (e) {
      console.error(e);
      showToast('Failed to load mappings — trying local cache', 'warn');
      const cachedMappings = localStorage.getItem('cached_api_mappings');
      const cachedServers = localStorage.getItem('cached_api_servers');
      if (cachedMappings && cachedServers) {
        try {
          const srvs = JSON.parse(cachedServers);
          setServers(srvs);
          setEditedMappings(JSON.parse(cachedMappings));
          if (srvs.length > 0) setActiveServerTab(srvs[0].id);
        } catch (_) { }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleMappingChange = (paramId, serverId, field, value) => {
    setEditedMappings(prev => ({
      ...prev,
      [paramId]: {
        ...prev[paramId],
        [serverId]: {
          ...(prev[paramId]?.[serverId] || {}),
          [field]: value
        }
      }
    }));
  };

  const handleServerFieldChange = (index, e) => {
    const { name, value, type, checked } = e.target;
    setServers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [name]: type === 'checkbox' ? checked : value };
      return updated;
    });
  };

  const addServer = () => {
    setServers(prev => [...prev, {
      name: '', protocol: 'tspcb',
      live_url: '', delay_url: '', cpcb_file_path: '', is_active: true, is_cpcb_active: true
    }]);
  };

  const removeServer = async (index, id) => {
    if (id) {
      if (!window.confirm('Delete this server config permanently?')) return;
      try {
        await authFetch(`${API_BASE}/server-config/${id}`, { method: 'DELETE' });
        showToast('Server deleted.', 'success');
      } catch (_) {
        showToast('Failed to delete server.', 'error');
        return;
      }
    }
    setServers(prev => prev.filter((_, i) => i !== index));
    if (activeServerTab === id) {
      setActiveServerTab(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);

    try {
      const savedServers = [];
      for (const conf of servers) {
        if (!conf.name?.trim()) {
          showToast('Server name is required.', 'warn');
          setSaving(false);
          clearTimeout(tid);
          return;
        }
        const method = conf.id ? 'PUT' : 'POST';
        const url = conf.id ? `${API_BASE}/server-config/${conf.id}` : `${API_BASE}/server-config/`;
        const res = await authFetch(url, { method, body: JSON.stringify(conf), signal: controller.signal });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const detailMsg = formatErrorMsg(body.detail, `Save failed (${res.status})`);
          throw new Error(detailMsg);
        }
        const data = await res.json();
        savedServers.push(data);
      }

      const payload = mappings.map(param => {
        const paramUpdates = {};
        savedServers.forEach(srv => {
          paramUpdates[srv.id] = {
            server_id: srv.id,
            is_active: false,
            api_id: '',
            api_name: '',
            api_password: '',
            api_vname: '',
            api_unit: '',
            cpcb_station_name: '',
            cpcb_parameter: '',
            ...(editedMappings[param.parameter_id]?.[srv.id] || editedMappings[param.parameter_id]?.[String(srv.id)] || {})
          };
        });
        return { parameter_id: param.parameter_id, mappings: paramUpdates };
      });

      const res = await authFetch(`${API_BASE}/server-config/mappings`, {
        method: 'PUT', body: JSON.stringify(payload), signal: controller.signal
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        const detailMsg = formatErrorMsg(b.detail, 'Mapping save failed');
        throw new Error(detailMsg);
      }

      clearTimeout(tid);
      showToast('Server configs & mappings saved successfully.', 'success');
      loadData();
    } catch (e) {
      clearTimeout(tid);
      if (e.name === 'AbortError' || !navigator.onLine) {
        localStorage.setItem('cached_api_mappings', JSON.stringify(editedMappings));
        localStorage.setItem('cached_api_servers', JSON.stringify(servers));
        showToast('Saved locally. Will sync when online.', 'warn');
      } else {
        showToast(`Save failed: ${e.message}`, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateHistorical = async (serverId, serverName) => {
    const date = historicalDates[serverId] || new Date().toISOString().split('T')[0];
    if (!date) {
      showToast('Please select a valid date.', 'warn');
      return;
    }

    setGeneratingHistorical(prev => ({ ...prev, [serverId]: true }));
    try {
      const res = await authFetch(`${API_BASE}/server-config/${serverId}/generate-historical?date=${date}`, {
        method: 'POST',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Generation failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${serverName.replace(/\s+/g, '_')}_makeup_${date}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      showToast(`Historical makeup file generated and downloaded.`, 'success');
    } catch (err) {
      console.error(err);
      showToast(`Failed to generate: ${err.message}`, 'error');
    } finally {
      setGeneratingHistorical(prev => ({ ...prev, [serverId]: false }));
    }
  };

  const [testingPush, setTestingPush] = useState({});
  const [testResultModal, setTestResultModal] = useState(null);

  const handleTestPush = async (serverId) => {
    setTestingPush(prev => ({ ...prev, [serverId]: true }));
    try {
      const res = await authFetch(`${API_BASE}/server-config/${serverId}/test-push`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Test failed (${res.status})`);
      }
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const first = data.results[0];
        setTestResultModal({
          status: first.status_code,
          response: first.response,
          success: first.success
        });
      } else {
        showToast('No payloads were sent (no active mappings?).', 'warn');
      }
    } catch (e) {
      console.error(e);
      showToast(`Test failed: ${e.message}`, 'error');
    } finally {
      setTestingPush(prev => ({ ...prev, [serverId]: false }));
    }
  };

  const activeServers = useMemo(() => servers.filter(s => s.id && s.is_active), [servers]);
  const selectedServer = useMemo(() => activeServers.find(s => s.id === activeServerTab) || activeServers[0], [activeServers, activeServerTab]);
  const selectedParam = useMemo(() => mappings.find(m => m.parameter_id === selectedParamId) || mappings[0], [mappings, selectedParamId]);

  const selectedMapping = useMemo(() => {
    if (!selectedParam || !selectedServer) {
      return {
        is_active: false, api_id: '', api_name: '', api_password: '', api_vname: '', api_unit: '', cpcb_station_name: '', cpcb_parameter: '',
      };
    }
    return editedMappings[selectedParam.parameter_id]?.[selectedServer.id] || editedMappings[selectedParam.parameter_id]?.[String(selectedServer.id)] || {
      is_active: false, api_id: '', api_name: '', api_password: '', api_vname: '', api_unit: '', cpcb_station_name: '', cpcb_parameter: '',
    };
  }, [selectedParam, selectedServer, editedMappings]);

  const serverIndex = useMemo(() => activeServers.findIndex(s => s.id === selectedServer?.id), [activeServers, selectedServer]);
  const serverPrefix = serverIndex !== -1 ? `S${serverIndex + 1}` : 'S1';

  if (loading) {
    return <div className="screen active" style={{ padding: '40px', textAlign: 'center', color: theme.darkLabel, fontWeight: 'bold' }}>Loading mappings…</div>;
  }

  return (
    <div className="screen active" id="apiMappingsScreen" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '800', color: theme.darkLabel, margin: 0 }}>Server Push Mappings</h1>
          <p style={{ fontSize: '12px', color: '#475569', marginTop: '2px', fontWeight: '700' }}>
            Configure TGPCB (JSON HTTP) or CPCB (CSV file) push servers and map parameters
          </p>
        </div>
        <button onClick={handleSave} disabled={saving} style={{
          background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryLight})`,
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          padding: '10px 20px',
          fontSize: '12px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(15,118,110,0.25)',
          opacity: saving ? 0.7 : 1,
        }}>
          {saving ? '⏳ Saving…' : 'Save All Configurations'}
        </button>
      </div>

      {/* ── Server Push Configurations ── */}
      <div style={{ flexShrink: 0, marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: '800', color: theme.darkLabel, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Push Servers ({servers.length})</span>
          <button onClick={addServer} style={{
            background: 'transparent',
            border: `1.5px solid ${theme.primary}`,
            borderRadius: '6px',
            color: theme.primary,
            padding: '6px 14px',
            fontSize: '11px',
            fontWeight: '700',
            cursor: 'pointer',
          }}>+ Add Server</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '180px' }}>
          {servers.map((conf, idx) => {
            const isCpcb = conf.protocol === 'cpcb';
            const isBoth = conf.protocol === 'both';
            return (
              <div key={conf.id || `new-server-${idx}`} style={{
                background: '#fff',
                border: `1.5px solid ${theme.border}`,
                borderRadius: '12px',
                padding: '12px 16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                  {/* Server name */}
                  <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: '800', color: theme.darkLabel }}>State PCB Name</span>
                    <input type="text" name="name" value={conf.name || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="e.g. TGPCB" style={localINP} />
                  </div>

                  {/* Protocol */}
                  <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: '800', color: theme.darkLabel }}>Protocol</span>
                    <select name="protocol" value={conf.protocol || 'tspcb'} onChange={e => handleServerFieldChange(idx, e)} style={localSEL}>
                      <option value="tspcb">TGPCB (JSON HTTP)</option>
                      <option value="cpcb">CPCB (CSV File)</option>
                      <option value="both">Both (TGPCB & CPCB)</option>
                    </select>
                  </div>

                  {/* Live URL */}
                  <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: '800', color: theme.darkLabel }}>Live URL</span>
                    <input type="text" name="live_url" disabled={isCpcb} value={isCpcb ? '' : (conf.live_url || '')} onChange={e => handleServerFieldChange(idx, e)} placeholder={isCpcb ? 'N/A for CPCB' : 'e.g. https://.../live'} style={{...localINP, backgroundColor: isCpcb ? '#f1f5f9' : '#fff'}} />
                  </div>

                  {/* Delay URL */}
                  <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: '800', color: theme.darkLabel }}>Delay URL</span>
                    <input type="text" name="delay_url" disabled={isCpcb} value={isCpcb ? '' : (conf.delay_url || '')} onChange={e => handleServerFieldChange(idx, e)} placeholder={isCpcb ? 'N/A for CPCB' : 'e.g. https://.../delay'} style={{...localINP, backgroundColor: isCpcb ? '#f1f5f9' : '#fff'}} />
                  </div>

                  {/* Actions (Trash) */}
                  <div style={{ flexShrink: 0 }}>
                    <button onClick={() => removeServer(idx, conf.id)} style={{
                      padding: '8px 10px', borderRadius: '8px', border: '1px solid #ef444433', background: '#fef2f2',
                      color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                    </button>
                  </div>
                </div>

                {/* Sub-row for path & historical dates */}
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
                    <Toggle checked={!!conf.is_active} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_active', type: 'checkbox', checked: !conf.is_active } })} />
                    <span style={{ fontSize: '11px', fontWeight: '800', color: theme.darkLabel }}>
                      {isCpcb ? 'Enable CPCB Push' : 'Enable TGPCB Push'}
                    </span>
                  </label>

                  {isBoth && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
                      <Toggle checked={conf.is_cpcb_active ?? true} onChange={() => handleServerFieldChange(idx, { target: { name: 'is_cpcb_active', type: 'checkbox', checked: !(conf.is_cpcb_active ?? true) } })} />
                      <span style={{ fontSize: '11px', fontWeight: '800', color: theme.darkLabel }}>Enable CPCB Push</span>
                    </label>
                  )}

                  {(isCpcb || isBoth) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <span style={{ fontSize: '11px', fontWeight: '800', color: theme.darkLabel, whiteSpace: 'nowrap' }}>CPCB CSV Path:</span>
                      <input type="text" name="cpcb_file_path" value={conf.cpcb_file_path || ''} onChange={e => handleServerFieldChange(idx, e)} placeholder="e.g. C:\Data\readings.txt" style={{...localINP, padding: '4px 8px', height: '28px'}} />
                    </div>
                  )}

                  {(isCpcb || isBoth) && conf.id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderLeft: '1px solid #cbd5e1', paddingLeft: '12px' }}>
                      <input type="date" style={{...localINP, height: '28px', padding: '4px 6px', width: '120px'}} value={historicalDates[conf.id] || new Date().toISOString().split('T')[0]} max={new Date().toISOString().split('T')[0]} onChange={e => setHistoricalDates(prev => ({ ...prev, [conf.id]: e.target.value }))} />
                      <button onClick={() => handleGenerateHistorical(conf.id, conf.name)} disabled={generatingHistorical[conf.id]} style={{
                        backgroundColor: '#ca8a04', color: '#fff', border: 'none', height: '28px', padding: '0 12px', fontSize: '11px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer'
                      }}>
                        {generatingHistorical[conf.id] ? '⏳ Gen...' : 'Makeup'}
                      </button>
                    </div>
                  )}

                  {(!isCpcb || isBoth) && conf.id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderLeft: '1px solid #cbd5e1', paddingLeft: '12px' }}>
                      <button onClick={() => handleTestPush(conf.id)} disabled={testingPush[conf.id]} style={{
                        backgroundColor: theme.primary, color: '#fff', border: 'none', height: '28px', padding: '0 12px', fontSize: '11px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer'
                      }}>
                        {testingPush[conf.id] ? '⏳ Testing...' : 'Test Push'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {servers.length === 0 && (
            <div style={{ textAlign: 'center', color: theme.darkLabel, padding: '20px', backgroundColor: '#fff', borderRadius: '12px', border: `1.5px dashed ${theme.border}` }}>
              No push servers configured. Click **+ Add Server** to begin.
            </div>
          )}
        </div>
      </div>

      {/* ── Mappings Section Header + Tabs ── */}
      {activeServers.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          
          {/* Tabs header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', flexShrink: 0 }}>
            <span style={{ fontSize: '11px', fontWeight: '800', color: theme.darkLabel, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Server Maps:</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {activeServers.map(srv => {
                const isSelected = activeServerTab === srv.id;
                const isBoth = srv.protocol === 'both';
                const isCpcb = srv.protocol === 'cpcb';
                let pillColor = theme.primary;
                if (isBoth) pillColor = '#7c3aed';
                if (isCpcb) pillColor = theme.cpcbBg;

                return (
                  <button key={srv.id} style={{
                    background: isSelected ? pillColor : 'rgba(15,118,110,0.04)',
                    color: isSelected ? '#fff' : '#475569',
                    border: `1.5px solid ${isSelected ? pillColor : '#cbd5e1'}`,
                    padding: '4px 12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    fontSize: '11px',
                    transition: 'all 0.15s ease'
                  }} onClick={() => setActiveServerTab(srv.id)}>
                    {srv.name} [{isBoth ? 'Both' : isCpcb ? 'CPCB' : 'TGPCB'}]
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mappings Table (Modern, Dashboard-Grade Borderless) */}
          <div style={{ flex: 1, minHeight: '250px', overflow: 'auto', borderRadius: '8px', border: `1.5px solid ${theme.border}`, background: '#fff' }}>
            {selectedServer ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: theme.primary }}>
                  <tr>
                    {[`Ch_no`, `Station`, `Var Name`, `Status`, `vname`, `unit`].map(col => (
                      <th key={col} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', color: '#fff', fontWeight: 'bold', borderRight: '1px solid rgba(255,255,255,0.15)', borderBottom: `2px solid ${theme.primary}` }}>{col}</th>
                    ))}
                    {(selectedServer.protocol === 'cpcb' || selectedServer.protocol === 'both') && [`CPCB St. Name`, `CPCB Param`].map(col => (
                      <th key={col} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', color: '#fff', fontWeight: 'bold', borderRight: '1px solid rgba(255,255,255,0.15)', borderBottom: `2px solid ${theme.primary}` }}>{col}</th>
                    ))}
                    {(selectedServer.protocol !== 'cpcb' || selectedServer.protocol === 'both') && [`Device ID`, `Site Name`, `Password`].map(col => (
                      <th key={col} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', color: '#fff', fontWeight: 'bold', borderRight: '1px solid rgba(255,255,255,0.15)', borderBottom: `2px solid ${theme.primary}` }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappings.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', padding: '30px', color: theme.darkLabel, fontWeight: 'bold', backgroundColor: theme.lightRow }}>
                        No parameters found. Add stations, devices, and parameters first.
                      </td>
                    </tr>
                  ) : (
                    mappings.map(param => {
                      const srv = selectedServer;
                      const state = editedMappings[param.parameter_id]?.[srv.id] || {
                        is_active: false, api_id: '', api_name: '', api_password: '', api_vname: '', api_unit: '', cpcb_station_name: '', cpcb_parameter: ''
                      };
                      
                      const handleCellChange = (field, val) => handleMappingChange(param.parameter_id, srv.id, field, val);
                      
                      const cellInputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '4px 6px', border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: 'transparent', fontSize: '12px', color: '#334155', transition: 'all 0.15s ease', outline: 'none' };

                      return (
                        <tr key={param.parameter_id} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background-color 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = theme.lightRow} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                          <td style={{ padding: '6px 12px', fontWeight: 'bold', color: theme.darkLabel, borderRight: '1px solid #f1f5f9' }}>{param.channel_no}</td>
                          <td style={{ padding: '6px 12px', color: '#334155', borderRight: '1px solid #f1f5f9' }}>{param.station_name}</td>
                          <td style={{ padding: '6px 12px', fontWeight: 'bold', color: theme.darkLabel, borderRight: '1px solid #f1f5f9' }}>{param.parameter_name}</td>
                          <td style={{ padding: '6px 12px', borderRight: '1px solid #f1f5f9' }}>
                            <Toggle checked={!!state.is_active} onChange={() => handleCellChange('is_active', !state.is_active)} />
                          </td>
                          <td style={{ padding: '4px 8px', borderRight: '1px solid #f1f5f9' }}>
                            <input style={cellInputStyle} placeholder="vname" value={state.api_vname || ''} onChange={e => handleCellChange('api_vname', e.target.value)} onFocus={e => e.target.style.borderColor = theme.primary} onBlur={e => e.target.style.borderColor = 'transparent'} />
                          </td>
                          <td style={{ padding: '4px 8px', borderRight: '1px solid #f1f5f9' }}>
                            <input style={cellInputStyle} placeholder="unit" value={state.api_unit || ''} onChange={e => handleCellChange('api_unit', e.target.value)} onFocus={e => e.target.style.borderColor = theme.primary} onBlur={e => e.target.style.borderColor = 'transparent'} />
                          </td>

                          {(srv.protocol === 'cpcb' || srv.protocol === 'both') && (
                            <>
                              <td style={{ padding: '4px 8px', borderRight: '1px solid #f1f5f9' }}>
                                <input style={cellInputStyle} placeholder="St. Name" value={state.cpcb_station_name || ''} onChange={e => handleCellChange('cpcb_station_name', e.target.value)} onFocus={e => e.target.style.borderColor = theme.primary} onBlur={e => e.target.style.borderColor = 'transparent'} />
                              </td>
                              <td style={{ padding: '4px 8px', borderRight: '1px solid #f1f5f9' }}>
                                <select style={{...cellInputStyle, cursor: 'pointer'}} value={state.cpcb_parameter || ''} onChange={e => handleCellChange('cpcb_parameter', e.target.value)}>
                                  <option value="">--</option>
                                  {CPCB_PARAMS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                              </td>
                            </>
                          )}

                          {(srv.protocol !== 'cpcb' || srv.protocol === 'both') && (
                            <>
                              <td style={{ padding: '4px 8px', borderRight: '1px solid #f1f5f9' }}>
                                <input style={cellInputStyle} placeholder="ID" value={state.api_id || ''} onChange={e => handleCellChange('api_id', e.target.value)} onFocus={e => e.target.style.borderColor = theme.primary} onBlur={e => e.target.style.borderColor = 'transparent'} />
                              </td>
                              <td style={{ padding: '4px 8px', borderRight: '1px solid #f1f5f9' }}>
                                <input style={cellInputStyle} placeholder="Username" value={state.api_name || ''} onChange={e => handleCellChange('api_name', e.target.value)} onFocus={e => e.target.style.borderColor = theme.primary} onBlur={e => e.target.style.borderColor = 'transparent'} />
                              </td>
                              <td style={{ padding: '4px 8px' }}>
                                <input style={cellInputStyle} placeholder="Password" value={state.api_password || ''} onChange={e => handleCellChange('api_password', e.target.value)} onFocus={e => e.target.style.borderColor = theme.primary} onBlur={e => e.target.style.borderColor = 'transparent'} />
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', color: theme.darkLabel, padding: '30px', backgroundColor: theme.lightRow }}>
                Select a server configuration tab to edit mappings.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.darkLabel, backgroundColor: theme.lightRow, border: `1.5px dashed ${theme.border}`, borderRadius: '12px' }}>
          Enable and save a server config above to display parameter mapping options.
        </div>
      )}

      {/* ── Protocol Reference ── */}
      <div style={{ marginTop: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{
          flex: 1, minWidth: '240px', background: 'rgba(15,118,110,0.03)',
          border: '1px solid rgba(15,118,110,0.1)', borderRadius: '8px', padding: '10px 14px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: theme.primary, marginBottom: '4px' }}>
            🌐 TGPCB / JSON HTTP Push
          </div>
          <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.6 }}>
            <b>Live:</b> 1 min (Live URL) | <b>Delay:</b> 15 min (Delay URL)<br />
            <b>api_id</b> = DeviceID &nbsp;|&nbsp; <b>api_name</b> = Username &nbsp;|&nbsp; <b>api_password</b> = Password
          </div>
        </div>
        <div style={{
          flex: 1, minWidth: '240px', background: 'rgba(234,179,8,0.03)',
          border: '1px solid rgba(234,179,8,0.15)', borderRadius: '8px', padding: '10px 14px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#b45309', marginBottom: '4px' }}>
            📄 CPCB Annexure-I CSV File
          </div>
          <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.6 }}>
            <b>Written:</b> 15 min averages | <b>Max lines:</b> 97 (FIFO rotation)<br />
            <b>api_id</b> = Station Name &nbsp;|&nbsp; <b>CPCB PARAM</b> = CO / SO2 / PM10 …
          </div>
        </div>
      </div>

      {/* ── Test Response Modal ── */}
      {testResultModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          backdropFilter: 'blur(2px)'
        }}>
          <div style={{
            background: '#fff', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '80vh',
            display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: testResultModal.success ? '#f0fdf4' : '#fef2f2'
            }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: testResultModal.success ? '#166534' : '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {testResultModal.success ? '✅ Push Successful' : '❌ Push Failed'}
                <span style={{
                  fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                  backgroundColor: testResultModal.success ? '#dcfce7' : '#fee2e2',
                  color: testResultModal.success ? '#15803d' : '#b91c1c'
                }}>HTTP {testResultModal.status}</span>
              </h3>
              <button onClick={() => setTestResultModal(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>
            
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, backgroundColor: '#f8fafc' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Server Response</div>
              <pre style={{
                margin: 0, padding: '12px', backgroundColor: '#1e293b', color: '#e2e8f0', borderRadius: '8px',
                fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'Consolas, monospace'
              }}>
                {testResultModal.response || '<Empty Response>'}
              </pre>
            </div>
            
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#fff' }}>
              <button onClick={() => setTestResultModal(null)} style={{
                padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#e2e8f0', color: '#475569', fontWeight: '600', cursor: 'pointer'
              }}>Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};