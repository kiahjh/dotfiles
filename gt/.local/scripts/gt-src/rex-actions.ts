import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fail, GtError } from "./errors.ts";
import { run } from "./process.ts";
import { parsePullRequestNumber } from "./review-task.ts";
import { validateSlug } from "./slug.ts";
import { workspaceStateDir, workspaces, type Workspace } from "./workspace-state.ts";
import { rexSessions } from "./workspace-tools.ts";
import {
  createWorkspace, findWorkspace, finishWorkspace, forkWorkspace, openSupport,
  openWorkspace, prepareWorkspace, refreshWorkspaceDatabases,
} from "./workspaces.ts";

export const rexOperations = ["new", "pr", "fork", "finish", "discard", "refresh-db", "support", "open", "setup"] as const;
export type RexOperation = typeof rexOperations[number];
export type RexRequest = {
  operation: RexOperation;
  sourceSession?: string;
  clientID?: string;
  args: { name?: string; number?: number; task?: string };
};

export class RexActionCancelled extends Error {}

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
  const args = data.args ?? {};
  if (!args || typeof args !== "object" || Array.isArray(args)) fail("invalid Rex action arguments");
  const allowed = operation === "new" ? ["name"] : operation === "pr" ? ["number"]
    : operation === "fork" ? ["name", "task"] : operation === "support" ? [] : ["task"];
  for (const [key, value] of Object.entries(args)) {
    if (!allowed.includes(key) || (key === "number" ? !Number.isSafeInteger(value) || Number(value) <= 0 : typeof value !== "string")) {
      fail(`invalid ${operation} argument: ${key}`);
    }
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

export function rexConfirmation(operation: "finish" | "discard" | "refresh-db", task: Workspace): string {
  return `${operation === "refresh-db" ? "refresh" : operation} ${task.name}`;
}

function status(state: string, message: string, kind?: string): void {
  if (!process.stdout.isTTY) return;
  const text = Buffer.from(message).toString("base64");
  process.stdout.write(`\x1b]7501;state=${state}:app=gt${kind ? `:kind=${kind}` : ""}:msg=${text}\x1b\\`);
}

export type RexActionIO = {
  ask: (prompt: string) => Promise<string>;
  print: (message: string) => void;
};

async function chooseTask(request: RexRequest, io: RexActionIO): Promise<Workspace> {
  if (request.args.task) return findWorkspace(request.args.task);
  // Reopen is a picker, not an operation on the task we're already viewing.
  const current = request.operation === "open" ? undefined : currentRexWorkspace(request.sourceSession);
  if (current) return current;
  const tasks = workspaces().sort((a, b) => a.name.localeCompare(b.name));
  if (!tasks.length) fail("no registered tasks; use New Task in the Gertrude category first (support is permanent)");
  io.print("Choose a development task (support is not disposable):");
  tasks.forEach((task, index) => io.print(`  ${index + 1}. ${task.name} [${task.phase}]\n     ${task.directory}`));
  status("blocked", "Choose a Gertrude task", "question");
  const answer = (await io.ask("Task number or name (blank cancels): ")).trim();
  if (!answer) throw new RexActionCancelled();
  if (/^\d+$/.test(answer)) {
    const task = tasks[Number(answer) - 1];
    if (!task) fail("invalid task number");
    return task;
  }
  return findWorkspace(answer);
}

async function taskName(request: RexRequest, io: RexActionIO): Promise<string> {
  status("blocked", "Name the Gertrude task", "question");
  const name = (request.args.name ?? await io.ask("Task name (blank cancels): ")).trim();
  if (!name) throw new RexActionCancelled();
  validateSlug(name);
  return name;
}

export async function executeRexAction(request: RexRequest, io: RexActionIO): Promise<string | undefined> {
  const { operation } = request;
  io.print(`Gertrude: ${operation}\n`);
  if (operation === "support") {
    status("working", "Opening support");
    openSupport();
    return JSON.parse(readFileSync(join(workspaceStateDir(), "support.json"), "utf8")).rexSession;
  }
  if (operation === "new" || operation === "pr") {
    let name: string;
    let pullRequest: number | undefined;
    if (operation === "pr") {
      status("blocked", "Enter the pull request number", "question");
      const value = request.args.number === undefined ? (await io.ask("Pull request number (blank cancels): ")).trim() : String(request.args.number);
      if (!value) throw new RexActionCancelled();
      pullRequest = parsePullRequestNumber(value);
      name = `review-${pullRequest}`;
    } else {
      name = await taskName(request, io);
    }
    status("working", `Preparing ${name}`);
    await createWorkspace(name, { pullRequest });
    return findWorkspace(name).rexSession ?? undefined;
  }

  const task = await chooseTask(request, io);
  io.print(`Task: ${task.name}\nCheckout: ${task.directory}\n`);
  if (operation === "fork") {
    const name = await taskName(request, io);
    status("working", `Forking ${task.name}`);
    process.chdir(task.directory);
    await forkWorkspace(name);
    return findWorkspace(`${task.name}/${name}`).rexSession ?? undefined;
  }
  if (operation === "open" || operation === "setup") {
    status("working", `${operation === "setup" ? "Preparing" : "Opening"} ${task.name}`);
    if (operation === "setup") await prepareWorkspace(task.id);
    openWorkspace(task.id);
    return findWorkspace(task.id).rexSession ?? undefined;
  }

  const phrase = rexConfirmation(operation, task);
  io.print(operation === "refresh-db"
    ? "This replaces BOTH task databases with the scrubbed snapshot. Local database edits will be lost."
    : operation === "discard"
      ? "This DELETES the checkout, both databases, and its Rex session, INCLUDING uncommitted/unmerged work."
      : "This deletes the checkout, both databases, and its Rex session. Clean/merged checks still apply.");
  status("blocked", `Confirm ${operation} for ${task.name}`, "permission");
  if (await io.ask(`Type '${phrase}' to confirm (anything else cancels): `) !== phrase) throw new RexActionCancelled();
  status("working", `${operation}: ${task.name}`);
  if (operation === "refresh-db") {
    await refreshWorkspaceDatabases(task.id);
    return task.rexSession ?? undefined;
  }
  await finishWorkspace(task.id, operation === "discard");
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

export async function runRexAction(operation: string, raw: string): Promise<void> {
  const request = parseRexRequest(operation, raw);
  const terminal = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  const lines = terminal[Symbol.asyncIterator]();
  terminal.on("SIGINT", () => terminal.close());
  const io: RexActionIO = {
    print: (text) => console.log(text),
    ask: async (prompt) => {
      terminal.setPrompt(prompt);
      terminal.prompt();
      const line = await lines.next();
      if (line.done) throw new RexActionCancelled();
      return line.value.trim();
    },
  };
  try {
    const session = await executeRexAction(request, io);
    status("done", "Gertrude task action completed");
    selectSession(request, session ?? request.sourceSession);
  } catch (error) {
    if (error instanceof RexActionCancelled) {
      status("idle", "Cancelled");
      console.log("Cancelled; no requested destructive operation was run.");
      selectSession(request, request.sourceSession);
      return;
    }
    status("error", "Gertrude task action failed");
    if (!process.stdin.isTTY) throw error;
    console.error(error instanceof GtError || error instanceof Error ? error.message : String(error));
    console.error("The operation did not finish. Recorded task resources are retained for recovery; use Resume Task Setup when appropriate.");
    try { await io.ask("Press Return to close this job… "); } catch {}
    selectSession(request, request.sourceSession);
  } finally {
    terminal.close();
  }
}
