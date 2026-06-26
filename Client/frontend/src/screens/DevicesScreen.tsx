import React, { useContext, useState, useEffect, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { T } from '../theme';

const DATA_TYPES = [
  'Integer', 'Signed Integer', 'Long Integer', 'Swaped Long',
  'Float point', 'Swaped Float', 'Double Float', 'Swaped Double',
];

const DT_MAP = {
  'Integer':        { data_type: 'uint16',  byte_order: 'big' },
  'Signed Integer': { data_type: 'int16',   byte_order: 'big' },
  'Long Integer':   { data_type: 'int32',   byte_order: 'big' },
  'Swaped Long':    { data_type: 'int32',   byte_order: 'big_swap' },
  'Float point':    { data_type: 'float32', byte_order: 'big' },
  'Swaped Float':   { data_type: 'float32', byte_order: 'big_swap' },
  'Double Float':   { data_type: 'int64',   byte_order: 'big' },
  'Swaped Double':  { data_type: 'int64',   byte_order: 'big_swap' },
};

const revMap = Object.fromEntries(
  Object.entries(DT_MAP).map(([label, v]) => [v.data_type + '|' + v.byte_order, label])
);

const getDataTypeLabel = (dt, bo) => revMap[dt + '|' + bo] || 'Float point';

const DEFAULT_PARAM = {
  name: '', tag_name: '', description: '', unit: 'ppm', device_id: '',
  input_type: 'modbus_tcp', register_type: 'input_reg', register_address: 40001,
  register_count: 2, data_type: 'float32', byte_order: 'big',
  scale_factor: 1.0, offset: 0.0, min_valid: 0.0, max_valid: 1000.0,
  alarm_low: 0.0, alarm_high: 80.0, alarm_enabled: true, display_order: 1, is_active: true,
  host: '192.168.1.101', port: '502', slave_id: '1',
  serial_port: 'COM1', baud_rate: 9600, data_bits: 8, parity: 'N', stop_bits: 1,
  csv_mode: 'fixed', csv_path: '', csv_folder: '', csv_filename_pattern: '{YYYYMMDD}.csv',
  csv_delimiter: ',', csv_timestamp_col: 0,
  request_hex: '', response_delimiter: 'newline',
};

const Plus = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const Trash = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6M9 6V4h6v2" /></svg>;
const Edit = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const X = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const Bolt = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const genTag = (name) => !name ? '' : name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').substring(0, 50);

const renderCsvPattern = (pattern) => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'Today → ' + (pattern || '{YYYYMMDD}.csv')
    .replace('{YYYYMMDD}', d.getFullYear() + p(d.getMonth()+1) + p(d.getDate()))
    .replace('{YYYY-MM-DD}', d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()))
    .replace('{DD-MM-YYYY}', p(d.getDate()) + '-' + p(d.getMonth()+1) + '-' + d.getFullYear())
    .replace('{DDMMYYYY}', p(d.getDate()) + p(d.getMonth()+1) + d.getFullYear())
    .replace('{DD.MM.YYYY}', p(d.getDate()) + '.' + p(d.getMonth()+1) + '.' + d.getFullYear())
    .replace('{date}', d.getFullYear() + p(d.getMonth()+1) + p(d.getDate()));
};

