# CapsLock

A tiny native macOS agent with dual-role keys and a navigation layer:

- **Tap Caps Lock** within 200 ms without using another input: **Escape**
- **Hold/chord Caps Lock** with another key or mouse button: **Left Control**
- **Tap Return** within 200 ms without using another input: **Return**
- **Hold/chord Return** with another key or mouse button: **Right Control**
- **Tap `;`**: **`;`** (and Shift-`;` remains `:`)
- **Hold `;` + H/J/K/L**: **Left/Down/Up/Right**

Existing modifiers are preserved for Return and the navigation layer, so
Shift-Return and Shift-`;`+H/J/K/L continue to work as expected.

It does not install a virtual keyboard or system extension. IOKit maps Caps Lock
and Return to the left and right Control keys, and Semicolon to F18, at the HID
service. An active `CGEventTap` restores isolated taps and transforms H/J/K/L
while the Semicolon layer is held.

## Install

From the dotfiles repository:

```sh
just capslock-install
```

The installer tests and builds a signed `~/Applications/CapsLock.app`, stows the
LaunchAgent, and starts it. On first launch, grant **Input Monitoring** and
**Accessibility** from the temporary Caps Lock menu-bar item, then choose
**Restart Agent After Granting**. macOS may reveal the Accessibility request only
after the first restart; grant it and restart once more if needed. The item
disappears when setup is complete.

The agent reapplies the HID mappings when keyboards connect and after wake. If
it stops, Caps Lock and Return fall back to ordinary left and right Control keys,
and Semicolon falls back to F18 until launchd restarts the agent.

## Commands

```sh
~/Applications/CapsLock.app/Contents/MacOS/CapsLock --status
~/Applications/CapsLock.app/Contents/MacOS/CapsLock --apply-mapping
~/Applications/CapsLock.app/Contents/MacOS/CapsLock --remove-mapping
capslock-test
capslock-uninstall
```

Change `CAPSLOCK_TAP_MILLISECONDS` in
`~/Library/LaunchAgents/com.miciah.capslock.plist` to tune the 200 ms timeout,
then reload the LaunchAgent or rerun `capslock-install`.

## Limitations

The HID-level Control mappings work whenever their keyboard service is active,
but tap and navigation-layer actions require the logged-in GUI agent. They are
unavailable at the FileVault/login screen and whenever macOS prevents event
monitoring through Secure Input. Because the app observes the resulting Control
keys, tapping a physical Left Control by itself also emits Escape, while tapping
a physical Right Control emits Return. Held/chorded Control keys continue to
behave normally.
