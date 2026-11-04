import { resolve } from "node:path";
import { fail } from "./errors.ts";
import { run, runOutput } from "./process.ts";

export function gitOutput(repoRoot: string, args: string[]): string {
  return runOutput("git", args, repoRoot);
}

export function getGitRoot(cwd: string): string {
  const result = run("git", ["rev-parse", "--show-toplevel"], { cwd, allowFailure: true });
  if (result.status !== 0) {
    fail("command must be run from inside a Gertrude git checkout");
  }
  return resolve(result.stdout.trim());
}
