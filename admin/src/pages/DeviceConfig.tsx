import React, { useState, useEffect, useCallback } from "react";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, Cpu, Radio,
  Activity, CheckCircle2, AlertTriangle, Loader2, X, Save,
  Wifi, WifiOff, RefreshCw, Settings2, Cable,
} from "lucide-react";
import {
  api, Station, Device, Parameter, ConnectionTestResult,
} from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
type Protocol = "modbus_tcp" | "modbus_rtu" | "tcp_custom" | "csv" | "opc_ua";

const PROTOCOLS: { value: Protocol; label: string }[] = [
  { value: "modbus_tcp", label: "Modbus TCP" },
  { value: "modbus_rtu", label: "Modbus RTU / RS485" },
  { value: "tcp_custom", label: "TCP Custom" },
  { value: "csv", label: "CSV File" },
  { value: "opc_ua", label: "OPC-UA" },
];

const REGISTER_TYPES = ["holding", "input", "coil", "discrete_input"];
const DATA_TYPES = ["int16", "uint16", "int32", "uint32", "float32", "float64"];
const BYTE_ORDERS = ["AB", "BA", "ABCD", "DCBA", "BADC", "CDAB"];
const PARITIES = ["N", "E", "O"];

// ─── Small helpers ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}
function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all placeholder-slate-300 ${props.className ?? ""}`}
    />
  );
}
function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all ${props.className ?? ""}`}
    >
      {children}
    </select>
  );
}
function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${
        status === "online" ? "bg-emerald-500" : status === "delay" ? "bg-amber-400" : "bg-slate-300"
      }`}
    />
  );
}

// ─── Default Device Form ──────────────────────────────────────────────────────
function emptyDevice(stationId: number): Partial<Device> {
  return {
    station_id: stationId,
    name: "",
    protocol: "modbus_tcp",
    host: "",
    port: 502,
    slave_id: 1,
    poll_interval: 60,
    timeout: 5,
    is_active: true,
    parameters: [],
  };
}

function emptyParameter(): Partial<Parameter> {
  return {
    name: "",
    tag_name: "",
    unit: "",
    register_address: 0,
    register_count: 2,
    register_type: "holding",
    data_type: "float32",
    byte_order: "ABCD",
    scale_factor: 1,
    offset: 0,
    is_active: true,
    display_order: 0,
  };
}

// ─── Parameter Row (in modal) ─────────────────────────────────────────────────
function ParamRow({
  param,
  index,
  onChange,
  onRemove,
}: {
  param: Partial<Parameter>;
  index: number;
  onChange: (p: Partial<Parameter>) => void;
  onRemove: () => void;
}) {
  return (
    <tr className="border-b border-slate-100 text-xs">
      <td className="pr-2 py-1.5">
        <Input
          value={param.name || ""}
          onChange={(e) => onChange({ ...param, name: e.target.value })}
          placeholder="PM10"
        />
      </td>
      <td className="pr-2 py-1.5">
        <Input
          value={param.unit || ""}
          onChange={(e) => onChange({ ...param, unit: e.target.value })}
          placeholder="µg/m³"
        />
      </td>
      <td className="pr-2 py-1.5">
        <Input
          type="number"
          value={param.register_address ?? 0}
          onChange={(e) => onChange({ ...param, register_address: Number(e.target.value) })}
          className="w-20"
        />
      </td>
      <td className="pr-2 py-1.5">
        <Select
          value={param.data_type || "float32"}
          onChange={(e) => onChange({ ...param, data_type: e.target.value })}
        >
          {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </td>
      <td className="pr-2 py-1.5">
        <Input
          type="number"
          step="0.001"
          value={param.scale_factor ?? 1}
          onChange={(e) => onChange({ ...param, scale_factor: Number(e.target.value) })}
          className="w-20"
        />
      </td>
      <td className="py-1.5 text-center">
        <button
          type="button"
          onClick={onRemove}
          className="text-rose-400 hover:text-rose-600 transition-all p-1 rounded"
        >
          <X size={13} />
        </button>
      </td>
    </tr>
  );
}

// ─── Device Modal ─────────────────────────────────────────────────────────────
function DeviceModal({
  device,
  stationId,
  onClose,
  onSaved,
}: {
  device: Partial<Device> | null;
  stationId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !device?.id;
  const [form, setForm] = useState<Partial<Device>>(
    device ?? emptyDevice(stationId)
  );
  const [params, setParams] = useState<Partial<Parameter>[]>(
    device?.parameters ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const protocol = form.protocol as Protocol;

  const handleSave = async () => {
    if (!form.name?.trim()) { setError("Device name is required."); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, parameters: params as Parameter[] };
      let saved: Device;
      if (isNew) {
        saved = await api.createDevice(payload);
      } else {
        saved = await api.updateDevice(device!.id!, payload);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!device?.id) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testDeviceConnection(device.id);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ success: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  const addParam = () => setParams((p) => [...p, emptyParameter()]);
  const removeParam = (i: number) => setParams((p) => p.filter((_, idx) => idx !== i));
  const updateParam = (i: number, p: Partial<Parameter>) =>
    setParams((arr) => arr.map((old, idx) => (idx === i ? p : old)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-800">{isNew ? "Add Device" : "Edit Device"}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Configure connection and parameters</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Device Name *">
              <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Analyzer Unit 1" />
            </Field>
            <Field label="Protocol">
              <Select value={form.protocol || "modbus_tcp"} onChange={(e) => setForm({ ...form, protocol: e.target.value })}>
                {PROTOCOLS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Poll Interval (s)">
              <Input type="number" value={form.poll_interval ?? 60} onChange={(e) => setForm({ ...form, poll_interval: Number(e.target.value) })} />
            </Field>
            <Field label="Timeout (s)">
              <Input type="number" value={form.timeout ?? 5} onChange={(e) => setForm({ ...form, timeout: Number(e.target.value) })} />
            </Field>
            <Field label="Active">
              <Select value={form.is_active ? "true" : "false"} onChange={(e) => setForm({ ...form, is_active: e.target.value === "true" })}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </Field>
          </div>

          {/* Protocol-specific fields */}
          {(protocol === "modbus_tcp" || protocol === "tcp_custom") && (
            <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <Field label="Host / IP">
                <Input value={form.host || ""} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="192.168.1.100" />
              </Field>
              <Field label="Port">
                <Input type="number" value={form.port ?? 502} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
              </Field>
              <Field label="Slave ID">
                <Input type="number" value={form.slave_id ?? 1} onChange={(e) => setForm({ ...form, slave_id: Number(e.target.value) })} />
              </Field>
            </div>
          )}

          {protocol === "modbus_rtu" && (
            <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <Field label="Serial Port">
                <Input value={form.serial_port || ""} onChange={(e) => setForm({ ...form, serial_port: e.target.value })} placeholder="COM3" />
              </Field>
              <Field label="Baud Rate">
                <Input type="number" value={form.baud_rate ?? 9600} onChange={(e) => setForm({ ...form, baud_rate: Number(e.target.value) })} />
              </Field>
              <Field label="Slave ID">
                <Input type="number" value={form.slave_id ?? 1} onChange={(e) => setForm({ ...form, slave_id: Number(e.target.value) })} />
              </Field>
              <Field label="Data Bits">
                <Input type="number" value={form.data_bits ?? 8} onChange={(e) => setForm({ ...form, data_bits: Number(e.target.value) })} />
              </Field>
              <Field label="Parity">
                <Select value={form.parity ?? "N"} onChange={(e) => setForm({ ...form, parity: e.target.value })}>
                  {PARITIES.map((p) => <option key={p} value={p}>{p === "N" ? "None (N)" : p === "E" ? "Even (E)" : "Odd (O)"}</option>)}
                </Select>
              </Field>
              <Field label="Stop Bits">
                <Input type="number" value={form.stop_bits ?? 1} onChange={(e) => setForm({ ...form, stop_bits: Number(e.target.value) })} />
              </Field>
            </div>
          )}

          {protocol === "csv" && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <Field label="CSV File Path">
                <Input value={form.csv_path || ""} onChange={(e) => setForm({ ...form, csv_path: e.target.value })} placeholder="C:\data\readings.csv" />
              </Field>
              <Field label="Delimiter">
                <Input value={form.csv_delimiter || ","} onChange={(e) => setForm({ ...form, csv_delimiter: e.target.value })} placeholder="," />
              </Field>
            </div>
          )}

          {/* Test Connection */}
          {!isNew && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-all disabled:opacity-60"
              >
                {testing ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
                Test Connection
              </button>
              {testResult && (
                <div className={`flex items-center gap-1.5 text-xs font-semibold ${testResult.success ? "text-emerald-600" : "text-rose-500"}`}>
                  {testResult.success ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  {testResult.message}
                  {testResult.latency_ms && <span className="text-slate-400 font-normal">({testResult.latency_ms}ms)</span>}
                </div>
              )}
            </div>
          )}

          {/* Parameters */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Parameters</p>
              <button
                type="button"
                onClick={addParam}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 transition-all"
              >
                <Plus size={12} /> Add Parameter
              </button>
            </div>
            {params.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No parameters yet. Click "Add Parameter" to start.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Unit</th>
                      <th className="px-3 py-2 text-left">Reg Addr</th>
                      <th className="px-3 py-2 text-left">Data Type</th>
                      <th className="px-3 py-2 text-left">Scale</th>
                      <th className="px-3 py-2 text-center">Del</th>
                    </tr>
                  </thead>
                  <tbody className="px-3 py-1">
                    {params.map((p, i) => (
                      <ParamRow
                        key={i}
                        param={p}
                        index={i}
                        onChange={(updated) => updateParam(i, updated)}
                        onRemove={() => removeParam(i)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-white transition-all">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all disabled:opacity-60 shadow-sm shadow-indigo-600/20"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? "Saving…" : isNew ? "Create Device" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Device Card ──────────────────────────────────────────────────────────────
function DeviceCard({
  device,
  onEdit,
  onDelete,
  onRefresh,
}: {
  device: Device;
  onEdit: (d: Device) => void;
  onDelete: (id: number) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete device "${device.name}"? This will remove all its parameters and live data.`)) return;
    setDeleting(true);
    try {
      await api.deleteDevice(device.id);
      onRefresh();
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const protocolLabel = PROTOCOLS.find((p) => p.value === device.protocol)?.label ?? device.protocol;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-50 ring-2 ring-indigo-100 flex items-center justify-center shrink-0">
          <Cpu size={15} className="text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot status={device.status} />
            <span className="text-xs font-bold text-slate-800 truncate">{device.name}</span>
            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-semibold">{protocolLabel}</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 pl-4">
            {device.host ? `${device.host}:${device.port}` : device.serial_port || "—"} · {device.poll_interval}s poll
            {device.last_poll && ` · Last: ${new Date(device.last_poll).toLocaleTimeString("en-IN", { hour12: true })}`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(device)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all disabled:opacity-50"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100">
          {!device.parameters?.length ? (
            <p className="px-4 py-3 text-xs text-slate-400">No parameters configured.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-4 py-2 text-left">Tag</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Unit</th>
                  <th className="px-4 py-2 text-left">Reg</th>
                  <th className="px-4 py-2 text-left">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {device.parameters.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono font-semibold text-slate-700">{p.tag_name}</td>
                    <td className="px-4 py-2 text-slate-600">{p.name}</td>
                    <td className="px-4 py-2 text-slate-400">{p.unit || "—"}</td>
                    <td className="px-4 py-2 text-slate-500 font-mono">{p.register_address}</td>
                    <td className="px-4 py-2 text-slate-400">{p.data_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DeviceConfig() {
  const [stations, setStations] = useState<Station[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedStation, setSelectedStation] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ device: Partial<Device> | null; open: boolean }>({ device: null, open: false });
  const [addingStation, setAddingStation] = useState(false);
  const [newStationName, setNewStationName] = useState("");

  const loadStations = useCallback(async () => {
    try {
      const st = await api.getStations();
      setStations(st);
      if (st.length > 0 && !selectedStation) setSelectedStation(st[0].id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedStation]);

  const loadDevices = useCallback(async (stationId: number) => {
    try {
      const devs = await api.getDevices(stationId);
      setDevices(devs);
    } catch { setDevices([]); }
  }, []);

  useEffect(() => { loadStations(); }, []);
  useEffect(() => { if (selectedStation) loadDevices(selectedStation); }, [selectedStation]);

  const handleAddStation = async () => {
    if (!newStationName.trim()) return;
    try {
      await api.createStation({ name: newStationName.trim(), station_type: "AAQMS", status: "offline", is_active: true });
      setNewStationName("");
      setAddingStation(false);
      await loadStations();
    } catch (e: any) { alert(`Failed: ${e.message}`); }
  };

  const handleSaved = () => {
    if (selectedStation) loadDevices(selectedStation);
  };

  const stationDevices = devices.filter((d) => d.station_id === selectedStation);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Device Configuration</h1>
          <p className="text-xs text-slate-400 mt-0.5">Manage stations, devices, and measurement parameters</p>
        </div>
        <button
          onClick={() => setModal({ device: null, open: true })}
          disabled={!selectedStation}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm shadow-indigo-600/20"
          id="btn-add-device"
        >
          <Plus size={14} /> Add Device
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
          <WifiOff size={15} />
          <span><strong>Backend not reachable:</strong> {error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── Station Panel ── */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio size={14} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Stations</span>
            </div>
            <button
              onClick={() => setAddingStation(true)}
              className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
              title="Add station"
            >
              <Plus size={14} />
            </button>
          </div>

          {addingStation && (
            <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
              <input
                value={newStationName}
                onChange={(e) => setNewStationName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddStation(); if (e.key === "Escape") setAddingStation(false); }}
                placeholder="Station name…"
                autoFocus
                className="flex-1 h-8 px-2 rounded border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <button onClick={handleAddStation} className="text-emerald-600 hover:text-emerald-700"><CheckCircle2 size={15} /></button>
              <button onClick={() => setAddingStation(false)} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
            </div>
          )}

          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {loading && <div className="py-8 text-center"><Loader2 size={18} className="animate-spin text-indigo-400 mx-auto" /></div>}
            {!loading && stations.length === 0 && (
              <div className="py-8 px-4 text-center text-xs text-slate-400">
                No stations yet.<br />Click + to add one.
              </div>
            )}
            {stations.map((st) => (
              <button
                key={st.id}
                onClick={() => setSelectedStation(st.id)}
                className={`w-full flex items-center gap-2 px-4 py-3 text-left transition-all ${
                  selectedStation === st.id
                    ? "bg-indigo-50 border-r-2 border-indigo-500"
                    : "hover:bg-slate-50"
                }`}
              >
                <StatusDot status={st.status} />
                <span className={`text-xs font-semibold truncate ${selectedStation === st.id ? "text-indigo-700" : "text-slate-700"}`}>
                  {st.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Devices Panel ── */}
        <div className="lg:col-span-3 space-y-3">
          {selectedStation ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">
                  {stationDevices.length} device{stationDevices.length !== 1 ? "s" : ""} in{" "}
                  <span className="text-slate-700">{stations.find((s) => s.id === selectedStation)?.name}</span>
                </p>
                <button
                  onClick={() => loadDevices(selectedStation)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-all"
                >
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>
              {stationDevices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white border-2 border-dashed border-slate-200 rounded-2xl text-center">
                  <Cpu size={32} className="text-slate-200 mb-3" />
                  <p className="text-sm font-semibold text-slate-500">No devices in this station</p>
                  <p className="text-xs text-slate-400 mt-1">Click "Add Device" to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {stationDevices.map((d) => (
                    <DeviceCard
                      key={d.id}
                      device={d}
                      onEdit={(dev) => setModal({ device: dev, open: true })}
                      onDelete={async (id) => { await api.deleteDevice(id); loadDevices(selectedStation!); }}
                      onRefresh={() => loadDevices(selectedStation!)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
              <Cable size={32} className="text-slate-200 mb-3" />
              <p className="text-sm font-semibold text-slate-500">Select a station</p>
              <p className="text-xs mt-1">Choose from the left panel to see its devices</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal.open && selectedStation && (
        <DeviceModal
          device={modal.device}
          stationId={selectedStation}
          onClose={() => setModal({ device: null, open: false })}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
