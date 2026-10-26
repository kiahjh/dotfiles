import { GtError } from "./errors.ts";
import { parsePullRequestNumber } from "./review-task.ts";
import {
  adoptHelveWorkspace, createWorkspace, finishWorkspace, forkWorkspace, listWorkspaces,
  openSupport, openWorkspace, prepareWorkspace, refreshWorkspaceDatabases,
} from "./workspaces.ts";

type CliAction =
  | { command: "help"; topic?: string }
  | { command: "spawn"; name: string; agent: boolean }
  | { command: "fork"; name: string; agent: boolean }
  | { command: "review"; pullRequestNumber: number; agent: boolean }
  | { command: "kill"; taskArg?: string; discard?: boolean }
  | { command: "list" }
  | { command: "support" }
  | { command: "open" | "setup"; taskArg?: string }
  | { command: "adopt"; taskArg: string; agent: boolean }
  | { command: "setup-env-db"; taskArg?: string }
  | { command: "setup-ports"; taskArg?: string }
  | { command: "rex-action"; operation: string; context: string };

const HELP_FLAGS = new Set(["--help", "-h"]);

export function usage(): string {
  return `gt — Gertrude task lifecycle for Rex + OpenCode

Usage:
  gt <command> [options]

Commands:
  new <name>                  Fresh worktree from latest origin/master, fully provisioned
  pr <PR#>                    Fully provisioned worktree for a pull request
  fork <name>                 Copy current task's committed + uncommitted code and databases
  finish [task] [--discard]   Remove a clean, merged task, its databases, and Rex session
  support                     Open the permanent support workspace (no provisioning)
  list                        Show registered tasks
  open [task]                 Recreate a missing Rex session; never reset databases
  adopt <Helve-worktree>      Open an existing Helve task without changing its resources
  setup [task]                Resume provisioning after a failed setup
  refresh-db [task]            Explicitly replace databases with the scrubbed snapshot

Options:
  -h, --help                   Show help
  --no-open, --agent           Provision without creating a Rex session

Examples:
  gt new duo-support
  gt pr 891
  gt fork sidebar-spike
  gt finish duo-support
  gt support

Switch tasks in Rex. gt does not manage your conversations, tabs, or panes.
The Rex command palette also exposes these operations: search Gertrude.
Aliases: spawn → new, review → pr, kill → finish, setup-env-db → refresh-db.

Run \`gt <command> --help\` for command-specific help.`;
}

