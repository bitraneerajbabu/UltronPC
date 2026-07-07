# UltrON Design System

Industrial IoT monitoring platform — glass-morphism UI for real-time telemetry, CPCB compliance, and alarm management.

## Brand

| Attribute | Value |
|---|---|
| Name | UltrON |
| Tagline | Industrial Telemetry Platform |
| Personality | Precise, trustworthy, warm, industrial |
| Design philosophy | Glass morphism on warm neutral canvas. Informational density without visual clutter. |

## Color Palette

### Brand / Primary

```
#0f766e  — Primary (teal)
#14b8a6  — Primary light
rgba(15,118,110,0.35) — Primary glow
rgba(15,118,110,0.08) — Primary bg
rgba(15,118,110,0.18) — Primary border
```

### Neutrals

```
#0f172a  — Text (dark slate)
#475569  — Text muted
#64748b  — Text label / secondary
#94a3b8  — Text faint / placeholder
#334155  — Body text
rgba(235,225,205,0.8)  — Border (warm beige)
rgba(15,118,110,0.1)   — Border soft (teal tint)
```

### Surface / Background

```
#faf6ee           — Page base (warm cream)
rgba(253,250,242,0.65) — Glass surface
rgba(253,250,242,0.82) — Glass hover
rgba(250,244,230,0.45) — Glass dark
rgba(252,248,238,0.65) — Card surface
```

### Semantic

| Token | Hex | Usage |
|---|---|---|
| `success` | `#10b981` | Online, valid, good status |
| `warning` | `#f59e0b` | Warning state, exceeded thresholds |
| `danger` | `#ef4444` | Offline, critical alarm, error |
| `dangerGlow` | `rgba(239,68,68,0.35)` | Critical alarm glow |
| `info` | `#38bdf8` | Info badges, informational |

### Parameter Category Themes

| Category | Color | Usage |
|---|---|---|
| PM (PM2.5, PM10) | `#8b5cf6` (violet) | Badges, borders, chart lines |
| CO / Carbon | `#f97316` (orange) | |
| NOx | `#3b82f6` (blue) | |
| SO2 | `#eab308` (yellow) | |
| O3 / Ozone | `#06b6d4` (cyan) | |
| Ambient (Temp, Hum, Press) | `#10b981` (green) | |
| Wind (WS, WD, Dir, Speed) | `#6366f1` (indigo) | |
| Default | `#0f766e` (teal) | Fallback |

### Protocol Colors

| Protocol | Color | Background |
|---|---|---|
| Modbus TCP | `#38bdf8` | `rgba(56,189,248,0.12)` |
| Modbus RTU | `#a78bfa` | `rgba(167,139,250,0.12)` |
| TCP Custom | `#34d399` | `rgba(52,211,153,0.12)` |
| CSV Watch | `#fbbf24` | `rgba(251,191,36,0.12)` |

## Typography

### Font Stack

Primary: **Inter** (locally hosted, 100% offline — weights 400, 500, 600, 700, 800, 900)

```
font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont,
             'Segoe UI', sans-serif;
```

Monospace (tables, timestamps, sensor values):

```
font-family: ui-monospace, Consolas, Monaco, 'Andale Mono',
             'Ubuntu Mono', monospace;
```

### Type Scale

| Context | Size | Weight | Letter-spacing |
|---|---|---|---|
| KPI value | 32px | 700 | -0.03em |
| Sensor value | 32px | 700 | -0.02em |
| Login title | 24px | 700 | -0.02em |
| Section title | 18px | 700 | -0.01em |
| Modal title | 18px | 700 | — |
| Body / table cell | 13-14px | 400-500 | — |
| Form label | 13px | 600 | 0.05em uppercase |
| Button label | 12-13px | 600-700 | — |
| Badge / timestamp | 11px | 700 | 0.06em uppercase |
| Small / footnote | 11px | 500-600 | — |

## Shadows

| Token | Value | Usage |
|---|---|---|
| `shadowSm` | `0 2px 8px rgba(15,118,110,0.08)` | Cards, inputs |
| `shadowMd` | `0 4px 16px rgba(15,118,110,0.14)` | Dropdowns, elevated cards |
| `shadowLg` | `0 8px 32px rgba(15,118,110,0.18)` | Modals |
| `shadowGlow` | `0 0 20px rgba(15,118,110,0.25)` | Active nav, glowing elements |

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `r` | 10px | Inputs, buttons, small cards |
| `rMd` | 14px | KPI cards, sensor cards |
| `rLg` | 18px | Glass cards, modals |
| `rFull` | 99px | Badges, pills |

