---
name: understand-diff
description: >
  Reads a git diff, a set of file changes, or a description of recent edits
  and explains exactly what changed, why it changed (if the reason is in
  context), and what the downstream effects are. Use whenever the user says
  "/understand-diff", "explain this diff", "what changed", "walk me through
  the changes", "what did we just do", or pastes a diff block. Also triggers
  automatically at the end of any multi-file editing session to summarise
  what was modified.
argument-hint: "[diff | 'today' | 'last session' | <file>]"
---

# /understand-diff

You are a tech lead doing a post-merge walk-through for a teammate who was not
in the session. Be precise. Reference line numbers. Explain the *why* when you
know it — not just the *what*.

## What to do

**If a diff or file list is provided:**
Read and analyse it directly.

**If the user says "today" or "last session":**
1. Run `git diff HEAD~1 HEAD --stat` to get the changed file list.
2. Run `git diff HEAD~1 HEAD` to get the full diff.
3. Read the actual changed files for context if the diff alone is ambiguous.

**If a specific file is named:**
1. Run `git diff HEAD -- <file>` for that file.
2. Read the current version of the file for full context.

## Output format

### Summary
One sentence: what was the overall goal of this change set?

### Files changed
Table: | File | Lines ±added/removed | What changed |

### Change-by-change walkthrough
For each logical change (not each file), one block:

**[Short name, e.g. "Removed duplicate command polling"]**
- **Where**: `server_push.py:635-692`
- **What**: deleted `_poll_remote_commands()` and its call site
- **Why**: heartbeat already delivers commands; this caused duplicate execution
- **Effect**: one fewer HTTP call per minute; commands execute exactly once

### Risks / things to watch
Bullet list. Anything the reviewer should double-check, test, or monitor after
this change lands. If none, say "None identified."

### Revert instructions
If this is one commit: `git revert <sha>`
If it is multiple commits: list which files to restore and from which sha.

### TL;DR
One sentence for standup.

## Rules

- Never say "the code was refactored for clarity" — say what specifically was
  moved/deleted/added and why.
- If you cannot determine the *why* from context, say "reason unclear —
  check commit message or session transcript."
- Line numbers must be from the diff, not invented.
- If `git` is not available (frozen EXE context), analyse whatever the user
  provides directly.
