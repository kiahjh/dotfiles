import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import type { MccConfig } from "./config.ts";
import { fail } from "./errors.ts";
import { ensureDir, formatLocalIsoSeconds, isDirectory, readText, shellQuoteForDisplay, writeText } from "./files.ts";
import { reviewerPersonas, type ReviewerPersona } from "./personas.ts";
import { renderChairPrompt, renderReviewerPrompt } from "./prompts.ts";
import { ensurePiAvailable, runPi, type PiRunResult } from "./pi-runner.ts";
import { createSession, markSessionComplete, markSessionFailed, type CouncilSession } from "./session.ts";
import { createWorkspaceCopy, removeWorkspace, repoContext, type RepoContext, type WorkspaceCopy } from "./workspace.ts";

export interface CouncilRunOptions {
  readonly cwd: string;
  readonly request: string;
  readonly keepWorkspaces?: boolean;
  readonly now?: Date;
}

export interface ReviewerRunResult {
  readonly persona: ReviewerPersona;
  readonly reportPath: string;
  readonly exitCode: number;
  readonly stdoutFile: string;
  readonly stderrFile: string;
  readonly workspaceKeptAt?: string;
}

export interface ChairRunResult {
  readonly finalPath: string;
  readonly outputDir: string;
  readonly exitCode: number;
  readonly stdoutFile: string;
  readonly stderrFile: string;
  readonly workspaceKeptAt?: string;
}

export interface CouncilRunResult {
  readonly session: string;
  readonly finalPath: string;
  readonly reviewerResults: readonly ReviewerRunResult[];
  readonly chairResult: ChairRunResult;
}

function reviewerDirs(session: string, persona: ReviewerPersona) {
  const dir = join(session, "reviewers", persona.id);
  return {
    dir,
    report: join(dir, "report.md"),
    prompt: join(session, "prompts", `${persona.id}.md`),
    stdout: join(session, "logs", `${persona.id}.stdout.md`),
    stderr: join(session, "logs", `${persona.id}.stderr.txt`),
    meta: join(session, "logs", `${persona.id}.meta.json`),
  };
}

function chairDirs(session: string) {
  return {
    prompt: join(session, "prompts", "chair.md"),
    stdout: join(session, "logs", "chair.stdout.md"),
    stderr: join(session, "logs", "chair.stderr.txt"),
    meta: join(session, "logs", "chair.meta.json"),
    out: join(session, "chair"),
    final: join(session, "chair", "final.md"),
  };
}

function boundedFileExcerpt(path: string, limit = 4000): string {
  try {
    const value = readFileSync(path, "utf8");
    return value.length <= limit ? value : `${value.slice(0, limit)}\n\n... truncated ...\n`;
  } catch {
    return "";
  }
}

function writeFallbackReviewerReport(path: string, persona: ReviewerPersona, piResult: PiRunResult): void {
  writeText(
    path,
    `# Reviewer report: ${persona.id}

Description: ${persona.description}
Status: PARTIAL

## Executive take

This reviewer did not produce the required report file. The pi process exited with code ${piResult.exitCode}.

## Findings

No findings could be extracted reliably from this reviewer.

## Commands run

Unknown; see logs.

## Open questions or uncertainty

Review stdout excerpt:

\`\`\`text
${boundedFileExcerpt(piResult.stdoutFile)}
\`\`\`

Review stderr excerpt:

\`\`\`text
${boundedFileExcerpt(piResult.stderrFile)}
\`\`\`
`,
  );
}

function runEnvironment(workspace: WorkspaceCopy): NodeJS.ProcessEnv {
  return {
    MCC_WORKSPACE_ROOT: workspace.repoRoot,
    MCC_TEMP_ROOT: workspace.tempRoot,
    TMPDIR: workspace.tmpDir,
    XDG_CACHE_HOME: join(workspace.tempRoot, "cache"),
    npm_config_cache: join(workspace.tempRoot, "npm-cache"),
    PIP_CACHE_DIR: join(workspace.tempRoot, "pip-cache"),
    CARGO_HOME: join(workspace.tempRoot, "cargo-home"),
    GOPATH: join(workspace.tempRoot, "go"),
    GOMODCACHE: join(workspace.tempRoot, "go", "pkg", "mod"),
    CI: "1",
    NO_COLOR: "1",
  };
}

