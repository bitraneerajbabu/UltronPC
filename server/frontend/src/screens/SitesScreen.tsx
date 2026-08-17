import { useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import type { Site } from '../types';
import PageHeader from '../components/Common/PageHeader';
import StatusBadge from '../components/Common/StatusBadge';
import SectionCard from '../components/Common/SectionCard';
import EmptyState from '../components/Common/EmptyState';
import SearchBar from '../components/Common/SearchBar';
import Icon from '../components/Common/Icon';
import CreateSiteDialog from '../components/Dialogs/CreateSiteDialog';
import EditSiteDialog from '../components/Dialogs/EditSiteDialog';
import { formatDateShort, getConnectionStatus } from '../format';
import { adminFetch } from '../api';

interface SitesScreenProps {
  sites: Site[];
  onSelectSite: (site: Site) => void;
  onRefresh: () => void;
}

const CATEGORIES = ['All Plants', 'Online', 'Offline', 'Sync Issues'];

export default function SitesScreen({ sites, onSelectSite, onRefresh }: SitesScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('All Plants');
  const [showModal, setShowModal] = useState(false);
  const [editSiteModal, setEditSiteModal] = useState<{ id: number; name: string; location: string; notes: string } | null>(null);
  const [confirmDeleteSite, setConfirmDeleteSite] = useState<Site | null>(null);
  const [deletingSite, setDeletingSite] = useState(false);
  const [confirmRenewSite, setConfirmRenewSite] = useState<Site | null>(null);
  const [renewingSite, setRenewingSite] = useState(false);
  const [editingExpiry, setEditingExpiry] = useState<number | null>(null);
  const [editExpiryVal, setEditExpiryVal] = useState('');
  const [savingExpiry, setSavingExpiry] = useState(false);

  const handleToggleStatus = async (site: Site) => {
    await adminFetch(`/api/v1/sites/${site.id}/status?is_active=${!site.is_active}`, { method: 'PUT' });
    onRefresh();
  };

  const handleSaveExpiry = async (siteId: number) => {
    if (!editExpiryVal) return;
    setSavingExpiry(true);
    try {
      await adminFetch(`/api/v1/sites/${siteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amc_expiry: new Date(editExpiryVal).toISOString() }),
      });
      setEditingExpiry(null);
      onRefresh();
    } finally { setSavingExpiry(false); }
  };

  const filteredSites = sites.filter(site => {
    if (category === 'Online' && (!site.is_active || getConnectionStatus(site.last_sync).statusKey !== 'online')) return false;
    if (category === 'Offline' && (site.is_active && getConnectionStatus(site.last_sync).statusKey === 'online')) return false;
    if (category === 'Sync Issues' && !site.last_error) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return site.name.toLowerCase().includes(q) || (site.location || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      <PageHeader title="Sites" subtitle="Register, monitor and manage all industrial plants."
        action={<Button variant="contained" startIcon={<Icon name="Plus" size={18} />} onClick={() => setShowModal(true)}>New Plant</Button>}
      />
      <SectionCard noPadding sx={{ mb: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, p: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <Chip key={cat} label={cat} size="small" onClick={() => setCategory(cat)}
                variant={category === cat ? 'filled' : 'outlined'} color={category === cat ? 'primary' : 'default'}
                sx={{ cursor: 'pointer', fontWeight: 500 }} />
            ))}
          </Box>
          <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search plants..." />
        </Box>
        {filteredSites.length === 0 ? (
          <EmptyState icon={<Icon name="Factory" size={56} />} title="No Plants Found"
            description="Register your first plant to start monitoring."
            action={{ label: 'Register Plant', onClick: () => setShowModal(true) }} />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Plant</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Lock</TableCell>
                  <TableCell>AMC Expiry</TableCell>
                  <TableCell>Last Sync</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSites.map(site => {
                  const conn = getConnectionStatus(site.last_sync);
                  return (
                    <TableRow key={site.id} hover sx={{ cursor: 'pointer' }} onClick={() => onSelectSite(site)}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{site.name}</Typography>
                        {site.client_version && <Typography variant="caption" sx={{ color: 'text.secondary' }}>v{site.client_version}</Typography>}
                      </TableCell>
                      <TableCell><Typography variant="body2" sx={{ color: 'text.secondary' }}>{site.location || '—'}</Typography></TableCell>
                      <TableCell>
                        {site.is_active ? <StatusBadge status={conn.statusKey} /> : <StatusBadge status="inactive" />}
                      </TableCell>
                      <TableCell>
                        {site.lock_status && site.lock_status !== 'unlocked' ? <StatusBadge status="locked" /> : <StatusBadge status="unlocked" />}
                      </TableCell>
                      <TableCell>
                        {editingExpiry === site.id ? (
                          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                            <input type="date" value={editExpiryVal} onChange={e => setEditExpiryVal(e.target.value)}
                              style={{ width: 110, padding: '2px 4px', border: '1px solid #E5E7EB', borderRadius: 4, fontSize: 12 }} />
                            <IconButton size="small" onClick={() => handleSaveExpiry(site.id)} disabled={savingExpiry} sx={{ color: 'primary.main' }}><Icon name="RefreshCw" size={16} /></IconButton>
                            <IconButton size="small" onClick={() => setEditingExpiry(null)} sx={{ color: 'text.secondary' }}><Icon name="X" size={16} /></IconButton>
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatDateShort(site.amc_expiry)}</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{site.last_sync ? new Date(site.last_sync).toLocaleString() : '—'}</Typography>
                          {site.last_error && <Tooltip title={site.last_error}><Icon name="AlertTriangle" size={16} color="#E24B4A" /></Tooltip>}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                          <Tooltip title="Edit AMC Expiry"><IconButton size="small" onClick={() => { setEditingExpiry(site.id); setEditExpiryVal(site.amc_expiry?.split('T')[0] || ''); }} sx={{ color: 'text.secondary' }}><Icon name="CalendarRange" size={17} /></IconButton></Tooltip>
                          <Tooltip title={site.is_active ? 'Deactivate' : 'Activate'}><IconButton size="small" onClick={() => handleToggleStatus(site)} sx={{ color: 'text.secondary' }}><Icon name="Power" size={17} /></IconButton></Tooltip>
                          <Tooltip title="Renew AMC"><IconButton size="small" onClick={() => setConfirmRenewSite(site)} sx={{ color: 'text.secondary' }}><Icon name="RotateCcw" size={17} /></IconButton></Tooltip>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => setEditSiteModal({ id: site.id, name: site.name, location: site.location || '', notes: site.notes || '' })} sx={{ color: 'text.secondary' }}><Icon name="Pencil" size={17} /></IconButton></Tooltip>
                          <Tooltip title="Delete"><IconButton size="small" onClick={() => setConfirmDeleteSite(site)} sx={{ color: 'text.secondary' }}><Icon name="Trash2" size={17} /></IconButton></Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>

      <CreateSiteDialog open={showModal} onClose={() => setShowModal(false)} onCreate={async (name: string, location: string, amcExpiry: string) => {
        const payload: { name: string; location?: string; amc_expiry?: string } = { name, location };
        if (amcExpiry) payload.amc_expiry = new Date(amcExpiry).toISOString();
        const res = await adminFetch('/api/v1/sites/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(`Server error: ${await res.text()}`);
        onRefresh();
      }} />
      <EditSiteDialog open={!!editSiteModal} site={editSiteModal} onClose={() => setEditSiteModal(null)} onSave={async (id, name, location, notes) => {
        const res = await adminFetch(`/api/v1/sites/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, location, notes }) });
        if (!res.ok) alert('Failed: ' + ((await res.json()).detail || 'Unknown error'));
        onRefresh();
      }} />

      <Dialog open={!!confirmDeleteSite} onClose={() => !deletingSite && setConfirmDeleteSite(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Plant?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Are you sure you want to permanently delete this plant and ALL of its telemetry data? This cannot be undone.
          </Typography>
          {confirmDeleteSite && (
            <Typography variant="body2" sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontWeight: 600 }}>
              {confirmDeleteSite.name} ({confirmDeleteSite.location || 'No location'})
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setConfirmDeleteSite(null)} disabled={deletingSite}>Cancel</Button>
          <Button variant="contained" color="error" disabled={deletingSite} onClick={async () => {
            if (!confirmDeleteSite) return;
            setDeletingSite(true);
            try {
              const res = await adminFetch(`/api/v1/sites/${confirmDeleteSite.id}`, { method: 'DELETE' });
              if (res.ok) { setConfirmDeleteSite(null); onRefresh(); } else { alert(`Delete failed: ${await res.text()}`); }
            } catch { alert('Network error — could not delete plant'); }
            finally { setDeletingSite(false); }
          }}>
            {deletingSite ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

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
          <Button variant="contained" color="primary" disabled={renewingSite} onClick={async () => {
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