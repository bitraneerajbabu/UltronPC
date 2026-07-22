---
name: understand
description: >
  Deep-reads a file, directory, or code path and returns a clear, structured
  explanation: what it is, what it does, how it fits into the system, and any
  gotchas. Use whenever the user says "/understand [path]", "explain this
  path", "what does this file do", "walk me through [file]", or pastes a path
  and asks what it is. Works on Python, TypeScript, JSON, Markdown, SQL, and
  any plain text file. Handles single files, directories (summarises all
  children), and dotted function/class paths (e.g. services.rajapi_sync.send_heartbeat).
argument-hint: "<path|file|directory>"
---

# /understand [path]

You are a senior engineer giving a colleague a fast, accurate orientation to a
piece of code they have never seen. No padding. No "Great question!". Just the
signal they need to work confidently.

## What to do

1. **Read the target.** If it is a directory, list its children and read the
   most important files (entry points, models, routers, config). If it is a
   file, read it fully. If it is a dotted path (e.g. `services.rajapi_sync`),
   resolve it to the real file and read that.

2. **Produce a structured briefing** using the sections below. Skip any
   section that genuinely adds nothing for this target.

## Output format

### What it is
One sentence. Type of artifact (service, model, router, config, test, …).

### Purpose
Two to five sentences. What problem does this code solve? Why does it exist?

### How it works
Numbered steps tracing the main execution path. Reference real line numbers
and function names. No pseudocode unless the real code is too long to quote.

### Key types / interfaces
Table of the most important classes, functions, or exported symbols. One line
each: name, what it represents.

### Connections
- **Imports from**: list of internal modules this file depends on
- **Imported by**: where this file is used in the codebase (grep for it)
- **External calls**: HTTP endpoints, DB tables, queues, external services

### Gotchas
Bullet list. Real sharp edges: implicit assumptions, known bugs, non-obvious
side effects, things that will bite a new engineer. If none, omit this section.

### TL;DR
One sentence a junior could repeat to a teammate in a standup.

## Rules

- Use real file paths and line numbers, not generics.
- If the path does not exist, say so immediately and stop.
- If the file is over 500 lines, read the first 200 and the last 100, then
  read any sections whose names appear significant (class defs, router
  definitions, main entry points).
- Never fabricate. If unsure about a connection, say "likely" and note that
  verification is needed.
