import { Box, Button, Chip, Typography } from '@mui/material';
import type { Site } from '../types';
import PageHeader from '../components/Common/PageHeader';
import StatusBadge from '../components/Common/StatusBadge';
import SectionCard from '../components/Common/SectionCard';
import EmptyState from '../components/Common/EmptyState';
import Icon from '../components/Common/Icon';
import { adminFetch } from '../api';
import { getConnectionStatus } from '../format';

interface CommandsScreenProps {
  sites: Site[];
}

export default function CommandsScreen({ sites }: CommandsScreenProps) {
  const sendCommand = async (site: Site, action: string, confirmText: string, successText: string) => {
    if (!confirm(confirmText)) return;
    try {
      const res = await adminFetch(`/api/v1/commands/sites/${site.id}/command`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      if (res.ok) alert(successText);
      else { const d = await res.json(); alert(`Failed: ${d.detail || 'Unknown error'}`); }
    } catch { alert('Network error'); }
  };

  return (
    <>
      <PageHeader title="Commands" subtitle="Send restart, reboot, and reset commands to UltrON clients."
        action={<Chip label="Client polls every ~60s" size="small" variant="outlined" icon={<Icon name="Activity" size={18} />} />}
      />
      {sites.length === 0 ? (
        <SectionCard><EmptyState icon={<Icon name="Factory" size={56} />} title="No Plants Registered" /></SectionCard>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {sites.map(site => {
            const conn = getConnectionStatus(site.last_sync);
            const online = conn.statusKey === 'online';
            return (
              <SectionCard key={site.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: conn.color }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{site.name}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{site.location || ''}</Typography>
                    </Box>
                    <StatusBadge status={conn.statusKey} />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" variant="outlined" disabled={!online} startIcon={<Icon name="RefreshCw" size={18} />}
                      onClick={() => sendCommand(site, 'restart_polling', `Send "Restart Polling" to ${site.name}?`, `Restart Polling sent to ${site.name}`)}>
                      Restart Polling
                    </Button>
                    <Button size="small" variant="outlined" color="warning" disabled={!online} startIcon={<Icon name="Power" size={18} />}
                      onClick={() => sendCommand(site, 'reboot_system', `Send "Reboot System" to ${site.name}? The PC will restart immediately.`, `Reboot sent to ${site.name}`)}>
                      Reboot PC
                    </Button>
                    <Button size="small" variant="outlined" color="error" disabled={!online} startIcon={<Icon name="AlertTriangle" size={18} />}
                      onClick={() => {
                        if (!confirm(`Send "Factory Reset" to ${site.name}? ALL data on that PC will be erased!`)) return;
                        if (!confirm(`ARE YOU SURE? This will DESTROY all local data on ${site.name}.`)) return;
                        sendCommand(site, 'factory_reset', `Final confirmation for ${site.name}?`, `Factory Reset sent to ${site.name}`);
                      }}>
                      Factory Reset
                    </Button>
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