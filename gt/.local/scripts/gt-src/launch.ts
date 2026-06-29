import { openGhosttyTab } from "./ghostty.ts";
import { run } from "./process.ts";
import type { Progress } from "./ui.ts";
import { writeCachedLayout, writeTempLayout } from "./zellij/layout.ts";
import { sessionNameForSlug } from "./zellij/session.ts";

export type TaskLaunchOptions = {
  agent?: boolean;
};

export function launchCommandRequirements(options: TaskLaunchOptions): string[] {
  if (options.agent) {
    return [];
  }

  const commands: string[] = [];
  if (process.env.GT_SKIP_ZELLIJ !== "1") {
    commands.push("zellij", "pi", "nvim");
  }
  if (process.env.GT_SKIP_GHOSTTY !== "1") {
    commands.push("osascript");
  }
  return commands;
}

export function launchStepCount(options: TaskLaunchOptions): number {
  return options.agent ? 0 : 1;
}

export function launchTaskUi(taskTitle: string, worktreeDir: string, options: TaskLaunchOptions, progress: Progress): void {
  const sessionName = sessionNameForSlug(taskTitle);

  if (options.agent) {
    progress.skip("Agent mode: no zellij session or Ghostty tab.");
    return;
  }

  let layoutFile: string | undefined;

  if (process.env.GT_SKIP_ZELLIJ === "1") {
    progress.skip("Skipping zellij session because GT_SKIP_ZELLIJ=1.");
  } else if (process.env.GT_SKIP_GHOSTTY === "1") {
    const { layoutFile: temporaryLayoutFile, cleanup } = writeTempLayout(taskTitle, worktreeDir);
    try {
      progress.note(`Creating zellij session ${sessionName}`);
      run("zellij", ["--session", sessionName, "--new-session-with-layout", temporaryLayoutFile], {
        cwd: worktreeDir,
        inherit: true,
      });
    } finally {
      cleanup();
    }
  } else {
    layoutFile = writeCachedLayout(sessionName, taskTitle, worktreeDir);
  }

  if (process.env.GT_SKIP_GHOSTTY === "1") {
    progress.skip("Skipping Ghostty tab because GT_SKIP_GHOSTTY=1.");
  } else {
    progress.note(`Opening Ghostty tab ${taskTitle}`);
    openGhosttyTab(taskTitle, worktreeDir, sessionName, layoutFile);
  }
}