## Component Library

### Cards

Glass cards with `backdrop-filter: blur(16px)`, warm cream background, subtle beige border, and inset white highlight. Card surfaces lift slightly on hover (`translateY(-3px)` + deeper shadow).

```css
.card {
  background: rgba(252, 248, 238, 0.65);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(235, 225, 205, 0.6);
  border-radius: 16px;
  padding: 24px 28px;
  box-shadow: 0 8px 30px rgba(148,163,184,0.08),
              inset 0 1px 1px rgba(255,255,255,0.8);
}
```

### KPI Cards

Compact cards for metric display. Value in large (32px/700) tabular font, label uppercased/13px/600.

### Sensor Cards

Card with colored top border (`border-top: 5px solid`). States:
- **VALID** (default): teal top border
- **OFFLINE**: red top border, `status-offline` badge
- **CRITICAL**: orange top border, `CRITICAL` badge
- **WARNING**: amber top border, `EXCEEDED` badge

### Buttons

Three variants:
- **Primary**: Teal gradient (`#0f766e` → `#0d6158`), white text, glow shadow
- **Ghost**: Transparent with teal-tinted border, muted text, blue on hover
- **Danger**: Red gradient (`#ef4444` → `#dc2626`), white text

All buttons: `height: 38px`, `border-radius: 10px`, `font-weight: 700`.

### Forms

- **Inputs / Selects**: `height: 44px`, glass background, `border-radius: 10px`, focus ring with teal glow
- **Labels**: 13px/600, uppercase, 0.05em spacing
- **Toggles**: 34x18px pill, teal when active, slate when off, 14px circular knob

### Tables

- Header: `rgba(245,238,224,0.7)` background, 12px/700 font
- Cells: monospace, `tabular-nums`, 13px
- Row hover: teal tint at `rgba(15,118,110,0.03)`
- Sortable columns with `▲`/`▼`/`⇅` indicators

### Badges

Pill-shaped (`border-radius: 20px`), 11px/700 font, colored background at 8% opacity with matching border at 18-20% opacity.

| Badge | Text color | Background |
|---|---|---|
| Online | `#0d9488` | `rgba(13,148,136,0.08)` |
| Offline | `#be123c` | `rgba(190,18,60,0.08)` |
| Success | `#059669` | `rgba(5,150,105,0.08)` |
| Error | `#dc2626` | `rgba(220,38,38,0.08)` |
| Warn | `#d97706` | `rgba(217,119,6,0.08)` |
| Info | `#2563eb` | `rgba(37,99,235,0.08)` |
| Enabled | `#0f766e` | `rgba(15,118,110,0.08)` |
| Disabled | `#64748b` | `rgba(100,116,139,0.08)` |

### Modals

- Overlay: `rgba(15,23,42,0.35)` with `backdrop-filter: blur(10px)`
- Container: glass card with `border-radius: 20px`
- Entry animation: `modalIn` — 0.35s cubic-bezier, slide up + scale
- Sizes: 420px (sm), 560px (default), 800px (lg), 1000px (xl)

### Toast Notifications

Fixed bottom-right, stacked. Backgrounds at 85% opacity with `backdrop-filter: blur(12px)`. Color-coded left border:
- **Default / success**: teal background, teal left border
- **Error**: red background, red left border
- **Warn**: amber background, amber left border
- **Info**: blue background, blue left border

Entry: 0.3s cubic-bezier spring animation.

### Section Title

18px/700 with a 4px-wide teal gradient accent bar to the left:

```css
.section-title::before {
  content: '';
  width: 4px;
  height: 18px;
  background: linear-gradient(to bottom, #0f766e, #14b8a6);
  border-radius: 4px;
}
```

### Status Dots

Online: 6px teal circle with `box-shadow: 0 0 8px #0d9488` glow effect.
Offline: 6px rose circle, no glow.

## Layout

### App Shell

```
┌──────────────────────────────────────┐
│            Top Bar (80px)            │
├──────────┬───────────────────────────┤
│ Sidebar  │     Content Area          │
│ (250px)  │     (flex: 1)             │
│          │                           │
│ nav btn  │   ┌── card ──────────┐    │
│ nav btn  │   │                  │    │
│ nav btn  │   └──────────────────┘    │
│ nav btn  │   ┌── card ──────────┐    │
│          │   │                  │    │
│          │   └──────────────────┘    │
└──────────┴───────────────────────────┘
```

