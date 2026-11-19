# Focal

A tiny native macOS agent that shows one app per display, or two side by side,
and hides the rest so the wallpaper shows around them.

## Layouts

Each display has its own layout and is independent of the others.

- **Solo:** one app, its window centered and filling the display's usable area
  (excluding the menu bar and Dock) minus a 24pt gap on every side.
- **Pair:** two apps, left and right halves of that same area, with a 24pt gap
  between them. One side is the active side.

Every other app on that display is hidden.

## Behavior

- **Switching apps** (Cmd-Tab, Dock, clicking a window, opening a link, …):
  the app shows on its display.
  - Solo: it replaces the app that was there.
  - Pair, switching to the other side: both stay; the active side changes.
  - Pair, switching to a third app: it replaces the active side. The other
    side stays.
- **Pair mode on (⌃⌘P):** the current app and the app used just before it on
  this display become a pair: current on the left, previous on the right.
- **Pair mode off (⌃⌘P again):** the active app goes solo; its partner hides.
- **Swap sides (⌃⌘S):** the pair's apps trade places.
- **Next display (⌃⌘D):** the current app moves to the next display and shows
  there the same way as switching to it (replacing that display's solo app or
  active side). The display it left shows the app used just before it there,
  or its partner, solo, if it was paired.
- **New windows** get placed by the same rules as soon as they appear.
- Moving or resizing a window by hand is allowed; the next switch to that app
  puts it back.

## Rules

- Only regular apps (the ones with a Dock icon) count. Activating Raycast,
  Spotlight, menu bar apps, or password manager popups changes nothing.
- An app with no standard window changes nothing until it opens one. Clicking
  the desktop activates Finder, but doesn't clear the display.
- An app belongs to the display its focused window is on. Focal remembers this
  for hidden apps.
- Only standard windows are placed and counted. Dialogs, sheets, panels and
  Save windows are left alone.
- Windows that can't be resized are centered in their slot at their own size.
- macOS full-screen windows are left alone.
- An app with several windows: only its focused window is placed. The others
  stay where they are. (Revisit if this gets annoying.)
- No exceptions list yet: every regular app follows the rules.

## Install

From the dotfiles repository:

```sh
just focal-install
```

The installer tests and builds a signed `~/Applications/Focal.app`, stows the
LaunchAgent, and starts it. Grant **Accessibility** when macOS asks. If the
temporary Focal menu-bar item stays after that, choose **Restart Agent After
Granting**.

Change `FOCAL_GAP` in `~/Library/LaunchAgents/com.miciah.focal.plist` to tune the
gap, or set `FOCAL_DEBUG` to `1` to log every switch to
`~/Library/Logs/focal.err.log`. Then rerun `just focal-install`.

`just focal-uninstall` stops and removes it.

## Implementation

- Swift package in `focal/.local/src/focal`, built, signed and installed like
  `capslock`: `just focal-install` puts `~/Applications/Focal.app` behind the
  `com.miciah.focal` LaunchAgent.
- `FocalCore`: pure logic with unit tests: the per-display layout state, what
  each event does to it, and the frame math.
- `FocalAgent`: the macOS side.
  - `NSWorkspace` notifications for activation, launch, and termination.
  - `NSRunningApplication.hide()` / `unhide()` for visibility.
  - Accessibility (`AXUIElement`) to read and set window frames, and an
    `AXObserver` per app for new windows and focus changes. This needs the
    Accessibility permission.
  - Carbon `RegisterEventHotKey` for the shortcuts (no Input Monitoring).
- Hiding applies to a whole app, so an app with windows on two displays is
  hidden on both. Not handled in v1. If it comes up, hide individual windows
  by moving them off-screen, as AeroSpace does.

## Later

- An exceptions list (never hide, or float without hiding others).
- Tunable gap.
- Pause/resume shortcut.
