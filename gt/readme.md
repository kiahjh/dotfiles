# Gertrude tasks: Rex + OpenCode

`gt` handles creating and retiring tasks. Use Rex to switch between them, and
manage OpenCode conversations/tabs however you like. No task daemon or UI plugin.

## Rex command palette

Search **Gertrude** in Rex's command palette:

- New Task… / Review PR… / Fork Task…
- Finish Task… / Discard Task… / Refresh Task Databases…
- Open Support / Reopen Task… / Resume Task Setup…
- Toggle Todo / Fire It Up

**Toggle Todo** opens the current task's `scratch/todo.md` in Neovim in a floating
pane. Run it again while that pane is focused to minimize it. If it's minimized,
unfocused, or in another tab, it comes back and takes focus. Quitting Neovim
closes the pane, and the next toggle opens a fresh one. The task is found from the
Rex session (`gt rex-todo`), never from a pane's cwd; the file is created if
missing and never overwritten.
The pane is labeled **Todos (N)**, where N counts lines starting with `- [ ]`
(indented ones included). The count updates while typing and when another
program edits the file, even while minimized. `gertrude_todo.nvim.lua` does this
and is loaded only into that pane's Neovim, not your normal config.

**Fire It Up** opens a **Servers** tab in the task session with two rows, each run
of three panes, each run in the task checkout. The top row has `just web dash`,
`just web account`, and `just web admin`. The bottom row has
`just web storybook-v2`, `just watch-api`, and an ngrok tunnel to the task's API port. The tunnel lets a phone on a different network reach the local
API; its pane shows the public URL first (`gertrude_ngrok.sh`), because ngrok's own
screen puts it below what a short pane can show. Running it again switches to the
Servers tab instead of starting a second set. Ctrl+C stops one server and leaves a
shell in the task where it can be rerun. Closing the tab stops its servers.

Both live in `rex/.config/rex/gertrude_panels.lua` and find the task with
`gt rex-task`/`gt rex-todo`.

The task lifecycle actions are thin Lua actions in `rex/.config/rex/gertrude.lua`; gt still owns all
provisioning and safety checks. `stow rex gt`, then `rex config reload` installs
them without restarting Rex. No keyboard bindings are changed.

Every question is asked natively in the command palette (`rex.ui.input` and
`rex.ui.pick`, Rex API revision 17 or later). gt decides what to ask: the Lua
action loops on `gt rex-plan <operation> <context>`, which answers with the next
question or with how to run, and puts each answer back in the context. An invalid
answer, such as a taken or malformed task name, comes back as the same question
with the problem in its title and your text ready to edit. Escape cancels without
changing anything. Action titles omit the redundant Gertrude prefix; they remain
grouped in the **Gertrude** category.

- **New Task** asks for a name. **Fork Task** asks for the fork's name.
- **Review PR** lists the open pull requests from GitHub (`gh pr list`); type to
  filter, or type a number that isn't listed. Without `gh`, it asks for a number.
  A PR that already has a review task reopens it instead.
- **Reopen Task** always shows the task list. The others use the source session's
  registered task, and show the list only when there isn't one. They never guess
  from a pane's cwd. Support is not included in disposable task choices.
- **Finish** and **Refresh Task Databases** confirm by choosing the one item,
  which names the task and says what happens. **Discard** loses work, so it
  requires typing `discard <task>`. Every one confirms, even when passed a task
  argument, and all underlying checks still apply. Titles stay short, because Rex
  cuts long ones off. A rejected answer's problem becomes the title.

Once everything is answered, **Open Support** and **Reopen Task** run directly,
without a terminal. Longer work runs in an independent job session with a readable
session/tab name, such as **New demo** or **Finish demo**, that only shows progress
and never asks for input; it isn't subject to the Lua action's 30-second deadline.
New, Review, Fork, and Resume Setup show their job and then switch to the task
when it's ready. Finish, Discard, and Refresh run in the background: the job
appears in the sidebar with its status and closes when done. If any job fails, it
comes to the front and waits for Return so its output can be read. Palette finish
runs outside the target session so it can safely close that session; running
OpenCode agents still block deletion, even with discard.

The watcher CLI is resolved through your login shell with a fallback to the macOS
app's stable installation, because Rex.app's background PATH may not include Rex
itself. A scoped watcher removes the empty job session when its terminal closes;
it leaves renamed jobs or jobs with added tabs/panes alone.

After setup/open, gt asks the originating Rex app to show the resulting session.
If Rex Remote Control is disabled or that app disconnects, select the completed
task in Rex manually. Existing support refresh schedules remain unchanged.

Answers can also be passed as arguments from the CLI or key bindings, which skips
those questions, for example `rex do gt_new name=example-task`,
`rex do gt_pr number=943`, or `rex do gt_finish task=demo confirm="finish demo"`.
Anything missing is still asked in the connected Rex apps.

Lua adapter test (all Rex calls mocked, no sessions or commands created):

```sh
rex do rex/.config/rex/gertrude.test.lua config="$PWD/rex/.config/rex/gertrude.lua"
rex do rex/.config/rex/gertrude_panels.test.lua config="$PWD/rex/.config/rex/gertrude_panels.lua"
```

## Commands

```sh
gt new duo-support
gt pr 943
gt fork alternative-design
gt finish duo-support
gt finish abandoned-spike --discard
gt support
```

