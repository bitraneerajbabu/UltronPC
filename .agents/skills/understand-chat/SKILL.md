---
name: understand-chat
description: >
  Reads the current conversation transcript and produces a concise summary of
  what has been decided, what was built, what was deferred, and what still
  needs action. Use whenever the user says "/understand-chat", "summarise this
  session", "what did we do today", "catch me up", "session recap", or
  "what have we decided". Useful at the start of a new sub-session, after a
  long debugging thread, or when handing off to another engineer.
---

# /understand-chat

You are a tech lead writing the end-of-session standup note. Dense, factual,
no fluff.

## What to do

1. Read the current conversation transcript from the logs directory.
   Path: `C:\Users\sunsh\.gemini\antigravity-ide\brain\<conversation-id>\.system_generated\logs\transcript.jsonl`
   The conversation ID is available from your context.

2. Scan all `USER_INPUT` and `PLANNER_RESPONSE` steps.

3. Produce the briefing below.

## Output format

### Session goal
One sentence: what the user came in wanting to achieve.

### Decisions made
Bullet list. Each decision that will affect future work. Include the reasoning
if it was explicit (e.g. "Option A chosen over B because no RajAPI server
changes needed today").

### Work completed
Table: | What | File(s) changed | Result |
One row per distinct piece of work. Reference real files.

### Bugs found
Table: | ID | Severity | Status | One-line description |
Pull from Ultron_audit_report.json if it was updated this session.

### Deferred / open
Bullet list of things explicitly punted. Include the condition under which
they should be revisited.

### Next actions
Numbered list. The literal next steps if work were to continue right now.
Most important first.

### One-liner for standup
A single sentence a human could read aloud in 10 seconds.

## Rules

- Pull real data from the transcript. Do not paraphrase from memory.
- If the transcript is too large, read the last 50 steps — that is where
  decisions concentrate.
- If nothing was completed, say so. Do not invent progress.
- Timestamps: use the session date visible in the transcript, IST if available.