export function commandUsage(command: string): string | null {
  switch (command) {
    case "spawn":
      return `Usage:
  gt spawn [--agent] <task-name>
  gt new [--no-open] <task-name>

Create a fresh Gertrude task workspace:
  - create an OpenCode-managed Git worktree from freshly fetched origin/master
  - create branch gt/<task-name> under ~/active-projects/gertrude/<task-name>
  - assign task-specific local ports in .gtask-ports
  - create isolated local Postgres databases from the scrubbed dump
  - render swift/api/.env
  - run pnpm install in ./web
  - open a Rex session with one OpenCode pane unless --no-open is set

Options:
  --agent, --no-open            Prepare the task without opening Rex
  -h, --help                   Show this help`;

    case "fork":
      return `Usage:
  gt fork [--agent] <fork-name>

Copy the current Gertrude task into a new task titled:
  <current-task>/<fork-name>

The fork is a real worktree with its own branch, ports, environment, and copies
of both parent databases. Staged/unstaged changes and untracked source files are
copied; build output, dependencies, and credentials are excluded. Parent unchanged.

Options:
  --agent, --no-open            Prepare the fork without opening Rex
  -h, --help                   Show this help`;

    case "review":
      return `Usage:
  gt review [--agent] <PR#>

Create a Gertrude review workspace for a GitHub pull request:
  - create a native worktree under ~/active-projects/gertrude/review-<PR#>
  - fetch refs/pull/<PR#>/head and check it out as branch review-<PR#>
  - assign task-specific local ports in .gtask-ports
  - create isolated local Postgres databases from the scrubbed dump
  - render swift/api/.env
  - run pnpm install in ./web
  - open Rex/OpenCode unless --no-open is set

Options:
  --agent, --no-open            Prepare the review without opening Rex
  -h, --help                   Show this help`;

    case "kill":
      return `Usage:
  gt finish [task] [--discard]

Delete a registered task only when clean and merged (including verified squash-
merged PRs). --discard explicitly abandons uncommitted or unmerged work. Closes
the recorded Rex session, drops owned databases, and removes the native worktree.
Run from another Rex session. OpenCode conversation history is retained.

Options:
  -h, --help                   Show this help`;

    case "list":
      return `Usage:
  gt list

List registered tasks, including adopted Helve worktrees. Support is permanent.

Options:
  -h, --help                   Show this help`;

    case "setup-env-db":
      return `Usage:
  gt setup-env-db [task]

Explicitly replace a registered task's development and test databases with the
latest scrubbed dump. This destroys local database changes. Opening or resuming
a task never refreshes an already initialized database.

Options:
  -h, --help                   Show this help`;

    case "setup-ports":
      return "Use gt setup [task] to recreate environment/ports while preserving initialized databases.";

    case "open":
    case "setup":
      return `Usage: gt ${command} [task]\nUse a task name, ID, or checkout path; defaults to the task containing the current directory.`;

    case "support":
      return "Usage: gt support\nOpen the permanent support repo in Rex. Existing code and DB refresh jobs are untouched.";

    case "adopt":
      return "Usage: gt adopt [--no-open] <Helve-worktree>\nRegister verified existing resources without changing code, databases, ports, or environment.";

    default:
      return null;
  }
}

