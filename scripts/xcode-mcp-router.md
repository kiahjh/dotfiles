# Xcode MCP router

One globally available MCP server for all running Xcode versions. No versioned
application paths or `xcode-select` changes are needed. The router discovers the
actual running executable paths, verifies their Xcode bundle identity, and starts
each installation's own `mcpbridge` with its explicit `MCP_XCODE_PID` and
`DEVELOPER_DIR`. It does not open Xcode or projects itself.

## Setup / try it

1. Run `stow bin` from the dotfiles repository.
2. In each Xcode you want to use, open **Settings > Intelligence** and enable
   **Allow external agents to use Xcode tools**. Keep the desired projects open.
3. The global `opencode/.config/opencode/opencode.jsonc` entry launches the router
   using `uv`. Its inline dependency declaration pins the official MCP Python SDK;
   `uv` provisions Python and dependencies on first use and caches them afterward.
4. Check that `xcode` is connected in OpenCode's `/mcps`. Configuration hot-reloads;
   use `/reload` if needed. No OpenCode restart is required.
5. Ask: **“List all running Xcodes, then show the open workspaces in each one.”**
   Approve router calls and any Xcode connection prompts. This is a read-only
   first smoke test; no build or edits are necessary.

The router connects even when no Xcode is open. Xcodes launched later are found
on the next call; reconnecting is not required. Connections to closed instances
are cleaned up on the next call. PIDs are checked along with process start times
and app paths so a restarted Xcode does not reuse an old bridge connection.

## Three tools, schemas on demand

- `list_instances({})`: running Xcodes, PIDs, versions, builds, paths and bridge
  availability. Does not connect to any Xcode.
- `list_tools({xcode_pid, query?, include_schemas?})`: starts a connection lazily
  and returns that instance's instructions and tools. Defaults to compact names
  and descriptions; `query` is a case-insensitive substring filter. Use
  `include_schemas: true` to retrieve exact schemas for selected tools.
- `call_tool({xcode_pid, name, arguments})`: validates arguments against the
  selected Xcode's current schema and invokes the tool. Use the instance's own
  window/workspace-listing tool to identify the intended project. Window IDs
  from different Xcodes are not interchangeable.

Only the three router definitions and a short instruction are advertised up
front, not three copies of Apple's tool catalog. Different versions can expose
different tools/schemas without conflicts. Each instance has one persistent
bridge; calls are serialized within an instance but different instances can run
concurrently. Image content, structured results and tool error flags are retained.
OpenCode session metadata is forwarded (excluding the outer progress token).

## Safety / limitations

- The global permission rule asks before `xcode_call_tool`. **All underlying Xcode
  tools share this one permission action**; OpenCode cannot apply individual
  Apple-tool permissions inside the router. Only allow it broadly if you want
  all underlying tools, including editing/build/test tools, allowed broadly.
- Calls never silently select another instance and are never automatically
  retried. On failure, inspect the error and rediscover before deciding to retry;
  an interrupted operation may already have made changes.
- Startup and catalog requests time out after 30 seconds; tool calls after 12
  hours. Cancelling a router call sends MCP cancellation to its bridge. This is
  best effort: Xcode may continue an operation after cancellation.
- This adapter currently routes **tools only**, not Apple's MCP resources,
  prompts, sampling or elicitation. Xcode's own connection-approval UI still works.
- If an Xcode process exits while idle, its bridge is removed at the next router
  call. Exit OpenCode's MCP connection to release all remaining bridges.
- To disable the experiment, set `mcp.servers.xcode.disabled` to `true` in the
  global config. Remove its entry and `xcode_call_tool` permission to uninstall.

## Tests

```sh
just test-xcode-mcp-router
```

Uses fake Xcode bundles and real stdio MCP child processes to test multiple
versions, schema discovery, pagination, routing, metadata and content forwarding,
cancellation, PID reuse and subprocess cleanup. It does not change real projects.
