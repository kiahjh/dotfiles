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
| `bin`      | Scripts in `~/.local/scripts/` |
| `ghostty`  | Ghostty terminal               |
| `git`      | Git config & global ignore     |
| `nvim`     | Neovim config                  |
| `ohmyzsh`  | `.zshrc` and `.zshenv`         |
| `opencode` | opencode config                |
| `pi`       | pi agent settings & MCP        |
| `stow`     | Stow's own global ignore list  |
| `zellij`   | Zellij terminal multiplexer    |

## Commands

- **`just stow`** — Symlink all packages into `~`
- **`just`** (no args) — Interactive package chooser

## Adding files

To add a new config file, place it inside the appropriate package directory mirroring its path from `~`. For example, a pi extension at `~/.pi/agent/extensions/foo.ts` goes in:

```
pi/.pi/agent/extensions/foo.ts
```

Then run `just stow` (or `stow pi`) to create the symlink.
