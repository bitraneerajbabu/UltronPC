import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from './context/AppContext';

import { DashboardScreen } from './screens/DashboardScreen';
import { DevicesScreen } from './screens/DevicesScreen';
import { ApiMappingsScreen } from './screens/ApiMappingsScreen';
import { TrendsScreen } from './screens/TrendsScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { WindroseScreen } from './screens/WindroseScreen';
import { AnalyticalReportsScreen } from './screens/AnalyticalReportsScreen';
import { CPCBSettingsScreen } from './screens/CPCBSettingsScreen';
import { CPCBMappingScreen } from './screens/CPCBMappingScreen';
import { CPCBExportScreen } from './screens/CPCBExportScreen';
import { CPCBLogsScreen } from './screens/CPCBLogsScreen';
import { CPCB } from './screens/CPCB';

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

const DashboardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
    <rect x="3" y="3" width="7" height="9" />
    <rect x="14" y="3" width="7" height="5" />
    <rect x="14" y="12" width="7" height="9" />
    <rect x="3" y="16" width="7" height="5" />
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

const ALL_NAV = [
  { key: 'dashboardScreen', label: 'Dashboard', Icon: DashboardIcon, roles: ['admin', 'client'] },
  { key: 'devicesScreen', label: 'Device & Config', Icon: DevicesIcon, roles: ['admin', 'client'] },
  { key: 'apiMappingsScreen', label: 'API Mappings', Icon: MappingsIcon, roles: ['admin', 'client'] },
  { key: 'cpcbScreen', label: 'CPCB', Icon: CPCBIcon, roles: ['admin', 'client'] },
  { key: 'trendsScreen', label: 'Trends', Icon: TrendsIcon, roles: ['admin', 'client'] },
  { key: 'reportsScreen', label: 'Reports', Icon: ReportsIcon, roles: ['admin', 'client'] },
  { key: 'windroseScreen', label: 'Windrose', Icon: WindroseIcon, roles: ['admin', 'client'] },
  { key: 'analyticalReportsScreen', label: 'Analytical Reports', Icon: AnalyticalReportsIcon, roles: ['admin', 'client'] },
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
    API_BASE,
  } = useContext(AppContext);

  const [refreshing, setRefreshing] = useState(false);
  const [localVersion, setLocalVersion] = useState('');

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
    if (window.caches) {
      window.caches.keys().then((names) => {
        names.forEach((name) => {
          window.caches.delete(name);
        });
      });
    }
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

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

  const visibleNav = ALL_NAV.filter(item =>
    currentUserRole && item.roles.includes(currentUserRole)
  );

  useEffect(() => {
    if (currentUserRole === 'client') {
      const allowedScreens = ['dashboardScreen', 'devicesScreen', 'apiMappingsScreen', 'cpcbScreen', 'trendsScreen', 'reportsScreen', 'windroseScreen', 'analyticalReportsScreen'];
      if (!allowedScreens.includes(activeScreen)) {
        setActiveScreen('dashboardScreen');
      }
    }
  }, [currentUserRole, activeScreen, setActiveScreen]);

  if (!currentUser) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <img src="/assets/Ultron_logo.png" className="login-logo" alt="KTPP2 Logo" />
          <h2 className="login-title" style={{ marginBottom: localVersion ? '2px' : '8px' }}>KTPP Unit 2 - Air Quality Monitoring</h2>
          {localVersion && (
            <div style={{
              fontSize: '11px',
              fontWeight: '800',
              color: '#0f766e',
              background: 'rgba(15,118,110,0.08)',
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
            Sign in to view KTPP Station - Unit 2 Cooling Tower Area
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
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
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
              {loggingIn ? 'Signing in…' : 'Sign In to KTPP2'}
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

  const renderScreen = () => {
    switch (activeScreen) {
      case 'dashboardScreen': return <DashboardScreen />;
      case 'devicesScreen': return <DevicesScreen />;
      case 'apiMappingsScreen': return <ApiMappingsScreen />;
      case 'cpcbScreen': return <CPCB />;
      case 'trendsScreen': return <TrendsScreen />;
      case 'reportsScreen': return <ReportsScreen />;
      case 'windroseScreen': return <WindroseScreen />;
      case 'analyticalReportsScreen': return <AnalyticalReportsScreen />;
      default: return <DashboardScreen />;
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', padding: 0 }}>
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
              src="/assets/sunshine_logo.png"
              alt="Sunshine logo"
              style={{
                width: '160px',
                height: 'auto',
                display: 'block',
                filter: 'drop-shadow(0 2px 8px rgba(15,118,110,0.15))'
              }}
            />
          </button>
        </div>

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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <header className="top-bar">
          <div className="top-left" style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f766e', background: 'rgba(15,118,110,0.06)', padding: '6px 14px', borderRadius: '6px', border: '1px solid rgba(15,118,110,0.15)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
              {timeStr}
            </div>
          </div>

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
              title="Perform Hard Refresh"
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
              <img src="/assets/Ultron_logo.png" alt="KTPP2 logo" style={{ display: 'block', height: '32px', width: 'auto' }} />
            </button>
          </div>
        </header>

        <main className="content-area">
          {renderScreen()}
        </main>

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
            <div style={{ width: '100%', overflow: 'hidden' }}>
              <div className="marquee-content" style={{ animationDuration: broadcasts && broadcasts.length > 0 ? '25s' : '35s' }}>
                {broadcasts && broadcasts.length > 0 ? (
                  broadcasts.map((b, i) => (
                    <span key={b.id} style={{ color: b.severity === 'critical' ? '#ef4444' : b.severity === 'warn' ? '#f59e0b' : 'inherit' }}>
                      {b.message}{i < broadcasts.length - 1 ? '  ◆  ' : ''}
                    </span>
                  ))
                ) : (
                  <span>KTPP Unit 2 Cooling Tower Area - Real-time Air Quality Monitoring</span>
                )}
              </div>
            </div>
          </div>
        </footer>
      </div>
      <div id="toastContainer"></div>
    </div>
  );
}

export default App;
