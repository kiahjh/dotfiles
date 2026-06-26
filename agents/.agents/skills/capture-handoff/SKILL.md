---
name: capture-handoff
description: Capture durable manual handoff context into gitignored scratch/agent ledgers for future Codex or agent sessions. Use when the user asks to capture context, write a handoff, save resume context, checkpoint manually, update ledgers, or prepare the next agent without relying on automatic compaction.
---

# Capture Handoff

Capture the current session's durable resume context for the next agent.

If the user includes a focus, use it to scope the handoff. Optimize for the next agent's fastest safe resume, not for audit history.

## Storage Layout

Use the project root as the base directory:

1. Prefer `git rev-parse --show-toplevel` when inside a Git worktree.
2. Otherwise use the current working directory.

Store handoff files under:

```text
scratch/agent/
  handoff.md
  ledger.<short-descriptive-slug>.md
```

If `scratch/` does not exist, create it. In a Git worktree, ensure the repository `.gitignore` at the Git root covers `scratch/`:

- Create `.gitignore` if needed.
- Add `scratch/` when no existing `.gitignore` entry already covers it, for example `scratch`, `scratch/`, `/scratch/`, or `scratch/**`.
- Do not duplicate ignore entries.

Because these files are gitignored, do not rely on grep/glob discovery that respects ignore rules. Use Bash commands such as:

```bash
ls scratch/agent/ledger.*.md 2>/dev/null || true
find scratch/agent -maxdepth 1 -name 'ledger.*.md' -print 2>/dev/null | sort
```

## Concepts

### `handoff.md`

`handoff.md` is the entrypoint/index, not a full history. It should be short and authoritative.

It should answer:

- What is the current focus?
- Which ledgers are part of the active resume path, and in what order?
- What is the immediate next step?
- Are there blockers/open questions?
- Are unreferenced ledgers archival/superseded?

Suggested shape:

```md
# Agent Handoff

Last updated: YYYY-MM-DD

## Current Focus

1-3 lines describing the active workstream and why it matters.

## Resume Path

Read these in order:

- `./ledger.some-topic.md` - why this file is worth reading
- `./ledger.other-topic.md` - only if independently useful

## Immediate Next Step

The next sensible action for a future agent.

## Open Questions / Blockers

- Only include items that could affect next actions.

## Notes

Unreferenced ledgers are archival unless explicitly listed above.
```

Sections may be omitted when empty. Keep the resume path focused.

### Ledgers

A ledger is a living context shard for a coherent topic, phase, subsystem, decision cluster, or gotcha set. It is not necessarily one session and it is not a diary.

Use descriptive slugs, not numbers:

```text
ledger.pi-handoff-design.md
ledger.current-implementation.md
ledger.sqlite-sync-gotchas.md
```

Suggested shape:

```md
# Ledger: Human Readable Topic

Updated: YYYY-MM-DD

## Summary

2-4 lines on what this ledger captures and why it matters.

## Current Truth

- Durable facts, decisions, and current state.
- Include paths only where they materially help resume work.

## Done / Material Progress

- User-meaningful progress; group related changes.

## Remaining / Next

- Outstanding work, next steps, open questions, blockers.

## Gotchas / Context

- Things future agents should not need to rediscover.
```

Omit or merge empty/repetitive sections. Prefer current truth over chronology.

## Aggressive Pruning Policy

Treat `scratch/agent/` as curated working memory. Prune aggressively when it improves resume clarity.

Allowed actions:

- Update an existing ledger in place.
- Trim stale or low-value details from ledgers.
- Merge useful parts of multiple ledgers into one ledger.
- Move content into a better-named ledger and delete the old one.
- Create a new ledger for a distinct topic/phase.
- Delete fully superseded ledgers.
- Rewrite `handoff.md` so the active resume path is short and accurate.

Default preference:

1. Keep the smallest set of files that preserves useful resume context.
2. Update/merge existing ledgers when that yields a clearer handoff.
3. Create a new ledger only for a meaningful topic or phase boundary.
4. If the active resume path would exceed about 3 ledgers, strongly consider consolidation.

Do not preserve ledgers merely because they existed. Preserve useful context, not history.

## What To Include

- What we are doing and why.
- Current user-facing/product/engineering goal.
- Durable decisions and preferences.
- Current state of relevant files/work.
- Meaningful completed work.
- Remaining work and the next sensible starting point.
- Blockers, unresolved failures, open questions.
- Gotchas/tooling notes that would save future time.
- Validation only when it changes how to resume, such as a known failing command, missing test, or specific regression risk.

## What To Omit Or Compress

- Transcript-like chronology.
- Routine tool noise, linter churn, transient build glitches.
- Exact test counts or "all tests pass" unless unusually important.
- Implementation micro-iterations that do not encode durable preference.
- Long file inventories when a grouped summary is enough.
- IDs, log lines, or request IDs unless necessary.
- Secrets or sensitive data, even though `scratch/` is gitignored.

## Procedure

1. Establish the project root and handoff directory.
2. Ensure `scratch/` exists and is gitignored when in a Git worktree.
3. Inspect existing handoff state:
   - `scratch/agent/handoff.md` if present.
   - All `scratch/agent/ledger.*.md` files via Bash `ls`/`find`.
   - Read ledgers referenced by `handoff.md` first, then any others only as needed for pruning/consolidation.
4. Inspect lightweight project state:
   - `git status --short` when in Git.
   - Relevant diffs or files only if needed to write an accurate handoff.
5. Use the current conversation plus inspected state to decide whether to update, merge, delete, rename, or create ledgers.
6. Write concise current-truth ledgers and update `handoff.md`.
7. Report what changed.

## Final Response

After editing, respond briefly with:

- Files updated/created.
- Ledgers deleted/renamed/consolidated, if any.
- Current resume path from `handoff.md`.
- Any caveat if you could not inspect something important.

Do not include a long duplicate of the ledger contents in chat.
