import React, { useContext, useState, useEffect, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { IconDeviceDesktop, IconServer, IconFilter, IconRotateClockwise, IconDownload, IconSearch } from '@tabler/icons-react';

interface LogRow {
  id: number;
  log_type: string;
  level: string;
  source: string;
  message: string;
  details?: string;
  timestamp: string;
}

const levelColor: Record<string, string> = {
  ERROR: '#E24B4A',
  WARNING: '#C07E12',
  INFO: 'var(--primary-600)',
  DEBUG: 'var(--text-secondary)',
  CRITICAL: '#B91C1C',
};

interface LogPanelProps {
  title: string;
  icon: React.ReactNode;
  sourceFilter: string;
  authFetch: (url: string, options?: any) => Promise<Response>;
  API_BASE: string;
}

const LogPanel: React.FC<LogPanelProps> = ({ title, icon, sourceFilter, authFetch, API_BASE }) => {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromDateTime, setFromDateTime] = useState('');
  const [toDateTime, setToDateTime] = useState('');
  const [isFiltered, setIsFiltered] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState('—');

  const fetchPanelLogs = useCallback(async (start?: string, end?: string) => {
    setLoading(true);
    try {
      let url = `${API_BASE}/logs/?source=${encodeURIComponent(sourceFilter)}&limit=500`;
      if (start) {
        url += `&start=${encodeURIComponent(new Date(start).toISOString())}`;
      }
      if (end) {
        url += `&end=${encodeURIComponent(new Date(end).toISOString())}`;
      }
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setRows(Array.isArray(data) ? data : []);
      }
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      console.error(`[LogsScreen] Error fetching ${title}:`, err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, API_BASE, sourceFilter, title]);

  // Initial load & automatic 1-minute live poll when not in audit mode
  useEffect(() => {
    if (!isFiltered) {
      fetchPanelLogs();
      const interval = setInterval(() => fetchPanelLogs(), 60000);
      return () => clearInterval(interval);
    }
  }, [fetchPanelLogs, isFiltered]);

  const handleApplyFilter = () => {
    if (!fromDateTime && !toDateTime) {
      setIsFiltered(false);
      fetchPanelLogs();
      return;
    }
    setIsFiltered(true);
    fetchPanelLogs(fromDateTime, toDateTime);
  };

  const handleReset = () => {
    setFromDateTime('');
    setToDateTime('');
    setIsFiltered(false);
    fetchPanelLogs();
  };

  const handlePreset = (preset: '1h' | '24h' | 'today') => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    
    let from = new Date();
    if (preset === '1h') {
      from.setHours(now.getHours() - 1);
    } else if (preset === '24h') {
      from.setDate(now.getDate() - 1);
    } else if (preset === 'today') {
      from.setHours(0, 0, 0, 0);
    }
    const fromStr = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}T${pad(from.getHours())}:${pad(from.getMinutes())}`;
    
    setFromDateTime(fromStr);
    setToDateTime(toStr);
    setIsFiltered(true);
    fetchPanelLogs(fromStr, toStr);
  };

  const exportCSV = () => {
    if (!rows.length) return;
    const headers = ['ID', 'Timestamp', 'Level', 'Source', 'Message'];
    const csvContent = [
      headers.join(','),
      ...rows.map(r => [
        r.id,
        `"${r.timestamp}"`,
        `"${r.level}"`,
        `"${r.source}"`,
        `"${(r.message || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/\s+/g, '_')}_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const fmtTime = (ts: string) => {
    try {
      const d = new Date(ts.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(ts) ? ts : ts + 'Z');
      const p = (n: number) => String(n).padStart(2, '0');
      return `${p(d.getDate())}:${p(d.getMonth() + 1)}:${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    } catch {
      return '—';
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: '520px', padding: '16px' }}>
      {/* Panel Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {icon}
          <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>{title}</span>
          {isFiltered ? (
            <span style={{ fontSize: '10px', background: '#2563eb', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
              AUDIT FILTER ACTIVE
            </span>
          ) : (
            <span style={{ fontSize: '10px', background: '#059669', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
              LIVE (1 MIN)
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={exportCSV} 
            disabled={!rows.length} 
            title="Download CSV for audit records"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '11px' }}
          >
            <IconDownload size={13} /> Export CSV
          </button>
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={() => fetchPanelLogs(fromDateTime, toDateTime)} 
            disabled={loading}
            title="Refresh logs"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '11px' }}
          >
            <IconRotateClockwise size={13} />
          </button>
        </div>
      </div>

      {/* Date & Time Selection Filter Box for Audit */}
      <div style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>From:</span>
            <input
              type="datetime-local"
              className="form-control"
              value={fromDateTime}
              onChange={e => setFromDateTime(e.target.value)}
              style={{ fontSize: '11px', padding: '3px 6px', height: '28px', width: '165px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>To:</span>
            <input
              type="datetime-local"
              className="form-control"
              value={toDateTime}
              onChange={e => setToDateTime(e.target.value)}
              style={{ fontSize: '11px', padding: '3px 6px', height: '28px', width: '165px' }}
            />
          </div>

          <button
            className="btn btn-primary btn-sm"
            onClick={handleApplyFilter}
            disabled={loading}
            style={{ height: '28px', padding: '0 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <IconSearch size={13} /> Filter
          </button>

          {isFiltered && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleReset}
              style={{ height: '28px', padding: '0 10px', fontSize: '11px' }}
            >
              Reset to Live
            </button>
          )}
        </div>

        {/* Quick presets for audits */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11px' }}>
          <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Presets:</span>
          <button 
            type="button" 
            onClick={() => handlePreset('1h')} 
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer', color: 'var(--text-primary)' }}
          >
            Last 1 Hr
          </button>
          <button 
            type="button" 
            onClick={() => handlePreset('24h')} 
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer', color: 'var(--text-primary)' }}
          >
            Last 24 Hrs
          </button>
          <button 
            type="button" 
            onClick={() => handlePreset('today')} 
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer', color: 'var(--text-primary)' }}
          >
            Today
          </button>
          <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: '10px' }}>
            Count: <strong>{rows.length}</strong> logs
          </span>
        </div>
      </div>

      {/* Logs Table Area */}
      <div style={{ flex: 1, maxHeight: '420px', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Loading audit records...
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600' }}>
            No logs found for selected timeframe.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-muted)', zIndex: 1, borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700' }}>Time</th>
                <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', width: '60px' }}>Level</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700' }}>Source</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700' }}>Log Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--surface-muted)' }}>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontFamily: 'Consolas, monospace', fontSize: '11px', verticalAlign: 'top' }}>
                    {fmtTime(r.timestamp)}
                  </td>
                  <td style={{ padding: '6px 4px', verticalAlign: 'top' }}>
                    <span style={{ display: 'inline-block', fontSize: '9px', fontWeight: '800', color: '#fff', background: levelColor[r.level] || 'var(--text-secondary)', borderRadius: '3px', padding: '1px 5px', letterSpacing: '0.04em' }}>
                      {r.level || 'INFO'}
                    </span>
                  </td>
                  <td style={{ padding: '6px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '11px', verticalAlign: 'top' }}>
                    {r.source || '—'}
                  </td>
                  <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontWeight: '500', lineHeight: 1.4, verticalAlign: 'top', wordBreak: 'break-word' }}>
                    {r.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export const LogsScreen = React.memo(() => {
  const { authFetch, API_BASE } = useContext(AppContext);

  return (
    <div className="screen active" id="logsScreen">
      <div className="card" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div className="section-title" style={{ margin: 0 }}>Audit & Communication Logs</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Auditable records for device telemetry and government PCB server transmissions.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '16px' }}>
        <LogPanel 
          title="Device Reading Logs" 
          icon={<IconDeviceDesktop size={18} stroke={1.8} color="var(--primary-600)" />} 
          sourceFilter="ultron.polling.read" 
          authFetch={authFetch} 
          API_BASE={API_BASE} 
        />
        <LogPanel 
          title="Active Server Logs" 
          icon={<IconServer size={18} stroke={1.8} color="var(--primary-600)" />} 
          sourceFilter="ultron.server_push.response" 
          authFetch={authFetch} 
          API_BASE={API_BASE} 
        />
      </div>
    </div>
  );
});
