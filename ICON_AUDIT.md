# ICON_AUDIT.md

This audit document logs the modernization of the icon system in **RajAPI**. Every icon has been replaced using a single reusable `<Icon>` wrapper component that dynamically loads outline icons from **Lucide React**. No emojis, cartoon icons, or mixed filled/outline icons are used.

## Icon Sizing Standards
- **Navigation icons:** 22px
- **Cards:** 26px
- **Buttons:** 20px
- **Table actions:** 18px
- **Dialogs:** 20px

---

## Icon Replacement Audit

| Old Icon | New Icon | Size | File Modified | Role / Context |
| :--- | :--- | :--- | :--- | :--- |
| `LayoutDashboard` | `LayoutDashboard` | 22px | [Sidebar.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Sidebar.tsx) | Navigation: Dashboard |
| `Radio` | `Radio` | 22px | [Sidebar.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Sidebar.tsx) | Navigation: Live Monitoring |
| `Activity` | `Network` | 22px | [Sidebar.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Sidebar.tsx) | Navigation: Fleet Monitoring |
| `Building2` | `Factory` | 22px | [Sidebar.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Sidebar.tsx) | Navigation: Plants |
| `Bell` | `BellRing` | 22px | [Sidebar.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Sidebar.tsx) | Navigation: Notifications |
| `Settings` | `Sliders` | 22px | [Sidebar.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Sidebar.tsx) | Navigation: Configuration |
| `MessageSquare` | `Megaphone` | 22px | [Sidebar.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Sidebar.tsx) | Navigation: Broadcast Center |
| `ShieldCheck` | `CalendarRange` | 22px | [Sidebar.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Sidebar.tsx) | Navigation: AMC Management |
| `ClipboardList` | `History` | 22px | [Sidebar.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Sidebar.tsx) | Navigation: Audit Logs |
| `Settings` | `Settings` | 22px | [Sidebar.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Sidebar.tsx) | Navigation: Settings |
| `LogOut` | `LogOut` | 22px | [Sidebar.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Sidebar.tsx) | Sidebar: Logout |
| `Sun` | `Sun` | 20px | [Header.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Header.tsx) | Header: Dark Mode Toggle |
| `Moon` | `Moon` | 20px | [Header.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Header.tsx) | Header: Dark Mode Toggle |
| `Bell` | `Bell` | 20px | [Header.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Header.tsx) | Header: Notifications Icon |
| `User` | `User` | 18px | [Header.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Header.tsx) | Header: User Avatar |
| `LogOut` | `LogOut` | 18px | [Header.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Layout/Header.tsx) | Header: Logout |
| `Search` | `Search` | 18px | [SearchBar.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Common/SearchBar.tsx) | Search Bar: Input Adornment |
| `Circle` (filled) | `Wifi` / `WifiOff` / `CheckCircle2` / `AlertTriangle` / `AlertOctagon` / `Lock` / `Unlock` / `Clock` / `HelpCircle` (outlines) | 12px / 14px | [StatusBadge.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Common/StatusBadge.tsx) | Common Status Chip: Status Icons |
| `Inbox` | `Inbox` | 56px | [EmptyState.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Common/EmptyState.tsx) | Empty State: Illustration |
| `Building2` | `Factory` | 26px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Card: Total Plants KPI |
| `Wifi` | `Wifi` | 26px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Card: Online Plants KPI |
| `WifiOff` | `WifiOff` | 26px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Card: Offline Plants KPI |
| `AlertTriangle` | `AlertTriangle` | 26px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Card: Critical Alerts KPI |
| `Bell` | `BellRing` | 26px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Card: Notifications KPI |
| `CalendarClock` | `CalendarRange` | 26px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Card: AMC Expiring KPI |
| `Building2` | `Factory` | 56px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Empty State: No Plants |
| `AlertTriangle` | `AlertTriangle` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Table: Site Sync Error Indicator |
| `RefreshCw` | `RefreshCw` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Table Action: Save Expiry / Retry |
| `X` | `X` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Table Action: Cancel Expiry Edit |
| `CalendarClock` | `CalendarRange` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Table Action: Edit AMC Expiry |
| `Power` | `Power` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Table Action: Deactivate/Activate Plant |
| `RotateCcw` | `RotateCcw` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Table Action: Renew AMC |
| `Edit` | `Pencil` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Table Action: Edit Plant Details |
| `Trash2` | `Trash2` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Table Action: Delete Plant |
| `RefreshCw` | `RefreshCw` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Live Data Panel Action: Restart Polling |
| `X` | `X` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Live Data Panel Action: Close |
| `Radio` | `Radio` | 56px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Empty State: Live Panel No Telemetry |
| `Copy` | `Copy` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Table Action: Copy Device API Key |
| `RefreshCw` | `RefreshCw` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Table Action: Regenerate Device API Key |
| `Edit` | `Pencil` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Table Action: Rename Device |
| `Trash2` | `Trash2` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Table Action: Delete Device |
| `Plus` | `Plus` | 20px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Button: Add Device |
| `Radio` | `Radio` | 56px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Empty State: Live Panel Select Plant |
| `MessageSquare` | `Megaphone` | 20px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Button: New Broadcast |
| `MessageSquare` | `Megaphone` | 56px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Empty State: Broadcasts List |
| `Activity` | `Activity` | 18px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Chip Indicator: Remote Commands Header |
| `Building2` | `Factory` | 56px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Empty State: Remote Commands No Plants |
| `RefreshCw` | `RefreshCw` | 20px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Button: Restart Polling Command |
| `Power` | `Power` | 20px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Button: Reboot PC Command |
| `AlertTriangle` | `AlertTriangle` | 20px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Button: Factory Reset Command |
| `ShieldCheck` | `CalendarRange` | 56px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Empty State: AMC Management |
| `BarChart3` | `FileBarChart2` | 56px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Empty State: CPCB Dashboard |
| `SkipBack` | `SkipBack` | 20px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Button: Back to Audit Site Summary |
| `ClipboardList` | `History` | 56px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Empty State: Audit Logs |
| `Bell` | `BellRing` | 56px | [App.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/App.tsx) | Empty State: Notifications |
| `Building2` | `Factory` | 26px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Card: Total Fleet KPI |
| `Wifi` | `Wifi` | 26px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Card: Online Fleet KPI |
| `WifiOff` | `WifiOff` | 26px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Card: Offline Fleet KPI |
| `ShieldCheck` | `CalendarRange` | 26px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Card: AMC Locked KPI |
| `AlertTriangle` | `AlertTriangle` | 26px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Card: High Load Warnings KPI |
| `X` | `X` | 20px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Button: Clear Filters |
| `Search` | `Search` | 18px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Table Search Input Adornment |
| `X` | `X` | 18px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Search Clear Button |
| `AlertTriangle` | `AlertTriangle` | 48px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Empty State: Fleet Table |
| `Wifi` | `Wifi` | 18px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Chip Indicator: Good Internet Status |
| `Wifi` | `Wifi` | 18px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Chip Indicator: Poor Internet Status |
| `WifiOff` | `WifiOff` | 18px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Chip Indicator: Disconnected Internet Status |
| `RefreshCw` | `RefreshCw` | 18px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Table Action: Restart Polling |
| `Power` | `Power` | 18px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Table Action: Reboot Gateway PC |
| `ShieldCheck` | `CalendarRange` | 18px | [FleetMonitoring.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/FleetMonitoring.tsx) | Table Action: Lock/Unlock AMC Compliance |
| `Unlock` | `Unlock` | 20px | [LockDialog.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Dialogs/LockDialog.tsx) | Dialog Header / Alert: Unlock Plant |
| `Lock` | `Lock` | 20px | [LockDialog.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Dialogs/LockDialog.tsx) | Dialog Header / Alert: Lock Plant |
| `Pencil` | `Pencil` | 20px | [EditSiteDialog.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Dialogs/EditSiteDialog.tsx) | Dialog Header: Edit Plant |
| `Building2` | `Factory` | 20px | [CreateSiteDialog.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Dialogs/CreateSiteDialog.tsx) | Dialog Header: Register Plant |
| `MessageSquare` | `Megaphone` | 20px | [BroadcastDialog.tsx](file:///c:/Users/sunsh/OneDrive/Music/UltrON/server/frontend/src/components/Dialogs/BroadcastDialog.tsx) | Dialog Header: Broadcast Dialog |
