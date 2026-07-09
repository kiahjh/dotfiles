import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BASE_DIR, REPO_URL } from "./constants.ts";
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

export type ReviewTaskOptions = TaskLaunchOptions;

export function parsePullRequestNumber(value: string): number {
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    fail(`invalid pull request number: ${value}`, 2);
  }

  const number = Number(normalized);
  if (!Number.isSafeInteger(number)) {
    fail(`pull request number is too large: ${value}`, 2);
  }
  return number;
}

export function reviewTaskTitleForPullRequest(pullRequestNumber: number): string {
  return `review-${pullRequestNumber}`;
}

function validateReviewTaskTitle(taskTitle: string): void {
  validateSlug(taskTitle);
  validateTaskTitle(taskTitle);
  validateGitBranchName(taskBranchNameForTitle(taskTitle));
}

function reviewRequirements(options: ReviewTaskOptions): string[] {
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

export async function reviewTask(pullRequestNumber: number, options: ReviewTaskOptions = {}): Promise<void> {
  const taskTitle = reviewTaskTitleForPullRequest(pullRequestNumber);
  validateReviewTaskTitle(taskTitle);
  requireCommands(reviewRequirements(options));

  const branchName = taskBranchNameForTitle(taskTitle);
  const worktreeDir = taskWorktreeDirForTitle(taskTitle);
  const sessionName = sessionNameForSlug(taskTitle);
  const progress = new Progress(`Reviewing Gertrude PR #${pullRequestNumber}${options.agent ? " for an agent" : ""}`, 6 + launchStepCount(options));

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

  progress.step("Clone repository");
  progress.note(`${REPO_URL} → ${worktreeDir}`);
  run("git", ["clone", "--no-checkout", REPO_URL, worktreeDir], {
    inherit: true,
  });

  progress.step("Check out PR branch");
  progress.note(`refs/pull/${pullRequestNumber}/head → ${branchName}`);
  run("git", ["fetch", "origin", `+refs/pull/${pullRequestNumber}/head:refs/heads/${branchName}`], {
    cwd: worktreeDir,
    inherit: true,
  });
  run("git", ["switch", branchName], { cwd: worktreeDir, inherit: true });
  writeTaskMetadata(worktreeDir, taskTitle);
  progress.done(`Branch ${branchName}`);

  progress.step("Assign local ports");
  const ports = setupTaskPorts(worktreeDir, taskTitle);
  progress.done(`api ${ports.apiPort}, dash ${ports.dashPort}, site ${ports.sitePort}, account ${ports.accountPort}`);

  progress.step("Create local Postgres databases");
  const databaseNames = await setupTaskDatabases(taskTitle);
  progress.done(`${databaseNames.databaseName}, ${databaseNames.testDatabaseName}`);

  progress.step("Render swift/api/.env");
  try {
    writeSwiftApiEnv(worktreeDir, taskTitle, ports);
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
  progress.note(`PR: #${pullRequestNumber}`);
  progress.note(`PR ref: refs/pull/${pullRequestNumber}/head`);
}
