import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { dropDatabaseIfExists, taskDatabaseNames } from "./databases.ts";
import { ensureTaskRoot, getGitRoot } from "./git.ts";
import { launchDetachedTabCloseAndSessionDelete } from "./ghostty.ts";
import { collectKillSafetyFacts, confirmKillIfNeeded, evaluateKillSafety } from "./kill-safety.ts";
import { commandExists, requireCommands } from "./process.ts";
import { taskInfoForRoot } from "./task.ts";
import { Progress } from "./ui.ts";
import { sessionNameForSlug } from "./zellij/session.ts";

export async function killTask(): Promise<void> {
  requireCommands(["git", "zellij", "osascript"]);

  const repoRoot = getGitRoot(process.cwd());
  ensureTaskRoot(repoRoot);

  const task = taskInfoForRoot(repoRoot);
  const sessionName = sessionNameForSlug(task.title);
  const progress = new Progress(`Killing Gertrude task ${task.title}`, 3);

  progress.step("Check branch safety");
  const facts = collectKillSafetyFacts(repoRoot, task.branchName, task.title);
  await confirmKillIfNeeded(evaluateKillSafety(facts));

  progress.step("Delete worktree");
  process.chdir(dirname(repoRoot));
  rmSync(repoRoot, { recursive: true, force: true });
  progress.done(`Deleted ${repoRoot}`);

  progress.step("Clean up databases and terminal state");
  if (commandExists("dropdb")) {
    const names = taskDatabaseNames(task.title);
    dropDatabaseIfExists(names.testDatabaseName);
    dropDatabaseIfExists(names.databaseName);
    progress.done(`Deleted ${names.databaseName} and ${names.testDatabaseName}`);
  } else {
    progress.skip("dropdb not found; skipping local Postgres database cleanup");
  }

  launchDetachedTabCloseAndSessionDelete(task.title, sessionName);
  progress.ready(`Closing Ghostty tab and deleting zellij session ${sessionName}...`);
}