`new` starts from freshly fetched `origin/master`. `pr` starts from the GitHub PR
head. Both restore isolated development/test databases from the scrubbed snapshot,
allocate ports, generate `swift/api/.env`, install web dependencies, and create one
Rex session with one OpenCode pane. They do not start application servers. Every
task also gets a gitignored `scratch/` with empty `prompt.md` and `todo.md`; existing
files are never overwritten.

Run `fork` inside a registered task. It creates a worktree at the parent's HEAD,
preserves staged and unstaged changes, copies untracked source, and copies **both
current databases** via `pg_dump`/`pg_restore`. The parent is not reset, disconnected,
or changed. Each database dump is individually consistent, not an atomic snapshot
across both databases and the filesystem. Avoid editing the parent while forking.
Ignored files, dependencies, build output, environment files, and common credential
files are not copied. Tracked generated source changes are retained like other code.

`spawn`, `review`, and `kill` remain aliases. `--no-open` (also `--agent`) provisions
without creating a Rex session. OpenCode conversation management is not part of gt.

## Storage and ownership

- Stable anchor clone: `~/.local/share/gt/gertrude`
- New linked worktrees: `~/active-projects/gertrude/<name>`
- Branches: `gt/<name>` (nested fork names are made path-safe)
- Resource records: `~/.local/state/gt/tasks/<uuid>.json`
- Port allocation: `.gtask-ports` in each checkout
- Secrets: the existing ignored dotfiles `gt/.env` and `gt/.env.template`

OpenCode's native worktree API creates/removes real Git worktrees. gt owns the
Gertrude resources. Use **gt finish**, not native worktree deletion, so databases
and reservations are cleaned up too. Closing OpenCode or Rex does not delete a task.
Keep the anchor clone while linked worktrees exist. OpenCode's saved Gertrude
canonical checkout is set to this anchor. Do not configure an OpenCode project
startup command as well; that would duplicate provisioning.

Task databases are pinned to local Postgres at `127.0.0.1:5432`; inherited PGHOST,
PGSERVICE, PGOPTIONS, and credentials cannot redirect operations to production.
Database names derive from stable task IDs, not mutable branch/session labels.
The scrubbed dump contains historical data, not live production state.
Forks check the running server version and use compatible dump/restore clients;
on macOS, a matching Homebrew installation is used when PATH points at older tools.

## Recovery and explicit refresh

```sh
gt list
gt open duo-support
gt setup duo-support
gt refresh-db duo-support
```

`open` recreates a missing Rex session but does not provision or reset resources.
`setup` resumes a failed provisioning step and preserves initialized databases.
`refresh-db` intentionally replaces both databases with the latest scrubbed dump;
it destroys task-local database edits. `setup-env-db` remains an alias for this
destructive operation. Partial setup/cleanup retains its resource record for retry.
If removing a finishing task's worktree stops partway, after Git has already
unregistered it, running finish again deletes the leftover directory itself. It
does this only when the checkout's `.git` still points to this task's repository
at a registration that no longer exists.
If a fork's initial code copy fails, inspect it or explicitly discard it rather
than treating it as a complete fork.

`finish` refuses dirty or unmerged work. Published Git ancestry or an exact matching
merged GitHub PR head (including squash/rebase merges) is required. If GitHub/fetch
verification fails, deletion fails closed. `--discard`/`--force` is explicit consent
to lose uncommitted/unmerged work. It never permits deleting a main checkout,
support, a redirected checkout, or an unrelated repository. Remote branches and
OpenCode conversation history are retained; the owned local task branch is removed.
Run finish from another Rex session. Running OpenCode agents block deletion even
with --discard; closing a terminal alone does not stop shared-service agent work.
Do not leave unrelated programs using a task after closing its Rex session.

## Existing Helve tasks

```sh
gt adopt '/absolute/path/to/Helve/worktree'
```

Adoption verifies the Helve ownership marker, checkout, existing local database
pair, and ports. It records them and opens Rex **without rewriting any of them**.
The checkout still depends on Helve's shared Git storage: keep that storage and
do not also delete the task in Helve. Retire adopted tasks through gt. New tasks
do not depend on Helve. Adopted tasks can be forked into the new worktree layout.

## Permanent support

`gt support` opens `~/active-projects/support`. It is not a disposable task and
cannot be finished. The outer repository holds durable customer/research history;
its ignored `gertrude/` directory is an independently auto-refreshed code reference,
not a development workspace. Multiple OpenCode conversations may share support.

The existing separate 30-minute code and scrubbed-database LaunchAgents and their
scripts are unchanged. gt does not pause, reschedule, or run those jobs on open.
Follow support's own AGENTS.md, privacy rules, and snapshot-freshness guidance.

## Limits

- This is filesystem/database isolation, not a security sandbox.
- Xcode/simulator/device resources can still be shared across tasks.
- Existing Gertrude code generation uses shared `/tmp/codegen`; do not run it
  concurrently across tasks until the product scripts make that path task-local.
- Database refresh is explicitly destructive and may fail with active connections.
- Tests use disposable Git repositories and fake local database/Rex/OpenCode CLIs;
  they never restore or delete real Gertrude/support databases.

Run tests with `bun test ./gt/.local/scripts`. Deployment uses `stow gt`.

Test/alternate-layout overrides: `GT_STATE_DIR`, `GT_TASKS_DIR`,
`GT_REPOSITORY_DIR`, `GT_REPO_URL`, `GT_OPENCODE_BIN`, `GT_ENV_TEMPLATE`,
`GT_SECRETS_FILE`, `GT_SCRUBBED_DUMP_PATH`. Do not change resource roots while
tasks are active. Normal use needs none of these.
