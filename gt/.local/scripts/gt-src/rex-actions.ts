import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { MASTER_BRANCH } from "./constants.ts";
import { fail, GtError } from "./errors.ts";
import { run } from "./process.ts";
import { isValidSlug, parsePullRequestNumber } from "./slug.ts";
import { ensureTaskScratch, taskDirectoryNameForTitle } from "./task.ts";
import { repositoryDirectory, workspaceRoot, workspaceStateDir, workspaces, type Workspace } from "./workspace-state.ts";
import { rexSessions } from "./workspace-tools.ts";
import {
  createWorkspace, findWorkspace, finishWorkspace, forkWorkspace, openSupport,
  openWorkspace, prepareWorkspace, refreshWorkspaceDatabases,
} from "./workspaces.ts";

export const rexOperations = ["new", "pr", "fork", "finish", "discard", "refresh-db", "support", "open", "setup"] as const;
export type RexOperation = typeof rexOperations[number];
type RexArgs = { name?: string; number?: number | string; task?: string; confirm?: string };
export type RexRequest = {
  operation: RexOperation;
  sourceSession?: string;
  clientID?: string;
  args: RexArgs;
};

const allowedArgs: Record<RexOperation, (keyof RexArgs)[]> = {
  new: ["name"], pr: ["number"], fork: ["name", "task"], support: [], open: ["task"], setup: ["task"],
  finish: ["task", "confirm"], discard: ["task", "confirm"], "refresh-db": ["task", "confirm"],
};

export function parseRexRequest(operation: string, raw: string): RexRequest {
  if (!rexOperations.includes(operation as RexOperation)) fail("unknown Gertrude Rex action");
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    fail("invalid Rex action context");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)
    || Object.keys(data).some((key) => !["sourceSession", "clientID", "args"].includes(key))) fail("invalid Rex action context");
  for (const [key, prefix] of [["sourceSession", "session:"], ["clientID", "client:"]]) {
    const value = data[key];
    if (value !== undefined && (typeof value !== "string" || !value.startsWith(prefix) || !/^[a-zA-Z0-9:_-]+$/.test(value))) {
      fail(`invalid Rex ${key}`);
    }
  }
  const raws = data.args ?? {};
  if (!raws || typeof raws !== "object" || Array.isArray(raws)) fail("invalid Rex action arguments");
  const args: RexArgs = {};
  for (const [key, value] of Object.entries(raws)) {
    // Palette answers arrive as text, so a PR number may be either; plans validate the text.
    const valid = typeof value === "string"
      || (key === "number" && Number.isSafeInteger(value) && Number(value) > 0);
    if (!allowedArgs[operation as RexOperation].includes(key as keyof RexArgs) || !valid) fail(`invalid ${operation} argument: ${key}`);
    (args as Record<string, unknown>)[key] = typeof value === "string" ? value.trim() : value;
  }
  return { operation: operation as RexOperation, sourceSession: data.sourceSession as string | undefined,
    clientID: data.clientID as string | undefined, args };
}

export function currentRexWorkspace(sourceSession?: string): Workspace | undefined {
  if (!sourceSession) return undefined;
  const matches = workspaces().filter((task) => task.rexSession === sourceSession);
  if (matches.length > 1) fail("multiple tasks claim this Rex session; inspect their resource records");
  return matches[0];
}

/** The task shown in a Rex session. Never guesses from a cwd. */
export function rexTask(sourceSession: string): { directory: string; apiPort: number | null } {
  if (!/^session:[a-zA-Z0-9_-]+$/.test(sourceSession)) fail("invalid Rex session");
  const task = currentRexWorkspace(sourceSession);
  if (!task) fail("this Rex session isn't a Gertrude task; open a task first");
  if (!existsSync(task.directory)) fail(`task checkout is missing: ${task.directory}`);
  return { directory: task.directory, apiPort: task.ports?.apiPort ?? null };
}

/** The session's task, with its scratch/todo.md created if missing. */
export function rexTodo(sourceSession: string): { directory: string; todo: string } {
  const { directory } = rexTask(sourceSession);
  ensureTaskScratch(directory);
  return { directory, todo: join(directory, "scratch", "todo.md") };
}

export function rexConfirmation(operation: "finish" | "discard" | "refresh-db", task: Workspace): string {
  return `${operation === "refresh-db" ? "refresh" : operation} ${task.name}`;
}

