import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import type { MccConfig } from "./config.ts";
import { fail } from "./errors.ts";
import { ensureDir, formatLocalIsoSeconds, formatLocalStamp, isDirectory, readOptionalText, slugify, writeText } from "./files.ts";
import type { RepoContext } from "./workspace.ts";
import { reviewerPersonas } from "./personas.ts";

export interface CouncilSession {
  readonly path: string;
  readonly request: string;
  readonly context: RepoContext;
}

function uniqueSessionPath(reviewRoot: string, stamp: string, slug: string): string {
  let candidate = join(reviewRoot, `${stamp}-${slug}`);
  let i = 2;
  while (isDirectory(candidate)) {
    candidate = join(reviewRoot, `${stamp}-${slug}-${i}`);
    i += 1;
  }
  return candidate;
}

export function createSession(request: string, context: RepoContext, config: MccConfig, now = new Date()): CouncilSession {
  if (!request.trim()) {
    fail("empty review request; pass --request, --request-file, args, or stdin");
  }

  const slug = slugify(context.repoName) || "workspace";
  const session = uniqueSessionPath(config.reviewRoot, formatLocalStamp(now), slug);
  ensureDir(join(session, "reviewers"));
  ensureDir(join(session, "chair", "issues"));
  ensureDir(join(session, "logs"));
  ensureDir(join(session, "prompts"));

  writeText(join(session, "request.md"), request.endsWith("\n") ? request : `${request}\n`);
  writeText(join(session, ".cwd"), `${context.requestedCwd}\n`);
  writeText(join(session, ".repo-root"), `${context.repoRoot}\n`);
  writeText(join(session, ".provider"), `${config.provider}\n`);
  writeText(join(session, ".model"), `${config.model}\n`);

  writeText(
    join(session, "README.md"),
    `# Multi-Character Code Council

Created: ${formatLocalIsoSeconds(now)}
Status: IN_PROGRESS
Provider: ${config.provider}
Model: ${config.model}
Reviewer thinking: ${config.reviewerThinking}
Chair thinking: ${config.chairThinking}
Working directory: ${context.requestedCwd}
Repository root: ${context.repoRoot}
Review folder: ${session}

## Human review request

${request.endsWith("\n") ? request : `${request}\n`}
## Reviewer personalities

${reviewerPersonas.map((persona) => `- \`${persona.id}\`: ${persona.description}`).join("\n")}

## Output files

- \`reviewers/<id>/report.md\`: independent reviewer reports
- \`chair/final.md\`: synthesized human-facing summary
- \`chair/issues/\`: individual issue files from the chair
- \`logs/\`: pi stdout/stderr and run metadata
- \`prompts/\`: prompts sent to pi
`,
  );

  writeText(join(session, "status.txt"), "IN_PROGRESS\n");
  return { path: session, request, context };
}

export function latestSession(reviewRoot: string): string {
  if (!isDirectory(reviewRoot)) {
    fail(`review root does not exist: ${reviewRoot}`);
  }
  const sessions = readdirSync(reviewRoot)
    .map((name) => join(reviewRoot, name))
    .filter(isDirectory)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (sessions.length === 0) {
    fail(`no council sessions found in ${reviewRoot}`);
  }
  return sessions[0];
}

export function resolveSession(session: string | undefined, config: MccConfig): string {
  if (!session) fail("missing session directory");
  if (session === "latest") return latestSession(config.reviewRoot);
  if (!isDirectory(session)) fail(`session directory not found: ${session}`);
  return session;
}

export function sessionStatus(session: string): string {
  return readOptionalText(join(session, "status.txt"))?.trim() || "UNKNOWN";
}

export function sessionSummary(session: string): string {
  const status = sessionStatus(session);
  const finalPath = join(session, "chair", "final.md");
  const request = readOptionalText(join(session, "request.md"))?.trim() ?? "";
  const lines = [`Session: ${session}`, `Status: ${status}`, "", "Review request:", request || "(missing)", ""];
  const reviewerDirs = readdirSync(join(session, "reviewers"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  lines.push("Reviewer reports:");
  for (const id of reviewerDirs) {
    lines.push(`- ${id}: ${join(session, "reviewers", id, "report.md")}`);
  }
  lines.push("", `Final summary: ${finalPath}`);
  return `${lines.join("\n")}\n`;
}

export function markSessionComplete(session: string): void {
  writeText(join(session, "status.txt"), "COMPLETE\n");
}

export function markSessionFailed(session: string, message: string): void {
  writeText(join(session, "status.txt"), "FAILED\n");
  writeText(join(session, "failure.md"), `# Council failure\n\n${message}\n`);
}

export function sessionName(session: string): string {
  return basename(session);
}
