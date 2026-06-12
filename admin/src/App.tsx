import React, { useState } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AppLayout from "@/components/AppLayout";
import DemoDashboard from "@/pages/DemoDashboard";
import Login from "@/pages/Login";

function AppContent() {
  const { session, isLoading } = useAuth();
  const [currentPath, setCurrentPath] = useState("dashboard");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-955/50 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
        <span className="text-xs text-slate-400 font-medium tracking-wide">
          Verifying authorization session...
        </span>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

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

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}