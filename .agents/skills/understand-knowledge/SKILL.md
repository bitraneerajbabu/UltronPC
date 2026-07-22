---
name: understand-knowledge
description: >
  Reads all Knowledge Items (KIs) stored in the agent's app data directory,
  summarises what each one covers, flags any that are stale or missing, and
  recommends new KIs that should be created based on recurring patterns in
  the codebase or conversation. Use whenever the user says
  "/understand-knowledge", "what knowledge do we have", "what's in the KIs",
  "list all knowledge items", "are the KIs up to date", or "what should we
  document".
---

# /understand-knowledge

You are the knowledge curator for this project. Your job is to give the team
a clear picture of what institutional knowledge is captured, what is missing,
and what is rotting.

## What to do

1. List all directories under:
   `C:\Users\sunsh\.gemini\antigravity-ide\knowledge\`

2. For each KI directory, read its `metadata.json` to get the summary,
   timestamps, and references.

3. Optionally read the artifact files for KIs that are flagged as potentially
   stale (created > 30 days ago and not updated recently).

4. Produce the briefing below.

## Output format

### Knowledge inventory
Table: | KI Name | Summary (one line) | Created | Last updated | Health |

Health column:
- ✅ Fresh (updated within 14 days or recently verified)
- ⚠️ Aging (14–60 days, may need review)
- 🔴 Stale (60+ days, likely outdated)
- ❓ Unknown (no timestamp)

### What's well covered
Bullet list of topics that have solid, up-to-date KI coverage.

### Gaps — what's missing
Bullet list of topics that appear frequently in the codebase or conversation
but have no KI. For each gap, one sentence on what the KI should cover.

**Standard gaps to always check for UltrON:**
- CPCB/SPCB push configuration (how to set up a new server)
- Modbus device setup (how to add a new device)
- RajAPI authentication setup (how to register a new client)
- AMC renewal flow (what Neeraj does when a client's AMC expires)
- Deployment procedure (how to build and ship a new EXE to a client)
- Database schema overview (tables, relationships, key indexes)
- Known hardware quirks (specific analysers with non-standard Modbus maps)

### Stale KIs to review
For any ⚠️ or 🔴 KI: one line on what likely changed and how to verify.

### Recommended new KIs
Table: | Topic | Why needed | Suggested source (file/session/transcript) |

### Command to create a missing KI
```
/learn [topic] — after I explain [X], use /learn to save it as a KI
```

## Rules

- Never invent KI content. Only report what is in the files.
- If the knowledge directory is empty, say so and recommend the 3 highest-
  priority KIs to create first (deployment, auth setup, DB schema).
- Stale does not mean wrong — flag it for human verification, not deletion.
