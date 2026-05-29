import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BASE_DIR, MASTER_BRANCH, REPO_URL } from "./constants.ts";
import { dropDatabaseIfExists, setupTaskDatabases } from "./databases.ts";
import { writeSwiftApiEnv } from "./env.ts";
import { fail } from "./errors.ts";
import { launchCommandRequirements, launchStepCount, launchTaskUi, type TaskLaunchOptions } from "./launch.ts";
import { setupTaskPorts } from "./ports.ts";
import { requireCommands, run } from "./process.ts";
import { taskBranchNameForTitle, taskWorktreeDirForTitle, writeTaskMetadata } from "./task.ts";
import { Progress } from "./ui.ts";
import { validateGitBranchName, validateSlug, validateTaskTitle } from "./slug.ts";
import { deleteZellijSession, sessionNameForSlug, zellijSessionState } from "./zellij/session.ts";

export type CreateTaskOptions = TaskLaunchOptions;

function validateSpawnName(taskName: string): void {
  validateSlug(taskName);
  validateTaskTitle(taskName);
  validateGitBranchName(taskBranchNameForTitle(taskName));
}

function spawnRequirements(options: CreateTaskOptions): string[] {
  return [
    "git",
    "pnpm",
    "psql",
    "createdb",
    "dropdb",
    "gunzip",
    "sed",
    ...launchCommandRequirements(options),
  ];
}

export async function createTask(taskName: string, options: CreateTaskOptions = {}): Promise<void> {
  validateSpawnName(taskName);
  requireCommands(spawnRequirements(options));

  const taskTitle = taskName;
  const branchName = taskBranchNameForTitle(taskTitle);
  const worktreeDir = taskWorktreeDirForTitle(taskTitle);
  const sessionName = sessionNameForSlug(taskTitle);
  const progress = new Progress(`Spawning Gertrude task ${taskTitle}${options.agent ? " for an agent" : ""}`, 6 + launchStepCount(options));

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

  mkdirSync(BASE_DIR, { recursive: true });

  progress.step("Clone master");
  progress.note(`${REPO_URL}#${MASTER_BRANCH} → ${worktreeDir}`);
  run("git", ["clone", "--branch", MASTER_BRANCH, "--single-branch", REPO_URL, worktreeDir], {
    inherit: true,
  });

  progress.step("Create task branch");
  run("git", ["switch", "-c", branchName], { cwd: worktreeDir, inherit: true });
  writeTaskMetadata(worktreeDir, taskTitle);
  progress.done(`Branch ${branchName}`);

  progress.step("Assign local ports");
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
}
