import React, { useContext, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { T } from '../theme';
import { PendingBadge } from '../components/PendingBadge';

const DATA_TYPES = [
  'Integer', 'Signed Integer', 'Long Integer', 'Swaped Long',
  'Float point', 'Swaped Float', 'Double Float', 'Swaped Double',
];

const DT_MAP = {
  'Integer':        { data_type: 'uint16',  byte_order: 'big' },
  'Signed Integer': { data_type: 'int16',   byte_order: 'big' },
  'Long Integer':   { data_type: 'int32',   byte_order: 'big_swap' },
  'Swaped Long':    { data_type: 'int32',   byte_order: 'big' },
  'Float point':    { data_type: 'float32', byte_order: 'big_swap' },
  'Swaped Float':   { data_type: 'float32', byte_order: 'big' },
  'Double Float':   { data_type: 'int64',   byte_order: 'big_swap' },
  'Swaped Double':  { data_type: 'int64',   byte_order: 'big' },
};

const revMap = Object.fromEntries(
  Object.entries(DT_MAP).map(([label, v]) => [v.data_type + '|' + v.byte_order, label])
);
const CUSTOM_PROTOCOLS = ['tcp_custom', 'udp_custom'];

const getDataTypeLabel = (dt, bo) => revMap[dt + '|' + bo] || 'Float point';

const DEFAULT_PARAM = {
  name: '', tag_name: '', unit: 'ppm', device_id: '',
  input_type: 'modbus_tcp', register_type: 'input_reg', register_address: 40001,
  register_count: 2, data_type: 'float32', byte_order: 'big',
  scale_factor: 1.0, offset: 0.0, min_valid: 0.0, max_valid: 1000.0,
  alarm_low: null, alarm_high: 80.0, alarm_enabled: true, display_order: 1, is_active: true,
  host: '', port: '', slave_id: '',
  serial_port: 'COM1', baud_rate: 9600, data_bits: 8, parity: 'N', stop_bits: 1,
  csv_mode: 'fixed', csv_path: '', csv_folder: '', csv_filename_pattern: '{YYYYMMDD}.csv',
  csv_delimiter: ',', csv_timestamp_col: 0,
  request_hex: '', response_delimiter: 'newline',
  parse_method: 'csv_col', parse_config: '',
  station_name: '', poll_interval: 5,
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

const DEVICE_PROTO_LABELS = {
  modbus_tcp: 'TCP Gateway', modbus_rtu: 'RS485 Gateway',
  tcp_custom: 'TCP Custom', udp_custom: 'UDP Gateway', csv: 'CSV Reader'
};

const renderCsvPattern = (pattern) => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'Today ' + String.fromCharCode(8594) + ' ' + (pattern || '{YYYYMMDD}.csv')
    .replace('{YYYYMMDD}', d.getFullYear() + p(d.getMonth()+1) + p(d.getDate()))
    .replace('{YYYY-MM-DD}', d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()))
    .replace('{DD-MM-YYYY}', p(d.getDate()) + '-' + p(d.getMonth()+1) + '-' + d.getFullYear())
    .replace('{DDMMYYYY}', p(d.getDate()) + p(d.getMonth()+1) + d.getFullYear())
    .replace('{DD.MM.YYYY}', p(d.getDate()) + '.' + p(d.getMonth()+1) + '.' + d.getFullYear())
    .replace('{date}', d.getFullYear() + p(d.getMonth()+1) + p(d.getDate()));
};

