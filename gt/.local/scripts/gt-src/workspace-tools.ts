import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { REPO_URL } from "./constants.ts";
import { fail } from "./errors.ts";
import { commandExists, run } from "./process.ts";
import { taskDirectoryNameForTitle } from "./task.ts";
import { repositoryDirectory, type Workspace } from "./workspace-state.ts";

export function opencodeBinary(): string {
  if (process.env.GT_OPENCODE_BIN) return process.env.GT_OPENCODE_BIN;
  if (commandExists("opencode")) return "opencode";
  const installed = join(homedir(), ".opencode", "bin", "opencode");
  if (existsSync(installed)) return installed;
  fail("OpenCode CLI not found; add ~/.opencode/bin to PATH");
}

export function oc<T>(method: string, path: string, body?: unknown, directory?: string): T {
  const args = ["api", method, path];
  if (directory) args.push("--header", `x-opencode-directory:${directory}`);
  if (body !== undefined) args.push("--data", JSON.stringify(body));
  const output = run(opencodeBinary(), args).stdout.trim();
  return (output ? JSON.parse(output) : undefined) as T;
}

export function git(directory: string, args: string[], allowFailure = false): string {
  return run("git", ["-C", directory, ...args], { allowFailure }).stdout.trim();
}

export function ensureRepository(): { directory: string; projectID: string } {
  const directory = repositoryDirectory();
  const remote = process.env.GT_REPO_URL || REPO_URL;
  if (!existsSync(directory)) {
    mkdirSync(dirname(directory), { recursive: true });
    run("git", ["clone", "--branch", "master", remote, directory], { inherit: true });
  }
  if (realpathSync(git(directory, ["rev-parse", "--show-toplevel"])) !== realpathSync(directory)
    || git(directory, ["remote", "get-url", "origin"]).replace("git@github.com:", "https://github.com/") !== remote.replace("git@github.com:", "https://github.com/")) {
    fail(`unexpected repository at ${directory}`);
  }
  const location = oc<{ project: { id: string; canonical: string } }>("get", "/api/location", undefined, directory);
  if (location.project.canonical !== directory) oc("patch", `/api/project/${encodeURIComponent(location.project.id)}`, { canonical: directory });
  const projects = oc<Array<{ id: string; commands?: { start?: string } }>>("get", "/api/project");
  if (projects.find((project) => project.id === location.project.id)?.commands?.start) {
    fail("this OpenCode project has a startup command; remove it before using gt (gt owns provisioning)");
  }
  return { directory, projectID: location.project.id };
}

export function verifyWorkspace(task: Workspace): void {
  if (!existsSync(task.directory) || realpathSync(task.directory) !== task.directory
    || realpathSync(git(task.directory, ["rev-parse", "--show-toplevel"])) !== task.directory
    || realpathSync(git(task.directory, ["rev-parse", "--path-format=absolute", "--git-common-dir"])) !== task.gitCommonDir) {
    fail(`task checkout is missing, redirected, or belongs to another repository: ${task.directory}`);
  }
}

export function assertNoActiveAgent(directory: string): void {
  const active = oc<{ data: Record<string, unknown> }>("get", "/api/session/active");
  for (const id of Object.keys(active.data)) {
    const session = oc<{ data: { location: { directory: string } } }>("get", `/api/session/${encodeURIComponent(id)}`);
    const location = session?.data?.location?.directory;
    if (typeof location !== "string" || !isAbsolute(location)) {
      fail("could not verify an active OpenCode agent's directory; refusing to finish the task");
    }
    if (location === directory || location.startsWith(directory + "/")) {
      fail("an OpenCode agent is still working in this task; stop it before finishing (even with --discard)");
    }
  }
}

type RexSession = { session_id: string; label: string };

export function rexSessions(): RexSession[] {
  return JSON.parse(run("rex", ["ls", "--json"]).stdout).sessions;
}

export function openRex(name: string, directory: string, existing?: string | null): string {
  const sessions = rexSessions();
  const found = existing ? sessions.find((session) => session.session_id === existing) : undefined;
  if (found) return found.session_id;
  const label = name === "support" ? "support" : `gertrude-${taskDirectoryNameForTitle(name)}`;
  if (sessions.some((session) => session.label === label)) fail(`Rex session ${label} already exists; refusing to create a duplicate`);
  const created = JSON.parse(run("rex", ["new", label, "--cwd", directory, "--window", "OpenCode", "--keep-open", "--json", "--", opencodeBinary(), directory]).stdout);
  if (typeof created.session_id !== "string") fail("Rex did not return a session ID");
  return created.session_id;
}
