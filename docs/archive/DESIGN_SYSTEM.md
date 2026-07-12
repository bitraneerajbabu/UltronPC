# RajAPI Enterprise v3 — Design System

**Source of truth:** Fleet Dashboard (`/var/www/rajapi/index.html`) and UltrON client UI patterns.
**Status:** Extracted from current codebase — no changes made.
**Date:** 2026-07-04

---

## 1. Typography

### Font Family
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```
System font stack — no external font loads, fastest possible render.

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| `text-xs` | 0.75rem | 500 | 1.2 | Status badge text, metadata |
| `text-sm` | 0.80rem | 400 | 1.4 | Labels, secondary info, meta rows |
| `text-sm-medium` | 0.85rem | 500 | 1.4 | Tab text, user info, nav items |
| `text-base` | 0.875rem | 400 | 1.5 | Table cells, detail values, command cards |
| `text-base-medium` | 0.875rem | 500 | 1.5 | Table headers (uppercase), section titles |
| `text-lg` | 0.90rem | 400 | 1.5 | Button text, input text |
| `text-xl` | 1.10rem | 600 | 1.3 | Nav title, modal headings |
| `text-2xl` | 1.50rem | 700 | 1.2 | Login card heading |
| `text-hero` | 2.00rem | 700 | 1.1 | Stat card values |

### Existing Mappings

```css
/* Login heading */
.login-card h1      →  font-size: 1.5rem  /* text-2xl */  color: #38bdf8

/* Login description */
.login-card p       →  font-size: .875rem /* text-base */ color: #94a3b8

/* Nav title */
nav h2              →  font-size: 1.1rem  /* text-xl */   color: #38bdf8

/* Nav user info */
nav .user-info      →  font-size: .85rem  /* text-sm-medium */ color: #94a3b8

/* Table headers */
th                  →  font-size: .8rem   /* text-sm-medium */ color: #94a3b8
                        text-transform: uppercase
                        letter-spacing: .05em

/* Table cells */
td                  →  font-size: .875rem /* text-base */ color: #e2e8f0

/* Stat card values */
.stat-card .value   →  font-size: 2rem    /* text-hero */ font-weight: 700

/* Stat card labels */
.stat-card .label   →  font-size: .8rem   /* text-sm */   color: #94a3b8

/* Tab text */
.tab                →  font-size: .85rem  /* text-sm-medium */ color: #94a3b8

/* Buttons */
.action-bar button  →  font-size: .85rem  /* text-sm-medium */ font-weight: 600

/* Badge text */
.status-badge       →  font-size: .75rem  /* text-xs */  font-weight: 500

/* Alert text */
.alert              →  font-size: .875rem /* text-base */

/* Broadcast meta */
.broadcast-card .meta → font-size: .75rem /* text-xs */ color: #94a3b8

/* Input/select/textarea */
.action-bar select,
.action-bar input,
.action-bar textarea  → font-size: .85rem /* text-sm-medium */

/* Close button */
.modal-content .close → font-size: 1.5rem /* text-2xl */

/* Command type in cards */
.command-card .cmd-type → font-weight: 500
```

---

## 2. Spacing

### Base Unit: 4px (0.25rem)

| Token | Value | Usage |
|---|---|---|
| `space-1` | 0.25rem (4px) | Badge padding-y, meta gap |
| `space-2` | 0.50rem (8px) | Tab gap, input padding-y |
| `space-3` | 0.75rem (12px) | Table cell padding, button padding, input padding |
| `space-4` | 1.00rem (16px) | Card padding, stat gap, container padding-x, nav padding-x, modal padding |
| `space-5` | 1.25rem (24px) | Stat card padding, login card padding |
| `space-6` | 1.50rem (32px) | Container padding-top, section margin |
| `space-8` | 2.00rem (32px) | Nav padding-y, container padding |
| `space-10` | 2.50rem (40px) | Login card padding |

### Existing Mappings

```css
/* Login card */
.login-card         →  padding: 2.5rem    /* space-10 */
.login-card input   →  margin-bottom: 1rem /* space-4 */
.login-card h1      →  margin-bottom: .5rem /* space-2 */
.login-card p       →  margin-bottom: 1.5rem /* space-6 */

