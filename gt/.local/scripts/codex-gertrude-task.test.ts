import { expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { codexStatePath, codexTaskSlug, newCodexTask, readCodexTask, writeCodexTask, type CodexTaskState } from "./gt-src/codex-state.ts";
import { taskDatabaseNames } from "./gt-src/databases.ts";
import { parseSimpleDotenv } from "./gt-src/dotenv.ts";
import { allocateTaskPorts, renderTaskPorts, taskPortSlotForSlug, taskPortsForSlot } from "./gt-src/ports.ts";

const scripts = import.meta.dir;
const stub = `#!${process.execPath}
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { basename, join } from "node:path";
import { withResourceLockSync } from ${JSON.stringify(join(scripts, "gt-src", "resource-lock.ts"))};
const command = basename(process.argv[1]);
const args = process.argv.slice(2);
appendFileSync(process.env.GT_STUB_LOG, JSON.stringify({ command, args, host: process.env.PGHOST, port: process.env.PGPORT, user: process.env.PGUSER }) + "\\n");
const path = process.env.GT_STUB_DATABASES;
const sql = command === "psql" && !args.includes("--command") ? await Bun.stdin.text() : "";
withResourceLockSync(path + ".lock", () => {
const databases = JSON.parse(readFileSync(path, "utf8"));
const save = () => writeFileSync(path, JSON.stringify(databases));
if (command === "nc") process.exit(1);
if (command === "pnpm") {
  if (process.env.GT_STUB_FAIL_PNPM === "1") process.exit(1);
  mkdirSync(join(process.cwd(), "node_modules"), { recursive: true });
}
if (command === "createdb") {
  const name = args.at(-1);
  if (databases[name]) process.exit(1);
  const index = args.indexOf("--template");
  databases[name] = index >= 0 ? { ...databases[args[index + 1]] } : {};
  save();
}
if (command === "dropdb") {
  if (process.env.GT_STUB_FAIL_DROP === "1") process.exit(1);
  delete databases[args.at(-1)];
  save();
}
if (command === "psql") {
  const index = args.indexOf("--command");
  if (index >= 0) {
    for (const name of Object.keys(databases)) if (args[index + 1].includes("'" + name + "'")) console.log(name);
  } else {
    databases[args.at(-1)] = { restored: sql.includes("SELECT 1;") };
    save();
  }
}
});
`;

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "codex-gt-test-")));
  const repository = join(root, "repository");
  const worktree = join(root, "worktree with spaces");
  const commands = join(root, "commands");
  const databasePath = join(root, "databases.json");
  const logPath = join(root, "commands.jsonl");
  mkdirSync(join(repository, "swift", "api"), { recursive: true });
  mkdirSync(join(repository, "web"));
  writeFileSync(join(repository, "swift", "api", ".keep"), "");
  writeFileSync(join(repository, "web", "pnpm-lock.yaml"), "fixture\n");
  function git(...args: string[]) {
    const result = spawnSync("git", args, { cwd: repository, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  }
  git("init", "--quiet");
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture");
  git("worktree", "add", "--quiet", "--detach", worktree);
  mkdirSync(commands);
  for (const name of ["psql", "createdb", "dropdb", "nc", "pnpm"]) {
    const path = join(commands, name);
    writeFileSync(path, stub);
    chmodSync(path, 0o755);
  }
  writeFileSync(databasePath, JSON.stringify({ unrelated: { keep: true } }));
  writeFileSync(join(root, "dump.sql.gz"), gzipSync("SELECT 1;\n"));
  writeFileSync(join(root, "template"), "DATABASE_NAME=changeme\nTEST_DATABASE_NAME=changeme\nDATABASE_USERNAME=changeme\nDATABASE_PASSWORD=\nACCOUNT_DASHBOARD_URL=changeme\n");
  const env = {
    ...process.env,
    PATH: `${commands}:${process.env.PATH}`,
    CODEX_WORKTREE_PATH: worktree,
    GT_STATE_DIR: join(root, "state"),
    GT_ENV_TEMPLATE: join(root, "template"),
    GT_SECRETS_FILE: join(root, "no-secrets"),
    GT_SCRUBBED_DUMP_PATH: join(root, "dump.sql.gz"),
    GT_STUB_LOG: logPath,
    GT_STUB_DATABASES: databasePath,
    PGHOST: "production.example.invalid",
  };
  function inState<T>(operation: () => T): T {
    const previous = process.env.GT_STATE_DIR;
    process.env.GT_STATE_DIR = env.GT_STATE_DIR;
    try { return operation(); }
    finally {
      if (previous === undefined) delete process.env.GT_STATE_DIR;
      else process.env.GT_STATE_DIR = previous;
    }
  }
  function invoke(kind: "setup" | "cleanup", extra: Record<string, string> = {}, path = worktree) {
    return spawnSync(join(scripts, `codex-gertrude-${kind}`), [], {
      env: { ...env, ...extra, CODEX_WORKTREE_PATH: path }, encoding: "utf8",
    });
  }
  function invokeAsync(kind: "setup" | "cleanup", path = worktree): Promise<{ status: number | null; output: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(join(scripts, `codex-gertrude-${kind}`), [], { env: { ...env, CODEX_WORKTREE_PATH: path } });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      child.on("error", reject);
      child.on("close", (status) => resolve({ status, output }));
    });
  }
  return {
    root, repository, worktree, env, git, invoke, invokeAsync, inState,
    record: (path = worktree) => inState(() => readCodexTask(path))!,
    recordPath: (path = worktree) => inState(() => codexStatePath(path)),
    databases: () => JSON.parse(readFileSync(databasePath, "utf8")),
    saveDatabases: (values: unknown) => writeFileSync(databasePath, JSON.stringify(values)),
    log: () => existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [],
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("setup uses detached-worktree ownership and local Postgres, while retry preserves edited databases", () => {
  const f = fixture();
  try {
    const first = f.invoke("setup");
    expect(first.status, first.stdout + first.stderr).toBe(0);
    const record = f.record();
    const names = taskDatabaseNames(codexTaskSlug(record));
    expect(record.databasesReady).toBe(true);
    expect(f.databases()[names.databaseName].restored).toBe(true);
    expect(f.databases()[names.testDatabaseName].restored).toBe(true);
    expect(f.git("-C", f.worktree, "branch", "--show-current")).toBe("");
    const envPath = join(f.worktree, "swift", "api", ".env");
    const values = parseSimpleDotenv(readFileSync(envPath, "utf8"));
    expect(values.DATABASE_NAME).toBe(names.databaseName);
    expect(values.DATABASE_HOST).toBe("127.0.0.1");
    expect(values.DATABASE_PORT).toBe("5432");
    expect(statSync(envPath).mode & 0o777).toBe(0o600);
    const databaseCommands = f.log().filter((entry) => ["psql", "createdb", "dropdb"].includes(entry.command));
    expect(databaseCommands.every((entry) => entry.host === "127.0.0.1"), JSON.stringify(databaseCommands)).toBe(true);
    const databases = f.databases();
    databases[names.databaseName].myChanges = "preserve me";
    f.saveDatabases(databases);
    const before = f.log().length;
    rmSync(join(f.worktree, ".gtask-ports"));
    const second = f.invoke("setup");
    expect(second.status, second.stdout + second.stderr).toBe(0);
    expect(f.record().id).toBe(record.id);
    expect(f.record().ports).toEqual(record.ports);
    expect(f.databases()[names.databaseName].myChanges).toBe("preserve me");
    expect(f.log().slice(before).some((entry) => ["createdb", "dropdb"].includes(entry.command))).toBe(false);
  } finally { f.dispose(); }
});

test("a failed dependency install can be retried without restoring databases again", () => {
  const f = fixture();
  try {
    expect(f.invoke("setup", { GT_STUB_FAIL_PNPM: "1" }).status).toBe(1);
    expect(f.record().databasesReady).toBe(true);
    const before = f.log().length;
    const retry = f.invoke("setup");
    expect(retry.status, retry.stdout + retry.stderr).toBe(0);
    expect(f.log().slice(before).filter((entry) => entry.command === "psql").every((entry) => entry.args.includes("--command"))).toBe(true);
  } finally { f.dispose(); }
});

test("cleanup is retryable after a drop failure, works without the checkout, and preserves unrelated databases", () => {
  const f = fixture();
  try {
    expect(f.invoke("setup").status).toBe(0);
    const names = taskDatabaseNames(codexTaskSlug(f.record()));
    rmSync(f.worktree, { recursive: true });
    expect(f.invoke("cleanup", { GT_STUB_FAIL_DROP: "1" }).status).toBe(1);
    expect(existsSync(f.recordPath())).toBe(true);
    const result = f.invoke("cleanup");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(existsSync(f.recordPath())).toBe(false);
    expect(f.databases()).toEqual({ unrelated: { keep: true } });
    expect(f.log().filter((entry) => entry.command === "dropdb" && entry.args.includes("--force")).every((entry) => [names.databaseName, names.testDatabaseName].includes(entry.args.at(-1)))).toBe(true);
    const before = f.log().length;
    expect(f.invoke("cleanup").status).toBe(0);
    expect(f.log().length).toBe(before);
  } finally { f.dispose(); }
});

test("setup refuses the main checkout and cleanup refuses corrupted or copied resource records", () => {
  const f = fixture();
  try {
    expect(f.invoke("setup", {}, f.repository).stderr).toContain("main checkout");
    expect(f.log().length).toBe(0);
    const path = f.recordPath();
    mkdirSync(join(f.env.GT_STATE_DIR, "codex-tasks"), { recursive: true });
    writeFileSync(path, "{invalid");
    expect(f.invoke("cleanup").stderr).toContain("invalid Codex resource record");
    writeFileSync(path, JSON.stringify(newCodexTask(f.repository, join(f.repository, ".git"), "fixture")));
    expect(f.invoke("cleanup").stderr).toContain("does not match its worktree");
    expect(f.log().length).toBe(0);
  } finally { f.dispose(); }
});

test("a missing initialized database is reported without dropping the remaining database", () => {
  const f = fixture();
  try {
    expect(f.invoke("setup").status).toBe(0);
    const names = taskDatabaseNames(codexTaskSlug(f.record()));
    const databases = f.databases();
    delete databases[names.testDatabaseName];
    f.saveDatabases(databases);
    const before = f.log().length;
    const result = f.invoke("setup");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("database is missing");
    expect(f.databases()[names.databaseName]).toBeDefined();
    expect(f.log().slice(before).some((entry) => ["createdb", "dropdb"].includes(entry.command))).toBe(false);
  } finally { f.dispose(); }
});

test("a damaged dump fails provisioning instead of marking empty databases ready", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, "dump.sql.gz"), "not gzip");
    const result = f.invoke("setup");
    expect(result.status).toBe(1);
    expect(f.record().databasesReady).toBe(false);
    expect(f.databases()).toEqual({ unrelated: { keep: true } });
    expect(f.invoke("cleanup").status).toBe(0);
  } finally { f.dispose(); }
});