async function runReviewer(session: CouncilSession, persona: ReviewerPersona, config: MccConfig, keepWorkspaces: boolean): Promise<ReviewerRunResult> {
  const paths = reviewerDirs(session.path, persona);
  ensureDir(paths.dir);

  const workspace = await createWorkspaceCopy(session.context, persona.id);
  writeText(join(paths.dir, "workspace.txt"), `${workspace.tempRoot}\n`);
  writeText(join(workspace.tempRoot, ".mcc-session"), `${session.path}\n`);
  writeText(join(workspace.tempRoot, ".mcc-role"), `${persona.id}\n`);
  const workspaceReport = join(workspace.reviewDir, `${persona.id}-report.md`);
  writeText(paths.prompt, renderReviewerPrompt({ config, persona, request: session.request, workspace, reportPath: workspaceReport }));

  let piResult: PiRunResult;
  try {
    piResult = await runPi({
      config,
      cwd: workspace.cwd,
      promptFile: paths.prompt,
      stdoutFile: paths.stdout,
      stderrFile: paths.stderr,
      metaFile: paths.meta,
      thinking: config.reviewerThinking,
      label: persona.id,
      tempRoot: workspace.tempRoot,
      env: runEnvironment(workspace),
    });

    if (existsSync(workspaceReport)) {
      cpSync(workspaceReport, paths.report);
    } else {
      writeFallbackReviewerReport(paths.report, persona, piResult);
    }
  } finally {
    if (!keepWorkspaces) {
      removeWorkspace(workspace);
    }
  }

  return {
    persona,
    reportPath: paths.report,
    exitCode: piResult!.exitCode,
    stdoutFile: paths.stdout,
    stderrFile: paths.stderr,
    workspaceKeptAt: keepWorkspaces ? workspace.tempRoot : undefined,
  };
}

function copyReviewerReportsIntoWorkspace(sessionPath: string, reportsDir: string): void {
  ensureDir(reportsDir);
  for (const persona of reviewerPersonas) {
    const src = reviewerDirs(sessionPath, persona).report;
    const destDir = join(reportsDir, persona.id);
    ensureDir(destDir);
    if (existsSync(src)) {
      cpSync(src, join(destDir, "report.md"));
    } else {
      writeText(join(destDir, "report.md"), `# Reviewer report: ${persona.id}\n\nStatus: PARTIAL\n\nReport missing.\n`);
    }
  }
}

function copyChairOutput(workspaceOut: string, sessionOut: string): void {
  ensureDir(sessionOut);
  if (existsSync(workspaceOut)) {
    cpSync(workspaceOut, sessionOut, { recursive: true, force: true });
  }
}

function writeFallbackChairSummary(path: string, result: PiRunResult): void {
  writeText(
    path,
    `# Multi-Character Code Council Summary

Status: PARTIAL

## Executive summary

The chair process did not produce the required final summary. The pi process exited with code ${result.exitCode}.

## Top issues and recommendations

Unavailable. Inspect reviewer reports and logs directly.

## Logs

Chair stdout: ${result.stdoutFile}
Chair stderr: ${result.stderrFile}
`,
  );
}

async function runChair(session: CouncilSession, config: MccConfig, keepWorkspaces: boolean): Promise<ChairRunResult> {
  const paths = chairDirs(session.path);
  const workspace = await createWorkspaceCopy(session.context, "chair");
  writeText(join(session.path, "chair", "workspace.txt"), `${workspace.tempRoot}\n`);
  writeText(join(workspace.tempRoot, ".mcc-session"), `${session.path}\n`);
  writeText(join(workspace.tempRoot, ".mcc-role"), "chair\n");
  const reportsDir = join(workspace.reviewDir, "reviewer-reports");
  const outputDir = join(workspace.reviewDir, "chair-output");
  const finalPath = join(outputDir, "final.md");
  const issuesDir = join(outputDir, "issues");
  ensureDir(issuesDir);
  copyReviewerReportsIntoWorkspace(session.path, reportsDir);

  writeText(paths.prompt, renderChairPrompt({ config, request: session.request, workspace, reportsDir, outputDir }));

  let piResult: PiRunResult;
  try {
    piResult = await runPi({
      config,
      cwd: workspace.cwd,
      promptFile: paths.prompt,
      stdoutFile: paths.stdout,
      stderrFile: paths.stderr,
      metaFile: paths.meta,
      thinking: config.chairThinking,
      label: "chair",
      tempRoot: workspace.tempRoot,
      env: runEnvironment(workspace),
    });

    copyChairOutput(outputDir, paths.out);
    if (!existsSync(paths.final)) {
      writeFallbackChairSummary(paths.final, piResult);
    }
  } finally {
    if (!keepWorkspaces) {
      removeWorkspace(workspace);
    }
  }

  return {
    finalPath: paths.final,
    outputDir: paths.out,
    exitCode: piResult!.exitCode,
    stdoutFile: paths.stdout,
    stderrFile: paths.stderr,
    workspaceKeptAt: keepWorkspaces ? workspace.tempRoot : undefined,
  };
}

