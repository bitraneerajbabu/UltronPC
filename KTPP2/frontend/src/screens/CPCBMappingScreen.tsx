import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { T, BTN, INP, GLASS_CARD } from '../theme';

interface Mapping {
  id: number;
  internal_parameter: string;
  cpcb_parameter: string;
  unit: string;
  conversion_factor: number;
  enabled: boolean;
}

export const CPCBMappingScreen = () => {
  const { API_BASE, showToast, authFetch } = useContext(AppContext);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Mapping>>({ internal_parameter: '', cpcb_parameter: '', unit: 'ppm', conversion_factor: 1.0, enabled: true });

  const loadMappings = async () => {
    try {
      const res = await authFetch(`${API_BASE}/cpcb/mappings`);
      if (res.ok) setMappings(await res.json());
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { loadMappings(); }, []);

  const handleSave = async () => {
    if (!form.internal_parameter || !form.cpcb_parameter) { showToast('Internal and CPCB parameters required', 'error'); return; }
    const isNew = editingId === -1;
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew ? `${API_BASE}/cpcb/mappings` : `${API_BASE}/cpcb/mappings/${editingId}`;
    try {
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        showToast(isNew ? 'Mapping created' : 'Mapping updated');
        setEditingId(null);
        setForm({ internal_parameter: '', cpcb_parameter: '', unit: 'ppm', conversion_factor: 1.0, enabled: true });
        await loadMappings();
      } else {
        const d = await res.json();
        showToast(d.detail || 'Save failed', 'error');
      }
    } catch { showToast('Save failed', 'error'); }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await authFetch(`${API_BASE}/cpcb/mappings/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Mapping deleted'); await loadMappings(); }
      else showToast('Delete failed', 'error');
    } catch { showToast('Delete failed', 'error'); }
  };

  const startEdit = (m: Mapping | null) => {
    if (m) { setEditingId(m.id); setForm({ ...m }); }
    else { setEditingId(-1); setForm({ internal_parameter: '', cpcb_parameter: '', unit: 'ppm', conversion_factor: 1.0, enabled: true }); }
  };

  if (loading) return <div className="screen active"><p>Loading...</p></div>;

  return (
    <div className="screen active" id="cpcbMappingScreen">
      <div className="card">
        <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>CPCB Parameter Mapping</span>
          <button style={BTN.primary} onClick={() => startEdit(null)}>+ Add Mapping</button>
        </div>

        {editingId !== null && (
          <div style={{ ...GLASS_CARD, padding: '16px', marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '3px' }}>Internal Parameter</label>
              <input style={INP} value={form.internal_parameter || ''} onChange={e => setForm(p => ({ ...p, internal_parameter: e.target.value }))} placeholder="e.g. CO" />
            </div>
            <div>
              <label style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '3px' }}>CPCB Parameter</label>
              <input style={INP} value={form.cpcb_parameter || ''} onChange={e => setForm(p => ({ ...p, cpcb_parameter: e.target.value }))} placeholder="e.g. CO" />
            </div>
            <div>
              <label style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '3px' }}>Unit</label>
              <input style={INP} value={form.unit || ''} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '3px' }}>Conversion Factor</label>
              <input style={INP} type="number" step="0.0001" value={form.conversion_factor ?? 1.0} onChange={e => setForm(p => ({ ...p, conversion_factor: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <label style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, display: 'block', marginBottom: '3px' }}>Enabled</label>
              <input type="checkbox" checked={form.enabled ?? true} onChange={e => setForm(p => ({ ...p, enabled: e.target.checked }))} style={{ marginTop: '8px', cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button style={BTN.primary} onClick={handleSave}>Save</button>
              <button style={BTN.ghost} onClick={() => setEditingId(null)}>Cancel</button>
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
              {mappings.map(m => (
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
                      <button style={BTN.ghost} onClick={() => startEdit(m)}>Edit</button>
                      <button style={BTN.danger} onClick={() => handleDelete(m.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
              {mappings.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: T.textFaint }}>No mappings configured. Click "+ Add Mapping" to create one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
