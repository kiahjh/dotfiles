---
name: context-preflight
description: Read project-local saved agent state and orient before work. Use when the user asks to preflight, resume from a handoff, load saved agent context, compare saved state with the repository, or understand where prior work left off.
---

# Context Preflight

Orient yourself from the project's saved agent state, then stop. Do not begin implementation.

Use any focus, questions, or other context from the user's surrounding prompt to guide what optional context is worth reading.

## Non-negotiable behavior

This skill is preflight/orientation only.

Do not:

- edit files
- regenerate the dashboard
- implement changes
- run tests or builds as a way of starting work
- fix problems you notice
- continue into the next step without explicit user approval

Only gather enough context to explain where things stand, whether the saved state is still fresh, and what likely comes next. If the user's next message is “start,” “go,” “proceed,” “do it,” or equivalent, begin with the proposed next step.

## Storage layout

Use the project root as the base directory:

1. Prefer `git rev-parse --show-toplevel` inside a Git worktree.
2. Otherwise use the current working directory.

The context layout is:

```txt
scratch/agent/
  state.md
  dashboard.html
  context/
    <optional-topic>.md
```

Roles:

- `state.md` is the canonical agent entrypoint and source of truth. Always read it first.
- `dashboard.html` is a generated human-facing view. Do not use it as agent context or edit it.
- `context/*.md` contains optional supporting detail. Read selectively, not automatically.

These files are usually gitignored. Use Bash `find` or `ls` when discovering them rather than tools that may respect ignore rules.

## Procedure

1. Establish the project root and use it for all relative paths.
2. Read relevant project instructions:
   - project-root `AGENTS.md`, if present
   - a separate `AGENTS.md` in the current working directory, if applicable
3. Read `scratch/agent/state.md` first, if it exists.
4. Identify any `context/*.md` paths referenced from `state.md`, wherever its project-specific structure places them, and use the user's focus to decide which are necessary.
   - Read only files that can materially improve orientation for the current request.
   - Do not expect a fixed heading or document template.
   - Do not load every context file merely because it exists.
5. List other `scratch/agent/context/*.md` files, if any, but treat unreferenced files as stale or archival unless needed to resolve ambiguity.
6. Check lightweight repository state when in Git:
   - current branch
   - short HEAD commit
   - `git status --short`
7. Find the freshness information recorded in `state.md`, regardless of its labels or placement, and compare it with current Git state.
   - Clearly call out branch or commit drift.
   - Mention meaningful working-tree differences.
   - If freshness information is absent, say that staleness could not be verified.
   - Do not assume stale saved state is still correct.
8. Summarize briefly and stop.

## Missing or legacy state

If `state.md` does not exist:

- Say so clearly.
- If legacy `scratch/agent/handoff.md` or `ledger.*.md` files exist, read only enough active legacy context to orient.
- Identify it as legacy context and suggest running the `context-capture` skill later to migrate it.
- Do not perform the migration during preflight.

If only `dashboard.html` exists, do not treat it as canonical. Report that the Markdown source of truth is missing.

## Output format

Keep the response under about 20 lines.

Use this shape, omitting empty sections:

```md
Read:
- `scratch/agent/state.md`
- `scratch/agent/context/some-topic.md`

Freshness:
- Captured on `branch` at `abc1234`; current state is ...

Where we are:
- ...

What’s done:
- ...

Likely next:
- ...

Open questions/blockers:
- ...

Waiting for your instruction before starting work.
```

Do not paste full saved-state contents.
