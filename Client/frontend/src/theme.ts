/**
 * UltrON — Centralized Design Tokens
 * Single source of truth for colors, typography, spacing, shadows, and component styles.
 * Import { T, INP, SEL, PROTO, INPUT_TYPES, PARAM_STATE, getParamState } from '../theme' wherever needed.
 */

// ─── Core Palette ─────────────────────────────────────────────────────────────
export const T = {
  // Brand / Primary — Dark Teal Industrial Ramp
  primary:       '#0F6E56',
  primaryDark:   '#04342C',
  primaryMid:    '#085041',
  primaryAccent: '#1D9E75',
  primaryGlow:   'rgba(15, 110, 86, 0.22)',
  primaryBg:     'rgba(15, 110, 86, 0.08)',
  primaryBorder: 'rgba(15, 110, 86, 0.16)',

  // Semantic
  success:    '#1D9E75',
  successBg:  'rgba(29, 158, 117, 0.12)',
  warning:    '#EF9F27',
  warningBg:  'rgba(239, 159, 39, 0.12)',
  warningDark:'#C07E12',
  error:      '#E24B4A',
  errorBg:    'rgba(226, 75, 74, 0.1)',
  errorGlow:  'rgba(226, 75, 74, 0.35)',
  info:       '#378ADD',
  infoBg:     'rgba(55, 138, 221, 0.12)',

  // Neutrals — Deep Dark Teal Typography
  text:        '#04342C',
  textMuted:   '#085041',
  textFaint:   '#40534C',
  textLabel:   '#0F6E56',
  border:      'rgba(15, 110, 86, 0.14)',
  borderSoft:  'rgba(15, 110, 86, 0.07)',

  // Surfaces
  surface:     '#FFFFFF',
  surfaceMuted:'#F0F4F2',
  glass:       '#FFFFFF',
  glassHover:  '#F0FDF4',
  glassDark:   '#F0FDF4',

  // Shadows
  shadowSm:    '0 1px 2px 0 rgba(4, 52, 44, 0.05)',
  shadowMd:    '0 4px 12px -2px rgba(4, 52, 44, 0.08), 0 2px 6px -2px rgba(4, 52, 44, 0.04)',
  shadowLg:    '0 10px 24px -4px rgba(4, 52, 44, 0.1), 0 4px 8px -4px rgba(4, 52, 44, 0.05)',
  shadowCard:  '0 8px 24px -4px rgba(4, 52, 44, 0.05), 0 2px 6px rgba(4, 52, 44, 0.02)',
  shadowFloating: '0 12px 32px -4px rgba(4, 52, 44, 0.12), 0 4px 12px rgba(4, 52, 44, 0.04)',
  shadowGlow:  '0 0 16px rgba(15, 110, 86, 0.14)',

  // Radii
  r:           '10px',
  rMd:         '14px',
  rLg:         '18px',
  rCard:       '20px',
  rCapsule:    '28px',
  rFull:       '999px',

  // Featured Gradient
  featuredGradient: 'linear-gradient(135deg, #085041 0%, #04342C 100%)',

  // Font families
  fontMono: "ui-monospace, Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace",
  fontBase: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

// ─── Input / Select base styles ───────────────────────────────────────────────
export const INP = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '12px',
  border: `1px solid ${T.primaryBorder}`,
  background: 'var(--surface)',
  fontSize: '13px',
  fontFamily: T.fontBase,
  color: 'var(--text-primary)',
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

export const SEL = { ...INP, cursor: 'pointer' };

export const inpErr = (hasErr) => hasErr
  ? { ...INP, borderColor: T.error, boxShadow: `0 0 0 3px ${T.errorBg}` }
  : INP;

// ─── Protocol / Connection configs ────────────────────────────────────────────
export const PROTO = {
  modbus_tcp: { label: 'Modbus TCP', color: '#378ADD', bg: 'rgba(55,138,221,0.12)', glow: 'rgba(55,138,221,0.25)', icon: '' },
  modbus_rtu: { label: 'Modbus RTU', color: '#EF9F27', bg: 'rgba(239,159,39,0.12)', glow: 'rgba(239,159,39,0.25)', icon: '' },
  tcp_custom: { label: 'TCP Custom', color: '#0F6E56', bg: 'rgba(15,110,86,0.12)', glow: 'rgba(15,110,86,0.25)', icon: '' },
  udp_custom: { label: 'UDP Custom', color: '#E24B4A', bg: 'rgba(226,75,74,0.12)', glow: 'rgba(226,75,74,0.25)', icon: '' },
  csv:        { label: 'CSV Watch',  color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  glow: 'rgba(251,191,36,0.25)',  icon: '' },
};

// ─── Sensor card state (3-tier threshold + offline + not configured) ──────────
export const PARAM_STATE = {
  offline:        { cls: 'sensor-card-offline',        badge: 'OFFLINE',        text: 'OFFLINE',        dot: '#E14D4D'  },
  not_configured: { cls: 'sensor-card-unconfigured',   badge: 'NOT CONFIGURED', text: 'NOT CONFIGURED', dot: '#94A3B8'  },
  critical:       { cls: 'sensor-card-critical',       badge: 'EXCEEDED',       text: 'EXCEEDED',       dot: '#E24B4A'  },
  warning:        { cls: 'sensor-card-warning',        badge: 'WARNING',        text: 'WARNING',        dot: '#EF9F27'  },
  good:           { cls: 'sensor-card-good',           badge: 'NOMINAL',        text: 'NOMINAL',        dot: '#1D9E75'  },
};

export const getParamState = (param, livePoint) => {
  if (!livePoint || livePoint.status !== 'online') return PARAM_STATE.offline;
  if (!param || (param.device_id === null && param.device_id === undefined)) return PARAM_STATE.not_configured;
  const val = parseFloat(livePoint.value);
  if (isNaN(val)) return PARAM_STATE.offline;
  if (!param.alarm_enabled) return PARAM_STATE.good;
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
    borderRadius: '12px',
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
    borderRadius: '12px',
    padding: '7px 14px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  error: {
    background: T.errorBg,
    color: T.error,
    border: `1.5px solid rgba(239,68,68,0.2)`,
    borderRadius: '12px',
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
  borderRadius: T.rCard,
};

// ─── Parameter category theme colors ──────────────────────────────────────────
export const PARAM_THEMES = {
  pm:      { color: '#0F6E56', bg: 'rgba(15, 110, 86, 0.08)',   border: 'rgba(15, 110, 86, 0.25)',   glow: 'rgba(15, 110, 86, 0.2)'   },
  co:      { color: '#EF9F27', bg: 'rgba(239, 159, 39, 0.08)',  border: 'rgba(239, 159, 39, 0.25)',  glow: 'rgba(239, 159, 39, 0.2)'  },
  nox:     { color: '#378ADD', bg: 'rgba(55, 138, 221, 0.08)',  border: 'rgba(55, 138, 221, 0.25)',  glow: 'rgba(55, 138, 221, 0.2)'  },
  so2:     { color: T.warningDark, bg: 'rgba(192, 126, 18, 0.08)', border: 'rgba(192, 126, 18, 0.25)', glow: 'rgba(192, 126, 18, 0.2)' },
  o3:      { color: '#378ADD', bg: 'rgba(55, 138, 221, 0.08)',  border: 'rgba(55, 138, 221, 0.25)',  glow: 'rgba(55, 138, 221, 0.2)'  },
  ambient: { color: '#1D9E75', bg: 'rgba(29, 158, 117, 0.08)',  border: 'rgba(29, 158, 117, 0.25)',  glow: 'rgba(29, 158, 117, 0.2)'  },
  wind:    { color: '#1D9E75', bg: 'rgba(29, 158, 117, 0.08)',  border: 'rgba(29, 158, 117, 0.25)',  glow: 'rgba(29, 158, 117, 0.2)'  },
  default: { color: '#0F6E56', bg: 'rgba(15, 110, 86, 0.08)',  border: 'rgba(15, 110, 86, 0.18)',  glow: 'rgba(15, 110, 86, 0.2)'  },
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
