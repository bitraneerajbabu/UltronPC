import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from './context/AppContext';
import './App.css';

// Import Screens
import { DashboardScreen } from './screens/DashboardScreen';
import { DevicesScreen } from './screens/DevicesScreen';
import { ReportsScreen } from './screens/ReportsScreen';

import { SettingsScreen } from './screens/SettingsScreen';
import { CPCB } from './screens/CPCB';
import { CalibrationScreen } from './screens/CalibrationScreen';
import { ContactScreen } from './screens/ContactScreen';


// ─── SVG Icons ────────────────────────────────────────────────────────────────
const DashboardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
    <rect x="3" y="3" width="7" height="9" />
    <rect x="14" y="3" width="7" height="5" />
    <rect x="14" y="12" width="7" height="9" />
    <rect x="3" y="16" width="7" height="5" />
  </svg>
);

const DevicesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
    <line x1="20" y1="6" x2="20.01" y2="6" />
    <line x1="20" y1="18" x2="20.01" y2="18" />
  </svg>
);



const ReportsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const UsersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const CPCBIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <circle cx="12" cy="15" r="1" fill="currentColor"/>
  </svg>
);


const CalibrationIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

const ContactIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);



// ─── Nav definitions ──────────────────────────────────────────────────────────
const ALL_NAV = [
  { key: 'dashboardScreen', label: 'Dashboard Overview', Icon: DashboardIcon, roles: ['admin', 'client'] },
  { key: 'devicesScreen', label: 'Devices & Config', Icon: DevicesIcon, roles: ['admin'] },
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
    login,
    logout,
    activeScreen,
    setActiveScreen,
    plantName,
    plantAddress,
    plantLogo,
    fetchLatestTelemetryAndKpis,
    showToast,
    broadcasts,
    amcExpiry,
    API_BASE,
    isLicensed,
    setIsLicensed,
    lockStatus,
    setLockStatus,
    lockReason,
  } = useContext(AppContext);

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

  // Clock state
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
      const hoursStr = pad(hours);
      const minutes = pad(d.getMinutes());
      const seconds = pad(d.getSeconds());
      setTimeStr(`${year}.${month}.${date} || ${hoursStr}:${minutes}:${seconds} ${ampm}`);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

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
  );

  // Ensure active screen is accessible by this role
  useEffect(() => {
    if (currentUserRole === 'client') {
      const allowedScreens = ['dashboardScreen', 'trendsScreen', 'reportsScreen', 'calibrationScreen', 'contactScreen'];
      if (!allowedScreens.includes(activeScreen)) {
        setActiveScreen('dashboardScreen');
      }
    }
  }, [currentUserRole, activeScreen, setActiveScreen]);

  // ─── License Setup Screen ──────────────────────────────────────────────────
  if (!isLicensed) {
    return (
      <div className="login-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#f8fafc', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="login-card" style={{ maxWidth: '450px', width: '100%', padding: '40px', background: 'rgba(30, 41, 59, 0.7)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ textAlign: 'center' }}>
            <img src="/assets/Ultron_logo.png" className="login-logo" alt="UltrON Logo" style={{ height: '70px', marginBottom: '16px', objectFit: 'contain' }} />
            <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '6px', color: '#38bdf8' }}>License Activation</h2>
            <p style={{ fontSize: '13px', color: '#94a3b8' }}>Please activate your UltrON installation with your station key.</p>
          </div>
          <form onSubmit={handleActivationSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8' }}>Station API Key</label>
              <input
                type="text"
                placeholder="Enter API Key (e.g. IN_UltronSST_...)"
                value={activationKey}
                onChange={e => setActivationKey(e.target.value)}
                style={{ padding: '12px 16px', borderRadius: '10px', border: '1.5px solid rgba(255,255,255,0.1)', background: 'rgba(15, 23, 42, 0.6)', color: '#fff', fontSize: '13px', outline: 'none' }}
                disabled={activating}
              />
            </div>
            {activationError && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', fontSize: '12px', fontWeight: '500' }}>
                ⚠️ {activationError}
              </div>
            )}
            <button type="submit" disabled={activating} style={{ padding: '14px', borderRadius: '10px', border: 'none', background: '#0284c7', color: '#fff', fontSize: '14px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)' }}>
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
      <div className="login-screen" style={{ background: 'linear-gradient(135deg, #180505 0%, #2a0808 100%)', color: '#f8fafc', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="login-card" style={{ maxWidth: '450px', width: '100%', padding: '40px', background: 'rgba(40, 10, 10, 0.7)', backdropFilter: 'blur(16px)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '50px', marginBottom: '12px' }}>🔒</div>
            <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px', color: '#f87171' }}>System Locked</h2>
            <p style={{ fontSize: '13px', color: '#fca5a5', lineHeight: '1.5' }}>
              {lockStatus === 'amc_expired' 
                ? 'Your AMC License has expired. Please contact Neeraj for renewal.' 
                : (lockReason || 'This system has been locked remotely by the administrator.')}
            </p>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px' }}>
            <form onSubmit={handlePasscodeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', color: '#fca5a5', fontWeight: '600' }}>Technician Bypass Passcode</label>
                <input
                  type="password"
                  placeholder="Enter passcode to unlock locally"
                  value={passcode}
                  onChange={e => setPasscode(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '13px', outline: 'none' }}
                />
              </div>
              {passcodeError && (
                <div style={{ color: '#f87171', fontSize: '11px', fontWeight: '500' }}>
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
        <div className="login-card">
          <img src="/assets/Ultron_logo.png" className="login-logo" alt="UltrON Logo" />
          <h2 className="login-title" style={{ marginBottom: localVersion ? '2px' : '8px' }}>Industrial Monitoring Platform</h2>
          {localVersion && (
            <div style={{
              fontSize: '11px',
              fontWeight: '800',
              color: '#0d4f49',
              background: 'rgba(13,79,73,0.08)',
              padding: '3px 10px',
              borderRadius: '99px',
              display: 'inline-block',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Version {localVersion}
            </div>
          )}
          <p className="login-description">
            Sign in with your credentials to access the system
          </p>

          <form onSubmit={handleLoginSubmit}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                id="login-username"
                type="text"
                className={`form-input ${loginError ? 'error' : ''}`}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
              />
            </div>

            <div className="form-group relative-group">
              <label className="form-label">Password</label>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className={`form-input password-input ${loginError ? 'error' : ''}`}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="password-toggle-btn"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            {loginError && (
              <div className="form-error-msg show" style={{ marginBottom: '18px', textAlign: 'left' }}>
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-wide"
              style={{ height: '42px', fontSize: '14px' }}
              disabled={loggingIn}
            >
              {loggingIn ? 'Signing in…' : 'Sign In to System'}
            </button>
          </form>


          <img
            src="/assets/sunshine_logo.png"
            className="brand-logo"
            alt="Neeraj"
            title="Click to perform hard refresh"
            onClick={handleHardRefresh}
            style={{ cursor: 'pointer', transition: 'transform 0.2s ease' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          />
        </div>
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', borderTop: '1px solid #e2e8f0', padding: '6px 20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', fontSize: '11px', fontWeight: '600', color: '#64748b', flexWrap: 'wrap', zIndex: 10 }}>
              <span>&copy; 2026 All Rights Reserved to <a href="https://sunshinetechno.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#14b8a6', textDecoration: 'none' }}>Sunshinetechnologies</a></span>
          <span>Support: 7659091468, 9133377852, 853 &amp; Sales: 8801231166, 9133377854</span>
        </div>
        <div id="toastContainer"></div>
      </div>
    );
  }

  // ─── Screen renderer ───────────────────────────────────────────────────────
  const renderScreen = () => {
    switch (activeScreen) {
      case 'dashboardScreen': return <DashboardScreen />;
      case 'devicesScreen': return currentUserRole === 'admin' ? <DevicesScreen /> : <DashboardScreen />;
      case 'reportsScreen': return <ReportsScreen />;

      case 'settingsScreen': return currentUserRole === 'admin' ? <SettingsScreen /> : <DashboardScreen />;

      case 'cpcbScreen': return currentUserRole === 'admin' ? <CPCB /> : <DashboardScreen />;
      case 'calibrationScreen': return currentUserRole === 'admin' ? <CalibrationScreen /> : <DashboardScreen />;
      case 'contactScreen': return <ContactScreen />;
      default: return <DashboardScreen />;
    }
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
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#0d4f49', background: 'rgba(13,79,73,0.06)', padding: '6px 14px', borderRadius: '6px', border: '1px solid rgba(13,79,73,0.15)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
              {timeStr}
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
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#0d4f49', fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {plantName}
              </div>
              {plantAddress && (
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '500', marginTop: '1px' }}>
                  {plantAddress}
                </div>
              )}
            </div>
          </div>

          <div className="top-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'right', fontSize: '12px', color: '#475569' }}>
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
                  color: currentUserRole === 'admin' ? '#dc2626' : '#0d4f49',
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
            color: '#0d4f49',
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
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'none', letterSpacing: '0.02em', lineHeight: 1.6 }}>
              All &copy; 2026 rights reserved | All Rights Reserved to <a href="https://www.sunshinetechno.com" target="_blank" rel="noopener noreferrer" style={{ color: '#0d4f49', textDecoration: 'underline' }}>Sunshinetechnologies</a>
              <br />Support: 7659091468, 9133377852, 853 &amp; Sales: 8801231166, 9133377854
            </div>
          </div>
          <div className="marquee-container" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '100%', overflow: 'hidden' }}>
              <div className="marquee-content" style={{ animationDuration: broadcasts && broadcasts.length > 0 ? '25s' : '35s' }}>
                {broadcasts && broadcasts.length > 0 && localStorage.getItem('ultron_broadcast_enabled') !== 'false' ? (
                  broadcasts.map((b, i) => (
                    <span key={b.id} style={{ color: b.severity === 'critical' ? '#ef4444' : b.severity === 'warn' ? '#f59e0b' : 'inherit' }}>
                      {b.message}{i < broadcasts.length - 1 ? '  ◆  ' : ''}
                    </span>
                  ))
                ) : (
                  <span>Data available at this portal is as per CPCB prescribed procedure published at cpcb.nic.in!</span>
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
