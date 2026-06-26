---
name: preflight-handoff
description: Read gitignored scratch/agent handoff context and summarize orientation before starting work. Use when the user asks for preflight, orientation, resume context, handoff review, or to read ledgers before continuing; stop after summarizing and wait for explicit approval before implementation.
---

# Preflight Handoff

Orient yourself from the project handoff files, then stop. Do not begin implementation.

If the user includes a focus, use it to scope the orientation summary.

## Non-Negotiable Behavior

This skill is preflight/orientation only.

Do not:

- edit files
- implement changes
- run tests/builds as a way of starting work
- fix problems you notice
- continue into the next step without explicit user approval

Only gather enough context to tell the user where things stand and what likely comes next. If the user's next message is something like "start", "go", "proceed", or "do it", then begin with the proposed next step.

## Storage Layout

Use the project root as the base directory:

1. Prefer `git rev-parse --show-toplevel` when inside a Git worktree.
2. Otherwise use the current working directory.

The handoff directory is:

```text
scratch/agent/
```

The entrypoint is:

```text
scratch/agent/handoff.md
```

Ledgers are:

```text
scratch/agent/ledger.<short-descriptive-slug>.md
```

These files are usually gitignored. Do not rely on grep/glob discovery that respects ignore rules. Use Bash commands such as:

```bash
ls scratch/agent/ledger.*.md 2>/dev/null || true
find scratch/agent -maxdepth 1 -name 'ledger.*.md' -print 2>/dev/null | sort
```

## Procedure

1. Establish project root and use it for all relative handoff paths.
2. Read relevant project instructions:
   - Read `AGENTS.md` at the project root if present.
   - If the current working directory is different from the project root and has its own `AGENTS.md`, read that too.
3. Read `scratch/agent/handoff.md` first, if it exists.
4. From `handoff.md`, identify the active resume path and read the referenced ledgers in order.
   - Referenced paths are usually written like `./ledger.some-topic.md` relative to `scratch/agent/`.
   - Read only active ledgers referenced by the handoff unless the handoff is missing, stale, or unclear.
5. List other `scratch/agent/ledger.*.md` files, if any, but treat unreferenced ledgers as archival unless needed to resolve ambiguity.
6. Check lightweight repo state with `git status --short` when in Git.
7. Summarize briefly and stop.

If no handoff exists, say so. If ledgers exist without a handoff, mention them and read only what is necessary to understand whether there is obvious active context. Do not invent certainty.

## Output Format

Keep the response under about 20 lines.

Include:

```md
Read:
- `scratch/agent/handoff.md`
- `scratch/agent/ledger.some-topic.md`

Where we are:
- ...

What's done:
- ...

Likely next:
- ...

Open questions/blockers:
- ...

Waiting for your instruction before starting work.
```

Omit empty sections. Keep it terse. Do not paste full ledger contents.
