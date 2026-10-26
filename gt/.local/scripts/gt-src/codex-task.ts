import { existsSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  codexLockPath, codexStatePath, codexTaskSlug, newCodexTask, readCodexTask,
  taskPortsLockPath, writeCodexTask, type CodexTaskState,
} from "./codex-state.ts";
import { setupTaskDatabases, taskDatabaseNames } from "./databases.ts";
import { writeSwiftApiEnv } from "./env.ts";
import { fail, GtError } from "./errors.ts";
import { getGitRoot, gitOutput } from "./git.ts";
import { allocateTaskPorts, renderTaskPorts, taskPortsPath } from "./ports.ts";
import { currentSystemUser, requireCommands, run } from "./process.ts";
import { withResourceLock, withResourceLockSync } from "./resource-lock.ts";

export function codexWorktreePath(argument?: string): string {
  const path = argument || process.env.CODEX_WORKTREE_PATH || getGitRoot(process.cwd());
  if (!isAbsolute(path)) fail("expected an absolute Codex worktree path");
  const root = resolve(path);
  return existsSync(root) ? realpathSync(root) : root;
}

function gitCommonDir(worktree: string): string {
  if (!existsSync(worktree)) fail(`missing worktree: ${worktree}`);
  if (realpathSync(getGitRoot(worktree)) !== worktree) fail("expected the root of a Git worktree");
  const common = realpathSync(gitOutput(worktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  const gitDir = realpathSync(gitOutput(worktree, ["rev-parse", "--path-format=absolute", "--git-dir"]));
  if (gitDir === common) fail("this is the main checkout; Gertrude Codex setup requires a linked Git worktree");
  return common;
}

async function withLocalPostgres<T>(task: CodexTaskState, operation: () => Promise<T>): Promise<T> {
  const values: Record<string, string | undefined> = {
    PGHOST: task.postgres.host, PGPORT: String(task.postgres.port), PGUSER: task.postgres.username,
    PGDATABASE: "postgres", PGPASSWORD: "", PGCONNECT_TIMEOUT: "5",
    PGSERVICE: undefined, PGSERVICEFILE: undefined, PGOPTIONS: undefined,
  };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await operation();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function existingDatabases(task: CodexTaskState): Set<string> {
  const names = taskDatabaseNames(codexTaskSlug(task));
  const query = `SELECT datname FROM pg_database WHERE datname IN ('${names.databaseName}', '${names.testDatabaseName}');`;
  const output = run("psql", ["-X", "--no-password", "--dbname", "postgres", "-At", "--set", "ON_ERROR_STOP=1", "--command", query]).stdout;
  return new Set(output.trim().split(/\r?\n/).filter(Boolean));
}

export async function setupCodexTask(worktree: string): Promise<void> {
  requireCommands(["git", "pnpm", "psql", "createdb", "dropdb", "gunzip", "sed", "nc"]);
  const common = gitCommonDir(worktree);
  if (!existsSync(join(worktree, "swift", "api")) || !existsSync(join(worktree, "web", "pnpm-lock.yaml"))) {
    fail("this does not look like a Gertrude checkout (expected swift/api and web/pnpm-lock.yaml)");
  }
  await withResourceLock(codexLockPath(worktree), async () => {
    const task = readCodexTask(worktree) || newCodexTask(worktree, common, currentSystemUser());
    if (task.gitCommonDir !== common) fail("this worktree now belongs to a different repository; refusing to reuse its resources");
    writeCodexTask(task);
    const slug = codexTaskSlug(task);
    const ports = withResourceLockSync(taskPortsLockPath(), () => {
      task.ports ??= allocateTaskPorts(slug, worktree, false);
      writeFileSync(taskPortsPath(worktree), renderTaskPorts(slug, task.ports), "utf8");
      writeCodexTask(task);
      return task.ports;
    });

    await withLocalPostgres(task, async () => {
      const existing = existingDatabases(task);
      if (task.databasesReady) {
        if (existing.size !== 2) fail("a Codex task database is missing; run codex-gertrude-cleanup, then setup again to recreate both databases");
        console.log("Keeping existing task databases.");
      } else {
        if (existing.size !== 0) fail("database provisioning was interrupted; run codex-gertrude-cleanup, then setup again before retrying");
        await setupTaskDatabases(slug);
        task.databasesReady = true;
        writeCodexTask(task);
      }
    });

    const names = taskDatabaseNames(slug);
    writeSwiftApiEnv(worktree, slug, ports, {
      DATABASE_HOST: task.postgres.host, DATABASE_PORT: String(task.postgres.port),
      DATABASE_USERNAME: task.postgres.username, DATABASE_PASSWORD: "",
      DATABASE_NAME: names.databaseName, TEST_DATABASE_NAME: names.testDatabaseName,
      ACCOUNT_DASHBOARD_URL: `http://localhost:${ports.accountPort}`,
    });
    console.log("Installing web dependencies…");
    run("pnpm", ["install", "--frozen-lockfile"], { cwd: join(worktree, "web"), inherit: true });
    console.log(`Gertrude worktree ready: ${worktree}`);
    console.log(`Database: ${names.databaseName}; tests: ${names.testDatabaseName}`);
    console.log(`API: http://localhost:${ports.apiPort}`);
    console.log(`Account: http://localhost:${ports.accountPort}`);
    console.log(`Dashboard: http://localhost:${ports.dashPort}; site: http://localhost:${ports.sitePort}`);
  });
}

export async function cleanupCodexTask(worktree: string): Promise<void> {
  await withResourceLock(codexLockPath(worktree), async () => {
    const task = readCodexTask(worktree);
    if (!task) {
      console.log("No Codex Gertrude resource record; nothing to clean up.");
      return;
    }
    if (existsSync(worktree) && gitCommonDir(worktree) !== task.gitCommonDir) {
      fail("this worktree now belongs to a different repository; refusing to clean up its resources");
    }
    requireCommands(["dropdb"]);
    const names = taskDatabaseNames(codexTaskSlug(task));
    await withLocalPostgres(task, async () => {
      run("dropdb", ["--no-password", "--if-exists", "--force", names.testDatabaseName], { inherit: true });
      run("dropdb", ["--no-password", "--if-exists", "--force", names.databaseName], { inherit: true });
    });
    withResourceLockSync(taskPortsLockPath(), () => {
      if (existsSync(worktree)) {
        rmSync(taskPortsPath(worktree), { force: true });
        rmSync(join(worktree, "swift", "api", ".env"), { force: true });
      }
      rmSync(codexStatePath(worktree));
    });
    console.log(`Removed ${names.databaseName} and ${names.testDatabaseName}; released task ports.`);
  });
}

if (import.meta.main) {
  try {
    const [command, argument, ...extra] = process.argv.slice(2);
    if (argument === "--help" || argument === "-h") {
      console.log(`usage: codex-gertrude-${command} [absolute-worktree-path]\nUses CODEX_WORKTREE_PATH when set, otherwise the current Git checkout.\nSetup preserves initialized databases; cleanup only removes recorded task resources.`);
    } else {
      if ((command !== "setup" && command !== "cleanup") || extra.length || argument?.startsWith("-")) {
        fail("usage: codex-gertrude-setup|codex-gertrude-cleanup [absolute-worktree-path]");
      }
      const worktree = codexWorktreePath(argument);
      if (command === "setup") await setupCodexTask(worktree);
      else await cleanupCodexTask(worktree);
    }
  } catch (error) {
    if (error instanceof GtError) console.error(`codex-gertrude-task: ${error.message}`);
    else console.error(error);
    process.exit(1);
  }
}
