import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { BASE_DIR } from "./constants.ts";
import { fail } from "./errors.ts";
import { run, runOutput, type RunResult } from "./process.ts";
import { isValidSlug } from "./slug.ts";
import { findTaskRootByTitle, taskWorktreeDirForTitle } from "./task.ts";

export function git(repoRoot: string, args: string[], allowFailure = false): RunResult {
  return run("git", args, { cwd: repoRoot, allowFailure });
}

export function gitOutput(repoRoot: string, args: string[]): string {
  return runOutput("git", args, repoRoot);
}

export function fetchRemoteTrackingBranch(repoRoot: string, branch: string): boolean {
  const refspec = `+refs/heads/${branch}:refs/remotes/origin/${branch}`;
  return git(repoRoot, ["fetch", "origin", "--prune", refspec], true).status === 0;
}

export function remoteTrackingRefExists(repoRoot: string, branch: string): boolean {
  return git(repoRoot, ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`], true).status === 0;
}

export function getGitRoot(cwd: string): string {
  const result = run("git", ["rev-parse", "--show-toplevel"], { cwd, allowFailure: true });
  if (result.status !== 0) {
    fail("command must be run from inside a Gertrude git checkout");
  }
  return resolve(result.stdout.trim());
}

export function taskRootFromArg(taskArg: string | undefined, cwd: string): string {
  if (!taskArg) {
    return getGitRoot(cwd);
  }

  const exactPath = resolve(join(BASE_DIR, taskArg));
  if (!taskArg.includes("/") && exactPath.startsWith(`${resolve(BASE_DIR)}/`) && existsSync(exactPath)) {
    return exactPath;
  }

  const titlePath = taskWorktreeDirForTitle(taskArg);
  if (existsSync(titlePath)) {
    return resolve(titlePath);
  }

  const metadataPath = findTaskRootByTitle(taskArg);
  if (metadataPath) {
    return metadataPath;
  }

  fail(`task checkout does not exist: ${taskArg}`);
}

export function ensureTaskRoot(repoRoot: string): void {
  const expectedParent = resolve(BASE_DIR);
  if (resolve(dirname(repoRoot)) !== expectedParent) {
    fail(`refusing to delete ${repoRoot}; expected a direct child of ${expectedParent}`);
  }

  const slug = basename(repoRoot);
  if (!isValidSlug(slug)) {
    fail(`refusing to delete ${repoRoot}; basename is not a valid task slug`);
  }
}