/* Nav */
nav                 →  padding: 1rem 2rem  /* space-4 space-8 */
nav .user-info      →  gap: 1rem           /* space-4 */

/* Container */
.container          →  padding: 1.5rem 2rem /* space-6 space-8 */
.container          →  max-width: 1200px

/* Stats */
.stats              →  gap: 1rem           /* space-4 */
.stat-card          →  padding: 1.25rem    /* space-5 */

/* Tabs */
.tabs               →  gap: .5rem          /* space-2 */
.tabs               →  margin-bottom: 1.5rem /* space-6 */

/* Table */
th, td              →  padding: .75rem 1rem /* space-3 space-4 */
td                  →  border-bottom: 1px solid #334155

/* Action bar */
.action-bar         →  gap: 1rem           /* space-4 */
.action-bar         →  margin-bottom: 1rem  /* space-4 */

/* Modal */
.modal-content      →  padding: 2rem        /* space-8 */
.modal-content      →  max-width: 600px

/* Detail rows */
.detail-row         →  padding: .5rem 0     /* space-2 0 */

/* Broadcast cards */
.broadcast-card     →  padding: 1rem        /* space-4 */
.broadcast-card     →  margin-bottom: .75rem /* space-3 */

/* Command cards */
.command-card       →  padding: .75rem 1rem /* space-3 space-4 */
.command-card       →  margin-bottom: .5rem /* space-2 */

/* Alert */
.alert              →  padding: .75rem 1rem /* space-3 space-4 */
.alert              →  margin-bottom: 1rem   /* space-4 */

/* Empty state */
.empty-state        →  padding: 3rem        /* space-12 */
```

---

## 3. Grid

### Stats Grid
```css
/* Desktop: 3 columns, 1rem gap */
.stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
}

/* Mobile <768px: single column */
@media (max-width: 768px) {
    .stats { grid-template-columns: 1fr; }
}
```

### Action Bar (flex layout)
```css
.action-bar {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
}

/* Responsive: column on mobile */
@media (max-width: 768px) {
    .action-bar { flex-direction: column; }
}
```

### Full-page Layout
```css
body {
    min-height: 100vh;
}
.login-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
}
.app.active {
    display: block;
}
```

### Breakpoints

| Breakpoint | Width | Changes |
|---|---|---|
| Desktop | >768px | 3-column stats, horizontal action bar |
| Mobile | ≤768px | 1-column stats, stacked action bar |

---

## 4. Button Styles

### Primary Button (Sign In, Send, Refresh, Dispatch)

```css
/* Base */
button {
    width: 100%;
    padding: .75rem;
    background: #38bdf8;
    color: #0f172a;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: .9rem;
    cursor: pointer;
}

/* Hover */
button:hover {
    background: #7dd3fc;
}

/* Login-specific */
.login-card button {
    width: 100%;
}

/* Action bar buttons */
.action-bar button {
    background: #38bdf8;
    color: #0f172a;
    border: none;
    font-weight: 600;
    cursor: pointer;
    padding: .6rem .8rem;
    border-radius: 8px;
    font-size: .85rem;
}

.action-bar button:hover {
    background: #7dd3fc;
}
```

### Secondary/Input-style (dropdowns, inputs used as buttons)

```css
.action-bar select,
.action-bar input,
.action-bar textarea,
.action-bar button {
    padding: .6rem .8rem;
    border-radius: 8px;
    border: 1px solid #334155;
    background: #1e293b;
    color: #e2e8f0;
    font-size: .85rem;
}
```

### Logout (text-style link)
```css
nav .logout {
    color: #f87171;
    cursor: pointer;
    font-size: .85rem;
}
nav .logout:hover {
    text-decoration: underline;
}
```

### Close Button (modal X)

```css
.modal-content .close {
    float: right;
    cursor: pointer;
    color: #94a3b8;
    font-size: 1.5rem;
}
.modal-content .close:hover {
    color: #e2e8f0;
}
```

### Button Variant Summary

| Variant | Background | Color | Border | Hover | Usage |
|---|---|---|---|---|---|
| Primary | `#38bdf8` | `#0f172a` | None | `#7dd3fc` | Sign In, Send, Dispatch, Refresh |
| Input-style | `#1e293b` | `#e2e8f0` | `1px solid #334155` | — | Dropdowns, text inputs |
| Text link | None | `#f87171` | None | Underline | Sign Out, Close |
| Ghost (close) | None | `#94a3b8` | None | `#e2e8f0` | Modal X button |

