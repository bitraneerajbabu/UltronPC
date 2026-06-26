import React, { useContext, useState, useEffect, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { T, GLASS_CARD, BTN, INP, SEL } from '../theme';

const fmtTs = (date) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${p(date.getMonth() + 1)}/${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
};

export const LogsScreen = () => {
  const { API_BASE, showToast, parseUtcDate, authFetch } = useContext(AppContext);
  const [logsList, setLogsList] = useState([]);
  const [loading, setLoading] = useState(false);

  const [logType, setLogType] = useState('');
  const [level, setLevel] = useState('');
  const [source, setSource] = useState('');
  const [limit, setLimit] = useState(100);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = [];
      if (logType) params.push(`log_type=${logType}`);
      if (level) params.push(`level=${level}`);
      if (source) params.push(`source=${encodeURIComponent(source)}`);
      if (limit) params.push(`limit=${limit}`);

      const res = await authFetch(`${API_BASE}/logs/?${params.join('&')}`);
      if (!res.ok) throw new Error('Failed to fetch logs');
      const data = await res.json();
      setLogsList((data || []).map(l => ({
        id: l.id,
        timestamp: fmtTs(parseUtcDate(l.timestamp)),
        source: l.source || 'System',
        logType: l.log_type || 'system',
        level: l.level || 'INFO',
        message: l.message || '',
      })));
    } catch (e) {
      showToast('Failed to fetch logs.', 'error');
    } finally {
      setLoading(false);
    }
  }, [API_BASE, logType, level, source, limit, showToast, authFetch]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handlePurge = async () => {
    const days = parseInt(prompt('Delete logs older than how many days?', '30') || '0', 10);
    if (!days || days < 1) return;
    if (!window.confirm(`Delete logs older than ${days} days?`)) return;
    try {
      const res = await authFetch(`${API_BASE}/logs/purge?older_than_days=${days}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      const result = await res.json();
      showToast(`Deleted ${result.deleted} log(s).`);
      fetchLogs();
    } catch { showToast('Purge failed.', 'error'); }
  };

  const levelStyle = (lvl) => {
    if (lvl === 'ERROR') return { color: T.danger, background: T.dangerBg };
    if (lvl === 'WARNING') return { color: T.warning, background: T.warningBg };
    return { color: T.primary, background: T.primaryBg };
  };

  const typeStyle = (type) => {
    if (type === 'comm') return { color: T.info, background: T.infoBg };
    if (type === 'alarm') return { color: T.danger, background: T.dangerBg };
    if (type === 'audit') return { color: '#7c3aed', background: 'rgba(124,58,237,0.1)' };
    return { color: T.textMuted, background: T.primaryBg };
  };

  return (
    <div className="screen active" id="logsScreen" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ ...GLASS_CARD, padding: '18px 24px', marginBottom: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: T.text, letterSpacing: '-0.02em' }}>System Log Viewer</div>
            <div style={{ fontSize: '11px', color: T.textFaint, fontWeight: '600', marginTop: '2px' }}>Monitor SPCB pushes, connectivity, and system events</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={BTN.primary} onClick={fetchLogs} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
            <button style={BTN.danger} onClick={handlePurge}>Purge Old Logs</button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '14px', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', marginBottom: '3px' }}>Category</div>
            <select style={{ ...SEL, width: '140px' }} value={logType} onChange={e => setLogType(e.target.value)}>
              <option value="">All</option>
              <option value="system">System</option>
              <option value="comm">Communication</option>
              <option value="audit">Audit</option>
              <option value="alarm">Alarm</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', marginBottom: '3px' }}>Level</div>
            <select style={{ ...SEL, width: '120px' }} value={level} onChange={e => setLevel(e.target.value)}>
              <option value="">All</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="ERROR">ERROR</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', marginBottom: '3px' }}>Source</div>
            <input style={{ ...INP, width: '170px' }} value={source} onChange={e => setSource(e.target.value)} placeholder="Search source..." />
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase', marginBottom: '3px' }}>Limit</div>
            <select style={{ ...SEL, width: '80px' }} value={limit} onChange={e => setLimit(Number(e.target.value))}>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div style={{ ...GLASS_CARD, padding: '0', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: T.glass, position: 'sticky', top: 0, zIndex: 1 }}>
                {['Timestamp', 'Source', 'Type', 'Message', 'Level'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: `1.5px solid ${T.primaryBorder}`, color: T.textLabel, fontWeight: '700', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logsList.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: T.textFaint, fontWeight: '600' }}>
                    {loading ? 'Loading logs...' : 'No logs match the selected filters.'}
                  </td>
                </tr>
              ) : (
                logsList.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                    <td style={{ padding: '8px 12px', color: T.textMuted, fontFamily: T.fontMono, fontSize: '11px', whiteSpace: 'nowrap' }}>{r.timestamp}</td>
                    <td style={{ padding: '8px 12px', fontWeight: '600', color: T.text }}>{r.source}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ ...typeStyle(r.logType), padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: '700' }}>{r.logType}</span>
                    </td>
                    <td style={{ padding: '8px 12px', color: T.text, maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.message}>{r.message}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ ...levelStyle(r.level), padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: '700' }}>{r.level}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
