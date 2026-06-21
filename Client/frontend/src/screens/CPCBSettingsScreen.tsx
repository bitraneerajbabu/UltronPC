import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { T, BTN, INP, GLASS_CARD } from '../theme';

interface StationConfig {
  id: number;
  station_id: number;
  station_name: string;
  station_code: string | null;
  export_enabled: boolean;
  export_path: string;
  cpcb_enabled: boolean;
  timezone: string;
  retention_count: number;
}

export const CPCBSettingsScreen = () => {
  const { API_BASE, showToast, authFetch, stations } = useContext(AppContext);
  const [configs, setConfigs] = useState<StationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<StationConfig>>({
    station_name: '',
    station_code: '',
    export_path: 'C:\\Data',
    export_enabled: true,
    cpcb_enabled: true,
    timezone: 'Asia/Kolkata',
    retention_count: 97,
  });

  const loadConfigs = async () => {
    try {
      const res = await authFetch(`${API_BASE}/cpcb/config`);
      if (res.ok) {
        const data = await res.json();
        setConfigs(data);
      }
    } catch { } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfigs(); }, []);

  const handleSave = async (stationId: number) => {
    const payload = { ...form, station_id: stationId };
    const isNew = !configs.find(c => c.station_id === stationId);
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew ? `${API_BASE}/cpcb/config` : `${API_BASE}/cpcb/config/${stationId}`;
    try {
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast('CPCB station config saved');
        setEditingId(null);
        await loadConfigs();
      } else {
        const data = await res.json();
        showToast(data.detail || 'Save failed', 'error');
      }
    } catch { showToast('Save failed', 'error'); }
  };

  if (loading) return <div className="screen active"><p>Loading...</p></div>;

  return (
    <div className="screen active" id="cpcbSettingsScreen">
      <div className="card">
        <div className="section-title">CPCB Station Configuration</div>
        <p style={{ fontSize: '12px', color: T.textFaint, marginBottom: '16px' }}>
          Configure station-level CPCB CAAQM legacy file export settings.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {stations.map(station => {
            const config = configs.find(c => c.station_id === station.id);
            const isEditing = editingId === station.id;
            const f = isEditing ? form : (config || { station_name: station.name, export_path: 'C:\\Data', retention_count: 97, export_enabled: true, cpcb_enabled: true, timezone: 'Asia/Kolkata' });

            return (
              <div key={station.id} style={{ ...GLASS_CARD, padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: T.primary }}>{station.name}</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!config ? (
                      <button style={BTN.primary} onClick={() => { setEditingId(station.id); setForm({ station_name: station.name, export_path: 'C:\\Data', retention_count: 97, export_enabled: true, cpcb_enabled: true, timezone: 'Asia/Kolkata' }); }}>Add Config</button>
                    ) : isEditing ? (
                      <>
                        <button style={BTN.primary} onClick={() => handleSave(station.id)}>Save</button>
                        <button style={BTN.ghost} onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <button style={BTN.ghost} onClick={() => { setEditingId(station.id); setForm({ ...config }); }}>Edit</button>
                    )}
                  </div>
                </div>

                {(isEditing || config) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '4px' }}>Station Name (CPCB)</label>
                      <input style={INP} value={isEditing ? (f.station_name || '') : config!.station_name} onChange={e => setForm(p => ({ ...p, station_name: e.target.value }))} disabled={!isEditing} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '4px' }}>Station Code</label>
                      <input style={INP} value={isEditing ? (f.station_code || '') : (config?.station_code || '')} onChange={e => setForm(p => ({ ...p, station_code: e.target.value }))} disabled={!isEditing} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '4px' }}>Export Path</label>
                      <input style={INP} value={isEditing ? (f.export_path || '') : config!.export_path} onChange={e => setForm(p => ({ ...p, export_path: e.target.value }))} disabled={!isEditing} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '4px' }}>Retention Count</label>
                      <input style={INP} type="number" value={isEditing ? (f.retention_count ?? 97) : config!.retention_count} onChange={e => setForm(p => ({ ...p, retention_count: parseInt(e.target.value) || 97 }))} disabled={!isEditing} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '4px' }}>Timezone</label>
                      <input style={INP} value={isEditing ? (f.timezone || '') : config!.timezone} onChange={e => setForm(p => ({ ...p, timezone: e.target.value }))} disabled={!isEditing} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', paddingBottom: '4px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: T.textLabel, cursor: 'pointer' }}>
                        <input type="checkbox" checked={isEditing ? (f.export_enabled ?? true) : config!.export_enabled} onChange={e => setForm(p => ({ ...p, export_enabled: e.target.checked }))} disabled={!isEditing} />
                        Export Enabled
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: T.textLabel, cursor: 'pointer' }}>
                        <input type="checkbox" checked={isEditing ? (f.cpcb_enabled ?? true) : config!.cpcb_enabled} onChange={e => setForm(p => ({ ...p, cpcb_enabled: e.target.checked }))} disabled={!isEditing} />
                        CPCB Enabled
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
