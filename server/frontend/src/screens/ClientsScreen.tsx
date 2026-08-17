import { useState } from 'react';
import { Box, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { Site } from '../types';
import PageHeader from '../components/Common/PageHeader';
import StatusBadge from '../components/Common/StatusBadge';
import SectionCard from '../components/Common/SectionCard';
import EmptyState from '../components/Common/EmptyState';
import SearchBar from '../components/Common/SearchBar';
import Icon from '../components/Common/Icon';
import { formatIST, getConnectionStatus } from '../format';

interface ClientsScreenProps {
  sites: Site[];
  onSelectSite: (site: Site) => void;
}

export default function ClientsScreen({ sites, onSelectSite }: ClientsScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = sites.filter(site => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return site.name.toLowerCase().includes(q) || (site.client_version || '').toLowerCase().includes(q);
  });

  return (
    <>
      <PageHeader title="UltrON Clients" subtitle="Software instances running at each plant and their connectivity."
        action={<SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search clients..." />}
      />
      <SectionCard noPadding>
        {filtered.length === 0 ? (
          <EmptyState icon={<Icon name="Server" size={56} />} title="No Clients Found" description="Clients appear when sites are registered." />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Client</TableCell>
                  <TableCell>Version</TableCell>
                  <TableCell>Connectivity</TableCell>
                  <TableCell>Lock</TableCell>
                  <TableCell>Last Error</TableCell>
                  <TableCell>Last Sync</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map(site => {
                  const conn = getConnectionStatus(site.last_sync);
                  return (
                    <TableRow key={site.id} hover sx={{ cursor: 'pointer' }} onClick={() => onSelectSite(site)}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{site.name}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{site.location || '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        {site.client_version
                          ? <Chip label={`v${site.client_version}`} size="small" variant="outlined" />
                          : <Typography variant="caption" sx={{ color: 'text.disabled' }}>—</Typography>}
                      </TableCell>
                      <TableCell>
                        {site.is_active ? <StatusBadge status={conn.statusKey} /> : <StatusBadge status="inactive" />}
                      </TableCell>
                      <TableCell>
                        {site.lock_status && site.lock_status !== 'unlocked' ? <StatusBadge status="locked" /> : <StatusBadge status="unlocked" />}
                      </TableCell>
                      <TableCell>
                        {site.last_error
                          ? <Typography variant="caption" sx={{ color: 'error.main' }}>{site.last_error}</Typography>
                          : <Typography variant="caption" sx={{ color: 'text.disabled' }}>None</Typography>}
                      </TableCell>
                      <TableCell><Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatIST(site.last_sync)}</Typography></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Connectivity is based on the server heartbeat window (90s). Clients poll for commands and broadcasts every ~60s.
        </Typography>
      </Box>
    </>
  );
}