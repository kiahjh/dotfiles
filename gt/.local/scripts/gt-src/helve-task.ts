import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { taskDatabaseNames, setupTaskDatabases } from "./databases.ts";
import { writeSwiftApiEnv } from "./env.ts";
import { fail, GtError } from "./errors.ts";
import { setupTaskPorts } from "./ports.ts";
import { requireCommands, run } from "./process.ts";

export type HelveTask = {
  taskID: string;
  projectID: string;
  worktree: string;
  stateDir: string;
  slug: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Helve owns the checkout. Never use gt spawn, setup-env-db, or kill on it. */
export function helveTaskFromEnv(env: NodeJS.ProcessEnv): HelveTask {
  const taskID = env.HELVE_TASK_ID?.toLowerCase();
  const projectID = env.HELVE_PROJECT_ID?.toLowerCase();
  const home = env.HELVE_HOME;
  const worktree = env.HELVE_WORKTREE;
  const stateDir = env.HELVE_TASK_STATE_DIR;
  if (!taskID || !uuid.test(taskID) || !projectID || !uuid.test(projectID)
    || !home || !worktree || !stateDir) {
    fail("expected Helve task ID, project ID, home, worktree and task state directory");
  }
  const root = resolve(home);
  const checkout = resolve(worktree);
  if (dirname(dirname(checkout)) !== join(root, "worktrees")
    || basename(dirname(checkout)) !== projectID
    || resolve(stateDir) !== join(root, "task-scripts", taskID)) {
    fail("task paths do not match Helve's project and task IDs");
  }
  return { taskID, projectID, worktree: checkout, stateDir: resolve(stateDir), slug: `helve_${taskID.replaceAll("-", "")}` };
}

export function markerPath(task: HelveTask): string {
  return join(task.stateDir, "gertrude.json");
}

function verifyMarker(task: HelveTask): boolean {
  if (!existsSync(markerPath(task))) return false;
  let marker: unknown;
  try {
    marker = JSON.parse(readFileSync(markerPath(task), "utf8"));
  } catch {
    fail("invalid Gertrude task marker; refusing to touch local databases");
  }
  if (typeof marker !== "object" || marker === null
    || !('taskID' in marker) || marker.taskID !== task.taskID
    || !('projectID' in marker) || marker.projectID !== task.projectID
    || !('worktree' in marker) || marker.worktree !== task.worktree) {
    fail("Gertrude task marker does not match this Helve task");
  }
  return true;
}

export async function setupHelveTask(task: HelveTask): Promise<void> {
  if (!existsSync(task.worktree) || realpathSync(task.worktree) !== task.worktree) {
    fail(`missing or redirected worktree: ${task.worktree}`);
  }
  if (!existsSync(join(task.worktree, "swift", "api")) || !existsSync(join(task.worktree, "web"))) {
    fail("this does not look like a Gertrude checkout (expected swift/api and web)");
  }
  requireCommands(["pnpm", "psql", "createdb", "dropdb", "gunzip", "sed", "nc"]);
  // Written before provisioning so a failed/cancelled setup can always be torn down.
  mkdirSync(task.stateDir, { recursive: true, mode: 0o700 });
  if (!verifyMarker(task)) {
    writeFileSync(markerPath(task), JSON.stringify({ taskID: task.taskID, projectID: task.projectID, worktree: task.worktree }) + "\n", { mode: 0o600, flag: "wx" });
  }

  console.log("Assigning task-local ports (checking both GT and Helve tasks)…");
  const ports = setupTaskPorts(task.worktree, task.slug);
  console.log(`api ${ports.apiPort}, dash ${ports.dashPort}, site ${ports.sitePort}, account ${ports.accountPort}`);

  const names = await setupTaskDatabases(task.slug);
  console.log(`Restored ${names.databaseName} and ${names.testDatabaseName}`);
  writeSwiftApiEnv(task.worktree, task.slug, ports);
  console.log("Wrote swift/api/.env");

  console.log("Installing web dependencies…");
  run("pnpm", ["install"], { cwd: join(task.worktree, "web"), inherit: true });
  console.log("Gertrude task ready.");
}

export function teardownHelveTask(task: HelveTask): void {
  if (!verifyMarker(task)) {
    console.log("No Gertrude setup marker; nothing to clean up.");
    return;
  }
  requireCommands(["dropdb"]);
  const names = taskDatabaseNames(task.slug);
  // Unlike gt's best-effort drop helper, failure must pause Helve's deletion.
  run("dropdb", ["--if-exists", names.testDatabaseName], { inherit: true });
  run("dropdb", ["--if-exists", names.databaseName], { inherit: true });
  rmSync(markerPath(task));
  console.log(`Removed ${names.databaseName} and ${names.testDatabaseName}.`);
}

if (import.meta.main) {
  try {
    const command = process.argv[2];
    if (command !== "setup" && command !== "teardown") {
      fail("usage: helve-gertrude-task setup|teardown");
    }
    const task = helveTaskFromEnv(process.env);
    if (command === "setup") await setupHelveTask(task);
    else teardownHelveTask(task);
  } catch (error) {
    if (error instanceof GtError) console.error(`helve-gertrude-task: ${error.message}`);
    else console.error(error);
    process.exit(1);
  }
}
