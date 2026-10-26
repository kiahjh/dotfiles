# OpenAI subscription usage

Local OpenCode V2 server + TUI plugin, automatically discovered in the global
config's `plugins` directory. Run `stow opencode` from this repository to install.

Shows `[ 52% | Mon 2:07 AM | 2 resets ]` on the existing footer row, without
adding a line. Date/time uses the terminal's local timezone; banked resets are
omitted when zero or unknown. `/usage` refreshes and opens details.
Polls once a minute with a five-minute server cache (or until the weekly reset).
Manual refreshes have a ten-second cooldown. Failed requests show unavailable,
not a stale allowance.

Uses **Codex's login**, independent of OpenCode's model login. Runs a short-lived
`codex app-server --stdio` and calls only `initialize` and
`account/rateLimits/read`. Codex owns credential storage, refresh, and account
routing; the plugin never reads or copies tokens. No threads or model requests
are created, and banked resets are never redeemed. Requires an installed Codex
CLI signed in with a ChatGPT subscription (`codex login`). Looks for Codex at
`~/.local/bin/codex`, then on PATH; respects Codex's `CODEX_HOME` environment.

This avoids the HTTP 401 encountered when querying Codex's usage endpoint with
OpenCode's newer ChatGPT token-sharing token. OpenCode's login is unchanged.
`/usage` shows the allowance of the account signed into Codex, which may differ
from the account connected to OpenCode.

Tests: `bun test ./opencode/.config/opencode/plugins/openai-usage/usage.test.ts`
