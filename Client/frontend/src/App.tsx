import React, { useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { AppContext, LiveDataContext } from './context/AppContext';
import { IconLayoutDashboard, IconDeviceDesktop, IconReport, IconSettings, IconUsers, IconEye, IconEyeOff, IconFileText, IconShieldCheck, IconMail, IconGauge, IconChartLine, IconBellRinging, IconRouter, IconUser, IconLock, IconLogs } from '@tabler/icons-react';
import { QRCodeSVG } from 'qrcode.react';
import './App.css';

// Import Screens
import { DashboardScreen } from './screens/DashboardScreen';
import { DevicesScreen } from './screens/DevicesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ContactScreen } from './screens/ContactScreen';
import { LogsScreen } from './screens/LogsScreen';

// Lazy load heavy secondary screens for code splitting & optimal bundle chunking
const TrendsScreen = React.lazy(() => import('./screens/TrendsScreen').then(m => ({ default: m.TrendsScreen })));
const ReportsScreen = React.lazy(() => import('./screens/ReportsScreen').then(m => ({ default: m.ReportsScreen })));
const CPCB = React.lazy(() => import('./screens/CPCB').then(m => ({ default: m.CPCB })));
const CalibrationScreen = React.lazy(() => import('./screens/CalibrationScreen').then(m => ({ default: m.CalibrationScreen })));


// ─── SVG Icons ────────────────────────────────────────────────────────────────
const DashboardIcon = () => <IconLayoutDashboard className="nav-icon" size={20} stroke={1.8} />;

const DevicesIcon = () => <IconDeviceDesktop className="nav-icon" size={20} stroke={1.8} />;

const TrendsIcon = () => <IconChartLine className="nav-icon" size={20} stroke={1.8} />;

const ReportsIcon = () => <IconReport className="nav-icon" size={20} stroke={1.8} />;

const SettingsIcon = () => <IconSettings className="nav-icon" size={20} stroke={1.8} />;

const UsersIcon = () => <IconUsers className="nav-icon" size={20} stroke={1.8} />;

const EyeIcon = () => <IconEye size={16} stroke={1.8} />;

const EyeOffIcon = () => <IconEyeOff size={16} stroke={1.8} />;

const CPCBIcon = () => <IconFileText className="nav-icon" size={20} stroke={1.8} />;

const CalibrationIcon = () => <IconShieldCheck className="nav-icon" size={20} stroke={1.8} />;

const ContactIcon = () => <IconMail className="nav-icon" size={20} stroke={1.8} />;

const LogsIcon = () => <IconLogs className="nav-icon" size={20} stroke={1.8} />;

// ─── Clock — self-contained, prevents App re-render on every second ──────────
const Clock = React.memo(() => {
  const [timeStr, setTimeStr] = useState('');
  useEffect(() => {
    const updateClock = () => {
      const d = new Date();
      const pad = (n, width = 2) => String(n).padStart(width, '0');
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const date = pad(d.getDate());
      const rawHours = d.getHours();
      const ampm = rawHours >= 12 ? 'PM' : 'AM';
      let hours = rawHours % 12;
      if (hours === 0) hours = 12;
      setTimeStr(`${year}.${month}.${date} || ${pad(hours)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ampm}`);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);
  return <>{timeStr}</>;
});

// ─── Nav definitions ──────────────────────────────────────────────────────────
const ALL_NAV = [
  { key: 'dashboardScreen', label: 'Dashboard Overview', Icon: DashboardIcon, roles: ['admin', 'client'] },
  { key: 'devicesScreen', label: 'Devices & Config', Icon: DevicesIcon, roles: ['admin'] },
  { key: 'logsScreen', label: 'Logs', Icon: LogsIcon, roles: ['admin'] },
  { key: 'reportsScreen', label: 'Reports & Trends', Icon: ReportsIcon, roles: ['admin', 'client'] },

  { key: 'settingsScreen', label: 'System Settings', Icon: SettingsIcon, roles: ['admin'] },

  { key: 'cpcbScreen', label: 'Server Management', Icon: CPCBIcon, roles: ['admin'] },
  { key: 'calibrationScreen', label: 'Calibration', Icon: CalibrationIcon, roles: ['admin'] },
  { key: 'contactScreen', label: 'Contact', Icon: ContactIcon, roles: ['admin', 'client'] },
];


function App() {
  const {
    currentUser,
    currentUserRole,
    allowServerMgmt,
    isSuperAdmin,
    login,
    logout,
    activeScreen,
    setActiveScreen,
    plantName,
    plantAddress,
    plantLogo,
    showToast,
    broadcasts,
    amcExpiry,
    API_BASE,
    isLicensed,
    setIsLicensed,
    lockStatus,
    setLockStatus,
    lockReason,
    prefetchScreen,
    authFetch,
  } = useContext(AppContext);
  const liveDataCtx = useContext(LiveDataContext) || {};
  const fetchLatestTelemetryAndKpis = liveDataCtx.fetchLatestTelemetryAndKpis;

  const [refreshing, setRefreshing] = useState(false);
  const [localVersion, setLocalVersion] = useState('');

  // Activation & lock screen states
  const [activationKey, setActivationKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState('');

  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [bypassed, setBypassed] = useState(false);

  const handleActivationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationKey.trim()) {
      setActivationError('API Key is required.');
      return;
    }
    setActivationError('');
    setActivating(true);
    try {
      const res = await fetch(`${API_BASE}/license/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: activationKey }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsLicensed(true);
        if (showToast) showToast('License activated successfully!', 'success');
        window.location.reload();
      } else {
        setActivationError(data.detail || 'Activation failed.');
      }
    } catch {
      setActivationError('Failed to connect to the backend server.');
    } finally {
      setActivating(false);
    }
  };

  const handlePasscodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === 'Ultronpoiu') {
      setBypassed(true);
      if (showToast) showToast('Technician Lock Bypass Active.', 'warning');
    } else {
      setPasscodeError('Invalid technician passcode.');
    }
  };

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const res = await fetch(`${API_BASE}/version`);
        if (res.ok) {
          const data = await res.json();
          setLocalVersion(data.version);
        }
      } catch (err) {
        console.error("Failed to fetch app version:", err);
      }
    };
    if (API_BASE) {
      fetchVersion();
    }
  }, [API_BASE]);

  // License check removed — AMC block bypassed. Goes straight to Master login.

  const handleLogoClick = async () => {
    if (refreshing) return;
    setRefreshing(true);
    if (showToast) {
      showToast('Refreshing dashboard telemetry...', 'info');
    }
    if (fetchLatestTelemetryAndKpis) {
      await fetchLatestTelemetryAndKpis();
    }
    setRefreshing(false);
    if (showToast) {
      showToast('Dashboard telemetry updated successfully.');
    }
  };

  const handleHardRefresh = () => {
    if (showToast) {
      showToast('Performing hard refresh...', 'info');
    }
    setTimeout(() => window.location.reload(), 500);
  };

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setLoginError('Both username and password are required.');
      return;
    }
    setLoginError('');
    setLoggingIn(true);
    const success = await login(username, password);
    setLoggingIn(false);
    if (!success) {
      setLoginError('Authentication failed. Check your credentials.');
    }
  };

  // Filter nav items based on role
  const visibleNav = ALL_NAV.filter(item =>
    currentUserRole && item.roles.includes(currentUserRole)
    && (item.key !== 'cpcbScreen' || allowServerMgmt)
    && (item.key !== 'calibrationScreen' || currentUserRole === 'admin')
  );

  // Ensure active screen is accessible by this role
  useEffect(() => {
    if (currentUserRole === 'client') {
      const allowedScreens = ['dashboardScreen', 'trendsScreen', 'reportsScreen'];
      if (!allowedScreens.includes(activeScreen)) {
        setActiveScreen('dashboardScreen');
      }
    } else if (!allowServerMgmt && activeScreen === 'cpcbScreen') {
      setActiveScreen('dashboardScreen');
    }
  }, [currentUserRole, activeScreen, setActiveScreen, allowServerMgmt]);

  // ─── System IP + internet indicator (header) ────────────────────────────────
  const [sysNet, setSysNet] = useState<{ lan_ip: string; internet_connected: boolean; hostname?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await authFetch(`${API_BASE}/settings/network-info`);
        if (res.ok && alive) setSysNet(await res.json());
      } catch {}
    };
    if (currentUserRole) load();
    window.addEventListener('online', load);
    window.addEventListener('offline', load);
    return () => { alive = false; window.removeEventListener('online', load); window.removeEventListener('offline', load); };
  }, [authFetch, API_BASE, currentUserRole]);

  // ─── License Setup Screen ──────────────────────────────────────────────────
  if (!isLicensed) {
    return (
      <div className="login-screen" style={{ background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--text-primary) 100%)', color: 'var(--surface-muted)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="login-card" style={{ maxWidth: '450px', width: '100%', padding: '40px', background: 'rgba(4, 52, 44, 0.7)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ textAlign: 'center' }}>
            <img src="/assets/Ultron_logo.png" className="login-logo" alt="UltrON Logo" style={{ height: '70px', marginBottom: '16px', objectFit: 'contain' }} />
            <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '6px', color: 'var(--info)' }}>License Activation</h2>
            <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.75)' }}>Please activate your UltrON installation with your station key.</p>
          </div>
          <form onSubmit={handleActivationSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.75)' }}>Station API Key</label>
              <input
                type="text"
                placeholder="Enter API Key (e.g. IN_UltronSST_...)"
                value={activationKey}
                onChange={e => setActivationKey(e.target.value)}
                style={{ padding: '12px 16px', borderRadius: '10px', border: '1.5px solid rgba(255,255,255,0.1)', background: 'rgba(26, 29, 28, 0.6)', color: '#fff', fontSize: '13px', outline: 'none' }}
                disabled={activating}
              />
            </div>
            {activationError && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(226, 75, 74, 0.1)', border: '1px solid rgba(226, 75, 74, 0.2)', color: 'var(--danger)', fontSize: '12px', fontWeight: '500' }}>
                ⚠️ {activationError}
              </div>
            )}
            <button type="submit" disabled={activating} style={{ padding: '14px', borderRadius: '10px', border: 'none', background: 'var(--info)', color: '#fff', fontSize: '14px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(55, 138, 221, 0.3)' }}>
              {activating ? 'Activating Installation...' : 'Activate System'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Remote Administrator Lock Screen ──────────────────────────────────────
  if ((lockStatus === 'manual_lock' || lockStatus === 'amc_expired') && !bypassed) {
    return (
      <div className="login-screen" style={{ background: 'linear-gradient(135deg, var(--danger-text) 0%, var(--danger-text) 100%)', color: 'var(--surface-muted)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="login-card" style={{ maxWidth: '450px', width: '100%', padding: '40px', background: 'rgba(40, 10, 10, 0.7)', backdropFilter: 'blur(16px)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '50px', marginBottom: '12px' }}>🔒</div>
            <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px', color: 'var(--danger)' }}>System Locked</h2>
            <p style={{ fontSize: '13px', color: 'var(--danger-bg)', lineHeight: '1.5' }}>
              {lockStatus === 'amc_expired' 
                ? 'Your AMC License has expired. Please contact Neeraj for renewal.' 
                : (lockReason || 'This system has been locked remotely by the administrator.')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
              <div style={{ background: '#fff', padding: '10px', borderRadius: '10px', display: 'inline-flex' }}>
                <QRCodeSVG
                  value={`Support Helpline
7659091468, 9133377852, 853
Sales Enquiries
8801231166, 9133377854
Email
tst@sunshinetechno.com, support@sunshinetechno.com, service@sunshinetechno.com
Website
sunshinetechno.com
Our Offices
Registered
#4-7-83, Flat No. 403-404, Kalanjali Classic, Scientist Colony, Habsiguda, Hyderabad - 500007
Corporate
#213, Fairmount Fortune One, 7-2-1813/5/A/1, Czech Colony, Sanath Nagar, Hyderabad - 500018
Branch - Visakhapatnam
#413, Dattathreya Enclave, Siddhartha Nagar, Kurmannapalem, Andhra Pradesh - 530046`}
                  size={140}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--danger-bg)', marginTop: '8px' }}>
              Scan for <strong>Support Helpline</strong> &amp; branch details
            </p>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px' }}>
            <form onSubmit={handlePasscodeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', color: 'var(--danger-bg)', fontWeight: '600' }}>Technician Bypass Passcode</label>
                <input
                  type="password"
                  placeholder="Enter passcode to unlock locally"
                  value={passcode}
                  onChange={e => setPasscode(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '13px', outline: 'none' }}
                />
              </div>
              {passcodeError && (
                <div style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: '500' }}>
                  ❌ {passcodeError}
                </div>
              )}
              <button type="submit" style={{ padding: '10px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                Unlock Temporarily
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ─── Login Screen ──────────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div className="login-screen">
        <div className="login-main">
          {/* Left: deep-green industrial brand panel */}
          <div className="login-brand-panel">
            <img src="/assets/Ultron_logo.png" className="login-brand-logo" alt="UltrON Logo" />
            <div className="login-brand-body">
              <h2 className="login-tagline">
                Industrial data.
                <span>Logged. Monitored. Connected.</span>
              </h2>
              <p className="login-subtext">
                Acquire, record, and monitor device data, process parameters, alarms, and system health from one platform.
              </p>
              <div className="login-caps">
                <div className="login-cap">
                  <IconGauge size={18} stroke={1.5} className="login-cap-icon" />
                  <span>Live data</span>
                </div>
                <div className="login-cap">
                  <IconChartLine size={18} stroke={1.5} className="login-cap-icon" />
                  <span>Analytics</span>
                </div>
                <div className="login-cap">
                  <IconBellRinging size={18} stroke={1.5} className="login-cap-icon" />
                  <span>Alarms</span>
                </div>
                <div className="login-cap">
                  <IconFileText size={18} stroke={1.5} className="login-cap-icon" />
                  <span>Reporting</span>
                </div>
              </div>
            </div>
            <div className="login-telemetry" aria-hidden="true">
              <svg viewBox="0 0 520 74" preserveAspectRatio="none" fill="none">
                <path d="M0 40 L40 34 L80 46 L120 30 L160 52 L200 26 L240 48 L280 38 L320 44 L360 28 L400 50 L440 36 L480 42 L520 32" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
                <line x1="0" y1="60" x2="520" y2="60" stroke="currentColor" strokeWidth="1" strokeDasharray="3 5" />
                <circle cx="120" cy="30" r="2.5" fill="currentColor" />
                <circle cx="240" cy="48" r="2.5" fill="currentColor" />
                <circle cx="360" cy="28" r="2.5" fill="currentColor" />
                <circle cx="480" cy="42" r="2.5" fill="currentColor" />
              </svg>
            </div>
          </div>

          {/* Right: light form panel */}
          <div className="login-form-panel">
            <img
              src="/assets/sunshine_logo.png"
              className="login-form-logo"
              alt="Sunshine Technologies"
              title="Click to perform hard refresh"
              onClick={handleHardRefresh}
              style={{ cursor: 'pointer', transition: 'opacity 0.2s ease' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.7'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            />
            <div className="login-form-inner">
              <h1 className="login-heading">ULTRON</h1>
              <p className="login-platform">Industrial Monitoring Platform</p>
              <p className="login-powered">Powered by Sunshine Technologies</p>
              {localVersion && (
                <div className="login-version">
                  VERSION {localVersion}
                </div>
              )}
              <p className="login-subheading">
                Sign in with your credentials to access the system.
              </p>

              <form onSubmit={handleLoginSubmit}>
                <div className="login-field">
                  <label className="login-label" htmlFor="login-username">Username</label>
                  <div className="login-input-wrap">
                    <IconUser size={16} stroke={1.5} className="login-input-icon" />
                    <input
                      id="login-username"
                      type="text"
                      className={`login-input ${loginError ? 'error' : ''}`}
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="Enter username"
                      autoComplete="username"
                      aria-invalid={!!loginError}
                    />
                  </div>
                </div>

                <div className="login-field">
                  <label className="login-label" htmlFor="login-password">Password</label>
                  <div className="login-input-wrap">
                    <IconLock size={16} stroke={1.5} className="login-input-icon" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      className={`login-input ${loginError ? 'error' : ''}`}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      aria-invalid={!!loginError}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="login-pw-toggle"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                <div className="login-forgot-row">
                  <a
                    href="#"
                    className="login-forgot"
                    title="Contact support to reset your password"
                    onClick={e => e.preventDefault()}
                  >
                    Forgot password?
                  </a>
                </div>

                {loginError && (
                  <div className="login-error">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  className="login-btn"
                  disabled={loggingIn}
                >
                  {loggingIn ? 'Signing in...' : 'Sign in to UltrON'}
                </button>
                <p className="login-secure-note">Secure access &bull; Authorized users only</p>
              </form>
            </div>
          </div>
        </div>

        <div className="login-footer" style={{ flexDirection: 'column', gap: '6px', padding: '12px 24px', fontSize: '11px', lineHeight: 1.5 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '14px', color: 'var(--text-secondary)' }}>
            <span><strong>Support Helpline:</strong> 7659091468, 9133377852, 853</span>
            <span>&bull;</span>
            <span><strong>Sales:</strong> 8801231166, 9133377854</span>
            <span>&bull;</span>
            <span><strong>Email:</strong> <a href="mailto:tst@sunshinetechno.com" className="login-footer-link">tst@sunshinetechno.com</a>, <a href="mailto:support@sunshinetechno.com" className="login-footer-link">support@sunshinetechno.com</a></span>
            <span>&bull;</span>
            <span><strong>Website:</strong> <a href="https://sunshinetechno.com/" target="_blank" rel="noopener noreferrer" className="login-footer-link">sunshinetechno.com</a></span>
          </div>
          <div style={{ color: 'var(--text-secondary)', opacity: 0.85, fontSize: '10.5px' }}>
            <span>&copy; 2026 Sunshine Technologies. Hyderabad &bull; Visakhapatnam. All rights reserved.</span>
          </div>
        </div>

        <div id="toastContainer"></div>
      </div>
    );
  }

  // ─── Screen renderer ───────────────────────────────────────────────────────
  const renderScreen = () => {
    let screenComponent;
    switch (activeScreen) {
      case 'dashboardScreen': screenComponent = <DashboardScreen />; break;
      case 'devicesScreen': screenComponent = currentUserRole === 'admin' ? <DevicesScreen /> : <DashboardScreen />; break;
      case 'logsScreen': screenComponent = currentUserRole === 'admin' ? <LogsScreen /> : <DashboardScreen />; break;
      case 'trendsScreen': screenComponent = <TrendsScreen />; break;
      case 'reportsScreen': screenComponent = <ReportsScreen />; break;
      case 'settingsScreen': screenComponent = currentUserRole === 'admin' ? <SettingsScreen /> : <DashboardScreen />; break;
      case 'cpcbScreen': screenComponent = currentUserRole === 'admin' && allowServerMgmt ? <CPCB /> : <DashboardScreen />; break;
      case 'calibrationScreen': screenComponent = currentUserRole === 'admin' ? <CalibrationScreen /> : <DashboardScreen />; break;
      case 'contactScreen': screenComponent = <ContactScreen />; break;
      default: screenComponent = <DashboardScreen />; break;
    }
    return (
      <React.Suspense fallback={<div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600' }}>Loading module…</div>}>
        {screenComponent}
      </React.Suspense>
    );
  };

  return (
    <div className="app-shell">
      {/* Navigation Rail */}
      <aside className="sidebar nav-rail">
        <div className="nav-rail-logo">
          <button onClick={handleHardRefresh} title="Click to hard refresh page"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', outline: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.75'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
            <img src="/assets/Ultron_logo.png?t=1" alt="UltrON" className="nav-rail-logo-img" />
          </button>
        </div>

        <div className="nav-rail-items">
          {visibleNav.map(({ key, label, Icon }) => (
            <button
              key={key}
              className={`nav-rail-btn ${activeScreen === key ? 'active' : ''}`}
              onClick={() => setActiveScreen(key)}
              onMouseEnter={() => prefetchScreen && prefetchScreen(key)}
              onFocus={() => prefetchScreen && prefetchScreen(key)}
              title={label}
            >
              <Icon />
              <span className="nav-rail-label">{label}</span>
            </button>
          ))}
        </div>

        <div className="nav-rail-footer">
          <div className="nav-rail-user">{currentUser}</div>
        </div>
      </aside>

      {/* Main Container — header + content + footer stacked vertically */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top Header Bar */}
        <header className="top-bar">
          <div className="top-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* System Live Clock */}
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--primary-600)', background: 'rgba(13,79,73,0.06)', padding: '6px 14px', borderRadius: '6px', border: '1px solid rgba(13,79,73,0.15)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
              <Clock />
            </div>
          </div>

          {/* Centered Plant Information */}
          <div className="top-middle" style={{ display: 'flex', alignItems: 'center', gap: '14px', justifyContent: 'center' }}>
            {plantLogo && (
              <img
                src={plantLogo}
                alt="Industry Logo"
                style={{ maxHeight: '42px', maxWidth: '120px', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.04))' }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: plantLogo ? 'flex-start' : 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--primary-600)', fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {plantName}
              </div>
              {plantAddress && (
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '500', marginTop: '1px' }}>
                  {plantAddress}
                </div>
              )}
            </div>
          </div>

          <div className="top-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {sysNet && (
              <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                  <span>PC: <strong style={{ fontFamily: 'Consolas, monospace', color: 'var(--text-primary)', fontSize: '12px' }}>{sysNet.lan_ip && sysNet.lan_ip !== '127.0.0.1' ? sysNet.lan_ip : 'Not available'}</strong></span>
                  {sysNet.hostname && (
                    <>
                      <span style={{ opacity: 0.5 }}>/</span>
                      <span style={{ fontWeight: 600 }}>HOST: {sysNet.hostname}</span>
                    </>
                  )}
                </div>
                <div style={{ marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end', fontWeight: '600' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block', background: sysNet.internet_connected ? 'var(--success)' : 'var(--danger)' }}></span>
                  Internet {sysNet.internet_connected ? 'Online' : 'Offline'}
                </div>
              </div>
            )}
            <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <div>
                Operator: <strong>{currentUser}</strong>
              </div>
              {/* Role badge */}
              <div style={{ marginTop: '2px' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '1px 8px',
                  borderRadius: '999px',
                  fontSize: '10px',
                  fontWeight: '700',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: currentUserRole === 'admin' ? 'rgba(220,38,38,0.1)' : 'rgba(13,79,73,0.1)',
                  color: currentUserRole === 'admin' ? 'var(--danger)' : 'var(--primary-600)',
                  border: currentUserRole === 'admin' ? '1px solid rgba(220,38,38,0.3)' : '1px solid rgba(13,79,73,0.3)',
                }}>
                  {currentUserRole === 'admin' ? 'Admin' : 'Client View'}
                </span>
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                transition: 'transform 0.2s ease, opacity 0.2s ease',
                marginLeft: '4px',
                outline: 'none'
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.opacity = '0.8'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '1'; }}
            >
              <img src="/assets/sunshine_logo.png" alt="Sign Out" style={{ display: 'block', height: '40px', width: 'auto' }} />
            </button>
          </div>
        </header>

        {/* Content Panel */}
        <main className="content-area">
          {renderScreen()}
        </main>

        {/* Footer with Fixed Copyright and Scrolling Marquee */}
        <footer className="copyright-footer" style={{ margin: '0', borderRadius: '0', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
          <div style={{
            flexShrink: 0,
            padding: '0 20px',
            fontWeight: '700',
            fontSize: '12px',
            color: 'var(--primary-600)',
            whiteSpace: 'nowrap',
            borderRight: '1px solid rgba(13,79,73,0.2)',
            background: 'rgba(255, 255, 255, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            lineHeight: 1.4
          }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'none', letterSpacing: '0.02em', lineHeight: 1.6 }}>
              &copy; 2026 <a href="https://www.sunshinetechno.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-600)', textDecoration: 'underline' }}>Sunshine Technologies</a>. All rights reserved.
              <br />Support: 7659091468, 9133377852 &nbsp;|&nbsp; Sales: 8801231166, 9133377854
            </div>
          </div>
          <div className="marquee-container" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '100%', overflow: 'hidden' }}>
              <div className="marquee-content" style={{ animationDuration: broadcasts && broadcasts.length > 0 ? '25s' : '35s' }}>
                {broadcasts && broadcasts.length > 0 && localStorage.getItem('ultron_broadcast_enabled') !== 'false' ? (
                  broadcasts.map((b, i) => (
                    <span key={b.id} style={{ color: b.severity === 'critical' ? 'var(--danger)' : b.severity === 'warn' ? 'var(--warning)' : 'inherit' }}>
                      {b.message}{i < broadcasts.length - 1 ? '  ◆  ' : ''}
                    </span>
                  ))
                ) : (
                  <span>UltrON | Environmental monitoring data acquisition and transmission platform designed for applicable CPCB, SPCB/PCC requirements and regulatory protocols.</span>
                )}
              </div>
            </div>
          </div>
        </footer>

      </div>{/* end main column */}

      {/* Global Toast Slot */}
      <div id="toastContainer"></div>
    </div>
  );
}

export default App;