---

## 5. Card Styles

### Login Card
```css
.login-card {
    background: #1e293b;
    padding: 2.5rem;
    border-radius: 12px;
    width: 360px;
    box-shadow: 0 4px 24px rgba(0,0,0,.3);
}
```

### Stat Card
```css
.stat-card {
    background: #1e293b;
    padding: 1.25rem;
    border-radius: 10px;
    text-align: center;
}
```

### Broadcast Card
```css
.broadcast-card {
    background: #1e293b;
    padding: 1rem;
    border-radius: 10px;
    margin-bottom: .75rem;
    border-left: 4px solid #38bdf8;  /* severity color */
}

/* Severity variants */
.broadcast-card.critical {
    border-left-color: #f87171;
}
.broadcast-card.warn {
    border-left-color: #fb923c;
}
```

### Command Card
```css
.command-card {
    background: #1e293b;
    padding: .75rem 1rem;
    border-radius: 8px;
    margin-bottom: .5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
```

### Card Variant Summary

| Card Type | Border Radius | Padding | Special |
|---|---|---|---|
| Login | 12px | 2.5rem | Shadow, fixed 360px width |
| Stat | 10px | 1.25rem | Centered text |
| Broadcast | 10px | 1rem | Left border (4px), severity color |
| Command | 8px | 0.75rem 1rem | Flex space-between |
| Modal content | 12px | 2rem | Max 600px, overflow-y auto |

---

## 6. Table Styles

```css
table {
    width: 100%;
    border-collapse: collapse;
    background: #1e293b;
    border-radius: 10px;
    overflow: hidden;
}

th {
    text-align: left;
    padding: .75rem 1rem;
    background: #334155;
    color: #94a3b8;
    font-weight: 500;
    font-size: .8rem;
    text-transform: uppercase;
    letter-spacing: .05em;
}

td {
    padding: .75rem 1rem;
    border-bottom: 1px solid #334155;
    font-size: .875rem;
}

tr:hover {
    background: #263548;
}
```

### Table Properties

| Property | Value |
|---|---|
| Background | `#1e293b` |
| Border radius | 10px (clipped via overflow:hidden) |
| Header background | `#334155` |
| Row hover | `#263548` |
| Row separator | `1px solid #334155` |
| Cell padding | `0.75rem 1rem` |

### Clickable Row Link
```css
.gateway-link {
    color: #38bdf8;
    cursor: pointer;
}
.gateway-link:hover {
    text-decoration: underline;
}
```

---

## 7. Dialog (Modal) Styles

```css
.modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,.6);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 100;
}

.modal.active {
    display: flex;
}

.modal-content {
    background: #1e293b;
    border-radius: 12px;
    padding: 2rem;
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
}

.modal-content h2 {
    margin-bottom: 1rem;
}
```

### Detail Row (inside modal)
```css
.modal-content .detail-row {
    display: flex;
    justify-content: space-between;
    padding: .5rem 0;
    border-bottom: 1px solid #334155;
    font-size: .875rem;
}

.modal-content .detail-row .key {
    color: #94a3b8;
}

.modal-content .detail-row .value {
    color: #e2e8f0;
}
```

### Dialog Properties

| Property | Value |
|---|---|
| Overlay | `rgba(0,0,0,.6)` |
| z-index | 100 |
| Content background | `#1e293b` |
| Border radius | 12px |
| Padding | 2rem |
| Max width | 600px |
| Width (mobile) | 90% |
| Max height | 80vh |
| Scroll | overflow-y: auto |

