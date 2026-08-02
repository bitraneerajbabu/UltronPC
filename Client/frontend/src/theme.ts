/**
 * UltrON — Centralized Design Tokens
 * Single source of truth for colors, typography, spacing, shadows, and component styles.
 * Import { T, INP, SEL, PROTO, INPUT_TYPES } from '../theme' wherever needed.
 */

// ─── Core Palette ─────────────────────────────────────────────────────────────
export const T = {
  // Brand / Primary — dark teal industrial
  primary:       '#0F6E56',
  primaryAccent: '#1D9E75',
  primaryGlow:   'rgba(15,110,86,0.25)',
  primaryBg:     'rgba(15,110,86,0.06)',
  primaryBorder: 'rgba(15,110,86,0.12)',

  // Semantic
  success:    '#639922',
  successBg:  'rgba(99,145,34,0.12)',
  warning:    '#EF9F27',
  warningBg:  'rgba(239,159,39,0.12)',
  warningDark:'#C07E12',
  error:      '#E24B4A',
  errorBg:    'rgba(226,75,74,0.1)',
  errorGlow:  'rgba(226,75,74,0.35)',
  info:       '#378ADD',
  infoBg:     'rgba(55,138,221,0.12)',

  // Neutrals — light mode, warm off-white
  text:        '#1A1D1C',
  textMuted:   '#6B6E6C',
  textFaint:   '#6B6E6C',
  textLabel:   '#6B6E6C',
  border:      'rgba(0,0,0,0.08)',
  borderSoft:  'rgba(15,110,86,0.06)',

  // Surfaces
  glass:       '#FFFFFF',
  glassHover:  '#F4F0E6',
  glassDark:   '#F4F0E6',

  // Shadows — minimal, hairline only
  shadowSm:    'none',
  shadowMd:    'none',
  shadowLg:    'none',
  shadowGlow:  '0 0 16px rgba(15,110,86,0.12)',

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
  border: `1px solid ${T.primaryBorder}`,
  background: 'rgba(250, 248, 242, 0.8)',
  fontSize: '12px',
  fontFamily: T.fontBase,
  color: T.text,
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

export const SEL = { ...INP, cursor: 'pointer' };

export const inpErr = (hasErr) => hasErr
  ? { ...INP, borderColor: T.error, boxShadow: `0 0 0 3px ${T.errorBg}` }
  : INP;

// ─── Protocol / Connection configs ────────────────────────────────────────────
export const PROTO = {
  modbus_tcp: { label: 'Modbus TCP', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', glow: 'rgba(56,189,248,0.25)', icon: '' },
  modbus_rtu: { label: 'Modbus RTU', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', glow: 'rgba(167,139,250,0.25)', icon: '' },
  tcp_custom: { label: 'TCP Custom', color: '#34d399', bg: 'rgba(52,211,153,0.12)', glow: 'rgba(52,211,153,0.25)', icon: '' },
  udp_custom: { label: 'UDP Custom', color: '#f472b6', bg: 'rgba(244,114,182,0.12)', glow: 'rgba(244,114,182,0.25)', icon: '' },
  csv:        { label: 'CSV Watch',  color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  glow: 'rgba(251,191,36,0.25)',  icon: '' },
};

// ─── Sensor card state ────────────────────────────────────────────────────────
export const PARAM_STATE = {
  offline:  { cls: 'sensor-card-offline',  badge: 'OFFLINE',  text: 'OFFLINE',  dot: T.error   },
  critical: { cls: 'sensor-card-exceeded', badge: 'CRITICAL', text: 'CRITICAL', dot: '#E24B4A'  },
  warning:  { cls: 'sensor-card-exceeded', badge: 'WARNING',  text: 'EXCEEDED', dot: '#EF9F27'  },
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
    background: `linear-gradient(135deg, ${T.primary}, ${T.primaryAccent})`,
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
    border: `1px solid ${T.primaryBorder}`,
    borderRadius: T.r,
    padding: '7px 14px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  error: {
    background: T.errorBg,
    color: T.error,
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

// ─── Parameter category theme colors ──────────────────────────────────────────
export const PARAM_THEMES = {
  pm:      { color: '#0F6E56', bg: 'rgba(15, 110, 86, 0.07)',   border: 'rgba(15, 110, 86, 0.25)',   glow: 'rgba(15, 110, 86, 0.2)'   },
  co:      { color: '#EF9F27', bg: 'rgba(239, 159, 39, 0.07)',  border: 'rgba(239, 159, 39, 0.25)',  glow: 'rgba(239, 159, 39, 0.2)'  },
  nox:     { color: '#378ADD', bg: 'rgba(55, 138, 221, 0.07)',  border: 'rgba(55, 138, 221, 0.25)',  glow: 'rgba(55, 138, 221, 0.2)'  },
  so2:     { color: T.warningDark, bg: 'rgba(192, 126, 18, 0.07)', border: 'rgba(192, 126, 18, 0.25)', glow: 'rgba(192, 126, 18, 0.2)' },
  o3:      { color: '#378ADD', bg: 'rgba(55, 138, 221, 0.07)',  border: 'rgba(55, 138, 221, 0.25)',  glow: 'rgba(55, 138, 221, 0.2)'  },
  ambient: { color: '#639922', bg: 'rgba(99, 145, 34, 0.07)',  border: 'rgba(99, 145, 34, 0.25)',  glow: 'rgba(99, 145, 34, 0.2)'  },
  wind:    { color: '#1D9E75', bg: 'rgba(29, 158, 117, 0.07)',  border: 'rgba(29, 158, 117, 0.25)',  glow: 'rgba(29, 158, 117, 0.2)'  },
  default: { color: '#0F6E56', bg: 'rgba(15, 110, 86, 0.07)',  border: 'rgba(15, 110, 86, 0.18)',  glow: 'rgba(15, 110, 86, 0.2)'  },
};

export const getParamTheme = (tagName?: string) => {
  const t = (tagName || '').toLowerCase();
  if (t.includes('pm')) return PARAM_THEMES.pm;
  if (t.includes('co') || t.includes('carbon')) return PARAM_THEMES.co;
  if (t.includes('no') || t.includes('nox')) return PARAM_THEMES.nox;
  if (t.includes('so2') || t.includes('sulfur')) return PARAM_THEMES.so2;
  if (t.includes('o3') || t.includes('ozone')) return PARAM_THEMES.o3;
  if (t.includes('temp') || t.includes('hum') || t.includes('press')) return PARAM_THEMES.ambient;
  if (t.includes('wind') || t.includes('ws') || t.includes('wd') || t.includes('dir') || t.includes('speed')) return PARAM_THEMES.wind;
  return PARAM_THEMES.default;
};

