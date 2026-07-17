---
name: context-capture
description: Capture durable resume context into a project-local agent state file and design a bespoke browser dashboard. Use when the user asks to capture the current session, prepare a handoff before starting a new session, preserve resume context, or update saved agent state.
---

# Context Capture

Capture the current session's durable resume context for the next agent, and create a useful visual status artifact for the user.

Use any focus, priorities, exclusions, or other context from the user's surrounding prompt when deciding what to preserve. Optimize for the next agent's fastest safe resume and the user's clearest view of the project, not for audit history.

## Storage layout

Use the project root as the base directory:

1. Prefer `git rev-parse --show-toplevel` inside a Git worktree.
2. Otherwise use the current working directory.

Store context under:

```txt
scratch/agent/
  state.md
  dashboard.html
  context/
    <optional-topic>.md
```

Roles:

- `state.md` is the canonical agent entrypoint and source of truth.
- `dashboard.html` is a human-facing interpretation of current state. It is not canonical.
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

## `dashboard.html`: bespoke user-facing artifact

Design `dashboard.html` from scratch on every capture.

Do not:

- use a reusable dashboard template
- invoke a deterministic renderer
- impose a standard set of sections or cards
- mechanically preserve the previous dashboard's structure
- treat the previous HTML as the source of truth

Instead, treat each capture as a fresh visual-design brief. Read the canonical Markdown and decide what visual form best explains this particular project right now.

Possible forms include, but are not limited to:

- a focused checklist or progress board
- a roadmap or timeline
- an architecture or data-flow diagram using inline SVG
- a migration matrix
- a debugging evidence board
- a decision comparison
- a compact single-screen status page
- a mixture of visuals, metrics, prose, and next actions

These are examples, not required components. Some dashboards should be visually rich; others should be intentionally minimal.

Dashboard requirements:

- Write a complete new `dashboard.html`, overwriting the old file rather than patching its layout.
- Make it immediately understandable in a browser and visually appropriate to the project.
- Use semantic HTML and deliberate typography, spacing, hierarchy, and color.
- Keep it responsive and readable on both wide and narrow windows.
- Prefer a self-contained file with inline CSS and, when useful, inline SVG or small inline JavaScript.
- Avoid external network dependencies unless the project specifically justifies them.
- Represent the current Markdown truth faithfully without copying every detail.
- Include freshness or provenance somewhere unobtrusive so the user can tell when the view was captured.
- Clearly indicate that the HTML is generated and that `state.md` is canonical.
- Escape project-provided text safely and never expose secrets.

The dashboard may summarize or visualize optional context, but the agent should continue to use Markdown—not HTML—for future preflight.

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
6. Update, create, merge, or delete optional context files as justified.
7. Write `state.md` after the context-file set is settled so all references are accurate.
8. Forget the previous dashboard layout and design a complete new `dashboard.html` suited to the current project and moment.
9. Verify that:
   - `state.md` and `dashboard.html` exist
   - the HTML reflects the current state and opens as a standalone document
   - all context files referenced from `state.md` exist
   - the dashboard identifies `state.md` as canonical
10. Report what changed.

If dashboard creation fails, preserve the correctly updated Markdown source of truth and report that the dashboard is stale or missing.

## Final response

Respond briefly with:

- `state.md` updated or created.
- Context files created, merged, renamed, or deleted.
- `dashboard.html` freshly redesigned, including its path and the visual approach chosen.
- The immediate next step.
- Any caveat if important context could not be inspected.

Do not duplicate the full state contents in chat.
