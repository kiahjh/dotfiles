import { MASTER_BRANCH } from "./constants.ts";
import { fail } from "./errors.ts";
import { run } from "./process.ts";

export function isValidSlug(slug: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug);
}

export function isValidTaskTitle(title: string): boolean {
  return title.split("/").every(isValidSlug);
}

export function validateSlug(slug: string): void {
  if (!isValidSlug(slug)) {
    fail(`invalid slug: ${slug}`);
  }

  if (slug === MASTER_BRANCH) {
    fail(`slug cannot be ${MASTER_BRANCH}`);
  }
}

export function validateTaskTitle(title: string): void {
  if (!isValidTaskTitle(title)) {
    fail(`invalid task title: ${title}`);
  }

  if (title === MASTER_BRANCH) {
    fail(`task title cannot be ${MASTER_BRANCH}`);
  }
}

export function validateGitBranchName(branchName: string): void {
  const result = run("git", ["check-ref-format", "--branch", branchName], { allowFailure: true });
  if (result.status !== 0) {
    fail(`invalid git branch name: ${branchName}`);
  }
}
