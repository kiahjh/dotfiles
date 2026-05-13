---
name: gt-workspaces
description: Use the local Gertrude `gt` task helper to list, spawn, fork, and clean Gertrude task workspaces. Load when working on Gertrude, creating or forking GT tasks, choosing an isolated agent workspace, or explaining how to use `gt`.
---

# GT Workspaces

`gt` manages local Gertrude task checkouts under `~/active-projects/gertrude`.
Use it instead of hand-rolling clones, branches, task-local ports, databases, env files, or terminal sessions.

## When to use this skill

Use this skill when:

- The user asks to work on Gertrude or “GT”.
- You need a fresh isolated Gertrude checkout for agent work.
- You need to branch off from an existing Gertrude task for a tangent/spike.
- The user asks to list, spawn, fork, or kill Gertrude tasks.
- You are unsure which Gertrude task checkout should be used.

## Core commands

```bash
gt list
```

Lists current tasks, including fork relationships and path-safe directory names.
Run this before choosing an existing Gertrude task workspace.

```bash
gt spawn --agent <task-name>
```

Creates a fresh task from `origin/master` for agent work. This sets up the branch,
ports, local Postgres DBs, `swift/api/.env`, and web dependencies without opening
zellij or Ghostty.

```bash
gt spawn <task-name>
```

Same as above, but opens the human-facing zellij/Ghostty workspace. Only use this
when the user wants a workspace opened for them.

```bash
gt fork --agent <fork-name>
```

Run from inside an existing GT task checkout. Copies the current task into a new
fork titled `<current-task>/<fork-name>`, with fresh ports, databases, env files,
and branch metadata. Use for agent tangents, experiments, or risky changes that
may later be manually pulled back into the base task.

```bash
gt fork <fork-name>
```

Same as above, but opens the human-facing zellij/Ghostty workspace. Only use when
the user wants an interactive workspace opened.

```bash
gt kill
```

Run from inside a task checkout to delete it after safety checks. This is
destructive: do not run it unless the user explicitly asks you to remove the task.

All commands support `--help` / `-h`, e.g. `gt fork --help`.

## Agent workflow

1. If the user asks for Gertrude work and you are not already in the intended task,
   run `gt list`.
2. If an existing task matches the work, `cd` into its directory from the list.
3. If the work should start from master, run:
   ```bash
   gt spawn --agent <short-kebab-slug>
   ```
4. If the work is a tangent from the current task, run from that task:
   ```bash
   gt fork --agent <short-kebab-slug>
   ```
5. Do the requested work in the resulting task directory.

Default to `--agent` for work you are doing yourself. Omit `--agent` only when the
user explicitly asks for a human workspace/window/session.

## Naming rules

Task and fork names are single path segments:

- Start with a letter or number.
- Use letters, numbers, dots, underscores, and hyphens.
- Do not include `/` in the name you pass to `spawn` or `fork`.
- Prefer short kebab-case names, e.g. `billing-api-fix`, `settings-spike`.

Forks are titled internally as `<base>/<fork>`, but `gt` stores them in a
path-safe directory and branch. Use `gt list` rather than guessing fork paths.

## Important cautions

- Do not create root `.gtask` files manually. GT metadata belongs in the task's
  gitignored `scratch/.gtask` file.
- Do not manually edit `.gtask-ports` unless the user asks; use `gt setup-ports`.
- Do not manually recreate local databases/env unless needed; use `gt setup-env-db`.
- Do not run `gt kill` without explicit user approval.
