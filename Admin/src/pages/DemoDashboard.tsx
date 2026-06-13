import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Radio,
  Cpu,
  Wifi,
  WifiOff,
  RefreshCw,
  Circle,
  BarChart3,
  Layers,
  Zap,
} from "lucide-react";
import { api, WsMessage, LiveDataPoint, Station, AppInfo, PollingStatus, WS_URL } from "@/lib/api";

// ─── Quality badge ────────────────────────────────────────────────────────────
function QualityBadge({ quality }: { quality: string }) {
  const map: Record<string, string> = {
    good: "bg-emerald-50 text-emerald-700 border-emerald-200",
    out_of_range: "bg-amber-50 text-amber-700 border-amber-200",
    uncertain: "bg-yellow-50 text-yellow-700 border-yellow-200",
    bad: "bg-red-50 text-red-600 border-red-200",
    comms_fail: "bg-slate-100 text-slate-500 border-slate-200",
    sensor_fail: "bg-rose-50 text-rose-600 border-rose-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${map[quality] || "bg-slate-100 text-slate-500 border-slate-200"}`}>
      {quality.replace(/_/g, " ")}
    </span>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-emerald-500",
    offline: "bg-slate-300",
    delay: "bg-amber-400",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || "bg-slate-300"}`} />;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "indigo",
  pulse = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent?: string;
  pulse?: boolean;
}) {
  const accents: Record<string, { bg: string; icon: string; ring: string }> = {
    indigo: { bg: "bg-indigo-50", icon: "text-indigo-600", ring: "ring-indigo-100" },
    emerald: { bg: "bg-emerald-50", icon: "text-emerald-600", ring: "ring-emerald-100" },
    amber: { bg: "bg-amber-50", icon: "text-amber-600", ring: "ring-amber-100" },
    sky: { bg: "bg-sky-50", icon: "text-sky-600", ring: "ring-sky-100" },
  };
  const a = accents[accent];
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl ring-2 flex items-center justify-center shrink-0 ${a.bg} ${a.ring}`}>
        <Icon size={20} className={a.icon} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-extrabold text-slate-800 leading-none flex items-center gap-2">
          {value}
          {pulse && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
        </p>
        {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function DemoDashboard() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [polling, setPolling] = useState<PollingStatus | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [liveData, setLiveData] = useState<Map<number, LiveDataPoint>>(new Map());
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load REST data ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [infoRes, pollRes, stationsRes] = await Promise.allSettled([
        api.getInfo(),
        api.getPollingStatus(),
        api.getStations(),
      ]);
      if (infoRes.status === "fulfilled") setInfo(infoRes.value);
      if (pollRes.status === "fulfilled") setPolling(pollRes.value);
      if (stationsRes.status === "fulfilled") setStations(stationsRes.value);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setWsStatus("connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setWsStatus("connected");

    ws.onmessage = (e) => {
      try {
        const msg: WsMessage = JSON.parse(e.data);
        if (msg.type === "live_data" && msg.data) {
          setLiveData((prev) => {
            const next = new Map(prev);
            for (const pt of msg.data!) next.set(pt.parameter_id, pt);
            return next;
          });
          setLastUpdate(new Date().toLocaleTimeString("en-IN", { hour12: true }));
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
      reconnectTimer.current = setTimeout(connectWs, 5000);
    };

    ws.onerror = () => { ws.close(); };
  }, []);

  useEffect(() => {
    connectWs();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  const livePoints = Array.from(liveData.values()).sort((a, b) =>
    a.station_name.localeCompare(b.station_name) || a.tag_name.localeCompare(b.tag_name)
  );

  const onlineStations = stations.filter((s) => s.status === "online").length;
  const goodPoints = livePoints.filter((p) => p.quality === "good" || p.quality === "out_of_range").length;
  const badPoints = livePoints.filter((p) => p.quality === "comms_fail" || p.quality === "bad" || p.quality === "sensor_fail").length;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Live Dashboard</h1>
          <p className="text-xs text-slate-400 mt-0.5">Real-time telemetry from all connected devices</p>
        </div>
        <div className="flex items-center gap-3">
          {/* WS Status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
            wsStatus === "connected" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : wsStatus === "connecting" ? "bg-amber-50 border-amber-200 text-amber-700"
            : "bg-slate-100 border-slate-200 text-slate-500"
          }`}>
            {wsStatus === "connected" ? <Wifi size={13} /> : wsStatus === "connecting" ? <RefreshCw size={13} className="animate-spin" /> : <WifiOff size={13} />}
            {wsStatus === "connected" ? `Live · ${lastUpdate || "—"}` : wsStatus === "connecting" ? "Connecting…" : "Disconnected"}
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-semibold transition-all"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
          <WifiOff size={16} className="shrink-0" />
          <div>
            <p className="font-semibold">Cannot reach UltrON backend</p>
            <p className="text-rose-500 mt-0.5">{error} — Is the app running at localhost:8000?</p>
          </div>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Stations"
          value={loading ? "—" : info?.stations ?? stations.length}
          sub={`${onlineStations} online`}
          icon={Radio}
          accent="indigo"
        />
        <KpiCard
          label="Devices"
          value={loading ? "—" : info?.devices ?? "—"}
          sub={polling ? `${polling.active_poll_loops} polling` : ""}
          icon={Cpu}
          accent="sky"
          pulse={polling?.running}
        />
        <KpiCard
          label="Parameters"
          value={loading ? "—" : info?.parameters ?? "—"}
          sub={`${livePoints.length} live values`}
          icon={Activity}
          accent="emerald"
        />
        <KpiCard
          label="Data Quality"
          value={livePoints.length ? `${goodPoints}/${livePoints.length}` : "—"}
          sub={badPoints > 0 ? `${badPoints} with fault` : "All healthy"}
          icon={badPoints > 0 ? AlertTriangle : CheckCircle2}
          accent={badPoints > 0 ? "amber" : "emerald"}
        />
      </div>

      {/* ── Main panels ── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

        {/* Station List */}
        <div className="xl:col-span-1 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Layers size={15} className="text-slate-400" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Stations</h3>
            <span className="ml-auto text-[10px] font-semibold text-slate-400">{stations.length} total</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
            {stations.length === 0 && !loading && (
              <div className="px-5 py-8 text-center text-xs text-slate-400">
                No stations configured.<br />Add one in Device Config.
              </div>
            )}
            {loading && (
              <div className="px-5 py-8 text-center">
                <RefreshCw size={18} className="animate-spin text-indigo-400 mx-auto" />
              </div>
            )}
            {stations.map((st) => (
              <div key={st.id} className="px-5 py-3 hover:bg-slate-50 transition-all">
                <div className="flex items-center gap-2">
                  <StatusDot status={st.status} />
                  <span className="text-xs font-semibold text-slate-700 truncate">{st.name}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 pl-4 capitalize">{st.status}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Live Data Table */}
        <div className="xl:col-span-3 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Zap size={15} className="text-indigo-500" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Live Parameter Values</h3>
            {wsStatus === "connected" && (
              <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-600 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Streaming
              </span>
            )}
          </div>
          <div className="overflow-auto max-h-[480px]">
            {livePoints.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                <BarChart3 size={32} className="mb-3 text-slate-200" />
                <p className="text-sm font-semibold text-slate-500">No live data yet</p>
                <p className="text-xs mt-1">
                  {wsStatus === "connected"
                    ? "Waiting for first poll cycle…"
                    : "WebSocket not connected. Ensure UltrON backend is running."}
                </p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Station</th>
                    <th className="px-4 py-3 text-left">Device</th>
                    <th className="px-4 py-3 text-left">Parameter</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3 text-center">Quality</th>
                    <th className="px-4 py-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {livePoints.map((pt) => (
                    <tr
                      key={pt.parameter_id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-slate-600 font-medium truncate max-w-[120px]">{pt.station_name}</td>
                      <td className="px-4 py-2.5 text-slate-500 truncate max-w-[120px]">{pt.device_name}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700 font-mono">{pt.tag_name}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-800 font-mono tabular-nums">
                        {pt.value !== null && pt.value !== undefined
                          ? `${Number(pt.value).toFixed(2)} ${pt.unit || ""}`
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <QualityBadge quality={pt.quality} />
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums">
                        {pt.timestamp ? new Date(pt.timestamp).toLocaleTimeString("en-IN", { hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
