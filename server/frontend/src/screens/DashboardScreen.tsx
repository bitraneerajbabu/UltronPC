import { Box, Chip, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { AlarmItem, BroadcastItem, CpcbStatusItem, Site, FleetHierarchyResponse } from '../types';
import KpiCard from '../components/Common/KpiCard';
import StatusBadge from '../components/Common/StatusBadge';
import SectionCard from '../components/Common/SectionCard';
import PageHeader from '../components/Common/PageHeader';
import EmptyState from '../components/Common/EmptyState';
import Icon from '../components/Common/Icon';
import { formatIST, formatDateShort, getConnectionStatus } from '../format';

interface DashboardScreenProps {
  hierarchy: FleetHierarchyResponse | null;
  sites: Site[];
  alarms: AlarmItem[];
  broadcasts: BroadcastItem[];
  cpcbStatus: CpcbStatusItem[];
  onSelectSite: (site: Site) => void;
  onNewSite: () => void;
}

export default function DashboardScreen({ hierarchy, sites, alarms, cpcbStatus, onSelectSite, onNewSite }: DashboardScreenProps) {
  const activeAlarms = alarms.filter(a => a.status === 'active').length;
  const recordsToday = cpcbStatus.reduce((sum, s) => sum + (s.total_records_synced_today || 0), 0);

  const totalIndustries = hierarchy?.industries.length || 0;
  const totalStations = hierarchy?.industries.reduce((acc, ind) => acc + ind.stations.length, 0) || 0;
  const totalDevices = hierarchy?.industries.reduce((acc, ind) => acc + ind.stations.reduce((sAcc, st) => sAcc + st.devices.length, 0), 0) || 0;
  const onlineDevices = hierarchy?.industries.reduce((acc, ind) => acc + ind.stations.reduce((sAcc, st) => sAcc + st.devices.filter(d => d.status === 'online').length, 0), 0) || 0;
  const offlineDevices = hierarchy?.industries.reduce((acc, ind) => acc + ind.stations.reduce((sAcc, st) => sAcc + st.devices.filter(d => d.status !== 'online').length, 0), 0) || 0;

  const kpis = [
    { id: 'total-ind', icon: <Icon name="Factory" size={24} />, label: 'Total Industries', value: totalIndustries, color: '#0F766E' },
    { id: 'total-stn', icon: <Icon name="Building" size={24} />, label: 'Total Stations', value: totalStations, color: '#0F766E' },
    { id: 'total-dev', icon: <Icon name="Cpu" size={24} />, label: 'Total Devices', value: totalDevices, color: '#0F766E' },
    { id: 'online-dev', icon: <Icon name="Wifi" size={24} />, label: 'Online Devices', value: onlineDevices, color: '#14B8A6' },
    { id: 'offline-dev', icon: <Icon name="WifiOff" size={24} />, label: 'Offline Devices', value: offlineDevices, color: '#E24B4A' },
    { id: 'alarms', icon: <Icon name="AlertTriangle" size={24} />, label: 'Active Alarms', value: activeAlarms, color: '#EF9F27' },
    { id: 'records', icon: <Icon name="FileBarChart2" size={24} />, label: 'Records Synced Today', value: recordsToday.toLocaleString(), color: '#0F766E' },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Fleet overview across all UltrON plants." />
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {kpis.map(kpi => (
          <Grid key={kpi.id} size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <KpiCard icon={kpi.icon} label={kpi.label} value={kpi.value} color={kpi.color} />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 12 }}>
          <SectionCard title="INDUSTRY / PLANT OVERVIEW" subtitle={`${totalIndustries} plants registered`}
            action={<Chip label="View all in Sites" size="small" variant="outlined" onClick={onNewSite} sx={{ cursor: 'pointer', borderColor: '#0F766E', color: '#0F766E' }} />}
          >
            {hierarchy?.industries.length === 0 ? (
              <EmptyState icon={<Icon name="Factory" size={56} />} title="No Plants Added"
                description="Register your first plant to start monitoring."
                action={{ label: 'Register Plant', onClick: onNewSite }}
              />
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Industry / Plant</TableCell>
                      <TableCell>Location</TableCell>
                      <TableCell align="center">Stations</TableCell>
                      <TableCell align="center">Devices</TableCell>
                      <TableCell align="center">Online</TableCell>
                      <TableCell align="center">Offline</TableCell>
                      <TableCell>Last Sync</TableCell>
                      <TableCell>AMC</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {hierarchy?.industries.map(site => {
                      const indOnline = site.stations.reduce((acc, st) => acc + st.devices.filter(d => d.status === 'online').length, 0);
                      const indOffline = site.stations.reduce((acc, st) => acc + st.devices.filter(d => d.status !== 'online').length, 0);
                      const devCount = indOnline + indOffline;
                      const conn = getConnectionStatus(site.last_sync || undefined);
                      
                      let lastSyncParts = site.last_sync ? formatIST(site.last_sync).split(' ') : ['—'];
                      let lastSyncDate = lastSyncParts[0] || '—';
                      let lastSyncTime = lastSyncParts.length > 1 ? lastSyncParts.slice(1).join(' ') : '';
                      
                      return (
                        <TableRow key={site.id} hover sx={{ cursor: 'pointer' }} onClick={() => {
                           const originalSite = sites.find(s => s.id === site.id);
                           if (originalSite) onSelectSite(originalSite);
                        }}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{site.name}</Typography>
                          </TableCell>
                          <TableCell><Typography variant="body2" sx={{ color: 'text.secondary' }}>{site.location || '—'}</Typography></TableCell>
                          <TableCell align="center"><Typography variant="body2">{site.stations.length}</Typography></TableCell>
                          <TableCell align="center"><Typography variant="body2">{devCount}</Typography></TableCell>
                          <TableCell align="center"><Typography variant="body2" sx={{ color: '#14B8A6' }}>{indOnline}</Typography></TableCell>
                          <TableCell align="center"><Typography variant="body2" sx={{ color: '#E24B4A' }}>{indOffline}</Typography></TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{lastSyncDate}</Typography>
                              {lastSyncTime && <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{lastSyncTime}</Typography>}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatDateShort(site.amc_expiry || undefined)}</Typography>
                          </TableCell>
                          <TableCell>
                            {site.is_active ? <StatusBadge status={conn.statusKey} /> : <StatusBadge status="inactive" />}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </SectionCard>
        </Grid>
      </Grid>
    </>
  );
}