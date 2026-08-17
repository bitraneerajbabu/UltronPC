export function parseUTCDate(ts?: string | null): Date | null {
  if (!ts) return null;
  let iso = ts.trim();
  if (!iso.includes('T')) iso = iso.replace(' ', 'T');
  if (!iso.endsWith('Z') && !iso.includes('+') && !iso.includes('-')) iso = iso + 'Z';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function formatIST(ts?: string | null): string {
  const d = parseUTCDate(ts);
  if (!d) return '—';
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${getPart('day')}/${getPart('month')}/${getPart('year')} ${getPart('hour')}:${getPart('minute')}`;
}

export function formatDateShort(ts?: string | null): string {
  const d = parseUTCDate(ts);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Server stamps last_sync on every heartbeat/sync; clients poll every ~60s.
export const ONLINE_WINDOW_MS = 90 * 1000;

export function getConnectionStatus(last_sync?: string | null): { label: string; color: string; statusKey: string } {
  const d = parseUTCDate(last_sync);
  if (!d) return { label: 'NC', color: '#6B6E6C', statusKey: 'nc' };
  const diffMs = Math.abs(Date.now() - d.getTime());
  if (diffMs < ONLINE_WINDOW_MS) return { label: 'online', color: '#639922', statusKey: 'online' };
  return { label: 'offline', color: '#E24B4A', statusKey: 'offline' };
}

export const QUALITY_MAP: Record<string, { label: string; color: string }> = {
  U: { label: 'Valid', color: '#639922' },
  O: { label: 'Invalid', color: '#EF9F27' },
  E: { label: 'Error', color: '#E24B4A' },
  N: { label: 'No Data', color: '#6B6E6C' },
};

export function qualityInfo(q?: string): { label: string; color: string } {
  const key = (q || '').toUpperCase();
  return QUALITY_MAP[key] ?? { label: q || '?', color: '#6B6E6C' };
}

export function formatValue(v: number | null | undefined, digits = 2): string {
  return v != null ? Number(v).toFixed(digits) : '—';
}