export async function runCouncil(options: CouncilRunOptions, config: MccConfig): Promise<CouncilRunResult> {
  await ensurePiAvailable(config);
  const context = repoContext(options.cwd);
  const session = createSession(options.request, context, config, options.now);
  const started = Date.now();
  writeText(
    join(session.path, "run.json"),
    JSON.stringify(
      {
        status: "IN_PROGRESS",
        startedAt: formatLocalIsoSeconds(new Date(started)),
        provider: config.provider,
        model: config.model,
        reviewerThinking: config.reviewerThinking,
        chairThinking: config.chairThinking,
        expectedReviewers: reviewerPersonas.map((persona) => persona.id),
      },
      null,
      2,
    ) + "\n",
  );

  try {
    const reviewerResults = await Promise.all(reviewerPersonas.map((persona) => runReviewer(session, persona, config, Boolean(options.keepWorkspaces))));
    const chairResult = await runChair(session, config, Boolean(options.keepWorkspaces));
    markSessionComplete(session.path);
    writeText(
      join(session.path, "run.json"),
      JSON.stringify(
        {
          status: "COMPLETE",
          startedAt: formatLocalIsoSeconds(new Date(started)),
          finishedAt: formatLocalIsoSeconds(new Date()),
          provider: config.provider,
          model: config.model,
          reviewers: reviewerResults.map((result) => ({ id: result.persona.id, exitCode: result.exitCode, reportPath: result.reportPath })),
          chair: { exitCode: chairResult.exitCode, finalPath: chairResult.finalPath },
        },
        null,
        2,
      ) + "\n",
    );
    return { session: session.path, finalPath: chairResult.finalPath, reviewerResults, chairResult };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markSessionFailed(session.path, message);
    writeText(
      join(session.path, "run.json"),
      JSON.stringify(
        {
          status: "FAILED",
          startedAt: formatLocalIsoSeconds(new Date(started)),
          finishedAt: formatLocalIsoSeconds(new Date()),
          provider: config.provider,
          model: config.model,
          error: message,
          expectedReviewers: reviewerPersonas.map((persona) => persona.id),
        },
        null,
        2,
      ) + "\n",
    );
    throw error;
  }
}

export function renderRunResult(result: CouncilRunResult): string {
  const lines = [
    "Multi-character code council complete.",
    "",
    `Session: ${result.session}`,
    `Final summary: ${result.finalPath}`,
    "",
    "Reviewer reports:",
  ];
  for (const reviewer of result.reviewerResults) {
    const status = reviewer.exitCode === 0 ? "ok" : `exit ${reviewer.exitCode}`;
    lines.push(`- ${reviewer.persona.id} (${status}): ${reviewer.reportPath}`);
  }
  lines.push("", `Chair: ${result.chairResult.exitCode === 0 ? "ok" : `exit ${result.chairResult.exitCode}`}`);
  return `${lines.join("\n")}\n`;
}

export function finalSummaryExcerpt(sessionPath: string, limit = 12000): string {
  const finalPath = chairDirs(sessionPath).final;
  if (!existsSync(finalPath)) {
    return `No final summary exists yet for ${sessionPath}.\nExpected: ${finalPath}\nRun \`mcc status ${sessionPath}\` for detailed progress/stale diagnostics.\n`;
  }
  const final = readText(finalPath);
  return final.length <= limit ? final : `${final.slice(0, limit)}\n\n... truncated; see ${finalPath} ...\n`;
}

export function makeManualRunCommand(config: MccConfig, cwd: string): string {
  return `MCC=\"$HOME/.pi/agent/skills/model-code-council/scripts/mcc\"\n\"$MCC\" run --cwd ${shellQuoteForDisplay(cwd)}`;
}

export function listIssueFiles(sessionPath: string): string[] {
  const dir = join(sessionPath, "chair", "issues");
  if (!isDirectory(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => join(dir, name));
}
