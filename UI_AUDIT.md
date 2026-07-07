# RajAPI Fleet Dashboard — UI Audit

**Date:** 2026-07-04
**Frontend:** Single-file SPA at `/var/www/rajapi/index.html` (~380 lines inline, no framework)

---

## Screen 1: Login Page

### Screen Name
Login / Authentication

### Purpose
Authenticate the admin user before granting access to the fleet management dashboard.

### Components
| Component | Type | Implementation |
|---|---|---|
| Brand header | Text | `<h1>RajAPI</h1> + <p>Fleet Management Dashboard</p>` |
| Username input | `<input type="text">` | `#username`, autocomplete=username |
| Password input | `<input type="password">` | `#password`, autocomplete=current-password |
| Submit button | `<button>` | Calls `login()` on click |
| Error message | `<div>` | `#loginError`, red text, hidden by default |

### Problems
1. **No loading state** — Button stays active during login POST. Double-click sends duplicate requests.
2. **No password visibility toggle** — No show/hide eye icon for password field.
3. **No keyboard submit on Enter** — Enter key works natively for inputs inside a form, but there is no `<form>` element wrapping the inputs. Relying solely `onclick` handler.
4. **Error message is plain text** — No icon, no animation, just red text that appears instantly.
5. **No password strength indicator** — Displaying one would signal quality expectations.
6. **Page title is static** — `<title>RajAPI Fleet Dashboard</title>` doesn't change between login and app states.
7. **Hardcoded credential hints** — Placeholder text says "Username" and "Password" but gives no hint about default credentials.

### UX Issues
- No "Remember me" checkbox.
- No "Forgot password" flow (there is no password reset mechanism anywhere).
- On failed login, the inputs keep their values — user must manually clear.
- No visual feedback that the login attempt is in progress (no spinner, no button text change).
- The login card has no subtle shadow animation or transition on load.

### Mobile Issues
- Card width is fixed `360px` — on screens smaller than 400px, the card overflows horizontally.
- No `input[type="password"]` invokes the wrong keyboard on iOS (no "Go" action).
- Tap targets are adequately sized (`.75rem padding`), but no `touch-action: manipulation` to eliminate 300ms delay.
- Viewport meta tag is correct but no safe-area-inset padding for notched devices.

### Missing Features
- Session timeout indicator (re-login when token expires).
- Multi-factor authentication support.
- Account lockout display after N failed attempts.
- Last login timestamp display.
- Demo/guest login mode for presentations.

### Reusable Components
- The login card layout (centered card, dark backdrop) could be a generic `AuthCard` component.
- The input + label pattern could be a `FormField` component.
- The `login()` AJAX pattern could be a `useAuth` hook in a framework.

---

## Screen 2: Dashboard — Stats Bar

### Screen Name
Fleet Overview / Stats Bar

### Purpose
Show aggregate fleet health metrics at a glance: total gateways, online count, offline count.

### Components
| Component | Type | Implementation |
|---|---|---|
| Total stat card | `<div>.stat-card.total` | Big number + "Total Gateways" label |
| Online stat card | `<div>.stat-card.online` | Big number + "Online" label, green text |
| Offline stat card | `<div>.stat-card.offline` | Big number + "Offline" label, red text |

### Problems
1. **Hardcoded 3-column grid** — `grid-template-columns: repeat(3, 1fr)`. Adding a fourth stat (e.g., "Alerts") breaks the layout.
2. **No stat card skeleton** — Before data loads, all three show "0" values, flashing from 0 → actual.
3. **No trend indicators** — No up/down arrows showing whether counts changed since last poll.
4. **No color-blind safe palette** — Green/red alone distinguish online/offline. Should add icons or labels.
5. **Numbers have no animation** — Value jumps instantly rather than counting up.

### UX Issues
- Stats are purely numeric — no visual graph or donut chart for fleet health.
- Offline count is calculated client-side as `total - online`, but the API already computes it.
- No tooltip explaining what "offline" means (>90s since last heartbeat).
- The stat cards are not clickable — user can't tap "Online" to filter the gateways table below.

