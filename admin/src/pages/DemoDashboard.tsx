import React, { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Building,
  CheckCircle2,
  FileDown,
  Eye,
  MapPin,
  SlidersHorizontal,
  Radio
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import DataTable, { Column } from "@/components/DataTable";
import ChartCard from "@/components/ChartCard";
import MapCard, { MapStation } from "@/components/MapCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

// Mock Stations Data
const mockStations = [
  { id: "st-1", name: "Coal Stack Collector A", tenantName: "Apex Manufacturing Inc.", category: "Thermal Power Plants", location: "Sangareddy, TS", latitude: 17.6291, longitude: 78.1124, status: "online", lastSeen: "Just Now", amc: "2026-12-10", paramCount: 4 },
  { id: "st-2", name: "Distillery Effluent Monitor", tenantName: "Ganga Bio-fuels", category: "Distillery", location: "Patancheru, TS", latitude: 17.5324, longitude: 78.2618, status: "online", lastSeen: "2 mins ago", amc: "2027-01-15", paramCount: 3 },
  { id: "st-3", name: "CETP Inlet Station", tenantName: "Salicyates Chemicals", category: "CETP", location: "Medak, TS", latitude: 17.8421, longitude: 78.3619, status: "delay", lastSeen: "18 mins ago", amc: "2026-08-30", paramCount: 5 },
  { id: "st-4", name: "Sugar Plant Stack B", tenantName: "Deccan Sugar Mills", category: "Sugar", location: "Nizamabad, TS", latitude: 18.6724, longitude: 78.1021, status: "offline", lastSeen: "4 hours ago", amc: "2026-06-20", paramCount: 4 },
  { id: "st-5", name: "Chemical Process Outlet", tenantName: "Venkata Organics", category: "Chemicals", location: "Jeedimetla, TS", latitude: 17.5124, longitude: 78.4312, status: "online", lastSeen: "1 min ago", amc: "2026-10-05", paramCount: 6 },
  { id: "st-6", name: "Textile Effluent ETP", tenantName: "Deccan Weaves", category: "Textiles", location: "Pochampally, TS", latitude: 17.3421, longitude: 78.8124, status: "inactive", lastSeen: "3 days ago", amc: "2026-04-12", paramCount: 3 },
  { id: "st-7", name: "Pharma Unit 2 Scrubber", tenantName: "Auro Labs Ltd", category: "Pharmaceuticals", location: "Bollaram, TS", latitude: 17.5612, longitude: 78.3524, status: "online", lastSeen: "Just Now", amc: "2027-04-01", paramCount: 4 },
  { id: "st-8", name: "Iron Stack Emission A", tenantName: "Kakatiya Steels", category: "Iron & Steel", location: "Warangal, TS", latitude: 17.9754, longitude: 79.5982, status: "offline", lastSeen: "12 hours ago", amc: "2026-11-15", paramCount: 5 }
];

export default function DemoDashboard() {
  const [selectedStation, setSelectedStation] = useState<typeof mockStations[0] | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");

  const handleRowClick = (station: typeof mockStations[0]) => {
    setSelectedStation(station);
    setIsDetailOpen(true);
  };

  // Filter stations based on select dropdown
  const filteredStations = mockStations.filter((s) => {
    if (filterCategory === "all") return true;
    return s.category.toLowerCase().includes(filterCategory.toLowerCase()) || s.status === filterCategory;
  });

  // Convert mock data for Leaflet Map
  const mapPoints: MapStation[] = mockStations.map((s) => ({
    id: s.id,
    name: s.name,
    latitude: s.latitude,
    longitude: s.longitude,
    status: s.status,
    address: `${s.location} - ${s.tenantName}`,
    category: s.category
  }));

  // Chart data definitions
  const chartOptions: ApexCharts.ApexOptions = {
    chart: {
      type: "area",
      sparkline: { enabled: false }
    },
    stroke: { curve: "smooth", width: 2 },
    fill: {
      type: "gradient",
      gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05, stops: [0, 90, 100] }
    },
    xaxis: {
      categories: ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"],
      labels: { style: { colors: "#94a3b8" } }
    },
    yaxis: {
      labels: { style: { colors: "#94a3b8" } }
    },
    tooltip: { x: { show: true } }
  };

  const chartSeries = [
    { name: "Particulate Matter (PM)", data: [34, 45, 52, 68, 59, 41, 38] },
    { name: "SO2 Levels", data: [12, 18, 22, 31, 28, 19, 14] }
  ];

  const sectorChartOptions: ApexCharts.ApexOptions = {
    chart: { type: "donut" },
    labels: ["Pharmaceuticals", "CETP", "Chemicals", "Power Plants", "Distillery", "Others"],
    plotOptions: {
      pie: {
        donut: {
          size: "75%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "Industries",
              fontSize: "12px",
              fontWeight: "bold",
              color: "#64748b"
            }
          }
        }
      }
    }
  };

  const sectorSeries = [22, 14, 18, 12, 15, 19];

  // Columns for compliance grid DataTable
  const tableColumns: Column<typeof mockStations[0]>[] = [
    { key: "name", header: "Station Name", sortable: true },
    { key: "tenantName", header: "Industry / Company", sortable: true },
    { key: "category", header: "Sector Type", sortable: true },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />
    },
    { key: "lastSeen", header: "Last Active" },
    {
      key: "action",
      header: "Actions",
      render: (row) => (
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 border-slate-200 hover:bg-slate-50 flex items-center space-x-1"
          onClick={() => handleRowClick(row)}
        >
          <Eye size={12} />
          <span>Details</span>
        </Button>
      )
    }
  ];

  return (
    <>
      {/* ── Page Header ── */}
      <PageHeader
        title="Industrial Compliance Dashboard"
        description="Real-time stack emission, effluent telemetry, and CPCB diagnostic node control."
        actions={
          <>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-44 text-xs h-9 bg-white border-slate-200">
                <SlidersHorizontal size={14} className="text-slate-400 mr-2" />
                <SelectValue placeholder="Filter category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stations</SelectItem>
                <SelectItem value="online">Online Nodes</SelectItem>
                <SelectItem value="offline">Offline Nodes</SelectItem>
                <SelectItem value="delay">Alert Delay</SelectItem>
                <SelectItem value="Pharmaceuticals">Pharmaceuticals</SelectItem>
                <SelectItem value="Chemicals">Chemicals</SelectItem>
              </SelectContent>
            </Select>

            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-md text-xs h-9">
              <FileDown size={14} className="mr-1.5" /> Export PDF
            </Button>
          </>
        }
      />

      {/* ── KPI Stat Cards Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Stations"
          value={mockStations.length}
          subtext="Configured regulatory endpoints"
          icon={Radio}
          trend={{ value: "+2 new", direction: "up" }}
        />
        <StatCard
          title="Online Monitors"
          value={mockStations.filter((s) => s.status === "online").length}
          subtext="Active streaming nodes"
          icon={CheckCircle2}
          trend={{ value: "85% uptime", direction: "neutral" }}
        />
        <StatCard
          title="Limit Exceedances"
          value="3 Warnings"
          subtext="High threshold alerts past hour"
          icon={AlertTriangle}
          trend={{ value: "+1 rising", direction: "down" }}
        />
        <StatCard
          title="Monitored Sectors"
          value="12 Industry types"
          subtext="CPCB categorization scope"
          icon={Building}
          trend={{ value: "Active coverage", direction: "neutral" }}
        />
      </div>

      {/* ── Tabs View ── */}
      <Tabs defaultValue="map" className="w-full">
        <TabsList className="bg-slate-100 border border-slate-200 p-1 rounded-xl mb-6">
          <TabsTrigger value="map" className="rounded-lg text-xs font-semibold px-4 py-1.5">
            Geographic Mapping
          </TabsTrigger>
          <TabsTrigger value="grid" className="rounded-lg text-xs font-semibold px-4 py-1.5">
            Compliance Grid
          </TabsTrigger>
          <TabsTrigger value="analytics" className="rounded-lg text-xs font-semibold px-4 py-1.5">
            Diagnostic Trends
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Leaflet Map */}
        <TabsContent value="map" className="outline-none focus:ring-0">
          <MapCard
            title="Real-Time Station GPS Matrix"
            stations={filteredStations.map((s) => ({
              id: s.id,
              name: s.name,
              latitude: s.latitude,
              longitude: s.longitude,
              status: s.status,
              address: s.location,
              category: s.category
            }))}
            center={[17.55, 78.4]} // Focus near Hyderabad/Telangana clusters
            zoom={9}
            height={450}
          />
        </TabsContent>

        {/* Tab 2: Compliance Grid (DataTable) */}
        <TabsContent value="grid" className="outline-none focus:ring-0">
          <DataTable
            data={filteredStations}
            columns={tableColumns}
            searchKey="name"
            emptyMessage="No stations match the select filters."
            rowsPerPage={5}
          />
        </TabsContent>

        {/* Tab 3: Diagnostic Analytics */}
        <TabsContent value="analytics" className="outline-none focus:ring-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ChartCard
                title="Telemetry Aggregates (24-Hour Timeline)"
                subtitle="Standardized stack parameter exceedance limit threshold comparison"
                type="area"
                options={chartOptions}
                series={chartSeries}
                height={300}
              />
            </div>
            <div>
              <ChartCard
                title="Industry Categories Breakdown"
                subtitle="Compliance distribution by sector"
                type="donut"
                options={sectorChartOptions}
                series={sectorSeries}
                height={300}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Dialog Details Modal ── */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[480px] bg-white rounded-xl shadow-xl border border-slate-200">
          <DialogHeader className="border-b border-slate-100 pb-4">
            <DialogTitle className="text-slate-900 font-bold text-sm tracking-wide">
              Station Telemetry Diagnosis
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Technical specifications and compliance log details.
            </DialogDescription>
          </DialogHeader>

          {selectedStation && (
            <div className="space-y-4 pt-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400 block font-semibold text-[10px] uppercase tracking-wider">
                    Station Name
                  </span>
                  <span className="text-slate-700 font-bold block mt-1">{selectedStation.name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold text-[10px] uppercase tracking-wider">
                    Regulatory ID
                  </span>
                  <span className="text-slate-700 font-bold block mt-1">{selectedStation.id.toUpperCase()}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400 block font-semibold text-[10px] uppercase tracking-wider">
                    Company
                  </span>
                  <span className="text-slate-700 font-bold block mt-1">{selectedStation.tenantName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold text-[10px] uppercase tracking-wider">
                    Category Sector
                  </span>
                  <span className="text-slate-700 font-bold block mt-1">{selectedStation.category}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400 block font-semibold text-[10px] uppercase tracking-wider">
                    Coordinates
                  </span>
                  <span className="text-slate-500 font-medium block mt-1 flex items-center space-x-1">
                    <MapPin size={11} className="text-slate-400" />
                    <span>{selectedStation.latitude}, {selectedStation.longitude}</span>
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold text-[10px] uppercase tracking-wider">
                    AMC Expiration
                  </span>
                  <span className="text-slate-700 font-semibold block mt-1">{selectedStation.amc}</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 flex items-center justify-between bg-slate-55/10 -mx-6 -mb-6 p-4 rounded-b-xl border-t">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider">
                    Device Status:
                  </span>
                  <StatusBadge status={selectedStation.status} />
                </div>
                <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setIsDetailOpen(false)}>
                  Close Portal
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
