---
name: session-history
description: Find, inspect, summarize, or search prior pi sessions/conversations. Use when the user asks to refer to previous sessions, inspect session history for a working directory, search across all conversations, recover prior tool output, or audit what was stored.
---

# Session History

Pi stores local session transcripts as JSONL files. Treat them as sensitive: they can contain user messages, assistant messages, tool calls, tool arguments, tool output, bash output, images as base64, cwd/session metadata, branching, compaction summaries, labels, model changes, token usage, and extension messages/state.

## Location

Default root:

```bash
session_root="${PI_CODING_AGENT_SESSION_DIR:-${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/sessions}"
```

Sessions are usually under:

```text
~/.pi/agent/sessions/--<cwd with / replaced by ->--/*.jsonl
```

Example for `/Users/miciah/.dotfiles`:

```text
~/.pi/agent/sessions/--Users-miciah-.dotfiles--/*.jsonl
```

## Quick commands

List recent sessions across all working dirs:

```bash
find "$session_root" -type f -name '*.jsonl' -print0 | xargs -0 ls -lt | head -50
```

List sessions for the current working directory:

```bash
encoded_cwd="$(pwd | sed 's#/#-#g')"
find "$session_root/--$encoded_cwd--" -type f -name '*.jsonl' -print 2>/dev/null
```

Search all sessions for text:

```bash
rg -n "SEARCH_TEXT" "$session_root"
```

Show basic metadata for every session:

```bash
find "$session_root" -type f -name '*.jsonl' -print0 |
while IFS= read -r -d '' file; do
  python3 -c 'import json,sys; h=json.loads(open(sys.argv[1]).readline()); print(f"{h.get(\"timestamp\",\"\")}\t{h.get(\"cwd\",\"\")}\t{h.get(\"id\",\"\")}\t{sys.argv[1]}")' "$file"
done | sort
```

## File format reminders

- First line: `{"type":"session", ...}` with `id`, `timestamp`, `cwd`, version, and sometimes `parentSession`.
- Most transcript entries are `{"type":"message", "message": ...}`.
- `message.role` may be `user`, `assistant`, `toolResult`, `bashExecution`, `custom`, `branchSummary`, or `compactionSummary`.
- Assistant content blocks can include `text`, `thinking`, and `toolCall` blocks. Tool calls include name and full arguments.
- Tool result content stores returned text/images plus `isError`, `toolName`, and optional details.
- Entries form a tree via `id` / `parentId`; do not assume simple linear history if branches exist.
- Compaction is lossy for model context, but original earlier entries remain in the JSONL file.

When answering from session history, summarize relevant findings and cite session file paths/timestamps. Do not dump large transcripts or secrets unless the user explicitly asks.
