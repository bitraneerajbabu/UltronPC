# UltrON — UI/UX Design Brief

**Version:** 1.0  
**Date:** 2026-07-13  

---

## 1. Design Philosophy

Industrial monitoring software for plant engineers. The UI prioritises:
- **Glanceability** — critical info (alarms, offline devices) visible at a glance
- **Reliability feel** — glassmorphism aesthetics convey precision and stability
- **Minimal learning curve** — a plant engineer should be productive within 15 minutes
- **Dark-first** — monitors are often in dark control rooms; dark theme reduces eye strain

---

## 2. Design Tokens

### 2.1 Color Palette

Source: `src/theme.ts` — exported as object `T`

| Token | Value | Usage |
|-------|-------|-------|
| `T.teal` | `#0f766e` | Primary brand — nav rail, key accents, active states |
| `T.tealMid` | `#10998B` | Interactive hover states, links |
| `T.tealLight` | `rgba(15,118,110,0.15)` | Subtle backgrounds, selected rows |
| `T.success` | `#22c55e` | Online, good data quality (U), active, healthy |
| `T.warning` | `#eab308` | Warning alarms, degraded, nearing threshold |
| `T.danger` | `#ef4444` | Critical alarms, offline, error, comms fail (E) |
| `T.info` | `#3b82f6` | Informational, pending maintenance, no data (N) |
| `T.text` | `rgba(255,255,255,0.9)` | Primary text |
| `T.muted` | `rgba(255,255,255,0.5)` | Secondary text, labels |
| `T.faint` | `rgba(255,255,255,0.08)` | Dividers, subtle borders |
| `T.label` | `#94a3b8` | Form labels, stat headers |
| `T.border` | `rgba(255,255,255,0.1)` | Card/input borders |
| `T.glass` | `rgba(255,255,255,0.04)` | Glass card backgrounds |
| `T.glassBorder` | `rgba(255,255,255,0.08)` | Glass card borders |

### 2.2 Semantic Colors

| Token | Hex | Meaning |
|-------|-----|---------|
| `PARAM_STATE.good` | Green | Normal operation |
| `PARAM_STATE.warning` | Yellow | Near threshold |
| `PARAM_STATE.critical` | Red | Threshold exceeded |
| `PARAM_STATE.offline` | Gray | No communication |

### 2.3 Parameter Category Colors

Used for trend charts and parameter badges:

| Category | Color | Example Tags |
|----------|-------|-------------|
| PM (Particulate) | Purple `#a855f7` | PM10, PM2.5, PM1 |
| CO (Carbon Monoxide) | Orange `#f97316` | CO, CO_WET |
| NOx (Nitrogen Oxides) | Blue `#3b82f6` | NO, NO2, NOX |
| SO2 (Sulphur Dioxide) | Yellow `#eab308` | SO2 |
| O3 (Ozone) | Cyan `#06b6d4` | O3 |
| Ambient | Green `#22c55e` | temp, RH, baro |
| Wind | Indigo `#6366f1` | WD, WS |
| Default | Teal `#0f766e` | All others |

### 2.4 Shadows

| Token | Value |
|-------|-------|
| `T.shadowSm` | `0 2px 8px rgba(0,0,0,0.3)` |
| `T.shadowMd` | `0 8px 32px rgba(0,0,0,0.4)` |
| `T.shadowLg` | `0 16px 48px rgba(0,0,0,0.5)` |
| `T.shadowGlow` | `0 0 20px rgba(15,118,110,0.3)` (teal glow) |

### 2.5 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `T.r` | `10px` | Default radius — inputs, cards, buttons |
| `T.rMd` | `14px` | Modals, larger containers |
| `T.rLg` | `18px` | Full cards, panels |
| `T.rFull` | `99px` | Pills, badges |

### 2.6 Typography

| Token | Value |
|-------|-------|
| Font base | `Inter`, system-ui, sans-serif |
| Font mono | `'JetBrains Mono'`, 'Fira Code', monospace |
| Base size | `12px` (in most components), `14px` (body), `16px` (headings) |

---

## 3. Layout Grid

### 3.1 App Shell (1280×720 minimum)

```
┌──────────┬────────────────────────────────────┬─────────────┐
│          │  Top Bar: 48px                      │             │
│  64px    │  [Clock] [Plant Name] [User: Role] │ [Logo]      │
│  Nav     ├────────────────────────────────────┤             │
│  Rail    │                                     │             │
│          │   Content Area (flex: 1)            │             │
│          │   min-height: calc(100vh - 48px)    │             │
│          │                                     │             │
│          │                                     │             │
│          │                                     │             │
│          ├────────────────────────────────────┤             │
│          │  Footer: 28px (copyright + marquee) │             │
└──────────┴────────────────────────────────────┴─────────────┘
```

- **Nav rail:** `64px` wide, vertical icon buttons with labels, glass background
- **Top bar:** `48px` tall, glass background, fixed
- **Footer:** `28px` tall, glass background, scrolling broadcast marquee
- **Content area:** Fills remaining space, padding `20px`, `overflow-y: auto`
- **Max content width:** `1400px` centered with auto margins

