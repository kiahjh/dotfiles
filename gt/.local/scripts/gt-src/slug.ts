import { MASTER_BRANCH } from "./constants.ts";
import { fail } from "./errors.ts";
import { run } from "./process.ts";

export function isValidSlug(slug: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug);
}

export function validateSlug(slug: string): void {
  if (!isValidSlug(slug)) {
    fail(`invalid slug: ${slug}`);
  }

  if (slug === MASTER_BRANCH) {
    fail(`slug cannot be ${MASTER_BRANCH}`);
  }
}

export function validateGitBranchName(branchName: string): void {
  const result = run("git", ["check-ref-format", "--branch", branchName], { allowFailure: true });
  if (result.status !== 0) {
    fail(`invalid git branch name: ${branchName}`);
  }
}

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