export const DevicesScreen = () => {
  const { parameters, devices, addParameter, editParameter, deleteParameter, addDevice, editDevice, showToast, testParameterConnection, hasLoadedOnce } = useContext(AppContext);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [form, setForm] = useState(DEFAULT_PARAM);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);

  const globalDevice = useMemo(() => {
    let gd = devices.find(d => d.name === 'Global Gateway');
    if (!gd && devices.length > 0) gd = devices[0];
    return gd;
  }, [devices]);

  useEffect(() => {
    if (hasLoadedOnce && devices && devices.length === 0) {
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
    setEditingIdx(null);
    setModalOpen(true);
  };

  const openEdit = (i) => {
    const p = parameters[i];
    const dev = devices.find(d => d.id === p.device_id);
    setForm({
      ...DEFAULT_PARAM, ...p,
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
    setEditingIdx(i);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm(DEFAULT_PARAM);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'number' && value === '') {
      const defaults = { scale_factor: 1.0, offset: 0.0, register_count: 2 };
      setForm(p => ({ ...p, [name]: name in defaults ? defaults[name] : '' }));
    } else {
      setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value) }));
    }
  };

  const handleSave = async () => {
    if (!form.name) return showToast('Monitored Sensor name is required.', 'error');
    if (!globalDevice) return showToast('Initializing global gateway, please wait...', 'error');
    if (form.input_type === 'csv' && form.csv_mode === 'fixed' && !form.csv_path?.trim()) {
      return showToast('File path is required for fixed CSV/Excel mode.', 'error');
    }
    if (form.input_type === 'csv' && form.csv_mode === 'daily' && !form.csv_folder?.trim()) {
      return showToast('Folder path is required for daily rotating CSV/Excel mode.', 'error');
    }

    setSaving(true);
    try {
      const deviceProtocol = form.input_type;
      const deviceSaved = await editDevice(globalDevice.id, {
        protocol: deviceProtocol,
        host: deviceProtocol === 'csv' || deviceProtocol === 'modbus_rtu' ? null : (form.host || null),
        port: deviceProtocol === 'csv' || deviceProtocol === 'modbus_rtu' ? null : (form.port || null),
        serial_port: deviceProtocol === 'modbus_rtu' ? (form.serial_port || null) : null,
        baud_rate: deviceProtocol === 'modbus_rtu' ? (form.baud_rate || 9600) : null,
        data_bits: deviceProtocol === 'modbus_rtu' ? (form.data_bits || 8) : null,
        parity: deviceProtocol === 'modbus_rtu' ? (form.parity || 'N') : null,
        stop_bits: deviceProtocol === 'modbus_rtu' ? (form.stop_bits || 1) : null,
        slave_id: form.slave_id || 1,
        request_hex: (deviceProtocol === 'tcp_custom' || deviceProtocol === 'iseo_tcp') ? (form.request_hex || null) : null,
        response_delimiter: (deviceProtocol === 'tcp_custom' || deviceProtocol === 'iseo_tcp') ? (form.response_delimiter || 'newline') : 'newline',
        csv_path: deviceProtocol === 'csv' && form.csv_mode === 'fixed' ? form.csv_path : null,
        csv_folder: deviceProtocol === 'csv' && form.csv_mode === 'daily' ? form.csv_folder : null,
        csv_filename_pattern: deviceProtocol === 'csv' && form.csv_mode === 'daily'
          ? (form.csv_filename_pattern || '{YYYYMMDD}.csv') : null,
        csv_delimiter: deviceProtocol === 'csv' ? (form.csv_delimiter || ',') : ',',
        csv_timestamp_col: deviceProtocol === 'csv' ? (form.csv_timestamp_col ?? 0) : null,
      });
      if (!deviceSaved) return;

      const payload = { ...form, tag_name: genTag(form.name), device_id: globalDevice.id, overrideConnection: true };
      const success = editingIdx !== null ? await editParameter((form as any).id, payload) : await addParameter(payload);
      if (success) closeModal();
    } catch (err) {
      console.error('Failed to save parameter config:', err);
      showToast('Communication error: Failed to save configuration.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const s = () => ({
    fontSize: '11px', fontWeight: '700', color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px',
  });

  const ipt = {
    width: '100%', background: '#fff', border: '1px solid #e2e8f0',
    padding: '10px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
    color: '#0f172a', outline: 'none', fontFamily: T.fontMono,
    transition: 'border-color 0.15s',
  };

  const btnStyle = (active) => ({
    flex: 1, padding: '10px', borderRadius: '8px',
    border: '2px solid ' + (active ? '#0f766e' : '#e2e8f0'),
    background: active ? '#f0fdfa' : '#fff',
    color: active ? '#0f766e' : '#64748b',
    fontWeight: '700', fontSize: '12px', cursor: 'pointer',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc', fontFamily: T.fontBase }}>

      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em' }}>Channel Configuration</h1>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8', fontWeight: '600' }}>Manage telemetry parameters and gateway rules</p>
        </div>
        <button onClick={openNew} style={{
          background: '#0f766e', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px',
          fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
          boxShadow: '0 4px 12px rgba(15,118,110,0.3)',
        }}><Plus /> Add Rule</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  {['#', 'Parameter', 'Unit', 'Protocol', 'Address', 'Slave', 'Register', 'Data Type', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '12px 14px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parameters.map((p, i) => {
                  const dev = devices.find(d => d.id === p.device_id);
                  const proto = dev?.protocol || '�';
                  const protoLabel = proto === 'modbus_tcp' ? 'Modbus TCP' : proto === 'modbus_rtu' ? 'Modbus RTU' : proto === 'csv' ? 'CSV / Excel' : proto === 'tcp_custom' ? 'TCP Custom' : proto === 'iseo_tcp' ? 'ISEO TCP' : proto;
                  const addr = proto === 'csv'
                    ? (dev?.csv_folder ? dev.csv_folder + '\\' + (dev.csv_filename_pattern || '') : (dev?.csv_path || '�'))
                    : (p.host || dev?.host || '�');
                  const port = p.port || dev?.port || '�';

                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: p.is_active ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '12px 14px', fontWeight: '700', color: '#0f172a' }}>{p.display_order}</td>
                      <td style={{ padding: '12px 14px', fontWeight: '700', color: '#0f766e' }}>{p.name}</td>
                      <td style={{ padding: '12px 14px', color: '#64748b' }}>{p.unit}</td>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#475569' }}>
                        <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>{protoLabel}</span>
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: T.fontMono, fontSize: '12px', color: '#64748b' }}>{proto !== 'csv' ? addr + ':' + port : addr}</td>
                      <td style={{ padding: '12px 14px', fontFamily: T.fontMono, fontSize: '12px', color: '#64748b' }}>{p.slave_id || dev?.slave_id || '�'}</td>
                      <td style={{ padding: '12px 14px', fontFamily: T.fontMono, fontSize: '12px', color: '#64748b' }}>{p.register_address}</td>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#475569' }}>{getDataTypeLabel(p.data_type, p.byte_order)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '99px',
                          background: p.is_active ? '#dcfce7' : '#fee2e2', color: p.is_active ? '#166534' : '#991b1b',
                        }}>{p.is_active ? 'On' : 'Off'}</span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button onClick={() => { if (testingId) return; setTestingId(p.id); showToast('Testing connection...', 'info'); testParameterConnection(p.id).finally(() => setTestingId(null)); }} disabled={testingId === p.id} title="Test" style={{ background: 'none', border: 'none', color: '#10b981', cursor: testingId === p.id ? 'not-allowed' : 'pointer', padding: '4px', opacity: testingId === p.id ? 0.4 : 1 }}><Bolt /></button>
                          <button onClick={() => openEdit(i)} title="Edit" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}><Edit /></button>
                          <button onClick={() => deleteParameter(p.id)} title="Delete" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}><Trash /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {parameters.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>No rules configured. Click <strong>Add Rule</strong> to get started.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(6px)' }}>
          <div style={{ width: '100%', maxWidth: '680px', background: '#fff', borderRadius: '14px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)' }}>

            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>{editingIdx !== null ? 'Edit' : 'New'} Gateway Rule</h3>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>Configure telemetry source and mapping</p>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}><X /></button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={s()}>Channel ID</label>
                  <input type="number" name="display_order" value={form.display_order} onChange={handleChange} style={ipt} />
                </div>
                <div>
                  <label style={s()}>Status</label>
                  <select value={form.is_active ? 'Enabled' : 'Disabled'} onChange={(e) => setForm(p => ({ ...p, is_active: e.target.value === 'Enabled' }))} style={ipt}>
                    <option value="Enabled">Enabled</option>
                    <option value="Disabled">Disabled</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={s()}>Protocol / Data Source</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['modbus_tcp', 'modbus_rtu', 'tcp_custom', 'iseo_tcp', 'csv'].map(proto => (
                    <button key={proto} onClick={() => setForm(p => ({ ...p, input_type: proto }))} style={btnStyle(form.input_type === proto)}>
                      {proto === 'modbus_tcp' ? 'TCP' : proto === 'modbus_rtu' ? 'RS485' : proto === 'tcp_custom' ? 'TCP Custom' : proto === 'iseo_tcp' ? 'ISEO TCP' : 'CSV / Excel'}
                    </button>
                  ))}
                </div>
              </div>

              {form.input_type === 'csv' ? (
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                  {/* Mode toggle */}
                  <div>
                    <label style={s()}>File Mode</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {['daily', 'fixed'].map(mode => (
                        <button key={mode} onClick={() => setForm(p => ({ ...p, csv_mode: mode }))} style={btnStyle(form.csv_mode === mode)}>
                          {mode === 'daily' ? '📅 Daily Rotating (new file each day)' : '📄 Fixed File (single file)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Daily mode fields */}
                  {form.csv_mode === 'daily' ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={s()}>📁 Folder Path</label>
                          <input
                            type="text" name="csv_folder"
                            value={form.csv_folder || ''}
                            onChange={handleChange}
                            style={ipt}
                            placeholder={String.raw`C:\Users\sunsh\OneDrive\Desktop`}
                          />
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>Full path to the folder containing daily files</div>
                        </div>
                        <div>
                          <label style={s()}>📝 Filename Pattern</label>
                          <input
                            type="text" name="csv_filename_pattern"
                            value={form.csv_filename_pattern || ''}
                            onChange={handleChange}
                            style={ipt}
                            placeholder="{DD.MM.YYYY} Daily Rep..xlsx"
                          />
                          <div style={{ fontSize: '10px', color: '#0369a1', marginTop: '4px', fontWeight: '600' }}>
                            {renderCsvPattern(form.csv_filename_pattern)}
                          </div>
                        </div>
                      </div>
                      {/* Token reference */}
                      <div style={{ background: '#dbeafe', borderRadius: '8px', padding: '10px 12px', fontSize: '11px', color: '#1e40af', lineHeight: 1.7 }}>
                        <strong>📅 Date Tokens:</strong>&nbsp;
                        <code>{'{DD.MM.YYYY}'}</code> → 26.06.2026 &nbsp;|&nbsp;
                        <code>{'{DD-MM-YYYY}'}</code> → 26-06-2026 &nbsp;|&nbsp;
                        <code>{'{YYYYMMDD}'}</code> → 20260626 &nbsp;|&nbsp;
                        <code>{'{YYYY-MM-DD}'}</code> → 2026-06-26
                      </div>
                    </>
                  ) : (
                    /* Fixed mode field */
                    <div>
                      <label style={s()}>📄 Full File Path (.csv or .xlsx)</label>
                      <input
                        type="text" name="csv_path"
                        value={form.csv_path || ''}
                        onChange={handleChange}
                        style={ipt}
                        placeholder={String.raw`C:\Users\sunsh\OneDrive\Desktop\readings.csv`}
                      />
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>Supports both .csv and .xlsx files</div>
                    </div>
                  )}

                  {/* Shared fields: delimiter + timestamp col */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={s()}>Delimiter</label>
                      <input
                        type="text" name="csv_delimiter"
                        value={form.csv_delimiter || ','}
                        onChange={handleChange}
                        style={ipt} maxLength={5}
                        placeholder=","
                      />
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>For .xlsx files, leave as comma (ignored)</div>
                    </div>
                    <div>
                      <label style={s()}>Timestamp Column (0=A)</label>
                      <input
                        type="number" name="csv_timestamp_col"
                        value={form.csv_timestamp_col ?? 0}
                        onChange={handleChange}
                        style={ipt} min={0}
                      />
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>Col A=0, B=1, C=2, D=3…</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '2px' }}>
                      <label style={s()}>Data Column (Register Address)</label>
                      <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: '600', background: '#e0f2fe', padding: '8px 10px', borderRadius: '6px' }}>
                        Set Register Address = column index (A=0, B=1, C=2…)
                      </span>
                    </div>
                  </div>

                  {/* Info box */}
                  <div style={{ fontSize: '11px', color: '#0f766e', fontWeight: '500', padding: '10px 12px', background: '#d1fae5', borderRadius: '8px', lineHeight: 1.6, border: '1px solid #6ee7b7' }}>
                    <strong>✅ Supported Formats:</strong> CSV (.csv) and Excel (.xlsx)<br />
                    <strong>📊 Excel layout:</strong> Header rows (Date, column names, units) are auto-skipped. Footer rows (MAX/MIN/AVG) are also auto-skipped. UltrON reads the last hourly data row.<br />
                    <strong>🔢 Column mapping:</strong> Use Register Address = column index. For your daily report: NOX=1, PM10=2, PM25=3, SO2=4
                  </div>
                </div>
              ) : form.input_type === 'modbus_rtu' ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={s()}>Serial Port</label>
                      <input type="text" name="serial_port" value={form.serial_port || ''} onChange={handleChange} style={ipt} placeholder="COM1" />
                    </div>
                    <div>
                      <label style={s()}>Baud Rate</label>
                      <select name="baud_rate" value={form.baud_rate || 9600} onChange={handleChange} style={ipt}>
                        {[9600, 19200, 38400, 57600, 115200].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={s()}>Slave ID</label>
                      <input type="number" name="slave_id" value={form.slave_id} onChange={handleChange} style={ipt} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={s()}>Data Bits</label>
                      <select name="data_bits" value={form.data_bits || 8} onChange={handleChange} style={ipt}>
                        {[5, 6, 7, 8].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={s()}>Parity</label>
                      <select name="parity" value={form.parity || 'N'} onChange={handleChange} style={ipt}>
                        <option value="N">None</option>
                        <option value="E">Even</option>
                        <option value="O">Odd</option>
                      </select>
                    </div>
                    <div>
                      <label style={s()}>Stop Bits</label>
                      <select name="stop_bits" value={form.stop_bits || 1} onChange={handleChange} style={ipt}>
                        {[1, 2].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={s()}>IP Address</label>
                      <input type="text" name="host" value={form.host} onChange={handleChange} style={ipt} placeholder="192.168.1.101" />
                    </div>
                    <div>
                      <label style={s()}>Port</label>
                      <input type="text" name="port" value={form.port} onChange={handleChange} style={ipt} placeholder="502" />
                    </div>
                    <div>
                      <label style={s()}>Slave ID</label>
                      <input type="number" name="slave_id" value={form.slave_id} onChange={handleChange} style={ipt} />
                    </div>
                  </div>
                  {(form.input_type === 'tcp_custom' || form.input_type === 'iseo_tcp') && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                      <div>
                        <label style={s()}>Request Hex Command</label>
                        <input type="text" name="request_hex" value={form.request_hex || ''} onChange={handleChange} style={ipt} placeholder="02 4D 31 30 34 30 34 37 43 03" />
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>Hex bytes sent to device (space-separated)</div>
                      </div>
                      <div>
                        <label style={s()}>Response Delimiter</label>
                        <select name="response_delimiter" value={form.response_delimiter || 'newline'} onChange={handleChange} style={ipt}>
                          <option value="newline">Newline (\n)</option>
                          <option value="etx">ETX (0x03)</option>
                        </select>
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>Character that ends the device response</div>
                      </div>
                    </div>
                  )}
                </>
              )}
              {form.input_type !== 'csv' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={s()}>Function Code</label>
                      <select name="register_type" value={form.register_type} onChange={handleChange} style={ipt}>
                        <option value="input_reg">04 Input Register</option>
                        <option value="holding">03 Holding Register</option>
                      </select>
                    </div>
                    <div>
                      <label style={s()}>Data Type</label>
                      <select value={getDataTypeLabel(form.data_type, form.byte_order)} onChange={(e) => {
                        const m = DT_MAP[e.target.value];
                        if (m) setForm(p => ({ ...p, data_type: m.data_type, byte_order: m.byte_order }));
                      }} style={ipt}>
                        {DATA_TYPES.map(dt => (
                          <option key={dt} value={dt}>{dt}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={s()}>Start Address</label>
                      <input type="number" name="register_address" value={form.register_address} onChange={handleChange} style={ipt} />
                    </div>
                    <div>
                      <label style={s()}>Register Count</label>
                      <input type="number" name="register_count" value={form.register_count} onChange={handleChange} style={ipt} />
                    </div>
                  </div>
                </>
              )}

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scaling</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={s()}>Scale / Gain</label>
                    <input type="number" step="0.001" name="scale_factor" value={form.scale_factor} onChange={handleChange} style={ipt} />
                  </div>
                  <div>
                    <label style={s()}>Offset</label>
                    <input type="number" step="0.001" name="offset" value={form.offset} onChange={handleChange} style={ipt} />
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Limits</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={s()}>Min Range</label>
                    <input type="number" step="any" name="min_valid" value={form.min_valid ?? ''} onChange={handleChange} style={ipt} placeholder="0.0" />
                  </div>
                  <div>
                    <label style={s()}>Max Range</label>
                    <input type="number" step="any" name="max_valid" value={form.max_valid ?? ''} onChange={handleChange} style={ipt} placeholder="1000.0" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '12px' }}>
                  <div>
                    <label style={s()}>Warning Low</label>
                    <input type="number" step="any" name="alarm_low" value={form.alarm_low ?? ''} onChange={handleChange} style={ipt} placeholder="0.0" />
                  </div>
                  <div>
                    <label style={s()}>Warning High</label>
                    <input type="number" step="any" name="alarm_high" value={form.alarm_high ?? ''} onChange={handleChange} style={ipt} placeholder="80.0" />
                  </div>
                  <div>
                    <label style={s()}>Alarm Enabled</label>
                    <select name="alarm_enabled" value={form.alarm_enabled ? 'Enabled' : 'Disabled'} onChange={(e) => setForm(p => ({ ...p, alarm_enabled: e.target.value === 'Enabled' }))} style={ipt}>
                      <option value="Enabled">Enabled</option>
                      <option value="Disabled">Disabled</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Identification</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={s()}>Station Location</label>
                    <input type="text" name="description" value={form.description} onChange={handleChange} style={ipt} placeholder="e.g. Berger Stack Alpha" />
                  </div>
                  <div>
                    <label style={s()}>Monitored Sensor</label>
                    <input type="text" name="name" value={form.name} onChange={handleChange} style={ipt} placeholder="SO2" />
                  </div>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <label style={s()}>Engineering Unit</label>
                  <input type="text" name="unit" value={form.unit} onChange={handleChange} style={ipt} placeholder="ppm" />
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#fafafa' }}>
              <button onClick={closeModal} style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} style={{
                background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: '#fff', border: 'none',
                borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: '800', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(15,118,110,0.3)', opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Saving...' : 'Save Rule'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};