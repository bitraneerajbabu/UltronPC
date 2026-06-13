import React from "react";
import Chart from "react-apexcharts";
import { Props as ApexChartProps } from "react-apexcharts";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  options: ApexChartProps["options"];
  series: ApexChartProps["series"];
  type: ApexChartProps["type"];
  height?: number | string;
  actions?: React.ReactNode;
}

export default function ChartCard({
  title,
  subtitle,
  options,
  series,
  type,
  height = 300,
  actions
}: ChartCardProps) {
  const defaultChartConfig = {
    toolbar: { show: false },
    fontFamily: "Inter, sans-serif",
    background: "transparent",
    ...options?.chart
  };

  const mergedOptions: ApexChartProps["options"] = {
    ...options,
    chart: defaultChartConfig,
    colors: options?.colors || ["#6366f1", "#0ea5e9", "#f59e0b", "#e11d48", "#10b981", "#64748b"],
    grid: {
      borderColor: "#f1f5f9",
      strokeDashArray: 4,
      ...options?.grid
    },
    legend: {
      position: "bottom",
      fontSize: "11px",
      fontFamily: "Inter, sans-serif",
      labels: { colors: "#64748b" },
      markers: { size: 6 },
      itemMargin: { horizontal: 10, vertical: 5 },
      ...options?.legend
    },
    tooltip: {
      theme: "light",
      style: { fontSize: "12px", fontFamily: "Inter, sans-serif" },
      ...options?.tooltip
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col hover:shadow-md hover:border-slate-300 transition-all select-none">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 tracking-tight">{title}</h3>
          {subtitle && <p className="text-[10px] text-slate-400 mt-0.5 font-medium">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center space-x-2 shrink-0">{actions}</div>}
      </div>
      <div className="mt-4 flex-1 min-h-[220px]">
        <Chart
          options={mergedOptions}
          series={series}
          type={type}
          height={height}
          width="100%"
        />
      </div>
    </div>
  );
}
