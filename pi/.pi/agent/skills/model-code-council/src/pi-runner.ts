import { openSync, closeSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

import type { MccConfig } from "./config.ts";
import { commandExists, formatLocalIsoSeconds, writeText } from "./files.ts";
import { fail } from "./errors.ts";

export interface PiRunOptions {
  readonly config: MccConfig;
  readonly cwd: string;
  readonly promptFile: string;
  readonly stdoutFile: string;
  readonly stderrFile: string;
  readonly metaFile: string;
  readonly thinking: "high" | "xhigh";
  readonly label: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface PiRunResult {
  readonly label: string;
  readonly exitCode: number;
  readonly stdoutFile: string;
  readonly stderrFile: string;
  readonly metaFile: string;
  readonly startedAt: string;
  readonly finishedAt: string;
}

export async function ensurePiAvailable(config: MccConfig): Promise<void> {
  if (!(await commandExists(config.piBin))) {
    fail(`pi CLI not found: ${config.piBin}`);
  }
}

export function piArgs(config: MccConfig, thinking: "high" | "xhigh", promptFile: string): string[] {
  return [
    "-p",
    "--provider",
    config.provider,
    "--model",
    config.model,
    "--thinking",
    thinking,
    "--no-session",
    "--no-skills",
    "--no-extensions",
    "--no-prompt-templates",
    "--no-context-files",
    "--tools",
    "read,bash,write,edit,grep,find,ls",
    `@${promptFile}`,
  ];
}

export async function runPi(options: PiRunOptions): Promise<PiRunResult> {
  const startedAt = formatLocalIsoSeconds(new Date());
  const args = piArgs(options.config, options.thinking, options.promptFile);
  writeText(
    options.metaFile,
    JSON.stringify(
      {
        label: options.label,
        startedAt,
        cwd: options.cwd,
        provider: options.config.provider,
        model: options.config.model,
        thinking: options.thinking,
        promptFile: options.promptFile,
        stdoutFile: options.stdoutFile,
        stderrFile: options.stderrFile,
        command: [options.config.piBin, ...args],
      },
      null,
      2,
    ) + "\n",
  );

  const stdoutFd = openSync(options.stdoutFile, "w");
  const stderrFd = openSync(options.stderrFile, "w");
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(options.config.piBin, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", stdoutFd, stderrFd],
    });
    child.on("error", (error) => {
      writeFileSync(stderrFd, `\nFailed to spawn pi: ${error.message}\n`);
      resolve(127);
    });
    child.on("close", (code, signal) => {
      if (signal) {
        writeFileSync(stderrFd, `\npi terminated by signal ${signal}\n`);
      }
      resolve(typeof code === "number" ? code : 1);
    });
  });
  closeSync(stdoutFd);
  closeSync(stderrFd);

  const finishedAt = formatLocalIsoSeconds(new Date());
  writeText(
    options.metaFile,
    JSON.stringify(
      {
        label: options.label,
        startedAt,
        finishedAt,
        exitCode,
        cwd: options.cwd,
        provider: options.config.provider,
        model: options.config.model,
        thinking: options.thinking,
        promptFile: options.promptFile,
        stdoutFile: options.stdoutFile,
        stderrFile: options.stderrFile,
        command: [options.config.piBin, ...args],
      },
      null,
      2,
    ) + "\n",
  );

  return { label: options.label, exitCode, stdoutFile: options.stdoutFile, stderrFile: options.stderrFile, metaFile: options.metaFile, startedAt, finishedAt };
}
