import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from './context/AppContext';

// Import Screens
import { DashboardScreen } from './screens/DashboardScreen';
import { DevicesScreen } from './screens/DevicesScreen';
import { TrendsScreen } from './screens/TrendsScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { LogsScreen } from './screens/LogsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ApiMappingsScreen } from './screens/ApiMappingsScreen';
import { UsersScreen } from './screens/UsersScreen';
import { CPCBSettingsScreen } from './screens/CPCBSettingsScreen';
import { CPCBMappingScreen } from './screens/CPCBMappingScreen';
import { CPCBLogsScreen } from './screens/CPCBLogsScreen';
import { CPCBExportScreen } from './screens/CPCBExportScreen';
import { CPCB } from './screens/CPCB';
import { CalibrationScreen } from './screens/CalibrationScreen';
import { WindroseScreen } from './screens/WindroseScreen';
import { AnalyticalReportsScreen } from './screens/AnalyticalReportsScreen';

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

const TrendsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
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

const LogsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
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

const MappingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3 6h.01" />
    <path d="M3 12h.01" />
    <path d="M3 18h.01" />
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

const WindroseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v7" />
    <path d="M12 15v7" />
    <path d="M2 12h7" />
    <path d="M15 12h7" />
    <path d="M5.64 5.64l4.95 4.95" />
    <path d="M13.41 13.41l4.95 4.95" />
    <path d="M18.36 5.64l-4.95 4.95" />
    <path d="M10.59 13.41l-4.95 4.95" />
  </svg>
);

const AnalyticalReportsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
    <rect x="4" y="14" width="3" height="6" />
    <rect x="10.5" y="8" width="3" height="12" />
    <rect x="17" y="4" width="3" height="16" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
);

