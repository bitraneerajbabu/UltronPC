import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { T, GLASS_CARD, BTN, INP } from '../theme';

interface UserData { id?: number; username: string; full_name?: string; role: string; is_active: boolean; created_at?: string; created_by?: string; last_login?: string; }
interface UserPayload { username?: string; password?: string; full_name?: string | null; role?: string; is_active?: boolean; }

const ShieldIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>);
const KeyIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>);
const UserIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
const PlusIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>);
const EditIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>);
const TrashIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>);

// ─── User Modal ───
function UserModal({ mode, user, onClose, onSave }: { mode: 'add' | 'edit'; user?: UserData; onClose: () => void; onSave: (p: UserPayload) => void }) {
  const [form, setForm] = useState({ username: user?.username || '', password: '', confirmPassword: '', full_name: user?.full_name || '', role: user?.role || 'client', is_active: user?.is_active !== undefined ? user.is_active : true });
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));
  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.username.trim()) e.username = 'Required';
    if (mode === 'add' && !form.password) e.password = 'Required';
    else if (form.password && form.password.length < 4) e.password = 'Min 4 chars';
    if (form.password && form.password !== form.confirmPassword) e.confirmPassword = 'No match';
    setErrors(e); return Object.keys(e).length === 0;
  };
  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    const p: UserPayload = {};
    if (mode === 'add') { p.username = form.username.trim(); p.password = form.password; p.role = form.role; p.full_name = form.full_name.trim() || null; p.is_active = form.is_active; }
    else { if (form.password) p.password = form.password; p.full_name = form.full_name.trim() || null; p.is_active = form.is_active; p.role = form.role; }
    onSave(p);
  };
  const ms = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(13,79,73,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' } as const;
  const mc: React.CSSProperties = { background: '#0d4f49', border: '1px solid #1a7a6e', borderRadius: '16px', width: '460px', maxWidth: '95vw', padding: '28px', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' };
  return (<div style={ms}>
    <div style={mc}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#f1f5f9' }}>{mode === 'add' ? 'Create User' : 'Edit User'}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px', fontSize: '18px' }}>×</button>
      </div>
      <form onSubmit={handleSubmit}>
        {mode === 'add' && (<div className="form-group"><label className="form-label">Username *</label><input autoFocus type="text" className={`form-input ${errors.username ? 'error' : ''}`} value={form.username} onChange={e => set('username', e.target.value)} placeholder="e.g. operator1" autoComplete="off" />{errors.username && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>{errors.username}</div>}</div>)}
        <div className="form-group"><label className="form-label">Full Name</label><input type="text" className="form-input" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Optional display name" /></div>
        <div className="form-group"><label className="form-label">Role</label><select className="form-input form-select" value={form.role} onChange={e => set('role', e.target.value)}><option value="client">Client — Dashboard, Trends, Reports only</option><option value="admin">Admin — Full Access</option></select></div>
        <div className="form-group"><label className="form-label">{mode === 'add' ? 'Password *' : 'New Password'}</label><div style={{ position: 'relative' }}><input type={showPwd ? 'text' : 'password'} className={`form-input ${errors.password ? 'error' : ''}`} value={form.password} onChange={e => set('password', e.target.value)} placeholder={mode === 'add' ? 'Min 4 chars' : 'Leave blank to keep'} style={{ paddingRight: '44px' }} autoComplete="new-password" /><button type="button" onClick={() => setShowPwd(v => !v)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>{showPwd ? '🙈' : '👁'}</button></div>{errors.password && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>{errors.password}</div>}</div>)
        {form.password && (<div className="form-group"><label className="form-label">Confirm Password</label><input type={showPwd ? 'text' : 'password'} className={`form-input ${errors.confirmPassword ? 'error' : ''}`} value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} placeholder="Re-enter" />{errors.confirmPassword && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>{errors.confirmPassword}</div>}</div>)}
        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><label className="form-label" style={{ margin: 0 }}>Active</label><label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} style={{ width: '16px', height: '16px' }} /><span style={{ fontSize: '13px', color: form.is_active ? '#10b981' : '#64748b' }}>{form.is_active ? 'Active' : 'Disabled'}</span></label></div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}><button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</button><button type="submit" className="btn btn-primary" style={{ flex: 2 }}>{mode === 'add' ? 'Create User' : 'Save Changes'}</button></div>
      </form>
    </div>
  </div>);
}

