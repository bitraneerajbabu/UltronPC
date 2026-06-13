import React, { useState, useEffect, useCallback } from "react";
import {
  Plus, Pencil, Trash2, X, Save, Loader2, AlertTriangle,
  CheckCircle2, Server, Upload, FileText, Download, RefreshCw,
  ToggleLeft, ToggleRight, Send, Calendar, WifiOff,
} from "lucide-react";
import {
  api,
  type ServerConfig as ServerConfigType,
  type ParameterMappingResponse,
  type ServerMappingBase,
  type BulkMappingUpdate,
} from "@/lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
function Sel({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
    >
      {children}
    </select>
  );
}

const PROTOCOL_OPTIONS = [
  { value: "tspcb", label: "TSPCB (HTTP/JSON)" },
  { value: "cpcb", label: "CPCB (CSV Flat-File)" },
  { value: "both", label: "Both (TSPCB + CPCB)" },
];

// ─── Server Modal ─────────────────────────────────────────────────────────────
function ServerModal({
  server,
  onClose,
  onSaved,
}: {
  server: ServerConfigType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !server;
  const [form, setForm] = useState<Partial<ServerConfigType>>(
    server ?? { name: "", protocol: "tspcb", live_url: "", delay_url: "", cpcb_file_path: "", is_active: true, is_cpcb_active: true }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!form.name?.trim()) { setError("Server name is required."); return; }
    setSaving(true);
    setError(null);
    try {
      if (isNew) await api.createServer(form);
      else await api.updateServer(server!.id, form);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const protocol = form.protocol || "tspcb";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">{isNew ? "Add Push Server" : "Edit Server"}</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"><X size={15} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs"><AlertTriangle size={13} />{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Server Name *"><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="CPCB Server 1" /></Field>
            <Field label="Protocol">
              <Sel value={form.protocol || "tspcb"} onChange={(e) => setForm({ ...form, protocol: e.target.value })}>
                {PROTOCOL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Sel>
            </Field>
          </div>

          {(protocol === "tspcb" || protocol === "both") && (
            <>
              <Field label="Live URL (push every 1 min)"><Input value={form.live_url || ""} onChange={(e) => setForm({ ...form, live_url: e.target.value })} placeholder="http://server.tgpcb.gov.in/live" /></Field>
              <Field label="Delay URL (push every 15 min)"><Input value={form.delay_url || ""} onChange={(e) => setForm({ ...form, delay_url: e.target.value })} placeholder="http://server.tgpcb.gov.in/delay" /></Field>
            </>
          )}

          {(protocol === "cpcb" || protocol === "both") && (
            <Field label="CPCB File Path"><Input value={form.cpcb_file_path || ""} onChange={(e) => setForm({ ...form, cpcb_file_path: e.target.value })} placeholder="C:\CPCB\data.txt" /></Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Active">
              <Sel value={form.is_active ? "true" : "false"} onChange={(e) => setForm({ ...form, is_active: e.target.value === "true" })}>
                <option value="true">Yes</option><option value="false">No</option>
              </Sel>
            </Field>
            {(protocol === "cpcb" || protocol === "both") && (
              <Field label="CPCB Writing Active">
                <Sel value={form.is_cpcb_active ? "true" : "false"} onChange={(e) => setForm({ ...form, is_cpcb_active: e.target.value === "true" })}>
                  <option value="true">Yes</option><option value="false">No</option>
                </Sel>
              </Field>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-white transition-all">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all disabled:opacity-60">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? "Saving…" : isNew ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mapping Table ────────────────────────────────────────────────────────────
function MappingTable({
  servers,
  mappings,
  onUpdate,
}: {
  servers: ServerConfigType[];
  mappings: ParameterMappingResponse[];
  onUpdate: () => void;
}) {
  const [localMappings, setLocalMappings] = useState<ParameterMappingResponse[]>(mappings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setLocalMappings(mappings); }, [mappings]);

  const setField = (paramIdx: number, serverId: number, field: keyof ServerMappingBase, value: unknown) => {
    setLocalMappings((prev) => {
      const next = [...prev];
      const m = { ...next[paramIdx] };
      const existing = m.mappings[serverId] ?? { server_id: serverId, is_active: false };
      m.mappings = { ...m.mappings, [serverId]: { ...existing, [field]: value } };
      next[paramIdx] = m;
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updates: BulkMappingUpdate[] = localMappings.map((m) => ({
        parameter_id: m.parameter_id,
        mappings: m.mappings,
      }));
      await api.updateMappings(updates);
      setSaved(true);
      onUpdate();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!servers.length || !localMappings.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
        <FileText size={32} className="text-slate-200 mb-3" />
        <p className="text-sm font-semibold text-slate-500">No mappings</p>
        <p className="text-xs mt-1">Add a server and some parameters first</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-600 text-xs"><AlertTriangle size={13} />{error}</div>}

      <div className="overflow-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider sticky left-0 bg-slate-50">Station / Parameter</th>
              {servers.map((srv) => (
                <th key={srv.id} colSpan={srv.protocol === "cpcb" ? 3 : 3} className="px-3 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider border-l border-slate-200">
                  <div className="flex items-center justify-center gap-1.5">
                    <Server size={11} />
                    {srv.name}
                    <span className="text-indigo-400 font-normal normal-case">{PROTOCOL_OPTIONS.find((p) => p.value === srv.protocol)?.label.split(" ")[0]}</span>
                  </div>
                </th>
              ))}
            </tr>
            <tr className="bg-white border-b border-slate-100 text-[9px] text-slate-400 uppercase tracking-wider">
              <th className="px-4 py-1.5 text-left sticky left-0 bg-white">Tag Name</th>
              {servers.map((srv) => (
                <React.Fragment key={srv.id}>
                  <th className="px-2 py-1.5 border-l border-slate-100">
                    {srv.protocol === "cpcb" || srv.protocol === "both" ? "CPCB Station" : "Device ID"}
                  </th>
                  <th className="px-2 py-1.5">
                    {srv.protocol === "cpcb" || srv.protocol === "both" ? "CPCB Param" : "Var Name"}
                  </th>
                  <th className="px-2 py-1.5 text-center">Enable</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {localMappings.map((row, paramIdx) => (
              <tr key={row.parameter_id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-2 sticky left-0 bg-white hover:bg-slate-50 transition-colors">
                  <div>
                    <span className="font-mono font-semibold text-slate-700">{row.parameter_name}</span>
                    <span className="text-[10px] text-slate-400 block">{row.station_name}</span>
                  </div>
                </td>
                {servers.map((srv) => {
                  const m = row.mappings[srv.id] ?? { server_id: srv.id, is_active: false };
                  const isCpcb = srv.protocol === "cpcb" || srv.protocol === "both";
                  return (
                    <React.Fragment key={srv.id}>
                      <td className="px-2 py-1.5 border-l border-slate-100">
                        <input
                          value={isCpcb ? (m.cpcb_station_name || "") : (m.api_id || "")}
                          onChange={(e) => setField(paramIdx, srv.id, isCpcb ? "cpcb_station_name" : "api_id", e.target.value)}
                          placeholder={isCpcb ? "StationName" : "DeviceID"}
                          className="w-full h-7 px-2 rounded border border-slate-200 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={isCpcb ? (m.cpcb_parameter || "") : (m.api_vname || "")}
                          onChange={(e) => setField(paramIdx, srv.id, isCpcb ? "cpcb_parameter" : "api_vname", e.target.value)}
                          placeholder={isCpcb ? "PM10" : "VarName"}
                          className="w-full h-7 px-2 rounded border border-slate-200 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => setField(paramIdx, srv.id, "is_active", !m.is_active)}
                          className={`transition-colors ${m.is_active ? "text-indigo-500 hover:text-indigo-700" : "text-slate-300 hover:text-slate-500"}`}
                        >
                          {m.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                        </button>
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        {saved && <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold"><CheckCircle2 size={13} />Mappings saved</span>}
        <div className="ml-auto">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all disabled:opacity-60 shadow-sm shadow-indigo-600/20"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? "Saving…" : "Save Mappings"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CPCB Actions Card ─────────────────────────────────────────────────────────
function CpcbActionsCard({ servers }: { servers: ServerConfigType[] }) {
  const cpcbServers = servers.filter((s) => s.protocol === "cpcb" || s.protocol === "both");
  const [selectedServer, setSelectedServer] = useState<number | null>(cpcbServers[0]?.id ?? null);
  const [histDate, setHistDate] = useState(new Date().toISOString().split("T")[0]);
  const [generating, setGenerating] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showMsg = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await api.triggerCpcb();
      showMsg("success", "CPCB file write triggered — check configured file path.");
    } catch (e: any) { showMsg("error", e.message); }
    finally { setTriggering(false); }
  };

  const handleHistorical = async () => {
    if (!selectedServer) return;
    setGenerating(true);
    try {
      const content = await api.generateHistoricalCpcb(selectedServer, histDate);
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cpcb_${histDate}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showMsg("success", "Historical CPCB file downloaded.");
    } catch (e: any) { showMsg("error", e.message); }
    finally { setGenerating(false); }
  };

  const handleTest = async () => {
    const tspcbServer = servers.find((s) => s.protocol === "tspcb" || s.protocol === "both");
    if (!tspcbServer) { showMsg("error", "No TSPCB server configured."); return; }
    setTesting(true);
    try {
      const res: any = await api.testServerPush(tspcbServer.id);
      const allOk = res.results?.every((r: any) => r.success);
      showMsg(allOk ? "success" : "error", allOk ? `Test push succeeded for ${res.results.length} device(s).` : `Some pushes failed. Check logs.`);
    } catch (e: any) { showMsg("error", e.message); }
    finally { setTesting(false); }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <FileText size={15} className="text-slate-400" />
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Data Push Actions</h3>
      </div>
      <div className="px-5 py-5 space-y-5">
        {msg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg border text-xs font-semibold ${msg.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
            {msg.type === "success" ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
            {msg.text}
          </div>
        )}

        {/* Trigger now */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600">Write CPCB File Now</p>
          <p className="text-[11px] text-slate-400">Immediately writes all pending 15-minute averages to the CPCB flat-file.</p>
          <button
            onClick={handleTrigger}
            disabled={triggering || cpcbServers.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            {triggering ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {triggering ? "Writing…" : "Write CPCB File Now"}
          </button>
        </div>

        <hr className="border-slate-100" />

        {/* Historical */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600">Download Historical File</p>
          <p className="text-[11px] text-slate-400">Generate a makeup file for a specific date and download it as .txt</p>
          <div className="flex items-center gap-2">
            {cpcbServers.length > 1 && (
              <select
                value={selectedServer ?? ""}
                onChange={(e) => setSelectedServer(Number(e.target.value))}
                className="h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                {cpcbServers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <input
              type="date"
              value={histDate}
              onChange={(e) => setHistDate(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button
              onClick={handleHistorical}
              disabled={generating || !selectedServer}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all disabled:opacity-50 shadow-sm shadow-indigo-600/20"
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Download
            </button>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Test Push */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600">Test TSPCB API Push</p>
          <p className="text-[11px] text-slate-400">Sends a live data push immediately to the TSPCB server for testing.</p>
          <button
            onClick={handleTest}
            disabled={testing || !servers.some((s) => s.protocol === "tspcb" || s.protocol === "both")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            {testing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {testing ? "Testing…" : "Send Test Push"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ServerConfig() {
  const [servers, setServers] = useState<ServerConfigType[]>([]);
  const [mappings, setMappings] = useState<ParameterMappingResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ server: ServerConfigType | null; open: boolean }>({ server: null, open: false });

  const loadAll = useCallback(async () => {
    try {
      const [srv, map] = await Promise.all([api.getServers(), api.getMappings()]);
      setServers(srv);
      setMappings(map);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this server? All parameter mappings for it will be removed.")) return;
    try {
      await api.deleteServer(id);
      loadAll();
    } catch (e: any) { alert(`Delete failed: ${e.message}`); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Server Configuration</h1>
          <p className="text-xs text-slate-400 mt-0.5">Manage CPCB/TSPCB push servers, parameter mappings, and file generation</p>
        </div>
        <button
          onClick={() => setModal({ server: null, open: true })}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm shadow-indigo-600/20"
          id="btn-add-server"
        >
          <Plus size={14} /> Add Server
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
          <WifiOff size={15} />
          <span><strong>Cannot reach backend:</strong> {error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Server List */}
        <div className="xl:col-span-1 space-y-3">
          {loading ? (
            <div className="py-8 text-center"><Loader2 size={18} className="animate-spin text-indigo-400 mx-auto" /></div>
          ) : servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 bg-white border-2 border-dashed border-slate-200 rounded-2xl text-center">
              <Server size={28} className="text-slate-200 mb-3" />
              <p className="text-xs font-semibold text-slate-500">No servers configured</p>
              <p className="text-[11px] text-slate-400 mt-1">Click "Add Server" to get started</p>
            </div>
          ) : (
            servers.map((srv) => (
              <div key={srv.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${srv.is_active ? "bg-indigo-50 ring-2 ring-indigo-100" : "bg-slate-100"}`}>
                      <Server size={15} className={srv.is_active ? "text-indigo-600" : "text-slate-400"} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{srv.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">
                        {PROTOCOL_OPTIONS.find((p) => p.value === srv.protocol)?.label}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setModal({ server: srv, open: true })} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"><Pencil size={13} /></button>
                    <button onClick={() => handleDelete(srv.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"><Trash2 size={13} /></button>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-[10px] text-slate-400">
                  {srv.live_url && <p className="truncate">↑ Live: {srv.live_url}</p>}
                  {srv.delay_url && <p className="truncate">↑ Delay: {srv.delay_url}</p>}
                  {srv.cpcb_file_path && <p className="truncate flex items-center gap-1"><FileText size={10} />{srv.cpcb_file_path}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold uppercase ${srv.is_active ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-100 border-slate-200 text-slate-400"}`}>
                      {srv.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
          {/* Actions card */}
          {servers.length > 0 && <CpcbActionsCard servers={servers} />}
        </div>

        {/* Mapping Table */}
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-slate-400" />
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Parameter Mappings</h3>
            </div>
            <button onClick={loadAll} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"><RefreshCw size={13} /></button>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="py-8 text-center"><Loader2 size={18} className="animate-spin text-indigo-400 mx-auto" /></div>
            ) : (
              <MappingTable servers={servers} mappings={mappings} onUpdate={loadAll} />
            )}
          </div>
        </div>
      </div>

      {modal.open && (
        <ServerModal
          server={modal.server}
          onClose={() => setModal({ server: null, open: false })}
          onSaved={loadAll}
        />
      )}
    </div>
  );
}
