# User Review

The agent workflow is in [SKILL.md](SKILL.md). The viewer, CLI, and tests live in `app/`.

## Setup

Requires Node 22.18+ and Bun. From the dotfiles root:

```sh
just user-review-build
stow agents bin
user-review demo
```

For a standalone skill installation, run `bun install --frozen-lockfile` and
`bun run build` in `app/`. Run its `bin/user-review.mjs` with Node if the optional
`~/.local/bin/user-review` launcher is unavailable. See `user-review --help` for commands.

## Comparisons

- Default: HEAD versus staged, unstaged, and non-ignored untracked files together.
- `--staged`: index only. `--base BASE --head HEAD`: an exact commit comparison.
  `--base` alone compares that commit to the working tree, not an implicit merge base.
- `--pr NUMBER_OR_URL`: fetch base/head from origin and compare their merge base,
  without checking out a branch. Requires `gh` and a local checkout.

Capture includes the entire comparison; there is no file allowlist. For mixed
feature work, isolate the comparison or include the other changes separately in
the plan. Submodule internals need their own review; LFS pointers are not hydrated.
Unresolved conflicts are rejected. Live PR capture is not yet tested end-to-end.

## Plans

`inspect` returns `{ snapshot, plan, state }`. Join units to files by `fileId`;
`before.text` and `after.text` hold captured source. Text units identify their
`hunkIndex` and original line ranges. Reorder those units with a plan:

```json
{
  "schema": 1,
  "snapshotId": "s-FROM-CAPTURE",
  "curated": true,
  "chapters": [{
    "id": "contract",
    "title": "Session type",
    "items": [{ "unitId": "u-FROM-CAPTURE" }]
  }]
}
```

Replace the example IDs. `plan` validates the snapshot, unique chapter IDs, and
exact coverage, including non-text and metadata units. Chapter IDs use letters,
digits, underscores, or hyphens (1–100 characters).

Optional strings: plan `summary`, chapter `description`, item `title`/`explanation`.
Items also accept `expanded` (default true) and `emphasis` (`normal`, `attention`,
or `mechanical`). Units are whole Git-style hunks; sub-hunk cuts and duplicate
context-only items are not supported.

## Saved reviews

Data stays in `~/Library/Application Support/User Review`, overridable with
`USER_REVIEW_HOME`. It contains captured source; keep it private and outside Git.
`open` starts/reuses the loopback server at `http://127.0.0.1:4731`.

Snapshots are immutable. Unique unchanged chunks retain progress across captures;
changed or ambiguous chunks need re-review. Outdated notes keep their original
context. Layout and wrapping preferences persist. Reviewed chunks start collapsed;
expanding one does not clear its status. Chunk headers stay visible while scrolling
their diff, keeping the review checkbox within reach. Copy notes exports only notes,
locations, and numbered original context, with a manual fallback if clipboard access fails.

Writes are serialized and atomic; stale tabs cannot overwrite a newer snapshot.
If a crash leaves `.write-lock`, remove that specific empty directory only after
checking no writer is alive. There is no cross-machine sync or automatic pruning.

## Development

Run `just user-review-build` and `just user-review-test` from the dotfiles root.
For first-time browser tests, run `bunx playwright install chromium` in `app/`.
Tests use isolated repositories and artifact roots, not saved reviews.

The UI and both syntax highlighters share `app/src/palette.json`. To refresh it,
run `node scripts/sync-theme.ts [palette-path]` in `app/`; the default source is
`~/active-projects/kiahgawa/palette/kiahgawa.json`. Builds can use the bundled palette.
Highlights is preferred, with Shiki JS as the WASM/SIMD fallback. Code uses the
locally installed Maple Mono Nerd Font with ligatures, then system monospace fallbacks.
