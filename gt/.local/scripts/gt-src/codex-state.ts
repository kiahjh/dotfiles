import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { TASK_PORT_BASE, TASK_PORT_BLOCK_SIZE, TASK_PORT_SLOT_COUNT } from "./constants.ts";
import { fail } from "./errors.ts";
import type { TaskPorts } from "./ports.ts";

export type CodexTaskState = {
  version: 1;
  id: string;
  worktree: string;
  gitCommonDir: string;
  postgres: { host: "127.0.0.1"; port: number; username: string };
  ports: TaskPorts | null;
  databasesReady: boolean;
};

export function gtStateDir(): string {
  return resolve(process.env.GT_STATE_DIR || join(homedir(), ".local", "state", "gt"));
}

function worktreeKey(worktree: string): string {
  return createHash("sha256").update(resolve(worktree)).digest("hex");
}

export function codexStatePath(worktree: string): string {
  return join(gtStateDir(), "codex-tasks", `${worktreeKey(worktree)}.json`);
}

export function codexLockPath(worktree: string): string {
  return join(gtStateDir(), "locks", `codex-${worktreeKey(worktree)}.lock`);
}

export function taskPortsLockPath(): string {
  return join(gtStateDir(), "locks", "ports.lock");
}

export function codexTaskSlug(task: CodexTaskState): string {
  return `codex_${task.id.replaceAll("-", "")}`;
}

function readStateFile(path: string): CodexTaskState {
  let task: CodexTaskState;
  try {
    task = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(`invalid Codex resource record: ${path}; refusing to touch databases`);
  }
  if (!task || task.version !== 1
    || typeof task.id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(task.id)
    || typeof task.worktree !== "string" || !isAbsolute(task.worktree)
    || codexStatePath(task.worktree) !== path
    || typeof task.gitCommonDir !== "string" || !isAbsolute(task.gitCommonDir)
    || typeof task.databasesReady !== "boolean"
    || task.postgres?.host !== "127.0.0.1"
    || !Number.isInteger(task.postgres.port) || task.postgres.port < 1 || task.postgres.port > 65535
    || typeof task.postgres.username !== "string" || !task.postgres.username
    || (task.ports !== null && !validPorts(task.ports))) {
    fail(`Codex resource record does not match its worktree: ${path}; refusing to touch databases`);
  }
  return task;
}

function validPorts(ports: TaskPorts): boolean {
  if (!ports || !Number.isInteger(ports.slot) || ports.slot < 0 || ports.slot >= TASK_PORT_SLOT_COUNT) return false;
  const base = TASK_PORT_BASE + ports.slot * TASK_PORT_BLOCK_SIZE;
  return ports.apiPort === base && ports.dashPort === base + 1 && ports.sitePort === base + 2
    && ports.adminPort === base + 3 && ports.storybookPort === base + 4
    && ports.ciApiPort === base + 5 && ports.ciDashPort === base + 6 && ports.accountPort === base + 7;
}

export function readCodexTask(worktree: string): CodexTaskState | null {
  const path = codexStatePath(worktree);
  return existsSync(path) ? readStateFile(path) : null;
}

export function writeCodexTask(task: CodexTaskState): void {
  mkdirSync(join(gtStateDir(), "codex-tasks"), { recursive: true, mode: 0o700 });
  const path = codexStatePath(task.worktree);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(task, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporary, path);
}

export function newCodexTask(worktree: string, gitCommonDir: string, username: string): CodexTaskState {
  return {
    version: 1, id: randomUUID(), worktree, gitCommonDir,
    postgres: { host: "127.0.0.1", port: 5432, username },
    ports: null, databasesReady: false,
  };
}

export function codexPortReservations(): CodexTaskState[] {
  const directory = join(gtStateDir(), "codex-tasks");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
    .map((name) => readStateFile(join(directory, name)));
}