### 3.2 Screen Layout Patterns

| Pattern | Used By | Structure |
|---------|---------|-----------|
| **KPI row + table** | Dashboard | 4 KPI cards in grid → full-width table or sparkline grid |
| **Tree + detail** | Devices | Left panel (tree), right panel (form/table) |
| **Full-width form** | Settings, Users | Sections with headers, cards for groups |
| **Tabbed panel** | CPCB | 4 horizontal tabs, content changes per tab |
| **Single chart** | Trends | Chart + filters above, optional data table below |
| **Filtered list** | Logs, Reports | Filters row → scrollable table |
| **Wizard/stepper** | Calibration | Job status cards, results timeline |

---

## 4. Component Library

### 4.1 Existing Components

| Component | File | Behaviour |
|-----------|------|-----------|
| **Table** | `components/Table.tsx` | Generic sortable/selectable table with checkbox column, header-based rendering, custom cell renderers, empty state, sort asc/desc indicators |
| **Sparkline** | `components/Sparkline.tsx` | Lightweight SVG polyline, configurable width/height/color/strokeWidth, handles empty and single-point data |
| **Modal** | `components/Modal.tsx` | Reusable overlay with Escape-to-close, backdrop click-to-close, configurable title/size/action buttons (header/body/footer slots) |
| **AlarmsInspectorModal** | `components/AlarmsInspectorModal.tsx` | Two-tab alarm view: "Active Alarms" (acknowledge workflow) and "Comms & Device Failures" |

### 4.2 Inline Component Patterns (No Reusable Component)

These patterns are duplicated across screens — candidates for component extraction:

| Pattern | Locations | Description |
|---------|-----------|-------------|
| **Glass Card** | All screens | `background: T.glass, backdropFilter: blur(16px), borderRadius: T.rLg, border: 1px solid T.glassBorder` |
| **KPI Card** | Dashboard | Colored icon + label + value in glass card |
| **Form Input** | All CRUD screens | `INP` style object: glass bg, 12px font, 7px 10px padding |
| **Select** | All CRUD screens | Same as input but with `cursor:pointer` |
| **Button variants** | All screens | `BTN.primary` (teal gradient), `BTN.ghost` (transparent+border), `BTN.danger` (red) |
| **Toast notification** | AppContext | DOM-created toast (no library), 3 types (success/error/info) |
| **Status badge** | Devices, Dashboard | Colored dot + label — `PARAM_STATE` pattern |
| **Protocol badge** | Devices | Colored badge from `PROTO` config — icon + label |
| **Empty state** | Tables, lists | Centered message with icon "No data" |

### 4.3 Component Specs

**Table (existing reusable):**
```
Props:
  columns: [{ key, label, render?, sortable?, width? }]
  data: T[]
  onSelectionChange?: (selectedIds) => void
  emptyMessage?: string
  rowKey?: (row) => string | number
  
Behaviour:
  Click header to sort (asc/desc/none cycle)
  Checkbox column on left if onSelectionChange provided
  "Select All" checkbox in header
  Striped rows on hover
```

**Modal (existing reusable):**
```
Props:
  isOpen: boolean
  onClose: () => void
  title: string
  size?: 'sm' | 'md' | 'lg'
  actions?: ReactNode (rendered in footer)
  
Behaviour:
  Open: fade in overlay + scale up content
  Close: Escape key, click backdrop, or action button
  Block body scroll when open
```

**Button (proposed reusable — currently inline):**
```
Variants:
  primary  — teal gradient bg, white text (default action)
  ghost   — transparent + border + muted text (secondary)
  danger  — red bg, white text (destructive action)
  icon    — square, ghost, equal padding (toolbar)

Sizes:
  sm — 28px height, 11px font
  md — 34px height, 13px font (default)
  lg — 42px height, 15px font

States:
  default, hover (brighten), active (darken), disabled (opacity 0.5)
```

**Input (proposed reusable — currently inline):**
```
Props:
  label?: string
  error?: string
  helperText?: string
  type: text | number | select | textarea

States:
  default — glass bg, 1px T.border border
  focus — T.teal border, T.shadowGlow
  error — T.danger border, T.danger glow via inpErr()
  disabled — opacity 0.5
```

---

## 5. Interaction Patterns

### 5.1 Navigation

- **Nav rail:** Click icon → switch screen immediately (no animation currently)
- **Active state:** Teal icon + text highlight
- **Role filtering:** Client role nav items grayed out (hidden, not disabled)
- **Deep links:** No URL routing — all state in AppContext (SPA without React Router)

### 5.2 Data Refresh

- **Live data:** WebSocket push — updates `liveData` object in real-time
- **Dashboard KPI:** Refresh every 30s via `fetchLatestTelemetryAndKpis()`
- **Manual refresh:** "Refresh" buttons on most screens (re-triggers `loadAllData`)
- **Loading state:** `loading` boolean shows overlay on initial load; subsequent fetches are silent

### 5.3 Forms & CRUD

