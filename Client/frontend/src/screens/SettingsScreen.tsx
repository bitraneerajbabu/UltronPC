import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';

export const SettingsScreen = () => {
  const { API_BASE, showToast, loadAllData, saveLocalSettings, authFetch } = useContext(AppContext);
  const [appInfo, setAppInfo] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);
  const [pollingStatus, setPollingStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');



  // Editable settings stored in local state (synced with localStorage for persistence)
  const [formData, setFormData] = useState({
    dbType: 'postgresql',
    retentionDays: 90,
    timezone: 'Asia/Kolkata',
    pollingInterval: 60,
    alarmCheckInterval: 30,
    emailEnabled: false,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpUser: '',
    alertRecipients: '',
    plantName: 'UltrON Industrial Plant',
    plantAddress: 'Industrial Zone, Block A',
    plantLogo: ''
  });

  const loadInfo = async () => {
    setLoading(true);
    try {
      const [infoRes, healthRes, pollRes] = await Promise.all([
        fetch(`${API_BASE}/settings/info`),
        fetch(`${API_BASE}/settings/health`),
        fetch(`${API_BASE}/settings/polling-status`)
      ]);

      if (infoRes.ok) setAppInfo(await infoRes.json());
      if (healthRes.ok) setHealthStatus(await healthRes.json());
      if (pollRes.ok) setPollingStatus(await pollRes.json());
    } catch (e) {
      console.error('Failed to load settings info:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInfo();
    // Load persisted local settings
    const saved = localStorage.getItem('ultron_local_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFormData(prev => ({
          ...prev,
          ...parsed,
          plantName: parsed.plantName ?? 'UltrON Industrial Plant',
          plantAddress: parsed.plantAddress ?? 'Industrial Zone, Block A',
          plantLogo: parsed.plantLogo ?? ''
        }));
      } catch (e) { /* ignore */ }
    }
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked
        : (['retentionDays', 'pollingInterval', 'alarmCheckInterval', 'smtpPort'].includes(name) ? (parseInt(value) || 0) : value)
    }));
  };



  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Image size should be less than 2MB.', 'warn'); return; }
    const reader = new FileReader();
    reader.onload = (evt) => {
      setFormData(prev => ({ ...prev, plantLogo: evt.target.result as string }));
      showToast('Logo image uploaded to configuration.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setFormData(prev => ({ ...prev, plantLogo: '' }));
    showToast('Logo image removed.');
  };

  const handleSave = async () => {
    saveLocalSettings(formData);
    loadInfo();
  };

  // ── Real Backend Actions ──────────────────────────────────────────────────

  const handleReloadPolling = async () => {
    if (!window.confirm('Reload the polling engine? It will restart all device poll loops.')) return;
    setActionLoading('reload');
    try {
      const res = await authFetch(`${API_BASE}/settings/reload-polling`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      showToast(`Polling engine reloaded — ${data.active_poll_loops} device loop(s) running.`);
      loadInfo();
    } catch (e) {
      showToast('Failed to reload polling engine.', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleResetTelemetry = async () => {
    if (!window.confirm(
      'Clear ALL telemetry data? (live readings, history, averages, alarms)\n\n' +
      'Station / device / parameter CONFIG will be kept intact.\nThis cannot be undone.'
    )) return;
    setActionLoading('resetTel');
    try {
      const res = await authFetch(`${API_BASE}/settings/reset-telemetry`, { method: 'POST' });
      if (!res.ok) throw new Error();
      showToast('All telemetry data cleared. Config preserved.');
      loadAllData();
      loadInfo();
    } catch (e) {
      showToast('Failed to reset telemetry.', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleFactoryReset = async () => {
    const answer = window.prompt(
      'DANGER: This will wipe ALL data including config (stations, devices, parameters).\n\n' +
      'Type RESET to confirm factory reset:'
    );
    if (answer !== 'RESET') { showToast('Factory reset cancelled.', 'warn'); return; }
    setActionLoading('resetAll');
    try {
      const res = await authFetch(`${API_BASE}/settings/reset-all`, { method: 'POST' });
      if (!res.ok) throw new Error();
      showToast('Full factory reset complete. All data removed. Please re-configure.');
      loadAllData();
      loadInfo();
    } catch (e) {
      showToast('Failed to perform factory reset.', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleResetFrontend = () => {
    if (!window.confirm('Reset all frontend UI settings to defaults?')) return;
    localStorage.removeItem('ultron_local_settings');
    localStorage.removeItem('ultron_theme_config');
    localStorage.removeItem('cached_api_mappings');
    localStorage.removeItem('cached_api_servers');
    
    // Force clean state restoration from native build file definitions
    window.location.reload();
  };

  return (
    <div className="screen active" id="settingsScreen">

      {/* App Info Panel */}
      <div className="card">
        <div className="section-title">System Information</div>
        <div className="live-status-grid" style={{ marginBottom: '12px' }}>
          <div className="live-status-item">
            <label style={{ display: 'block' }}>Application:</label>
            <span>{appInfo?.app_name || 'UltrON'} v{appInfo?.version || '1.0.0'}</span>
          </div>
          <div className="live-status-item">
            <label style={{ display: 'block' }}>Database Status:</label>
            <span className={healthStatus?.database === 'ok' ? 'status-online' : 'status-offline'} style={{ fontWeight: '600' }}>
              {healthStatus?.status?.toUpperCase() || 'CHECKING…'} ({healthStatus?.db_type || '…'})
            </span>
          </div>
          <div className="live-status-item">
            <label style={{ display: 'block' }}>Polling Engine:</label>
            <span className={pollingStatus?.running ? 'status-online' : 'status-offline'}>
              {pollingStatus?.running ? `RUNNING — ${pollingStatus?.active_poll_loops} loop(s)` : 'STOPPED'}
            </span>
          </div>
        </div>

        <div className="live-status-grid">
          <div className="live-status-item">
            <label style={{ display: 'block' }}>Total Stations:</label>
            <span>{appInfo?.stations ?? 0} Stations</span>
          </div>
          <div className="live-status-item">
            <label style={{ display: 'block' }}>Configured Devices:</label>
            <span>{appInfo?.devices ?? 0} Devices</span>
          </div>
          <div className="live-status-item">
            <label style={{ display: 'block' }}>Mapped Registers:</label>
            <span>{appInfo?.parameters ?? 0} Channels</span>
          </div>
        </div>

        <div className="toolbar" style={{ marginTop: '20px' }}>
          <button className="btn" onClick={loadInfo} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh Status'}
          </button>
          <button className="btn" onClick={handleReloadPolling} disabled={!!actionLoading}>
            {actionLoading === 'reload' ? 'Reloading…' : 'Reload Polling Engine'}
          </button>
        </div>
      </div>

      {/* Settings Configuration Form */}
      <div className="card">
        <div className="section-title">System Settings</div>

        <div className="settings-grid">
          <div className="settings-section-title">Plant Identification</div>

          <div className="form-group" style={{ gridColumn: '1/3' }}>
            <label className="form-label">Plant Name</label>
            <input type="text" className="form-input" name="plantName" value={formData.plantName} onChange={handleChange} placeholder="e.g. Sunshine Chemicals Ltd." />
          </div>

          <div className="form-group" style={{ gridColumn: '3/4' }}>
            <label className="form-label">Plant Address</label>
            <input type="text" className="form-input" name="plantAddress" value={formData.plantAddress} onChange={handleChange} placeholder="e.g. Block C, Industrial Corridor" />
          </div>

          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Industry Logo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              {formData.plantLogo && (
                <div style={{ border: '1px solid rgba(15, 118, 110, 0.2)', padding: '6px', borderRadius: '8px', background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={formData.plantLogo} alt="Logo Preview" style={{ maxHeight: '48px', maxWidth: '160px', objectFit: 'contain' }} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} id="plantLogoInput" />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn" onClick={() => document.getElementById('plantLogoInput').click()}>
                    Select Logo Image
                  </button>
                  {formData.plantLogo && (
                    <button type="button" className="btn btn-danger" onClick={handleRemoveLogo} style={{ height: '38px' }}>
                      Remove Logo
                    </button>
                  )}
                </div>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Supports PNG, JPEG, SVG. Recommended height 40–60px with transparent background.
                </span>
              </div>
            </div>
          </div>

          <div className="settings-section-title" style={{ marginTop: '20px' }}>Database &amp; Retention</div>



          <div className="form-group">
            <label className="form-label">Data Retention (Days)</label>
            <input type="number" className="form-input" name="retentionDays" value={formData.retentionDays} onChange={handleChange} min="7" />
          </div>

          <div className="form-group">
            <label className="form-label">System Timezone</label>
            <select className="form-select" name="timezone" value={formData.timezone} onChange={handleChange}>
              <option value="UTC">UTC (Coordinated Universal Time)</option>
              <option value="Asia/Kolkata">IST (Asia/Kolkata)</option>
              <option value="America/New_York">EST (America/New_York)</option>
              <option value="Europe/London">GMT (Europe/London)</option>
            </select>
          </div>

          <div className="settings-section-title">Polling &amp; Heartbeat</div>

          <div className="form-group">
            <label className="form-label">Default Poll Interval (sec)</label>
            <input type="number" className="form-input" name="pollingInterval" value={formData.pollingInterval} onChange={handleChange} min="5" />
          </div>

          <div className="form-group">
            <label className="form-label">Alarm Check Interval (sec)</label>
            <input type="number" className="form-input" name="alarmCheckInterval" value={formData.alarmCheckInterval} onChange={handleChange} min="5" />
          </div>



          <div className="settings-section-title">Email Alert Engine</div>

          <div className="form-group" style={{ gridColumn: '1/2' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '10px' }}>
              <input type="checkbox" name="emailEnabled" checked={formData.emailEnabled} onChange={handleChange} style={{ width: '16px', height: '16px' }} />
              Enable Email Alerts
            </label>
          </div>

          {formData.emailEnabled && (
            <>
              <div className="form-group">
                <label className="form-label">SMTP Server Host</label>
                <input type="text" className="form-input" name="smtpHost" value={formData.smtpHost} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">SMTP Port</label>
                <input type="number" className="form-input" name="smtpPort" value={formData.smtpPort} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">SMTP User</label>
                <input type="text" className="form-input" name="smtpUser" value={formData.smtpUser} onChange={handleChange} placeholder="smtp@company.com" />
              </div>
              <div className="form-group" style={{ gridColumn: '2/-1' }}>
                <label className="form-label">Alert Recipients (comma separated)</label>
                <input type="text" className="form-input" name="alertRecipients" value={formData.alertRecipients} onChange={handleChange} placeholder="admin@company.com, safety@company.com" />
              </div>
            </>
          )}

          {/* CPCB section removed */}


        </div>

        <div className="divider" />

        <div className="toolbar" style={{ justifyContent: 'space-between', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-danger"
              onClick={handleResetTelemetry}
              disabled={!!actionLoading}
              title="Clears all readings/history/alarms. Keeps station/device/parameter config."
            >
              {actionLoading === 'resetTel' ? 'Clearing…' : 'Clear Telemetry Data'}
            </button>
            <button
              className="btn btn-danger"
              onClick={handleFactoryReset}
              disabled={!!actionLoading}
              title="WIPES EVERYTHING including config. Requires typing RESET to confirm."
            >
              {actionLoading === 'resetAll' ? 'Resetting…' : 'Factory Reset DB'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn" onClick={handleResetFrontend}>Reset UI Defaults</button>
            <button className="btn btn-primary" onClick={handleSave}>Save Settings</button>
          </div>
        </div>
      </div>

    </div>
  );
};