---

## 8. Form Controls

### Text Input (login)
```css
.login-card input {
    width: 100%;
    padding: .75rem;
    margin-bottom: 1rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    color: #e2e8f0;
    font-size: .9rem;
}

.login-card input:focus {
    outline: none;
    border-color: #38bdf8;
}
```

### Action Bar Controls (select, input, textarea)
```css
.action-bar select,
.action-bar input,
.action-bar textarea,
.action-bar button {
    padding: .6rem .8rem;
    border-radius: 8px;
    border: 1px solid #334155;
    background: #1e293b;
    color: #e2e8f0;
    font-size: .85rem;
}

.action-bar textarea {
    flex: 1;
    min-height: 60px;
    resize: vertical;
}
```

### Form Control Properties

| Control | Background | Border | Border Radius | Text Color | Focus |
|---|---|---|---|---|---|
| Login input | `#0f172a` | `1px solid #334155` | 8px | `#e2e8f0` | `border-color: #38bdf8` |
| Filter input | `#1e293b` | `1px solid #334155` | 8px | `#e2e8f0` | — |
| Select dropdown | `#1e293b` | `1px solid #334155` | 8px | `#e2e8f0` | — |
| Textarea | `#1e293b` | `1px solid #334155` | 8px | `#e2e8f0` | — |

---

## 9. Status Colors

| Token | Hex | CSS Variable | Usage |
|---|---|---|---|
| `status-online-bg` | `#166534` | — | Online badge background |
| `status-online-text` | `#4ade80` | — | Online badge text, internet Yes |
| `status-offline-bg` | `#7f1d1d` | — | Offline badge background |
| `status-offline-text` | `#fca5a5` | — | Offline badge text, internet No |
| `status-unknown-bg` | `#451a03` | — | Unknown badge background |
| `status-unknown-text` | `#fb923c` | — | Unknown badge text |

```css
.status-badge {
    display: inline-block;
    padding: .2rem .6rem;
    border-radius: 999px;  /* pill shape */
    font-size: .75rem;
    font-weight: 500;
}

.status-badge.online {
    background: #166534;
    color: #4ade80;
}

.status-badge.offline {
    background: #7f1d1d;
    color: #fca5a5;
}

.status-badge.unknown {
    background: #451a03;
    color: #fb923c;
}
```

### Command Status Colors (inline text only)
```css
.command-card .cmd-status.pending   { color: #fb923c; }  /* same as unknown */
.command-card .cmd-status.executed  { color: #4ade80; }  /* same as online */
.command-card .cmd-status.failed    { color: #f87171; }  /* same as error text */
```

### Gateway Internet Status (inline spans)
```css
/* Yes (online) — inline style */
<span style="color:#4ade80">Yes</span>

/* No (offline) — inline style */
<span style="color:#f87171">No</span>
```

### Color System Table

| Role | Hex | Semantic Name |
|---|---|---|
| **Primary** | `#38bdf8` | Interactive, links, accent, active tab |
| Primary hover | `#7dd3fc` | Button hover, link hover |
| **Success / Online** | `#4ade80` | Status online, command executed |
| Success bg | `#166534` | Online badge bg, success alert bg |
| **Danger / Error** | `#f87171` | Error text, logout link, critical border, internet No |
| Danger bg | `#7f1d1d` | Offline badge bg, error alert bg |
| **Warning** | `#fb923c` | Pending status, unknown badge text |
| Warning bg | `#451a03` | Unknown badge bg |
| **Warning (alt)** | `#fca5a5` | Offline badge text (light red) |
| **Info bg** | `#1e3a5f` | Info alert bg |
| Info text | `#93c5fd` | Info alert text |
| **Surface** | `#1e293b` | Cards, dropdowns, inputs, modal, table bg |
| Surface hover | `#263548` | Table row hover |
| Surface border | `#334155` | Borders, divider lines, table header bg |
| **Background** | `#0f172a` | Page background, login input bg |
| **Text primary** | `#e2e8f0` | Body text, table cells, detail values |
| **Text secondary** | `#94a3b8` | Labels, meta, nav user info, table headers, placeholder |
| **Text muted** | `#475569` | Empty state |
| **Text extra muted** | `#64748b` | Command card payload |