// A question for Rex's command palette. `prompt` is passed as-is to
// rex.ui.input or rex.ui.pick, and the answer is stored in args[field].
type PickItem = { id: string; title?: string; subtitle?: string; icon?: string; detail?: string };
export type RexPrompt = {
  field: keyof RexArgs;
  kind: "input" | "pick";
  prompt: { title: string; placeholder?: string; value?: string; confirm?: string; items?: PickItem[]; allow_other?: boolean };
};
// What the Rex action does next: ask a question, or run. Inline steps finish
// within the action's deadline; jobs get their own session for progress.
// Focused jobs end in the task you're going to; the others work in the background.
export type RexPlan =
  | { ask: RexPrompt }
  | { run: "inline" | "job"; title: string; focus: boolean };
type Resolved =
  | { ask: RexPrompt; problem?: string }
  | { run: "inline" | "job"; title: string; focus: boolean; task?: Workspace; name?: string; pullRequest?: number };

export type PullRequest = { number: number; title: string; author: string; branch: string; draft: boolean };

/** Open pull requests, or undefined when GitHub can't be asked; the palette then takes a typed number. */
export function openPullRequests(): PullRequest[] | undefined {
  const result = run("gh", ["pr", "list", "--json", "number,title,author,headRefName,isDraft", "--limit", "100"],
    { cwd: repositoryDirectory(), allowFailure: true, timeout: 8_000 });
  if (result.status !== 0) return undefined;
  try {
    return JSON.parse(result.stdout).map((pr: { number: number; title: string; author: { login: string }; headRefName: string; isDraft: boolean }) => ({
      number: pr.number, title: pr.title, author: pr.author.login, branch: pr.headRefName, draft: pr.isDraft,
    }));
  } catch {
    return undefined;
  }
}

function shortPath(path: string): string {
  return path.startsWith(homedir() + "/") ? "~" + path.slice(homedir().length) : path;
}

function taskItem(task: Workspace): PickItem {
  const detail = !existsSync(task.directory) ? "missing checkout" : task.phase === "ready" ? undefined : task.phase;
  return { id: task.id, title: task.name, subtitle: shortPath(task.directory), icon: "branch", ...detail ? { detail } : {} };
}

const taskQuestions: Record<Exclude<RexOperation, "new" | "pr" | "support">, { title: string; confirm: string }> = {
  open: { title: "Reopen task", confirm: "Open task" },
  setup: { title: "Resume setup for which task?", confirm: "Resume setup" },
  fork: { title: "Fork which task?", confirm: "Fork this task" },
  finish: { title: "Finish which task?", confirm: "Finish this task" },
  discard: { title: "Discard which task?", confirm: "Discard this task" },
  "refresh-db": { title: "Refresh which task's databases?", confirm: "Refresh this task" },
};

// The task an action applies to. Reopen is a picker, not an operation on the
// task already shown; the others use the source session's task when it has one.
function chooseTask(request: RexRequest): Workspace | { ask: RexPrompt } {
  const operation = request.operation as keyof typeof taskQuestions;
  if (request.args.task) return findWorkspace(request.args.task);
  const current = operation === "open" ? undefined : currentRexWorkspace(request.sourceSession);
  if (current) return current;
  const tasks = workspaces().sort((a, b) => a.name.localeCompare(b.name));
  if (!tasks.length) fail("no registered tasks; use New Task first (support is permanent)");
  return { ask: { field: "task", kind: "pick", prompt: { ...taskQuestions[operation], placeholder: "Filter tasks", items: tasks.map(taskItem) } } };
}