### Mobile Issues
- On `< 768px`, grid collapses to single column via media query — fine but loses the overview-at-a-glance value.
- Stat values (`font-size: 2rem`) are large enough but the gap (`1rem`) is generous on small screens.

### Missing Features
- Fleet health score (percentage online, computed automatically).
- Gateway count breakdown (active vs inactive).
- Average CPU/RAM/Disk across fleet.
- Last-updated timestamp ("Stats as of 12:34:56").
- Alert/warning count badge.

### Reusable Components
- `StatCard` — number + label + color variant (total/online/offline).
- Could be extended to support icons, trends, click handlers.

---

## Screen 3: Dashboard — Gateways Tab

### Screen Name
Gateways List

### Purpose
Display all registered gateways in a sortable, filterable table with real-time status indicators.

### Components
| Component | Type | Implementation |
|---|---|---|
| Tab bar | `<div>.tabs > .tab` | Gateways / Commands / Broadcasts |
| Filter input | `<input type="text">` | `#filterInput`, filters by gateway_id and plant_name |
| Refresh button | `<button>` | Calls `loadGateways()` |
| Gateway table | `<table>` | 10 columns: Gateway, Plant, Location, Status, Version, CPU, RAM, Disk, Internet, Last Heartbeat |
| Status badge | `<span>.status-badge` | Online (green), Offline (red), rendered inline |
| Empty state | `<div>.empty-state` | "No gateways registered" |
| Pagination | None | All gateways rendered in one table |

### Problems
1. **No pagination** — All gateways fetched and rendered in a single `<tbody>`. Past ~50 gateways the page becomes unresponsive.
2. **Filter is client-side only** — Every 15 seconds the full list is fetched and re-filtered in JS. Scale issue: filtering 1000 rows in the browser.
3. **No sorting** — Table headers are not clickable. No sort by status, name, last heartbeat, etc.
4. **No column visibility control** — 10 columns on a narrow screen create horizontal scroll hell.
5. **Status badge logic is duplicated** — Exact same `isOnline` calculation in `renderGateways()` and `showGateway()`.
6. **No visual distinction for stale data** — A gateway that hasn't checked in for 24h shows the same "Offline" badge as one that missed a single heartbeat.
7. **No row selection** — Cannot select multiple gateways for bulk operations.
8. **No keyboard navigation** — Table rows are not focusable, cannot navigate with arrow keys.

### UX Issues
- 10 columns is overwhelming. Information density is too high for a quick scan.
- The gateway name is a clickable link but the affordance is weak (just a color change, no underline by default).
- "Last Heartbeat" shows never as "Never" but still calls `toLocaleString()` — this actually works because `new Date(null)` returns epoch, but displays "1/1/1970". **This is a bug.**
- No color-coding for CPU/RAM/Disk values (e.g., red when > 90%).
- The filter input has no placeholder hint about which fields are searchable.
- Modal that opens on gateway click has no transition/animation.

### Mobile Issues
- 10-column table is completely unusable on mobile without horizontal scroll.
- No responsive table variant (card layout on small screens).
- Filter input is full width on mobile (fine) but the refresh button sits beside it awkwardly.
- Status badges are small (`.2rem .6rem padding`) — hard to tap on touch.

### Missing Features
- Gateway health indicator (last heartbeat age color: green < 2min, yellow < 10min, red > 10min, gray > 1hr).
- Quick actions per row (reboot, send command, view logs).
- Bulk select + bulk command dispatch.
- Column chooser to hide/arrange columns.
- Export to CSV/Excel.
- Gateway grouping by location, plant name, or custom tags.
- Real-time updates via WebSocket instead of polling.

### Reusable Components
- `DataTable` — sortable, filterable, paginated table.
- `StatusBadge` — color-coded pill with icon.
- `FilterBar` — search input + action buttons.
- `Pagination` — page controls.

