import { useEffect, useRef, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, FormControl, Grid, InputLabel, MenuItem, Select, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { Chart, registerables } from 'chart.js';
import type { LatestPoint, QualityDetailItem, QualitySite, Site, TelemetryPoint } from '../types';
import PageHeader from '../components/Common/PageHeader';
import StatusBadge from '../components/Common/StatusBadge';
import SectionCard from '../components/Common/SectionCard';
import EmptyState from '../components/Common/EmptyState';
import Icon from '../components/Common/Icon';
import { adminFetch } from '../api';

Chart.register(...registerables);

const QUALITY_ROWS: { key: 'U' | 'O' | 'E' | 'N'; label: string; color: 'success' | 'error' | 'warning' | 'default' }[] = [
  { key: 'U', label: 'Valid', color: 'success' },
  { key: 'O', label: 'Invalid', color: 'error' },
  { key: 'E', label: 'Error', color: 'warning' },
  { key: 'N', label: 'None', color: 'default' },
];

interface ReportsScreenProps {
  sites: Site[];
  qualitySummary: QualitySite[];
}

export default function ReportsScreen({ sites, qualitySummary }: ReportsScreenProps) {
  const [view, setView] = useState<'quality' | 'history'>('quality');

  return (
    <>
      <PageHeader title="Reports" subtitle="Data quality (U/O/E/N) and telemetry history."
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            {(['quality', 'history'] as const).map(v => (
              <Chip key={v} label={v === 'quality' ? 'Quality' : 'History'} size="small" onClick={() => setView(v)}
                variant={view === v ? 'filled' : 'outlined'} color={view === v ? 'primary' : 'default'} sx={{ cursor: 'pointer', fontWeight: 500, textTransform: 'capitalize' }} />
            ))}
          </Box>
        }
      />
      {view === 'quality' ? <QualityView sites={sites} qualitySummary={qualitySummary} /> : <HistoryView sites={sites} />}
    </>
  );
}

function QualityView({ qualitySummary }: { sites: Site[]; qualitySummary: QualitySite[] }) {
  const [selectedSite, setSelectedSite] = useState<number | null>(null);
  const [qualityDetail, setQualityDetail] = useState<QualityDetailItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const openSite = async (siteId: number) => {
    setSelectedSite(siteId);
    setLoading(true);
    try {
      const res = await adminFetch(`/api/v1/quality/${siteId}`);
      if (res.ok) setQualityDetail(await res.json());
    } finally { setLoading(false); }
  };

  if (selectedSite) {
    return (
      <>
        <Button size="small" startIcon={<Icon name="SkipBack" size={18} />} onClick={() => { setSelectedSite(null); setQualityDetail(null); }} sx={{ mb: 2 }}>
          Back to site summary
        </Button>
        {loading ? (
          <Box sx={{ textAlign: 'center', py: 4 }}><div className="loader"></div></Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {qualityDetail?.map(p => (
              <SectionCard key={p.parameter_id}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.parameter_name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{p.tag_name}{p.unit ? ` (${p.unit})` : ''}</Typography>
                  </Box>
                  <Chip label={`${p.total_points} points`} size="small" variant="outlined" />
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {QUALITY_ROWS.map(({ key, label, color }) => (
                    <Chip key={key} label={`${p.quality[key]?.count || 0} ${label}`} color={color} variant="outlined" size="small" sx={{ fontWeight: 600 }} />
                  ))}
                </Box>
              </SectionCard>
            ))}
          </Box>
        )}
      </>
    );
  }

  return qualitySummary.length === 0 ? (
    <SectionCard><EmptyState icon={<Icon name="History" size={56} />} title="No Quality Data Available" /></SectionCard>
  ) : (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {qualitySummary.map(site => (
        <SectionCard key={site.site_id} sx={{ cursor: 'pointer', '&:hover': { borderColor: '#0F6E56' } }} onClick={() => openSite(site.site_id)}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{site.site_name}</Typography>
            <Chip label={`${site.total_points} total points`} size="small" variant="outlined" />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {QUALITY_ROWS.map(({ key, label, color }) => {
              const q = site.quality?.[key];
              return (
                <Chip key={key} label={`${q?.count || 0} (${q?.percentage || 0}%) ${label}`} color={color} variant="outlined" size="small" sx={{ fontWeight: 600 }} />
              );
            })}
          </Box>
        </SectionCard>
      ))}
    </Box>
  );
}

