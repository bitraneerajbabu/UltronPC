import { useState } from 'react';
import { Box, Button, Chip, Typography } from '@mui/material';
import type { AlarmItem, AlarmStats } from '../types';
import PageHeader from '../components/Common/PageHeader';
import StatusBadge from '../components/Common/StatusBadge';
import SectionCard from '../components/Common/SectionCard';
import EmptyState from '../components/Common/EmptyState';
import Icon from '../components/Common/Icon';
import { adminFetch } from '../api';
import { formatIST, qualityInfo } from '../format';

interface NotificationsScreenProps {
  alarms: AlarmItem[];
  alarmStats: AlarmStats | null;
  onRefresh: () => void;
}

export default function NotificationsScreen({ alarms, alarmStats, onRefresh }: NotificationsScreenProps) {
  const [acking, setAcking] = useState<number | null>(null);

  const ack = async (id: number) => {
    setAcking(id);
    try {
      await adminFetch(`/api/v1/alarms/${id}/ack`, { method: 'POST' });
      onRefresh();
    } finally { setAcking(null); }
  };

  return (
    <>
      <PageHeader title="Notifications" subtitle="Active and recent alarms across all sites."
        action={alarmStats ? (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ textAlign: 'center', px: 2, py: 1, bgcolor: 'error.light', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'error.main' }}>{alarmStats.total_active}</Typography>
              <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 500 }}>Active</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', px: 2, py: 1, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.secondary' }}>{alarmStats.total_today}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>Today</Typography>
            </Box>
          </Box>
        ) : null}
      />
      {alarms.length === 0 ? (
        <SectionCard><EmptyState icon={<Icon name="BellRing" size={56} />} title="No Notifications" description="Alarms appear when quality issues are detected." /></SectionCard>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {alarms.map(a => {
            const q = qualityInfo(a.quality);
            return (
              <SectionCard key={a.id} sx={{ borderColor: a.status === 'active' ? '#FECACA' : undefined }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                      <Chip label={`Q${a.quality}`} size="small" variant="outlined" sx={{ fontWeight: 700, color: q.color, borderColor: q.color }} />
                      <StatusBadge status={a.status} />
                      {a.site_name && <Typography variant="caption" sx={{ fontWeight: 500 }}>{a.site_name}</Typography>}
                    </Box>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>{a.message}</Typography>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                      {a.parameter_id && <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'mono' }}>Param #{a.parameter_id}</Typography>}
                      {a.value != null && <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'mono' }}>Value: {a.value}</Typography>}
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatIST(a.created_at)}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, alignItems: 'center' }}>
                    {a.status === 'active' && (
                      <Button size="small" variant="contained" color="success" disabled={acking === a.id} onClick={() => ack(a.id)}>
                        {acking === a.id ? '...' : 'Acknowledge'}
                      </Button>
                    )}
                    {a.acknowledged_at && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Acked: {formatIST(a.acknowledged_at)}</Typography>
                    )}
                  </Box>
                </Box>
              </SectionCard>
            );
          })}
        </Box>
      )}
    </>
  );
}