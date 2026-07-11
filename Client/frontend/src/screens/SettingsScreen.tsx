import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { T, GLASS_CARD, BTN, INP, SEL } from '../theme';

export const SettingsScreen = () => {
  const { API_BASE, showToast, loadAllData, authFetch } = useContext(AppContext);
  const [appInfo, setAppInfo] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);
  const [pollingStatus, setPollingStatus] = useState(null);
  const [pushStatus, setPushStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [fwInfo, setFwInfo] = useState(null);
  const [fwLoading, setFwLoading] = useState(false);
  const [fwProgress, setFwProgress] = useState(null);
  const [fwChecking, setFwChecking] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [broadcastEnabled, setBroadcastEnabled] = useState(() => localStorage.getItem('ultron_broadcast_enabled') !== 'false');

  const [formData, setFormData] = useState({
    plantName: '', plantAddress: '', plantLogo: '',
    retentionDays: 90, timezone: 'Asia/Kolkata',
    pollingInterval: 60, alarmCheckInterval: 30,
    emailEnabled: false, smtpHost: '', smtpPort: 587, smtpUser: '', alertRecipients: '',
  });

  const loadInfo = async () => {
    setLoading(true);
    try {
      const [infoRes, healthRes, pollRes, plantRes, generalRes, pushRes] = await Promise.all([
        authFetch(`${API_BASE}/settings/info`),
        authFetch(`${API_BASE}/settings/health`),
        authFetch(`${API_BASE}/settings/polling-status`),
        authFetch(`${API_BASE}/settings/plant`),
        authFetch(`${API_BASE}/settings/general`),
        authFetch(`${API_BASE}/settings/push-status`),
      ]);
      if (infoRes.ok) setAppInfo(await infoRes.json());
      if (healthRes.ok) setHealthStatus(await healthRes.json());
      if (pollRes.ok) setPollingStatus(await pollRes.json());
      if (pushRes.ok) setPushStatus(await pushRes.json());

      if (plantRes.ok) {
        const plant = await plantRes.json();
        setFormData(prev => ({ ...prev, plantName: plant.plantName, plantAddress: plant.plantAddress, plantLogo: plant.plantLogo }));
      }
      if (generalRes.ok) {
        const gen = await generalRes.json();
        setFormData(prev => ({ ...prev, ...gen }));
      }
    } catch (e) {
      showToast('Failed to load settings.', 'error');
    } finally { setLoading(false); }
  };

  const checkFirmware = async () => {
    setFwChecking(true);
    try {
      const res = await authFetch(`${API_BASE}/settings/firmware`);
      if (res.ok) setFwInfo(await res.json());
      else showToast('Failed to check for updates.', 'error');
    } catch { showToast('Update check failed.', 'error'); }
    finally { setFwChecking(false); }
  };

  const startFirmwareDownload = async () => {
    try {
      const res = await authFetch(`${API_BASE}/settings/firmware/download`, { method: 'POST' });
      if (!res.ok) throw new Error();
      showToast('Download started…');
      setFwProgress({ state: 'downloading', percent: 0, message: 'Starting download…' });
    } catch { showToast('Failed to start download.', 'error'); }
  };

  const cancelFirmwareDownload = async () => {
    try {
      await authFetch(`${API_BASE}/settings/firmware/cancel`, { method: 'POST' });
      showToast('Download cancelled.');
      setFwProgress(null);
    } catch { showToast('Failed to cancel.', 'error'); }
  };

  const startUrlDownload = async () => {
    if (!customUrl.trim()) { showToast('Paste a download URL first.', 'warn'); return; }
    try {
      const res = await authFetch(`${API_BASE}/settings/firmware/download-url`, { method: 'POST', body: JSON.stringify({ url: customUrl.trim() }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed'); }
      showToast('Download started…');
      setFwProgress({ state: 'downloading', percent: 0, message: 'Starting download…' });
    } catch (e) { showToast(`Download failed: ${e.message}`, 'error'); }
  };

  useEffect(() => {
    if (!fwProgress || fwProgress.state !== 'downloading') return;
    const iv = setInterval(async () => {
      try {
        const res = await authFetch(`${API_BASE}/settings/firmware/download-status`);
        if (res.ok) {
          const st = await res.json();
          setFwProgress(st);
          if (st.state === 'done') {
            showToast('Update downloaded! Restart to apply.');
            clearInterval(iv);
            checkFirmware();
          } else if (st.state === 'error') {
            showToast(`Download failed: ${st.message}`, 'error');
            clearInterval(iv);
          } else if (st.state === 'cancelled' || st.state === 'idle') {
            clearInterval(iv);
            setFwProgress(null);
          }
        }
      } catch {}
    }, 1000);
    return () => clearInterval(iv);
  }, [fwProgress?.state]);

  useEffect(() => { loadInfo(); }, []);

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
    reader.onload = (evt) => setFormData(prev => ({ ...prev, plantLogo: evt.target.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    try {
      const [plantRes, generalRes] = await Promise.all([
        authFetch(`${API_BASE}/settings/plant`, {
          method: 'POST', body: JSON.stringify({
            plantName: formData.plantName, plantAddress: formData.plantAddress, plantLogo: formData.plantLogo,
          })
        }),
        authFetch(`${API_BASE}/settings/general`, {
          method: 'POST', body: JSON.stringify({
            retentionDays: formData.retentionDays, timezone: formData.timezone,
            pollingInterval: formData.pollingInterval, alarmCheckInterval: formData.alarmCheckInterval,
            emailEnabled: formData.emailEnabled, smtpHost: formData.smtpHost,
            smtpPort: formData.smtpPort, smtpUser: formData.smtpUser,
            alertRecipients: formData.alertRecipients,
          })
        }),
      ]);
      if (!plantRes.ok || !generalRes.ok) throw new Error('Save failed');
      showToast('Settings saved.', 'success');
      loadInfo();
    } catch (e) {
      showToast(`Save failed: ${e.message}`, 'error');
    }
  };

  const handleReloadPolling = async () => {
    if (!window.confirm('Reload the polling engine? It will restart all device poll loops.')) return;
    setActionLoading('reload');
    try {
      const res = await authFetch(`${API_BASE}/settings/reload-polling`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      showToast(`Polling engine reloaded — ${data.active_poll_loops} loop(s) running.`);
      loadInfo();
    } catch { showToast('Failed to reload polling.', 'error'); }
    finally { setActionLoading(''); }
  };

  const handleRestartApp = async () => {
    if (!window.confirm('Restart UltrON application?\n\nThe server will restart and this page will reload.')) return;
    setActionLoading('restart');
    try {
      const res = await authFetch(`${API_BASE}/settings/restart-app`, { method: 'POST' });
      if (!res.ok) throw new Error();
      showToast('Restarting UltrON…', 'info');
      // Poll health endpoint until server comes back
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const h = await fetch(`${API_BASE}/settings/health`, {
            headers: { 'Authorization': localStorage.getItem('ultron_token') ? `Bearer ${localStorage.getItem('ultron_token')}` : '' }
          });
          if (h.ok) { showToast('Server restarted.'); loadInfo(); setActionLoading(''); return; }
        } catch {}
      }
      showToast('Server did not restart in time. Reload manually.', 'error');
      setActionLoading('');
    } catch {
      showToast('Restart only supported in desktop mode.', 'error');
      setActionLoading('');
    }
  };

  const handleResetTelemetry = async () => {
    if (!window.confirm('Clear ALL telemetry data? (readings, history, averages, alarms)\nConfig kept intact. Cannot be undone.')) return;
    setActionLoading('resetTel');
    try {
      await authFetch(`${API_BASE}/settings/reset-telemetry`, { method: 'POST' });
      showToast('Telemetry cleared.');
      loadAllData(); loadInfo();
    } catch { showToast('Failed.', 'error'); }
    finally { setActionLoading(''); }
  };

  const handleFactoryReset = async () => {
    if (window.prompt('Type RESET to confirm factory reset (ALL data including config):') !== 'RESET') return;
    setActionLoading('resetAll');
    try {
      await authFetch(`${API_BASE}/settings/reset-all`, { method: 'POST' });
      showToast('Factory reset complete. Server restarting...');
    } catch {
      showToast('Factory reset triggered. Waiting for server...', 'error');
    }
    // Server is restarting — poll health endpoint until it comes back
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const h = await fetch(`${API_BASE}/settings/health`, {
          headers: { 'Authorization': localStorage.getItem('ultron_token') ? `Bearer ${localStorage.getItem('ultron_token')}` : '' }
        });
        if (h.ok) {
          showToast('Server restarted — reloading data.');
          loadAllData(); loadInfo();
          setActionLoading('');
          return;
        }
      } catch {}
    }
    showToast('Server is taking longer than expected. Reload page manually.', 'error');
    setActionLoading('');
  };

  const handleResetFrontend = () => {
    if (!window.confirm('Reset frontend UI settings to defaults?')) return;
    ['ultron_local_settings', 'ultron_theme_config', 'cached_api_mappings', 'cached_api_servers'].forEach(k => localStorage.removeItem(k));
    window.location.reload();
  };

  const handleShutdown = async () => {
    if (!window.confirm('Shutdown the UltrON server entirely? You will need to restart UltrON manually.')) return;
    try {
      await authFetch(`${API_BASE}/shutdown`, { method: 'POST' });
      showToast('Shutdown command sent.');
    } catch {
      showToast('Server shutting down...');
    }
    setTimeout(() => {
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#555"><div style="text-align:center"><h2>UltrON has been shut down.</h2><p style="color:#888;margin-top:8px">Please restart UltrON from the Start Menu or desktop shortcut.</p></div></div>';
    }, 1000);
  };

  const labelS = { fontSize: '11px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '4px' };
  const sectionTitleS = { fontSize: '13px', fontWeight: '700', color: T.primary, marginBottom: '10px', gridColumn: '1 / -1', borderBottom: `1.5px solid ${T.primaryBorder}`, paddingBottom: '6px' };

  return (
    <div className="screen active" id="settingsScreen" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* System Info */}
      <div style={{ ...GLASS_CARD, padding: '20px' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: T.text, marginBottom: '14px' }}>System Information</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '14px' }}>
          {[
            { label: 'Application', value: `${appInfo?.app_name || 'UltrON'} v${appInfo?.version || '1.0.0'}` },
            { label: 'Database', value: healthStatus?.status?.toUpperCase() || '…', ok: healthStatus?.database === 'ok' },
            { label: 'Polling Engine', value: pollingStatus?.running ? `RUNNING — ${pollingStatus?.active_poll_loops} loop(s)` : 'STOPPED', ok: pollingStatus?.running },
            { label: 'Internet', value: pushStatus?.internet_ok ? 'Connected' : 'Disconnected', ok: pushStatus?.internet_ok },
            { label: 'Pending Uploads', value: `${pushStatus?.pending_uploads ?? '?'} record(s)` },
          ].map(item => (
            <div key={item.label} style={{ flex: '1 1 120px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: T.textLabel, textTransform: 'uppercase' }}>{item.label}</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: item.ok === undefined ? T.text : item.ok ? '#10b981' : '#ef4444', marginTop: '2px' }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
          {[
            { label: 'Stations', value: appInfo?.stations ?? 0 },
            { label: 'Devices', value: appInfo?.devices ?? 0 },
            { label: 'Parameters', value: appInfo?.parameters ?? 0 },
            { label: 'DB Type', value: appInfo?.db_type || '…' },
          ].map(item => (
            <div key={item.label} style={{ padding: '8px 14px', background: T.primaryBg, borderRadius: T.r }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: T.textMuted }}>{item.label}</div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: T.primary }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button style={BTN.primary} onClick={loadInfo} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          <button style={BTN.ghost} onClick={handleReloadPolling} disabled={!!actionLoading}>{actionLoading === 'reload' ? '…' : 'Reload Polling'}</button>
          <button style={{ ...BTN.danger, marginLeft: 'auto' }} onClick={handleRestartApp} disabled={actionLoading === 'restart'}>{actionLoading === 'restart' ? 'Restarting…' : 'Restart App'}</button>
        </div>
      </div>

      {/* Software Update */}
      <div style={{ ...GLASS_CARD, padding: '20px' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: T.text, marginBottom: '14px' }}>Software Update</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '12px' }}>
          <div>
            <div style={labelS}>Current Version</div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: T.text }}>{appInfo?.version || '...'}</div>
          </div>
          {fwInfo && (
            <>
              <div>
                <div style={labelS}>Latest Version</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: fwInfo.update_available ? '#f59e0b' : '#10b981' }}>{fwInfo.latest_version}</div>
              </div>
              <div>
                <div style={labelS}>Status</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: fwInfo.update_available ? '#f59e0b' : '#10b981' }}>
                  {fwInfo.update_available ? 'Update Available' : 'Up to Date'}
                </div>
              </div>
            </>
          )}
        </div>
        {!fwInfo && !fwChecking && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button onClick={checkFirmware} style={BTN.ghost}>Check for Updates</button>
            <button onClick={handleRestartApp} style={BTN.danger} disabled={actionLoading === 'restart'}>
              {actionLoading === 'restart' ? 'Restarting…' : 'Restart App'}
            </button>
          </div>
        )}
        {fwChecking && <div style={{ fontSize: '12px', color: T.textMuted, marginBottom: '12px' }}>Checking for updates…</div>}
        {fwInfo?.update_available && fwInfo.release_notes && (
          <div style={{ marginBottom: '10px' }}>
            <div style={labelS}>Release Notes</div>
            <div style={{ fontSize: '11px', color: T.textMuted, maxHeight: '80px', overflowY: 'auto', background: T.primaryBg, padding: '8px', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>{fwInfo.release_notes}</div>
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
          {(!fwProgress || fwProgress.state === 'idle') && (
            <button style={BTN.primary} onClick={startFirmwareDownload}>Download Latest</button>
          )}
          {fwProgress?.state === 'downloading' && (
            <>
              <div style={{ flex: 1, marginRight: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: T.textMuted, marginBottom: '4px' }}>
                  <span>{fwProgress.message}</span>
                  <span>{fwProgress.percent}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: T.primaryBg, borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${fwProgress.percent}%`, height: '100%', background: T.primary, borderRadius: '3px', transition: 'width 0.3s' }} />
                </div>
              </div>
              <button style={BTN.ghost} onClick={cancelFirmwareDownload}>Cancel</button>
            </>
          )}
          {fwProgress?.state === 'done' && (
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#10b981', marginRight: '10px' }}>{fwProgress.message}</div>
          )}
          {fwProgress?.state === 'error' && (
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444', marginRight: '10px' }}>{fwProgress.message}</div>
          )}
          {fwInfo && (
            <button style={{ ...BTN.danger, marginLeft: 'auto' }} onClick={handleRestartApp} disabled={actionLoading === 'restart'}>
              {actionLoading === 'restart' ? 'Restarting…' : 'Restart App'}
            </button>
          )}
        </div>
        <div style={{ borderTop: `1px solid ${T.primaryBorder}`, paddingTop: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px' }}>Or paste a GitHub release URL:</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" value={customUrl} onChange={e => setCustomUrl(e.target.value)} placeholder="https://github.com/.../releases/download/v1.0.10/UltrON.exe" style={{ ...INP, flex: 1 }} />
            <button style={BTN.primary} onClick={startUrlDownload} disabled={fwProgress?.state === 'downloading'}>Download & Install</button>
          </div>
        </div>
      </div>

      {/* Settings Form */}
      <div style={{ ...GLASS_CARD, padding: '20px' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: T.text, marginBottom: '14px' }}>System Settings</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>

          <div style={sectionTitleS}>Plant Identification</div>

          <div style={{ gridColumn: 'span 3', display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
            <div style={labelS}>Broadcast Messages</div>
            <button onClick={() => { const v = !broadcastEnabled; setBroadcastEnabled(v); localStorage.setItem('ultron_broadcast_enabled', String(v)); }} style={{
              width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
              background: broadcastEnabled ? '#0f766e' : '#cbd5e1', position: 'relative', transition: 'background 0.2s',
            }}>
              <span style={{
                position: 'absolute', top: '2px', left: broadcastEnabled ? '22px' : '2px',
                width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
            <span style={{ fontSize: '12px', color: T.textMuted }}>{broadcastEnabled ? 'Enabled' : 'Disabled'}</span>
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <div style={labelS}>Plant Name</div>
            <input name="plantName" style={INP} value={formData.plantName} onChange={handleChange} placeholder="e.g. Sunshine Chemicals Ltd." />
          </div>
          <div>
            <div style={labelS}>Plant Address</div>
            <input name="plantAddress" style={INP} value={formData.plantAddress} onChange={handleChange} placeholder="e.g. Block C, Industrial Zone" />
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <div style={labelS}>Industry Logo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {formData.plantLogo && <img src={formData.plantLogo} alt="Logo" style={{ maxHeight: '48px', maxWidth: '160px', borderRadius: '6px', border: `1px solid ${T.primaryBorder}` }} />}
              <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} id="logoInput" />
              <button style={BTN.ghost} onClick={() => document.getElementById('logoInput').click()}>Select Logo</button>
              {formData.plantLogo && <button style={BTN.danger} onClick={() => setFormData(prev => ({ ...prev, plantLogo: '' }))}>Remove</button>}
            </div>
          </div>


        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={BTN.danger} onClick={handleResetTelemetry} disabled={!!actionLoading}>{actionLoading === 'resetTel' ? '…' : 'Clear Telemetry'}</button>
            <button style={BTN.danger} onClick={handleFactoryReset} disabled={!!actionLoading}>{actionLoading === 'resetAll' ? '…' : 'Factory Reset'}</button>
            <button style={BTN.danger} onClick={handleShutdown}>{'Shutdown Server'}</button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={BTN.ghost} onClick={handleResetFrontend}>Reset UI</button>
            <button style={BTN.primary} onClick={handleSave}>Save Settings</button>
          </div>
        </div>
      </div>
    </div>
  );
};
