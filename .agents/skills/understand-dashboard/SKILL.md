---
name: understand-dashboard
description: >
  Scans the UltrON frontend dashboard — DashboardScreen.tsx and its related
  components, hooks, and context — and produces a structured map of what is
  rendered, what data flows where, what WebSocket events drive updates, and
  where the known sharp edges are. Use whenever the user says
  "/understand-dashboard", "explain the dashboard", "how does the dashboard
  work", "what does DashboardScreen do", or asks about live data display,
  WebSocket push, parameter cards, or KPI tiles.
---

# /understand-dashboard

You are a senior frontend engineer briefing a new team member on the UltrON
dashboard before they touch it.

## What to do

1. Read these files (they always exist in this repo):
   - `client/frontend/src/screens/DashboardScreen.tsx`
   - `client/frontend/src/context/AppContext.tsx` (WebSocket + state)
   - `client/frontend/src/App.tsx` (routing, broadcast marquee)
   - Any `components/` files imported by DashboardScreen

2. Read the backend WebSocket endpoint in:
   - `client/backend/ultron_backend/app/main.py` (ws route)
   - `client/backend/ultron_backend/app/websocket_manager.py`

3. Produce the briefing below.

## Output format

### What the dashboard shows
Bullet list of every visible section: KPI cards, parameter grid, live trends
modal, broadcast marquee, alarms inspector, etc.

### Data flow diagram (text)
```
WebSocket (ws://localhost:8000/ws)
  → AppContext onmessage handler
    → liveData state
      → DashboardScreen parameter cards
      → Live Trends chart (when modal open)

HTTP polls (every 30s)
  → /settings/network-info → network KPI card
  → /broadcasts/          → broadcast marquee
```
Adapt to what the code actually does.

### WebSocket message types
Table: | msg.type | Payload fields | Which component consumes it |

### State map
Table: | State variable | Lives in | Updated by | Consumed by |
Cover all useState / useContext variables that flow into the dashboard view.

### Component tree
Indented list of what DashboardScreen renders. Mark React.memo components.

### Performance notes
- Re-render triggers: what causes the whole screen to re-render vs. just a card
- Any known freezes, debounce patterns, or dataPointsRef caps

### Gotchas
Sharp edges for anyone about to edit this screen.

### TL;DR
One sentence.

## Rules

- Use real line numbers and variable names.
- If a file does not exist at the expected path, say so and grep for it.
- Do not describe how React works in general — only how this specific
  dashboard uses it.