export const SettingsScreen = React.memo(() => {
  const { API_BASE, showToast, loadAllData, authFetch, pendingStatus, usersList, loadUsers, addUser, editUser, deleteUser, currentUser, parseUtcDate } = useContext(AppContext);
  const [settingsTab, setSettingsTab] = useState('system');

  // ─── User Management state ───
  const [userModal, setUserModal] = useState<{ mode: 'add' | 'edit'; user?: UserData } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
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
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [newLicenseKey, setNewLicenseKey] = useState('');
  const [newStationId, setNewStationId] = useState('');
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState('');
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
      const [infoRes, healthRes, pollRes, plantRes, generalRes, pushRes, licRes] = await Promise.all([
        authFetch(`${API_BASE}/settings/info`),
        authFetch(`${API_BASE}/settings/health`),
        authFetch(`${API_BASE}/settings/polling-status`),
        authFetch(`${API_BASE}/settings/plant`),
        authFetch(`${API_BASE}/settings/general`),
        authFetch(`${API_BASE}/settings/push-status`),
        authFetch(`${API_BASE}/license/status`),
      ]);
      if (licRes.ok) setLicenseStatus(await licRes.json());
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
    }, 3000);
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

  const handleLogoUpload = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Image size should be less than 2MB.', 'warn'); return; }
    showToast('Processing logo image...', 'info');
    const reader = new FileReader();
    reader.onload = (evt) => {
      setFormData(prev => ({ ...prev, plantLogo: evt.target.result as string }));
      showToast('Logo image processed & staged! Click "Save Configuration" to commit.', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const prevLocal = localStorage.getItem('ultron_local_settings');
    const snapshot = { ...formData };
    showToast('Saving...', 'info');
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
    } catch (e) {
      setFormData(snapshot);
      if (prevLocal) localStorage.setItem('ultron_local_settings', prevLocal);
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

  // ─── User Management handlers ───
  useEffect(() => { if (settingsTab === 'users') loadUsers(); }, [settingsTab]);

  const filteredUsers = usersList.filter(u =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.full_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleUserSave = async (payload: UserPayload) => {
    let ok;
    if (userModal.mode === 'add') ok = await addUser(payload);
    else ok = await editUser(userModal.user.id, payload);
    if (ok) setUserModal(null);
  };

  const handleUserDelete = async () => {
    const ok = await deleteUser(deleteTarget.id);
    if (ok) setDeleteTarget(null);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    return parseUtcDate(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const RoleBadge = ({ role }: { role: string }) => {
    const isAdmin = role === 'admin';
    return (<span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', background: isAdmin ? 'rgba(220,38,38,0.1)' : 'rgba(15,118,110,0.1)', color: isAdmin ? '#dc2626' : '#0f766e', border: isAdmin ? '1px solid rgba(220,38,38,0.3)' : '1px solid rgba(15,118,110,0.3)' }}>{isAdmin ? <ShieldIcon /> : <UserIcon />} {isAdmin ? 'Admin' : 'Client'}</span>);
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
  const handleLicenseReverify = async () => {
    if (!newLicenseKey.trim()) { showToast('Enter a license key.', 'warn'); return; }
    setActivating(true); setActivationError('');
    try {
      const res = await authFetch(`${API_BASE}/license/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: newLicenseKey.trim(), station_id: newStationId.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('License updated!', 'success');
        setNewLicenseKey('');
        setNewStationId('');
        const r = await authFetch(`${API_BASE}/license/status`);
        if (r.ok) setLicenseStatus(await r.json());
      } else {
        setActivationError(data.detail || 'Verification failed.');
      }
    } catch { setActivationError('Cannot reach backend.'); }
    finally { setActivating(false); }
  };

  const s = licenseStatus || {};
  const renderLicenseTab = () => (
    <>
      <div style={{ ...GLASS_CARD, padding: '20px' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: T.text, marginBottom: '14px' }}>License Status</div>
        <div style={{ display: 'grid', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: T.textMuted }}>Status</span>
            <span style={{ color: s.licensed ? '#22c55e' : '#ef4444', fontWeight: '700' }}>{s.licensed ? 'ACTIVE' : 'INACTIVE'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: T.textMuted }}>Station ID</span>
            <span style={{ color: T.text, fontFamily: 'monospace' }}>{s.station_id || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: T.textMuted }}>License Key</span>
            <span style={{ color: T.text, fontFamily: 'monospace' }}>{s.key || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: T.textMuted }}>Server URL</span>
            <span style={{ color: T.text }}>{s.server_url || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: T.textMuted }}>Lock Status</span>
            <span style={{ color: T.text }}>{s.lock_status || 'unlocked'}</span>
          </div>
          {s.lock_reason && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: T.textMuted }}>Lock Reason</span>
              <span style={{ color: '#f59e0b' }}>{s.lock_reason}</span>
            </div>
          )}
          {s.amc_expiry && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: T.textMuted }}>AMC Expiry</span>
              <span style={{ color: T.text }}>{s.amc_expiry}</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ ...GLASS_CARD, padding: '20px' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: T.text, marginBottom: '14px' }}>Update License Key</div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '4px' }}>Station ID (Gateway ID)</label>
          <input
            type="text" placeholder={s.station_id || "Enter Station ID (e.g. ST-001)"}
            value={newStationId} onChange={e => setNewStationId(e.target.value)}
            style={{ ...INP, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '4px' }}>License Key (API Key)</label>
          <input
            type="text" placeholder="Enter new license key"
            value={newLicenseKey} onChange={e => setNewLicenseKey(e.target.value)}
            style={{ ...INP, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        {activationError && <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px' }}>{activationError}</div>}
        <button className="btn btn-primary" onClick={handleLicenseReverify} disabled={activating} style={{ padding: '8px 20px' }}>
          {activating ? 'Verifying…' : 'Verify & Save'}
        </button>
      </div>
    </>
  );

  const SUB_TABS = [
    { key: 'system', label: 'System Settings', icon: '#0f766e' },
    { key: 'license', label: 'License', icon: '#eab308' },
    { key: 'users', label: 'User Management', icon: '#dc2626' },
  ];

  const sectionTitleS: React.CSSProperties = {
    gridColumn: 'span 3',
    fontSize: '14px',
    fontWeight: '700',
    color: T.text,
    borderBottom: `1px solid ${T.primaryBorder}`,
    paddingBottom: '6px',
    marginTop: '8px',
  };

  const renderSystemTab = () => (
    <>
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
              {formData.plantLogo && (
                <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  ✓ Staged for save
                </span>
              )}
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
    </>
  );

  const renderUsersTab = () => {
    const userCounts = { total: usersList.length, admins: usersList.filter(u => u.role === 'admin').length, clients: usersList.filter(u => u.role === 'client').length, disabled: usersList.filter(u => !u.is_active).length };
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: T.text }}>User Management</div>
          <button className="btn btn-primary" onClick={() => setUserModal({ mode: 'add' })} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}><PlusIcon /> Add User</button>
        </div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
          {[
            { label: 'Total', value: userCounts.total, color: '#0f766e' },
            { label: 'Admins', value: userCounts.admins, color: '#dc2626' },
            { label: 'Clients', value: userCounts.clients, color: '#0f766e' },
            { label: 'Disabled', value: userCounts.disabled, color: '#64748b' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: 1, background: T.primaryBg, border: `1px solid ${T.primaryBorder}`, borderRadius: T.r, padding: '12px 16px' }}>
              <div style={{ fontSize: '22px', fontWeight: '800', color, fontFamily: 'monospace' }}>{value}</div>
              <div style={{ fontSize: '11px', color: T.textMuted }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: '12px' }}>
          <input type="text" placeholder="Search users…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...INP, maxWidth: '300px' }} />
        </div>
        <div style={{ ...GLASS_CARD, padding: '0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '600px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.primaryBorder}`, background: T.primaryBg }}>
                {['Username', 'Full Name', 'Role', 'Status', 'Created', 'Last Login', ''].map(h => (<th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: T.textMuted }}>{searchTerm ? 'No match.' : 'No users.'}</td></tr>
              ) : filteredUsers.map(u => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${T.primaryBorder}`, background: u.username === currentUser ? 'rgba(15,118,110,0.04)' : 'transparent' }}>
                  <td style={{ padding: '10px 14px' }}><span style={{ fontWeight: '600', color: T.text }}>{u.username}{u.username === currentUser && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#0f766e' }}>(you)</span>}</span></td>
                  <td style={{ padding: '10px 14px', color: T.textMuted }}>{u.full_name || '—'}</td>
                  <td style={{ padding: '10px 14px' }}><RoleBadge role={u.role} /></td>
                  <td style={{ padding: '10px 14px' }}><span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '600', background: u.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)', color: u.is_active ? '#059669' : '#64748b', border: u.is_active ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(100,116,139,0.3)' }}>{u.is_active ? '● Active' : '○ Disabled'}</span></td>
                  <td style={{ padding: '10px 14px', color: T.textMuted, fontSize: '12px' }}>{formatDate(u.created_at)}{u.created_by ? <div style={{ fontSize: '11px', color: '#475569' }}>by {u.created_by}</div> : ''}</td>
                  <td style={{ padding: '10px 14px', color: T.textMuted, fontSize: '12px' }}>{formatDate(u.last_login)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-sm" onClick={() => setUserModal({ mode: 'edit', user: u })} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 8px' }}><EditIcon /> Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(u)} disabled={u.username === currentUser} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 8px' }}><TrashIcon /> Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '14px', padding: '12px 16px', background: T.primaryBg, border: `1px solid ${T.primaryBorder}`, borderRadius: T.r, display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#dc2626', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldIcon /> Admin</div>
            <div style={{ fontSize: '11px', color: T.textMuted }}>Dashboard · Stations · Devices · Trends · Reports · Logs · Settings · Users</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#0f766e', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><UserIcon /> Client (read-only)</div>
            <div style={{ fontSize: '11px', color: T.textMuted }}>Dashboard · Trends · Reports</div>
          </div>
        </div>
        {userModal && <UserModal mode={userModal.mode} user={userModal.user} onClose={() => setUserModal(null)} onSave={handleUserSave} />}
        {deleteTarget && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(13,79,73,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#0d4f49', border: '1px solid #1a7a6e', borderRadius: '16px', width: '380px', padding: '28px', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: '700', color: '#f1f5f9' }}>Delete User</h3>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 24px' }}>Delete <strong style={{ color: '#f1f5f9' }}>{deleteTarget.username}</strong>? Cannot undo.</p>
              <div style={{ display: 'flex', gap: '10px' }}><button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} style={{ flex: 1 }}>Cancel</button><button className="btn btn-danger" onClick={handleUserDelete} style={{ flex: 1 }}>Delete</button></div>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="screen active" id="settingsScreen" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '4px', borderBottom: `1px solid ${T.primaryBorder}`, marginBottom: '4px' }}>
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSettingsTab(t.key)}
            onMouseEnter={() => {
              if (t.key === 'users') loadUsers();
              else if (t.key === 'license') authFetch(`${API_BASE}/license/status`).then(r => { if (r.ok) r.json().then(d => setLicenseStatus(d)); }).catch(() => {});
            }}
            onFocus={() => {
              if (t.key === 'users') loadUsers();
              else if (t.key === 'license') authFetch(`${API_BASE}/license/status`).then(r => { if (r.ok) r.json().then(d => setLicenseStatus(d)); }).catch(() => {});
            }}
            style={{
            padding: '8px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
            border: 'none', borderBottom: `3px solid ${settingsTab === t.key ? t.icon : 'transparent'}`,
            background: 'transparent', color: settingsTab === t.key ? t.icon : T.textMuted,
            transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>
      {settingsTab === 'system' && renderSystemTab()}
      {settingsTab === 'license' && renderLicenseTab()}
      {settingsTab === 'users' && renderUsersTab()}
    </div>
  );
});
