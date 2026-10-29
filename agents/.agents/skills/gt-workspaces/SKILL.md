---
name: gt-workspaces
description: Create, fork, review, open, and safely retire Gertrude task worktrees in Rex and OpenCode; open the permanent Gertrude support workspace.
---

# Gertrude task lifecycle

gt provisions Gertrude resources; Rex is the everyday session switcher. Do not
manage the user's conversations, panes, or tabs unless asked. Read `gt --help`
for the installed command interface.

The user can also search Gertrude in Rex's command palette. Open Support runs
without a temporary terminal; the other Lua actions open readably named temporary
job sessions for inputs/progress and use the captured source session ID to choose
a task. Empty job sessions are removed after their terminals close; renamed or
repurposed sessions are preserved. `gt rex-action` is the internal adapter, not a
way to bypass authorization or cleanup checks. Destructive palette actions require
a task-specific typed confirmation; support is never disposable.

- `gt list`: find registered tasks, including adopted Helve worktrees.
- `gt new <name>`: native worktree from latest origin/master, isolated scrubbed
  development/test DBs, ports, environment, dependencies, Rex with one OpenCode pane.
- `gt pr <number>`: the same, starting at the GitHub PR head.
- `gt fork <name>`: inside a task, copy committed + staged/unstaged/untracked source
  and both current databases into a new isolated task. Parent remains unchanged.
- `gt open [task]`: recreate a missing Rex session without resetting resources.
- `gt setup [task]`: resume incomplete provisioning; preserve initialized databases.
- `gt refresh-db [task]`: intentionally overwrite both DBs with the scrubbed snapshot.
- `gt finish [task]`: refuse unless clean and merged; remove owned DBs/worktree/Rex.
- `gt finish [task] --discard`: explicitly abandon uncommitted/unmerged work.
- `gt support`: permanent support repo, with existing automatic reference refreshes.

Use `--no-open` on new/pr/fork when the user wants an agent-only checkout, not a
Rex session. `spawn`, `review`, `kill`, and `--agent` remain compatibility aliases.

Never run finish/discard/refresh-db without the user's authorization for that
specific destructive action. Do not use native OpenCode worktree removal or rm to
retire a task: that bypasses resource cleanup. Do not delete the stable anchor at
`~/.local/share/gt/gertrude` or Helve shared storage while tasks depend on them.
Task records live outside checkouts in `~/.local/state/gt/tasks/`.

For an existing Helve task, `gt adopt <absolute-worktree>` verifies and retains its
existing resources. Never run the old Helve setup to reopen it: that restores DBs.
Adoption does not migrate Helve chat history or move the checkout.

Support at `~/active-projects/support` is not a task checkout. Read its AGENTS.md.
Keep its permanent Rex session named `support`, not renamed for individual cases.
Keep durable notes in the outer repo; product changes belong in a development
task, not its auto-refreshed ignored `gertrude/` reference. Never refresh support
merely because it was opened. Its code and scrubbed DB refresh every 30 minutes
through independent existing LaunchAgents. Never access production or expose secrets.

Use local Postgres, not Docker. Read the product database skill before DB work.
Follow the task's own AGENTS.md, including toolchain and verification instructions.
Do not run code generation concurrently across tasks: `/tmp/codegen` is still shared.