function HistoryView({ sites }: { sites: Site[] }) {
  const [siteId, setSiteId] = useState<number | null>(null);
  const [params, setParams] = useState<{ id: number; tag_name: string; name: string }[]>([]);
  const [paramId, setParamId] = useState<number | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<TelemetryPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!siteId) return;
    adminFetch(`/api/v1/sites/${siteId}/telemetry/latest`)
      .then(res => (res.ok ? res.json() : []))
      .then(d => {
        if (Array.isArray(d)) setParams(d.map((p: LatestPoint) => ({ id: p.id, tag_name: p.tag_name, name: p.name })));
      });
  }, [siteId]);

  const buildQuery = (extra: Record<string, string> = {}) => {
    const paramsObj = new URLSearchParams();
    paramsObj.set('parameter_id', String(paramId));
    if (from) paramsObj.set('from_date', new Date(from).toISOString());
    if (to) paramsObj.set('to_date', new Date(to).toISOString());
    Object.entries(extra).forEach(([k, v]) => paramsObj.set(k, v));
    return paramsObj.toString();
  };

  const fetchHistory = async (append = false) => {
    if (!siteId || !paramId) return;
    setLoading(true);
    try {
      const res = await adminFetch(`/api/v1/sites/${siteId}/telemetry/history?${buildQuery(append && cursor ? { before: cursor } : {})}`);
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d)) {
          setData(append ? prev => [...(prev || []), ...d] : d);
          if (d.length > 0) setCursor(d[d.length - 1].timestamp);
        }
      }
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!chartRef.current || !data) return;
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }
    const pts = data.slice().reverse();
    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: pts.map(p => new Date(p.timestamp).toLocaleString()),
        datasets: [{
          label: 'Value', data: pts.map(p => p.value),
          borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,0.1)',
          fill: true, tension: 0.1, spanGaps: false, pointRadius: 2,
          pointBackgroundColor: pts.map(p => p.value == null ? 'transparent' : '#378ADD'),
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 10, font: { size: 10 }, color: '#5D6663' }, grid: { color: 'rgba(0,0,0,0.06)' } },
          y: { beginAtZero: false, ticks: { color: '#5D6663' }, grid: { color: 'rgba(0,0,0,0.06)' } },
        },
      },
    });
    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [data]);

  return (
    <>
      <SectionCard sx={{ mb: 3 }}>
        <Grid container spacing={2} sx={{ alignItems: 'flex-end' }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Site</InputLabel>
              <Select value={siteId || ''} label="Site" onChange={e => { setSiteId(e.target.value ? Number(e.target.value) : null); setParamId(null); setParams([]); setData(null); }}>
                <MenuItem value=""><em>Select a site...</em></MenuItem>
                {sites.filter(s => s.is_active).map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Parameter</InputLabel>
              <Select value={paramId || ''} label="Parameter" onChange={e => setParamId(e.target.value ? Number(e.target.value) : null)} disabled={!siteId}>
                <MenuItem value=""><em>Select parameter...</em></MenuItem>
                {params.map(p => <MenuItem key={p.id} value={p.id}>{p.tag_name} — {p.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField label="From" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} fullWidth size="small" slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField label="To" type="datetime-local" value={to} onChange={e => setTo(e.target.value)} fullWidth size="small" slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <Button variant="contained" fullWidth onClick={() => fetchHistory(false)} disabled={!siteId || !paramId || loading}>
              {loading ? 'Loading...' : 'Load'}
            </Button>
          </Grid>
        </Grid>
      </SectionCard>

      {data && (
        <>
          <Card sx={{ mb: 3, height: 280 }}>
            <CardContent sx={{ p: 2, height: '100%' }}>
              <canvas ref={chartRef} style={{ height: '100%', width: '100%' }} />
            </CardContent>
          </Card>
          <SectionCard>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Timestamp</TableCell>
                    <TableCell align="right">Value</TableCell>
                    <TableCell align="center">Quality</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={3} align="center" sx={{ py: 6, color: 'text.secondary' }}>No data in this range.</TableCell></TableRow>
                  ) : data.map((p, i) => (
                    <TableRow key={p.id ?? i} hover>
                      <TableCell><Typography variant="caption" sx={{ fontFamily: 'mono' }}>{new Date(p.timestamp).toLocaleString()}</Typography></TableCell>
                      <TableCell align="right"><Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'mono' }}>{p.value != null ? Number(p.value).toFixed(2) : '—'}</Typography></TableCell>
                      <TableCell align="center"><StatusBadge status={p.quality} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {data.length > 0 && (
              <Box sx={{ textAlign: 'center', py: 1.5, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <Button size="small" onClick={() => fetchHistory(true)} disabled={loading}>
                  {loading ? 'Loading...' : 'Load older data'}
                </Button>
              </Box>
            )}
          </SectionCard>
        </>
      )}
    </>
  );
}