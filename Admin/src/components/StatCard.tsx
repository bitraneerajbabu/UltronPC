import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  trend?: {
    value: string | number;
    direction: "up" | "down" | "neutral";
  };
  icon?: React.ComponentType<{ className?: string }>;
}

export default function StatCard({ title, value, subtext, trend, icon: Icon }: StatCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all select-none">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-slate-55/30 border border-slate-100 flex items-center justify-center text-slate-400">
            <Icon className="w-4.5 h-4.5" />
          </div>
        )}
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-2xl font-bold text-slate-900 tracking-tight">{value}</span>
        {trend && (
          <span
            className={cn(
              "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-wide",
              trend.direction === "up" && "bg-emerald-50 text-emerald-700 border-emerald-100",
              trend.direction === "down" && "bg-rose-50 text-rose-700 border-rose-100",
              trend.direction === "neutral" && "bg-slate-50 text-slate-500 border-slate-100"
            )}
          >
            {trend.direction === "up" && <TrendingUp size={11} className="mr-1 text-emerald-500" />}
            {trend.direction === "down" && <TrendingDown size={11} className="mr-1 text-rose-500" />}
            {trend.value}
          </span>
        )}
      </div>
      {subtext && <p className="text-[10px] text-slate-400 mt-2 font-medium">{subtext}</p>}
    </div>
  );
}
