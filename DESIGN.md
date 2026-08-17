# RajAPI Super Admin — Design System

Industrial IoT admin panel for UltrON fleet management, CPCB compliance, alarms, and OTA updates.
React 19 · Material UI v9 · Vite · PWA · Inter · Lucide icons · Chart.js

---

## Design Principles

**Industrial clarity.** Every pixel serves monitoring or control — no decoration, no chart junk.  
**Status at a glance.** Green/red/amber tells the operator if something needs attention before they read a word.  
**Dense but scannable.** Plant operators monitor 50+ sites. High information density, zero visual noise.

---

## Colors

### Primary

`#2563EB` Buttons, links, active nav, focus rings  
`#EFF6FF` Alert backgrounds  
`#1D4ED8` Hover states

### Success · Warning · Error · Info

`#16A34A` Online, healthy — `#F59E0B` Warning, maintenance — `#DC2626` Offline, critical — `#0284C7` Info, broadcasts

### Neutrals

`#F5F7FA` Page background · `#FFFFFF` Card surfaces · `#E5E7EB` Dividers  
`#111827` Headings & body · `#6B7280` Labels & secondary · `#9CA3AF` Muted metadata

### Quality codes (CPCB standard)

`U` (Valid) → green · `O` (Off-spec) → amber · `E` (Error) → red · `N` (No data) → grey

---

## Typography

**Font:** Inter (300–700 via @fontsource/inter)  
**Scale:** h1 32px/700 · h2 24px/600 · h3 18px/600 · h4 16px/600 · body 14px/400 · caption 12px · overline 11px uppercase

---

## Layout & Spacing

**Sidebar** 240px (collapsed: 64px icon-only) · **Card padding** 24px · **Grid gap** 16px cards, 24px sections  
**Cards:** 12px radius, flat shadow, lifted on hover · **Buttons/inputs:** 8px radius, no shadow  
**Dialogs:** 24px padding, elevated shadow

---

## App Shell

```
Sidebar → Header → Content (Outlet) → Footer
```

**Sidebar:** Logo · nav groups (Dashboard, Sites, Alarms, Broadcasts, Quality, CPCB, OTA, Settings) · user footer  
**Header:** Breadcrumbs · search · notifications · avatar/logout  
**Footer:** Copyright · version badge

---

## States

Every screen handles four states: **Loading** (skeletons matching content shape) · **Error** (alert + retry) · **Empty** (icon + heading + CTA) · **Data** (cards, tables, or charts)

---

## Components (14 reusable)

**Layout** · **Sidebar** · **Header** · **KpiCard** (metric tile with icon, value, trend) · **StatusBadge** (color-coded chip, 15 statuses) · **SectionCard** (container with title + action) · **EmptyState** · **PageHeader** · **SearchBar** · **SkeletonLoader** (3 variants) · **CreateSiteDialog** · **EditSiteDialog** · **BroadcastDialog** · **LockDialog**
