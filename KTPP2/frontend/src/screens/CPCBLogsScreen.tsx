import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { T, GLASS_CARD } from '../theme';

interface ExportLog {
  id: number;
  station_name: string;
  record_count: number;
  status: string;
  message: string | null;
  execution_time_ms: number | null;
  created_at: string;
}

export const CPCBLogsScreen = () => {
  const { API_BASE, authFetch } = useContext(AppContext);
  const [logs, setLogs] = useState<ExportLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    try {
      const res = await authFetch(`${API_BASE}/cpcb/logs?limit=200`);
      if (res.ok) setLogs(await res.json());
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { loadLogs(); const iv = setInterval(loadLogs, 30000); return () => clearInterval(iv); }, []);

  if (loading) return <div className="screen active"><p>Loading...</p></div>;

  const statusColor = (s: string) => s === 'success' ? T.success : s === 'partial_failure' ? T.warning : T.danger;

  return (
    <div className="screen active" id="cpcbLogsScreen">
      <div className="card">
        <div className="section-title">CPCB Export Logs</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: T.primaryBg, borderBottom: `2px solid ${T.primaryBorder}` }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Time</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Station</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Records</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Duration (ms)</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: T.primary, fontSize: '11px', textTransform: 'uppercase' }}>Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                  <td style={{ padding: '10px 12px', fontFamily: T.fontMono, fontSize: '12px', color: T.textMuted }}>{new Date(log.created_at).toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', fontWeight: '700', color: T.text }}>{log.station_name}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: T.fontMono, fontWeight: '700', color: T.text }}>{log.record_count}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{ background: `${statusColor(log.status)}22`, color: statusColor(log.status), padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>
                      {log.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: T.fontMono, color: T.textMuted }}>{log.execution_time_ms ?? '—'}</td>
                  <td style={{ padding: '10px 12px', color: T.textFaint, fontSize: '12px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.message || '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: T.textFaint }}>No export logs yet. Run an export first.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
