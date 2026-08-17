import { useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import type { BroadcastItem, Site } from '../types';
import PageHeader from '../components/Common/PageHeader';
import StatusBadge from '../components/Common/StatusBadge';
import SectionCard from '../components/Common/SectionCard';
import EmptyState from '../components/Common/EmptyState';
import Icon from '../components/Common/Icon';
import BroadcastDialog from '../components/Dialogs/BroadcastDialog';
import { adminFetch } from '../api';
import { formatIST } from '../format';

interface BroadcastsScreenProps {
  broadcasts: BroadcastItem[];
  sites: Site[];
  onRefresh: () => void;
}

interface BroadcastPayload {
  message: string;
  message_type: string;
  target_all: boolean;
  target_site_id?: number;
  expires_at?: string;
}

export default function BroadcastsScreen({ broadcasts, sites, onRefresh }: BroadcastsScreenProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingBc, setEditingBc] = useState<BroadcastItem | null>(null);
  const [confirmDeleteBc, setConfirmDeleteBc] = useState<BroadcastItem | null>(null);
  const [deletingBc, setDeletingBc] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'expired'>('all');

  const typeColor = (t: string) => (t === 'critical' ? 'error' : t === 'warning' ? 'warning' : 'primary') as 'error' | 'warning' | 'primary';
  const isExpired = (b: BroadcastItem) => b.expires_at && new Date(b.expires_at) < new Date();

  const visible = broadcasts.filter(b => {
    if (activeFilter === 'active') return b.is_active && !isExpired(b);
    if (activeFilter === 'expired') return !b.is_active || !!isExpired(b);
    return true;
  });

  return (
    <>
      <PageHeader title="Broadcast Center" subtitle="Send announcements to UltrON clients. Clients receive them on their next poll."
        action={<Button variant="contained" startIcon={<Icon name="Megaphone" size={18} />} onClick={() => { setEditingBc(null); setShowModal(true); }}>New Broadcast</Button>}
      />
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {(['all', 'active', 'expired'] as const).map(f => (
          <Chip key={f} label={f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Inactive / Expired'} size="small"
            onClick={() => setActiveFilter(f)} variant={activeFilter === f ? 'filled' : 'outlined'}
            color={activeFilter === f ? 'primary' : 'default'} sx={{ cursor: 'pointer', fontWeight: 500, textTransform: 'capitalize' }} />
        ))}
      </Box>
      {visible.length === 0 ? (
        <SectionCard>
          <EmptyState icon={<Icon name="Megaphone" size={56} />} title="No Broadcasts"
            description="Create one to send messages to all UltrON clients."
            action={{ label: 'New Broadcast', onClick: () => { setEditingBc(null); setShowModal(true); } }} />
        </SectionCard>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {visible.map(bc => (
            <SectionCard key={bc.id}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                    <Chip label={bc.message_type.toUpperCase()} size="small" color={typeColor(bc.message_type)} variant="outlined" sx={{ fontWeight: 700 }} />
                    <StatusBadge status={bc.is_active ? 'active' : 'inactive'} />
                    {isExpired(bc) && <Chip label="Expired" size="small" variant="outlined" sx={{ color: 'text.secondary' }} />}
                  </Box>
                  <Typography variant="body1" sx={{ mb: 1 }}>{bc.message}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={bc.target_all ? 'All Plants' : (sites.find(s => s.id === bc.target_site_id)?.name || `Site #${bc.target_site_id}`)} size="small" variant="outlined" />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Created: {formatIST(bc.created_at)}</Typography>
                    {bc.expires_at && <Typography variant="caption" sx={{ color: 'text.secondary' }}>Expires: {formatIST(bc.expires_at)}</Typography>}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                  <Button size="small" variant="outlined" color={bc.is_active ? 'warning' : 'success'} onClick={async () => {
                    await adminFetch(`/api/v1/broadcasts/${bc.id}/toggle`, { method: 'PUT' });
                    onRefresh();
                  }}>{bc.is_active ? 'Deactivate' : 'Activate'}</Button>
                  <Button size="small" onClick={() => { setEditingBc(bc); setShowModal(true); }}>Edit</Button>
                  <Button size="small" color="error" onClick={() => setConfirmDeleteBc(bc)}>Delete</Button>
                </Box>
              </Box>
            </SectionCard>
          ))}
        </Box>
      )}

      <BroadcastDialog open={showModal} editData={editingBc} sites={sites} onClose={() => { setShowModal(false); setEditingBc(null); }}
        onSave={async (payload: BroadcastPayload) => {
          const url = editingBc ? `/api/v1/broadcasts/${editingBc.id}` : '/api/v1/broadcasts/';
          const method = editingBc ? 'PUT' : 'POST';
          await adminFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          onRefresh();
        }} />

      <Dialog open={!!confirmDeleteBc} onClose={() => !deletingBc && setConfirmDeleteBc(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Broadcast?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Are you sure you want to delete this broadcast? This cannot be undone.
          </Typography>
          {confirmDeleteBc && (
            <Typography variant="body2" sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontStyle: 'italic' }}>
              "{confirmDeleteBc.message}"
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setConfirmDeleteBc(null)} disabled={deletingBc}>Cancel</Button>
          <Button variant="contained" color="error" disabled={deletingBc} onClick={async () => {
            if (!confirmDeleteBc) return;
            setDeletingBc(true);
            try {
              const res = await adminFetch(`/api/v1/broadcasts/${confirmDeleteBc.id}`, { method: 'DELETE' });
              if (res.ok) setConfirmDeleteBc(null);
              else { const err = await res.json().catch(() => ({})); alert('Delete failed: ' + (err.detail || res.statusText)); }
            } catch { alert('Network error — could not delete broadcast'); }
            finally { setDeletingBc(false); }
          }}>
            {deletingBc ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}