function parseNameCommand(command: "spawn" | "fork", args: string[]): CliAction {
  if (args.some((arg) => HELP_FLAGS.has(arg))) {
    return { command: "help", topic: command };
  }

  let agent = false;
  const positional: string[] = [];

  for (const arg of args) {
    if (arg === "--agent" || arg === "--no-open") {
      agent = true;
    } else if (arg.startsWith("-")) {
      throw new GtError(`unknown option for gt ${command}: ${arg}`, 2);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length !== 1) {
    throw new GtError(`gt ${command} requires exactly one name`, 2);
  }

  return { command, name: positional[0], agent };
}

function parseReviewCommand(args: string[]): CliAction {
  if (args.some((arg) => HELP_FLAGS.has(arg))) {
    return { command: "help", topic: "review" };
  }

  let agent = false;
  const positional: string[] = [];

  for (const arg of args) {
    if (arg === "--agent" || arg === "--no-open") {
      agent = true;
    } else if (arg.startsWith("-")) {
      throw new GtError(`unknown option for gt review: ${arg}`, 2);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length !== 1) {
    throw new GtError("gt review requires exactly one pull request number", 2);
  }

  return { command: "review", pullRequestNumber: parsePullRequestNumber(positional[0]), agent };
}

function parseOptionalTaskCommand(command: "setup-env-db" | "setup-ports", args: string[]): CliAction {
  if (args.some((arg) => HELP_FLAGS.has(arg))) {
    return { command: "help", topic: command };
  }

  if (args.some((arg) => arg.startsWith("-"))) {
    throw new GtError(`unknown option for gt ${command}: ${args.find((arg) => arg.startsWith("-"))}`, 2);
  }

  if (args.length > 1) {
    throw new GtError(`gt ${command} accepts at most one task`, 2);
  }

  return { command, taskArg: args[0] };
}

export function parseCli(argv: string[]): CliAction {
  if (argv.length === 0 || (argv.length === 1 && HELP_FLAGS.has(argv[0]))) {
    return { command: "help" };
  }

  let [command, ...args] = argv;
  command = ({ new: "spawn", pr: "review", finish: "kill", "refresh-db": "setup-env-db" } as Record<string, string>)[command] || command;

  if (HELP_FLAGS.has(command)) {
    return { command: "help" };
  }

  switch (command) {
    case "spawn":
    case "fork":
      return parseNameCommand(command, args);

    case "review":
      return parseReviewCommand(args);

    case "kill": {
      if (args.some((arg) => HELP_FLAGS.has(arg))) return { command: "help", topic: command };
      const discard = args.includes("--discard") || args.includes("--force");
      const positional = args.filter((arg) => arg !== "--discard" && arg !== "--force");
      if (positional.length > 1 || positional.some((arg) => arg.startsWith("-"))) throw new GtError("usage: gt finish [task] [--discard]", 2);
      return { command: "kill", ...positional.length ? { taskArg: positional[0] } : {}, ...discard ? { discard: true } : {} };
    }
    case "list":
    case "support":
      if (args.some((arg) => HELP_FLAGS.has(arg))) {
        return { command: "help", topic: command };
      }
      if (args.length > 0) {
        throw new GtError(`gt ${command} does not accept arguments`, 2);
      }
      return { command };

    case "setup-env-db":
    case "--setup-env-db":
      return parseOptionalTaskCommand("setup-env-db", args);

    case "setup-ports":
    case "--setup-ports":
      return parseOptionalTaskCommand("setup-ports", args);

    case "open":
    case "setup":
      if (args.some((arg) => HELP_FLAGS.has(arg))) return { command: "help", topic: command };
      if (args.length > 1 || args.some((arg) => arg.startsWith("-"))) throw new GtError(`usage: gt ${command} [task]`, 2);
      return { command, taskArg: args[0] };

    case "adopt": {
      if (args.some((arg) => HELP_FLAGS.has(arg))) return { command: "help", topic: command };
      const positional = args.filter((arg) => arg !== "--agent" && arg !== "--no-open");
      if (positional.length !== 1 || positional[0].startsWith("-")) throw new GtError("usage: gt adopt [--no-open] <Helve-worktree>", 2);
      return { command: "adopt", taskArg: positional[0], agent: args.length !== positional.length };
    }

    case "rex-action":
      if (args.length !== 2) throw new GtError("rex-action is an internal Rex UI command", 2);
      return { command: "rex-action", operation: args[0], context: args[1] };

    case "--kill":
      if (args.length > 0) {
        throw new GtError("gt --kill does not accept arguments; use gt kill", 2);
      }
      return { command: "kill" };

    default:
      if (!command.startsWith("-")) {
        throw new GtError(`unknown command: ${command}\nUse \`gt spawn ${command}\` to create a task.`, 2);
      }
      throw new GtError(`unknown option: ${command}`, 2);
  }
}

function printHelp(topic?: string): void {
  if (!topic) {
    console.log(usage());
    return;
  }

  const help = commandUsage(topic);
  if (!help) {
    throw new GtError(`unknown help topic: ${topic}`, 2);
  }
  console.log(help);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const action = parseCli(argv);

  switch (action.command) {
    case "help":
      printHelp(action.topic);
      return;
    case "spawn":
      await createWorkspace(action.name, { agent: action.agent });
      return;
    case "fork":
      await forkWorkspace(action.name, action.agent);
      return;
    case "review":
      await createWorkspace(`review-${action.pullRequestNumber}`, { pullRequest: action.pullRequestNumber, agent: action.agent });
      return;
    case "kill":
      await finishWorkspace(action.taskArg, action.discard);
      return;
    case "list":
      listWorkspaces();
      return;
    case "setup-env-db":
      await refreshWorkspaceDatabases(action.taskArg);
      return;
    case "setup-ports":
      await prepareWorkspace(action.taskArg);
      return;
    case "setup":
      await prepareWorkspace(action.taskArg);
      return;
    case "open":
      openWorkspace(action.taskArg);
      return;
    case "adopt":
      adoptHelveWorkspace(action.taskArg, action.agent);
      return;
    case "support":
      openSupport();
      return;
    case "rex-action": {
      const { runRexAction } = await import("./rex-actions.ts");
      await runRexAction(action.operation, action.context);
      return;
    }
  }
}