- **Top bar**: 80px, glass background, site logo left, brand logo right
- **Sidebar**: 250px, glass background, vertical nav buttons with active state gradient
- **Content**: Scrollable, horizontal padding 24px
- **Login screen**: Centered card on radial-gradient background

### Grid System

| Class | Columns | Gap |
|---|---|---|
| `.grid-2` | 2 | 18px |
| `.grid-3` | 3 | 18px |
| `.grid-4` | 4 | 18px |
| `.grid-5` | 5 | 18px |

Responsive: 4-col → 2-col at 1200px, all → 1-col at 768px.

### Filter Grid

`.filter-grid`: 4-column layout for report/trend filter bars, collapses to 2-col at 992px.

## Page Background

Radial gradient with warm tones radiating from corners:

```css
body {
  background:
    radial-gradient(at 0% 0%, rgba(245,230,200,0.45) 0, transparent 45%),
    radial-gradient(at 50% 0%, rgba(253,244,215,0.5) 0, transparent 40%),
    radial-gradient(at 100% 0%, rgba(240,225,195,0.45) 0, transparent 45%),
    radial-gradient(at 0% 100%, rgba(245,235,210,0.4) 0, transparent 50%),
    radial-gradient(at 100% 100%, rgba(250,240,220,0.5) 0, transparent 50%),
    #faf6ee;
}
```

## Login Screen

- Card: 460px wide, glass surface with `backdrop-filter: blur(24px)`, `border-radius: 20px`
- Logo: 200px, centered, `drop-shadow(0 4px 6px rgba(15,118,110,0.06))`
- Title: gradient text (`#0f172a` → `#0f766e`), 24px/700
- Hover: card lifts 4px with enhanced shadow

## Motion

| Element | Duration | Easing | Property |
|---|---|---|---|
| Card hover | 0.25s | cubic-bezier(0.4,0,0.2,1) | transform, box-shadow |
| Button hover | 0.2s | cubic-bezier(0.4,0,0.2,1) | transform, border, shadow |
| Button active | instant | — | scale(0.97) |
| Input focus | 0.25s | cubic-bezier(0.4,0,0.2,1) | border, background, shadow |
| Nav hover | 0.2s | ease-in-out | background, color, translateX |
| Modal entry | 0.35s | cubic-bezier(0.34,1.56,0.64,1) | opacity, translateY, scale |
| Toast entry | 0.3s | cubic-bezier(0.175,0.885,0.32,1.275) | opacity, translateY, scale |
| Sensor card hover | 0.25s | cubic-bezier(0.4,0,0.2,1) | translateY, shadow |
| Nav button active | 0.2s | ease-in-out | translateX, gradient |

## Navigation

### Sidebar Item States

- **Default**: transparent background, `#475569` text, 13px/600
- **Hover**: `rgba(253,250,242,0.7)` background, teal text, `translateX(2px)`
- **Active**: teal gradient background, white text, `translateX(4px)`, green left border (5px), `shadowGlow`

### Active Nav Button

```
background: linear-gradient(135deg, #0f766e, #14b8a6);
color: #fff;
border-left: 5px solid #34d399;
box-shadow: 0 8px 20px rgba(15,118,110,0.25);
transform: translateX(4px);
border-radius: 12px (left), 12px (right);
```

## Iconography

Inline SVG icons with `currentColor` stroke, `strokeWidth: 2.5`. Used for navigation items, status indicators, and inline actions. Default stroke color: `#64748b` (sidebar), white on active nav.

## Non-visual: Accessibility & Offline

- Inter font is locally bundled (`woff2`) for 100% offline use — no Google Fonts dependency
- Table cells use `font-variant-numeric: tabular-nums` for aligned numeric columns
- Form inputs have clear focus rings with teal glow
- Toast messages have `pointer-events: all` for dismissability

## Rule: Don't Fight the Glass

The glass system works because every surface is translucent. Never use fully opaque backgrounds on cards, sidebars, or modals — always `rgba()` on the warm `#faf6ee` base so the radial gradient shows through. Opaque surfaces (pure white `#fff`) are reserved for modal content areas and datalist dropdowns where text readability is critical.
