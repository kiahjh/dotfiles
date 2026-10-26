import { chmodSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupTaskDatabases, taskDatabaseNames } from "./databases.ts";
import { fail } from "./errors.ts";
import { requireCommands, run } from "./process.ts";
import { workspaceStateDir, type Workspace } from "./workspace-state.ts";

export function postgresEnvironment(task: Workspace): NodeJS.ProcessEnv {
  return {
    PGHOST: task.postgres.host, PGPORT: String(task.postgres.port), PGUSER: task.postgres.username,
    PGDATABASE: "postgres", PGPASSWORD: "", PGCONNECT_TIMEOUT: "5",
    PGHOSTADDR: undefined, PGSERVICE: undefined, PGSERVICEFILE: undefined, PGOPTIONS: undefined,
    PGPASSFILE: join(workspaceStateDir(), "no-passwords.pgpass"), PSQLRC: "/dev/null",
  };
}

export function databaseCopyTools(task: Workspace): { dump: string; restore: string } {
  const version = run("psql", ["-X", "--no-password", "--dbname", "postgres", "-At", "--command", "SHOW server_version_num"], {
    env: postgresEnvironment(task),
  }).stdout.trim();
  const serverMajor = Math.floor(Number(version) / 10_000);
  if (!Number.isInteger(serverMajor) || serverMajor < 10) fail("could not determine local PostgreSQL server version");
  const major = (command: string) => Number(run(command, ["--version"], { allowFailure: true, env: postgresEnvironment(task) }).stdout.match(/PostgreSQL\)?\s+(\d+)/)?.[1] || 0);
  const pathDumpMajor = major("pg_dump");
  if (pathDumpMajor >= serverMajor && major("pg_restore") >= pathDumpMajor) return { dump: "pg_dump", restore: "pg_restore" };
  for (const directory of [
    `/opt/homebrew/opt/postgresql@${serverMajor}/bin`, `/usr/local/opt/postgresql@${serverMajor}/bin`, `/usr/lib/postgresql/${serverMajor}/bin`,
  ]) {
    const dump = join(directory, "pg_dump");
    const restore = join(directory, "pg_restore");
    if (existsSync(dump) && existsSync(restore) && major(dump) === serverMajor && major(restore) === serverMajor) return { dump, restore };
  }
  fail(`local PostgreSQL ${serverMajor} needs compatible pg_dump/pg_restore clients; the tools on PATH are too old or mismatched`);
}

export function workspaceDatabases(task: Workspace): string[] {
  const names = taskDatabaseNames(task.slug);
  return [names.databaseName, names.testDatabaseName];
}

export function existingWorkspaceDatabases(task: Workspace): string[] {
  const names = workspaceDatabases(task);
  const output = run("psql", ["-X", "--no-password", "--dbname", "postgres", "-At", "--set", "ON_ERROR_STOP=1", "--command",
    `SELECT datname FROM pg_database WHERE datname IN ('${names[0]}', '${names[1]}');`], { env: postgresEnvironment(task) }).stdout;
  return output.trim().split(/\r?\n/).filter(Boolean);
}

export function dropWorkspaceDatabases(task: Workspace): void {
  requireCommands(["dropdb"]);
  for (const name of workspaceDatabases(task).reverse()) {
    run("dropdb", ["--no-password", "--if-exists", "--force", name], { env: postgresEnvironment(task), inherit: true });
  }
}

export async function provisionWorkspaceDatabases(task: Workspace, parent?: Workspace): Promise<void> {
  const existing = existingWorkspaceDatabases(task);
  if (task.databasesReady) {
    if (existing.length !== 2) fail("a task database is missing; use gt refresh-db to recreate the pair");
    return;
  }
  if (existing.length) fail("partial task databases exist; use gt refresh-db to explicitly replace them");
  if (!parent) {
    await setupTaskDatabases(task.slug, postgresEnvironment(task));
    return;
  }
  requireCommands(["pg_dump", "pg_restore", "createdb", "dropdb"]);
  const tools = databaseCopyTools(parent);
  if (!parent.databasesReady || existingWorkspaceDatabases(parent).length !== 2) fail("the parent task's databases are not ready");
  const temporaryRoot = existsSync(join(tmpdir(), "opencode")) ? join(tmpdir(), "opencode") : tmpdir();
  const temporary = mkdtempSync(join(temporaryRoot, "gt-fork-db-"));
  chmodSync(temporary, 0o700);
  try {
    const sources = workspaceDatabases(parent);
    const targets = workspaceDatabases(task);
    for (let index = 0; index < sources.length; index++) {
      run(tools.dump, ["--no-password", "--format=custom", "--no-owner", "--no-acl", "--file", join(temporary, `${index}.dump`), sources[index]], {
        env: postgresEnvironment(parent), inherit: true,
      });
    }
    try {
      for (let index = 0; index < targets.length; index++) {
        run("createdb", ["--no-password", targets[index]], { env: postgresEnvironment(task) });
        run(tools.restore, ["--no-password", "--no-owner", "--no-acl", "--exit-on-error", "--dbname", targets[index], join(temporary, `${index}.dump`)], {
          env: postgresEnvironment(task), inherit: true,
        });
      }
    } catch (error) {
      dropWorkspaceDatabases(task);
      throw error;
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
