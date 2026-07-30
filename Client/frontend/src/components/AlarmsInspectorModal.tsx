import React, { useContext, useState, useEffect, useCallback } from 'react';
import { AppContext, LiveDataContext } from '../context/AppContext';

/**
 * AlarmsInspectorModal displays threshold alarms and communication failures,
 * and allows operators to acknowledge active alarms.
 */
export const AlarmsInspectorModal = ({ isOpen, onClose }) => {
  const {
    devices,
    parameters,
    authFetch,
    API_BASE,
    parseUtcDate,
    currentUser,
    showToast
  } = useContext(AppContext);
  const liveDataCtx = useContext(LiveDataContext) || {};
  const liveData = liveDataCtx.liveData || {};

  const [activeTab, setActiveTab] = useState('threshold');
  const [activeAlarmsList, setActiveAlarmsList] = useState([]);
  const [loadingAlarms, setLoadingAlarms] = useState(false);
  const [selectedAlarms, setSelectedAlarms] = useState([]);
  const [ackNotes, setAckNotes] = useState('');
  const [submittingAck, setSubmittingAck] = useState(false);

  const fetchActiveAlarms = useCallback(async () => {
    setLoadingAlarms(true);
    try {
      const res = await authFetch(`${API_BASE}/alarms/?state=active`);
      if (res.ok) {
        const data = await res.json();
        setActiveAlarmsList(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch active alarms:", err);
    } finally {
      setLoadingAlarms(false);
    }
  }, [authFetch, API_BASE]);

  useEffect(() => {
    if (isOpen) {
      fetchActiveAlarms();
    } else {
      // Reset state on close
      setSelectedAlarms([]);
      setAckNotes('');
      setActiveTab('threshold');
    }
  }, [isOpen, fetchActiveAlarms]);

  if (!isOpen) return null;

  const offlineParams = parameters.filter(p => (liveData[p.tag_name] || {}).status !== 'online');

  const handleAcknowledge = async (e) => {
    e.preventDefault();
    if (selectedAlarms.length === 0) return;
    setSubmittingAck(true);
    try {
      const res = await authFetch(`${API_BASE}/alarms/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          alarm_ids: selectedAlarms,
          acknowledged_by: currentUser || 'Operator',
          notes: ackNotes.trim() || 'Acknowledged from Dashboard overview'
        })
      });
      if (res.ok) {
        showToast(`Successfully acknowledged ${selectedAlarms.length} alarm(s).`);
        setSelectedAlarms([]);
        setAckNotes('');
        fetchActiveAlarms();
      } else {
        showToast("Failed to acknowledge alarms.", "error");
      }
    } catch (err) {
      console.error("Acknowledge error:", err);
      showToast("Error acknowledging alarms.", "error");
    } finally {
      setSubmittingAck(false);
    }
  };

  const pad = n => String(n).padStart(2, '0');
  const formatTime = (dateVal) => {
    return `${pad(dateVal.getDate())}-${pad(dateVal.getMonth() + 1)}-${dateVal.getFullYear()} ${pad(dateVal.getHours())}:${pad(dateVal.getMinutes())}:${pad(dateVal.getSeconds())}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-wrapper" onClick={e => e.stopPropagation()}>
        <div className="modal-header-custom">
          <h3 className="modal-title-custom">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#be123c' }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Active Alarms Inspector
          </h3>
          <button className="modal-close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-tabs-custom">
          <button
            className={`modal-tab-button ${activeTab === 'threshold' ? 'active' : ''}`}
            onClick={() => setActiveTab('threshold')}
          >
            Active Alarms ({activeAlarmsList.length})
          </button>
          <button
            className={`modal-tab-button ${activeTab === 'comms' ? 'active' : ''}`}
            onClick={() => setActiveTab('comms')}
          >
            Comms & Device Failures ({offlineParams.length})
          </button>
        </div>

        <div className="modal-content-custom">
          {activeTab === 'threshold' ? (
            <div>
              {loadingAlarms ? (
                <div className="loader" style={{ margin: '20px auto' }}></div>
              ) : activeAlarmsList.length === 0 ? (
                <div className="alarm-empty-state">
                  <div className="alarm-empty-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>No active threshold alarms. All parameters within limits.</div>
                </div>
              ) : (
                <form onSubmit={handleAcknowledge}>
                  <table className="alarm-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>
                          <input
                            type="checkbox"
                            className="alarm-row-checkbox"
                            checked={selectedAlarms.length === activeAlarmsList.length && activeAlarmsList.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedAlarms(activeAlarmsList.map(a => a.id));
                              } else {
                                setSelectedAlarms([]);
                              }
                            }}
                          />
                        </th>
                        <th>Parameter</th>
                        <th>Message</th>
                        <th>Severity</th>
                        <th>Triggered At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeAlarmsList.map(alarm => {
                        const paramObj = parameters.find(p => p.id === alarm.parameter_id) || {};
                        const triggeredDate = parseUtcDate(alarm.triggered_at);
                        const formattedTime = formatTime(triggeredDate);
                        return (
                          <tr key={alarm.id}>
                            <td>
                              <input
                                type="checkbox"
                                className="alarm-row-checkbox"
                                checked={selectedAlarms.includes(alarm.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedAlarms(prev => [...prev, alarm.id]);
                                  } else {
                                    setSelectedAlarms(prev => prev.filter(id => id !== alarm.id));
                                  }
                                }}
                              />
                            </td>
                            <td>
                              <strong>{paramObj.name || `Param ID: ${alarm.parameter_id}`}</strong>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>{paramObj.tag_name}</div>
                            </td>
                            <td>{alarm.message}</td>
                            <td>
                              <span className={`badge-alarm-severity badge-severity-${alarm.severity}`}>
                                {alarm.severity}
                              </span>
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>{formattedTime}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="alarm-ack-section">
                    <div className="alarm-ack-title">Acknowledge Selected Alarms</div>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label className="form-label" style={{ fontSize: '12px' }}>Operator Notes</label>
                      <textarea
                        className="form-input"
                        style={{ height: '60px', padding: '8px', fontSize: '13px', background: '#fff', border: '1px solid #cbd5e1' }}
                        placeholder="Enter acknowledgement notes / actions taken..."
                        value={ackNotes}
                        onChange={e => setAckNotes(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={selectedAlarms.length === 0 || submittingAck}
                    >
                      {submittingAck ? 'Submitting...' : `Acknowledge ${selectedAlarms.length} Alarm(s)`}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div>
              {offlineParams.length === 0 ? (
                <div className="alarm-empty-state">
                  <div className="alarm-empty-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>All parameters are online and communicating properly.</div>
                </div>
              ) : (
                <table className="alarm-table">
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Tag</th>
                      <th>Device</th>
                      <th>Status</th>
                      <th>Offline Since</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offlineParams.map(p => {
                      const data = liveData[p.tag_name] || {};
                      const parentDev = devices.find(d => d.id === p.device_id) || {};
                      return (
                        <tr key={p.id}>
                          <td><strong>{p.name}</strong></td>
                          <td><code>{p.tag_name}</code></td>
                          <td>{parentDev.name || `Device ID: ${p.device_id}`}</td>
                          <td>
                            <span className="badge-alarm-severity badge-severity-critical">
                              OFFLINE
                            </span>
                          </td>
                          <td>{data.timestamp && data.timestamp !== '—' ? data.timestamp : 'Unknown'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer-custom">
          <button className="btn" onClick={onClose}>Close Inspector</button>
        </div>
      </div>
    </div>
  );
};
