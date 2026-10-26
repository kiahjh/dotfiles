# Themes

## Kiahgawa (active)

The shared palette, Neovim plugin, OpenCode theme, Rex theme, generator, tests,
and licenses live in [kiahjh/kiahgawa](https://github.com/kiahjh/kiahgawa).
These dotfiles install themes from GitHub, with no submodule or dependency on
a development checkout. Theme implementation does not live in this repository.

- **OpenCode:** `themes/kiahgawa.json` is a downloaded copy of the generated JSON.
  The global `cli.json` selects it in dark mode.
- **Rex:** `themes/kiahgawa` is a downloaded copy of the generated terminal theme.
  Reimport after updating: `rex do client.theme.import path="$HOME/.config/rex/themes/kiahgawa"`.
- **Neovim:** lazy.nvim installs `kiahjh/kiahgawa` from GitHub, pinned in
  `lazy-lock.json`, with Kanagawa.nvim as a dependency. Lualine uses Kiahgawa too.
  Existing instances can apply it with
  `:lua vim.cmd.colorscheme('kiahgawa'); package.loaded['plugins.lualine'] = nil; require('plugins.lualine').config()`.

The editable working checkout is `~/active-projects/kiahgawa`. Make changes,
regenerate, test, commit and push **there**, then run `just themes-update` here.
It resolves GitHub's `main` to one commit, downloads both generated theme files
from that exact commit, and pins Neovim to it in `lazy-lock.json`. Downloads are
validated before any files are changed. Review and commit the files and lockfile.

Run `:Lazy restore kiahgawa` in Neovim to install the new pin, then reload the
theme or reopen Neovim. Reimport the Rex theme using the command above.
OpenCode can reselect the theme with `/themes` if needed.

`just stow` links the app configs; theme downloads only happen on explicit update.
Installed themes work offline. No wallpaper is installed or changed.

## Original Kanagawa Dragon (retained)

OpenCode, Rex, and Neovim use the Dragon palette from
[ethangilmore/zed-kanagawa](https://github.com/ethangilmore/zed-kanagawa/blob/e844633f3e64d208459d65f246190491ad0a61df/themes/Kanagawa.json),
originally based on [rebelot/kanagawa.nvim](https://github.com/rebelot/kanagawa.nvim).
Base background: `#181616`; foreground: `#c5c9c5`. These are opaque dark themes;
the desktop wallpaper and Ghostty configuration are independent.

- **OpenCode V2:** `opencode/.config/opencode/themes/kanagawa-dragon.json` is a
  complete native V2 fallback theme, selectable with `/themes`. Syntax colors
  follow the Zed Dragon port; extra hue-scale shades support OpenCode's UI.
- **Neovim:** Kanagawa.nvim remains installed as Kiahgawa's dependency.
- **Rex:** `rex/.config/rex/themes/kanagawa-dragon` is a Ghostty-format theme
  matching Zed's 16 ANSI colors, with a slightly darker pane background
  (`#141313`) for softer contrast against Rex's surrounding UI.
  After `stow rex`, import and select it with:

  ```sh
  rex do client.theme.import path="$HOME/.config/rex/themes/kanagawa-dragon"
  ```

  If several Rex apps are connected, select one with `rex -C CLIENT do ...`.
  Rex saves the imported theme and selection in the app's own preferences.

## Upstream licenses

The adapted palette is MIT-licensed by both upstream projects:

```text
MIT License

Copyright (c) 2024 Ethan Gilmore
Copyright (c) 2021 Tommaso Laurenzi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
