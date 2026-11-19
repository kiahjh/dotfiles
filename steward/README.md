# Steward

Steward is a private macOS menu bar time tracker with daily and weekly pacing toward a 40-hour week.

## Run During Development

```sh
swift run Steward
```

The menu bar item shows two stacked progress lines:

```text
3:45 [||||||||--------] -4:15
30:00 [|||||||||||||||||---] -10:00
```

The first line is today. The second line is the week.

The History window includes calendar and daily-bar views for one week, plus a 10-week bar overview with previous/next range navigation and per-week goal markers.

## Build A Mac App

```sh
Scripts/build-app.sh
open build/Steward.app
```

To build and install Steward into `/Applications` (or `just steward-install` from the dotfiles root):

```sh
just install
```

Set `APPLICATIONS_DIR` if you want to install somewhere else, for example:

```sh
APPLICATIONS_DIR="$HOME/Applications" just install
```

Running from the `.app` bundle is the intended path for launch-at-login. Running with `swift run` is useful for development, but macOS may reject launch-at-login registration from a raw command-line executable.

## Theme

Steward takes its colors from the dotfiles theme: the accent, backgrounds, text and
chart colors all come from `~/.local/share/themes/current/palette.json`. It watches
`~/.local/share/themes`, so `theme set` recolors it live. Without a theme it uses the
system colors.

## Data

Steward stores local history and pacing settings here:

```text
~/Library/Application Support/Steward/work-sessions.json
~/Library/Application Support/Steward/weekly-goals.json
~/Library/Application Support/Steward/workday-plans.json
```

No accounts, sync, cloud storage, projects, tags, or notes are used in v1.

## Tests

```sh
swift test
```
