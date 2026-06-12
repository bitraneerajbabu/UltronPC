import React from "react";
import { cn } from "@/lib/utils";

export type StatusType = "online" | "delay" | "offline" | "inactive";

interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
}

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const normalizedStatus = (status || "").toLowerCase() as StatusType;

  const statusStyles: Record<StatusType, string> = {
    online: "bg-emerald-50 text-emerald-700 border-emerald-200",
    delay: "bg-amber-50 text-amber-700 border-amber-200",
    offline: "bg-rose-50 text-rose-700 border-rose-200",
    inactive: "bg-slate-50 text-slate-600 border-slate-200"
  };

  const dotStyles: Record<StatusType, string> = {
    online: "bg-emerald-500",
    delay: "bg-amber-500",
    offline: "bg-rose-500",
    inactive: "bg-slate-400"
  };

  const badgeStyle = statusStyles[normalizedStatus] || statusStyles.inactive;
  const dotStyle = dotStyles[normalizedStatus] || dotStyles.inactive;
  const displayLabel = label || normalizedStatus.toUpperCase();

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border transition-all select-none tracking-wider shrink-0",
        badgeStyle
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5 shrink-0", dotStyle)} />
      {displayLabel}
    </span>
  );
}
