import React, { useContext, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { IconPlus, IconTrash, IconPencil, IconX, IconBolt } from '@tabler/icons-react';
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
const NON_MODBUS_PROTOCOLS = ['tcp_custom', 'udp_custom', 'serial_ascii'];

const getDataTypeLabel = (dt, bo) => revMap[dt + '|' + bo] || 'Float point';

const DEFAULT_PARAM = {
  name: '', tag_name: '', unit: 'ppm', device_id: '',
  input_type: 'modbus_tcp', register_type: 'input_reg', register_address: 40001,
  register_count: 2, data_type: 'float32', byte_order: 'big',
  scale_factor: 1.0, offset: 0.0, min_valid: 0.0, max_valid: 1000.0,
  alarm_low: null, alarm_high: 80.0, alarm_enabled: true, display_order: 1, is_active: true,
  host: '', port: '', slave_id: '',
  serial_port: 'COM1', baud_rate: 9600, data_bits: 8, parity: 'N', stop_bits: 1,
  command_format: 'ascii', request_command: '<SOH>R31<CR>',
  search_key: '', value_offset: 1,
  csv_mode: 'fixed', csv_path: '', csv_folder: '', csv_filename_pattern: '{YYYYMMDD}.csv',
  csv_delimiter: ',', csv_timestamp_col: 0,
  request_hex: '', response_delimiter: 'newline',
  parse_method: 'csv_col', parse_config: '',
  station_name: '', poll_interval: 5,
};

const Plus = () => <IconPlus size={16} stroke={2.5} />;
const Trash = () => <IconTrash size={15} stroke={2.5} />;
const Edit = () => <IconPencil size={15} stroke={2.5} />;
const X = () => <IconX size={18} stroke={2.5} />;
const Bolt = () => <IconBolt size={14} stroke={2.5} />;

const genTag = (name) => !name ? '' : name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').substring(0, 50);

const DEVICE_PROTO_LABELS = {
  modbus_tcp: 'TCP Gateway', modbus_rtu: 'RS485 Gateway',
  tcp_custom: 'TCP Custom', udp_custom: 'UDP Gateway', csv: 'CSV Reader',
  serial_ascii: 'Serial ASCII',
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
  const { parameters, devices, stations, refreshStations, addParameter, editParameter, deleteParameter, addDevice, editDevice, deleteDevice, showToast, testParameterConnection, addStation, deleteStation, pendingStatus } = useContext(AppContext);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [form, setForm] = useState(DEFAULT_PARAM);
  const [testingId, setTestingId] = useState(null);

  const [activeProtoTab, setActiveProtoTab] = useState('all');
  const [modalTab, setModalTab] = useState('source');

  // Issue #002 UX States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [isRefreshingStations, setIsRefreshingStations] = useState(false);
  const [stationSearch, setStationSearch] = useState('');
  const [stationDropdownOpen, setStationDropdownOpen] = useState(false);
  const stationWrapperRef = React.useRef<HTMLDivElement>(null);

  const filteredStations = stations.filter(st =>
    st.name.toLowerCase().includes(stationSearch.toLowerCase())
  );

  const filteredParams = parameters;

  const protoTabs = [
    { key: 'all', label: 'All' },
  ];

  const allCount = parameters.length;

  const protoFromTab = (tab: string) => {
    return tab === 'udp' ? 'udp_custom' : 'modbus_tcp';
  };

  const handleRefreshStations = async () => {
    setIsRefreshingStations(true);
    try {
      await refreshStations();
      showToast('Stations list updated.');
    } catch (e) {
      showToast('Failed to refresh stations.', 'error');
    } finally {
      setIsRefreshingStations(false);
    }
  };

  const selectStation = (name: string) => {
    setForm(p => ({ ...p, station_name: name }));
    setStationSearch(name);
    setStationDropdownOpen(false);
    if (errors.station_name) setErrors(prev => { const n = { ...prev }; delete n.station_name; return n; });
  };

  const openNew = () => {
    const defaultStation = stations.length > 0 ? stations[0].name : '';
    setForm({
      ...DEFAULT_PARAM,
      display_order: parameters.length + 1,
      input_type: protoFromTab(activeProtoTab),
      device_id: null,
      station_name: defaultStation,
    });
    setStationSearch(defaultStation);
    setEditingIdx(null);
    setErrors({});
    setIsDirty(false);
    setModalOpen(true);
    refreshStations(); // Refresh stations on dialog open (Directive 7)
  };

  const openEdit = (i) => {
    const p = parameters[i];
    const dev = devices.find(d => d.id == p.device_id);
    let search_key = '';
    let value_offset = 1;
    if (p.parse_config) {
      try {
        const cfg = typeof p.parse_config === 'string' ? JSON.parse(p.parse_config) : p.parse_config;
        if (cfg.key !== undefined) search_key = cfg.key;
        if (cfg.value_offset !== undefined) value_offset = cfg.value_offset;
      } catch(e) {}
    }
    setForm({
      ...DEFAULT_PARAM, ...p,
      host: p.host || dev?.host || '',
      port: p.port || dev?.port || '',
      slave_id: p.slave_id || dev?.slave_id || '',
      request_hex: dev?.request_hex || '',
      response_delimiter: dev?.response_delimiter || 'newline',
      command_format: dev?.command_format || 'ascii',
      request_command: dev?.request_command || '',
      search_key,
      value_offset,
      input_type: dev?.protocol || 'modbus_tcp',
      csv_mode: dev?.csv_folder ? 'daily' : 'fixed',
      csv_path: dev?.csv_path || '',
      csv_folder: dev?.csv_folder || '',
      csv_filename_pattern: dev?.csv_filename_pattern || '{YYYYMMDD}.csv',
      csv_delimiter: dev?.csv_delimiter || ',',
      csv_timestamp_col: dev?.csv_timestamp_col ?? 0,
      station_name: dev?.station_id ? (stations.find(s => s.id == dev.station_id)?.name || '') : (stations[0]?.name || ''),
      serial_port: dev?.serial_port || '',
      baud_rate: dev?.baud_rate || 9600,
      data_bits: dev?.data_bits || 8,
      parity: dev?.parity || 'N',
      stop_bits: dev?.stop_bits || 1,
      poll_interval: dev?.poll_interval ?? 5,
      device_id: p.device_id,
    });
    setStationSearch(dev?.station_id ? (stations.find(s => s.id == dev.station_id)?.name || '') : (stations[0]?.name || ''));
    setEditingIdx(i);
    setErrors({});
    setIsDirty(false);
    setModalOpen(true);
    refreshStations(); // Refresh stations on dialog open (Directive 7)
  };

  const closeModalDirect = () => {
    setModalOpen(false);
    setConfirmDiscardOpen(false);
    setForm(DEFAULT_PARAM);
    setStationSearch('');
    setErrors({});
    setIsDirty(false);
  };

  const closeModal = () => {
    if (isDirty) {
      setConfirmDiscardOpen(true);
    } else {
      closeModalDirect();
    }
  };

  // Keyboard accessibility: Escape key closes modal (Directive 8)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalOpen) {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, isDirty]);

  // Close station dropdown on outside click
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (stationWrapperRef.current && !stationWrapperRef.current.contains(e.target as Node)) {
        setStationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setIsDirty(true); // Mark form dirty on input edit
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const { name, type } = t;

    // Clear validation error for modified field
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }

    if (type === 'checkbox') {
      setForm(p => ({ ...p, [name]: (t as HTMLInputElement).checked }));
    } else if (type === 'number') {
      const raw = t.value;
      const defaults: Record<string, number> = { scale_factor: 1.0, offset: 0.0, register_count: 2, value_offset: 1 };
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

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSubmitting) return; // Prevent duplicate submissions

    // Validate fields and build error map
    const newErrs: Record<string, string> = {};

    if (!form.name?.trim()) {
      newErrs.name = 'Parameter / Sensor name is required.';
    }
    if (!form.station_name?.trim()) {
      newErrs.station_name = 'Station selection is required.';
    }

    if (form.input_type === 'csv') {
      if (form.csv_mode === 'fixed' && !form.csv_path?.trim()) {
        newErrs.csv_path = 'File path is required for fixed CSV mode.';
      }
      if (form.csv_mode === 'daily' && !form.csv_folder?.trim()) {
        newErrs.csv_folder = 'Folder path is required for daily rotating CSV mode.';
      }
    } else if (form.input_type === 'serial_ascii') {
      if (!form.serial_port?.trim()) newErrs.serial_port = 'Serial Port is required.';
      if (!form.command_format) newErrs.command_format = 'Command Format is required.';
      if (!form.request_command?.trim()) newErrs.request_command = 'Request Command is required.';
    } else if (form.input_type === 'modbus_tcp' || form.input_type === 'tcp_custom' || form.input_type === 'udp_custom') {
      if (!form.host?.trim()) newErrs.host = 'IP Address / Host is required.';
      if (!String(form.port ?? '').trim()) newErrs.port = 'Port number is required.';
    }

    if (Object.keys(newErrs).length > 0) {
      setErrors(newErrs);
      showToast('Please fix the highlighted errors before saving.', 'error');

      // Auto-switch modal tab to reveal first invalid field if necessary
      const firstKey = Object.keys(newErrs)[0];
      if (firstKey === 'name' || firstKey === 'station_name') {
        setModalTab('identification');
      } else if (['host', 'port', 'serial_port', 'csv_path', 'csv_folder', 'command_format', 'request_command'].includes(firstKey)) {
        setModalTab('source');
      }

      // Auto-focus first invalid input (Directive 2)
      setTimeout(() => {
        const el = document.querySelector(`[name="${firstKey}"]`) as HTMLElement;
        if (el) el.focus();
      }, 50);
      return;
    }

    setIsSubmitting(true);
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
      } else if (deviceProtocol === 'serial_ascii') {
        deviceUpdate.serial_port = form.serial_port || 'COM1';
        deviceUpdate.baud_rate = toNum(form.baud_rate, 9600);
        deviceUpdate.data_bits = toNum(form.data_bits, 8);
        deviceUpdate.parity = form.parity || 'N';
        deviceUpdate.stop_bits = toNum(form.stop_bits, 1);
        deviceUpdate.command_format = form.command_format || 'ascii';
        deviceUpdate.request_command = form.request_command || '';
        deviceUpdate.response_delimiter = form.response_delimiter || 'newline';
      } else if (deviceProtocol === 'csv') {
        if (form.csv_mode === 'fixed') deviceUpdate.csv_path = form.csv_path || '';
        if (form.csv_mode === 'daily') deviceUpdate.csv_folder = form.csv_folder || '';
        deviceUpdate.csv_filename_pattern = form.csv_filename_pattern || '{YYYYMMDD}.csv';
        deviceUpdate.csv_delimiter = form.csv_delimiter || ',';
        deviceUpdate.csv_timestamp_col = toNum(form.csv_timestamp_col, 0);
      }

      let targetDeviceId = form.device_id;
      if (editingIdx !== null && targetDeviceId) {
        const devExists = devices.find(d => (d.id as any) == targetDeviceId);
        if (devExists) {
          const deviceSaved = await editDevice(targetDeviceId, deviceUpdate);
          if (!deviceSaved) { setIsSubmitting(false); return; }
        }
      } else {
        const newDevice = await addDevice(deviceUpdate);
        if (!newDevice) { setIsSubmitting(false); return; }
        targetDeviceId = newDevice.id;
      }

      let parseConfigStr = form.parse_config || '';
      if (form.parse_method === 'key_value') {
        const kvConf = {
          key: form.search_key || '',
          value_offset: toNum(form.value_offset, 1),
        };
        parseConfigStr = JSON.stringify(kvConf);
      } else if (deviceProtocol === 'tcp_custom' || deviceProtocol === 'udp_custom') {
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

      const numFields = ['display_order','register_address','register_count','scale_factor','offset','min_valid','max_valid','alarm_low','alarm_high','baud_rate','data_bits','stop_bits','slave_id','csv_timestamp_col','poll_interval','value_offset'];
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
      if (success) {
        setIsDirty(false);
        closeModalDirect();
      }
      else showToast('Failed to save parameter config.', 'error');
    } catch (err) {
      console.error('Failed to save parameter config:', err);
      showToast('Communication error: Failed to save configuration.', 'error');
    } finally {
      setIsSubmitting(false); // Restore save button state immediately (Directive 3)
    }
  };

  const s = () => ({
    fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px',
  });

  const fieldStyle = (fieldName: string) => ({
    width: '100%', background: '#fff',
    border: errors[fieldName] ? '1.5px solid var(--danger)' : '1.5px solid var(--border)',
    padding: '10px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
    color: 'var(--text-primary)', outline: 'none', fontFamily: T.fontMono,
    boxShadow: errors[fieldName] ? '0 0 0 3px rgba(226, 75, 74, 0.15)' : 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  });

  const ipt = fieldStyle('');

  const btnStyle = (active) => ({
    flex: 1, padding: '10px', borderRadius: '8px',
    border: '2px solid ' + (active ? 'var(--primary-600)' : 'var(--border)'),
    background: active ? 'var(--primary-50)' : '#fff',
    color: active ? 'var(--primary-600)' : 'var(--text-secondary)',
    fontWeight: '700', fontSize: '12px', cursor: 'pointer',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-muted)', fontFamily: T.fontBase }}>

      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Channel Configuration</h1>

        </div>
        <button onClick={openNew} style={{
          background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px',
          fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
          boxShadow: '0 4px 12px rgba(15,118,110,0.3)',
        }}><Plus /> Add Rule</button>
      </div>

      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '0 28px', display: 'flex', gap: '4px', flexShrink: 0 }}>
        {protoTabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveProtoTab(tab.key)} style={{
            padding: '12px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
            background: 'none', border: 'none', borderBottom: '3px solid ' + (activeProtoTab === tab.key ? 'var(--primary-600)' : 'transparent'),
            color: activeProtoTab === tab.key ? 'var(--primary-600)' : 'var(--text-secondary)',
            transition: 'color 0.15s, border-color 0.15s',
          }}>
            {tab.label}
            <span style={{
              marginLeft: '6px', fontSize: '10px', fontWeight: '700',
              background: activeProtoTab === tab.key ? 'var(--primary-50)' : 'var(--surface-muted)',
              color: 'var(--text-secondary)', padding: '1px 7px', borderRadius: '99px',
            }}>{allCount}</span>
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--primary-50)' }}>
                  {['#', 'Parameter', 'Station', 'Protocol', 'Address', 'Slave', 'Register', 'Data Type', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '12px 14px', fontSize: '10px', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredParams.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                      No gateway rules found for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredParams.map((p, idx) => {
                    const dev = devices.find(d => d.id == p.device_id);
                    const proto = dev?.protocol || p.input_type || 'modbus_tcp';
                    const isModbus = !NON_MODBUS_PROTOCOLS.includes(proto) && proto !== 'csv';
                    const stName = dev?.station_id ? (stations.find(s => s.id == dev.station_id)?.name || '—') : '—';

                    return (
                      <tr key={p.id || idx} style={{ borderBottom: '1px solid var(--surface-muted)', transition: 'background 0.1s' }}>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '12px' }}>{idx + 1}</td>
                        <td style={{ padding: '12px 14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{p.name}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '600' }}>({p.unit || 'ppm'})</span>
                            {(pendingStatus[`param:new`] === 'pending' || pendingStatus[`param:${p.id}`] === 'pending') && <PendingBadge />}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: '600' }}>{stName}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                            background: proto === 'modbus_tcp' ? 'var(--primary-50)' : proto === 'modbus_rtu' ? 'var(--primary-50)' : proto === 'csv' ? 'var(--info-bg)' : 'var(--surface-muted)',
                            color: proto === 'modbus_tcp' ? 'var(--primary-600)' : proto === 'modbus_rtu' ? 'var(--primary-600)' : proto === 'csv' ? 'var(--info)' : 'var(--text-secondary)',
                          }}>
                            {DEVICE_PROTO_LABELS[proto] || proto}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', fontFamily: T.fontMono, fontSize: '12px', color: 'var(--text-primary)' }}>
                          {proto === 'csv' ? `Col ${p.register_address}` : p.register_address ?? '—'}
                        </td>
                        <td style={{ padding: '12px 14px', fontFamily: T.fontMono, fontSize: '12px', color: 'var(--text-primary)' }}>
                          {isModbus ? (dev?.slave_id ?? p.slave_id ?? 1) : '—'}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                          {isModbus ? (p.register_type === 'holding' ? '03 Holding' : '04 Input') : (p.parse_method || 'CSV')}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                          {isModbus ? getDataTypeLabel(p.data_type, p.byte_order) : 'Float'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: '700',
                            background: p.is_active !== false ? 'var(--success-bg)' : 'var(--surface-muted)',
                            color: p.is_active !== false ? 'var(--success-text)' : 'var(--text-secondary)',
                          }}>
                            {p.is_active !== false ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                            <button
                              onClick={() => testParameterConnection(p.id)}
                              disabled={testingId === p.id}
                              title="Test Connection"
                              style={{
                                background: 'var(--primary-50)', color: 'var(--primary-600)', border: '1px solid var(--primary-50)',
                                borderRadius: '6px', padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                fontSize: '11px', fontWeight: '700',
                              }}
                            >
                              <Bolt />
                            </button>
                            <button onClick={() => openEdit(idx)} style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', border: 'none', borderRadius: '6px', padding: '5px 8px', cursor: 'pointer' }}><Edit /></button>
                            <button onClick={() => deleteParameter(p.id)} style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: 'none', borderRadius: '6px', padding: '5px 8px', cursor: 'pointer' }}><Trash /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26, 29, 28, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <form style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '720px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }} onSubmit={handleSave}>

            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-muted)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {editingIdx !== null ? 'Edit Gateway Rule' : 'New Gateway Rule'}
                </h3>
              </div>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}><X /></button>
            </div>

            <div style={{ borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', gap: '8px', background: '#fff' }}>
              {[
                { id: 'identification', label: '1. Identification' },
                { id: 'source', label: '2. Source Connection' },
                { id: 'scaling', label: '3. Scaling & Limits' },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setModalTab(t.id)}
                  style={{
                    padding: '12px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                    background: 'none', border: 'none', borderBottom: '3px solid ' + (modalTab === t.id ? 'var(--primary-600)' : 'transparent'),
                    color: modalTab === t.id ? 'var(--primary-600)' : 'var(--text-secondary)',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {modalTab === 'identification' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div ref={stationWrapperRef} style={{ position: 'relative' }}>
                        <label htmlFor="param_station_search" style={s()}>Station Name *</label>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            id="param_station_search"
                            type="text"
                            name="station_name"
                            value={stationSearch}
                            onChange={(e) => {
                              setStationSearch(e.target.value);
                              setForm(p => ({ ...p, station_name: '' }));
                              setStationDropdownOpen(true);
                              if (errors.station_name) setErrors(prev => { const n = { ...prev }; delete n.station_name; return n; });
                            }}
                            onBlur={() => {
                              const match = stations.find(s => s.name.toLowerCase() === stationSearch.toLowerCase());
                              if (match) {
                                setForm(p => ({ ...p, station_name: match.name }));
                                setStationSearch(match.name);
                              } else {
                                setForm(p => ({ ...p, station_name: stationSearch }));
                              }
                            }}
                            onFocus={() => setStationDropdownOpen(true)}
                            placeholder="-- Search Station --"
                            autoComplete="off"
                            style={{ ...fieldStyle('station_name'), flex: 1 }}
                          />
                          <button
                            type="button"
                            onClick={handleRefreshStations}
                            disabled={isRefreshingStations}
                            title="Refresh Stations"
                            style={{
                              padding: '10px 12px', cursor: 'pointer', background: 'var(--surface-muted)',
                              border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontWeight: '700'
                            }}
                          >
                            {isRefreshingStations ? '⏳' : '🔄'}
                          </button>
                        </div>
                        {stationDropdownOpen && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                            background: '#fff', border: '1.5px solid var(--border)', borderRadius: '8px',
                            marginTop: '4px', maxHeight: '200px', overflowY: 'auto',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          }}>
                            {stationSearch.trim() && (
                              <div
                                onClick={async () => {
                                  const name = stationSearch.trim();
                                  const result = await addStation({ name });
                                  if (result) {
                                    await refreshStations();
                                    selectStation(name);
                                  }
                                  setStationDropdownOpen(false);
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                                style={{
                                  padding: '10px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: '700',
                                  color: 'var(--primary-600)', borderBottom: '1px solid var(--border)',
                                  background: 'var(--primary-50)',
                                }}
                              >
                                + Add "{stationSearch.trim()}"
                              </div>
                            )}
                            {filteredStations.length === 0 && !stationSearch.trim() ? (
                              <div style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600' }}>
                                Type to add a new station
                              </div>
                            ) : (
                              filteredStations.map(st => (
                                <div
                                  key={st.id}
                                  style={{
                                    display: 'flex', alignItems: 'center',
                                    padding: '6px 12px', borderBottom: '1px solid var(--surface-muted)',
                                  }}
                                >
                                  <div
                                    onClick={() => selectStation(st.name)}
                                    onMouseDown={(e) => e.preventDefault()}
                                    style={{ flex: 1, cursor: 'pointer', padding: '4px 0', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}
                                  >
                                    {st.name}
                                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '500', marginLeft: '8px' }}>
                                      ({st.location || 'Zone'})
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await deleteStation(st.id);
                                      await refreshStations();
                                      setStationDropdownOpen(false);
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    style={{
                                      background: 'none', border: 'none', cursor: 'pointer',
                                      color: 'var(--text-secondary)', fontSize: '13px', padding: '4px 6px', fontWeight: '700',
                                    }}
                                    title={`Delete ${st.name}`}
                                  >
                                    x
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                        {errors.station_name && (
                          <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: '600', marginTop: '4px', display: 'block' }}>
                            {errors.station_name}
                          </span>
                        )}
                      </div>

                      <div>
                        <label htmlFor="param_name_input" style={s()}>Monitored Sensor Name *</label>
                        <input
                          id="param_name_input"
                          type="text"
                          name="name"
                          value={form.name}
                          onChange={handleChange}
                          style={fieldStyle('name')}
                          placeholder="SO2"
                        />
                        {errors.name && (
                          <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: '600', marginTop: '4px', display: 'block' }}>
                            {errors.name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div>
                        <label htmlFor="param_unit" style={s()}>Engineering Unit</label>
                        <input id="param_unit" type="text" name="unit" value={form.unit} onChange={handleChange} style={ipt} placeholder="ppm" />
                      </div>
                      <div>
                        <label htmlFor="param_poll_interval" style={s()}>Poll Interval (Seconds)</label>
                        <input id="param_poll_interval" type="number" name="poll_interval" value={form.poll_interval ?? 5} onChange={handleChange} style={ipt} min={1} max={3600} />
                      </div>
                    </div>
                  </div>
                )}

                {modalTab === 'source' && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <label style={s()}>Select Communication Protocol</label>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[
                          { key: 'modbus_tcp', label: 'Modbus TCP' },
                          { key: 'modbus_rtu', label: 'RS485 RTU' },
                          { key: 'serial_ascii', label: 'Serial ASCII' },
                          { key: 'tcp_custom', label: 'TCP Custom' },
                          { key: 'udp_custom', label: 'UDP Custom' },
                          { key: 'csv', label: 'CSV / Excel' },
                        ].map(p => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => { handleChange({ target: { name: 'input_type', value: p.key } } as any); }}
                            style={btnStyle(form.input_type === p.key)}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>

                      {form.input_type === 'csv' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                              <input type="radio" name="csv_mode" value="fixed" checked={form.csv_mode !== 'daily'} onChange={handleChange} />
                              Single Fixed File (.csv / .xlsx)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                              <input type="radio" name="csv_mode" value="daily" checked={form.csv_mode === 'daily'} onChange={handleChange} />
                              Daily Rotating Folder
                            </label>
                          </div>

                          {form.csv_mode === 'daily' ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                              <div>
                                <label htmlFor="param_csv_folder" style={s()}>Folder Path *</label>
                                <input id="param_csv_folder" type="text" name="csv_folder" value={form.csv_folder || ''} onChange={handleChange} style={fieldStyle('csv_folder')} placeholder={String.raw`C:\Data\Logs`} />
                                {errors.csv_folder && <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: '600', marginTop: '3px', display: 'block' }}>{errors.csv_folder}</span>}
                              </div>
                              <div>
                                <label htmlFor="param_csv_filename_pattern" style={s()}>Filename Pattern</label>
                                <input id="param_csv_filename_pattern" type="text" name="csv_filename_pattern" value={form.csv_filename_pattern || ''} onChange={handleChange} style={ipt} placeholder="{YYYYMMDD}.csv" />
                                <div style={{ fontSize: '10px', color: 'var(--info)', marginTop: '4px', fontWeight: '600' }}>{renderCsvPattern(form.csv_filename_pattern)}</div>
                              </div>
                            </div>
                          ) : (
                            <div>
                                <label htmlFor="param_csv_path" style={s()}>Full File Path (.csv or .xlsx) *</label>
                                <input id="param_csv_path" type="text" name="csv_path" value={form.csv_path || ''} onChange={handleChange} style={fieldStyle('csv_path')} placeholder={String.raw`C:\Data\readings.csv`} />
                              {errors.csv_path && <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: '600', marginTop: '3px', display: 'block' }}>{errors.csv_path}</span>}
                            </div>
                          )}
                        </div>
                      ) : form.input_type === 'modbus_rtu' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                            <div>
                              <label htmlFor="param_serial_port" style={s()}>Serial Port *</label>
                              <input id="param_serial_port" type="text" name="serial_port" value={form.serial_port || ''} onChange={handleChange} style={fieldStyle('serial_port')} placeholder="COM1" />
                            </div>
                            <div>
                              <label htmlFor="param_baud_rate" style={s()}>Baud Rate</label>
                              <select id="param_baud_rate" name="baud_rate" value={form.baud_rate || 9600} onChange={handleChange} style={ipt}>
                                {[9600, 19200, 38400, 57600, 115200].map(b => <option key={b} value={b}>{b}</option>)}
                              </select>
                            </div>
                            <div>
                              <label htmlFor="param_slave_id" style={s()}>Slave ID</label>
                              <input id="param_slave_id" type="number" name="slave_id" value={form.slave_id} onChange={handleChange} style={ipt} />
                            </div>
                          </div>
                        </div>
                      ) : form.input_type === 'serial_ascii' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                            <div>
                              <label htmlFor="param_serial_port" style={s()}>Serial Port *</label>
                              <input id="param_serial_port" type="text" name="serial_port" value={form.serial_port || ''} onChange={handleChange} style={fieldStyle('serial_port')} placeholder="COM1" />
                              {errors.serial_port && <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: '600', marginTop: '3px', display: 'block' }}>{errors.serial_port}</span>}
                            </div>
                            <div>
                              <label htmlFor="param_baud_rate" style={s()}>Baud Rate</label>
                              <select id="param_baud_rate" name="baud_rate" value={form.baud_rate || 9600} onChange={handleChange} style={ipt}>
                                {[9600, 19200, 38400, 57600, 115200].map(b => <option key={b} value={b}>{b}</option>)}
                              </select>
                            </div>
                            <div>
                              <label htmlFor="param_command_format" style={s()}>Command Format</label>
                              <select id="param_command_format" name="command_format" value={form.command_format || 'ascii'} onChange={handleChange} style={ipt}>
                                <option value="ascii">ASCII</option>
                                <option value="hex">HEX</option>
                                <option value="auto">AUTO</option>
                              </select>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                              <label htmlFor="param_request_command" style={s()}>Request Command *</label>
                              <input id="param_request_command" type="text" name="request_command" value={form.request_command || ''} onChange={handleChange} style={fieldStyle('request_command')} placeholder="<SOH>R31<CR>" />
                              {errors.request_command && <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: '600', marginTop: '3px', display: 'block' }}>{errors.request_command}</span>}
                            </div>
                            <div>
                              <label htmlFor="param_response_delimiter" style={s()}>Response Delimiter</label>
                              <select id="param_response_delimiter" name="response_delimiter" value={form.response_delimiter || 'newline'} onChange={handleChange} style={ipt}>
                                <option value="newline">Newline (\n)</option>
                                <option value="cr">Carriage Return (\r)</option>
                                <option value="etx">ETX (0x03)</option>
                                <option value="timeout">Timeout</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: CUSTOM_PROTOCOLS.includes(form.input_type) ? '1fr 1fr' : '1fr 1fr 1fr', gap: '12px' }}>
                            <div>
                              <label htmlFor="param_host" style={s()}>IP Address / Host *</label>
                              <input id="param_host" type="text" name="host" value={form.host || ''} onChange={handleChange} style={fieldStyle('host')} placeholder="192.168.1.101" />
                              {errors.host && <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: '600', marginTop: '3px', display: 'block' }}>{errors.host}</span>}
                            </div>
                            <div>
                              <label htmlFor="param_port" style={s()}>Port *</label>
                              <input id="param_port" type="text" name="port" value={form.port || ''} onChange={handleChange} style={fieldStyle('port')} placeholder="502" />
                              {errors.port && <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: '600', marginTop: '3px', display: 'block' }}>{errors.port}</span>}
                            </div>
                            {!CUSTOM_PROTOCOLS.includes(form.input_type) && (
                              <div>
                                <label htmlFor="param_slave_id" style={s()}>Slave ID</label>
                                <input id="param_slave_id" type="number" name="slave_id" value={form.slave_id} onChange={handleChange} style={ipt} />
                              </div>
                            )}
                          </div>
                          {CUSTOM_PROTOCOLS.includes(form.input_type) && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                              <div>
                                <label htmlFor="param_request_hex" style={s()}>Request Hex Command</label>
                                <input id="param_request_hex" type="text" name="request_hex" value={form.request_hex || ''} onChange={handleChange} style={ipt} placeholder="02 4D 31 30 34 30 34 37 43 03" />
                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>Hex bytes sent to device (space-separated)</div>
                              </div>
                              <div>
                                <label htmlFor="param_response_delimiter" style={s()}>Response Delimiter</label>
                                <select id="param_response_delimiter" name="response_delimiter" value={form.response_delimiter || 'newline'} onChange={handleChange} style={ipt}>
                                  <option value="newline">Newline (\n)</option>
                                  <option value="etx">ETX (0x03)</option>
                                </select>
                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>Character that ends the device response</div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                    </div>

                    {form.input_type !== 'csv' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                        {!NON_MODBUS_PROTOCOLS.includes(form.input_type) && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                              <label htmlFor="param_register_type" style={s()}>Function Code</label>
                              <select id="param_register_type" name="register_type" value={form.register_type} onChange={handleChange} style={ipt}>
                                <option value="input_reg">04 Input Register</option>
                                <option value="holding">03 Holding Register</option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor="param_data_type" style={s()}>Data Type</label>
                              <select id="param_data_type" value={getDataTypeLabel(form.data_type, form.byte_order)} onChange={(e) => {
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

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label htmlFor="param_register_address" style={s()}>{CUSTOM_PROTOCOLS.includes(form.input_type) ? 'Field Index' : NON_MODBUS_PROTOCOLS.includes(form.input_type) ? 'Field Index / Address' : 'Start Address'}</label>
                            <input id="param_register_address" type="text" inputMode="numeric" name="register_address" value={form.register_address} onChange={handleChange} style={ipt} />
                            {CUSTOM_PROTOCOLS.includes(form.input_type) && (
                              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>ASCII field index (0-based space-delimited position)</div>
                            )}
                          </div>
                          {!NON_MODBUS_PROTOCOLS.includes(form.input_type) ? (
                            <div>
                              <label htmlFor="param_register_count" style={s()}>Register Count</label>
                              <input id="param_register_count" type="text" inputMode="numeric" name="register_count" value={form.register_count} onChange={handleChange} style={ipt} />
                            </div>
                          ) : (
                            <div>
                              <label htmlFor="param_parse_method" style={s()}>Parse Method</label>
                              <select id="param_parse_method" name="parse_method" value={form.parse_method || 'csv_col'} onChange={handleChange} style={ipt}>
                                <option value="csv_col">CSV Column</option>
                                <option value="position">Position</option>
                                <option value="regex">Regex</option>
                                <option value="delimiter_split">Delimiter Split</option>
                                <option value="key_value">Key-Value ASCII</option>
                                <option value="m10404">Envco M10404 (PM)</option>
                                <option value="af2216">Envco AF2216 (SO2)</option>
                                <option value="ac3216">Envco AC3216 (NO/NO2/NOx)</option>
                              </select>
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
                        <label htmlFor="param_scale_factor" style={s()}>Scale / Gain</label>
                        <input id="param_scale_factor" type="text" inputMode="decimal" name="scale_factor" value={form.scale_factor} onChange={handleChange} style={ipt} />
                      </div>
                      <div>
                        <label htmlFor="param_offset" style={s()}>Offset</label>
                        <input id="param_offset" type="text" inputMode="decimal" name="offset" value={form.offset} onChange={handleChange} style={ipt} />
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                      <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Limits & Warnings</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label htmlFor="param_min_valid" style={s()}>Min Range</label>
                          <input id="param_min_valid" type="number" step="any" name="min_valid" value={form.min_valid ?? ''} onChange={handleChange} style={ipt} placeholder="0.0" />
                        </div>
                        <div>
                          <label htmlFor="param_max_valid" style={s()}>Max Range</label>
                          <input id="param_max_valid" type="number" step="any" name="max_valid" value={form.max_valid ?? ''} onChange={handleChange} style={ipt} placeholder="1000.0" />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '12px' }}>
                        <div>
                          <label htmlFor="param_alarm_low" style={s()}>Warning Low</label>
                          <input id="param_alarm_low" type="number" step="any" name="alarm_low" value={form.alarm_low ?? ''} onChange={handleChange} style={ipt} placeholder="0.0" />
                        </div>
                        <div>
                          <label htmlFor="param_alarm_high" style={s()}>Warning High</label>
                          <input id="param_alarm_high" type="number" step="any" name="alarm_high" value={form.alarm_high ?? ''} onChange={handleChange} style={ipt} placeholder="80.0" />
                        </div>
                        <div>
                          <label htmlFor="param_alarm_enabled" style={s()}>Alarm Enabled</label>
                          <select id="param_alarm_enabled" name="alarm_enabled" value={form.alarm_enabled ? 'Enabled' : 'Disabled'} onChange={(e) => setForm(p => ({ ...p, alarm_enabled: e.target.value === 'Enabled' }))} style={ipt}>
                            <option value="Enabled">Enabled</option>
                            <option value="Disabled">Disabled</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </>
                )}

              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'var(--surface-muted)' }}>
              <button
                type="button"
                onClick={closeModal}
                disabled={isSubmitting}
                style={{ background: '#fff', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  background: isSubmitting ? 'var(--text-secondary)' : 'linear-gradient(135deg, var(--primary-600), var(--primary-400))', color: '#fff', border: 'none',
                  borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: '800',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  boxShadow: isSubmitting ? 'none' : '0 4px 12px rgba(15,118,110,0.3)',
                  display: 'inline-flex', alignItems: 'center', gap: '8px'
                }}
              >
                {isSubmitting ? (
                  <>
                    <span style={{ width: '12px', height: '12px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block' }} />
                    Saving...
                  </>
                ) : (
                  'Save Rule'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Unsaved Changes Confirmation Modal (Directive 4) */}
      {confirmDiscardOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26, 29, 28, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '420px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>Discard Unsaved Changes?</h4>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              You have modified configuration parameters for this Gateway Rule. If you exit now, your unsaved changes will be lost.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setConfirmDiscardOpen(false)}
                style={{ background: 'var(--surface-muted)', color: 'var(--text-primary)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={closeModalDirect}
                style={{ background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
});
