import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Paper,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Grid,
  LinearProgress,
  Snackbar,
  Alert,
  useTheme,
  InputAdornment,
} from '@mui/material';
import Icon from './Common/Icon';
import SectionCard from './Common/SectionCard';
import StatusBadge from './Common/StatusBadge';
import KpiCard from './Common/KpiCard';

// --- Types ---
interface FleetDevice {
  id: string;
  plant: string;
  customer: string;
  gateway: string;
  version: string;
  heartbeat: string; // duration ago
  heartbeatSeconds: number; // raw value for sorting
  cpu: number; // percentage
  ram: number; // percentage
  internet: 'Good' | 'Poor' | 'Disconnected';
  status: 'Online' | 'Offline' | 'Locked';
}

// --- Mock Data ---
const INITIAL_MOCK_DATA: FleetDevice[] = [
  {
    id: '1',
    plant: 'Kothagudem TPS (KTPP)',
    customer: 'Telangana Genco',
    gateway: 'GW-KTPP-01',
    version: '1.0.65',
    heartbeat: '3s ago',
    heartbeatSeconds: 3,
    cpu: 12,
    ram: 45,
    internet: 'Good',
    status: 'Online',
  },
  {
    id: '2',
    plant: 'Singrauli Super Thermal',
    customer: 'NTPC',
    gateway: 'GW-SING-02',
    version: '1.0.64',
    heartbeat: '12s ago',
    heartbeatSeconds: 12,
    cpu: 88,
    ram: 78,
    internet: 'Good',
    status: 'Online',
  },
  {
    id: '3',
    plant: 'Mundra Power Plant',
    customer: 'Adani Power',
    gateway: 'GW-MUND-03',
    version: '1.0.65',
    heartbeat: '2m ago',
    heartbeatSeconds: 120,
    cpu: 42,
    ram: 55,
    internet: 'Poor',
    status: 'Online',
  },
  {
    id: '4',
    plant: 'Ramagundam STPS',
    customer: 'NTPC',
    gateway: 'GW-RAMA-04',
    version: '1.0.60',
    heartbeat: '1h ago',
    heartbeatSeconds: 3600,
    cpu: 0,
    ram: 0,
    internet: 'Disconnected',
    status: 'Offline',
  },
  {
    id: '5',
    plant: 'Rihand Super Thermal',
    customer: 'NTPC',
    gateway: 'GW-RIHN-05',
    version: '1.0.65',
    heartbeat: '5s ago',
    heartbeatSeconds: 5,
    cpu: 95,
    ram: 92,
    internet: 'Good',
    status: 'Online',
  },
  {
    id: '6',
    plant: 'Talcher Thermal',
    customer: 'JSW Energy',
    gateway: 'GW-TALC-06',
    version: '1.0.58',
    heartbeat: '4d ago',
    heartbeatSeconds: 345600,
    cpu: 0,
    ram: 0,
    internet: 'Disconnected',
    status: 'Locked',
  },
  {
    id: '7',
    plant: 'Vindhyachal STPS',
    customer: 'NTPC',
    gateway: 'GW-VIND-07',
    version: '1.0.65',
    heartbeat: '8s ago',
    heartbeatSeconds: 8,
    cpu: 31,
    ram: 64,
    internet: 'Good',
    status: 'Online',
  },
  {
    id: '8',
    plant: 'Simhadri STPS',
    customer: 'NTPC',
    gateway: 'GW-SIMH-08',
    version: '1.0.64',
    heartbeat: '24s ago',
    heartbeatSeconds: 24,
    cpu: 15,
    ram: 38,
    internet: 'Good',
    status: 'Online',
  },
  {
    id: '9',
    plant: 'Dadri Power Station',
    customer: 'Reliance Power',
    gateway: 'GW-DADR-09',
    version: '1.0.65',
    heartbeat: '1m ago',
    heartbeatSeconds: 60,
    cpu: 52,
    ram: 70,
    internet: 'Poor',
    status: 'Online',
  },
  {
    id: '10',
    plant: 'Farakka Super Thermal',
    customer: 'NTPC',
    gateway: 'GW-FARA-10',
    version: '1.0.60',
    heartbeat: '10m ago',
    heartbeatSeconds: 600,
    cpu: 0,
    ram: 0,
    internet: 'Disconnected',
    status: 'Offline',
  },
  {
    id: '11',
    plant: 'Trombay Thermal Power',
    customer: 'Tata Power',
    gateway: 'GW-TROM-11',
    version: '1.0.65',
    heartbeat: '15s ago',
    heartbeatSeconds: 15,
    cpu: 22,
    ram: 48,
    internet: 'Good',
    status: 'Online',
  },
  {
    id: '12',
    plant: 'Joppa Power Station',
    customer: 'Adani Power',
    gateway: 'GW-JOPP-12',
    version: '1.0.65',
    heartbeat: '45s ago',
    heartbeatSeconds: 45,
    cpu: 65,
    ram: 82,
    internet: 'Good',
    status: 'Online',
  },
  {
    id: '13',
    plant: 'Wanakbori TPS',
    customer: 'GSECL',
    gateway: 'GW-WANA-13',
    version: '1.0.64',
    heartbeat: '3d ago',
    heartbeatSeconds: 259200,
    cpu: 0,
    ram: 0,
    internet: 'Disconnected',
    status: 'Offline',
  },
  {
    id: '14',
    plant: 'Udupi Power Station',
    customer: 'Adani Power',
    gateway: 'GW-UDUP-14',
    version: '1.0.65',
    heartbeat: '5d ago',
    heartbeatSeconds: 432000,
    cpu: 0,
    ram: 0,
    internet: 'Disconnected',
    status: 'Locked',
  },
  {
    id: '15',
    plant: 'Ukai Thermal Power',
    customer: 'GSECL',
    gateway: 'GW-UKAI-15',
    version: '1.0.65',
    heartbeat: '1s ago',
    heartbeatSeconds: 1,
    cpu: 8,
    ram: 29,
    internet: 'Good',
    status: 'Online',
  },
];