---

## Screen 4: Dashboard — Commands Tab

### Screen Name
Command Dispatch & History

### Purpose
Dispatch remote commands to individual gateways and view the command execution history.

### Components
| Component | Type | Implementation |
|---|---|---|
| Gateway selector | `<select>` | `#cmdGateway`, populated dynamically from gateways list |
| Command type dropdown | `<select>` | `#cmdType`, 8 command options |
| Payload input | `<input type="text">` | `#cmdPayload`, expects JSON |
| Send button | `<button>` | Calls `dispatchCommand()` |
| Command history list | `#commandList` | `.command-card` items showing type, target, timestamp, status |
| Empty state | `<div>.empty-state` | "No commands yet" |

### Problems
1. **HARDCODED GATEWAY ID** — `loadCommands()` fetches `/api/v1/commands/history/ULTRON-IND-000001`. This means the command history panel ALWAYS shows commands for only one gateway, regardless of what's selected in the dispatch dropdown.
2. **No command status polling** — After dispatching, the list refreshes once. No real-time status update showing "delivered" → "executed".
3. **Payload JSON validation is weak** — Uses `JSON.parse(payloadStr)` but shows a generic "Invalid JSON payload" error with no specifics about the syntax error.
4. **No command templates** — User must know the exact JSON structure for `show_toast`, `restart_app`, etc. No template buttons.
5. **No command cancellation** — Once dispatched, there's no UI to cancel a pending command.
6. **No confirmation dialog** — Dispatches immediately without "Are you sure?" for destructive commands like `factory_reset` or `restart_app`.
7. **History shows all statuses** — No filter to show only pending/executed/failed.
8. **No command scheduling UI** — `expires_in_minutes` is hardcoded to 60.

### UX Issues
- The gateway selector lists all gateways but the command history always shows ULTRON-IND-000001 — very confusing.
- Command type names (`enable_cpcb`, `disable_cpcb`) are jargon. No tooltip explaining what each does.
- The payload input placeholder `{"message":"Hello"}` is only relevant for `show_toast`. Other commands have different payload structures.
- No visual indication of which commands are destructive (factory_reset, restart_app).
- Command history is ordered newest-first but there's no timestamp filter.

### Mobile Issues
- The action bar wraps on mobile (flex-wrap), but the send button sits below the payload input, not beside it.
- The gateway selector is narrow — on mobile the option text truncates.
- Command cards have `justify-content: space-between` — the status badge may be far from the command info on wide screens.

### Missing Features
- Command type-specific forms (e.g., a message input + severity selector for `show_toast`).
- Bulk command dispatch (send same command to multiple gateways).
- Command execution result viewer (stdout/exit code from the client).
- Scheduled/delayed commands.
- Command history search by type, date range, or gateway.
- Re-dispatch button for failed commands.
- Undo/reset command for destructive operations.

### Reusable Components
- `CommandForm` — dynamic form that changes based on command type selection.
- `CommandCard` — status indicator + type icon + timestamp + payload preview.
- `ConfirmDialog` — "Are you sure?" modal for destructive actions.

---

## Screen 5: Dashboard — Broadcasts Tab

### Screen Name
Broadcast Management

### Purpose
Create and view global or gateway-targeted broadcast messages displayed on UltrON clients.

### Components
| Component | Type | Implementation |
|---|---|---|
| Message textarea | `<textarea>` | `#bcMsg`, multiline input |
| Severity dropdown | `<select>` | `#bcSeverity`, info/warn/critical |
| Expiry input | `<input type="number">` | `#bcExpires`, minutes (default 1440 = 24h) |
| Send button | `<button>` | Calls `createBroadcast()` |
| Active broadcasts list | `#broadcastList` | `.broadcast-card` items |
| Empty state | `<div>.empty-state` | "No active broadcasts" |