- **Create/Edit:** Modal form (most screens) or inline row edit (Devices tree)
- **Save behaviour:** Optimistic UI assumed — no rollback on error
- **Delete:** Confirmation modal ("Are you sure? This will delete all associated data.")
- **Validation:** Frontend validates required fields; server returns Pydantic validation errors
- **Error display:** Toast notification on failure (top-right, auto-dismiss after 4s)

### 5.4 Alarms

- **Visual indicators:**
  - Dashboard KPI count (red number)
  - AlarmsInspectorModal badge count on nav
  - Parameter row highlights (red/green/yellow based on state)
- **Acknowledge flow:** Select alarms in table → click "Acknowledge Selected" → PATCH to server
- **Auto-clear:** When value returns within threshold + deadband → alarm state → cleared

### 5.5 Toast Notifications

```
Position: top-right, 20px from edges
Stack: newest at top, max 3 visible
Duration: 4s auto-dismiss, click to dismiss immediately
Types:
  ┌─ success ──────────────────────┐
  │ ✓ Parameter saved successfully │
  └────────────────────────────────┘
  ┌─ error ───────────────────────────┐
  │ ✗ Failed to connect to device     │
  └───────────────────────────────────┘
  ┌─ info ───────────────────────────┐
  │ ℹ Polling started for Device #12 │
  └──────────────────────────────────┘
```

---

## 6. Screen-Specific Design Notes

### 6.1 Dashboard
- **Purpose:** Plant status at a glance
- **Layout:** 4 KPI cards in 2×2 grid → Sparkline grid (if enabled) → Broadcasts section
- **KPI Cards:** Icon (top-left), label, value, optional trend arrow
- **Empty state:** "No stations configured. Go to Devices to add your first station."

### 6.2 Devices
- **Purpose:** Configure and monitor all devices and parameters
- **Layout:** Left panel (tree: Station ▶ Device ▶ Parameter), right panel (detail form/table)
- **Tree interaction:** Click to select, right-click context menu (future)
- **Protocol badges:** Colored pill showing protocol type (Modbus TCP = green, etc.)
- **Status dots:** Green (online), Red (offline), Yellow (fault), Gray (maintenance)

### 6.3 CPCB
- **Purpose:** Regulatory compliance management
- **Layout:** 4 horizontal tabs across top → content changes per tab
- **Tab 1 — Server Config:** TGPCB URLs, parameters, active/inactive toggles
- **Tab 2 — Station Config:** Export paths, retention, calibration/maintenance flags
- **Tab 3 — Mappings:** Table: internal param → CPCB name × conversion factor
- **Tab 4 — Export Log:** Timestamped log of all export cycles with status/errors

### 6.4 Login Screen
- **Layout:** Centered card on dark background
- **Elements:** UltrON logo icon, app name, version badge, username input, password input, login button, copyright footer
- **Error state:** Red border on inputs + error message below form
- **Loading state:** Button shows spinner, inputs disabled
- **Lockout state:** After 5 failed attempts, account locked for 15min — show countdown timer
- **Rate limit state:** After 5 rapid attempts, show "Too many attempts. Try again in 60s."
- **Password change prompt:** On first login or admin-enforced change, redirect to password change form

---

## 7. Responsive Behaviour

| Breakpoint | Behaviour |
|------------|-----------|
| >1400px | Max content width 1400px, centered |
| 1024-1400px | Full width, standard layout |
| 768-1024px | 2-column KPI grid collapses to 2×2 (was 4-wide) |
| <768px | (Not currently supported — minimum 1280×720 recommended) |

---

## 8. Accessibility Notes

- **Colour contrast:** White text on dark glass backgrounds passes WCAG AA
- **Interactive elements:** All clickable elements have `cursor: pointer`
- **Form labels:** Visible labels on all inputs (no placeholder-as-label pattern)
- **Focus indicators:** `:focus-visible` outline on all interactive elements
- **Touch targets:** Minimum 32px for all interactive elements (recommended 44px for touch)

---

## 9. Known Design Debt

| Issue | Location | Impact | Fix |
|-------|----------|--------|-----|
| 667 inline styles | All components | No design system enforcement; inconsistent spacing | Extract to CSS modules or styled-components |
| 258 hardcoded colors vs 98 `T.*` tokens | Theme file | Color drift; hard to rebrand | Migrate to token-only usage |
| No responsive layout | App shell | Broken below 1024px | CSS Grid with breakpoints |
| No loading skeleton | All screens | Blank screen during load | Skeleton components per layout pattern |
| Toast DOM-created | AppContext | Not React-idiomatic; hard to test | React portal-based toast |
| No focus trap in Modal | Modal.tsx | Keyboard navigation escape | Add focus trap library |
| No React Router | App.tsx | No deep-linking, no browser history | Add react-router-dom |
| NaN on negative number input | DevicesScreen.tsx:129-137 | `Number("-")` → NaN → blank field | Fixed — store string, convert to number at save time |
| `description` overwrite on save | DevicesScreen.tsx:196-207 | Param description gets overwritten with station name | Fixed — removed from save payload |
| `===` vs `==` in AppContext | AppContext.tsx:607,614 | Edit/delete parameter fails when IDs are string vs number | Fixed — changed to `===` |
