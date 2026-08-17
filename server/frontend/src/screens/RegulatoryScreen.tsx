import { Alert, Box, Chip, Grid, Typography } from '@mui/material';
import type { CpcbStatusItem, CpcbSummaryItem } from '../types';
import PageHeader from '../components/Common/PageHeader';
import SectionCard from '../components/Common/SectionCard';
import EmptyState from '../components/Common/EmptyState';
import Icon from '../components/Common/Icon';
import { formatIST } from '../format';

interface RegulatoryScreenProps {
  cpcbStatus: CpcbStatusItem[];
  cpcbSummary: CpcbSummaryItem[];
}

export default function RegulatoryScreen({ cpcbStatus, cpcbSummary }: RegulatoryScreenProps) {
  return (
    <>
      <PageHeader title="Regulatory" subtitle="CPCB compliance sync status and daily record counts." />
      {cpcbStatus.length === 0 ? (
        <SectionCard><EmptyState icon={<Icon name="ShieldCheck" size={56} />} title="No CPCB Data Available" /></SectionCard>
      ) : (
        <Grid container spacing={2.5} sx={{ mb: 3 }}>
          {cpcbStatus.map(site => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={site.site_id}>
              <SectionCard title={site.site_name}
                action={<Chip label={site.last_error ? 'Error' : 'OK'} color={site.last_error ? 'error' : 'success'} size="small" variant="outlined" />}
              >
                <Typography variant="h3" sx={{ fontSize: '32px', fontWeight: 700, color: '#0F6E56', mb: 0.5 }}>
                  {site.total_records_synced_today?.toLocaleString() || 0}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>records synced today</Typography>
                {site.last_tgpcb_sync && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                    Last sync: {formatIST(site.last_tgpcb_sync)}
                  </Typography>
                )}
                {site.last_error && (
                  <Alert severity="error" sx={{ mt: 1, py: 0, '& .MuiAlert-message': { fontSize: 12 } }}>
                    {site.last_error}
                  </Alert>
                )}
              </SectionCard>
            </Grid>
          ))}
        </Grid>
      )}
      {cpcbSummary.length > 0 && (
        <SectionCard title="30-Day Daily Record Counts">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {cpcbSummary.map(site => (
              <Box key={site.site_id}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>{site.site_name}</Typography>
                {site.daily_counts.length === 0 ? (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>No data in last 30 days.</Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {site.daily_counts.map((d, i) => (
                      <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', bgcolor: 'action.hover', borderRadius: 1, px: 1.5, py: 0.75, minWidth: 52 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', fontFamily: 'mono' }}>{d.record_count}</Typography>
                        <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>{new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}
    </>
  );
}