import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import type { LatestPoint, Site, Station, FleetHierarchyResponse } from '../types';
import PageHeader from '../components/Common/PageHeader';
import StatusBadge from '../components/Common/StatusBadge';
import SectionCard from '../components/Common/SectionCard';
import EmptyState from '../components/Common/EmptyState';
import Icon from '../components/Common/Icon';
import LockDialog from '../components/Dialogs/LockDialog';
import { formatIST, formatValue, getConnectionStatus, qualityInfo } from '../format';
import { adminFetch } from '../api';

interface SiteDetailScreenProps {
  hierarchy: FleetHierarchyResponse | null;
  site: Site;
  onBack: () => void;
  onSiteChanged: (site: Site) => void;
  onRefresh: () => void;
}

const STATION_CATEGORIES = ['emission', 'effluent', 'ambient'];

export default function SiteDetailScreen({ hierarchy, site, onBack, onSiteChanged, onRefresh }: SiteDetailScreenProps) {
  const [liveData, setLiveData] = useState<LatestPoint[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [expandedStationId, setExpandedStationId] = useState<number | null>(null);
  const [showAddStation, setShowAddStation] = useState(false);
  const [newStation, setNewStation] = useState({ station_id: '', username: '', category: 'emission', station_name: '' });
  const [editingStationId, setEditingStationId] = useState<number | null>(null);
  const [editStationForm, setEditStationForm] = useState({ station_id: '', username: '', category: '', station_name: '' });
  const [lockModal, setLockModal] = useState<{ id: number; name: string; status: string; reason: string } | null>(null);

  const [expandedStations, setExpandedStations] = useState<Set<string>>(new Set());
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set());

  const conn = getConnectionStatus(site.last_sync);
  const indHierarchy = hierarchy?.industries.find(i => i.id === site.id);

  const fetchLive = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/v1/sites/${site.id}/telemetry/latest`);
      if (res.ok) setLiveData(await res.json());
    } catch { /* skip */ }
  }, [site.id]);

  const fetchStations = useCallback(async () => {
    const res = await adminFetch(`/api/v1/stations/?site_id=${site.id}`);
    if (res.ok) {
      const data = await res.json();
      setStations(data);
      setExpandedStationId(prev => prev ?? (data.length > 0 ? data[0].id : null));
    }
  }, [site.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling pattern: sync load flag, async data set
    fetchLive();
    fetchStations();
    const interval = setInterval(fetchLive, 10000);
    return () => clearInterval(interval);
  }, [fetchLive, fetchStations]);

  const sendCommand = async (action: string, confirmText: string) => {
    if (!confirm(confirmText)) return;
    const res = await adminFetch(`/api/v1/commands/sites/${site.id}/command`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    });
    const d = await res.json();
    alert(res.ok ? `Command sent: ${action}` : `Failed: ${d.detail || 'Unknown error'}`);
  };

  const renewKey = async () => {
    if (!confirm(`Regenerate API key for ${site.name}? This will disconnect existing clients!`)) return;
    const res = await adminFetch(`/api/v1/sites/${site.id}/renew-key`, { method: 'POST' });
    if (res.ok) onSiteChanged(await res.json());
  };

  return (
    <>
      <PageHeader title={site.name} subtitle={site.location || 'No location'}
        action={<Button startIcon={<Icon name="SkipBack" size={18} />} onClick={onBack}>Back to Sites</Button>}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>
        <StatusBadge status={site.is_active ? conn.statusKey : 'inactive'} />
        {site.lock_status && site.lock_status !== 'unlocked'
          ? <StatusBadge status="locked" />
          : <StatusBadge status="unlocked" />}
        {site.client_version && <Chip label={`Client v${site.client_version}`} size="small" variant="outlined" />}
        {site.last_sync && <Typography variant="caption" sx={{ color: 'text.secondary' }}>Last sync: {formatIST(site.last_sync)}</Typography>}
        {site.last_error && <Alert severity="error" sx={{ py: 0, '& .MuiAlert-message': { fontSize: 12 } }}>{site.last_error}</Alert>}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 2.5, flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" disabled={conn.statusKey !== 'online'} startIcon={<Icon name="RefreshCw" size={16} />}
          onClick={() => sendCommand('restart_polling', `Send "Restart Polling" to ${site.name}?`)}>Restart Polling</Button>
        <Button size="small" variant="outlined" color="warning" disabled={conn.statusKey !== 'online'} startIcon={<Icon name="Power" size={16} />}
          onClick={() => sendCommand('reboot_system', `Send "Reboot System" to ${site.name}? The PC will restart immediately.`)}>Reboot PC</Button>
        <Button size="small" variant="outlined" color="error" disabled={conn.statusKey !== 'online'} startIcon={<Icon name="AlertTriangle" size={16} />}
          onClick={() => sendCommand('factory_reset', `Send "Factory Reset" to ${site.name}? ALL data on that PC will be erased!`)}>Factory Reset</Button>
        <Button size="small" variant="outlined" color={site.lock_status && site.lock_status !== 'unlocked' ? 'success' : 'error'}
          startIcon={<Icon name="Lock" size={16} />}
          onClick={() => setLockModal({ id: site.id, name: site.name, status: site.lock_status && site.lock_status !== 'unlocked' ? 'unlocked' : 'manual_lock', reason: '' })}>
          {site.lock_status && site.lock_status !== 'unlocked' ? 'Unlock' : 'Lock'}
        </Button>
      </Box>

      <SectionCard title="Telemetry Hierarchy" subtitle="Station → Device → Parameter (Live values update every 10s)" sx={{ mb: 2.5 }}>
        {!indHierarchy ? (
          <EmptyState icon={<Icon name="FolderTree" size={56} />} title="No Hierarchy Data" description="No structural data available for this site." />
        ) : indHierarchy.stations.length === 0 ? (
          <EmptyState icon={<Icon name="FolderTree" size={56} />} title="Empty Hierarchy" description="No stations reported for this site." />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {indHierarchy.stations.map((stn, stnIdx) => {
              const isStnExpanded = expandedStations.has(stn.name);
              return (
                <Box key={`stn-${stnIdx}`} sx={{ border: '1px solid', borderColor: isStnExpanded ? '#0F766E' : 'divider', borderRadius: 2, overflow: 'hidden' }}>
                  <Box sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    px: 2, py: 1.5, cursor: 'pointer', bgcolor: isStnExpanded ? 'rgba(15, 118, 110, 0.08)' : 'action.hover',
                  }} onClick={() => {
                    const next = new Set(expandedStations);
                    if (next.has(stn.name)) next.delete(stn.name); else next.add(stn.name);
                    setExpandedStations(next);
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Icon name={isStnExpanded ? 'ChevronDown' : 'ChevronRight'} size={18} color={isStnExpanded ? '#0F766E' : '#5D6663'} />
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: isStnExpanded ? '#0F766E' : 'text.primary' }}>{stn.name}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {stn.device_count} devices · {stn.parameter_count} parameters
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      {stn.last_telemetry ? (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Last Telemetry: {formatIST(stn.last_telemetry)}</Typography>
                      ) : (
                        <Typography variant="caption" sx={{ color: '#E24B4A', fontWeight: 600 }}>NEVER SYNCED</Typography>
                      )}
                    </Box>
                  </Box>

                  {isStnExpanded && stn.devices.map((dev, devIdx) => {
                    const devKey = `${stn.name}-${dev.name}`;
                    const isDevExpanded = expandedDevices.has(devKey);
                    return (
                      <Box key={`dev-${devIdx}`} sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'var(--mui-palette-background-paper)' }}>
                        <Box sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          px: 2, py: 1.25, pl: 5, cursor: 'pointer', bgcolor: isDevExpanded ? 'rgba(15, 118, 110, 0.04)' : 'transparent',
                          '&:hover': { bgcolor: 'action.hover' }
                        }} onClick={() => {
                          const next = new Set(expandedDevices);
                          if (next.has(devKey)) next.delete(devKey); else next.add(devKey);
                          setExpandedDevices(next);
                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Icon name={isDevExpanded ? 'ChevronDown' : 'ChevronRight'} size={16} color="#5D6663" />
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>{dev.name}</Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Protocol: {dev.protocol || 'Unknown'}</Typography>
                            </Box>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <StatusBadge status={dev.status} />
                          </Box>
                        </Box>

                        {isDevExpanded && (
                          <Box sx={{ borderTop: '1px solid', borderColor: 'divider', p: 0, bgcolor: 'var(--mui-palette-background-paper)' }}>
                            <TableContainer>
                              <Table size="small" sx={{ '& .MuiTableCell-root': { py: 1, borderBottom: '1px solid var(--mui-palette-divider)' } }}>
                                <TableHead>
                                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                                    <TableCell sx={{ pl: 7 }}>Parameter</TableCell>
                                    <TableCell align="right">Value</TableCell>
                                    <TableCell align="center">Quality</TableCell>
                                    <TableCell align="right">Time</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {dev.parameters.map((param, pIdx) => {
                                    // Merge liveData
                                    const livePt = liveData.find(pt => pt.tag_name === param.tag_name);
                                    const displayVal = livePt ? livePt.value : param.value;
                                    const displayQuality = livePt ? livePt.quality : param.status;
                                    const displayTime = livePt ? livePt.timestamp : param.received_at;
                                    const displayUnit = livePt?.unit || param.unit;
                                    
                                    const q = qualityInfo(displayQuality);
                                    
                                    return (
                                      <TableRow key={`param-${pIdx}`} hover>
                                        <TableCell sx={{ pl: 7 }}>
                                          <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'mono' }}>{param.tag_name}</Typography>
                                          {param.name && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{param.name}</Typography>}
                                        </TableCell>
                                        <TableCell align="right">
                                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatValue(displayVal)}</Typography>
                                          {displayUnit && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{displayUnit}</Typography>}
                                        </TableCell>
                                        <TableCell align="center">
                                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: q.color, flexShrink: 0 }} />
                                            <Typography variant="caption" sx={{ fontWeight: 600, color: q.color }}>{q.label}</Typography>
                                          </Box>
                                        </TableCell>
                                        <TableCell align="right">
                                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{displayTime ? formatIST(displayTime) : '—'}</Typography>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              );
            })}
          </Box>
        )}
      </SectionCard>

      <SectionCard title="Stations" subtitle="SPCB/CEMS station credentials for this site"
        action={<Button size="small" variant="outlined" startIcon={<Icon name="Plus" size={14} />} onClick={() => setShowAddStation(!showAddStation)}>Add Station</Button>}
      >
        {showAddStation && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2, p: 1.5, bgcolor: 'action.focus', borderRadius: 1 }}>
            <TextField size="small" label="Station ID" value={newStation.station_id} onChange={e => setNewStation({ ...newStation, station_id: e.target.value })} />
            <TextField size="small" label="Username" value={newStation.username} onChange={e => setNewStation({ ...newStation, username: e.target.value })} />
            <Box sx={{ display: 'flex', gap: 1 }}>
              {STATION_CATEGORIES.map(c => (
                <Button key={c} size="small" variant={newStation.category === c ? 'contained' : 'outlined'}
                  onClick={() => setNewStation({ ...newStation, category: c })} sx={{ textTransform: 'capitalize' }}>{c}</Button>
              ))}
            </Box>
            <TextField size="small" label="Station Name" value={newStation.station_name} onChange={e => setNewStation({ ...newStation, station_name: e.target.value })} />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => { setShowAddStation(false); setNewStation({ station_id: '', username: '', category: 'emission', station_name: '' }); }}>Cancel</Button>
              <Button size="small" variant="contained" onClick={async () => {
                if (!newStation.station_id || !newStation.username || !newStation.station_name) return;
                const res = await adminFetch(`/api/v1/stations/?site_id=${site.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newStation) });
                if (res.ok) {
                  setStations([...stations, await res.json()]);
                  setShowAddStation(false);
                  setNewStation({ station_id: '', username: '', category: 'emission', station_name: '' });
                }
              }}>Create</Button>
            </Box>
          </Box>
        )}

        {stations.length === 0 ? (
          <EmptyState icon={<Icon name="ListDetails" size={56} />} title="No Stations Configured"
            description="Stations let the site push CPCB/SPCB data. Add one, or telemetry appears below anyway." />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {stations.map(s => {
              const isExpanded = expandedStationId === s.id;
              const stationParams = liveData.filter(pt => pt.station_name === s.station_name);
              return (
                <Box key={s.id} sx={{ border: '1px solid', borderColor: isExpanded ? 'primary.main' : 'divider', borderRadius: 2, overflow: 'hidden' }}>
                  <Box sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    px: 2, py: 1.5, cursor: 'pointer', bgcolor: isExpanded ? 'action.selected' : 'action.hover',
                  }} onClick={() => setExpandedStationId(isExpanded ? null : s.id)}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Icon name={isExpanded ? 'ChevronDown' : 'ChevronRight'} size={18} color="#5D6663" />
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{s.station_name}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {s.station_id} · {s.username} · <Box component="span" sx={{ textTransform: 'capitalize' }}>{s.category}</Box>
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} onClick={e => e.stopPropagation()}>
                      <Chip label={`${stationParams.length} params`} size="small" variant="outlined" sx={{ fontSize: 10, height: 20, mr: 0.5 }} />
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => { setEditingStationId(s.id); setEditStationForm({ station_id: s.station_id, username: s.username, category: s.category, station_name: s.station_name }); }} sx={{ color: 'text.secondary' }}><Icon name="Pencil" size={16} /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" onClick={async () => {
                        if (!confirm(`Delete station "${s.station_name}"?`)) return;
                        const res = await adminFetch(`/api/v1/stations/${s.id}?site_id=${site.id}`, { method: 'DELETE' });
                        if (res.ok) setStations(stations.filter(x => x.id !== s.id));
                      }} sx={{ color: 'text.secondary' }}><Icon name="Trash2" size={16} /></IconButton></Tooltip>
                    </Box>
                  </Box>

                  {editingStationId === s.id && (
                    <Box sx={{ p: 1.5, bgcolor: 'action.hover' }}>
                      <TextField size="small" label="Station ID" value={editStationForm.station_id} onChange={e => setEditStationForm({ ...editStationForm, station_id: e.target.value })} sx={{ mb: 1 }} fullWidth />
                      <TextField size="small" label="Username" value={editStationForm.username} onChange={e => setEditStationForm({ ...editStationForm, username: e.target.value })} sx={{ mb: 1 }} fullWidth />
                      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        {STATION_CATEGORIES.map(c => (
                          <Button key={c} size="small" variant={editStationForm.category === c ? 'contained' : 'outlined'}
                            onClick={() => setEditStationForm({ ...editStationForm, category: c })} sx={{ textTransform: 'capitalize' }}>{c}</Button>
                        ))}
                      </Box>
                      <TextField size="small" label="Station Name" value={editStationForm.station_name} onChange={e => setEditStationForm({ ...editStationForm, station_name: e.target.value })} sx={{ mb: 1 }} fullWidth />
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <Button size="small" onClick={() => setEditingStationId(null)}>Cancel</Button>
                        <Button size="small" variant="contained" onClick={async () => {
                          const res = await adminFetch(`/api/v1/stations/${s.id}?site_id=${site.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editStationForm) });
                          if (res.ok) {
                            const updated = await res.json();
                            setStations(stations.map(x => x.id === s.id ? updated : x));
                            setEditingStationId(null);
                          }
                        }}>Save</Button>
                      </Box>
                    </Box>
                  )}

                  {isExpanded && editingStationId !== s.id && (
                    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', p: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, bgcolor: 'action.hover', px: 1.5, py: 0.75, borderRadius: 1 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 10 }}>Site Key:</Typography>
                        <Typography variant="caption" sx={{ fontFamily: 'mono', fontSize: 10 }}>
                          {site.api_key.length > 25 ? `${site.api_key.substring(0, 15)}...${site.api_key.substring(site.api_key.length - 10)}` : site.api_key}
                        </Typography>
                        <IconButton size="small" onClick={() => navigator.clipboard.writeText(site.api_key)} sx={{ color: 'text.secondary', ml: 'auto', p: 0.25 }}><Icon name="Copy" size={14} /></IconButton>
                        <Tooltip title="Regenerate Key"><IconButton size="small" onClick={renewKey} sx={{ color: 'text.secondary', p: 0.25 }}><Icon name="RefreshCw" size={14} /></IconButton></Tooltip>
                      </Box>
                      {stationParams.length === 0 ? (
                        <Typography variant="caption" sx={{ color: 'text.secondary', p: 2, display: 'block', textAlign: 'center' }}>
                          No telemetry data received for this station yet.
                        </Typography>
                      ) : (
                        <TableContainer>
                          <Table size="small" sx={{ '& .MuiTableCell-root': { px: 1.5, py: 1 } }}>
                            <TableHead>
                              <TableRow>
                                <TableCell>Parameter</TableCell>
                                <TableCell align="right">Value</TableCell>
                                <TableCell align="right">Std Limit</TableCell>
                                <TableCell align="center">Quality</TableCell>
                                <TableCell align="right">Time</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {stationParams.map(pt => {
                                const q = qualityInfo(pt.quality);
                                return (
                                  <TableRow key={pt.tag_name} hover>
                                    <TableCell><Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'mono' }}>{pt.tag_name}</Typography></TableCell>
                                    <TableCell align="right">
                                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatValue(pt.value)}</Typography>
                                      {pt.unit && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{pt.unit}</Typography>}
                                    </TableCell>
                                    <TableCell align="right"><Typography variant="body2">{formatValue(pt.std_limit)}</Typography></TableCell>
                                    <TableCell align="center">
                                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: q.color, flexShrink: 0 }} />
                                        <Typography variant="caption" sx={{ fontWeight: 600, color: q.color }}>{q.label}</Typography>
                                      </Box>
                                    </TableCell>
                                    <TableCell align="right"><Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatIST(pt.timestamp)}</Typography></TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      )}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </SectionCard>

      <LockDialog open={!!lockModal} site={lockModal} onClose={() => setLockModal(null)} onSave={async (id, lockStatus, reason) => {
        await adminFetch(`/api/v1/sites/${id}/lock`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lock_status: lockStatus, lock_reason: reason }) });
        onRefresh();
      }} />
    </>
  );
}