### Problems
1. **No gateway target selector** — The API supports `gateway_ids` (array of specific gateways), but the UI always sends to ALL gateways.
2. **No broadcast preview** — Before sending, the user can't see how the broadcast will look on the client (severity color, message formatting).
3. **Expiry input is unbounded** — No max validation. User could set 1000000 minutes.
4. **No broadcast editing** — Once sent, cannot edit or extend the expiry. Must delete and re-send.
5. **No broadcast deletion UI** — The API has no DELETE endpoint, but the frontend can't even soft-delete (set `is_active=false`).
6. **Severity is a dropdown but has no color preview** — The option text is the same color regardless of severity.
7. **No character count** — No limit or counter on the message textarea.

### UX Issues
- "Active Broadcasts" list shows broadcasts from the server, but there's no way to expire/deactivate them from the UI.
- Broadcast card severity uses left border color only — color-blind users can't distinguish critical/warn/info.
- The expiry field label is not clear — "Expires (min)" is terse. No indication of what the default (1440) means in human time ("24 hours").
- Broadcast creation form and active broadcasts list are in the same panel — scrolling past sent broadcasts to create a new one is annoying when the list is long.

### Mobile Issues
- Textarea width is controlled by flex — on mobile it's full width, but the severity dropdown and expiry input sit beside it awkwardly.
- Broadcast cards have `gap: 1rem` in meta — on very small screens, the meta row wraps poorly.

### Missing Features
- Targeted broadcast selector (choose specific gateways).
- Broadcast template/saved messages.
- Broadcast history (expired/inactive broadcasts).
- Message formatting (bold, links, multi-line rendering).
- Broadcast read receipts (did clients acknowledge the broadcast?).
- Scheduled broadcasts (send at a future time).

### Reusable Components
- `SeverityBadge` — color-coded severity indicator (reused pattern from StatusBadge).
- `BroadcastCard` — message + severity + timestamp + target + expiry.
- `ExpiryPicker` — preset buttons (1hr, 6hr, 24hr, 7d) instead of raw number input.

---

## Screen 6: Gateway Detail Modal

### Screen Name
Gateway Detail / Modal

### Purpose
Show full details and current status of a single gateway in an overlay modal.

### Components
| Component | Type | Implementation |
|---|---|---|
| Modal overlay | `<div>.modal` | Fixed position, dark semi-transparent backdrop |
| Close button | `<span>.close` | "&times;" HTML entity |
| Title | `<h2>` | `#modalTitle` — "gateway_id — plant_name" |
| Detail rows | `<div>.detail-row` | Key-value rows: Status, Gateway ID, Plant, Location, Version, Host, CPU/RAM/Disk, Internet, VPN, Last Heartbeat, Active, Registered |

### Problems
1. **No heartbeat history** — The detail view only shows current status. The API has `/gateways/:id/history` but the modal doesn't use it — no chart or table of recent heartbeats.
2. **No quick actions** — Can't send a command or broadcast directly from the gateway detail. Must go to Commands tab and select gateway from dropdown.
3. **Modal doesn't refresh** — Once opened, the data is static. If the gateway comes back online while the modal is open, it won't update.
4. **No loading state** — Data loaded via `await api(...)` shows a blank modal body while fetching. Should show a spinner.
5. **No error state** — If the API fails, the modal body stays empty. No "Failed to load gateway detail" message.
6. **No keyboard dismissal** — Escape key should close the modal but doesn't.
7. **No backdrop click to close** — Clicking outside the modal content area should close it but doesn't.
8. **Title is not a link** — The gateway_id in the title could link to a dedicated detail page.

### UX Issues
- The "Host" field stores `last_ip` but actually shows `hostname` (from heartbeat payload) — column name is misleading.
- "Active" row shows Yes/No for `is_active` — but there's no UI to deactivate/reactivate a gateway from here.
- Detail rows have no visual hierarchy — all key-value pairs are equally prominent. Important fields (Status, Last Heartbeat) should stand out.
- The modal width (`max-width: 600px`) is fine for these fields but would be cramped if heartbeat history were added.
- "Registered" date uses `toLocaleString()` — fine but no relative time ("2 days ago").

