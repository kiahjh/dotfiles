---
name: context-capture
description: Capture durable resume context into a project-local agent state file. Use when the user asks to capture the current session, prepare a handoff before starting a new session, preserve resume context, or update saved agent state.
---

# Context Capture

Capture the current session's durable resume context for the next agent.

Use any focus, priorities, exclusions, or other context from the user's surrounding prompt when deciding what to preserve. Optimize for the next agent's fastest safe resume, not for audit history.

## Storage layout

Use the project root as the base directory:

1. Prefer `git rev-parse --show-toplevel` inside a Git worktree.
2. Otherwise use the current working directory.

Store context under:

```txt
scratch/agent/
  state.md
  context/
    <optional-topic>.md
```

Roles:

- `state.md` is the canonical agent entrypoint and source of truth.
- `context/*.md` contains optional durable detail that would make `state.md` noisy. Create these files sparingly.

If `scratch/` does not exist, create it. In a Git worktree, ensure the repository `.gitignore` at the Git root covers `scratch/`:

- Create `.gitignore` if needed.
- Add `scratch/` when no existing entry already covers it, such as `scratch`, `scratch/`, `/scratch/`, or `scratch/**`.
- Do not duplicate ignore entries.

Because these files are usually gitignored, use Bash `find` or `ls` when discovering them rather than tools that may respect ignore rules.

## `state.md`: canonical current state

`state.md` is one aggressively maintained living document, not an append-only diary. Rewrite and prune it on every capture.

Do not force it into a universal template. Choose headings and organization that make the current project easiest for a future agent to resume. A small bug fix, a product redesign, a migration, and an investigation should not necessarily produce the same document shape.

Ensure the document communicates the following when relevant, but combine, rename, order, visualize, or omit sections according to the work:

- what the user is trying to accomplish and why
- where the work currently stands
- material progress or completed outcomes
- what remains planned or in progress
- the immediate next action
- durable decisions and preferences
- open questions, blockers, failures, or risks
- relevant files, commands, or validation state
- optional context paths and when they should be read
- freshness information: capture time, Git branch, short commit, and concise working-tree state

These are information requirements, not predetermined headings.

Guidelines:

- Keep `state.md` compact enough to read at every preflight; target roughly 250 lines or fewer.
- Prefer current truth and actionable state over chronology.
- Use whatever Markdown best communicates the project: prose, concise lists, checklists, tables, diagrams, or a mixture.
- Keep only recent or material completed work. Delete detail once it no longer helps future work.
- Clearly reference every active optional context file with both what it contains and when to read it.
- Never include secrets or sensitive data.

## Optional context files

Create `context/<descriptive-slug>.md` only when information is independently useful and too detailed for `state.md`, for example:

- architecture or domain explanations
- durable decision history
- subsystem-specific gotchas
- detailed migration constraints
- research findings likely to matter again

There is no mandatory template for context files. Give each one a descriptive title, a freshness marker, and an organization suited to its content. Keep it current rather than chronological.

Update, merge, rename, or delete context files aggressively. Do not preserve them merely because they already exist. Prefer no optional files over weakly useful files, and strongly consider consolidation if more than about three are active.

## Legacy migration

Older captures may use:

```txt
scratch/agent/handoff.md
scratch/agent/ledger.*.md
```

When `state.md` is missing or clearly incomplete:

1. Read the legacy handoff and its active ledger path.
2. Consolidate all still-useful current truth into `state.md` and optional `context/*.md` files.
3. Verify that no durable information was lost.
4. Delete the superseded `handoff.md` and `ledger.*.md` files.

Do not carry forward stale chronology merely to preserve the old format.

## What to include

- Current user-facing, product, or engineering goal and why it matters.
- Durable decisions, constraints, and user preferences.
- Current state of relevant work and files.
- Meaningful completed outcomes.
- Remaining work and the next sensible starting point.
- Blockers, unresolved failures, and open questions.
- Gotchas that would save future rediscovery.
- Validation state only when it affects how to resume, such as a known failure or unrun critical test.

## What to omit or compress

- Transcript-like chronology.
- Routine tool noise, linter churn, or transient failures.
- Exact test counts unless unusually important.
- Implementation micro-iterations that encode no durable knowledge.
- Long file inventories.
- IDs or request logs unrelated to freshness.
- Secrets or sensitive data, even though `scratch/` is ignored.

## Procedure

1. Establish the project root and `scratch/agent/` directory.
2. Ensure `scratch/` exists and is ignored in a Git worktree.
3. Inspect existing state:
   - `scratch/agent/state.md`, if present
   - context files referenced by it first
   - other `scratch/agent/context/*.md` files only as needed for pruning
   - legacy handoff or ledger files when migration is needed
4. Inspect lightweight project state:
   - current branch and short HEAD
   - `git status --short`
   - relevant diffs or files only when needed for accuracy
5. Use the conversation and inspected state to rewrite concise current truth.
6. Update, create, merge, rename, or delete optional context files as justified.
7. Write `state.md` after the context-file set is settled so all references are accurate.
8. Delete any legacy `scratch/agent/dashboard.html`.
9. Verify that `state.md` and all context files it references exist.
10. Report what changed.

## Final response

Respond briefly with:

- `state.md` updated or created.
- Context files created, merged, renamed, or deleted.
- The immediate next step.
- Any caveat if important context could not be inspected.

Do not duplicate the full state contents in chat.
