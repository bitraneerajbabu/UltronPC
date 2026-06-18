import React, { useContext, useState, useEffect, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { T } from '../theme';

// ─── Theme Configuration ─────────────────────────────────────────────
const theme = {
  bg: '#f1f5f9',             // Soft Blue-Gray Background
  primary: '#0ea5e9',        // Ocean Blue Action
  darkLabel: '#0f172a',      // Slate 900
  border: '#cbd5e1',         // Slate 300
  lightRow: '#f8fafc',       // Slate 50
  modalBg: 'rgba(15,23,42,0.65)' // Dark Semi-Transparent
};

const DEFAULT_PARAM = {
  name: '', tag_name: '', description: '', unit: 'ppm', device_id: '',
  input_type: 'modbus_tcp', register_type: 'input_reg', register_address: 40001,
  register_count: 2, data_type: 'float32', byte_order: 'big',
  scale_factor: 1.0, offset: 0.0, min_valid: 0.0, max_valid: 1000.0,
  alarm_low: 0.0, alarm_high: 80.0, alarm_enabled: true, display_order: 1, is_active: true,
  host: '192.168.1.101', port: '502', slave_id: '1',
  csv_mode: 'fixed', csv_path: '', csv_folder: '', csv_filename_pattern: '{YYYYMMDD}.csv',
  csv_delimiter: ',', csv_timestamp_col: 0,
};

// ─── Mini SVG Icons ───────────────────────────────────────────────────────────
const Plus = ({ s = 14 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const Trash = ({ s = 14 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6M9 6V4h6v2" /></svg>;
const Edit = ({ s = 14 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const X = ({ s = 16 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const SignalTest = ({ s = 14 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const genTag = (name) => !name ? '' : name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').substring(0, 50);

const renderCsvPattern = (pattern) => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = p(d.getMonth() + 1);
  const dd = p(d.getDate());
  return (pattern || '{YYYYMMDD}.csv')
    .replaceAll('{YYYYMMDD}', `${yyyy}${mm}${dd}`)
    .replaceAll('{YYYY-MM-DD}', `${yyyy}-${mm}-${dd}`)
    .replaceAll('{DD-MM-YYYY}', `${dd}-${mm}-${yyyy}`)
    .replaceAll('{DDMMYYYY}', `${dd}${mm}${yyyy}`)
    .replaceAll('{date}', `${yyyy}${mm}${dd}`);
};

const getUiDataType = (dt, bo) => {
  if (dt === 'float32') {
    if (bo === 'big_swap') return 'Byte Swapped Float';
    if (bo === 'little') return 'Word Swapped Float';
    if (bo === 'little_swap') return 'Byte & Word Swapped Float';
    return 'Float point';
  }
  if (dt === 'uint16') return 'Integer';
  if (dt === 'int16') return 'Signed Integer';
  if (dt === 'int32') {
    if (bo === 'big_swap') return 'Byte Swapped Long';
    if (bo === 'little') return 'Word Swapped Long';
    if (bo === 'little_swap') return 'Byte & Word Swapped Long';
    return 'Long Integer';
  }
  if (dt === 'int64') {
    if (bo === 'big_swap') return 'Byte Swapped Double';
    if (bo === 'little') return 'Word Swapped Double';
    if (bo === 'little_swap') return 'Byte & Word Swapped Double';
    return 'Double Float';
  }
  return 'None';
};

const setUiDataType = (label) => {
  const map = {
    'Float point': { data_type: 'float32', byte_order: 'big' },
    'Byte Swapped Float': { data_type: 'float32', byte_order: 'big_swap' },
    'Word Swapped Float': { data_type: 'float32', byte_order: 'little' },
    'Byte & Word Swapped Float': { data_type: 'float32', byte_order: 'little_swap' },
    'Integer': { data_type: 'uint16', byte_order: 'big' },
    'Signed Integer': { data_type: 'int16', byte_order: 'big' },
    'Long Integer': { data_type: 'int32', byte_order: 'big' },
    'Byte Swapped Long': { data_type: 'int32', byte_order: 'big_swap' },
    'Word Swapped Long': { data_type: 'int32', byte_order: 'little' },
    'Byte & Word Swapped Long': { data_type: 'int32', byte_order: 'little_swap' },
    'Double Float': { data_type: 'int64', byte_order: 'big' },
    'Byte Swapped Double': { data_type: 'int64', byte_order: 'big_swap' },
    'Word Swapped Double': { data_type: 'int64', byte_order: 'little' },
    'Byte & Word Swapped Double': { data_type: 'int64', byte_order: 'little_swap' },
    // Backwards compatibility
    'Swaped Float': { data_type: 'float32', byte_order: 'big_swap' },
    'Swaped Long': { data_type: 'int32', byte_order: 'big_swap' },
    'Swaped Double': { data_type: 'int64', byte_order: 'big_swap' },
  };
  return map[label] || { data_type: 'float32', byte_order: 'big' };
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const DevicesScreen = () => {
  const { parameters, devices, addParameter, editParameter, deleteParameter, addDevice, editDevice, showToast, testParameterConnection, hasLoadedOnce } = useContext(AppContext);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [form, setForm] = useState<any>(DEFAULT_PARAM);
  const [saving, setSaving] = useState(false);
  const [testingParamId, setTestingParamId] = useState(null);

  const handleTestParameter = async (id) => {
    if (testingParamId) return;
    setTestingParamId(id);
    showToast('Testing analyser connection and reading value...', 'info');
    await testParameterConnection(id);
    setTestingParamId(null);
  };

  // Auto-resolve global gateway device
  const globalDevice = useMemo(() => {
    let gd = devices.find(d => d.name === 'Global Gateway');
    if (!gd && devices.length > 0) gd = devices[0];
    return gd;
  }, [devices]);

  useEffect(() => {
    if (hasLoadedOnce && devices && devices.length === 0) {
      // Auto-create a hidden device to satisfy DB requirements
      addDevice({ name: 'Global Gateway', is_active: true, protocol: 'modbus_tcp' });
    }
  }, [devices, hasLoadedOnce, addDevice]);

  const openNew = () => {
    setForm({
      ...DEFAULT_PARAM,
      display_order: parameters.length + 1,
      input_type: globalDevice?.protocol || 'modbus_tcp',
      host: globalDevice?.host || DEFAULT_PARAM.host,
      port: globalDevice?.port || DEFAULT_PARAM.port,
      slave_id: globalDevice?.slave_id || DEFAULT_PARAM.slave_id,
      csv_mode: globalDevice?.csv_folder ? 'daily' : 'fixed',
      csv_path: globalDevice?.csv_path || '',
      csv_folder: globalDevice?.csv_folder || '',
      csv_filename_pattern: globalDevice?.csv_filename_pattern || '{YYYYMMDD}.csv',
      csv_delimiter: globalDevice?.csv_delimiter || ',',
      csv_timestamp_col: globalDevice?.csv_timestamp_col ?? 0,
    });
    setEditingIndex(null);
    setModalOpen(true);
  };

  const openEdit = (index) => {
    const p = parameters[index];
    const dev = devices.find(d => d.id === p.device_id);
    setForm({
      ...DEFAULT_PARAM,
      ...p,
      host: p.host || dev?.host || '',
      port: p.port || dev?.port || '',
      slave_id: p.slave_id || dev?.slave_id || '',
      input_type: dev?.protocol || 'modbus_tcp',
      csv_mode: dev?.csv_folder ? 'daily' : 'fixed',
      csv_path: dev?.csv_path || '',
      csv_folder: dev?.csv_folder || '',
      csv_filename_pattern: dev?.csv_filename_pattern || '{YYYYMMDD}.csv',
      csv_delimiter: dev?.csv_delimiter || ',',
      csv_timestamp_col: dev?.csv_timestamp_col ?? 0,
    });
    setEditingIndex(index);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm(DEFAULT_PARAM);
  };

  const handleSave = async () => {
    if (!form.name) return showToast('Monitored Sensor name is required.', 'error');
    if (!globalDevice) return showToast('Initializing global gateway, please wait...', 'error');
    if (form.input_type === 'csv' && form.csv_mode === 'fixed' && !form.csv_path?.trim()) {
      return showToast('CSV fixed file path is required.', 'error');
    }
    if (form.input_type === 'csv' && form.csv_mode === 'daily' && !form.csv_folder?.trim()) {
      return showToast('CSV daily folder is required.', 'error');
    }

    setSaving(true);
    try {
      const deviceProtocol = form.input_type === 'analog' ? 'modbus_tcp' : form.input_type;
      const devicePayload = {
        protocol: deviceProtocol,
        host: deviceProtocol === 'csv' ? null : (form.host || null),
        port: deviceProtocol === 'csv' ? null : (form.port || null),
        slave_id: form.slave_id || 1,
        csv_path: deviceProtocol === 'csv' && form.csv_mode === 'fixed' ? form.csv_path : null,
        csv_folder: deviceProtocol === 'csv' && form.csv_mode === 'daily' ? form.csv_folder : null,
        csv_filename_pattern: deviceProtocol === 'csv' && form.csv_mode === 'daily'
          ? (form.csv_filename_pattern || '{YYYYMMDD}.csv')
          : null,
        csv_delimiter: deviceProtocol === 'csv' ? (form.csv_delimiter || ',') : ',',
        csv_timestamp_col: deviceProtocol === 'csv' ? (form.csv_timestamp_col ?? 0) : null,
      };
      const deviceSaved = await editDevice(globalDevice.id, devicePayload);
      if (!deviceSaved) return;

      const payload = {
        ...form,
        tag_name: genTag(form.name),
        device_id: globalDevice.id,
        // Forcing override properties since we flattened it
        overrideConnection: true,
      };

      let success = false;
      if (editingIndex !== null) {
        success = await editParameter(payload.id, payload);
      } else {
        success = await addParameter(payload);
      }
      if (success) closeModal();
    } catch (err) {
      console.error('Failed to save parameter config:', err);
      showToast('Communication error: Failed to save configuration.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : (type === 'number' && value !== '' ? Number(value) : value) }));
  };

  const handleDataType = (e) => {
    setForm(p => ({ ...p, ...setUiDataType(e.target.value) }));
  };

  // Reusable styling
  const inpClass = "w-full bg-white border border-slate-300 px-3 py-2 rounded text-[13px] font-bold text-slate-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all font-mono";
  const labelClass = "block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1";

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.bg, fontFamily: T.fontBase }}>

      {/* ─── Top Header ───────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${theme.border}`, padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: theme.darkLabel, letterSpacing: '-0.03em' }}>
            UltrON
          </h1>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', letterSpacing: '0.1em' }}>
            POWERED BY SUNSHINE TECHNOLOGIES
          </div>
        </div>
        <button onClick={openNew} style={{
          background: theme.primary, color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 18px',
          fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
          boxShadow: '0 4px 12px rgba(14,165,233,0.3)', transition: 'all 0.15s'
        }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <Plus /> Add Gateway Rule
        </button>
      </div>

      {/* ─── Main Workspace ────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>

        <div style={{ background: '#fff', border: `1px solid ${theme.border}`, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>

          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${theme.border}`, background: theme.lightRow }}>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: theme.darkLabel, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Channel Configuration Directory
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
              Live controller registry tracking dynamic settings and telemetry routes.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#fff', borderBottom: `2px solid ${theme.border}` }}>
                  {['CH ID', 'PARAMETER', 'UNIT', 'PROTOCOL', 'IP / HOST', 'SLAVE', 'ADDRESS', 'STATUS', ''].map(h => (
                    <th key={h} style={{ padding: '14px 16px', fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parameters.map((p, i) => {
                  const dev = devices.find(d => d.id === p.device_id);
                  const host = dev?.protocol === 'csv'
                    ? (dev.csv_folder ? `${dev.csv_folder}\\${dev.csv_filename_pattern || '{YYYYMMDD}.csv'}` : (dev.csv_path || 'CSV not set'))
                    : (p.host || (dev ? dev.host : '—'));
                  const port = p.port || (dev ? dev.port : '—');
                  const protoStr = dev ? dev.protocol : 'Unknown';
                  const protoDisplay = protoStr === 'modbus_tcp' ? 'Modbus TCP' : protoStr === 'modbus_rtu' ? 'Modbus RTU' : protoStr === 'csv' ? 'CSV File' : protoStr;
                  const slave = p.slave_id || (dev ? dev.slave_id : '—');

                  return (
                    <tr key={p.id || i} style={{ borderBottom: `1px solid ${theme.lightRow}`, background: p.is_active ? '#fff' : '#f8fafc' }} className="hover:bg-slate-50 transition-colors">
                      <td style={{ padding: '14px 16px', fontWeight: '800', color: theme.darkLabel }}>{p.display_order}</td>
                      <td style={{ padding: '14px 16px', fontWeight: '800', color: theme.primary }}>{p.name}</td>
                      <td style={{ padding: '14px 16px', fontWeight: '600', color: '#64748b' }}>{p.unit}</td>
                      <td style={{ padding: '14px 16px', fontWeight: '600', color: '#475569' }}>{protoDisplay}</td>
                      <td style={{ padding: '14px 16px', fontFamily: T.fontMono, fontSize: '12px', color: '#64748b' }}>
                        {protoStr !== 'csv' && host !== '—' && port !== '—' ? `${host}:${port}` : host}
                      </td>
                      <td style={{ padding: '14px 16px', fontFamily: T.fontMono, fontSize: '12px', color: '#64748b' }}>{slave}</td>
                      <td style={{ padding: '14px 16px', fontFamily: T.fontMono, fontSize: '12px', color: '#64748b' }}>{p.register_address}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          fontSize: '10px', fontWeight: '800', padding: '4px 10px', borderRadius: '99px', textTransform: 'uppercase',
                          background: p.is_active ? '#dcfce7' : '#fee2e2', color: p.is_active ? '#166534' : '#991b1b'
                        }}>
                          {p.is_active ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            onClick={() => handleTestParameter(p.id)}
                            title="Test connection and read value from analyser"
                            disabled={testingParamId === p.id}
                            style={{ background: 'transparent', border: 'none', color: '#10b981', cursor: testingParamId === p.id ? 'not-allowed' : 'pointer', opacity: testingParamId === p.id ? 0.5 : 1 }}
                          >
                            <SignalTest />
                          </button>
                          <button onClick={() => openEdit(i)} title="Edit Configuration" style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}><Edit /></button>
                          <button onClick={() => deleteParameter(p.id)} title="Delete Parameter Mapping" style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {parameters.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px', fontWeight: '600' }}>
                      No gateway rules defined. Click "Add Gateway Rule" to map telemetry.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>

      {/* ─── Modal Overlay ─────────────────────────────────────── */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.75)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.2s ease-out' }}>

          <div className="gateway-modal" style={{ width: '100%', maxWidth: '720px', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh', position: 'relative' }}>

            {/* Modal Header */}
            <div style={{ padding: '24px 30px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#a7f3d0', boxShadow: '0 0 12px #a7f3d0' }} />
                  Channel Telemetry Gateway
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#d1fae5', fontWeight: '600' }}>
                  Configure RTU/PLC physical gateway rules.
                </p>
              </div>
              <button type="button" onClick={closeModal} className="modal-close-btn" aria-label="Close" title="Close"><X s={20} /></button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="modal-body-scroll" style={{ padding: '30px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px', background: '#ffffff' }}>

              {/* Row 1 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <label className="gw-label">CHANNEL ID</label>
                  <input type="number" className="gw-input" name="display_order" value={form.display_order} onChange={handleChange} />
                </div>
                <div>
                  <label className="gw-label">CHANNEL STATUS</label>
                  <select className="gw-input" value={form.is_active ? 'Enabled' : 'Disabled'} onChange={(e) => setForm(p => ({ ...p, is_active: e.target.value === 'Enabled' }))}>
                    <option value="Enabled">Enabled</option>
                    <option value="Disabled">Disabled</option>
                  </select>
                </div>
              </div>

              {/* Row 2 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <label htmlFor="input_type" className="gw-label">SIGNAL PROTOCOL</label>
                  <select id="input_type" className="gw-input" name="input_type" value={form.input_type} onChange={handleChange}>
                    <option value="modbus_tcp">Modbus TCP</option>
                    <option value="modbus_rtu">Modbus RTU</option>
                    <option value="csv">CSV File</option>
                    <option value="analog">Analog</option>
                  </select>
                </div>
                <div>
                  <label className="gw-label">{form.input_type === 'csv' ? 'CSV READ MODE' : 'NETWORK IP HOST:PORT'}</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {form.input_type === 'csv' ? (
                      <select className="gw-input" name="csv_mode" value={form.csv_mode || 'fixed'} onChange={handleChange}>
                        <option value="fixed">Fixed file</option>
                        <option value="daily">Daily rotating file</option>
                      </select>
                    ) : (
                      <>
                        <input type="text" className="gw-input" style={{ flex: 2 }} name="host" value={form.host} onChange={handleChange} placeholder="192.168.1.101" />
                        <input type="text" className="gw-input" style={{ flex: 1 }} name="port" value={form.port} onChange={handleChange} placeholder="502" />
                      </>
                    )}
                  </div>
                </div>
              </div>

              {form.input_type === 'csv' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', padding: '18px', border: '1px solid #bae6fd', borderRadius: '8px', background: '#f0f9ff' }}>
                  {form.csv_mode === 'daily' ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label className="gw-label">CSV DAILY FOLDER</label>
                          <input type="text" className="gw-input" name="csv_folder" value={form.csv_folder || ''} onChange={handleChange} placeholder="C:\\Data\\Station1" />
                        </div>
                        <div>
                          <label className="gw-label">FILENAME DATE PATTERN</label>
                          <input type="text" className="gw-input" name="csv_filename_pattern" value={form.csv_filename_pattern || ''} onChange={handleChange} placeholder="{YYYYMMDD}.csv" />
                        </div>
                      </div>
                      <div className="gw-hint">
                        Today's file: {(form.csv_folder || 'C:\\Data').replace(/[\\/]$/, '')}\\{renderCsvPattern(form.csv_filename_pattern)}
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="gw-label">CSV FIXED FILE PATH</label>
                      <input type="text" className="gw-input" name="csv_path" value={form.csv_path || ''} onChange={handleChange} placeholder="C:\\Data\\readings.csv" />
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label className="gw-label">DELIMITER</label>
                      <input type="text" className="gw-input" name="csv_delimiter" value={form.csv_delimiter || ','} onChange={handleChange} placeholder="," maxLength={5} />
                    </div>
                    <div>
                      <label className="gw-label">TIMESTAMP COLUMN</label>
                      <input type="number" className="gw-input" name="csv_timestamp_col" value={form.csv_timestamp_col ?? 0} onChange={handleChange} min="0" />
                    </div>
                  </div>
                  <div className="gw-hint">Column map: A=0, B=1, C=2, D=3, E=4. Header row is skipped; latest data row is read each poll.</div>
                </div>
              )}

              {/* Row 3 */}
              <div style={{ display: form.input_type === 'csv' ? 'none' : 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <label className="gw-label">DEVICE INDEX / SLAVE ID</label>
                  <input type="number" className="gw-input" name="slave_id" value={form.slave_id} onChange={handleChange} />
                </div>
                <div>
                  <label className="gw-label">MODBUS FUNCTION CODE</label>
                  <select className="gw-input" name="register_type" value={form.register_type} onChange={handleChange}>
                    <option value="input_reg">04 INPUT REG</option>
                    <option value="holding">03 HOLDING REG</option>
                  </select>
                </div>
              </div>

              {/* Row 4 */}
              <div style={{ display: form.input_type === 'csv' ? 'none' : 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                <div>
                  <label className="gw-label">REGISTER DATA TYPE</label>
                  <select className="gw-input" value={getUiDataType(form.data_type, form.byte_order)} onChange={handleDataType}>
                    <option value="Float point">Float point</option>
                    <option value="Byte Swapped Float">Byte Swapped Float</option>
                    <option value="Word Swapped Float">Word Swapped Float</option>
                    <option value="Byte & Word Swapped Float">Byte & Word Swapped Float</option>
                    <option value="Integer">Integer</option>
                    <option value="Signed Integer">Signed Integer</option>
                    <option value="Long Integer">Long Integer</option>
                    <option value="Byte Swapped Long">Byte Swapped Long</option>
                    <option value="Word Swapped Long">Word Swapped Long</option>
                    <option value="Byte & Word Swapped Long">Byte & Word Swapped Long</option>
                    <option value="Double Float">Double Float</option>
                    <option value="Byte Swapped Double">Byte Swapped Double</option>
                    <option value="Word Swapped Double">Word Swapped Double</option>
                    <option value="Byte & Word Swapped Double">Byte & Word Swapped Double</option>
                  </select>
                </div>
              </div>

              {/* Row 5 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <label className="gw-label">{form.input_type === 'csv' ? 'CSV VALUE COLUMN INDEX' : 'ANALOG ZERO / START ADDR.'}</label>
                  <input type="number" className="gw-input" name="register_address" value={form.register_address} onChange={handleChange} />
                </div>
                <div>
                  <label className="gw-label">{form.input_type === 'csv' ? 'CSV REGISTER COUNT' : 'ANALOG SPAN / REG COUNT'}</label>
                  <input type="number" className="gw-input" name="register_count" value={form.register_count} onChange={handleChange} />
                </div>
              </div>

              {/* Row 6 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <label className="gw-label">MULTIPLIER / SCALING GAIN</label>
                  <input type="number" step="0.001" className="gw-input" name="scale_factor" value={form.scale_factor} onChange={handleChange} />
                </div>
                <div>
                  <label className="gw-label">CALIBRATION OFFSET</label>
                  <input type="number" step="0.001" className="gw-input" name="offset" value={form.offset} onChange={handleChange} />
                </div>
              </div>

              {/* Row 6.1 (Parameter Range) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <label className="gw-label">VALID RANGE MIN (PARAMETER RANGE ZERO)</label>
                  <input type="number" step="any" className="gw-input" name="min_valid" value={form.min_valid ?? ''} onChange={handleChange} placeholder="e.g. 0.0" />
                </div>
                <div>
                  <label className="gw-label">VALID RANGE MAX (PARAMETER RANGE SPAN)</label>
                  <input type="number" step="any" className="gw-input" name="max_valid" value={form.max_valid ?? ''} onChange={handleChange} placeholder="e.g. 1000.0" />
                </div>
              </div>

              {/* Row 6.2 (Warning Limits) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
                <div>
                  <label className="gw-label">WARNING LIMIT (LOW)</label>
                  <input type="number" step="any" className="gw-input" name="alarm_low" value={form.alarm_low ?? ''} onChange={handleChange} placeholder="e.g. 0.0" />
                </div>
                <div>
                  <label className="gw-label">WARNING LIMIT (HIGH)</label>
                  <input type="number" step="any" className="gw-input" name="alarm_high" value={form.alarm_high ?? ''} onChange={handleChange} placeholder="e.g. 80.0" />
                </div>
                <div>
                  <label className="gw-label">WARNING ALARM ENABLED</label>
                  <select className="gw-input" name="alarm_enabled" value={form.alarm_enabled ? 'Enabled' : 'Disabled'} onChange={(e) => setForm(p => ({ ...p, alarm_enabled: e.target.value === 'Enabled' }))}>
                    <option value="Enabled">Enabled</option>
                    <option value="Disabled">Disabled</option>
                  </select>
                </div>
              </div>

              {/* Row 7 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                <div>
                  <label className="gw-label">STATION LOCATION NAME</label>
                  <input type="text" className="gw-input" name="description" value={form.description} onChange={handleChange} placeholder="e.g. Berger Stack Alpha" />
                </div>
              </div>

              {/* Row 8 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', paddingBottom: '10px' }}>
                <div>
                  <label className="gw-label">MONITORED SENSOR</label>
                  <input type="text" className="gw-input" name="name" value={form.name} onChange={handleChange} placeholder="SO2" />
                </div>
                <div>
                  <label className="gw-label">ENG. UNIT</label>
                  <input type="text" className="gw-input" name="unit" value={form.unit} onChange={handleChange} placeholder="ppm" />
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ padding: '20px 30px', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '16px', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={closeModal} className="gw-cancel-btn">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="gw-submit-btn">
                {saving ? '⏳ Saving...' : 'Commit Config'}
              </button>
            </div>

          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; backdrop-filter: blur(0px); } to { opacity: 1; backdrop-filter: blur(8px); } }
        @keyframes modalSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        
        .gateway-modal {
          animation: modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(16, 185, 129, 0.2);
        }

        .modal-body-scroll::-webkit-scrollbar { width: 8px; }
        .modal-body-scroll::-webkit-scrollbar-track { background: #f8fafc; }
        .modal-body-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .modal-body-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

        .modal-close-btn {
          background: rgba(255,255,255,0.2);
          border: none;
          color: #fff;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .modal-close-btn:hover { background: rgba(255,255,255,0.3); transform: scale(1.05); }

        .gw-label {
          display: block;
          font-size: 11px;
          font-weight: 800;
          color: #059669;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 8px;
        }

        .gw-input {
          width: 100%;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          padding: 12px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          outline: none;
          transition: all 0.2s;
          font-family: ui-monospace, Consolas, monospace;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
        }
        .gw-input::placeholder { color: #94a3b8; }
        .gw-input:focus { border-color: #10b981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2), inset 0 2px 4px rgba(0,0,0,0.02); background: #ffffff; }

        .gw-hint {
          color: #0369a1;
          font-size: 12px;
          font-weight: 700;
          font-family: ui-monospace, Consolas, monospace;
          line-height: 1.5;
          word-break: break-word;
        }

        .gw-cancel-btn {
          background: #ffffff;
          color: #059669;
          border: 1px solid #10b981;
          border-radius: 8px;
          padding: 12px 24px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s;
        }
        .gw-cancel-btn:hover { background: #f0fdf4; }

        .gw-submit-btn {
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 12px 28px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
          transition: all 0.2s;
        }
        .gw-submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4); background: linear-gradient(135deg, #34d399, #10b981); }
        .gw-submit-btn:active:not(:disabled) { transform: translateY(0); }
        .gw-submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }
      `}</style>
    </div>
  );
};
