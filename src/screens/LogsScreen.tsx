import React, { useContext, useState, useEffect, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { Modal } from '../components/Modal';
import { Table } from '../components/Table';

export const LogsScreen = () => {
  const { API_BASE, showToast, parseUtcDate, authFetch } = useContext(AppContext);
  const [logsList, setLogsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Filter States
  const [logType, setLogType] = useState(''); // All, comm, system, audit, alarm
  const [level, setLevel] = useState(''); // All, DEBUG, INFO, WARNING, ERROR
  const [source, setSource] = useState('');
  const [limit, setLimit] = useState(100);

  // Purge Modal State
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeDays, setPurgeDays] = useState(30);
  const [purgeLogType, setPurgeLogType] = useState('');

  // Format Helpers
  const formatTimestamp = (dateStr) => {
    try {
      const date = parseUtcDate(dateStr);
      const p = n => String(n).padStart(2, '0');
      return `${p(date.getDate())}-${p(date.getMonth() + 1)}-${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
    } catch (e) {
      return dateStr;
    }
  };

  const mapLogTypeBack = (type) => {
    if (type === 'comm') return 'Communication';
    if (type === 'system') return 'System';
    if (type === 'audit') return 'Audit';
    if (type === 'alarm') return 'Alarm';
    return 'System';
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let queryParams = [];
      if (logType) queryParams.push(`log_type=${logType}`);
      if (level) queryParams.push(`level=${level}`);
      if (source) queryParams.push(`source=${encodeURIComponent(source)}`);
      if (limit) queryParams.push(`limit=${limit}`);

      const url = `${API_BASE}/logs/?${queryParams.join('&')}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error('Failed to fetch logs');
      const data = await res.json();
      
      const formatted = (data || []).map(l => ({
        id: l.id,
        timestamp: formatTimestamp(l.timestamp),
        station: l.source || 'System',
        logType: mapLogTypeBack(l.log_type),
        message: l.message,
        status: l.level === 'WARNING' ? 'WARN' : l.level === 'INFO' ? 'INFO' : l.level === 'ERROR' ? 'ERROR' : l.level
      }));
      setLogsList(formatted);
    } catch (e) {
      console.error(e);
      showToast('Failed to fetch logs from backend.', 'error');
    } finally {
      setLoading(false);
    }
  }, [API_BASE, logType, level, source, limit, showToast, authFetch]);

  // Load logs on mount and when filters change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Purge Action
  const handlePurge = async () => {
    if (window.confirm(`Are you sure you want to delete logs older than ${purgeDays} days?`)) {
      try {
        let queryParams = [`older_than_days=${purgeDays}`];
        if (purgeLogType) queryParams.push(`log_type=${purgeLogType}`);

        const res = await authFetch(`${API_BASE}/logs/purge?${queryParams.join('&')}`, {
          method: 'DELETE'
        });
        if (!res.ok) throw new Error();
        const result = await res.json();
        showToast(`Logs purged successfully. Deleted ${result.deleted} log entries.`);
        setPurgeOpen(false);
        fetchLogs();
      } catch (e) {
        showToast('Failed to purge logs.', 'error');
      }
    }
  };

  const headers = [
    { key: 'timestamp', label: 'Timestamp', sortable: true },
    { key: 'station', label: 'Source / Station', sortable: true },
    { key: 'logType', label: 'Log Type', sortable: true },
    { key: 'message', label: 'Message', sortable: true },
    { key: 'status', label: 'Status', sortable: true, render: v => {
        let cls = 'badge-info';
        if (v === 'WARN') cls = 'badge-warn';
        if (v === 'ERROR') cls = 'badge-error';
        if (v === 'SUCCESS') cls = 'badge-success';
        return <span className={cls}>{v}</span>;
      }
    }
  ];

  return (
    <div className="screen active" id="logsScreen">
      <div className="card">
        <div className="section-title">System Log Viewer</div>

        {/* Toolbar */}
        <div className="toolbar">
          <button className="btn btn-primary" onClick={fetchLogs} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh Logs'}
          </button>
          <button className="btn btn-danger" onClick={() => setPurgeOpen(true)}>
            Purge Historical Logs
          </button>
        </div>

        {/* Filters */}
        <div className="search-bar" style={{ gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="form-label" style={{ margin: 0 }}>Category:</span>
            <select className="form-select" style={{ width: '150px' }} value={logType} onChange={e => setLogType(e.target.value)}>
              <option value="">All Categories</option>
              <option value="system">System Logs</option>
              <option value="comm">Communication</option>
              <option value="audit">Audit Trail</option>
              <option value="alarm">Alarm Logs</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="form-label" style={{ margin: 0 }}>Severity:</span>
            <select className="form-select" style={{ width: '130px' }} value={level} onChange={e => setLevel(e.target.value)}>
              <option value="">All Levels</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="ERROR">ERROR</option>
              <option value="DEBUG">DEBUG</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="form-label" style={{ margin: 0 }}>Source:</span>
            <input 
              type="text" 
              className="search-input" 
              placeholder="Search source..." 
              style={{ width: '180px' }}
              value={source} 
              onChange={e => setSource(e.target.value)} 
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="form-label" style={{ margin: 0 }}>Limit:</span>
            <select className="form-select" style={{ width: '90px' }} value={limit} onChange={e => setLimit(Number(e.target.value))}>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
            </select>
          </div>
        </div>

        {/* Logs Table */}
        <Table 
          headers={headers}
          rows={logsList}
          selectedIds={selectedIds}
          onSelectionChange={(ids) => setSelectedIds(ids)}
          emptyMsg="No system logs found matching the selected filters."
        />
      </div>

      {/* Purge Modal */}
      <Modal
        isOpen={purgeOpen}
        title="Purge Historical Logs"
        size="modal-sm"
        onClose={() => setPurgeOpen(false)}
        actions={[
          { label: 'Cancel', cls: 'btn', action: () => setPurgeOpen(false) },
          { label: 'Purge Now', cls: 'btn btn-danger', action: handlePurge }
        ]}
      >
        <div style={{ padding: '4px' }}>
          <p className="confirm-msg" style={{ marginBottom: '16px', textAlign: 'left' }}>
            Choose criteria for cleaning up older system logs. This action deletes data permanently from the database.
          </p>

          <div className="form-group">
            <label className="form-label">Older Than (Days)</label>
            <input 
              type="number" 
              className="form-input" 
              min="1"
              value={purgeDays} 
              onChange={e => setPurgeDays(Math.max(1, parseInt(e.target.value) || 1))} 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Log Category</label>
            <select className="form-select" value={purgeLogType} onChange={e => setPurgeLogType(e.target.value)}>
              <option value="">All Categories</option>
              <option value="system">System Logs</option>
              <option value="comm">Communication Logs</option>
              <option value="audit">Audit Trail</option>
              <option value="alarm">Alarm Logs</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
};
