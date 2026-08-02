import React, { useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { AppContext, LiveDataContext } from './context/AppContext';
import { IconLayoutDashboard, IconDeviceDesktop, IconReport, IconSettings, IconUsers, IconEye, IconEyeOff, IconFileText, IconShieldCheck, IconMail, IconGauge, IconChartLine, IconBellRinging, IconRouter, IconUser, IconLock } from '@tabler/icons-react';
import './App.css';

// Import Screens
import { DashboardScreen } from './screens/DashboardScreen';
import { DevicesScreen } from './screens/DevicesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ContactScreen } from './screens/ContactScreen';

// Lazy load heavy secondary screens for code splitting & optimal bundle chunking
const ReportsScreen = React.lazy(() => import('./screens/ReportsScreen').then(m => ({ default: m.ReportsScreen })));
const CPCB = React.lazy(() => import('./screens/CPCB').then(m => ({ default: m.CPCB })));
const CalibrationScreen = React.lazy(() => import('./screens/CalibrationScreen').then(m => ({ default: m.CalibrationScreen })));


// â”€â”€â”€ SVG Icons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DashboardIcon = () => <IconLayoutDashboard className="nav-icon" size={20} stroke={1.8} />;

const DevicesIcon = () => <IconDeviceDesktop className="nav-icon" size={20} stroke={1.8} />;

const ReportsIcon = () => <IconReport className="nav-icon" size={20} stroke={1.8} />;

const SettingsIcon = () => <IconSettings className="nav-icon" size={20} stroke={1.8} />;

const UsersIcon = () => <IconUsers className="nav-icon" size={20} stroke={1.8} />;

const EyeIcon = () => <IconEye size={16} stroke={1.8} />;

const EyeOffIcon = () => <IconEyeOff size={16} stroke={1.8} />;

const CPCBIcon = () => <IconFileText className="nav-icon" size={20} stroke={1.8} />;

const CalibrationIcon = () => <IconShieldCheck className="nav-icon" size={20} stroke={1.8} />;

const ContactIcon = () => <IconMail className="nav-icon" size={20} stroke={1.8} />;

// â”€â”€â”€ Clock â€” self-contained, prevents App re-render on every second â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Nav definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // License check removed â€” AMC block bypassed. Goes straight to Master login.

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

  // â”€â”€â”€ License Setup Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!isLicensed) {
    return (
      <div className="login-screen" style={{ background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--text-primary) 100%)', color: 'var(--surface-muted)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="login-card" style={{ maxWidth: '450px', width: '100%', padding: '40px', background: 'rgba(30, 41, 59, 0.7)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ textAlign: 'center' }}>
            <img src="/assets/Ultron_logo.png" className="login-logo" alt="UltrON Logo" style={{ height: '70px', marginBottom: '16px', objectFit: 'contain' }} />
            <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '6px', color: 'var(--info)' }}>License Activation</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Please activate your UltrON installation with your station key.</p>
          </div>
          <form onSubmit={handleActivationSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Station API Key</label>
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
                âš ï¸ {activationError}
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

  // â”€â”€â”€ Remote Administrator Lock Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if ((lockStatus === 'manual_lock' || lockStatus === 'amc_expired') && !bypassed) {
    return (
      <div className="login-screen" style={{ background: 'linear-gradient(135deg, var(--danger-text) 0%, var(--danger-text) 100%)', color: 'var(--surface-muted)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="login-card" style={{ maxWidth: '450px', width: '100%', padding: '40px', background: 'rgba(40, 10, 10, 0.7)', backdropFilter: 'blur(16px)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '50px', marginBottom: '12px' }}>ðŸ”’</div>
            <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px', color: 'var(--danger)' }}>System Locked</h2>
            <p style={{ fontSize: '13px', color: 'var(--danger-bg)', lineHeight: '1.5' }}>
              {lockStatus === 'amc_expired' 
                ? 'Your AMC License has expired. Please contact Neeraj for renewal.' 
                : (lockReason || 'This system has been locked remotely by the administrator.')}
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
                  âŒ {passcodeError}
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

  // â”€â”€â”€ Login Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!currentUser) {
    return (
      <div className="login-screen">
        <div className="login-main">
          {/* Left: dark teal brand panel */}
          <div className="login-brand-panel">
            <img src="/assets/Ultron_logo.png" className="login-brand-logo" alt="UltrON Logo" />
            <div className="login-brand-body">
              <div className="login-tiles">
                <div className="login-tile">
                  <IconGauge size={24} stroke={1.5} className="login-tile-icon" />
                  <span>Live parameters</span>
                </div>
                <div className="login-tile">
                  <IconChartLine size={24} stroke={1.5} className="login-tile-icon" />
                  <span>Trend reports</span>
                </div>
                <div className="login-tile">
                  <IconBellRinging size={24} stroke={1.5} className="login-tile-icon" />
                  <span>Alarm alerts</span>
                </div>
                <div className="login-tile">
                  <IconRouter size={24} stroke={1.5} className="login-tile-icon" />
                  <span>Station status</span>
                </div>
              </div>
              <h2 className="login-tagline">Real-time environmental data monitor.</h2>
              <p className="login-subtext">Monitor stations, track parameters, and respond to alarms from one dashboard.</p>
            </div>
          </div>

          {/* Right: white form panel */}
          <div className="login-form-panel">
            <div className="login-form-inner">
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
              <h1 className="login-heading">Industrial monitoring platform</h1>
              {localVersion && (
                <div className="login-version">
                  Version {localVersion}
                </div>
              )}
              <p className="login-subheading">
                Sign in with your credentials to access the system.
              </p>

              <form onSubmit={handleLoginSubmit}>
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <div className="input-with-icon">
                    <IconUser size={16} stroke={1.5} className="input-icon" />
                    <input
                      id="login-username"
                      type="text"
                      className={`form-input ${loginError ? 'error' : ''}`}
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="Master"
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div className="input-with-icon">
                    <IconLock size={16} stroke={1.5} className="input-icon" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      className={`form-input password-input ${loginError ? 'error' : ''}`}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
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
                  {loggingIn ? 'Signing in...' : 'Sign in to system'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="login-footer">
          <span>&copy; 2026 All rights reserved to <a href="https://sunshinetechno.com/" target="_blank" rel="noopener noreferrer" className="login-footer-link">Sunshine Technologies</a></span>
          <span className="login-footer-sep">&middot;</span>
          <span>Support: 7659091468, 9133377852, 853 &amp; Sales: 8801231166, 9133377854</span>
        </div>

        <div id="toastContainer"></div>
      </div>
    );
  }

  // â”€â”€â”€ Screen renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const renderScreen = () => {
    let screenComponent;
    switch (activeScreen) {
      case 'dashboardScreen': screenComponent = <DashboardScreen />; break;
      case 'devicesScreen': screenComponent = currentUserRole === 'admin' ? <DevicesScreen /> : <DashboardScreen />; break;
      case 'reportsScreen': screenComponent = <ReportsScreen />; break;
      case 'settingsScreen': screenComponent = currentUserRole === 'admin' ? <SettingsScreen /> : <DashboardScreen />; break;
      case 'cpcbScreen': screenComponent = currentUserRole === 'admin' ? <CPCB /> : <DashboardScreen />; break;
      case 'calibrationScreen': screenComponent = currentUserRole === 'admin' ? <CalibrationScreen /> : <DashboardScreen />; break;
      case 'contactScreen': screenComponent = <ContactScreen />; break;
      default: screenComponent = <DashboardScreen />; break;
    }
    return (
      <React.Suspense fallback={<div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600' }}>Loading moduleâ€¦</div>}>
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

      {/* Main Container â€” header + content + footer stacked vertically */}
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
              All &copy; 2026 rights reserved | All Rights Reserved to <a href="https://www.sunshinetechno.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-600)', textDecoration: 'underline' }}>Sunshinetechnologies</a>
              <br />Support: 7659091468, 9133377852, 853 &amp; Sales: 8801231166, 9133377854
            </div>
          </div>
          <div className="marquee-container" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '100%', overflow: 'hidden' }}>
              <div className="marquee-content" style={{ animationDuration: broadcasts && broadcasts.length > 0 ? '25s' : '35s' }}>
                {broadcasts && broadcasts.length > 0 && localStorage.getItem('ultron_broadcast_enabled') !== 'false' ? (
                  broadcasts.map((b, i) => (
                    <span key={b.id} style={{ color: b.severity === 'critical' ? 'var(--danger)' : b.severity === 'warn' ? 'var(--warning)' : 'inherit' }}>
                      {b.message}{i < broadcasts.length - 1 ? '  â—†  ' : ''}
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
