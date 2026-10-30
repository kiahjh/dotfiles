# Ready to open

Global OpenCode V2 server + TUI plugin, enabled by the `./plugins/opener` entry
in the global config. Install the package and config together with
`stow opencode`. No additional dependencies needed at runtime; targets macOS
and OpenCode 2.2.4.

The agent's `opener.offer_open({ target, label? })` queues an item without opening
anything or waiting for the user. A passive **Ready to open** card appears above
that session's composer, with **Open**, **Dismiss**, and paging for multiple items.
The card uses the prompt's themed surface, an accent rail, and filled/hoverable
buttons. A compact filename or URL replaces noisy absolute paths; **Details**
opens a native OpenCode dialog with the complete destination before launching.
`/open` or **Open an offered file or link** in the palette provides keyboard
access; Ctrl+D dismisses the selected item in the chooser. Arrivals never show
a modal, notification, or launch an app.

- HTTP(S) links open in the default browser.
- HTML and SVG files open in the default HTTP browser, even if their file
  association points to an editor.
- Images and PDFs open in Preview. Text/Markdown/JSON/CSV/log/RTF files use their
  default app; folders use Finder.
- Relative paths resolve from the session directory; `~/` and local `file://`
  paths work too. The destination is always shown before opening.
- Scripts, executable files, apps, bundles, installers, and unknown file types
  are rejected. No shell strings, app names, or commands are accepted from the
  agent. Paths are revalidated on click and passed as separate process arguments.
- Pending items persist in OpenCode's plugin storage across restarts, are scoped
  to their session, and are removed on open/dismiss. Duplicate targets are
  coalesced; each session can have up to 20 pending offers.
- Launching happens in the **local TUI**, never on the server. Files from another
  hostname and remote-localhost URLs are refused rather than opening an unrelated
  local path. Remote files must first be downloaded locally.

There is deliberately no RPC or agent tool for launching. The server only queues
and dismisses items; only the user-facing TUI click/chooser calls macOS `open`.
A failed launch keeps the item available. The TUI refreshes on events and every
30 seconds to recover after reconnects.

Tests (fake launch runner; never opens an application):

```sh
bun test ./opencode/.config/opencode/plugins/opener/opener.test.ts
```

`card.test.tsx` additionally checks actual rendering at 32, 44, and 90 columns,
theme colors, hover feedback, and mouse actions. With matching OpenTUI 0.8.0,
Solid, and OpenCode theme SDK development dependencies available:

```sh
bun test --preload @opentui/solid/preload ./opencode/.config/opencode/plugins/opener/card.test.tsx
```
