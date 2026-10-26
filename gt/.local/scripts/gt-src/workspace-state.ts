import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { BASE_DIR, TASK_PORT_BASE, TASK_PORT_BLOCK_SIZE, TASK_PORT_SLOT_COUNT } from "./constants.ts";
import { fail } from "./errors.ts";
import type { TaskPorts } from "./ports.ts";

export type Workspace = {
  version: 1;
  id: string;
  name: string;
  directory: string;
  branch: string;
  projectID: string;
  gitCommonDir: string;
  slug: string;
  postgres: { host: "127.0.0.1"; port: number; username: string };
  ports: TaskPorts | null;
  phase: "creating" | "setup" | "ready" | "finishing";
  databasesReady: boolean;
  rexSession: string | null;
  parentID: string | null;
  origin: "opencode" | "helve";
  helveMarker?: string;
  pullRequest?: number;
};

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export function workspaceStateDir(): string {
  return resolve(process.env.GT_STATE_DIR || join(homedir(), ".local", "state", "gt"));
}

export function workspaceRoot(): string {
  return resolve(process.env.GT_TASKS_DIR || BASE_DIR);
}

export function repositoryDirectory(): string {
  return resolve(process.env.GT_REPOSITORY_DIR || join(homedir(), ".local", "share", "gt", "gertrude"));
}

export function workspacePath(id: string): string {
  if (!uuid.test(id)) fail("invalid task ID");
  return join(workspaceStateDir(), "tasks", `${id}.json`);
}

export function workspaceLock(id: string): string {
  if (!uuid.test(id) && id !== "registry") fail("invalid task lock");
  return join(workspaceStateDir(), "locks", `task-${id}.lock`);
}

export function writeWorkspace(task: Workspace): void {
  const path = workspacePath(task.id);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(task, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporary, path);
}

export function readWorkspace(path: string): Workspace {
  let task: Workspace;
  try {
    task = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(`invalid task record: ${path}; refusing to touch resources`);
  }
  if (!task || task.version !== 1 || typeof task.id !== "string" || !uuid.test(task.id)
    || workspacePath(task.id) !== path || typeof task.name !== "string" || !task.name
    || typeof task.directory !== "string" || !isAbsolute(task.directory)
    || typeof task.gitCommonDir !== "string" || !isAbsolute(task.gitCommonDir)
    || typeof task.branch !== "string" || typeof task.projectID !== "string"
    || typeof task.slug !== "string" || !/^(task|helve)_[a-f0-9]{32}$/.test(task.slug)
    || (task.origin !== "opencode" && task.origin !== "helve")
    || !["creating", "setup", "ready", "finishing"].includes(task.phase)
    || typeof task.databasesReady !== "boolean"
    || (task.rexSession !== null && (typeof task.rexSession !== "string" || !task.rexSession.startsWith("session:")))
    || (task.parentID !== null && (typeof task.parentID !== "string" || !uuid.test(task.parentID)))
    || task.postgres?.host !== "127.0.0.1" || !Number.isInteger(task.postgres.port)
    || task.postgres.port < 1 || task.postgres.port > 65535
    || typeof task.postgres.username !== "string" || !task.postgres.username
    || (task.ports !== null && (!Number.isInteger(task.ports?.slot) || task.ports.slot < 0 || task.ports.slot >= TASK_PORT_SLOT_COUNT
      || !["apiPort", "dashPort", "sitePort", "adminPort", "storybookPort", "ciApiPort", "ciDashPort", "accountPort"]
        .every((key, index) => task.ports![key as keyof TaskPorts] === TASK_PORT_BASE + task.ports!.slot * TASK_PORT_BLOCK_SIZE + index)))) {
    fail(`task record does not match its resources: ${path}`);
  }
  if (task.origin === "opencode" && task.slug !== `task_${task.id.replaceAll("-", "")}`) fail(`task resource ID mismatch: ${path}`);
  if (task.origin === "helve" && (task.slug !== `helve_${task.id.replaceAll("-", "")}` || !task.helveMarker || !isAbsolute(task.helveMarker))) {
    fail(`Helve resource ID mismatch: ${path}`);
  }
  return task;
}

export function workspaces(): Workspace[] {
  const directory = join(workspaceStateDir(), "tasks");
  return existsSync(directory) ? readdirSync(directory).filter((name) => uuid.test(name.replace(/\.json$/, "")) && name.endsWith(".json"))
    .map((name) => readWorkspace(join(directory, name))) : [];
}

export function newWorkspace(name: string, directory: string, username: string): Workspace {
  const id = randomUUID();
  return {
    version: 1, id, name, directory, branch: "", projectID: "", gitCommonDir: repositoryDirectory() + "/.git",
    slug: `task_${id.replaceAll("-", "")}`,
    postgres: { host: "127.0.0.1", port: 5432, username }, ports: null,
    phase: "creating", databasesReady: false, rexSession: null, parentID: null, origin: "opencode",
  };
}
