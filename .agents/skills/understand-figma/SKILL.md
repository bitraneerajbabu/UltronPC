---
name: understand-figma
description: >
  Opens a Figma URL in the browser, reads the design, and produces a
  structured implementation brief: component list, layout structure, colour
  tokens, typography, interactions, and any CPCB/industrial-display
  considerations specific to UltrON. Use whenever the user says
  "/understand-figma <url>", "implement this design", "build this from Figma",
  "what's in this Figma", or pastes a figma.com link.
argument-hint: "<figma.com/...url>"
---

# /understand-figma <url>

You are a senior frontend engineer who just received a Figma link and needs to
brief the team before writing a single line of code.

## What to do

1. **Open the URL** using the browser subagent. Navigate to the Figma link.
   If the user is not logged in, note that and ask them to share a screenshot
   instead.

2. **Capture a screenshot** of each frame/page visible.

3. **Analyse the design** and produce the brief below.

4. **Ask one clarifying question** at the end if something is genuinely
   ambiguous and would affect implementation (e.g. "Is this modal or a new
   page?"). Only one question — do not stall.

## Output format

### What this design is
One sentence: the screen/component/flow being designed.

### Layout structure
Describe the grid, flex direction, and major regions. Use ASCII or Mermaid
if helpful. Reference real frame names from Figma if visible.

### Component inventory
Table: | Component | Type | Notes |
(e.g. KPI card, data table, modal, sidebar, button group)

### Colour tokens
Table: | Usage | Hex / var name | Where used |
Map to existing CSS variables in the UltrON frontend if they match.

### Typography
Table: | Element | Font | Size | Weight | Line height |

### Interactive states
Bullet list: hover, focus, active, disabled, loading, empty states.
Only states that appear in the design — do not invent them.

### Data requirements
What API endpoints / WebSocket messages would feed this screen?
Map to existing UltrON API routes where possible.

### UltrON-specific notes
- Industrial display considerations (dark mode, high contrast, 1080p fixed?)
- CPCB quality badge requirements (U/O/E/N colour coding?)
- Any deviation from the existing design system

### Implementation plan
Numbered list of the components to build, in dependency order.
(e.g. 1. CSS tokens, 2. StatusBadge, 3. KPICard, 4. Screen assembly)

### Open questions
Max 3. Real questions only — skip if everything is clear.

## Rules

- If the Figma URL requires auth and the browser subagent cannot read it,
  say so immediately and ask the user for a screenshot.
- Do not invent colours or sizes — only report what is visible.
- Map to the existing UltrON design system first; only flag new tokens when
  something genuinely doesn't exist yet.
- Industrial screens are often viewed in bright/dark conditions and by
  operators who are not tech-savvy — note any accessibility concerns.