test("cleanup followed by setup creates fresh ownership and replaces copied port files", () => {
  const f = fixture();
  try {
    expect(f.invoke("setup").status).toBe(0);
    const old = f.record();
    expect(f.invoke("cleanup").status).toBe(0);
    expect(existsSync(join(f.worktree, "swift", "api", ".env"))).toBe(false);
    const copied = taskPortsForSlot(0);
    writeFileSync(join(f.worktree, ".gtask-ports"), renderTaskPorts("copied", copied));
    const other = newCodexTask(join(f.root, "other"), old.gitCommonDir, "fixture");
    other.ports = copied;
    f.inState(() => writeCodexTask(other));
    const result = f.invoke("setup");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(f.record().id).not.toBe(old.id);
    expect(f.record().ports?.slot).not.toBe(copied.slot);
    const ports = f.record().ports!;
    f.inState(() => expect(allocateTaskPorts(codexTaskSlug(f.record()), join(f.root, "gt-task")).slot).not.toBe(ports.slot));
  } finally { f.dispose(); }
});

test("concurrent setup for one worktree only provisions databases once", async () => {
  const f = fixture();
  try {
    const results = await Promise.all([f.invokeAsync("setup"), f.invokeAsync("setup")]);
    for (const result of results) expect(result.status, result.output).toBe(0);
    expect(f.log().filter((entry) => entry.command === "createdb").length).toBe(2);
  } finally { f.dispose(); }
});

test("parallel worktrees with colliding preferred port slots receive distinct reservations", async () => {
  const f = fixture();
  try {
    const second = join(f.root, "second worktree");
    f.git("worktree", "add", "--quiet", "--detach", second);
    const slots = new Map<number, CodexTaskState>();
    let first: CodexTaskState | undefined;
    let other: CodexTaskState | undefined;
    while (!first) {
      const candidate = newCodexTask(second, join(f.repository, ".git"), "fixture");
      candidate.id = randomUUID();
      const slot = taskPortSlotForSlug(codexTaskSlug(candidate));
      if (slots.has(slot)) {
        first = { ...slots.get(slot)!, worktree: f.worktree };
        other = candidate;
      } else slots.set(slot, candidate);
    }
    f.inState(() => { writeCodexTask(first!); writeCodexTask(other!); });
    const results = await Promise.all([f.invokeAsync("setup"), f.invokeAsync("setup", second)]);
    for (const result of results) expect(result.status, result.output).toBe(0);
    expect(f.record().ports?.slot).not.toBe(f.record(second).ports?.slot);
  } finally { f.dispose(); }
});
