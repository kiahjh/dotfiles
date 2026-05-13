import { spawnSync } from "node:child_process";
import { fail } from "./errors.ts";

export type RunOptions = {
  cwd?: string;
  input?: string;
  inherit?: boolean;
  allowFailure?: boolean;
};

export type RunResult = {
  status: number;
  stdout: string;
  stderr: string;
};

export function run(command: string, args: string[], options: RunOptions = {}): RunResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: "utf8",
    stdio: options.inherit
      ? options.input === undefined
        ? "inherit"
        : ["pipe", "inherit", "inherit"]
      : ["pipe", "pipe", "pipe"],
  });

  if (result.error) {
    if (options.allowFailure) {
      return { status: 1, stdout: "", stderr: result.error.message };
    }
    fail(`failed to run ${command}: ${result.error.message}`);
  }

  const status = result.status ?? 1;
  const runResult = {
    status,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };

  if (status !== 0 && !options.allowFailure) {
    const detail = runResult.stderr.trim() || runResult.stdout.trim();
    fail(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }

  return runResult;
}

export function runOutput(command: string, args: string[], cwd?: string): string {
  return run(command, args, { cwd }).stdout.trim();
}

export function commandExists(command: string): boolean {
  return run("/usr/bin/env", ["sh", "-c", `command -v "$1" >/dev/null 2>&1`, "sh", command], {
    allowFailure: true,
  }).status === 0;
}

export function requireCommands(commands: string[]): void {
  for (const command of commands) {
    if (!commandExists(command)) {
      fail(`missing required command: ${command}`);
    }
  }
}

export function currentSystemUser(): string {
  return process.env.USER || runOutput("id", ["-un"]);
}
