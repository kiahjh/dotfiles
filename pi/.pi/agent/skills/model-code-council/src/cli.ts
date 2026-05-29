import { readFileSync } from "node:fs";
import { configFromEnv, type Environment, type MccConfig } from "./config.ts";
import { MccError, fail } from "./errors.ts";
import { commandExists } from "./files.ts";
import { finalSummaryExcerpt, renderRunResult, runCouncil } from "./council.ts";
import { latestSession, resolveSession, sessionSummary } from "./session.ts";
import { reviewerPersonas } from "./personas.ts";

export function usage(): string {
  return `multi-character code council helper

Usage:
  mcc run [--cwd DIR] [--request TEXT | --request-file FILE] [--keep-workspaces]
  mcc status <session-dir|latest>
  mcc show <session-dir|latest>
  mcc latest
  mcc doctor

What run does:
  - Creates a council session under ~/.local/share/pi/model-code-council
  - Copies the current repo state into one temp workspace per reviewer
  - Runs six independent reviewer pi processes in parallel
  - Uses gpt-5.5 via openai-codex explicitly, not your mutable pi defaults
  - Runs reviewers with --thinking high and the chair with --thinking xhigh
  - Lets reviewers use read/bash/write/edit/grep/find/ls inside disposable workspaces
  - Deletes temp workspaces unless --keep-workspaces is passed
  - Runs a chair pass after reviewers finish and writes chair/final.md

Hard-coded reviewer personalities:
${reviewerPersonas.map((persona) => `  - ${persona.id}`).join("\n")}

Environment for the runner itself:
  MCC_REVIEW_ROOT   default: ~/.local/share/pi/model-code-council
  MCC_PI_BIN        default: pi
  MCC_PROVIDER      default: openai-codex
  MCC_MODEL         default: gpt-5.5
`;
}

function readStdinIfPiped(): string | undefined {
  if (process.stdin.isTTY === false) {
    return readFileSync(0, "utf8");
  }
  return undefined;
}

interface RunArgs {
  readonly cwd: string;
  readonly request: string;
  readonly keepWorkspaces: boolean;
}

export function parseRunArgs(args: string[]): RunArgs {
  let cwd = process.cwd();
  let request = "";
  let requestFile = "";
  let keepWorkspaces = false;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--cwd":
      case "--repo":
      case "--workdir":
        if (i + 1 >= args.length) fail(`${arg} requires a directory`);
        cwd = args[++i];
        break;
      case "--request":
        if (i + 1 >= args.length) fail("--request requires text");
        request = args[++i];
        break;
      case "--request-file":
        if (i + 1 >= args.length) fail("--request-file requires a file");
        requestFile = args[++i];
        break;
      case "--keep-workspaces":
        keepWorkspaces = true;
        break;
      case "-h":
      case "--help":
        throw new MccError(usage(), 0);
      default:
        positional.push(arg);
        break;
    }
  }

  if (requestFile) {
    request = readFileSync(requestFile, "utf8");
  } else if (!request && positional.length > 0) {
    request = positional.join(" ");
  } else if (!request) {
    request = readStdinIfPiped() ?? "";
  }

  if (!request.trim()) {
    fail("empty review request; pass --request, --request-file, args, or stdin");
  }
  return { cwd, request, keepWorkspaces };
}

async function doctor(config: MccConfig): Promise<string[]> {
  const exists = await commandExists(config.piBin);
  if (!exists) {
    fail(`pi CLI not found: ${config.piBin}`);
  }
  return [
    `Doctor: pi binary: ${config.piBin}`,
    `Doctor: provider=${config.provider}`,
    `Doctor: model=${config.model}`,
    `Doctor: reviewer thinking=${config.reviewerThinking}`,
    `Doctor: chair thinking=${config.chairThinking}`,
    "Doctor: OK",
  ];
}

export interface MainResult {
  readonly code: number;
  readonly lines: string[];
}

export async function runCli(argv: string[], skillDir: string, env: Environment = process.env): Promise<MainResult> {
  const config = configFromEnv(skillDir, env);
  const [command = "help", ...args] = argv;

  switch (command) {
    case "run": {
      const parsed = parseRunArgs(args);
      const result = await runCouncil(parsed, config);
      return { code: 0, lines: [renderRunResult(result).trimEnd()] };
    }
    case "status":
      return { code: 0, lines: [sessionSummary(resolveSession(args[0], config)).trimEnd()] };
    case "show":
      return { code: 0, lines: [finalSummaryExcerpt(resolveSession(args[0], config)).trimEnd()] };
    case "latest":
      return { code: 0, lines: [latestSession(config.reviewRoot)] };
    case "doctor":
      return { code: 0, lines: await doctor(config) };
    case "help":
    case "-h":
    case "--help":
      return { code: 0, lines: [usage().trimEnd()] };
    default:
      return { code: 1, lines: [usage().trimEnd(), `mcc: error: unknown command: ${command}`] };
  }
}

export async function main(argv: string[], skillDir: string, env: Environment = process.env): Promise<void> {
  try {
    const result = await runCli(argv, skillDir, env);
    if (result.lines.length > 0) {
      console.log(result.lines.join("\n"));
    }
    if (result.code !== 0) {
      process.exit(result.code);
    }
  } catch (error) {
    if (error instanceof MccError) {
      if (error.exitCode === 0) {
        console.log(error.message.trimEnd());
      } else if (error.message) {
        console.error(`mcc: error: ${error.message}`);
      }
      process.exit(error.exitCode);
    }
    console.error(error);
    process.exit(1);
  }
}
