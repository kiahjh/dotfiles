# Dotfiles

Managed with [GNU Stow](https://www.gnu.org/software/stow/) and [just](https://github.com/casey/just).

## How it works

Each top-level directory is a **stow package** — its contents mirror the home directory structure. Running `stow <package>` from this repo symlinks everything into `~`.

For example:
- `pi/.pi/agent/settings.json` → `~/.pi/agent/settings.json`
- `ghostty/.config/ghostty/config` → `~/.config/ghostty/config`
- `ohmyzsh/.zshrc` → `~/.zshrc`

## Packages

| Package    | What it configures             |
|------------|--------------------------------|
| `agents`   | Shared global agent skills    |
| `bin`      | Scripts in `~/.local/scripts/` |
| `capslock` | Native dual-role key app       |
| `ghostty`  | Ghostty terminal               |
| `git`      | Git config & global ignore     |
| `gt`       | Gertrude task helper script    |
| `nvim`     | Neovim config                  |
| `ohmyzsh`  | `.zshrc` and `.zshenv`         |
| `opencode` | opencode config                |
| `pi`       | pi agent settings & MCP        |
| `stow`     | Stow's own global ignore list  |
| `zellij`   | Zellij terminal multiplexer    |

## Commands

- **`just stow`** — Symlink all packages into `~`
- **`just capslock-install`** — Build, sign, install, and launch the Caps Lock agent
- **`just capslock-uninstall`** — Stop and remove the Caps Lock agent
- **`just`** (no args) — Interactive package chooser

## Adding files

To add a new config file, place it inside the appropriate package directory mirroring its path from `~`. For example, a pi extension at `~/.pi/agent/extensions/foo.ts` goes in:

```
pi/.pi/agent/extensions/foo.ts
```

Then run `just stow` (or `stow pi`) to create the symlink.

## Shared skills

Add reusable skills at `agents/.agents/skills/<skill-id>/SKILL.md`, with any
supporting files beside them. `stow agents` exposes the collection at
`~/.agents/skills/` for OpenCode and other compatible agents, and at
`~/.claude/skills/` through a compatibility symlink. Keep one authoritative
copy rather than separate per-tool installations. Existing Pi skills remain
in the `pi` package.