export default function FleetMonitoring() {
  const [data, setData] = useState<FleetDevice[]>(INITIAL_MOCK_DATA);
  const theme = useTheme();

  // --- Filter State ---
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [internetFilter, setInternetFilter] = useState('All');
  const [customerFilter, setCustomerFilter] = useState('All');

  // --- Sort State ---
  const [orderBy, setOrderBy] = useState<keyof FleetDevice>('plant');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');

  // --- Pagination State ---
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  // --- Toast/Snackbar Notification ---
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'warning' | 'info' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // --- Unique Customers for dropdown ---
  const uniqueCustomers = useMemo(() => {
    const customers = new Set(data.map((d) => d.customer));
    return ['All', ...Array.from(customers)];
  }, [data]);

  // --- Sort & Filter Logic ---
  const handleRequestSort = (property: keyof FleetDevice) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const showToast = (message: string, severity: 'success' | 'warning' | 'info' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  // --- Action Handlers (Mocked) ---
  const handleRestartPolling = (device: FleetDevice) => {
    if (device.status === 'Locked') {
      showToast(`Cannot restart polling. ${device.plant} is Locked!`, 'error');
      return;
    }
    setData((prev) =>
      prev.map((d) =>
        d.id === device.id
          ? { ...d, heartbeat: 'Just now', heartbeatSeconds: 0, status: 'Online', internet: d.internet === 'Disconnected' ? 'Good' : d.internet }
          : d
      )
    );
    showToast(`Restart polling command sent successfully to ${device.plant}.`, 'success');
  };

  const handleRebootPC = (device: FleetDevice) => {
    if (device.status === 'Locked') {
      showToast(`Cannot reboot. ${device.plant} is Locked!`, 'error');
      return;
    }
    // Simulate temporary offline during reboot
    setData((prev) =>
      prev.map((d) =>
        d.id === device.id
          ? { ...d, status: 'Offline', heartbeat: 'Rebooting...', heartbeatSeconds: 9999, cpu: 0, ram: 0 }
          : d
      )
    );
    showToast(`System reboot command dispatched to ${device.plant}. PC is restarting.`, 'warning');

    // Simulate recovery after 4 seconds
    setTimeout(() => {
      setData((prev) =>
        prev.map((d) =>
          d.id === device.id
            ? { ...d, status: 'Online', heartbeat: '5s ago', heartbeatSeconds: 5, cpu: 15, ram: 42, internet: 'Good' }
            : d
        )
      );
      showToast(`${device.plant} has rebooted and is back Online.`, 'success');
    }, 4000);
  };

  const handleToggleLock = (device: FleetDevice) => {
    const willLock = device.status !== 'Locked';
    setData((prev) =>
      prev.map((d) =>
        d.id === device.id
          ? {
              ...d,
              status: willLock ? 'Locked' : 'Online',
              cpu: willLock ? 0 : 10,
              ram: willLock ? 0 : 35,
              internet: willLock ? 'Disconnected' : 'Good',
              heartbeat: willLock ? 'Suspended' : 'Just now',
              heartbeatSeconds: willLock ? 999999 : 0,
            }
          : d
      )
    );
    showToast(
      willLock
        ? `AMC Locked: ${device.plant} data submission suspended.`
        : `AMC Unlocked: ${device.plant} is back Online.`,
      willLock ? 'error' : 'success'
    );
  };

  // --- Reset all filters ---
  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('All');
    setInternetFilter('All');
    setCustomerFilter('All');
    showToast('Filters cleared', 'info');
  };

  // --- Filtered and Sorted Data ---
  const processedData = useMemo(() => {
    let filtered = data.filter((item) => {
      // Search
      const searchMatch =
        item.plant.toLowerCase().includes(search.toLowerCase()) ||
        item.customer.toLowerCase().includes(search.toLowerCase()) ||
        item.gateway.toLowerCase().includes(search.toLowerCase()) ||
        item.version.toLowerCase().includes(search.toLowerCase());

      // Status Filter
      const statusMatch = statusFilter === 'All' || item.status === statusFilter;

      // Internet Filter
      const internetMatch = internetFilter === 'All' || item.internet === internetFilter;

      // Customer Filter
      const customerMatch = customerFilter === 'All' || item.customer === customerFilter;

      return searchMatch && statusMatch && internetMatch && customerMatch;
    });

    // Sorting
    filtered.sort((a, b) => {
      let valA = a[orderBy];
      let valB = b[orderBy];

      // Custom comparator for special columns
      if (orderBy === 'heartbeat') {
        valA = a.heartbeatSeconds;
        valB = b.heartbeatSeconds;
      }

      if (valA < valB) return order === 'asc' ? -1 : 1;
      if (valA > valB) return order === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [data, search, statusFilter, internetFilter, customerFilter, orderBy, order]);

  // --- Pagination Logic ---
  const paginatedData = useMemo(() => {
    const startIndex = page * rowsPerPage;
    return processedData.slice(startIndex, startIndex + rowsPerPage);
  }, [processedData, page, rowsPerPage]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // --- Helpers for Styling ---
  const getCpuRamColor = (value: number) => {
    if (value > 80) return theme.palette.error.main;
    if (value > 50) return theme.palette.warning.main;
    return theme.palette.success.main;
  };

  const getInternetChip = (quality: FleetDevice['internet']) => {
    switch (quality) {
      case 'Good':
        return <Chip size="small" icon={<Icon name="Wifi" size={18} />} label="Good" sx={{ bgcolor: 'rgba(22, 163, 74, 0.1)', color: '#16A34A', border: '1px solid rgba(22, 163, 74, 0.2)', fontWeight: 600 }} />;
      case 'Poor':
        return <Chip size="small" icon={<Icon name="Wifi" size={18} />} label="Poor" sx={{ bgcolor: 'rgba(245, 158, 11, 0.1)', color: '#D97706', border: '1px solid rgba(245, 158, 11, 0.2)', fontWeight: 600 }} />;
      case 'Disconnected':
        return <Chip size="small" icon={<Icon name="WifiOff" size={18} />} label="Disconnected" sx={{ bgcolor: 'rgba(220, 38, 38, 0.1)', color: '#DC2626', border: '1px solid rgba(220, 38, 38, 0.2)', fontWeight: 600 }} />;
    }
  };

  const getStatusBadge = (status: FleetDevice['status']) => {
    if (status === 'Online') return <StatusBadge status="online" />;
    if (status === 'Offline') return <StatusBadge status="offline" />;
    return <StatusBadge status="locked" />;
  };

  // --- Stats calculated from active dataset ---
  const stats = useMemo(() => {
    const total = data.length;
    const online = data.filter((d) => d.status === 'Online').length;
    const offline = data.filter((d) => d.status === 'Offline').length;
    const locked = data.filter((d) => d.status === 'Locked').length;
    const highCpu = data.filter((d) => d.status === 'Online' && d.cpu > 80).length;

    return { total, online, offline, locked, highCpu };
  }, [data]);

  return (
    <Box sx={{ pb: 4 }}>
      {/* KPI Stats Panel */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <KpiCard
            icon={<Icon name="Factory" size={26} />}
            label="Total Fleet"
            value={stats.total}
            subtitle="registered plant gateways"
            color="#2563EB"
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <KpiCard
            icon={<Icon name="Wifi" size={26} />}
            label="Online"
            value={stats.online}
            subtitle="active telemetry sync"
            color="#16A34A"
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <KpiCard
            icon={<Icon name="WifiOff" size={26} />}
            label="Offline"
            value={stats.offline}
            subtitle="disconnected from portal"
            color="#DC2626"
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <KpiCard
            icon={<Icon name="CalendarRange" size={26} />}
            label="AMC Locked"
            value={stats.locked}
            subtitle="compliance sync suspended"
            color="#D97706"
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
          <KpiCard
            icon={<Icon name="AlertTriangle" size={26} />}
            label="High Load Warnings"
            value={stats.highCpu}
            subtitle="gateways with CPU > 80%"
            color="#EF4444"
          />
        </Grid>
      </Grid>

      {/* Main Table Card */}
      <SectionCard
        title="Fleet Status Table"
        subtitle={`${processedData.length} gateways match the active filters.`}
        action={
          <Button
            size="small"
            variant="outlined"
            onClick={handleResetFilters}
            startIcon={<Icon name="X" size={20} />}
            sx={{ textTransform: 'none' }}
          >
            Clear Filters
          </Button>
        }
      >
        {/* Filters Bar */}
        <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Grid container spacing={2} sx={{ alignItems: 'center' }}>
            {/* Search */}
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                size="small"
                variant="outlined"
                placeholder="Search plant, customer, gateway, version..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Icon name="Search" size={18} color="#9CA3AF" />
                      </InputAdornment>
                    ),
                    endAdornment: search && (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setSearch('')} edge="end">
                          <Icon name="X" size={18} />
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Grid>

            {/* Filter Status */}
            <Grid size={{ xs: 6, sm: 4, md: 2.5 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="status-filter-label">Status</InputLabel>
                <Select
                  labelId="status-filter-label"
                  label="Status"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <MenuItem value="All">All Statuses</MenuItem>
                  <MenuItem value="Online">Online</MenuItem>
                  <MenuItem value="Offline">Offline</MenuItem>
                  <MenuItem value="Locked">Locked</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Filter Internet */}
            <Grid size={{ xs: 6, sm: 4, md: 2.5 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="internet-filter-label">Network</InputLabel>
                <Select
                  labelId="internet-filter-label"
                  label="Network"
                  value={internetFilter}
                  onChange={(e) => {
                    setInternetFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <MenuItem value="All">All Networks</MenuItem>
                  <MenuItem value="Good">Good</MenuItem>
                  <MenuItem value="Poor">Poor</MenuItem>
                  <MenuItem value="Disconnected">Disconnected</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Filter Customer */}
            <Grid size={{ xs: 12, sm: 4, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="customer-filter-label">Customer</InputLabel>
                <Select
                  labelId="customer-filter-label"
                  label="Customer"
                  value={customerFilter}
                  onChange={(e) => {
                    setCustomerFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  {uniqueCustomers.map((cust) => (
                    <MenuItem key={cust} value={cust}>
                      {cust === 'All' ? 'All Customers' : cust}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Box>

        {/* Responsive Table Container */}
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 2 }}>
          <Table sx={{ minWidth: 800 }} aria-label="fleet table" size="medium">
            <TableHead sx={{ bgcolor: '#F9FAFB' }}>
              <TableRow>
                {/* Column Headers with Sort */}
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'plant'}
                    direction={orderBy === 'plant' ? order : 'asc'}
                    onClick={() => handleRequestSort('plant')}
                    style={{ fontWeight: 600 }}
                  >
                    Plant
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'customer'}
                    direction={orderBy === 'customer' ? order : 'asc'}
                    onClick={() => handleRequestSort('customer')}
                    style={{ fontWeight: 600 }}
                  >
                    Customer
                  </TableSortLabel>
                </TableCell>
                <TableCell style={{ fontWeight: 600 }}>Gateway</TableCell>
                <TableCell style={{ fontWeight: 600 }} align="center">
                  Version
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'heartbeat'}
                    direction={orderBy === 'heartbeat' ? order : 'asc'}
                    onClick={() => handleRequestSort('heartbeat')}
                    style={{ fontWeight: 600 }}
                  >
                    Heartbeat
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center">
                  <TableSortLabel
                    active={orderBy === 'cpu'}
                    direction={orderBy === 'cpu' ? order : 'asc'}
                    onClick={() => handleRequestSort('cpu')}
                    style={{ fontWeight: 600 }}
                  >
                    CPU
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center">
                  <TableSortLabel
                    active={orderBy === 'ram'}
                    direction={orderBy === 'ram' ? order : 'asc'}
                    onClick={() => handleRequestSort('ram')}
                    style={{ fontWeight: 600 }}
                  >
                    RAM
                  </TableSortLabel>
                </TableCell>
                <TableCell style={{ fontWeight: 600 }} align="center">
                  Internet
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'status'}
                    direction={orderBy === 'status' ? order : 'asc'}
                    onClick={() => handleRequestSort('status')}
                    style={{ fontWeight: 600 }}
                  >
                    Status
                  </TableSortLabel>
                </TableCell>
                <TableCell style={{ fontWeight: 600 }} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 8 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#9CA3AF' }}>
                      <Icon name="AlertTriangle" size={48} style={{ marginBottom: 16 }} />
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>No fleet gateways found</Typography>
                      <Typography variant="caption">Try adjusting search query or active filters</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((device) => {
                  const isLoadHigh = device.cpu > 80 || device.ram > 80;

                  return (
                    <TableRow
                      key={device.id}
                      hover
                      sx={{
                        '&:last-child td': { borderBottom: 'none' },
                        transition: 'background-color 0.2s',
                        bgcolor: isLoadHigh && device.status === 'Online' ? 'rgba(239, 68, 68, 0.02)' : 'inherit',
                      }}
                    >
                      {/* 1. Plant */}
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>
                          {device.plant}
                        </Typography>
                      </TableCell>

                      {/* 2. Customer */}
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#4B5563' }}>
                          {device.customer}
                        </Typography>
                      </TableCell>

                      {/* 3. Gateway */}
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'mono', bgcolor: '#F3F4F6', px: 1, py: 0.5, borderRadius: 1, color: '#374151' }}>
                          {device.gateway}
                        </Typography>
                      </TableCell>

                      {/* 4. Version */}
                      <TableCell align="center">
                        <Chip label={`v${device.version}`} size="small" variant="outlined" sx={{ fontSize: 11, height: 20 }} />
                      </TableCell>

                      {/* 5. Heartbeat */}
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {device.status === 'Online' && (
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: '#16A34A',
                                animation: 'pulse 2s infinite',
                                '@keyframes pulse': {
                                  '0%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(22, 163, 74, 0.7)' },
                                  '70%': { transform: 'scale(1)', boxShadow: '0 0 0 5px rgba(22, 163, 74, 0)' },
                                  '100%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(22, 163, 74, 0)' },
                                },
                              }}
                            />
                          )}
                          <Typography variant="caption" sx={{ color: device.status === 'Online' ? '#374151' : '#9CA3AF', fontWeight: device.status === 'Online' ? 500 : 400 }}>
                            {device.heartbeat}
                          </Typography>
                        </Box>
                      </TableCell>

                      {/* 6. CPU */}
                      <TableCell align="center" sx={{ minWidth: 100 }}>
                        {device.status === 'Online' ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                            <Box sx={{ width: '60px' }}>
                              <LinearProgress
                                variant="determinate"
                                value={device.cpu}
                                sx={{
                                  height: 6,
                                  borderRadius: 3,
                                  bgcolor: '#E5E7EB',
                                  '& .MuiLinearProgress-bar': {
                                    bgcolor: getCpuRamColor(device.cpu),
                                    borderRadius: 3,
                                  },
                                }}
                              />
                            </Box>
                            <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 24, textAlign: 'right', color: getCpuRamColor(device.cpu) }}>
                              {device.cpu}%
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#9CA3AF' }}>—</Typography>
                        )}
                      </TableCell>

                      {/* 7. RAM */}
                      <TableCell align="center" sx={{ minWidth: 100 }}>
                        {device.status === 'Online' ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                            <Box sx={{ width: '60px' }}>
                              <LinearProgress
                                variant="determinate"
                                value={device.ram}
                                sx={{
                                  height: 6,
                                  borderRadius: 3,
                                  bgcolor: '#E5E7EB',
                                  '& .MuiLinearProgress-bar': {
                                    bgcolor: getCpuRamColor(device.ram),
                                    borderRadius: 3,
                                  },
                                }}
                              />
                            </Box>
                            <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 24, textAlign: 'right', color: getCpuRamColor(device.ram) }}>
                              {device.ram}%
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#9CA3AF' }}>—</Typography>
                        )}
                      </TableCell>

                      {/* 8. Internet */}
                      <TableCell align="center">
                        {getInternetChip(device.internet)}
                      </TableCell>

                      {/* 9. Status */}
                      <TableCell>
                        {getStatusBadge(device.status)}
                      </TableCell>

                      {/* 10. Actions */}
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          <Tooltip title="Restart Polling">
                            <span>
                              <IconButton
                                size="small"
                                disabled={device.status !== 'Online'}
                                onClick={() => handleRestartPolling(device)}
                                sx={{ color: '#6B7280', '&:hover': { color: '#2563EB', bgcolor: 'rgba(37,99,235,0.04)' } }}
                              >
                                <Icon name="RefreshCw" size={18} />
                              </IconButton>
                            </span>
                          </Tooltip>

                          <Tooltip title="Reboot Gateway PC">
                            <span>
                              <IconButton
                                size="small"
                                disabled={device.status !== 'Online'}
                                onClick={() => handleRebootPC(device)}
                                sx={{ color: '#E59866', '&:hover': { color: '#D35400', bgcolor: 'rgba(211,84,0,0.04)' } }}
                              >
                                <Icon name="Power" size={18} />
                              </IconButton>
                            </span>
                          </Tooltip>

                          <Tooltip title={device.status === 'Locked' ? 'Unlock AMC Compliance' : 'Lock AMC Compliance'}>
                            <IconButton
                              size="small"
                              onClick={() => handleToggleLock(device)}
                              sx={{
                                color: device.status === 'Locked' ? '#DC2626' : '#9CA3AF',
                                '&:hover': {
                                  color: device.status === 'Locked' ? '#16A34A' : '#DC2626',
                                  bgcolor: device.status === 'Locked' ? 'rgba(22,163,74,0.04)' : 'rgba(220,38,38,0.04)',
                                },
                              }}
                            >
                              <Icon name="CalendarRange" size={18} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={processedData.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          sx={{ borderTop: 'none' }}
        />
      </SectionCard>

      {/* Snackbar feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%', borderRadius: 2 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