### Mobile Issues
- Modal takes `90%` width on mobile — fine for detail rows.
- Content `max-height: 80vh` with overflow scroll works well.
- Close button (&#215;) is small as a touch target — should be larger on mobile.
- Detail rows with long values (gateway_id, plant_name) may overflow on narrow screens.

### Missing Features
- Heartbeat history mini-chart (CPU/RAM/Disk over time).
- Command history for this specific gateway.
- Broadcast history for this specific gateway.
- "Edit gateway" button (change plant_name, location, toggle active).
- "Delete gateway" button with confirmation.
- SSH/web console access to the gateway.
- Recent alerts/errors for this gateway.
- Map view showing gateway location.

### Reusable Components
- `DetailRow` — key + value pair with optional badge.
- `Modal` — overlay + close + content with backdrop dismiss.
- `DetailSection` — grouped detail rows under a heading.
- `Spinner` — loading indicator.

---

## Overall UI Pattern Analysis

### What Works
- Dark theme is consistent and modern (`#0f172a` base, `#1e293b` cards, `#38bdf8` accent).
- Typography uses system font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) — fast loading, native feel.
- Colors have semantic meaning: green = online/success, red = offline/error, cyan = interactive/primary, amber = warnings/pending.
- Tab navigation is simple and predictable.
- Alert banner pattern is clear (success/error/info variants).

### What Doesn't Work
- **No framework** — Every UI change requires full DOM replacement. Adding state-driven UI (modals, filters, tabs) means manual DOM management.
- **No build step** — No CSS variables (colors are magic strings), no component scoping, no bundling, no minification.
- **No design system** — Spacing values are ad-hoc (`.75rem`, `1rem`, `1.25rem`, `2rem`, `2.5rem`). No consistent spacing scale.
- **No focus management** — Tab navigation doesn't manage focus, modal doesn't trap focus, no skip-to-content.
- **No accessibility** — No ARIA labels, no `role` attributes, no keyboard navigation, no screen reader support.
- **No loading states** — Every screen shows empty/zero data before first fetch. No skeleton or placeholder.
- **No error recovery** — Network failure shows blank UI. No retry button or offline indicator.
- **No animations** — Transitions are instant. No micro-interactions for status changes, modal open/close, or data updates.
- **No localization** — All strings hardcoded in English.

### Accessibility Issues
- `button` elements exist but have no `aria-label` — screen readers see "Sign In" and "Send" but no context.
- Status badges are `<span>` elements with no `role="status"` or `aria-live`.
- Modal has no `role="dialog"`, `aria-modal="true"`, or `aria-labelledby`.
- Color contrast: `#94a3b8` on `#1e293b` (labels on card backgrounds) — check WCAG AA compliance.
- Tab bar uses `div` elements with `onclick` — no `role="tablist"`, `role="tab"`, or keyboard handling.
- Table headers `<th>` are present but the table has no `<caption>` or `aria-label`.
- The close button "&times;" is text, not an icon with `aria-label="Close"`.

---

## Recommended Professional Industrial UI Layout

### Design System Foundation
```
Color Palette:
  Background:   #0a0e1a  (darker than current)
  Surface:      #141a2e  (card backgrounds)
  Surface-2:    #1e2744  (hover states, elevated surfaces)
  Border:       #2a3556
  Primary:      #00b4d8  (cyan — interactive elements)
  Primary-hover:#48cae4
  Success:      #06d6a0  (green — online, healthy)
  Warning:      #ffd166  (amber — pending, caution)
  Danger:       #ef476f  (red — offline, errors, critical)
  Text-primary: #edf2f4
  Text-secondary:#8d99ae
  Text-muted:   #6c757d

Typography:
  Font: 'Inter', system-ui, sans-serif
  Scale: 0.75rem / 0.875rem / 1rem / 1.25rem / 1.5rem / 2rem / 2.5rem
  Weights: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)

Spacing Scale (8px grid):
  2 / 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 px

Border Radius:
  4px (inputs, badges) / 8px (cards) / 12px (modals, panels)

Shadows:
  Card:     0 2px 8px rgba(0,0,0,.3)
  Elevated: 0 8px 32px rgba(0,0,0,.4)
  Modal:    0 16px 48px rgba(0,0,0,.5)
```