// ─── Nav definitions ──────────────────────────────────────────────────────────
const ALL_NAV = [
  { key: 'dashboardScreen', label: 'Dashboard Overview', Icon: DashboardIcon, roles: ['admin', 'client'] },
  { key: 'devicesScreen', label: 'Devices & Config', Icon: DevicesIcon, roles: ['admin'] },
  { key: 'apiMappingsScreen', label: 'API Mappings', Icon: MappingsIcon, roles: ['admin'] },
  { key: 'trendsScreen', label: 'Trends Analysis', Icon: TrendsIcon, roles: ['admin', 'client'] },
  { key: 'reportsScreen', label: 'Reports Generator', Icon: ReportsIcon, roles: ['admin', 'client'] },
  { key: 'logsScreen', label: 'System Logs', Icon: LogsIcon, roles: ['admin'] },
  { key: 'settingsScreen', label: 'System Settings', Icon: SettingsIcon, roles: ['admin'] },
  { key: 'usersScreen', label: 'User Management', Icon: UsersIcon, roles: ['admin'] },
  { key: 'cpcbSettingsScreen', label: 'CPCB Config', Icon: CPCBIcon, roles: ['admin'] },
  { key: 'cpcbMappingScreen', label: 'CPCB Mappings', Icon: CPCBIcon, roles: ['admin'] },
  { key: 'cpcbExportScreen', label: 'CPCB Export', Icon: CPCBIcon, roles: ['admin'] },
  { key: 'cpcbLogsScreen', label: 'CPCB Logs', Icon: CPCBIcon, roles: ['admin'] },
  { key: 'cpcbScreen', label: 'CPCB', Icon: CPCBIcon, roles: ['admin'] },
  { key: 'calibrationScreen', label: 'Calibration', Icon: CalibrationIcon, roles: ['admin'] },
  { key: 'windroseScreen', label: 'Windrose', Icon: WindroseIcon, roles: ['admin'] },
  { key: 'analyticalReportsScreen', label: 'Analytical Reports', Icon: AnalyticalReportsIcon, roles: ['admin'] },
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
  } = useContext(AppContext);

  const [refreshing, setRefreshing] = useState(false);

  // License / Setup state
  const [hasLicense, setHasLicense] = useState<boolean | null>(null);
  const [showSetupLogin, setShowSetupLogin] = useState(false);
  const [setupUsername, setSetupUsername] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupAuthError, setSetupAuthError] = useState('');
  const [isSetupAuthenticated, setIsSetupAuthenticated] = useState(false);
  
  const [setupApiUrl, setSetupApiUrl] = useState('https://rajapi.com/api/v1/sync/');
  const [setupApiKey, setSetupApiKey] = useState('');
  const [setupAmcKey, setSetupAmcKey] = useState('');
  const [setupTesting, setSetupTesting] = useState(false);
  const [setupResult, setSetupResult] = useState('');

  // Check License on mount
  useEffect(() => {
    fetch('/api/v1/license/status')
      .then(res => res.json())
      .then(data => {
        setHasLicense(data.licensed);
      })
      .catch(err => {
        console.error("Failed to check license status:", err);
        setHasLicense(false);
      });
  }, []);

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
    // Clear browser caches if available
    if (window.caches) {
      window.caches.keys().then((names) => {
        names.forEach((name) => {
          window.caches.delete(name);
        });
      });
    }
    // Force reload bypassing cache after a tiny delay to show the toast
    setTimeout(() => {
      window.location.reload();
    }, 500);
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
      const allowedScreens = ['dashboardScreen', 'trendsScreen', 'reportsScreen', 'calibrationScreen', 'windroseScreen', 'analyticalReportsScreen'];
      if (!allowedScreens.includes(activeScreen)) {
        setActiveScreen('dashboardScreen');
      }
    }
  }, [currentUserRole, activeScreen, setActiveScreen]);

  // ─── License / Setup Screen ──────────────────────────────────────────────────
  if (hasLicense === false) {
    if (!isSetupAuthenticated) {
      return (
        <div className="login-screen">
          <div className="login-card">
            <img 
              src="/assets/Ultron_logo.png" 
              className="login-logo cursor-pointer" 
              alt="UltrON Logo" 
              onClick={() => setShowSetupLogin(true)}
              title="Click here to authenticate setup"
            />
            <h2 className="login-title login-title-error">Access Denied</h2>
            <p className="access-denied-description">
              AMC Token is expired or not configured. Please contact Sunshine Technologies.
            </p>

            {showSetupLogin && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const res = await fetch('/api/v1/auth/setup-override', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: setupUsername, password: setupPassword }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setIsSetupAuthenticated(true);
                    setSetupAuthError('');
                  } else {
                    setSetupAuthError(data.detail || 'Invalid setup credentials.');
                  }
                } catch {
                  setSetupAuthError('Network error — could not reach server.');
                }
              }} className="override-form">
                <h3 className="override-form-title">AMC Token Renewal Override</h3>
                <div className="form-group">
                  <input
                    type="text"
                    className="form-input"
                    value={setupUsername}
                    onChange={e => setSetupUsername(e.target.value)}
                    placeholder="Username"
                  />
                </div>
                <div className="form-group">
                  <input
                    type="password"
                    className="form-input"
                    value={setupPassword}
                    onChange={e => setSetupPassword(e.target.value)}
                    placeholder="Password"
                  />
                </div>
                {setupAuthError && <div className="auth-error-message">{setupAuthError}</div>}
                <button type="submit" className="btn btn-primary full-width">Authenticate</button>
              </form>
            )}
          </div>
        </div>
      );
    }

    // Setup configuration screen (isSetupAuthenticated === true)
    return (
      <div className="login-screen">
        <div className="login-card setup-card">
          <h2 className="login-title">License & AMC Setup</h2>
          <p className="setup-description">
            Paste the AMC Token (site key) and AMC Key (device key) from rajapi.com to unlock UltrON.
          </p>

          <form onSubmit={async (e) => {
            e.preventDefault();
            setSetupTesting(true);
            setSetupResult('');
            try {
              const res = await fetch('/api/v1/license/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_url: setupApiUrl, api_key: setupApiKey, amc_key: setupAmcKey })
              });
              if (res.ok) {
                setSetupResult("Success! Configuration saved.");
                setTimeout(() => {
                  setHasLicense(true);
                }, 1500);
              } else {
                const data = await res.json();
                setSetupResult(`Failed: ${data.detail || 'Unknown error'}`);
              }
            } catch (err) {
              setSetupResult(`Error connecting to server.`);
            } finally {
              setSetupTesting(false);
            }
          }}>
            <div className="form-group">
              <label htmlFor="setupApiUrl" className="form-label">Central API URL</label>
              <input
                id="setupApiUrl"
                type="text"
                className="form-input"
                value={setupApiUrl}
                onChange={e => setSetupApiUrl(e.target.value)}
                required
                placeholder="https://api.example.com"
              />
            </div>
            <div className="form-group">
              <label htmlFor="setupApiKey" className="form-label">AMC Token (Site Key)</label>
              <input
                id="setupApiKey"
                type="text"
                className="form-input"
                value={setupApiKey}
                onChange={e => setSetupApiKey(e.target.value)}
                required
                placeholder="uk_..."
              />
            </div>
            <div className="form-group">
              <label htmlFor="setupAmcKey" className="form-label">AMC Key (Device Key — optional)</label>
              <input
                id="setupAmcKey"
                type="text"
                className="form-input"
                value={setupAmcKey}
                onChange={e => setSetupAmcKey(e.target.value)}
                placeholder="uk_..."
              />
            </div>
            
            {setupResult && (
              <div className={`setup-result-msg ${setupResult.startsWith('Success') ? 'msg-success' : 'msg-error'}`}>
                {setupResult}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary full-width btn-tall"
              disabled={setupTesting}
            >
              {setupTesting ? 'Testing Connection...' : 'Test & Activate'}
            </button>
          </form>
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
          <h2 className="login-title">Industrial Monitoring Platform</h2>
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
            alt="Sunshine Technologies"
            title="Click to perform hard refresh"
            onClick={handleHardRefresh}
            style={{ cursor: 'pointer', transition: 'transform 0.2s ease' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          />
        </div>
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', borderTop: '1px solid #e2e8f0', padding: '6px 20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', fontSize: '11px', fontWeight: '600', color: '#64748b', flexWrap: 'wrap', zIndex: 10 }}>
          <span>&copy; 2026 <a href="https://sunshinetechno.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#14b8a6', textDecoration: 'none' }}>Sunshine Technologies!</a></span>
          <span>Support: 7659091468, 9133377852, 853</span>
          <span>Sales: 8801231166, 9133377852</span>
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
      case 'apiMappingsScreen': return currentUserRole === 'admin' ? <ApiMappingsScreen /> : <DashboardScreen />;
      case 'trendsScreen': return <TrendsScreen />;
      case 'reportsScreen': return <ReportsScreen />;
      case 'logsScreen': return currentUserRole === 'admin' ? <LogsScreen /> : <DashboardScreen />;
      case 'settingsScreen': return currentUserRole === 'admin' ? <SettingsScreen /> : <DashboardScreen />;
      case 'usersScreen': return currentUserRole === 'admin' ? <UsersScreen /> : <DashboardScreen />;
      case 'cpcbSettingsScreen': return currentUserRole === 'admin' ? <CPCBSettingsScreen /> : <DashboardScreen />;
      case 'cpcbMappingScreen': return currentUserRole === 'admin' ? <CPCBMappingScreen /> : <DashboardScreen />;
      case 'cpcbExportScreen': return currentUserRole === 'admin' ? <CPCBExportScreen /> : <DashboardScreen />;
      case 'cpcbLogsScreen': return currentUserRole === 'admin' ? <CPCBLogsScreen /> : <DashboardScreen />;
      case 'cpcbScreen': return currentUserRole === 'admin' ? <CPCB /> : <DashboardScreen />;
      case 'calibrationScreen': return currentUserRole === 'admin' ? <CalibrationScreen /> : <DashboardScreen />;
      case 'windroseScreen': return currentUserRole === 'admin' ? <WindroseScreen /> : <DashboardScreen />;
      case 'analyticalReportsScreen': return <AnalyticalReportsScreen />;
      default: return <DashboardScreen />;
    }
  };

  return (
    <div className="app-shell">
      {/* Sidebar Nav — Full Height */}
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', padding: 0 }}>
        {/* Logo Section */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '24px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
          marginBottom: '16px',
        }}>
          <button
            onClick={handleLogoClick}
            disabled={refreshing}
            title="Click to refresh dashboard values"
            style={{
              background: 'none',
              border: 'none',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              padding: 0,
              display: 'block',
              transition: 'transform 0.2s ease',
              outline: 'none'
            }}
            onMouseEnter={e => {
              if (!refreshing) {
                e.currentTarget.style.transform = 'scale(1.05)';
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <img
              src="/assets/Ultron_logo.png"
              alt="UltrON logo"
              style={{
                width: '160px',
                height: 'auto',
                display: 'block',
                filter: 'drop-shadow(0 2px 8px rgba(15,118,110,0.15))'
              }}
            />
          </button>
        </div>

        {/* Welcome Section */}
        <div style={{ margin: '0 16px 24px 16px', padding: '16px 20px', background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)', borderRadius: '12px', color: '#fff', position: 'relative', boxShadow: '0 8px 20px rgba(15, 118, 110, 0.15)' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '5px', background: '#34d399', borderTopLeftRadius: '12px', borderBottomLeftRadius: '12px' }}></div>
          <div style={{ fontSize: '16px', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '13px', fontWeight: '500', opacity: 0.9 }}>Welcome,</span>
            {currentUser}!
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '0 16px', flex: 1, overflowY: 'auto' }}>
          {visibleNav.map(({ key, label, Icon }) => (
            <button
              key={key}
              className={`nav-button ${activeScreen === key ? 'active' : ''}`}
              onClick={() => setActiveScreen(key)}
            >
              <Icon /> {label}
            </button>
          ))}
        </div>
      </aside>

      {/* Main Container — header + content + footer stacked vertically */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top Header Bar */}
        <header className="top-bar">
          <div className="top-left" style={{ display: 'flex', alignItems: 'center' }}>
            {/* System Live Clock */}
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f766e', background: 'rgba(15,118,110,0.06)', padding: '6px 14px', borderRadius: '6px', border: '1px solid rgba(15,118,110,0.15)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
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
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f766e', fontFamily: 'Outfit, sans-serif', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
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
                  background: currentUserRole === 'admin' ? 'rgba(220,38,38,0.1)' : 'rgba(15,118,110,0.1)',
                  color: currentUserRole === 'admin' ? '#dc2626' : '#0f766e',
                  border: currentUserRole === 'admin' ? '1px solid rgba(220,38,38,0.3)' : '1px solid rgba(15,118,110,0.3)',
                }}>
                  {currentUserRole === 'admin' ? 'Admin' : 'Client View'}
                </span>
              </div>
            </div>
            <button className="btn btn-sm btn-danger" onClick={logout}>Sign Out</button>
            <button
              onClick={handleHardRefresh}
              title="Perform Hard Refresh (Ctrl+Shift+R equivalent)"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                transition: 'transform 0.2s ease',
                marginLeft: '4px',
                outline: 'none'
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <img src="/assets/sunshine_logo.png" alt="Sunshine logo" style={{ display: 'block' }} />
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
            color: '#0f766e',
            whiteSpace: 'nowrap',
            borderRight: '1px solid rgba(15,118,110,0.2)',
            background: 'rgba(255, 255, 255, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            lineHeight: 1.4
          }}>
            <div>All &copy; 2026 rights reserved
              <a href="https://sunshinetechno.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#14b8a6', marginLeft: '4px', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => (e.target as HTMLElement).style.color = '#0f766e'} onMouseOut={e => (e.target as HTMLElement).style.color = '#14b8a6'}>
                Sunshine Technologies!
              </a>
            </div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'none', letterSpacing: '0.02em' }}>
              Support: 7659091468, 9133377852, 853 &nbsp;|&nbsp; Sales: 8801231166, 9133377852
            </div>
          </div>
          <div className="marquee-container" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div className="marquee-content" style={{ animationDuration: broadcasts && broadcasts.length > 0 ? '25s' : '35s' }}>
              {broadcasts && broadcasts.length > 0 ? (
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
        </footer>

      </div>{/* end main column */}

      {/* Global Toast Slot */}
      <div id="toastContainer"></div>
    </div>
  );
}

export default App;
