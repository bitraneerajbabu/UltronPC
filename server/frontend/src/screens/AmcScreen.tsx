import { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import type { LockSummary, Site } from '../types';
import PageHeader from '../components/Common/PageHeader';
import StatusBadge from '../components/Common/StatusBadge';
import SectionCard from '../components/Common/SectionCard';
import EmptyState from '../components/Common/EmptyState';
import Icon from '../components/Common/Icon';
import LockDialog from '../components/Dialogs/LockDialog';
import { adminFetch } from '../api';
import { formatDateShort, formatIST } from '../format';

interface AmcScreenProps {
  sites: Site[];
  locks: LockSummary[];
  onRefresh: () => void;
}

export default function AmcScreen({ sites, locks, onRefresh }: AmcScreenProps) {
  const [lockModal, setLockModal] = useState<{ id: number; name: string; status: string; reason: string } | null>(null);
  const [confirmRenewSite, setConfirmRenewSite] = useState<Site | null>(null);
  const [renewingSite, setRenewingSite] = useState(false);

  const daysLeft = (site: Site): number | null => {
    if (!site.amc_expiry) return null;
    // eslint-disable-next-line react-hooks/purity -- time-based UI, recomputed every render/poll
    return Math.ceil((new Date(site.amc_expiry).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  };

  const expiryTone = (d: number | null) => {
    if (d === null) return { color: 'text.secondary', label: 'No expiry set' };
    if (d < 0) return { color: 'error.main', label: `Expired ${-d}d ago` };
    if (d <= 30) return { color: 'warning.main', label: `${d} days left` };
    return { color: 'success.main', label: `${d} days left` };
  };

  return (
    <>
      <PageHeader title="AMC & Control" subtitle="Locked sites stop sending CPCB data. Use for AMC non-renewal or violations." />

      <SectionCard title="Lock Status" sx={{ mb: 2.5 }}>
        {locks.length === 0 ? (
          <EmptyState icon={<Icon name="Lock" size={56} />} title="No Lock Data Available" description="Lock status appears when sites are registered." />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {locks.map(lock => {
              const site = sites.find(s => s.id === lock.id);
              const isLocked = lock.lock_status && lock.lock_status !== 'unlocked';
              return (
                <SectionCard key={lock.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>{site?.name || `Site #${lock.id}`}</Typography>
                        <StatusBadge status={isLocked ? 'locked' : 'unlocked'} />
                      </Box>
                      {isLocked && lock.lock_reason && <Typography variant="caption" sx={{ color: 'text.secondary' }}>Reason: {lock.lock_reason}</Typography>}
                      {lock.lock_updated_at && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Updated: {formatIST(lock.lock_updated_at)}</Typography>}
                    </Box>
                    <Button variant="contained" color={isLocked ? 'success' : 'error'}
                      onClick={() => setLockModal({ id: lock.id, name: site?.name || `Site #${lock.id}`, status: isLocked ? 'unlocked' : 'manual_lock', reason: '' })}>
                      {isLocked ? 'Unlock' : 'Lock'}
                    </Button>
                  </Box>
                </SectionCard>
              );
            })}
          </Box>
        )}
      </SectionCard>

      <SectionCard title="AMC Expiry" subtitle="Annual maintenance contracts per plant">
        {sites.length === 0 ? (
          <EmptyState icon={<Icon name="CalendarRange" size={56} />} title="No Plants" />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {sites.map(site => {
              const t = expiryTone(daysLeft(site));
              return (
                <SectionCard key={site.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>{site.name}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Expires: {formatDateShort(site.amc_expiry)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: t.color }}>{t.label}</Typography>
                      <Button size="small" variant="outlined" startIcon={<Icon name="RotateCcw" size={16} />} onClick={() => setConfirmRenewSite(site)}>Renew (+1 year)</Button>
                    </Box>
                  </Box>
                </SectionCard>
              );
            })}
          </Box>
        )}
      </SectionCard>

      <LockDialog open={!!lockModal} site={lockModal} onClose={() => setLockModal(null)} onSave={async (id, lockStatus, reason) => {
        await adminFetch(`/api/v1/sites/${id}/lock`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lock_status: lockStatus, lock_reason: reason }) });
        onRefresh();
      }} />

      <Dialog open={!!confirmRenewSite} onClose={() => !renewingSite && setConfirmRenewSite(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Renew AMC?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Are you sure you want to renew the AMC? This will permanently invalidate the current API key and disconnect the client until they enter the new key.
          </Typography>
          {confirmRenewSite && (
            <Typography variant="body2" sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontWeight: 600 }}>
              {confirmRenewSite.name}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setConfirmRenewSite(null)} disabled={renewingSite}>Cancel</Button>
          <Button variant="contained" disabled={renewingSite} onClick={async () => {
            if (!confirmRenewSite) return;
            setRenewingSite(true);
            try {
              const res = await adminFetch(`/api/v1/sites/${confirmRenewSite.id}/renew`, { method: 'POST' });
              if (res.ok) { setConfirmRenewSite(null); onRefresh(); alert('AMC renewed! Copy the new API key from the plant details.'); }
              else { alert(`Renewal failed: ${await res.text()}`); }
            } catch { alert('Network error — could not renew AMC'); }
            finally { setRenewingSite(false); }
          }}>
            {renewingSite ? 'Renewing…' : 'Renew'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}