### Layout Architecture (3-tier)
```
┌─────────────────────────────────────────────────────┐
│  Sidebar (240px)        │  Main Content             │
│                         │                           │
│  ┌─────────────────┐    │  ┌───────────────────┐    │
│  │ RajAPI           │    │  │ Stats Bar (4 cards)│    │
│  │ Fleet Manager    │    │  └───────────────────┘    │
│  │                  │    │                           │
│  │ ● Dashboard      │    │  ┌───────────────────┐    │
│  │ ● Gateways       │    │  │ Tab Bar           │    │
│  │ ● Commands       │    │  └───────────────────┘    │
│  │ ● Broadcasts     │    │                           │
│  │ ● Users          │    │  ┌───────────────────┐    │
│  │ ● Settings       │    │  │ Content Panel     │    │
│  │                  │    │  │ (full remaining   │    │
│  │ ───────────────  │    │  │  height)          │    │
│  │ [user avatar]    │    │  │                   │    │
│  │ admin            │    │  │                   │    │
│  │ Sign Out         │    │  │                   │    │
│  └─────────────────┘    │  └───────────────────┘    │
│                         │                           │
└─────────────────────────────────────────────────────┘
```

### Screen-by-Screen Recommendations

#### Login Page
```
┌──────────────────────────────────────────┐
│                                          │
│         ┌──────────────────────┐          │
│         │                      │          │
│         │     ⚡ RajAPI         │          │
│         │  Fleet Management     │          │
│         │                      │          │
│         │  ┌────────────────┐  │          │
│         │  │ Username       │  │          │
│         │  └────────────────┘  │          │
│         │  ┌────────────────┐  │          │
│         │  │ Password    👁  │  │          │
│         │  └────────────────┘  │          │
│         │                      │          │
│         │  ┌────────────────┐  │          │
│         │  │   Sign In      │  │          │
│         │  └────────────────┘  │          │
│         │                      │          │
│         │  [Remember me]       │          │
│         │                      │          │
│         └──────────────────────┘          │
│                                          │
└──────────────────────────────────────────┘
```
- Centered vertically + horizontally, no sidebar
- Brand logo/icon above heading
- Subtle animated gradient border on the card
- Password visibility toggle
- Loading spinner replaces button text during auth
- Shake animation on failed login

#### Dashboard (default view)
```
┌─────────────┬────────────────────────────────────────┐
│  Sidebar    │  Dashboard                             │
│             │                                        │
│  ● Dashboard│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  ○ Gateways │  │  24  │ │  18  │ │   6  │ │  3   │  │
│  ○ Commands │  │Total │ │Online│ │Offline│ │Alerts│  │
│  ○ Broadcasts│ └──────┘ └──────┘ └──────┘ └──────┘  │
│  ○ Users    │                                        │
│  ○ Settings │  ┌──────────────────────────────────┐  │
│             │  │  Online Gateways  (donut/bar)     │  │
│  ─────────  │  │                                  │  │
│  admin      │  │  ████████████████░░░░ 75%         │  │
│  ○ Sign Out │  └──────────────────────────────────┘  │
│             │                                        │
│             │  ┌──────────────────────────────────┐  │
│             │  │  Recent Heartbeats  (mini-list)    │  │
│             │  │  ULTRON-IND-000001  Online  12s   │  │
│             │  │  ULTRON-IND-000002  Online  45s   │  │
│             │  │  ULTRON-IND-000003  Offline 5m   │  │
│             │  └──────────────────────────────────┘  │
└─────────────┴────────────────────────────────────────┘
```

