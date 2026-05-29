import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { execFileSync } from "node:child_process";

import { fail } from "./errors.ts";
import { ensureDir, isDirectory, physicalPath } from "./files.ts";

export interface RepoContext {
  readonly requestedCwd: string;
  readonly repoRoot: string;
  readonly relativeCwd: string;
  readonly repoName: string;
  readonly isGit: boolean;
}

export interface WorkspaceCopy {
  readonly tempRoot: string;
  readonly repoRoot: string;
  readonly cwd: string;
  readonly reviewDir: string;
  readonly homeDir: string;
  readonly tmpDir: string;
}

function gitOutput(args: string[], cwd: string): string | undefined {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

export function repoContext(cwdInput: string): RepoContext {
  if (!isDirectory(cwdInput)) {
    fail(`working directory not found: ${cwdInput}`);
  }

  const requestedCwd = physicalPath(cwdInput);
  const gitRoot = gitOutput(["rev-parse", "--show-toplevel"], requestedCwd);
  const repoRoot = gitRoot ? physicalPath(gitRoot) : requestedCwd;
  const relativeCwd = gitRoot ? relative(repoRoot, requestedCwd) || "." : ".";
  return {
    requestedCwd,
    repoRoot,
    relativeCwd,
    repoName: repoRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? "workspace",
    isGit: Boolean(gitRoot),
  };
}

function gitFiles(repoRoot: string): string[] {
  const output = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
    cwd: repoRoot,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "ignore"],
  }) as Buffer;
  return output.toString("utf8").split("\0").filter(Boolean);
}

function copyPath(src: string, dest: string): void {
  const stat = lstatSync(src);
  ensureDir(dirname(dest));
  if (stat.isSymbolicLink()) {
    symlinkSync(readlinkSync(src), dest);
  } else if (stat.isDirectory()) {
    mkdirSync(dest, { recursive: true });
  } else if (stat.isFile()) {
    copyFileSync(src, dest);
  }
}

function copyGitWorkingTree(repoRoot: string, destRoot: string): void {
  ensureDir(destRoot);
  for (const rel of gitFiles(repoRoot)) {
    const src = join(repoRoot, rel);
    if (!existsSync(src)) continue;
    copyPath(src, join(destRoot, rel));
  }
}

function copyDirectoryFallback(srcRoot: string, destRoot: string): void {
  cpSync(srcRoot, destRoot, {
    recursive: true,
    dereference: false,
    filter: (src) => {
      const name = src.split(/[\\/]/).at(-1);
      return name !== ".git" && name !== "node_modules" && name !== ".DS_Store";
    },
  });
}

export async function createWorkspaceCopy(context: RepoContext, label: string): Promise<WorkspaceCopy> {
  const tempRoot = await mkdtemp(join(tmpdir(), `mcc-${label}-`));
  const repoDest = join(tempRoot, "repo");
  const cwdDest = context.relativeCwd === "." ? repoDest : join(repoDest, context.relativeCwd);
  const reviewDir = join(repoDest, ".mcc-review");
  const homeDir = join(tempRoot, "home");
  const tmpDir = join(tempRoot, "tmp");

  if (context.isGit) {
    copyGitWorkingTree(context.repoRoot, repoDest);
  } else {
    copyDirectoryFallback(context.repoRoot, repoDest);
  }

  ensureDir(cwdDest);
  ensureDir(reviewDir);
  ensureDir(homeDir);
  ensureDir(tmpDir);
  return { tempRoot, repoRoot: repoDest, cwd: cwdDest, reviewDir, homeDir, tmpDir };
}

export function removeWorkspace(workspace: WorkspaceCopy): void {
  rmSync(workspace.tempRoot, { recursive: true, force: true });
}

export function listFilesRecursive(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      out.push(relative(root, full));
      if (entry.isDirectory()) walk(full);
    }
  }
  walk(root);
  return out.sort();
}
