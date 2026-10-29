# Gertrude tasks: Rex + OpenCode

`gt` handles creating and retiring tasks. Use Rex to switch between them, and
manage OpenCode conversations/tabs however you like. No task daemon or UI plugin.

## Rex command palette

Search **Gertrude** in Rex's command palette:

- New Task… / Review PR… / Fork Task…
- Finish Task… / Discard Task… / Refresh Task Databases…
- Open Support / Reopen Task… / Resume Task Setup…

These are thin Lua actions in `rex/.config/rex/gertrude.lua`; gt still owns all
provisioning and safety checks. `stow rex gt`, then `rex config reload` installs
them without restarting Rex. No keyboard bindings are changed.

The current Rex build does not expose a general native palette input form to Lua;
actions with required arguments are marked bindable-only by the app. The actions
therefore take no required arguments. **Open Support** runs directly, without a
temporary terminal. The other actions open an independent job session with a
readable session/tab name, such as **New Task** or **Refresh Task Databases**, for
input, confirmation, progress, and errors. Setup is not subject to the Lua action's
30-second deadline. The watcher CLI is resolved through your login shell with a
fallback to the macOS app's stable installation, because Rex.app's background PATH
may not include Rex itself. A scoped watcher removes the empty job session when its
terminal closes; it leaves renamed jobs or jobs with added tabs/panes alone.
Errors wait for Return so their output can be read. Blank input or Ctrl+C cancels
a prompt without executing its requested operation. Action titles omit the
redundant Gertrude prefix; they remain grouped in the **Gertrude** category.

The originating Rex session ID is captured before the job opens. Its registered
task is preselected, even though the job runs in another directory/session, except
**Reopen Task**, which always offers the task picker unless an explicit task was
passed. If there is no registered source task, the job asks which task to use; it
never guesses from a pane's cwd. Support is not included in disposable task choices.

Finish requires typing `finish <task>`, discard requires `discard <task>`, and DB
refresh requires `refresh <task>`. All underlying checks still apply. Palette
finish runs outside the target session so it can safely close that session;
running OpenCode agents still block deletion, even with discard.

After setup/open, gt asks the originating Rex app to show the resulting session.
If Rex Remote Control is disabled or that app disconnects, select the completed
task in Rex manually. Existing support refresh schedules remain unchanged.

Optional arguments are also accepted from CLI/key bindings, for example
`rex do gt_new name=example-task` and `rex do gt_pr number=943`. Destructive
actions always require the typed confirmation, even when passed a task argument.

Lua adapter test (all Rex calls mocked, no sessions or commands created):

```sh
rex do rex/.config/rex/gertrude.test.lua config="$PWD/rex/.config/rex/gertrude.lua"
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
Rex session with one OpenCode pane. They do not start application servers.

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