#### Gateways Table
```
┌─────────────┬────────────────────────────────────────┐
│  Sidebar    │  Gateways                              │
│             │                                        │
│  ○ Dashboard│  ┌──────────────────────────────────┐  │
│  ● Gateways │  │ 🔍 Search...  [▼ Status] [Export]│  │
│  ○ Commands │  └──────────────────────────────────┘  │
│  ○ Broadcasts│                                       │
│  ○ Users    │  ┌──┬────────┬──────┬────┬────┬────┐  │
│  ○ Settings │  │# │Gateway │Plant │St. │CPU │RAM │  │
│             │  ├──┼────────┼──────┼────┼────┼────┤  │
│  ─────────  │  │1 │ULTRON- │Sunsh │🟢  │42% │61% │  │
│  admin      │  │  │IND-001 │HQ    │    │    │    │  │
│  ○ Sign Out │  │2 │ULTRON- │Neeraj│🔴  │--  │--  │  │
│             │  │  │IND-002 │Plant │    │    │    │  │
│             │  └──┴────────┴──────┴────┴────┴────┘  │
│             │                                       │
│             │  ◀ 1 2 3 ... 10 ▶  Showing 1-20 of 200│
│             │                                       │
│             │  ┌── Mobile card variant ──────────┐  │
│             │  │ ● ULTRON-IND-000001             │  │
│             │  │   Sunshine HQ                   │  │
│             │  │   🟢 Online  ·  42% CPU         │  │
│             │  │   61% RAM  ·  2m ago            │  │
│             │  └────────────────────────────────┘  │
└─────────────┴────────────────────────────────────────┘
```
- Responsive: table on desktop, card list on mobile
- Sortable columns (click header to sort asc/desc)
- Pagination with page size selector (20/50/100)
- Status filter dropdown (All / Online / Offline / Stale)
- Row hover reveals quick-action buttons (⚙️ 🗑️ 📋)
- Color-coded CPU/RAM bars instead of raw numbers
- Relative time for "Last Heartbeat" ("12s ago", "5m ago")

#### Gateway Detail Panel
```
┌─────────────┬────────────────────────────────────────┐
│  Sidebar    │  ULTRON-IND-000001  —  Sunshine HQ     │
│             │                                        │
│             │  🟢 Online  ·  Last seen 12s ago       │
│             │                                        │
│             │  ┌──────────────┬──────────────────┐  │
│             │  │  Overview    │  System           │  │
│             │  │  Gateway ID  │  ULTRON-IND-001  │  │
│             │  │  Plant       │  Sunshine HQ      │  │
│             │  │  Location    │  Indore, MP       │  │
│             │  │  Version     │  1.0.67           │  │
│             │  │  Hostname    │  ultron-pc-01     │  │
│             │  └──────────────┴──────────────────┘  │
│             │                                        │
│             │  ┌──────────────────────────────────┐  │
│             │  │  Resource Usage (last 24h)         │  │
│             │  │  ┌──────────────────────────────┐  │
│             │  │  │  CPU / RAM / Disk  line chart │  │
│             │  │  └──────────────────────────────┘  │
│             │  └──────────────────────────────────┘  │
│             │                                        │
│             │  ┌─────┬────────────────────────────┐  │
│             │  │  │  │  Pending Commands           │  │
│             │  │  │  │  ● restart_polling (5m ago) │  │
│             │  │  │  │  ○ show_toast     (sent)    │  │
│             │  │  │  └────────────────────────────┘  │
│             │  │  │                                  │
│             │  │  │  ┌────────────────────────────┐  │
│             │  │  │  │  Active Broadcasts          │  │
│             │  │  │  │  ⚠ Maintenance window...   │  │
│             │  │  │  └────────────────────────────┘  │
└─────────────┴────────────────────────────────────────┘
```

