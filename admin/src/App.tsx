import React, { useState } from "react";
import AppLayout from "@/components/AppLayout";
import DemoDashboard from "@/pages/DemoDashboard";

export default function App() {
  const [currentPath, setCurrentPath] = useState("dashboard");

  return (
    <AppLayout activePath={currentPath} onNavigate={setCurrentPath}>
      {currentPath === "dashboard" ? (
        <DemoDashboard />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-lg mx-auto shadow-sm select-none">
          <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
            Module Under Construction
          </h2>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            The "{currentPath.toUpperCase()}" module has its design system and parameters configured. 
            Real data integration is scheduled for the next phase.
          </p>
        </div>
      )}
    </AppLayout>
  );
}