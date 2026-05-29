import { join } from "node:path";

import type { MccConfig } from "./config.ts";
import type { ReviewerPersona } from "./personas.ts";
import { renderRoster } from "./personas.ts";
import { readText } from "./files.ts";
import type { WorkspaceCopy } from "./workspace.ts";

function fillTemplate(template: string, replacements: Record<string, string>): string {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key: string) => replacements[key] ?? match);
}

export interface ReviewerPromptOptions {
  readonly config: MccConfig;
  readonly persona: ReviewerPersona;
  readonly request: string;
  readonly workspace: WorkspaceCopy;
  readonly reportPath: string;
}

export function renderReviewerPrompt(options: ReviewerPromptOptions): string {
  const template = readText(join(options.config.skillDir, "prompts", "reviewer.md"));
  return fillTemplate(template, {
    REVIEWER_ID: options.persona.id,
    REVIEWER_DESCRIPTION: options.persona.description,
    WORKSPACE_ROOT: options.workspace.repoRoot,
    WORKING_DIRECTORY: options.workspace.cwd,
    REPORT_PATH: options.reportPath,
    REQUEST: options.request,
  });
}

export interface ChairPromptOptions {
  readonly config: MccConfig;
  readonly request: string;
  readonly workspace: WorkspaceCopy;
  readonly reportsDir: string;
  readonly outputDir: string;
}

export function renderChairPrompt(options: ChairPromptOptions): string {
  const template = readText(join(options.config.skillDir, "prompts", "chair.md"));
  return fillTemplate(template, {
    WORKSPACE_ROOT: options.workspace.repoRoot,
    WORKING_DIRECTORY: options.workspace.cwd,
    REPORTS_DIR: options.reportsDir,
    OUTPUT_DIR: options.outputDir,
    FINAL_PATH: join(options.outputDir, "final.md"),
    ISSUES_DIR: join(options.outputDir, "issues"),
    REQUEST: options.request,
    ROSTER: renderRoster(),
  });
}
