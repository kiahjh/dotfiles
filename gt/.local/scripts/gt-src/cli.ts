import { MASTER_BRANCH } from "./constants.ts";
import { createTask } from "./create-task.ts";
import { GtError } from "./errors.ts";
import { forkTask } from "./fork-task.ts";
import { killTask } from "./kill-task.ts";
import { listTasks } from "./list-tasks.ts";
import { setupExistingTask, setupExistingTaskPorts } from "./setup-task.ts";

type CliAction =
  | { command: "help"; topic?: string }
  | { command: "spawn"; name: string; agent: boolean }
  | { command: "fork"; name: string; agent: boolean }
  | { command: "kill" }
  | { command: "list" }
  | { command: "setup-env-db"; taskArg?: string }
  | { command: "setup-ports"; taskArg?: string };

const HELP_FLAGS = new Set(["--help", "-h"]);

export function usage(): string {
  return `gt — Gertrude task workspaces

Usage:
  gt <command> [options]

Commands:
  spawn [--agent] <task-name>  Create a fresh task from origin/${MASTER_BRANCH}
  fork  [--agent] <fork-name>  Copy the current task into <current>/<fork-name>
  kill                         Delete the current task after safety checks
  list                         Show current tasks and forks
  setup-env-db [task]          Recreate swift/api/.env and local databases
  setup-ports  [task]          Regenerate task-local web ports

Options:
  -h, --help                   Show help

Examples:
  gt spawn dashboard-redesign
  gt spawn --agent api-cleanup
  gt fork sidebar-spike
  gt fork --agent model-experiment

Run \`gt <command> --help\` for command-specific help.`;
}

export function commandUsage(command: string): string | null {
  switch (command) {
    case "spawn":
      return `Usage:
  gt spawn [--agent] <task-name>

Create a fresh Gertrude task workspace:
  - clone origin/master into ~/active-projects/gertrude/<task-name>
  - create branch <task-name>
  - assign task-specific local ports in .gtask-ports
  - create isolated local Postgres databases from the scrubbed dump
  - render swift/api/.env
  - run pnpm install in ./web
  - open zellij/Ghostty unless --agent is set

Options:
  --agent                      Prepare the task without zellij or Ghostty
  -h, --help                   Show this help`;

    case "fork":
      return `Usage:
  gt fork [--agent] <fork-name>

Copy the current Gertrude task into a new task titled:
  <current-task>/<fork-name>

The fork gets its own branch, metadata, local ports, and local databases. Use it
for tangents/spikes that you may later manually pull back into the base task.

Options:
  --agent                      Prepare the fork without zellij or Ghostty
  -h, --help                   Show this help`;

    case "kill":
      return `Usage:
  gt kill

Delete the current Gertrude task workspace after checking that the branch is
clean, pushed, and merged into origin/master. Also removes local databases and
closes the matching Ghostty/zellij workspace.

Options:
  -h, --help                   Show this help`;

    case "list":
      return `Usage:
  gt list

List all Gertrude task workspaces under ~/active-projects/gertrude, including
which tasks are forks of other tasks.

Options:
  -h, --help                   Show this help`;

    case "setup-env-db":
      return `Usage:
  gt setup-env-db [task]

Set up swift/api/.env, task-local ports, and isolated local Postgres databases
for an existing task. Run inside the task checkout, or pass a task directory/name.

Options:
  -h, --help                   Show this help`;

    case "setup-ports":
      return `Usage:
  gt setup-ports [task]

Regenerate only .gtask-ports for an existing task. Run inside the task checkout,
or pass a task directory/name.

Options:
  -h, --help                   Show this help`;

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
    if (arg === "--agent") {
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

  const [command, ...args] = argv;

  if (HELP_FLAGS.has(command)) {
    return { command: "help" };
  }

  switch (command) {
    case "spawn":
    case "fork":
      return parseNameCommand(command, args);

    case "kill":
    case "list":
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
      await createTask(action.name, { agent: action.agent });
      return;
    case "fork":
      await forkTask(action.name, { agent: action.agent });
      return;
    case "kill":
      await killTask();
      return;
    case "list":
      listTasks();
      return;
    case "setup-env-db":
      await setupExistingTask(action.taskArg);
      return;
    case "setup-ports":
      setupExistingTaskPorts(action.taskArg);
      return;
  }
}