---

## 10. Alert Colors

```css
.alert {
    padding: .75rem 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    font-size: .875rem;
}

.alert.success {
    background: #166534;
    color: #4ade80;
}

.alert.error {
    background: #7f1d1d;
    color: #fca5a5;
}

.alert.info {
    background: #1e3a5f;
    color: #93c5fd;
}
```

| Alert Type | Background | Text | Auto-dismiss |
|---|---|---|---|
| Success | `#166534` | `#4ade80` | 5s (`setTimeout` in `showAlert()`) |
| Error | `#7f1d1d` | `#fca5a5` | 5s |
| Info | `#1e3a5f` | `#93c5fd` | 5s |

Note: There is no warning alert variant defined in CSS, but the `showAlert()` function accepts `"success"`, `"error"`, or `"info"` as the type parameter. `"warning"` falls through with no matching CSS class.

---

## 11. Animation Rules

### Current State
**No CSS animations or transitions exist in the codebase.**

All state changes are instant:
- Modal open/close: `display: none` ↔ `display: flex` (instant, no fade)
- Tab switch: `display: none` ↔ `display: block` (instant)
- Alert show: `display: none` → `display: block` (instant)
- Data refresh: `innerHTML` replacement (instant)

### Alert Auto-dismiss (JS, not CSS)
```javascript
function showAlert(msg, type) {
    const el = document.getElementById('alert');
    el.textContent = msg;
    el.className = 'alert ' + type;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}
```

### Timing Constants (from JS)

| Action | Duration | Mechanism |
|---|---|---|
| Alert display | 5,000ms | `setTimeout` |
| Data poll interval | 15,000ms | `setInterval` |

---

## 12. Dark Theme

### Current (Only Theme)
The entire UI is dark theme only. No light theme exists.

```css
/* Page background */
body {
    background: #0f172a;
    color: #e2e8f0;
}

/* Surface colors */
Surface:       #1e293b    /* cards, nav, modals, dropdowns, table */
Surface-hover: #263548    /* table row hover */
Surface-alt:   #0f172a    /* page bg, login input bg (deeper) */
Border:        #334155    /* borders, table header bg */
Overlay:       rgba(0,0,0,.6)  /* modal backdrop */
```

### Color Distribution

| Element | Background | Text |
|---|---|---|
| Page | `#0f172a` | `#e2e8f0` |
| Card (all types) | `#1e293b` | `#e2e8f0` |
| Nav | `#1e293b` | — |
| Table header | `#334155` | `#94a3b8` |
| Table row hover | `#263548` | — |
| Input (login) | `#0f172a` | `#e2e8f0` |
| Input/select (action bar) | `#1e293b` | `#e2e8f0` |
| Modal backdrop | `rgba(0,0,0,.6)` | — |
| Stat card | `#1e293b` | `#e2e8f0` |
| Badge (online) | `#166534` | `#4ade80` |
| Badge (offline) | `#7f1d1d` | `#fca5a5` |
| Badge (unknown) | `#451a03` | `#fb923c` |
| Alert (success) | `#166534` | `#4ade80` |
| Alert (error) | `#7f1d1d` | `#fca5a5` |
| Alert (info) | `#1e3a5f` | `#93c5fd` |
| Empty state | — | `#475569` |
| Divider | `#334155` | — |

---

## 13. Light Theme

**Not implemented.** The entire UI is dark-only. No CSS custom properties exist to support a light variant.

A light theme would require redefining all colors:

| Token | Dark (current) | Light (proposed) |
|---|---|---|
| Page bg | `#0f172a` | `#f8fafc` |
| Surface | `#1e293b` | `#ffffff` |
| Surface border | `#334155` | `#e2e8f0` |
| Text primary | `#e2e8f0` | `#0f172a` |
| Text secondary | `#94a3b8` | `#64748b` |
| Input bg | `#0f172a` | `#f1f5f9` |
| Primary | `#38bdf8` | `#0284c7` |

