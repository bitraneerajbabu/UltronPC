import React, { useState } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AppLayout from "@/components/AppLayout";
import DemoDashboard from "@/pages/DemoDashboard";
import Login from "@/pages/Login";
import Settings from "@/pages/Settings";
import DeviceConfig from "@/pages/DeviceConfig";
import ServerConfig from "@/pages/ServerConfig";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null; errorInfo: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-slate-900 text-slate-100 min-h-screen font-sans">
          <h1 className="text-xl font-bold text-rose-500">Render Crash Caught</h1>
          <p className="text-sm text-slate-300 mt-2 font-mono">
            {this.state.error?.toString()}
          </p>
          {this.state.errorInfo && (
            <pre className="mt-4 p-4 bg-slate-950 rounded text-xs overflow-auto max-h-[70vh]">
              {this.state.errorInfo.componentStack}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-indigo-600 rounded text-sm hover:bg-indigo-500 font-medium"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

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
      ) : currentPath === "device-config" ? (
        <DeviceConfig />
      ) : currentPath === "server-config" ? (
        <ServerConfig />
      ) : currentPath === "settings" ? (
        <Settings />
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
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </AuthProvider>
  );
}