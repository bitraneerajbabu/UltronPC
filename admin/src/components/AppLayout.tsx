import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Building2,
  Radio,
  Activity,
  Video,
  FileBarChart,
  Wrench,
  Users,
  Settings,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Bell,
  Clock,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

interface AppLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  onNavigate?: (path: string) => void;
}

interface NavItem {
  name: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  path: string;
}

const navItems: NavItem[] = [
  { name: "Dashboard", icon: LayoutDashboard, path: "dashboard" },
  { name: "Industries", icon: Building2, path: "industries" },
  { name: "Stations", icon: Radio, path: "stations" },
  { name: "Parameters", icon: Activity, path: "parameters" },
  { name: "Cameras", icon: Video, path: "cameras" },
  { name: "Reports", icon: FileBarChart, path: "reports" },
  { name: "Service", icon: Wrench, path: "service" },
  { name: "Users", icon: Users, path: "users" },
  { name: "Settings", icon: Settings, path: "settings" }
];

export default function AppLayout({ children, activePath = "dashboard", onNavigate }: AppLayoutProps) {
  const { profile, user, signOut } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  const handleNavClick = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    }
    setIsMobileOpen(false);
  };

  // Filter sidebar tabs depending on user role scopes
  const visibleNavItems = navItems.filter((item) => {
    if (profile?.role === "operator" && (item.path === "users" || item.path === "settings")) {
      return false;
    }
    return true;
  });

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name.substring(0, 2).toUpperCase();
    }
    return (user?.email || "U").substring(0, 2).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* ── Desktop Sidebar ── */}
      <aside
        className={cn(
          "bg-slate-900 text-slate-100 hidden md:flex flex-col border-r border-slate-800 transition-all duration-300 relative z-20",
          isCollapsed ? "w-20" : "w-64"
        )}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
          {!isCollapsed && (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-md">
                U
              </div>
              <span className="font-semibold text-lg tracking-wider text-white">
                UltrON <span className="text-xs text-indigo-400 font-normal">v1.0</span>
              </span>
            </div>
          )}
          {isCollapsed && (
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white mx-auto shadow-md">
              U
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute -right-3 top-5 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-all shadow-md"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const isActive = activePath === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                className={cn(
                  "w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                  isActive
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
                )}
              >
                <Icon className={cn("shrink-0", isCollapsed ? "mx-auto" : "")} size={18} />
                {!isCollapsed && <span>{item.name}</span>}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 font-semibold shadow-inner shrink-0 text-xs select-none">
              {getInitials().substring(0, 1)}
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-slate-200 truncate">
                  {profile?.full_name || user?.email?.split("@")[0] || "Administrator"}
                </p>
                <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <button
              onClick={signOut}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-100 hover:bg-slate-800 transition-all ml-1.5"
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </aside>

      {/* ── Mobile Sidebar Drawer ── */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
          />
          <aside className="relative flex flex-col w-64 bg-slate-900 text-slate-100 z-50">
            <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-md">
                  U
                </div>
                <span className="font-semibold text-lg tracking-wider text-white">UltrON</span>
              </div>
              <button
                onClick={() => setIsMobileOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {visibleNavItems.map((item) => {
                const isActive = activePath === item.path;
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNavClick(item.path)}
                    className={cn(
                      "w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                      isActive
                        ? "bg-indigo-600 text-white shadow-md"
                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
                    )}
                  >
                    <Icon size={18} />
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-indigo-400 font-semibold text-xs">
                  {getInitials().substring(0, 1)}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200 truncate">
                    {profile?.full_name || "Admin"}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
                </div>
              </div>
              <button
                onClick={signOut}
                className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800"
              >
                <LogOut size={16} />
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Frame ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 relative z-10">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setIsMobileOpen(true)}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
            >
              <Menu size={22} />
            </button>
            
            {/* Search Box */}
            <div className="relative max-w-xs hidden sm:block">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search stations or indices..."
                className="pl-9 pr-4 py-1.5 w-64 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Right widgets */}
          <div className="flex items-center space-x-6">
            {/* Live Clock & Date */}
            <div className="flex items-center space-x-3 text-slate-500 text-xs hidden lg:flex border-r border-slate-200 pr-6">
              <Clock size={14} className="text-slate-400" />
              <div className="text-right select-none">
                <span className="font-medium text-slate-700">{formatTime(time)}</span>
                <span className="mx-1.5 text-slate-300">|</span>
                <span className="text-slate-500 text-[10px]">{formatDate(time)}</span>
              </div>
            </div>

            {/* Notification Badge */}
            <button className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 relative transition-all">
              <Bell size={18} />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
            </button>

            {/* User Details */}
            <div className="flex items-center space-x-3 border-l border-slate-200 pl-6 h-8">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-xs shadow-sm select-none">
                  {getInitials()}
                </div>
                <div className="hidden sm:block text-left leading-none">
                  <span className="text-xs font-semibold text-slate-700 block">
                    {profile?.full_name || "System Admin"}
                  </span>
                  <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider mt-0.5">
                    {profile?.role?.replace("_", " ") || "USER"}
                  </span>
                </div>
              </div>
              <button
                onClick={signOut}
                title="Sign Out"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all md:hidden"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable View Content */}
        <main className="flex-1 overflow-y-auto p-8 relative z-0">
          <div className="max-w-7xl mx-auto space-y-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
