/**
 * UltrON — Centralized Design Tokens
 * Single source of truth for colors, typography, spacing, shadows, and component styles.
 * Import { T, INP, SEL, PROTO, INPUT_TYPES } from '../theme' wherever needed.
 */

// ─── Core Palette ─────────────────────────────────────────────────────────────
export const T = {
  // Brand / Primary
  primary:       '#0f766e',
  primaryLight:  '#14b8a6',
  primaryGlow:   'rgba(15,118,110,0.35)',
  primaryBg:     'rgba(15,118,110,0.08)',
  primaryBorder: 'rgba(15,118,110,0.18)',

  // Semantic
  success:    '#10b981',
  successBg:  'rgba(16,185,129,0.12)',
  warning:    '#f59e0b',
  warningBg:  'rgba(245,158,11,0.12)',
  danger:     '#ef4444',
  dangerBg:   'rgba(239,68,68,0.1)',
  dangerGlow: 'rgba(239,68,68,0.35)',
  info:       '#38bdf8',
  infoBg:     'rgba(56,189,248,0.12)',

  // Neutrals
  text:        '#0f172a',
  textMuted:   '#475569',
  textFaint:   '#94a3b8',
  textLabel:   '#64748b',
  border:      'rgba(255,255,255,0.7)',
  borderSoft:  'rgba(15,118,110,0.1)',

  // Glass surfaces
  glass:       'rgba(255,255,255,0.55)',
  glassHover:  'rgba(255,255,255,0.72)',
  glassDark:   'rgba(255,255,255,0.35)',

  // Shadows
  shadowSm:    '0 2px 8px rgba(15,118,110,0.08)',
  shadowMd:    '0 4px 16px rgba(15,118,110,0.14)',
  shadowLg:    '0 8px 32px rgba(15,118,110,0.18)',
  shadowGlow:  '0 0 20px rgba(15,118,110,0.25)',

  // Radii
  r:           '10px',
  rMd:         '14px',
  rLg:         '18px',
  rFull:       '99px',

  // Font families
  fontMono: "ui-monospace, Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace",
  fontBase: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

// ─── Input / Select base styles ───────────────────────────────────────────────
export const INP = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: T.r,
  border: `1.5px solid ${T.primaryBorder}`,
  background: 'rgba(255,255,255,0.8)',
  fontSize: '12px',
  fontFamily: T.fontBase,
  color: T.text,
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

export const SEL = { ...INP, cursor: 'pointer' };

export const inpErr = (hasErr) => hasErr
  ? { ...INP, borderColor: T.danger, boxShadow: `0 0 0 3px ${T.dangerBg}` }
  : INP;

// ─── Protocol / Connection configs ────────────────────────────────────────────
export const PROTO = {
  modbus_tcp: { label: 'Modbus TCP', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', glow: 'rgba(56,189,248,0.25)', icon: '' },
  modbus_rtu: { label: 'Modbus RTU', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', glow: 'rgba(167,139,250,0.25)', icon: '' },
  tcp_custom: { label: 'TCP Custom', color: '#34d399', bg: 'rgba(52,211,153,0.12)', glow: 'rgba(52,211,153,0.25)', icon: '' },
  csv:        { label: 'CSV Watch',  color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  glow: 'rgba(251,191,36,0.25)',  icon: '' },
};

export const INPUT_TYPES = {
  modbus_tcp:     { label: 'Modbus TCP',  color: '#38bdf8', icon: '' },
  modbus_rtu:     { label: 'Modbus RTU',  color: '#a78bfa', icon: '' },
  csv:            { label: 'CSV File',    color: '#fbbf24', icon: '' },
  cumulative:     { label: 'Cumulative',  color: '#34d399', icon: ''  },
  day_cumulative: { label: 'Day Cumul.', color: '#f472b6', icon: '' },
};

// ─── Sensor card state ────────────────────────────────────────────────────────
export const PARAM_STATE = {
  offline:  { cls: 'sensor-card-offline',  badge: 'OFFLINE',  text: 'OFFLINE',  dot: T.danger   },
  critical: { cls: 'sensor-card-exceeded', badge: 'CRITICAL', text: 'CRITICAL', dot: '#ea580c'  },
  warning:  { cls: 'sensor-card-exceeded', badge: 'WARNING',  text: 'EXCEEDED', dot: '#f59e0b'  },
  good:     { cls: 'sensor-card-good',     badge: 'VALID',    text: 'VALID',    dot: T.primary  },
};

export const getParamState = (param, livePoint) => {
  if (!livePoint || livePoint.status !== 'online') return PARAM_STATE.offline;
  const val = parseFloat(livePoint.value);
  if (!param.alarm_enabled || isNaN(val)) return PARAM_STATE.good;
  if (
    (param.alarm_high_high != null && val >= param.alarm_high_high) ||
    (param.alarm_low_low  != null && val <= param.alarm_low_low)
  ) return PARAM_STATE.critical;
  if (
    (param.alarm_high != null && val >= param.alarm_high) ||
    (param.alarm_low  != null && val <= param.alarm_low)
  ) return PARAM_STATE.warning;
  return PARAM_STATE.good;
};

// ─── Button presets ───────────────────────────────────────────────────────────
export const BTN = {
  primary: {
    background: `linear-gradient(135deg, ${T.primary}, ${T.primaryLight})`,
    color: '#fff',
    border: 'none',
    borderRadius: T.r,
    padding: '8px 18px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: `0 4px 12px ${T.primaryGlow}`,
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  ghost: {
    background: 'transparent',
    color: T.textLabel,
    border: `1.5px solid ${T.primaryBorder}`,
    borderRadius: T.r,
    padding: '7px 14px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  danger: {
    background: T.dangerBg,
    color: T.danger,
    border: `1.5px solid rgba(239,68,68,0.2)`,
    borderRadius: T.r,
    padding: '7px 13px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
  },
};

// ─── Glass card preset ────────────────────────────────────────────────────────
export const GLASS_CARD = {
  background: T.glass,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${T.border}`,
  borderRadius: T.rLg,
};