#### Commands Panel
```
┌─────────────┬────────────────────────────────────────┐
│  Sidebar    │  Commands                              │
│             │                                        │
│  ○ Dashboard│  ┌──────────────────────────────────┐  │
│  ○ Gateways │  │  Dispatch Command                 │  │
│  ● Commands │  │  [Select gateway ▼]              │  │
│  ○ Broadcasts│  │  [Command type ▼]                │  │
│  ○ Users    │  │  ┌───────────────────────────┐    │  │
│  ○ Settings │  │  │ Payload / Parameters       │    │  │
│             │  │  └───────────────────────────┘    │  │
│  ─────────  │  │  [📤 Dispatch]  [💾 Save as...]  │  │
│  admin      │  └──────────────────────────────────┘  │
│  ○ Sign Out │                                        │
│             │  ┌──┬──────────┬────────┬──────┬────┐  │
│             │  │  │ Type     │Gateway │Status│Age │  │
│             │  ├──┼──────────┼────────┼──────┼────┤  │
│             │  │  │ restart  │IND-001 │⏳    │ 2m │  │
│             │  │  │ show_toat│IND-001 │✅    │ 5m │  │
│             │  │  │ factory  │IND-002 │❌    │ 1h │  │
│             │  └──┴──────────┴────────┴──────┴────┘  │
│             │                                        │
│             │  [🔍 Search commands...]  [▼ Status]   │
└─────────────┴────────────────────────────────────────┘
```
- Command type selector changes the payload form dynamically
- Destructive commands show a confirmation dialog with "I understand" checkbox
- Command templates: save/load common command configurations
- History is filterable by gateway, type, status, and date range
- Re-dispatch button for failed commands
- Bulk select + dispatch to multiple gateways

#### Responsive Behavior
```
Desktop (>1024px):  Sidebar visible, table layout, 4-column stats
Tablet (768-1024px): Collapsible sidebar (hamburger), table has fewer columns
Mobile (<768px):     Bottom nav bar, card list instead of table, 2-column stats
```

### Component Library Candidates
| Component | Variants | Notes |
|---|---|---|
| `Sidebar` | Expanded / Collapsed / Mobile Bottom Nav | Active page indicator, user section |
| `TopBar` | Default | Breadcrumbs, global search, notification bell |
| `DataTable` | Sortable / Filterable / Selectable / Paginated | Responsive → card list on mobile |
| `StatCard` | Default / Clickable / With Trend | Icon + value + label + sparkline |
| `Modal` | Default / Confirmation / Fullscreen | Backdrop + escape dismiss + focus trap |
| `Badge` | Status / Severity / Counter | Dot variant for minimal mode |
| `Alert` | Success / Error / Warning / Info | Dismissible, auto-dismiss timer |
| `Button` | Primary / Secondary / Danger / Ghost | With loading state, icon support |
| `Input` | Text / Password / Search / Number | With label, error, helper text |
| `Select` | Default / Searchable / Multi-select | |
| `Tabs` | Underline / Pill / Icon | Keyboard navigable |
| `Card` | Default / Clickable / With Header | |
| `Skeleton` | Text / Card / Table Row | Loading placeholder |
| `Toast` | Success / Error / Info | Stackable, auto-dismiss |
| `Pagination` | Page numbers / Prev-Next / Infinite scroll | |
| `Chart` | Line / Donut / Bar / Sparkline | For heartbeat history |
| `CommandForm` | Dynamic — changes UI based on type selection | |

### Migration Path (No-Code-Change Recommendations)
1. Add `Cache-Control: no-cache` headers for the HTML page itself (currently only API responses)
2. Add `role="alert"` and `aria-live="polite"` to the error/alert elements
3. Add `type="button"` to all `<button>` elements to prevent accidental form submission
4. Add `<label>` elements associated with inputs via `for` attributes
5. Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` to the modal
6. Add `tabindex="0"` and keyboard event handlers to table rows for accessibility
7. Replace `setInterval` with recursive `setTimeout` to prevent request pile-up
8. Extract hardcoded gateway ID in `loadCommands()` to use the selected gateway
