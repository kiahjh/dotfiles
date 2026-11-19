# Themes

One palette per theme, switched everywhere at once:

```sh
theme                   # list themes; * marks the current one
theme set kiahgawa      # switch macOS, the wallpaper, Rex, OpenCode, Xcode, and Neovim
theme set               # pick with fzf, previewing each palette (theme swatches NAME)
theme next / prev       # cycle through themes
theme apply             # reapply the current theme (after Rex restarts, say)
theme wallpaper next    # cycle the current theme's wallpapers; also prev, list, or a name
theme lab               # open the palette lab for the current theme
```

`set`, `next`, `prev`, and `apply` accept `--only` or `--skip` with a
comma-separated list of `macos`, `wallpaper`, `rex`, `opencode`, `xcode`, and `neovim`.
An app that isn't running is skipped; one that fails doesn't stop the others.

## Layout

```text
<name>/palette.json     A theme: name, mode (dark or light), and every color
<name>/wallpapers/      Its wallpapers: HEIC at quality 90 (sips -s format heic -s formatOptions 90)
scripts/generate.py     Builds each app's files from a palette
scripts/theme.py        The `theme` command (launcher: bin/.local/bin/theme)
scripts/lab.py, lab/    The palette lab
tests/                  `just themes-test`
```

Generated files never go in the repository. `theme set` builds the theme into
`~/.local/share/themes/<name>/` and points `~/.local/share/themes/current` at
it, so switching never changes tracked files.

## How each app switches

- **macOS:** System Events sets dark or light appearance from the palette's
  `mode`, only when it differs. The first change asks for Automation access.
  Helium follows the system appearance on its own.
- **Helium:** its theme color (the Customize Helium hue) takes the background's
  hue, or the accent's when the background is gray, since Chromium uses only
  the hue.
  Helium reads it only at startup and rewrites its preferences on quit, so when
  the color changes `theme` quits Helium (pages with unsaved work can still
  stop that; then Helium is skipped), writes `browser.theme.user_color2`, and
  reopens it in the background with `--restore-last-session`. Chromium's live
  route, the `BrowserThemeColor` policy plus `--refresh-platform-policy`, needs
  root-owned managed preferences on macOS.
- **Xcode:** `theme` rewrites one Xcode 27 theme, **Current**, with every
  syntax color and the background set exactly (as OKLCH, which Xcode stores).
  Xcode reloads it when the file changes. Select **Current** once in Settings →
  Appearance → Theme → Choose…, in both light and dark appearance.
- **Wallpaper:** set on every display. Each switch to a theme shows its next
  wallpaper, so all of them come around before the first repeats; `apply`
  keeps the current one. macOS applies it to the current Space only. The first change saves macOS's previous wallpaper settings to
  `~/.local/state/theme/wallpaper-before-theme.plist`. Changes cross-fade:
  macOS swaps the picture all at once a couple of seconds after it's set, so
  `theme` covers each display with the old picture (just below the desktop
  icons), sets the new one, waits out the swap, and fades the cover over
  `FADE_SECONDS`. The fade runs on in the background, so `theme` doesn't wait
  for it. The
  `com.miciah.theme-wallpaper` LaunchAgent (in the `bin` package) runs
  `theme wallpaper next` every 10 minutes. To stop it, run
  `launchctl bootout gui/$(id -u)/com.miciah.theme-wallpaper`.
- **Rex:** each connected Rex app imports `rex/<name>`. Rex replaces its copy
  of a theme with the same name and selects it.
- **OpenCode:** reads theme files only when it starts, but applies a change
  to `theme.name` in `~/.config/opencode/cli.json` live. So `themes/<name>.json`
  (gitignored) links to every generated theme, and switching sets the name.
  Restart OpenCode once after adding a theme, and to see palette edits.
  OpenCode uses a one-mode theme for either mode.
- **Neovim:** `lua/theme` applies the palette on top of Kanagawa.nvim's Dragon
  variant, and each running Neovim watches `~/.local/share/themes` and reloads
  itself and lualine when the palette changes. Before any theme is set, it
  falls back to `kanagawa-dragon`.

## Making changes

Edit a palette in the lab or by hand, then `theme apply`. The lab's **Save**
writes `palette.json` and rebuilds that theme's files, so Neovim follows right
away when it's the current theme. Run `just themes-test` before committing:
the lab's contrast checks are advisory, and the tests aren't.

To add a theme, copy a theme directory, rename it, and change `name` to match.
The tests check every theme for complete tokens and readable contrast.

The lab previews the palette in mock-ups of the real apps, colored the way
each port colors them: Rex with OpenCode, Neovim, and zsh; Xcode; a terminal
with all 16 ANSI colors; and a contrast table. Point at anything in a preview
to see which colors it uses, and click it to edit that color. Press 1–4 to
switch previews and B to compare with the saved palette.

```sh
theme lab                                      # http://127.0.0.1:4173/
theme lab --theme NAME --terminal              # true-color terminal gallery
theme lab --theme NAME --terminal --follow     # follows unsaved browser edits
```

The lab binds only to loopback. With Playwright available,
`node themes/tests/lab-browser.mjs` smoke-tests a running lab without saving.

## Kiahgawa

A warmer, clearer cousin of Kanagawa Dragon: Dragon's warm charcoal
surfaces, slightly darker terminal panes, brighter text, comments, and borders,
and muted moss, dusty blue, mauve, and terracotta with a gold accent. It was
developed at [kiahjh/kiahgawa](https://github.com/kiahjh/kiahgawa) and moved
here; the palette is derived from MIT-licensed work credited in [NOTICE](NOTICE).

## Original Kanagawa Dragon (retained)

OpenCode and Rex also keep the Dragon palette from
[ethangilmore/zed-kanagawa](https://github.com/ethangilmore/zed-kanagawa/blob/e844633f3e64d208459d65f246190491ad0a61df/themes/Kanagawa.json),
originally based on [rebelot/kanagawa.nvim](https://github.com/rebelot/kanagawa.nvim),
outside the theme system:

- **OpenCode:** `opencode/.config/opencode/themes/kanagawa-dragon.json`, a
  complete native theme, selectable with `/themes`.
- **Rex:** `rex/.config/rex/themes/kanagawa-dragon`, matching Zed's 16 ANSI
  colors with a slightly darker pane background (`#141313`). Import it with
  `rex do client.theme.import path="$HOME/.config/rex/themes/kanagawa-dragon"`.
- **Neovim:** Kanagawa.nvim, which the theme system builds on.