/** Why a new task (or a fork of parent) can't use this name, if it can't. */
function nameProblem(name: string, parent?: Workspace): string | undefined {
  if (!name) return "enter a name";
  if (!isValidSlug(name)) return "use letters, digits, '.', '_' or '-', starting with a letter or digit";
  if (name === MASTER_BRANCH) return `the name can't be ${MASTER_BRANCH}`;
  if (!parent && name === "support") return "support is permanent; use Open Support";
  const title = parent ? `${parent.name}/${name}` : name;
  const directory = join(workspaceRoot(), taskDirectoryNameForTitle(title));
  if (workspaces().some((task) => task.name === title || task.directory === directory) || existsSync(directory)) return `${title} already exists`;
  const branch = `gt/${taskDirectoryNameForTitle(title)}`;
  if (run("git", ["check-ref-format", "--branch", branch], { allowFailure: true }).status !== 0) return `${branch} isn't a valid branch name`;
  if (existsSync(repositoryDirectory())
    && run("git", ["-C", repositoryDirectory(), "show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { allowFailure: true }).status === 0) {
    return `branch ${branch} already exists`;
  }
  return undefined;
}

function askName(name: string | undefined, prompt: { title: string; placeholder: string; confirm: string }, parent?: Workspace): Resolved | string {
  const problem = name === undefined ? undefined : nameProblem(name, parent);
  if (name !== undefined && !problem) return name;
  return { ask: { field: "name", kind: "input", prompt: { ...prompt, title: problem ? `${prompt.title}: ${problem}` : prompt.title, value: name } }, problem };
}

function askPullRequest(value: string | undefined, problem: string | undefined, pullRequests: () => PullRequest[] | undefined): Resolved {
  const title = problem ? `Review a pull request: ${problem}` : "Review a pull request";
  const listed = pullRequests();
  if (!listed) {
    return { ask: { field: "number", kind: "input", prompt: { title, placeholder: "Pull request number, like 943", value, confirm: "Review PR" } }, problem };
  }
  const existing = new Set(workspaces().map((task) => task.name));
  return { problem, ask: { field: "number", kind: "pick", prompt: {
    title, placeholder: "Filter pull requests, or type a number", confirm: "Review PR", allow_other: true,
    items: listed.map((pr) => {
      const detail = existing.has(`review-${pr.number}`) ? "reopen" : pr.draft ? "draft" : undefined;
      return { id: String(pr.number), title: `#${pr.number} ${pr.title}`, subtitle: `${pr.author} · ${pr.branch}`, icon: "branch", ...detail ? { detail } : {} };
    }),
  } } };
}

const consequences = {
  finish: (name: string) => `Finish ${name}? Its checkout, databases, and Rex session are removed (it must be clean and merged)`,
  discard: (name: string) => `Discard ${name}? This deletes its checkout, databases, and Rex session, including uncommitted and unmerged work`,
  "refresh-db": (name: string) => `Replace ${name}'s databases with the scrubbed snapshot? Local database edits are lost`,
};
const confirmLabels = { finish: "Finish task", discard: "Discard task", "refresh-db": "Replace databases" };

function resolveRexAction(request: RexRequest, pullRequests: () => PullRequest[] | undefined): Resolved {
  const { operation, args } = request;
  if (operation === "support") return { run: "inline", title: "Open Support", focus: true };
  if (operation === "new") {
    const name = askName(args.name as string | undefined, { title: "New task", placeholder: "short-task-name", confirm: "Create task" });
    return typeof name === "string" ? { run: "job", title: `New ${name}`, focus: true, name } : name;
  }
  if (operation === "pr") {
    if (args.number === undefined) return askPullRequest(undefined, undefined, pullRequests);
    let pullRequest: number;
    try {
      pullRequest = typeof args.number === "number" ? args.number : parsePullRequestNumber(args.number);
    } catch (error) {
      if (!(error instanceof GtError)) throw error;
      return askPullRequest(String(args.number), `“${args.number}” isn't a pull request number`, pullRequests);
    }
    // A PR that already has a review task opens it instead of failing.
    const existing = workspaces().find((task) => task.name === `review-${pullRequest}`);
    if (existing) return { run: "inline", title: `Open ${existing.name}`, focus: true, task: existing };
    return { run: "job", title: `Review PR #${pullRequest}`, focus: true, name: `review-${pullRequest}`, pullRequest };
  }

  const task = chooseTask(request);
  if ("ask" in task) return task;
  if (operation === "open") return { run: "inline", title: `Open ${task.name}`, focus: true, task };
  if (operation === "setup") return { run: "job", title: `Set up ${task.name}`, focus: true, task };
  if (operation === "fork") {
    if (task.phase !== "ready") fail(`${task.name} isn't ready to fork; use Resume Task Setup first`);
    const name = askName(args.name, { title: `Fork ${task.name}`, placeholder: "fork-name", confirm: "Fork task" }, task);
    return typeof name === "string" ? { run: "job", title: `Fork ${task.name}/${name}`, focus: true, task, name } : name;
  }

  // Destructive: always a typed, task-specific confirmation, even with a task argument.
  const phrase = rexConfirmation(operation, task);
  if (args.confirm !== phrase) {
    const problem = args.confirm === undefined ? undefined : `type “${phrase}” exactly`;
    return { problem, ask: { field: "confirm", kind: "input", prompt: {
      title: problem ? `${consequences[operation](task.name)}. To confirm, ${problem}` : consequences[operation](task.name),
      placeholder: `Type “${phrase}” to confirm`, confirm: confirmLabels[operation],
    } } };
  }
  const verb = { finish: "Finish", discard: "Discard", "refresh-db": "Refresh databases:" }[operation];
  return { run: "job", title: `${verb} ${task.name}`, focus: false, task };
}

/** The next step for a Rex action: a palette question, or how to run it. */
export function planRexAction(request: RexRequest, pullRequests = openPullRequests): RexPlan {
  const resolved = resolveRexAction(request, pullRequests);
  return "ask" in resolved ? { ask: resolved.ask } : { run: resolved.run, title: resolved.title, focus: resolved.focus };
}

function status(state: string, message: string): void {
  if (!process.stdout.isTTY) return;
  const text = Buffer.from(message).toString("base64");
  process.stdout.write(`\x1b]7501;state=${state}:app=gt:msg=${text}\x1b\\`);
}

/** Runs a fully answered request; returns the session to show afterwards, if any. */
export async function executeRexAction(request: RexRequest): Promise<string | undefined> {
  // Every answer must already be present: jobs never ask in the terminal.
  const step = resolveRexAction(request, () => undefined);
  if ("ask" in step) fail(step.problem ?? `missing ${step.ask.field}; run this from the Rex command palette`);
  const { operation } = request;
  const { task, name } = step;
  console.log(`${step.title}\n`);
  status("working", step.title);
  if (operation === "support") {
    openSupport();
    return JSON.parse(readFileSync(join(workspaceStateDir(), "support.json"), "utf8")).rexSession;
  }
  if (operation === "new" || (operation === "pr" && !task)) {
    await createWorkspace(name!, { pullRequest: step.pullRequest });
    return findWorkspace(name).rexSession ?? undefined;
  }
  console.log(`Task: ${task!.name}\nCheckout: ${task!.directory}\n`);
  if (operation === "fork") {
    process.chdir(task!.directory);
    await forkWorkspace(name!);
    return findWorkspace(`${task!.name}/${name}`).rexSession ?? undefined;
  }
  if (operation === "open" || operation === "setup" || operation === "pr") {
    if (operation === "setup") await prepareWorkspace(task!.id);
    openWorkspace(task!.id);
    return findWorkspace(task!.id).rexSession ?? undefined;
  }
  if (operation === "refresh-db") {
    await refreshWorkspaceDatabases(task!.id);
    return undefined;
  }
  await finishWorkspace(task!.id, operation === "discard");
  return undefined;
}

function selectSession(request: RexRequest, sessionID?: string): void {
  if (!request.clientID || !sessionID) return;
  try {
    if (!rexSessions().some((session) => session.session_id === sessionID)) return;
    const catalog = run("rex", ["-C", request.clientID, "actions", "--json"], { allowFailure: true });
    if (catalog.status !== 0) throw new Error("could not inspect client actions");
    const decoded = JSON.parse(catalog.stdout);
    const actions = Array.isArray(decoded) ? decoded : decoded.actions;
    if (!Array.isArray(actions) || !actions.some((action) => action.name === "session.select")) throw new Error("client does not support session.select");
    const result = run("rex", ["-C", request.clientID, "do", "session.select", `session_id=${sessionID}`], { allowFailure: true });
    if (result.status !== 0) console.warn("Select the task in Rex. Automatic switching was unavailable (Rex Remote Control may be disabled).");
  } catch {
    console.warn("Select the task in Rex; automatic switching was unavailable.");
  }
}

function waitForReturn(): Promise<void> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    terminal.on("close", resolve);
    terminal.on("SIGINT", () => terminal.close());
    terminal.question("Press Return to close this job… ", () => terminal.close());
  });
}

export async function runRexAction(operation: string, raw: string): Promise<void> {
  const request = parseRexRequest(operation, raw);
  try {
    const session = await executeRexAction(request);
    status("done", "Done");
    selectSession(request, session);
  } catch (error) {
    status("error", "Gertrude task action failed");
    if (!process.stdin.isTTY) throw error;
    console.error(error instanceof GtError || error instanceof Error ? error.message : String(error));
    console.error("The operation did not finish. Recorded task resources are retained for recovery; use Resume Task Setup when appropriate.");
    // Background jobs aren't on screen; bring this one up so the failure is seen.
    selectSession(request, process.env.REX_SESSION);
    await waitForReturn();
    selectSession(request, request.sourceSession);
  }
}
