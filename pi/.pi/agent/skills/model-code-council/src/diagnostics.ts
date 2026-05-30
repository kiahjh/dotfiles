import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { formatLocalIsoSeconds, isDirectory, readOptionalText, writeText } from "./files.ts";
import { reviewerPersonas } from "./personas.ts";

export type RoleKind = "reviewer" | "chair";
export type RoleState = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "STALE";
export type OverallState = "IN_PROGRESS" | "COMPLETE" | "FAILED" | "STALE" | "ABORTED" | "UNKNOWN";

export interface RoleDiagnostics {
  readonly kind: RoleKind;
  readonly id: string;
  readonly state: RoleState;
  readonly pid?: number;
  readonly pidAlive: boolean;
  readonly outputPath: string;
  readonly outputExists: boolean;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly lastActivity?: string;
  readonly exitCode?: number;
  readonly workspacePath?: string;
  readonly workspaceExists: boolean;
  readonly metaPath: string;
  readonly metaExists: boolean;
}

export interface SessionDiagnostics {
  readonly session: string;
  readonly storedStatus: string;
  readonly computedStatus: OverallState;
  readonly request: string;
  readonly roles: readonly RoleDiagnostics[];
  readonly finalPath: string;
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function fileBytes(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function mtime(path: string): number | undefined {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return undefined;
  }
}

function latestActivity(paths: readonly string[]): string | undefined {
  const latest = paths.map(mtime).filter((value): value is number => value !== undefined).sort((a, b) => b - a)[0];
  return latest === undefined ? undefined : formatLocalIsoSeconds(new Date(latest));
}

function pidAlive(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function workspaceFromFiles(session: string, kind: RoleKind, id: string, meta: Record<string, unknown> | undefined): string | undefined {
  const explicit = kind === "reviewer" ? join(session, "reviewers", id, "workspace.txt") : join(session, "chair", "workspace.txt");
  const fromFile = readOptionalText(explicit)?.trim();
  if (fromFile) return fromFile;
  return stringFrom(meta?.tempRoot);
}

function rolePaths(session: string, kind: RoleKind, id: string) {
  if (kind === "chair") {
    return {
      output: join(session, "chair", "final.md"),
      stdout: join(session, "logs", "chair.stdout.md"),
      stderr: join(session, "logs", "chair.stderr.txt"),
      meta: join(session, "logs", "chair.meta.json"),
    };
  }
  return {
    output: join(session, "reviewers", id, "report.md"),
    stdout: join(session, "logs", `${id}.stdout.md`),
    stderr: join(session, "logs", `${id}.stderr.txt`),
    meta: join(session, "logs", `${id}.meta.json`),
  };
}

function diagnoseRole(session: string, kind: RoleKind, id: string): RoleDiagnostics {
  const paths = rolePaths(session, kind, id);
  const meta = readJson(paths.meta);
  const pid = numberFrom(meta?.pid);
  const alive = pidAlive(pid);
  const outputExists = existsSync(paths.output);
  const exitCode = numberFrom(meta?.exitCode);
  const metaStatus = stringFrom(meta?.status);
  let state: RoleState;

  if (metaStatus === "FINISHED" || exitCode !== undefined) {
    state = exitCode === 0 && outputExists ? "DONE" : "FAILED";
  } else if (alive) {
    state = "RUNNING";
  } else if (pid !== undefined || metaStatus === "RUNNING") {
    state = "STALE";
  } else if (outputExists) {
    state = "DONE";
  } else {
    state = "PENDING";
  }

  const workspacePath = workspaceFromFiles(session, kind, id, meta);
  return {
    kind,
    id,
    state,
    pid,
    pidAlive: alive,
    outputPath: paths.output,
    outputExists,
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
    stdoutBytes: fileBytes(paths.stdout),
    stderrBytes: fileBytes(paths.stderr),
    lastActivity: latestActivity([paths.output, paths.stdout, paths.stderr, paths.meta]),
    exitCode,
    workspacePath,
    workspaceExists: workspacePath ? existsSync(workspacePath) : false,
    metaPath: paths.meta,
    metaExists: existsSync(paths.meta),
  };
}

function computeOverall(storedStatus: string, roles: readonly RoleDiagnostics[]): OverallState {
  if (storedStatus === "ABORTED") return "ABORTED";
  if (storedStatus === "FAILED") return "FAILED";
  if (storedStatus === "STALE") return "STALE";
  if (roles.some((role) => role.state === "RUNNING")) return "IN_PROGRESS";
  if (roles.every((role) => role.state === "DONE")) return "COMPLETE";
  if (roles.some((role) => role.state === "FAILED")) return "FAILED";
  if (storedStatus === "IN_PROGRESS" && roles.some((role) => role.state === "STALE" || role.state === "PENDING")) return "STALE";
  if (storedStatus === "COMPLETE") return "COMPLETE";
  return "UNKNOWN";
}

export function diagnoseSession(session: string, options: { markStale?: boolean } = {}): SessionDiagnostics {
  const storedStatus = readOptionalText(join(session, "status.txt"))?.trim() || "UNKNOWN";
  const roles = [
    ...reviewerPersonas.map((persona) => diagnoseRole(session, "reviewer" as const, persona.id)),
    diagnoseRole(session, "chair", "chair"),
  ];
  const computedStatus = computeOverall(storedStatus, roles);
  if (options.markStale && computedStatus === "STALE" && storedStatus === "IN_PROGRESS") {
    writeText(join(session, "status.txt"), "STALE\n");
  }
  return {
    session,
    storedStatus,
    computedStatus,
    request: readOptionalText(join(session, "request.md"))?.trim() ?? "",
    roles,
    finalPath: join(session, "chair", "final.md"),
  };
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width);
}

function renderRoleLine(role: RoleDiagnostics): string {
  const pid = role.pid === undefined ? "-" : `${role.pid}${role.pidAlive ? "" : "!"}`;
  const output = role.outputExists ? "yes" : "no";
  const exit = role.exitCode === undefined ? "-" : String(role.exitCode);
  const activity = role.lastActivity ?? "-";
  return [
    pad(role.id, 37),
    pad(role.state, 10),
    pad(pid, 10),
    pad(output, 7),
    pad(String(role.stdoutBytes), 8),
    pad(String(role.stderrBytes), 8),
    pad(exit, 6),
    activity,
  ].join(" ");
}

export function renderSessionDiagnostics(session: string, options: { markStale?: boolean } = {}): string {
  const diagnostics = diagnoseSession(session, options);
  const lines = [
    `Session: ${diagnostics.session}`,
    `Stored status: ${diagnostics.storedStatus}`,
    `Computed status: ${diagnostics.computedStatus}`,
    `Final summary: ${diagnostics.finalPath} (${existsSync(diagnostics.finalPath) ? "exists" : "missing"})`,
    "",
    "Review request:",
    diagnostics.request || "(missing)",
    "",
    [pad("Role", 37), pad("State", 10), pad("PID", 10), pad("Report", 7), pad("stdout", 8), pad("stderr", 8), pad("exit", 6), "Last activity"].join(" "),
    [pad("----", 37), pad("-----", 10), pad("---", 10), pad("------", 7), pad("------", 8), pad("------", 8), pad("----", 6), "-------------"].join(" "),
  ];
  for (const role of diagnostics.roles) {
    lines.push(renderRoleLine(role));
  }

  const existingWorkspaces = diagnostics.roles.filter((role) => role.workspaceExists && role.workspacePath);
  if (existingWorkspaces.length > 0) {
    lines.push("", "Existing temp workspaces:");
    for (const role of existingWorkspaces) {
      lines.push(`- ${role.id}: ${role.workspacePath}`);
    }
  }

  if (diagnostics.computedStatus === "STALE") {
    lines.push("", "This session appears stale. Run `mcc cleanup-stale <session>` to mark it aborted and remove known temp workspaces, or `mcc retry <session>` to start a fresh run with the same request.");
  }

  return `${lines.join("\n")}\n`;
}

export interface CleanupResult {
  readonly removed: readonly string[];
  readonly missing: readonly string[];
  readonly skippedRunning: readonly string[];
  readonly markedStatus?: string;
}

function markerWorkspacesForSession(session: string): string[] {
  try {
    return readdirSync(tmpdir())
      .filter((name) => name.startsWith("mcc-"))
      .map((name) => join(tmpdir(), name))
      .filter((path) => readOptionalText(join(path, ".mcc-session"))?.trim() === session);
  } catch {
    return [];
  }
}

export function cleanupStaleSession(session: string, options: { force?: boolean } = {}): CleanupResult {
  const diagnostics = diagnoseSession(session, { markStale: true });
  const running = diagnostics.roles.filter((role) => role.state === "RUNNING");
  if (running.length > 0 && !options.force) {
    return { removed: [], missing: [], skippedRunning: running.map((role) => role.id) };
  }

  const candidates = new Set<string>(markerWorkspacesForSession(session));
  for (const role of diagnostics.roles) {
    if (role.workspacePath) candidates.add(role.workspacePath);
  }

  const removed: string[] = [];
  const missing: string[] = [];
  for (const candidate of candidates) {
    if (isDirectory(candidate)) {
      rmSync(candidate, { recursive: true, force: true });
      removed.push(candidate);
    } else {
      missing.push(candidate);
    }
  }

  let markedStatus: string | undefined;
  if (diagnostics.computedStatus === "STALE" || diagnostics.storedStatus === "IN_PROGRESS") {
    markedStatus = "ABORTED";
    writeText(join(session, "status.txt"), "ABORTED\n");
  }
  writeText(
    join(session, "cleanup.json"),
    JSON.stringify({ cleanedAt: formatLocalIsoSeconds(new Date()), removed, missing, markedStatus }, null, 2) + "\n",
  );
  return { removed, missing, skippedRunning: [], markedStatus };
}

export function renderCleanupResult(result: CleanupResult): string {
  const lines = ["Cleanup complete."];
  if (result.markedStatus) lines.push(`Marked status: ${result.markedStatus}`);
  lines.push(`Removed workspaces: ${result.removed.length}`);
  for (const path of result.removed) lines.push(`- ${path}`);
  if (result.missing.length > 0) {
    lines.push(`Missing workspaces: ${result.missing.length}`);
    for (const path of result.missing) lines.push(`- ${path}`);
  }
  if (result.skippedRunning.length > 0) {
    lines.push(`Skipped because roles are still running: ${result.skippedRunning.join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}

export function knownSessionDirs(reviewRoot: string): string[] {
  if (!isDirectory(reviewRoot)) return [];
  return readdirSync(reviewRoot)
    .map((name) => join(reviewRoot, name))
    .filter(isDirectory)
    .sort((a, b) => basename(a).localeCompare(basename(b)));
}
