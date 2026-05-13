import { existsSync } from "node:fs";
import { join } from "node:path";
import { dropDatabaseIfExists, setupTaskDatabases } from "./databases.ts";
import { writeSwiftApiEnv } from "./env.ts";
import { fail } from "./errors.ts";
import { ensureTaskRoot, getGitRoot } from "./git.ts";
import { launchCommandRequirements, launchStepCount, launchTaskUi, type TaskLaunchOptions } from "./launch.ts";
import { setupTaskPorts } from "./ports.ts";
import { requireCommands, run } from "./process.ts";
import {
  taskBranchNameForTitle,
  taskDirectoryNameForTitle,
  taskInfoForRoot,
  taskWorktreeDirForTitle,
  writeTaskMetadata,
} from "./task.ts";
import { Progress } from "./ui.ts";
import { validateGitBranchName, validateSlug, validateTaskTitle } from "./slug.ts";
import { deleteZellijSession, sessionNameForSlug, zellijSessionState } from "./zellij/session.ts";

export type ForkTaskOptions = TaskLaunchOptions;

function forkRequirements(options: ForkTaskOptions): string[] {
  return [
    "git",
    "rsync",
    "pnpm",
    "psql",
    "createdb",
    "dropdb",
    "gunzip",
    ...launchCommandRequirements(options),
  ];
}

function copyTaskWorktree(sourceDir: string, targetDir: string): void {
  run(
    "rsync",
    [
      "-a",
      "--exclude",
      ".gtask",
      "--exclude",
      ".gtask-ports",
      "--exclude",
      "swift/api/.env",
      "--exclude",
      "web/node_modules",
      "--exclude",
      ".git/index.lock",
      "--exclude",
      ".git/HEAD.lock",
      `${sourceDir}/`,
      `${targetDir}/`,
    ],
    { inherit: true },
  );
}

export async function forkTask(forkName: string, options: ForkTaskOptions = {}): Promise<void> {
  validateSlug(forkName);
  requireCommands(forkRequirements(options));

  const sourceRoot = getGitRoot(process.cwd());
  ensureTaskRoot(sourceRoot);
  const sourceInfo = taskInfoForRoot(sourceRoot);
  const taskTitle = `${sourceInfo.title}/${forkName}`;
  validateTaskTitle(taskTitle);

  const branchName = taskBranchNameForTitle(taskTitle);
  validateGitBranchName(branchName);

  const worktreeDir = taskWorktreeDirForTitle(taskTitle);
  const sessionName = sessionNameForSlug(taskTitle);
  const progress = new Progress(`Forking ${sourceInfo.title} → ${taskTitle}${options.agent ? " for an agent" : ""}`, 6 + launchStepCount(options));

  if (existsSync(worktreeDir)) {
    fail(`target already exists: ${worktreeDir}`);
  }

  if (!options.agent && process.env.GT_SKIP_ZELLIJ !== "1") {
    const sessionState = zellijSessionState(sessionName);
    if (sessionState === "active") {
      fail(`zellij session already exists: ${sessionName}`);
    }

    if (sessionState === "exited") {
      progress.note(`Deleting resurrectable zellij session ${sessionName}`);
      deleteZellijSession(sessionName);
    }
  }

  progress.step("Copy current task");
  progress.note(`${sourceRoot} → ${worktreeDir}`);
  copyTaskWorktree(sourceRoot, worktreeDir);

  progress.step("Create fork branch");
  run("git", ["switch", "-c", branchName], { cwd: worktreeDir, inherit: true });
  writeTaskMetadata(worktreeDir, taskTitle);
  progress.done(`Branch ${branchName}; title ${taskTitle}`);

  progress.step("Assign fresh local ports");
  const ports = setupTaskPorts(worktreeDir, taskTitle);
  progress.done(`api ${ports.apiPort}, dash ${ports.dashPort}, site ${ports.sitePort}`);

  progress.step("Create local Postgres databases");
  const databaseNames = await setupTaskDatabases(taskTitle);
  progress.done(`${databaseNames.databaseName}, ${databaseNames.testDatabaseName}`);

  progress.step("Render swift/api/.env");
  try {
    writeSwiftApiEnv(worktreeDir, taskTitle);
  } catch (error) {
    dropDatabaseIfExists(databaseNames.testDatabaseName);
    dropDatabaseIfExists(databaseNames.databaseName);
    throw error;
  }
  progress.done(join(worktreeDir, "swift", "api", ".env"));

  const webDir = join(worktreeDir, "web");
  if (!existsSync(webDir)) {
    fail(`expected web directory to exist: ${webDir}`);
  }

  progress.step("Install web dependencies");
  if (process.env.GT_SKIP_PNPM_INSTALL === "1") {
    progress.skip("GT_SKIP_PNPM_INSTALL=1");
  } else {
    run("pnpm", ["install"], { cwd: webDir, inherit: true });
  }

  if (launchStepCount(options) > 0) {
    progress.step("Open workspace");
  }
  launchTaskUi(taskTitle, worktreeDir, options, progress);

  progress.ready(`Ready: ${worktreeDir} (${options.agent ? "agent mode" : sessionName})`);
  progress.note(`Fork title: ${taskTitle}`);
  progress.note(`Fork branch: ${branchName}`);
}

export function forkTitleForCurrentTask(currentTaskTitle: string, forkName: string): string {
  return `${currentTaskTitle}/${forkName}`;
}

export function forkDirectoryNameForCurrentTask(currentTaskTitle: string, forkName: string): string {
  return taskDirectoryNameForTitle(forkTitleForCurrentTask(currentTaskTitle, forkName));
}
