import React from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { cn } from "@/lib/utils";

export interface MapStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: "online" | "delay" | "offline" | "inactive" | string;
  address?: string;
  category?: string;
}

interface MapCardProps {
  title: string;
  stations: MapStation[];
  center?: [number, number];
  zoom?: number;
  height?: number | string;
}

// Custom animated SVG/HTML status markers
const createStatusMarkerIcon = (status: string) => {
  const normalizedStatus = (status || "").toLowerCase();

  const colors: Record<string, string> = {
    online: "#10b981", // emerald-500
    delay: "#f59e0b",  // amber-500
    offline: "#f43f5e", // rose-500
    inactive: "#94a3b8" // slate-400
  };

  const color = colors[normalizedStatus] || colors.inactive;

  return L.divIcon({
    className: "custom-status-marker-icon",
    html: `
      <div style="position: relative; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 20px; height: 20px; border-radius: 50%; background-color: ${color}; opacity: 0.35; ${normalizedStatus === "online" ? "animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;" : ""}"></div>
        <div style="position: absolute; width: 12px; height: 12px; border-radius: 50%; background-color: ${color}; border: 2.5px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.15);"></div>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
};

// Add standard pulsing keyframe animations via standard style injection
const styleTag = document.createElement("style");
styleTag.innerHTML = `
@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: scale(1.0); }
  50% { opacity: 0.15; transform: scale(1.5); }
}
`;
document.head.appendChild(styleTag);

export default function MapCard({
  title,
  stations,
  center = [17.385044, 78.486671], // Hyderabad default
  zoom = 10,
  height = 350
}: MapCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col hover:shadow-md hover:border-slate-300 transition-all select-none">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
        <h3 className="text-sm font-semibold text-slate-800 tracking-tight">{title}</h3>
        <span className="text-[10px] font-semibold text-slate-400">
          Mapping {stations.length} telemetry points
        </span>
      </div>

      <div
        className="relative border border-slate-100 rounded-lg overflow-hidden flex-1"
        style={{ height: typeof height === "number" ? `${height}px` : height }}
      >
        <MapContainer
          center={center}
          zoom={zoom}
          scrollWheelZoom={false}
          className="w-full h-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {stations.map((station) => (
            <Marker
              key={station.id}
              position={[station.latitude, station.longitude]}
              icon={createStatusMarkerIcon(station.status)}
            >
              <Popup className="custom-leaflet-popup">
                <div className="text-slate-800 font-sans p-1 min-w-[140px]">
                  <h4 className="font-bold text-xs leading-tight mb-1 text-slate-900">
                    {station.name}
                  </h4>
                  {station.category && (
                    <span className="inline-block text-[9px] font-bold uppercase text-slate-400 tracking-wide mb-2">
                      {station.category}
                    </span>
                  )}
                  {station.address && (
                    <p className="text-[10px] text-slate-500 leading-snug mb-2 font-medium">
                      {station.address}
                    </p>
                  )}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 mt-1.5 select-none">
                    <span className="text-[9px] font-bold text-slate-400">STATUS</span>
                    <span
                      className={cn(
                        "text-[9px] font-bold uppercase tracking-wider",
                        station.status === "online" && "text-emerald-500",
                        station.status === "delay" && "text-amber-500",
                        station.status === "offline" && "text-rose-500",
                        station.status === "inactive" && "text-slate-400"
                      )}
                    >
                      {station.status}
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
