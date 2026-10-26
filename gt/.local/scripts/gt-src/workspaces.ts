import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { taskDatabaseNames, setupTaskDatabases } from "./databases.ts";
import { parseSimpleDotenv } from "./dotenv.ts";
import { writeSwiftApiEnv } from "./env.ts";
import { fail } from "./errors.ts";
import { allocateTaskPorts, renderTaskPorts, taskPortsFromEnv, taskPortsPath } from "./ports.ts";
import { commandExists, currentSystemUser, requireCommands, run } from "./process.ts";
import { withResourceLock, withResourceLockSync } from "./resource-lock.ts";
import { taskPortsLockPath } from "./codex-state.ts";
import { validateGitBranchName, validateSlug } from "./slug.ts";
import { taskDirectoryNameForTitle } from "./task.ts";
import { copyUncommittedWork } from "./workspace-copy.ts";
import { databaseCopyTools, dropWorkspaceDatabases, existingWorkspaceDatabases, postgresEnvironment, provisionWorkspaceDatabases } from "./workspace-db.ts";
import { newWorkspace, workspaceLock, workspacePath, workspaceRoot, workspaceStateDir, workspaces, writeWorkspace, type Workspace } from "./workspace-state.ts";
import { assertNoActiveAgent, ensureRepository, git, oc, openRex, opencodeBinary, rexSessions, verifyWorkspace } from "./workspace-tools.ts";

export function findWorkspace(argument?: string): Workspace {
  const all = workspaces();
  const path = resolve(argument || process.cwd());
  const matches = all.filter((task) => argument
    ? task.name === argument || task.id === argument || task.directory === path
    : path === task.directory || path.startsWith(task.directory + "/"));
  if (matches.length !== 1) fail(matches.length ? "ambiguous task; use its full name or path" : "not a registered task; use gt list or gt adopt <Helve-worktree>");
  return matches[0];
}

function reserveWorkspace(name: string): Workspace {
  return withResourceLockSync(workspaceLock("registry"), () => {
    const directory = join(workspaceRoot(), taskDirectoryNameForTitle(name));
    if (workspaces().some((task) => task.name === name || task.directory === directory) || existsSync(directory)) {
      fail(`task already exists: ${name}`);
    }
    const task = newWorkspace(name, directory, currentSystemUser());
    writeWorkspace(task);
    return task;
  });
}

function writeWorkspaceEnvironment(task: Workspace): void {
  if (!task.ports) fail("task has no port allocation");
  const names = taskDatabaseNames(task.slug);
  writeSwiftApiEnv(task.directory, task.slug, task.ports, {
    DATABASE_HOST: task.postgres.host, DATABASE_PORT: String(task.postgres.port),
    DATABASE_USERNAME: task.postgres.username, DATABASE_PASSWORD: "",
    DATABASE_NAME: names.databaseName, TEST_DATABASE_NAME: names.testDatabaseName,
    ACCOUNT_DASHBOARD_URL: `http://localhost:${task.ports.accountPort}`,
  });
}

async function setupWorkspace(task: Workspace): Promise<void> {
  verifyWorkspace(task);
  if (task.origin !== "opencode") fail("adopted Helve tasks already have their own environment; use gt refresh-db only for an intentional database reset");
  if (task.phase !== "setup" && task.phase !== "ready") fail(`task is ${task.phase}; inspect it before finishing with --discard`);
  requireCommands(["pnpm", "psql", "createdb", "dropdb", "gzip", "gunzip", "sed", "nc"]);
  withResourceLockSync(taskPortsLockPath(), () => {
    task.ports ??= allocateTaskPorts(task.slug, task.directory, false);
    writeWorkspace(task);
    writeFileSync(taskPortsPath(task.directory), renderTaskPorts(task.name, task.ports), { mode: 0o600 });
  });
  console.log("Preparing task databases…");
  const parent = task.parentID && !task.databasesReady ? findWorkspace(task.parentID) : undefined;
  await provisionWorkspaceDatabases(task, parent || undefined);
  task.databasesReady = true;
  writeWorkspace(task);
  writeWorkspaceEnvironment(task);
  console.log("Installing web dependencies…");
  run("pnpm", ["install", "--frozen-lockfile"], { cwd: join(task.directory, "web"), inherit: true });
  task.phase = "ready";
  writeWorkspace(task);
}