export const DevicesScreen = React.memo(() => {
  const { parameters, devices, stations, addParameter, editParameter, deleteParameter, addDevice, editDevice, deleteDevice, showToast, testParameterConnection } = useContext(AppContext);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [form, setForm] = useState(DEFAULT_PARAM);
  const [testingId, setTestingId] = useState(null);

  const [activeProtoTab, setActiveProtoTab] = useState('all');
  const [modalTab, setModalTab] = useState('source');

  const filteredParams = parameters;

  const protoTabs = [
    { key: 'all', label: 'All' },
  ];

  const allCount = parameters.length;

  const protoFromTab = (tab: string) => {
    return tab === 'udp' ? 'udp_custom' : 'modbus_tcp';
  };

  const openNew = () => {
    setForm({
      ...DEFAULT_PARAM,
      display_order: parameters.length + 1,
      input_type: protoFromTab(activeProtoTab),
      device_id: null,
    });
    setEditingIdx(null);
    setModalOpen(true);
  };

  const openEdit = (i) => {
    const p = parameters[i];
    const dev = devices.find(d => d.id == p.device_id);
    setForm({
      ...DEFAULT_PARAM, ...p,
      host: p.host || dev?.host || '',
      port: p.port || dev?.port || '',
      slave_id: p.slave_id || dev?.slave_id || '',
      request_hex: dev?.request_hex || '',
      response_delimiter: dev?.response_delimiter || 'newline',
      input_type: dev?.protocol || 'modbus_tcp',
      csv_mode: dev?.csv_folder ? 'daily' : 'fixed',
      csv_path: dev?.csv_path || '',
      csv_folder: dev?.csv_folder || '',
      csv_filename_pattern: dev?.csv_filename_pattern || '{YYYYMMDD}.csv',
      csv_delimiter: dev?.csv_delimiter || ',',
      csv_timestamp_col: dev?.csv_timestamp_col ?? 0,
      station_name: dev?.station_id ? (stations.find(s => s.id == dev.station_id)?.name || '') : '',
      serial_port: dev?.serial_port || '',
      baud_rate: dev?.baud_rate || 9600,
      data_bits: dev?.data_bits || 8,
      parity: dev?.parity || 'N',
      stop_bits: dev?.stop_bits || 1,
      poll_interval: dev?.poll_interval ?? 5,
      device_id: p.device_id,
    });
    setEditingIdx(i);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm(DEFAULT_PARAM);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const { name, type } = t;
    if (type === 'checkbox') {
      setForm(p => ({ ...p, [name]: (t as HTMLInputElement).checked }));
    } else if (type === 'number') {
      const raw = t.value;
      const defaults: Record<string, number> = { scale_factor: 1.0, offset: 0.0, register_count: 2 };
      if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
        setForm(p => ({ ...p, [name]: name in defaults ? defaults[name] : (p as any)[name] }));
      } else {
        const n = Number(raw);
        setForm(p => ({ ...p, [name]: isNaN(n) ? (p as any)[name] : n }));
      }
    } else {
      setForm(p => ({ ...p, [name]: t.value }));
    }
  };

  const handleSave = async () => {
    if (!form.name) return showToast('Monitored Sensor name is required.', 'error');
    if (form.input_type === 'csv' && form.csv_mode === 'fixed' && !form.csv_path?.trim()) {
      return showToast('File path is required for fixed CSV/Excel mode.', 'error');
    }
    if (form.input_type === 'csv' && form.csv_mode === 'daily' && !form.csv_folder?.trim()) {
      return showToast('Folder path is required for daily rotating CSV/Excel mode.', 'error');
    }

    try {
      const deviceProtocol = form.input_type;
      const toNum = (v: unknown, fallback: number): number => { const n = Number(v); return isNaN(n) ? fallback : n; };

      const protoLabel = DEVICE_PROTO_LABELS[deviceProtocol] || 'Gateway';
      const autoDeviceName = (form.station_name?.trim() || form.name?.trim() || 'Device') + ' ' + protoLabel;

      const deviceUpdate: Record<string, any> = { protocol: deviceProtocol, name: autoDeviceName };
      deviceUpdate.poll_interval = toNum(form.poll_interval, 5);
      if (form.station_name?.trim()) deviceUpdate.station_name = form.station_name.trim();
      if (deviceProtocol === 'modbus_tcp' || deviceProtocol === 'tcp_custom' || deviceProtocol === 'udp_custom') {
        deviceUpdate.host = form.host || '';
        deviceUpdate.port = form.port || '';
        deviceUpdate.slave_id = toNum(form.slave_id, 1);
        if (deviceProtocol === 'tcp_custom' || deviceProtocol === 'udp_custom') {
          deviceUpdate.request_hex = form.request_hex || null;
          deviceUpdate.response_delimiter = form.response_delimiter || 'newline';
        }
      } else if (deviceProtocol === 'modbus_rtu') {
        deviceUpdate.serial_port = form.serial_port || '';
        deviceUpdate.baud_rate = toNum(form.baud_rate, 9600);
        deviceUpdate.data_bits = toNum(form.data_bits, 8);
        deviceUpdate.parity = form.parity || 'N';
        deviceUpdate.stop_bits = toNum(form.stop_bits, 1);
        deviceUpdate.slave_id = toNum(form.slave_id, 1);
      } else if (deviceProtocol === 'csv') {
        if (form.csv_mode === 'fixed') deviceUpdate.csv_path = form.csv_path || '';
        if (form.csv_mode === 'daily') deviceUpdate.csv_folder = form.csv_folder || '';
        deviceUpdate.csv_filename_pattern = form.csv_filename_pattern || '{YYYYMMDD}.csv';
        deviceUpdate.csv_delimiter = form.csv_delimiter || ',';
        deviceUpdate.csv_timestamp_col = toNum(form.csv_timestamp_col, 0);
      }

      let targetDeviceId = form.device_id;
      if (editingIdx !== null && targetDeviceId) {
        const devExists = devices.find(d => d.id == targetDeviceId);
        if (devExists) {
          const deviceSaved = await editDevice(targetDeviceId, deviceUpdate);
          if (!deviceSaved) { showToast('Failed to save device config.', 'error'); return; }
        }
      } else {
        const newDevice = await addDevice(deviceUpdate);
        if (!newDevice) { showToast('Failed to save device config.', 'error'); return; }
        targetDeviceId = newDevice.id;
      }

      let parseConfigStr = form.parse_config || '';
      if (deviceProtocol === 'tcp_custom' || deviceProtocol === 'udp_custom') {
        const customConf = {
          request_hex: form.request_hex || null,
          response_delimiter: form.response_delimiter || 'newline'
        };
        try {
          const existing = parseConfigStr ? JSON.parse(parseConfigStr) : {};
          parseConfigStr = JSON.stringify({ ...existing, ...customConf });
        } catch(e) {
          parseConfigStr = JSON.stringify(customConf);
        }
      }

      const numFields = ['display_order','register_address','register_count','scale_factor','offset','min_valid','max_valid','alarm_low','alarm_high','baud_rate','data_bits','stop_bits','slave_id','csv_timestamp_col','poll_interval'];
      const payload: Record<string, any> = { 
        ...form, 
        parse_config: parseConfigStr, 
        tag_name: genTag(form.name), 
        device_id: targetDeviceId, 
        overrideConnection: true 
      };
      numFields.forEach(f => {
        if (payload[f] !== undefined && payload[f] !== null && payload[f] !== '') {
          const n = Number(payload[f]);
          if (!isNaN(n)) payload[f] = n;
        }
      });
      const success = editingIdx !== null ? await editParameter((form as Record<string, unknown>).id as number, payload) : await addParameter(payload);
      if (success) closeModal();
      else showToast('Failed to save parameter config.', 'error');
    } catch (err) {
      console.error('Failed to save parameter config:', err);
      showToast('Communication error: Failed to save configuration.', 'error');
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

      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: '12px' }}>
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

      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 28px', display: 'flex', gap: '4px', flexShrink: 0 }}>
        {protoTabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveProtoTab(tab.key)} style={{
            padding: '12px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
            background: 'none', border: 'none', borderBottom: '3px solid ' + (activeProtoTab === tab.key ? '#0f766e' : 'transparent'),
            color: activeProtoTab === tab.key ? '#0f766e' : '#94a3b8',
            transition: 'color 0.15s, border-color 0.15s',
          }}>
            {tab.label}
            <span style={{
              marginLeft: '6px', fontSize: '10px', fontWeight: '700',
              background: activeProtoTab === tab.key ? '#f0fdfa' : '#f1f5f9',
              color: '#64748b', padding: '1px 7px', borderRadius: '99px',
            }}>{allCount}</span>
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  {['#', 'Parameter', 'Station', 'Protocol', 'Address', 'Slave', 'Register', 'Data Type', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '12px 14px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredParams.map((p, i) => {
                  const dev = devices.find(d => d.id == p.device_id);
                  const proto = dev?.protocol || '';
                  const protoLabel = proto === 'modbus_tcp' ? 'Modbus TCP' : proto === 'modbus_rtu' ? 'Modbus RTU' : proto === 'csv' ? 'CSV / Excel' : proto === 'tcp_custom' ? 'TCP Custom' : proto === 'udp_custom' ? 'UDP Custom' : proto;
                  const addr = proto === 'csv'
                    ? (dev?.csv_folder ? dev.csv_folder + '\\' + (dev.csv_filename_pattern || '') : (dev?.csv_path || ''))
                    : (p.host || dev?.host || '');
                  const port = p.port || dev?.port || '';

                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: p.is_active ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '12px 14px', fontWeight: '700', color: '#0f172a' }}>{p.display_order}</td>
                      <td style={{ padding: '12px 14px', fontWeight: '700', color: '#0f766e' }}>{p.name}</td>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#475569' }}>
                        {stations.find(s => s.id == dev?.station_id)?.name || <span style={{ color: '#94a3b8' }}>{'\u2014'}</span>}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#475569' }}>
                        <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>{protoLabel}</span>
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: T.fontMono, fontSize: '12px', color: '#64748b' }}>{proto !== 'csv' ? addr + ':' + port : addr}</td>
                      <td style={{ padding: '12px 14px', fontFamily: T.fontMono, fontSize: '12px', color: '#64748b' }}>{CUSTOM_PROTOCOLS.includes(proto) ? '-' : (p.slave_id || dev?.slave_id || '')}</td>
                      <td style={{ padding: '12px 14px', fontFamily: T.fontMono, fontSize: '12px', color: '#64748b' }}>{p.register_address}</td>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#475569' }}>{CUSTOM_PROTOCOLS.includes(proto) ? '-' : getDataTypeLabel(p.data_type, p.byte_order)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '99px',
                          background: p.is_active ? '#dcfce7' : '#fee2e2', color: p.is_active ? '#166534' : '#991b1b',
                        }}>{p.is_active ? 'On' : 'Off'}</span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button onClick={() => { if (testingId) return; setTestingId(p.id); showToast('Testing connection...', 'info'); testParameterConnection(p.id).finally(() => setTestingId(null)); }} disabled={testingId === p.id} title="Test parameter connection" style={{ background: 'none', border: 'none', color: '#10b981', cursor: testingId === p.id ? 'not-allowed' : 'pointer', padding: '4px', opacity: testingId === p.id ? 0.4 : 1 }}><Bolt /></button>
                          <button onClick={() => openEdit(i)} title="Edit parameter" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}><Edit /></button>
                          <button onClick={() => deleteParameter(p.id)} title="Delete parameter" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}><Trash /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredParams.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                    No rules configured. Click Add Rule to get started.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,79,73,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(6px)' }}>
          <div style={{ width: '100%', maxWidth: '680px', background: '#fff', borderRadius: '14px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)' }}>

            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>{editingIdx !== null ? 'Edit' : 'New'} Gateway Rule</h3>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>Configure telemetry source and mapping</p>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}><X /></button>
            </div>

            <div style={{ padding: '0 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                {[
                  { key: 'source', label: 'Source' },
                  { key: 'scaling', label: 'Scaling & Limits' },
                  { key: 'identification', label: 'Identification' },
                ].map(tab => (
                  <button key={tab.key} onClick={() => setModalTab(tab.key)} style={{
                    padding: '12px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                    background: 'none', border: 'none', borderBottom: '3px solid ' + (modalTab === tab.key ? '#0f766e' : 'transparent'),
                    color: modalTab === tab.key ? '#0f766e' : '#94a3b8',
                    transition: 'color 0.15s, border-color 0.15s',
                  }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {modalTab === 'source' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={s()}>Channel ID</label>
                        <input type="text" inputMode="numeric" name="display_order" value={form.display_order} onChange={handleChange} style={ipt} />
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
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {['modbus_tcp', 'modbus_rtu', 'udp_custom', 'csv'].map(proto => (
                          <button key={proto} onClick={() => setForm(p => ({ ...p, input_type: proto }))} style={{ ...btnStyle(form.input_type === proto), minWidth: '80px', flex: '1 1 auto' }}>
                            {proto === 'modbus_tcp' ? 'TCP' : proto === 'modbus_rtu' ? 'RS485' : proto === 'udp_custom' ? 'UDP Custom' : 'CSV / Excel'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {form.input_type === 'csv' ? (
                      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div>
                          <label style={s()}>File Mode</label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {['daily', 'fixed'].map(mode => (
                              <button key={mode} onClick={() => setForm(p => ({ ...p, csv_mode: mode }))} style={btnStyle(form.csv_mode === mode)}>
                                {mode === 'daily' ? 'Daily Rotating (new file each day)' : 'Fixed File (single file)'}
                              </button>
                            ))}
                          </div>
                        </div>
                        {form.csv_mode === 'daily' ? (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                              <div>
                                <label style={s()}>Folder Path</label>
                                <input type="text" name="csv_folder" value={form.csv_folder || ''} onChange={handleChange} style={ipt} placeholder={String.raw`C:\Users\sunsh\OneDrive\Desktop`} />
                                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>Full path to the folder containing daily files</div>
                              </div>
                              <div>
                                <label style={s()}>Filename Pattern</label>
                                <input type="text" name="csv_filename_pattern" value={form.csv_filename_pattern || ''} onChange={handleChange} style={ipt} placeholder="{DD.MM.YYYY} Daily Rep..xlsx" />
                                <div style={{ fontSize: '10px', color: '#0369a1', marginTop: '4px', fontWeight: '600' }}>{renderCsvPattern(form.csv_filename_pattern)}</div>
                              </div>
                            </div>
                            <div style={{ background: '#dbeafe', borderRadius: '8px', padding: '10px 12px', fontSize: '11px', color: '#1e40af', lineHeight: 1.7 }}>
                              <strong>Date Tokens:</strong>&nbsp;
                              <code>{'{DD.MM.YYYY}'}</code> 26.06.2026 &nbsp;|&nbsp;
                              <code>{'{DD-MM-YYYY}'}</code> 26-06-2026 &nbsp;|&nbsp;
                              <code>{'{YYYYMMDD}'}</code> 20260626 &nbsp;|&nbsp;
                              <code>{'{YYYY-MM-DD}'}</code> 2026-06-26
                            </div>
                          </>
                        ) : (
                          <div>
                            <label style={s()}>Full File Path (.csv or .xlsx)</label>
                            <input type="text" name="csv_path" value={form.csv_path || ''} onChange={handleChange} style={ipt} placeholder={String.raw`C:\Users\sunsh\OneDrive\Desktop\readings.csv`} />
                            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>Supports both .csv and .xlsx files</div>
                          </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={s()}>Delimiter</label>
                            <input type="text" name="csv_delimiter" value={form.csv_delimiter || ','} onChange={handleChange} style={ipt} maxLength={5} placeholder="," />
                            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>For .xlsx files, leave as comma (ignored)</div>
                          </div>
                          <div>
                            <label style={s()}>Timestamp Column (0=A)</label>
                            <input type="number" name="csv_timestamp_col" value={form.csv_timestamp_col ?? 0} onChange={handleChange} style={ipt} min={0} />
                            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>Col A=0, B=1, C=2, D=3...</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '2px' }}>
                            <label style={s()}>Data Column (Register Address)</label>
                            <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: '600', background: '#e0f2fe', padding: '8px 10px', borderRadius: '6px' }}>
                              Set Register Address = column index (A=0, B=1, C=2...)
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: '11px', color: '#0f766e', fontWeight: '500', padding: '10px 12px', background: '#d1fae5', borderRadius: '8px', lineHeight: 1.6, border: '1px solid #6ee7b7' }}>
                          <strong>Supported Formats:</strong> CSV (.csv) and Excel (.xlsx)<br />
                          <strong>Excel layout:</strong> Header rows (Date, column names, units) are auto-skipped. Footer rows (MAX/MIN/AVG) are also auto-skipped. UltrON reads the last hourly data row.<br />
                          <strong>Column mapping:</strong> Use Register Address = column index. For your daily report: NOX=1, PM10=2, PM25=3, SO2=4
                        </div>
                      </div>
                    ) : form.input_type === 'modbus_rtu' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: CUSTOM_PROTOCOLS.includes(form.input_type) ? '1fr 1fr' : '1fr 1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={s()}>IP Address</label>
                            <input type="text" name="host" value={form.host} onChange={handleChange} style={ipt} placeholder="192.168.1.101" />
                          </div>
                          <div>
                            <label style={s()}>Port</label>
                            <input type="text" name="port" value={form.port} onChange={handleChange} style={ipt} placeholder="502" />
                          </div>
                          {!CUSTOM_PROTOCOLS.includes(form.input_type) && (
                            <div>
                              <label style={s()}>Slave ID</label>
                              <input type="number" name="slave_id" value={form.slave_id} onChange={handleChange} style={ipt} />
                            </div>
                          )}
                        </div>
                        {(form.input_type === 'tcp_custom' || form.input_type === 'udp_custom') && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
                      </div>
                    )}


                    {form.input_type !== 'csv' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {!CUSTOM_PROTOCOLS.includes(form.input_type) && (
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
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: CUSTOM_PROTOCOLS.includes(form.input_type) ? '1fr 1fr' : '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={s()}>{CUSTOM_PROTOCOLS.includes(form.input_type) ? 'Field Index' : 'Start Address'}</label>
                            <input type="text" inputMode="numeric" name="register_address" value={form.register_address} onChange={handleChange} style={ipt} />
                            {CUSTOM_PROTOCOLS.includes(form.input_type) && (
                              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>ASCII field index (0-based space-delimited position)</div>
                            )}
                          </div>
                          {!CUSTOM_PROTOCOLS.includes(form.input_type) ? (
                            <div>
                              <label style={s()}>Register Count</label>
                              <input type="text" inputMode="numeric" name="register_count" value={form.register_count} onChange={handleChange} style={ipt} />
                            </div>
                          ) : (
                            <div>
                              <label style={s()}>Parse Method</label>
                              <select name="parse_method" value={form.parse_method || 'csv_col'} onChange={handleChange} style={ipt}>
                                <option value="csv_col">CSV Column</option>
                                <option value="position">Position</option>
                                <option value="regex">Regex</option>
                                <option value="delimiter_split">Delimiter Split</option>
                                <option value="m10404">M10404 (Envco PM)</option>
                                <option value="af2216">AF2216 (Envco SO2)</option>
                                <option value="ac3216">AC3216 (Envco NOx)</option>
                              </select>
                              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>Decode method for this parameter</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {modalTab === 'scaling' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={s()}>Scale / Gain</label>
                        <input type="text" inputMode="decimal" name="scale_factor" value={form.scale_factor} onChange={handleChange} style={ipt} />
                      </div>
                      <div>
                        <label style={s()}>Offset</label>
                        <input type="text" inputMode="decimal" name="offset" value={form.offset} onChange={handleChange} style={ipt} />
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
                  </>
                )}

                {modalTab === 'identification' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={s()}>Station Name</label>
                        <input
                          type="text"
                          name="station_name"
                          value={form.station_name || ''}
                          onChange={handleChange}
                          style={ipt}
                          placeholder="e.g. AAQMS 1"
                        />
                      </div>
                      <div>
                        <label style={s()}>Parameter Name</label>
                        <input type="text" name="name" value={form.name} onChange={handleChange} style={ipt} placeholder="SO2" />
                      </div>
                    </div>
                    <div>
                      <label style={s()}>Engineering Unit</label>
                      <input type="text" name="unit" value={form.unit} onChange={handleChange} style={ipt} placeholder="ppm" />
                    </div>
                  </div>
                )}


              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#fafafa' }}>
              <button onClick={closeModal} style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave} style={{
                background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: '#fff', border: 'none',
                borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: '800', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(15,118,110,0.3)',
              }}>
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
});
