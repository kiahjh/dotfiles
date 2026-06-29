import { existsSync } from "node:fs";
import { join } from "node:path";
import { dropDatabaseIfExists, setupTaskDatabases } from "./databases.ts";
import { writeSwiftApiEnv } from "./env.ts";
import { fail } from "./errors.ts";
import { ensureTaskRoot, taskRootFromArg } from "./git.ts";
import { setupTaskPorts, taskPortsPath } from "./ports.ts";
import { requireCommands } from "./process.ts";
import { taskInfoForRoot } from "./task.ts";
import { validateGitBranchName, validateTaskTitle } from "./slug.ts";
import { Progress } from "./ui.ts";

export async function setupExistingTask(taskArg?: string): Promise<void> {
  requireCommands(["git", "psql", "createdb", "dropdb", "gunzip", "sed"]);

  const repoRoot = taskRootFromArg(taskArg, process.cwd());
  if (!existsSync(repoRoot)) {
    fail(`task checkout does not exist: ${repoRoot}`);
  }
  ensureTaskRoot(repoRoot);

  const task = taskInfoForRoot(repoRoot);
  validateTaskTitle(task.title);
  validateGitBranchName(task.branchName);

  const progress = new Progress(`Setting up env/db for ${task.title}`, 3);

  progress.step("Assign local ports");
  const ports = setupTaskPorts(repoRoot, task.title);
  progress.done(`api ${ports.apiPort}, dash ${ports.dashPort}, site ${ports.sitePort}, account ${ports.accountPort}`);

  progress.step("Create local Postgres databases");
  const databaseNames = await setupTaskDatabases(task.title);
  progress.done(`${databaseNames.databaseName}, ${databaseNames.testDatabaseName}`);

  progress.step("Render swift/api/.env");
  try {
    writeSwiftApiEnv(repoRoot, task.title, ports);
  } catch (error) {
    dropDatabaseIfExists(databaseNames.testDatabaseName);
    dropDatabaseIfExists(databaseNames.databaseName);
    throw error;
  }

  progress.ready(`Wrote ${join(repoRoot, "swift", "api", ".env")}`);
}

export function setupExistingTaskPorts(taskArg?: string): void {
  if (!taskArg) {
    requireCommands(["git"]);
  }

  const repoRoot = taskRootFromArg(taskArg, process.cwd());
  if (!existsSync(repoRoot)) {
    fail(`task checkout does not exist: ${repoRoot}`);
  }
  ensureTaskRoot(repoRoot);

  const task = taskInfoForRoot(repoRoot);
  validateTaskTitle(task.title);
  validateGitBranchName(task.branchName);

  const progress = new Progress(`Setting up ports for ${task.title}`, 1);
  progress.step("Assign local ports");
  const ports = setupTaskPorts(repoRoot, task.title);
  progress.ready(`Wrote ${taskPortsPath(repoRoot)}`);
  progress.note(`api ${ports.apiPort}, dash ${ports.dashPort}, site ${ports.sitePort}, admin ${ports.adminPort}, storybook ${ports.storybookPort}, account ${ports.accountPort}`);
}