export async function prepareWorkspace(argument?: string): Promise<void> {
  const initial = findWorkspace(argument);
  await withResourceLock(workspaceLock(initial.id), async () => {
    await setupWorkspace(findWorkspace(initial.id));
  });
}

export function openWorkspace(argument?: string): void {
  const initial = findWorkspace(argument);
  withResourceLockSync(workspaceLock(initial.id), () => {
    const task = findWorkspace(initial.id);
    verifyWorkspace(task);
    if (task.phase !== "ready") fail(`task is ${task.phase}; finish setup first with gt setup ${task.name}`);
    task.rexSession = openRex(task.name, task.directory, task.rexSession);
    writeWorkspace(task);
    console.log(`Rex: ${task.name}\n${task.directory}`);
  });
}

export async function createWorkspace(name: string, options: { agent?: boolean; pullRequest?: number; parent?: Workspace } = {}): Promise<void> {
  validateSlug(name);
  if (name === "support" && !options.parent) fail("support is permanent; use gt support");
  requireCommands(["git", "pnpm", "psql", "createdb", "dropdb", "gzip", "gunzip", "sed", "nc", ...options.agent ? [] : ["rex"]]);
  opencodeBinary();
  const parent = options.parent;
  if (parent) {
    verifyWorkspace(parent);
    if (parent.phase !== "ready") fail("the parent task is not ready");
    requireCommands(["pg_dump", "pg_restore"]);
    databaseCopyTools(parent);
  }
  const repository = withResourceLockSync(workspaceLock("registry"), ensureRepository);
  const title = parent ? `${parent.name}/${name}` : name;
  const branch = `gt/${taskDirectoryNameForTitle(title)}`;
  validateGitBranchName(branch);
  if (run("git", ["-C", repository.directory, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { allowFailure: true }).status === 0) {
    fail(`branch already exists: ${branch}`);
  }
  const source = repository.directory;
  let startingRef: string;
  if (parent) {
    const location = oc<{ project: { id: string } }>("get", "/api/location", undefined, parent.directory);
    if (location.project.id !== repository.projectID) fail("parent belongs to a different OpenCode project");
    startingRef = git(parent.directory, ["rev-parse", "HEAD"]);
    const common = realpathSync(git(repository.directory, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
    if (parent.gitCommonDir !== common) git(repository.directory, ["fetch", "--no-tags", parent.directory, "HEAD"]);
  } else {
    const ref = options.pullRequest ? `refs/pull/${options.pullRequest}/head` : "refs/heads/master";
    const destination = options.pullRequest ? `refs/gt/pr/${options.pullRequest}` : "refs/remotes/origin/master";
    git(repository.directory, ["fetch", "origin", `+${ref}:${destination}`]);
    startingRef = git(repository.directory, ["rev-parse", destination]);
  }
  const task = reserveWorkspace(title);
  task.projectID = repository.projectID;
  task.parentID = parent?.id || null;
  task.pullRequest = options.pullRequest;
  writeWorkspace(task);
  await withResourceLock(workspaceLock(task.id), async () => {
    try {
      console.log(`Creating worktree ${title}…`);
      const created = oc<{ directory: string }>("post", "/api/worktree", {
        projectID: task.projectID, from: source, branch: startingRef, directory: workspaceRoot(), name: basename(task.directory),
      });
      if (resolve(created.directory) !== task.directory) fail(`OpenCode chose an unexpected destination: ${created.directory}; inspect it before retrying`);
      task.gitCommonDir = realpathSync(git(task.directory, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
      task.branch = git(task.directory, ["branch", "--show-current"]);
      writeWorkspace(task);
      git(task.directory, task.branch ? ["branch", "-m", branch] : ["switch", "-c", branch]);
      task.branch = branch;
      writeWorkspace(task);
      if (parent) copyUncommittedWork(parent.directory, task.directory);
      task.phase = "setup";
      writeWorkspace(task);
      await setupWorkspace(task);
    } catch (error) {
      console.error(`Task retained for recovery: ${task.name}\n${task.directory}`);
      console.error(task.phase === "setup" ? `Retry with: gt setup ${task.name}` : `Inspect before retrying, or remove with: gt finish --discard ${task.name}`);
      throw error;
    }
  });
  if (!options.agent) openWorkspace(task.id);
  console.log(`Ready: ${task.name}\n${task.directory}`);
}

export async function forkWorkspace(name: string, agent = false): Promise<void> {
  const parent = findWorkspace();
  await withResourceLock(workspaceLock(parent.id), async () => {
    await createWorkspace(name, { parent: findWorkspace(parent.id), agent });
  });
}

export function adoptHelveWorkspace(argument: string, agent = false): void {
  const directory = realpathSync(resolve(argument));
  const registered = workspaces().find((task) => task.directory === directory);
  if (registered) {
    if (!agent) openWorkspace(registered.id);
    return;
  }
  const home = resolve(process.env.HELVE_HOME || join(homedir(), "Library", "Application Support", "Helve"));
  const markers = join(home, "task-scripts");
  const entries = readdirSync(markers).map((id) => join(markers, id, "gertrude.json")).filter(existsSync);
  const matches = entries.map((path) => ({ path, marker: JSON.parse(readFileSync(path, "utf8")) }))
    .filter(({ marker }) => marker.worktree === directory);
  if (matches.length !== 1) fail("expected exactly one matching Helve Gertrude resource marker");
  const { marker, path } = matches[0];
  if (dirname(path) !== join(markers, marker.taskID) || dirname(directory) !== join(home, "worktrees", marker.projectID)) fail("Helve ownership paths do not match");
  const task = newWorkspace(basename(directory), directory, currentSystemUser());
  task.id = marker.taskID;
  task.slug = `helve_${task.id.replaceAll("-", "")}`;
  task.origin = "helve";
  task.helveMarker = path;
  task.gitCommonDir = realpathSync(git(directory, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  task.branch = git(directory, ["branch", "--show-current"]);
  verifyWorkspace(task);
  const ports = taskPortsFromEnv(parseSimpleDotenv(readFileSync(taskPortsPath(directory), "utf8")));
  if (!ports) fail("Helve task has no valid port allocation; refusing to reprovision it");
  task.ports = ports;
  const values = parseSimpleDotenv(readFileSync(join(directory, "swift", "api", ".env"), "utf8"));
  const names = taskDatabaseNames(task.slug);
  if (values.DATABASE_NAME !== names.databaseName || values.TEST_DATABASE_NAME !== names.testDatabaseName
    || ![undefined, "localhost", "127.0.0.1"].includes(values.DATABASE_HOST)) fail("Helve database ownership or local host does not match");
  task.postgres.username = values.DATABASE_USERNAME || currentSystemUser();
  task.postgres.port = Number(values.DATABASE_PORT || 5432);
  task.databasesReady = true;
  task.phase = "ready";
  if (existingWorkspaceDatabases(task).length !== 2) fail("Helve databases are missing; adoption never recreates them");
  const location = oc<{ project: { id: string } }>("get", "/api/location", undefined, directory);
  task.projectID = location.project.id;
  withResourceLockSync(workspaceLock("registry"), () => {
    if (workspaces().some((other) => other.name === task.name || other.id === task.id || other.directory === directory)) fail("task already registered");
    writeWorkspace(task);
  });
  console.log(`Adopted ${task.name}; kept checkout, databases, environment, and ports unchanged.`);
  if (!agent) openWorkspace(task.id);
}

export async function refreshWorkspaceDatabases(argument?: string): Promise<void> {
  const initial = findWorkspace(argument);
  await withResourceLock(workspaceLock(initial.id), async () => {
    const task = findWorkspace(initial.id);
    verifyWorkspace(task);
    if (task.phase === "creating" || task.phase === "finishing") fail(`task is ${task.phase}`);
    await setupTaskDatabases(task.slug, postgresEnvironment(task));
    task.databasesReady = true;
    writeWorkspace(task);
    if (task.origin === "opencode") writeWorkspaceEnvironment(task);
    console.log(`Refreshed databases for ${task.name}.`);
  });
}

export function workspaceFinishProblems(task: Workspace): string[] {
  const problems: string[] = [];
  if (git(task.directory, ["status", "--porcelain"])) problems.push("uncommitted or untracked files");
  if (git(task.directory, ["branch", "--show-current"]) !== task.branch) problems.push("the checked-out branch has changed");
  const fetched = run("git", ["-C", task.directory, "fetch", "origin", "+refs/heads/master:refs/remotes/origin/master"], { allowFailure: true });
  if (fetched.status !== 0) return [...problems, "could not fetch origin/master"];
  const merged = run("git", ["-C", task.directory, "merge-base", "--is-ancestor", "HEAD", "refs/remotes/origin/master"], { allowFailure: true }).status === 0;
  if (!merged) {
    let mergedPullRequest = false;
    if (commandExists("gh")) {
      const args = task.pullRequest
        ? ["pr", "view", String(task.pullRequest), "--json", "state,headRefOid"]
        : ["pr", "list", "--state", "merged", "--head", task.branch, "--json", "state,headRefOid"];
      const result = run("gh", args, { cwd: task.directory, allowFailure: true });
      if (result.status === 0) {
        const data = JSON.parse(result.stdout);
        const prs = Array.isArray(data) ? data : [data];
        const head = git(task.directory, ["rev-parse", "HEAD"]);
        mergedPullRequest = prs.some((pr) => pr.state === "MERGED" && pr.headRefOid === head);
      }
    }
    if (!mergedPullRequest) problems.push("HEAD is not published in origin/master or the exact head of a merged pull request");
  }
  return problems;
}

export async function finishWorkspace(argument?: string, discard = false): Promise<void> {
  const initial = findWorkspace(argument);
  await withResourceLock(workspaceLock(initial.id), async () => {
    const task = findWorkspace(initial.id);
    if (existsSync(task.directory)) {
      verifyWorkspace(task);
      const gitDir = realpathSync(git(task.directory, ["rev-parse", "--path-format=absolute", "--git-dir"]));
      if (gitDir === task.gitCommonDir) fail("refusing to delete a main checkout");
      if (!discard) {
        const problems = workspaceFinishProblems(task);
        if (problems.length) fail(`refusing to finish ${task.name}:\n- ${problems.join("\n- ")}\nUse --discard only to intentionally abandon this work.`);
      }
    } else if (!discard && task.phase !== "finishing") {
      fail("checkout is missing; inspect recorded resources before using --discard");
    }
    if (task.origin === "helve" && existsSync(task.helveMarker!)) {
      const marker = JSON.parse(readFileSync(task.helveMarker!, "utf8"));
      if (marker.taskID !== task.id || marker.worktree !== task.directory) fail("Helve ownership marker no longer matches");
    }
    assertNoActiveAgent(task.directory);
    const active = task.rexSession && rexSessions().find((session) => session.session_id === task.rexSession);
    if (active) {
      if (process.env.REX_SESSION === task.rexSession) fail("finish this task from another Rex session so cleanup cannot terminate itself");
    }
    task.phase = "finishing";
    writeWorkspace(task);
    if (active) {
      run("rex", ["kill", task.rexSession!]);
      task.rexSession = null;
      writeWorkspace(task);
    }
    dropWorkspaceDatabases(task);
    task.databasesReady = false;
    writeWorkspace(task);
    if (existsSync(task.directory)) {
      oc("post", "/api/worktree/refresh", { projectID: task.projectID });
      oc("delete", "/api/worktree", { projectID: task.projectID, directory: task.directory, force: true });
    }
    if (task.branch) {
      const branch = run("git", ["--git-dir", task.gitCommonDir, "show-ref", "--verify", "--quiet", `refs/heads/${task.branch}`], { allowFailure: true });
      if (branch.status === 0) run("git", ["--git-dir", task.gitCommonDir, "branch", "-D", "--", task.branch]);
    }
    if (task.helveMarker) rmSync(task.helveMarker, { force: true });
    rmSync(workspacePath(task.id));
    console.log(`Finished ${task.name}. OpenCode conversation history was retained.`);
  });
}

export function listWorkspaces(): void {
  for (const task of workspaces().sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`${task.name}  [${existsSync(task.directory) ? task.phase : "missing checkout"}${task.origin === "helve" ? ", Helve" : ""}]\n  ${task.directory}`);
  }
  if (!workspaces().length) console.log("No registered Gertrude tasks.");
  console.log(`Support: ${join(homedir(), "active-projects", "support")} (permanent; not a disposable task)`);
}

export function openSupport(): void {
  const directory = resolve(process.env.SUPPORT_DIR || join(homedir(), "active-projects", "support"));
  if (!existsSync(join(directory, "AGENTS.md")) || !existsSync(join(directory, ".git"))) fail(`support repository not found: ${directory}`);
  const path = join(workspaceStateDir(), "support.json");
  withResourceLockSync(workspaceLock("registry"), () => {
    const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
    if (previous.directory && previous.directory !== directory) fail("support directory changed; inspect support.json first");
    const session = openRex("support", directory, previous.rexSession);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify({ directory, rexSession: session }, null, 2) + "\n", { mode: 0o600 });
    console.log(`Rex: support\n${directory}\nExisting code/database refresh schedules were left unchanged.`);
  });
}
