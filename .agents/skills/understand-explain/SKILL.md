---
name: understand-explain
description: >
  Deep-explains a single file or function: its contract, its execution path,
  its side effects, its callers, and any known issues. More focused and
  surgical than /understand (which covers a path broadly). Use whenever the
  user says "/understand-explain [file/func]", "explain this function",
  "how does X work", "trace through Y", "what does this function do exactly",
  or highlights a specific function name and asks about it.
argument-hint: "<file.py | file.tsx | module.ClassName.method_name>"
---

# /understand-explain [file/func]

You are pair-programming with a colleague who just pointed at a function and
said "explain this to me before I touch it." Give them everything they need.
Nothing they don't.

## What to do

1. **Resolve the target.**
   - If it is a file path: read the file.
   - If it is a function/method name: grep the codebase to find it, then read
     the file containing it.
   - If it is a dotted path (e.g. `rajapi_sync.send_heartbeat`): resolve to
     file + function, read both the function and the module-level context.

2. **Find callers.** Grep for every place this function/class is imported or
   called. List them.

3. **Produce the briefing below.**

## Output format

### Signature
```python
async def send_heartbeat() -> None:
```
Exact signature with types. If TypeScript, include the interface/type.

### Contract
- **Inputs**: what each parameter means, valid values, what happens on None/empty
- **Output**: return value and its meaning; side effects (DB writes, HTTP calls,
  file writes, state mutations)
- **Preconditions**: what must be true before calling this
- **Postconditions**: what is guaranteed to be true after it returns

### Execution path
Numbered trace of the happy path. Reference real line numbers.
```
1. (L139) Opens AsyncSessionLocal, calls _load_rajapi_config(db)
2. (L143) Calls _get_system_stats() — blocks 0.5s for cpu_percent(interval=0.5)
3. (L169) POSTs to RAJAPI_SYNC_URL with 15s timeout
4. (L177) On 2xx: calls update_from_sync_response(data) → updates lock_store
5. (L180) Processes broadcasts: dedup by message+is_active, inserts new ones
6. (L216) Executes any commands in data["commands"]
```

### Error paths
Bullet list: what happens on each failure mode (network down, 401, 500,
DB error, malformed JSON response).

### Callers
Table: | File | Line | How called | Notes |

### Dependencies
- **Calls**: list of functions/services this function calls
- **Reads from**: DB tables, env vars, in-memory state
- **Writes to**: DB tables, files, in-memory state, external HTTP endpoints

### Gotchas
What will break a new engineer who edits this without reading carefully.
Known bugs, non-obvious assumptions, timing sensitivities.

### One-line summary
What this function IS in one sentence, suitable for a docstring.

## Rules

- Quote real code snippets with line numbers, not paraphrases.
- If a function is large (>60 lines), trace the skeleton and go deep on the
  tricky parts only.
- Never skip error paths — that is where bugs live.
- If the function does not exist, say so and suggest the closest match.