---

## 14. Border Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 8px | Buttons, inputs, selects, textareas, command cards, alert |
| `radius-md` | 10px | Stat cards, broadcast cards, table |
| `radius-lg` | 12px | Login card, modal content, nav (implicit) |
| `radius-pill` | 999px | Status badges |

| Element | Radius |
|---|---|
| Button (all) | 8px |
| Input (login) | 8px |
| Input/select/textarea (action bar) | 8px |
| Table | 10px |
| Stat card | 10px |
| Broadcast card | 10px |
| Command card | 8px |
| Login card | 12px |
| Modal content | 12px |
| Alert | 8px |
| Status badge | 999px |

---

## 15. Shadow Levels

| Token | Value | Usage |
|---|---|---|
| `shadow-sm` | — | Not used (no cards use shadow) |
| `shadow-md` | `0 4px 24px rgba(0,0,0,.3)` | Login card only |

**Only one shadow is used in the entire UI:** the login card.

```css
.login-card {
    box-shadow: 0 4px 24px rgba(0,0,0,.3);
}
```

No other elements use `box-shadow`. Cards, modals, nav, and dropdowns all use flat design with background color and border for separation.

---

## 16. Icon Sizes

**No icons are used in the current UI.** The only non-text visual element is the close button in the modal, which uses the HTML entity `&times;` (multiplication sign ×), styled as:

```css
.modal-content .close {
    font-size: 1.5rem;
}
```

No SVG, icon font, or image-based icons exist. Status indicators rely solely on colored text and background pills.

---

## 17. Component Naming Convention

### Current Naming (BEM-ish, not strict BEM)

The codebase uses a flat `.component-descendant` naming pattern:

| Component | Class/ID | Pattern |
|---|---|---|
| Login Page | `#loginPage`, `.login-page` | `login-*` |
| Login Card | `.login-card` | `login-*` |
| Login Error | `#loginError` | `login-*` |
| App Shell | `#app` | Flat |
| Nav | `nav` (element), `.user-info`, `.logout` | Flat |
| Container | `.container` | Flat |
| Stats Bar | `#stats`, `.stats`, `.stat-card` | `stat-*` |
| Tabs | `.tabs`, `.tab`, `.tab.active` | Flat |
| Panels | `#panelGateways`, `.panel`, `.panel.active` | `panel*` |
| Gateway Table | `#gatewayList` | Flat |
| Gateway Link | `.gateway-link` | `gateway-*` |
| Filter Input | `#filterInput` | Flat |
| Action Bar | `.action-bar` | `action-*` |
| Empty State | `.empty-state` | `empty-*` |
| Status Badge | `.status-badge`, `.status-badge.online` | `status-*` |
| Alert | `#alert`, `.alert.success` | Flat |
| Broadcast Card | `.broadcast-card`, `.broadcast-card.critical` | `broadcast-*` |
| Command Card | `.command-card`, `.cmd-type`, `.cmd-status` | `command-*`, `cmd-*` |
| Modal | `#gatewayModal`, `.modal`, `.modal-content`, `.modal.active` | Flat |
| Detail Row | `.detail-row`, `.key`, `.value` | `detail-*` |

### Inconsistencies
- Mix of `#id` and `.class` selectors for components
- No prefix consistency: `.cmd-*` vs `.command-card`, `.gateway-*` vs `#gatewayList`
- No modifier naming standard: `.active` is used for tabs, panels, modals, and app shell
- State classes use both modifier pattern (`.tab.active`) and standalone (`.online`, `.critical`)

### Recommended Convention

```css
/* Block: component name */
.gateway-table { }
.gateway-table__row { }           /* Element */
.gateway-table__row--selected { } /* Modifier */

/* Alternative: concise prefix */
.gt { }
.gt-row { }
.gt-row--selected { }

/* Buttons */
.btn { }
.btn--primary { }
.btn--danger { }
.btn--ghost { }

/* Status */
.badge { }
.badge--online { }
.badge--offline { }
```
