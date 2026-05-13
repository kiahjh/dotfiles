import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./process.ts";

export function openGhosttyTab(slug: string, worktreeDir: string, sessionName: string): void {
  const script = String.raw`on run argv
  set taskSlug to item 1 of argv
  set taskDir to item 2 of argv
  set sessionName to item 3 of argv

  tell application "Ghostty"
    activate

    set cfg to new surface configuration
    set initial working directory of cfg to taskDir
    set initial input of cfg to "zellij attach " & quoted form of sessionName & linefeed

    if (count of windows) = 0 then
      set win to new window with configuration cfg
    else
      set win to front window
      set newTaskTab to new tab in win with configuration cfg
      select tab newTaskTab
    end if

    set term to focused terminal of selected tab of win
    perform action ("set_tab_title:" & taskSlug) on term
    focus term
  end tell
end run
`;

  run("osascript", ["-", slug, worktreeDir, sessionName], { input: script, inherit: true });
}

export function closeGhosttyTabScript(): string {
  return String.raw`on run argv
  set taskSlug to item 1 of argv

  tell application "Ghostty"
    try
      if (count of windows) > 0 then
        set frontTab to selected tab of front window
        if (name of frontTab as text) is taskSlug then
          close tab frontTab
          return
        end if
      end if

      repeat with w in windows
        repeat with t in tabs of w
          if (name of t as text) is taskSlug then
            close tab t
            return
          end if
        end repeat
      end repeat

      if (count of windows) > 0 then
        close tab (selected tab of front window)
      end if
    end try
  end tell
end run
`;
}

export function launchDetachedTabCloseAndSessionDelete(slug: string, sessionName: string): void {
  const dir = mkdtempSync(join(tmpdir(), "gt-kill-"));
  const helperPath = join(dir, "kill.sh");
  const script = `#!/bin/sh
set +e
# Give gt a moment to print and exit before closing its own tab.
sleep 0.5
osascript - "$2" <<'APPLESCRIPT'
${closeGhosttyTabScript()}APPLESCRIPT
sleep 0.3
zellij delete-session --force "$1" >/dev/null 2>&1 || true
rm -rf "$3"
`;

  writeFileSync(helperPath, script);
  chmodSync(helperPath, 0o700);

  const child = spawn("/bin/sh", [helperPath, sessionName, slug, dir], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
