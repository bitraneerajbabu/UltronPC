import { Box, Typography } from '@mui/material';
import type { AlarmItem, BroadcastItem } from '../types';
import PageHeader from '../components/Common/PageHeader';
import SectionCard from '../components/Common/SectionCard';
import EmptyState from '../components/Common/EmptyState';
import Icon from '../components/Common/Icon';
import { formatIST } from '../format';

interface ActivityScreenProps {
  alarms: AlarmItem[];
  broadcasts: BroadcastItem[];
}

type ActivityItem = {
  ts: string;
  kind: 'alarm' | 'broadcast';
  title: string;
  text: string;
  meta: string;
  tone: 'error' | 'primary' | 'warning';
};

export default function ActivityScreen({ alarms, broadcasts }: ActivityScreenProps) {
  const items: ActivityItem[] = [
    ...alarms.map(a => ({
      ts: a.created_at,
      kind: 'alarm' as const,
      title: `Alarm · ${a.site_name || `Site #${a.site_id}`} · Q${a.quality}${a.status === 'active' ? ' (active)' : ''}`,
      text: a.message,
      meta: formatIST(a.created_at),
      tone: 'error' as const,
    })),
    ...broadcasts.map(b => ({
      ts: b.created_at,
      kind: 'broadcast' as const,
      title: `Broadcast${b.is_active ? '' : ' (inactive)'} · ${b.target_all ? 'All plants' : `Site #${b.target_site_id}`}`,
      text: b.message,
      meta: formatIST(b.created_at),
      tone: (b.message_type === 'critical' ? 'error' : b.message_type === 'warning' ? 'warning' : 'primary') as 'error' | 'primary' | 'warning',
    })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return (
    <>
      <PageHeader title="Activity" subtitle="Combined audit of alarms and broadcasts. Command history and user actions require backend support." />
      {items.length === 0 ? (
        <SectionCard><EmptyState icon={<Icon name="History" size={56} />} title="No Activity Yet" /></SectionCard>
      ) : (
        <SectionCard noPadding>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((item, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 2, px: 2.5, py: 1.75, borderBottom: i < items.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                <Box sx={{ flexShrink: 0, mt: 0.25 }}>
                  <Icon name={item.kind === 'alarm' ? 'AlertTriangle' : 'Megaphone'} size={18} color={item.tone === 'primary' ? '#0F6E56' : item.tone === 'warning' ? '#EF9F27' : '#E24B4A'} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.title}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{item.text}</Typography>
                </Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0, pt: 0.25 }}>{item.meta}</Typography>
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}
    </>
  );
}