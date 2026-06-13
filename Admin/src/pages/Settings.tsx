import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Cpu,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  GitCommitHorizontal,
  Server,
  Activity,
  Loader2,
  WifiOff,
  Info,
  Zap,
  ArrowDownToLine,
  RotateCcw,
} from "lucide-react";
import {
  api,
  FirmwareInfo,
  FirmwareDownloadStatus,
  AppInfo,
  PollingStatus,
} from "@/lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
}

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 font-medium">{label}</span>
      <span className={`text-xs font-semibold text-slate-800 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
  accent = "indigo",
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: string;
}) {
  const accentMap: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-start gap-4 px-6 py-5 border-b border-slate-100">
        <div className={`w-10 h-10 rounded-xl ring-2 flex items-center justify-center shrink-0 ${accentMap[accent]}`}>
          <Icon size={18} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── Download Progress Bar ────────────────────────────────────────────────────
function ProgressBar({ percent, state }: { percent: number; state: string }) {
  const colors: Record<string, string> = {
    downloading: "bg-indigo-500",
    done: "bg-emerald-500",
    error: "bg-rose-500",
  };
  return (
    <div className="space-y-1.5">
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colors[state] ?? "bg-indigo-500"} ${state === "downloading" ? "animate-pulse" : ""}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{percent}%</span>
        <span>{state === "done" ? "Complete" : state === "error" ? "Failed" : "Downloading…"}</span>
      </div>
    </div>
  );
}

// ─── Firmware Card ────────────────────────────────────────────────────────────
function FirmwareCard() {
  const [firmware, setFirmware] = useState<FirmwareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [checked, setChecked] = useState(false);
  const [dlStatus, setDlStatus] = useState<FirmwareDownloadStatus | null>(null);
  const [downloading, setDownloading] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  };

  const checkFirmware = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getFirmware();
      setFirmware(data);
      setChecked(true);
    } catch (e: any) {
      setError(e.message || "Failed to reach update server");
    } finally {
      setLoading(false);
    }
  }, []);

  const startDownload = async () => {
    setDownloading(true);
    setDlStatus({ state: "downloading", percent: 0, message: "Initiating download…", restart_required: false });
    try {
      await api.downloadFirmware();
      // Poll status every 2s
      pollTimer.current = setInterval(async () => {
        try {
          const status = await api.getFirmwareDownloadStatus();
          setDlStatus(status);
          if (status.state === "done" || status.state === "error") {
            stopPolling();
            setDownloading(false);
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch (e: any) {
      setDlStatus({ state: "error", percent: 0, message: e.message, restart_required: false });
      setDownloading(false);
    }
  };

  useEffect(() => () => stopPolling(), []);

  return (
    <SectionCard
      icon={Cpu}
      title="Firmware Update"
      subtitle="Check and download the latest UltrON release from the official repository"
      accent="indigo"
    >
      <div className="space-y-5">
        {/* Version Status Bar */}
        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-indigo-600/20">U</div>
            <div>
              <p className="text-xs font-bold text-slate-700">UltrON Installed</p>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">v{firmware?.current_version ?? "—"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {checked && firmware && (
              firmware.update_available ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold uppercase tracking-wide">
                  <AlertTriangle size={10} /> Update Available
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold uppercase tracking-wide">
                  <CheckCircle2 size={10} /> Up to Date
                </span>
              )
            )}
            <button
              id="btn-check-firmware"
              onClick={checkFirmware}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold transition-all shadow-sm shadow-indigo-600/20 active:scale-95"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {loading ? "Checking…" : checked ? "Re-check" : "Check for Updates"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
            <WifiOff size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold">Could not reach update server</p>
              <p className="text-[11px] mt-0.5 text-rose-500">{error}</p>
            </div>
          </div>
        )}

        {/* Result Panel */}
        {firmware && checked && !error && (
          <div className={`rounded-xl border overflow-hidden ${firmware.update_available ? "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50" : "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50"}`}>
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${firmware.update_available ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"}`}>
                  {firmware.update_available ? <Download size={15} /> : <CheckCircle2 size={15} />}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{firmware.release_name || `v${firmware.latest_version}`}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Released {formatDate(firmware.published_at)}
                    {firmware.asset_size_bytes > 0 && <> · {formatBytes(firmware.asset_size_bytes)}</>}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {firmware.release_url && (
                  <a href={firmware.release_url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/70 transition-all" title="View on GitHub">
                    <ExternalLink size={14} />
                  </a>
                )}
                {firmware.update_available && (
                  <button
                    id="btn-download-install"
                    onClick={startDownload}
                    disabled={downloading || dlStatus?.state === "done"}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-bold transition-all shadow-sm shadow-amber-500/25 active:scale-95"
                  >
                    {downloading ? <Loader2 size={13} className="animate-spin" /> : <ArrowDownToLine size={13} />}
                    {downloading ? "Downloading…" : dlStatus?.state === "done" ? "Downloaded ✓" : "Download & Install"}
                  </button>
                )}
              </div>
            </div>

            {/* Version comparison */}
            <div className="px-5 pb-4 flex items-center gap-3">
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="font-mono bg-white/70 border border-slate-200 px-2 py-0.5 rounded text-slate-600">v{firmware.current_version}</span>
                <span className="text-slate-300">→</span>
                <span className={`font-mono px-2 py-0.5 rounded border font-semibold ${firmware.update_available ? "bg-amber-100 border-amber-300 text-amber-700" : "bg-emerald-100 border-emerald-300 text-emerald-700"}`}>
                  v{firmware.latest_version}
                </span>
              </div>
              {firmware.release_notes && (
                <button onClick={() => setShowNotes((s) => !s)} className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-all">
                  <GitCommitHorizontal size={12} />
                  {showNotes ? "Hide" : "Show"} Release Notes
                  {showNotes ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
              )}
            </div>

            {showNotes && firmware.release_notes && (
              <div className="mx-5 mb-5 p-4 bg-white/80 border border-slate-200 rounded-xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <GitCommitHorizontal size={11} /> Release Notes
                </p>
                <pre className="text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed font-sans">{firmware.release_notes}</pre>
              </div>
            )}
          </div>
        )}

        {/* Download Progress */}
        {dlStatus && dlStatus.state !== "idle" && (
          <div className={`p-4 rounded-xl border ${dlStatus.state === "done" ? "bg-emerald-50 border-emerald-200" : dlStatus.state === "error" ? "bg-rose-50 border-rose-200" : "bg-indigo-50 border-indigo-200"}`}>
            <div className="flex items-center gap-2 mb-3">
              {dlStatus.state === "done" ? <CheckCircle2 size={15} className="text-emerald-600" /> : dlStatus.state === "error" ? <AlertTriangle size={15} className="text-rose-500" /> : <Loader2 size={15} className="animate-spin text-indigo-500" />}
              <p className="text-xs font-semibold text-slate-700">{dlStatus.message}</p>
            </div>
            {(dlStatus.state === "downloading" || dlStatus.state === "done") && (
              <ProgressBar percent={dlStatus.percent} state={dlStatus.state} />
            )}
            {dlStatus.restart_required && (
              <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-700 font-semibold">
                <RotateCcw size={12} />
                Restart UltrON application to complete the update.
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <Info size={11} className="shrink-0" />
          <span>
            Updates fetched from{" "}
            <a href={`https://github.com/${firmware?.repository ?? "bitraneerajbabu/UltronPC"}/releases`} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline font-medium">
              github.com/{firmware?.repository ?? "bitraneerajbabu/UltronPC"}
            </a>
            . Download runs in background; restart app to apply.
          </span>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── System Info Card ─────────────────────────────────────────────────────────
function SystemInfoCard() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [polling, setPolling] = useState<PollingStatus | null>(null);

  useEffect(() => {
    api.getInfo().then(setInfo).catch(() => {});
    api.getPollingStatus().then(setPolling).catch(() => {});
  }, []);

  return (
    <SectionCard icon={Server} title="System Information" subtitle="Runtime details about this UltrON installation" accent="violet">
      {info ? (
        <div className="-my-1">
          <InfoRow label="Application" value={info.app_name} />
          <InfoRow label="Version" value={`v${info.version}`} mono />
          <InfoRow label="Database" value={info.db_type.toUpperCase()} mono />
          <InfoRow label="Debug Mode" value={info.debug ? "Enabled" : "Disabled"} />
          <InfoRow label="Stations" value={info.stations} />
          <InfoRow label="Devices" value={info.devices} />
          <InfoRow label="Parameters" value={info.parameters} />
          {polling && (
            <InfoRow
              label="Polling Engine"
              value={
                <span className={`flex items-center gap-1.5 ${polling.running ? "text-emerald-600" : "text-rose-500"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${polling.running ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                  {polling.running ? `Running · ${polling.active_poll_loops} loop${polling.active_poll_loops !== 1 ? "s" : ""}` : "Stopped"}
                </span>
              }
            />
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
          <Loader2 size={14} className="animate-spin" />
          Loading…
        </div>
      )}
    </SectionCard>
  );
}

// ─── Quick Actions Card ────────────────────────────────────────────────────────
function QuickActionsCard() {
  const [reloadStatus, setReloadStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  const reloadPolling = async () => {
    setReloadStatus("loading");
    try {
      await api.reloadPolling();
      setReloadStatus("done");
    } catch {
      setReloadStatus("error");
    } finally {
      setTimeout(() => setReloadStatus("idle"), 3000);
    }
  };

  return (
    <SectionCard icon={Activity} title="Polling Engine" subtitle="Control the device polling orchestrator" accent="emerald">
      <div className="space-y-3">
        <p className="text-xs text-slate-500 leading-relaxed">
          Restart all polling loops without restarting the server — useful after adding new devices.
        </p>
        <div className="flex items-center gap-3">
          <button
            id="btn-reload-polling"
            onClick={reloadPolling}
            disabled={reloadStatus === "loading"}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all disabled:opacity-60 active:scale-95"
          >
            {reloadStatus === "loading" ? <Loader2 size={13} className="animate-spin text-indigo-500" /> : <RefreshCw size={13} className="text-slate-400" />}
            Reload Polling Engine
          </button>
          {reloadStatus === "done" && <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-semibold"><CheckCircle2 size={13} />Reloaded</span>}
          {reloadStatus === "error" && <span className="flex items-center gap-1.5 text-[11px] text-rose-500 font-semibold"><AlertTriangle size={13} />Failed</span>}
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
/**
 * Settings — System configuration, firmware updates, and polling controls
 */
export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">System Settings</h1>
        <p className="text-xs text-slate-400 mt-1">Firmware updates, system info, and operational controls</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <FirmwareCard />
          <QuickActionsCard />
        </div>
        <div>
          <SystemInfoCard />
        </div>
      </div>
    </div>
  );
}