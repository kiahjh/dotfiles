import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { helveTaskFromEnv, markerPath, teardownHelveTask } from "./gt-src/helve-task.ts";
import { taskDatabaseNames } from "./gt-src/databases.ts";
import { allocateTaskPorts, renderTaskPorts, taskPortsPath } from "./gt-src/ports.ts";

const taskID = "12345678-1234-1234-1234-123456789abc";
const projectID = "abcdefab-1234-1234-1234-123456789abc";

function env(home: string) {
  return {
    HELVE_HOME: home,
    HELVE_PROJECT_ID: projectID,
    HELVE_TASK_ID: taskID,
    HELVE_WORKTREE: join(home, "worktrees", projectID, "test-task"),
    HELVE_TASK_STATE_DIR: join(home, "task-scripts", taskID),
  };
}

test("derives task-isolated databases from Helve's stable ID, not its changeable title", () => {
  const home = mkdtempSync(join(tmpdir(), "helve-gt-context-"));
  try {
    const task = helveTaskFromEnv(env(home));
    expect(task.slug).toBe("helve_12345678123412341234123456789abc");
    expect(taskDatabaseNames(task.slug).databaseName).toStartWith("gt_helve_12345678");
    expect(helveTaskFromEnv({ ...env(home), HELVE_WORKTREE: join(home, "worktrees", projectID, "renamed") }).slug).toBe(task.slug);
    expect(markerPath(task)).toBe(join(home, "task-scripts", taskID, "gertrude.json"));
    expect(() => helveTaskFromEnv({ ...env(home), HELVE_WORKTREE: "/tmp/not-helve" })).toThrow();
    expect(() => helveTaskFromEnv({ ...env(home), HELVE_TASK_STATE_DIR: "/tmp/other" })).toThrow();
    expect(() => helveTaskFromEnv({ ...env(home), HELVE_PROJECT_ID: "../other" })).toThrow();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("teardown without setup marker never invokes dropdb", () => {
  const home = mkdtempSync(join(tmpdir(), "helve-gt-teardown-"));
  try {
    teardownHelveTask(helveTaskFromEnv(env(home)));
    mkdirSync(join(home, "task-scripts", taskID), { recursive: true });
    writeFileSync(join(home, "task-scripts", taskID, "gertrude.json"), "{invalid");
    expect(() => teardownHelveTask(helveTaskFromEnv(env(home)))).toThrow("invalid Gertrude task marker");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("setup and teardown work through the dotfiles launcher without real databases", () => {
  const home = mkdtempSync(join(tmpdir(), "helve-gt-lifecycle-"));
  const taskEnv = env(realpathSync(home));
  const commands = join(home, "commands");
  const log = join(home, "stub-commands.log");
  try {
    mkdirSync(commands);
    mkdirSync(join(taskEnv.HELVE_WORKTREE, "web"), { recursive: true });
    mkdirSync(join(taskEnv.HELVE_WORKTREE, "swift", "api"), { recursive: true });
    const stub = `#!/bin/sh\nprintf '%s %s\\n' "$(basename "$0")" "$*" >> "$GT_STUB_LOG"\nif [ "$(basename "$0")" = nc ]; then exit 1; fi\nif [ "$(basename "$0")" = psql ]; then cat >/dev/null; fi\nif [ "$(basename "$0")" = dropdb ] && [ "$GT_STUB_FAIL_DROP" = 1 ]; then exit 1; fi\n`;
    for (const name of ["pnpm", "psql", "createdb", "dropdb", "nc"]) {
      const path = join(commands, name);
      writeFileSync(path, stub);
      chmodSync(path, 0o755);
    }
    writeFileSync(join(home, "dump.sql.gz"), gzipSync("SELECT 1;\n"));
    writeFileSync(join(home, "template"), "DATABASE_NAME=changeme\nTEST_DATABASE_NAME=changeme\nACCOUNT_DASHBOARD_URL=changeme\n");
    const fakeEnv = {
      ...process.env, ...taskEnv,
      PATH: `${commands}:${process.env.PATH}`,
      GT_STUB_LOG: log,
      GT_ENV_TEMPLATE: join(home, "template"),
      GT_SECRETS_FILE: join(home, "no-secrets"),
      GT_SCRUBBED_DUMP_PATH: join(home, "dump.sql.gz"),
    };
    const script = join(import.meta.dir, "helve-gertrude-task");
    const setup = spawnSync(script, ["setup"], { env: fakeEnv, encoding: "utf8" });
    expect(setup.status, setup.stderr + setup.stdout).toBe(0);
    expect(setup.stderr).toBe("");
    expect(readFileSync(join(taskEnv.HELVE_WORKTREE, ".gtask-ports"), "utf8")).toContain("API_PORT=");
    expect(readFileSync(join(taskEnv.HELVE_WORKTREE, "swift", "api", ".env"), "utf8")).toContain("DATABASE_NAME=gt_helve_");
    expect(readFileSync(log, "utf8")).toContain("pnpm install");
    // Teardown must work even when the worktree was removed out of band.
    rmSync(taskEnv.HELVE_WORKTREE, { recursive: true });
    const failedTeardown = spawnSync(script, ["teardown"], {
      env: { ...fakeEnv, GT_STUB_FAIL_DROP: "1" }, encoding: "utf8",
    });
    expect(failedTeardown.status).toBe(1);
    expect(readFileSync(markerPath(helveTaskFromEnv(taskEnv)), "utf8")).toContain(taskID);
    const teardown = spawnSync(script, ["teardown"], { env: fakeEnv, encoding: "utf8" });
    expect(teardown.status).toBe(0);
    expect(readFileSync(log, "utf8")).toContain("dropdb --if-exists gt_helve_");
    expect(() => readFileSync(markerPath(helveTaskFromEnv(taskEnv)))).toThrow();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("port allocation sees other Helve tasks as well as GT tasks", () => {
  const home = mkdtempSync(join(tmpdir(), "helve-gt-ports-"));
  const previous = process.env.HELVE_HOME;
  try {
    process.env.HELVE_HOME = home;
    const own = join(home, "worktrees", projectID, "current");
    const other = join(home, "worktrees", projectID, "other");
    mkdirSync(own, { recursive: true });
    mkdirSync(other, { recursive: true });
    const original = allocateTaskPorts("helve-test-ports", own);
    writeFileSync(taskPortsPath(other), renderTaskPorts("another-helve-task", original));
    expect(readFileSync(taskPortsPath(other), "utf8")).toContain(`GTASK_SLOT=${original.slot}`);
    expect(allocateTaskPorts("helve-test-ports", own).slot).not.toBe(original.slot);
  } finally {
    if (previous === undefined) delete process.env.HELVE_HOME;
    else process.env.HELVE_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
});
