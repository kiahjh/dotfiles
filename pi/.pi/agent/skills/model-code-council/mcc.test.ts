import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  configFromEnv,
  createWorkspaceCopy,
  latestSession,
  listFilesRecursive,
  parseRunArgs,
  piArgs,
  renderChairPrompt,
  renderReviewerPrompt,
  reviewerPersonas,
  repoContext,
  runCli,
  runCouncil,
  sessionSummary,
  type MccConfig,
} from "./src/index.ts";
import { createSession } from "./src/session.ts";

const skillDir = dirname(fileURLToPath(import.meta.url));

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "mcc-test-"));
}

function withTemp<T>(fn: (root: string) => T): T {
  const root = tempDir();
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function withTempAsync<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = tempDir();
  try {
    return await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function config(root: string, overrides: Partial<MccConfig> = {}): MccConfig {
  return {
    skillDir,
    reviewRoot: join(root, "reviews"),
    piBin: join(root, "fake-pi"),
    provider: "openai-codex",
    model: "gpt-5.5",
    reviewerThinking: "high",
    chairThinking: "xhigh",
    ...overrides,
  };
}

function text(path: string): string {
  return readFileSync(path, "utf8");
}

function makeRepo(root: string): string {
  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "mcc@example.test"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "MCC Test"], { cwd: repo });
  writeFileSync(join(repo, "tracked.txt"), "original\n");
  writeFileSync(join(repo, ".gitignore"), "ignored.txt\n");
  execFileSync("git", ["add", "tracked.txt", ".gitignore"], { cwd: repo });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repo });
  writeFileSync(join(repo, "tracked.txt"), "modified\n");
  writeFileSync(join(repo, "untracked.txt"), "new\n");
  writeFileSync(join(repo, "ignored.txt"), "ignored\n");
  return repo;
}

function makeFakePi(root: string): string {
  const fakePi = join(root, "fake-pi");
  const calls = join(root, "fake-pi-calls.log");
  const script = `#!/usr/bin/env bun
import { mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = ${JSON.stringify(root)};
appendFileSync(join(root, "fake-pi-calls.log"), JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), tmp: process.env.TMPDIR }) + "\\n");
const promptArg = process.argv.slice(2).find((arg) => arg.startsWith("@"));
if (!promptArg) throw new Error("missing @prompt");
const prompt = readFileSync(promptArg.slice(1), "utf8");
const reviewerMatch = prompt.match(/^REVIEWER_REPORT_PATH: (.+)$/m);
if (reviewerMatch) {
  const report = reviewerMatch[1].trim();
  const id = prompt.match(/^REVIEWER_ID: (.+)$/m)?.[1].trim() ?? "unknown";
  mkdirSync(dirname(report), { recursive: true });
  const reportText =
    "# Reviewer report: " + id + "\\n\\n" +
    "Description: fake\\nStatus: COMPLETE\\n\\n" +
    "## Executive take\\n\\n" + id + " reviewed the temp repo.\\n\\n" +
    "## Findings\\n\\n" +
    "### Finding: Shared fake issue\\n" +
    "Severity: major\\nConfidence: high\\nCategory: correctness\\n" +
    "Evidence: fake evidence from " + id + ".\\n" +
    "Proposed solution: fake fix.\\nVerification: fake test.\\n\\n" +
    "## Commands run\\n\\n- fake command\\n\\n" +
    "## Things checked but not flagged\\n\\n- fake check\\n\\n" +
    "## Open questions or uncertainty\\n\\nNone.\\n";
  writeFileSync(report, reportText);
  console.log("wrote reviewer report for " + id);
  process.exit(0);
}
const outputMatch = prompt.match(/^CHAIR_OUTPUT_DIR: (.+)$/m);
if (outputMatch) {
  const out = outputMatch[1].trim();
  const issues = join(out, "issues");
  mkdirSync(issues, { recursive: true });
  writeFileSync(join(out, "final.md"),
    "# Multi-Character Code Council Summary\\n\\n" +
    "Status: COMPLETE\\n\\n" +
    "## Executive summary\\n\\nFake chair synthesized reviewer reports.\\n\\n" +
    "## Top issues and recommendations\\n\\n" +
    "| # | Issue | Severity | Raised by | Chair confidence | Recommended action |\\n" +
    "|---|-------|----------|-----------|------------------|--------------------|\\n" +
    "| 1 | Shared fake issue | major | multiple reviewers | high | Apply fake fix |\\n\\n" +
    "## Consensus and corroboration\\n\\nAll fake reviewers mentioned the shared issue.\\n\\n" +
    "## Lone high-evidence findings\\n\\nNone.\\n\\n" +
    "## Disagreements and escalated questions\\n\\nNone.\\n\\n" +
    "## Proposed implementation plan\\n\\n- Apply fake fix.\\n\\n" +
    "## Verification plan\\n\\n- Run fake test.\\n\\n" +
    "## Reviewer reports considered\\n\\n- all reports\\n");
  writeFileSync(join(issues, "01-shared-fake-issue.md"),
    "# Shared fake issue\\n\\n" +
    "Severity: major\\nChair confidence: high\\nRaised by: multiple reviewers\\nStatus: recommended-fix\\n\\n" +
    "## Evidence\\n\\nFake.\\n\\n" +
    "## Proposed solution\\n\\nFake fix.\\n\\n" +
    "## Verification\\n\\nFake test.\\n");
  console.log("wrote chair output");
  process.exit(0);
}
throw new Error("unknown prompt");
`;
  writeFileSync(fakePi, script);
  chmodSync(fakePi, 0o755);
  writeFileSync(calls, "");
  return fakePi;
}

test("config defaults explicitly target gpt-5.5 through openai-codex", () => {
  const cfg = configFromEnv(skillDir, { HOME: "/Users/example" });
  expect(cfg.provider).toBe("openai-codex");
  expect(cfg.model).toBe("gpt-5.5");
  expect(cfg.reviewerThinking).toBe("high");
  expect(cfg.chairThinking).toBe("xhigh");
  expect(cfg.piBin).toBe("pi");
});

test("reviewer roster is hard-coded and full-spectrum", () => {
  expect(reviewerPersonas.map((persona) => persona.id)).toEqual([
    "conservative-maintainer",
    "production-incident-veteran",
    "formal-correctness-thinker",
    "pragmatic-product-engineer",
    "high-standards-principal-engineer",
    "adversarial-cross-examiner",
  ]);
  for (const persona of reviewerPersonas) {
    expect(persona.description.length).toBeGreaterThan(80);
  }
});

test("pi arguments pin provider, model, thinking, tools, and no-session mode", () =>
  withTemp((root) => {
    const cfg = config(root);
    const args = piArgs(cfg, "high", join(root, "prompt.md"));
    expect(args).toContain("-p");
    expect(args).toContain("--no-session");
    expect(args).toContain("--no-context-files");
    expect(args).toContain("openai-codex");
    expect(args).toContain("gpt-5.5");
    expect(args).toContain("high");
    expect(args).toContain("read,bash,write,edit,grep,find,ls");
    expect(args.at(-1)).toBe(`@${join(root, "prompt.md")}`);
  }));

test("workspace copy includes modified tracked and untracked files but excludes ignored files", async () =>
  await withTempAsync(async (root) => {
    const repo = makeRepo(root);
    const context = repoContext(repo);
    const workspace = await createWorkspaceCopy(context, "copy-test");
    try {
      expect(text(join(workspace.repoRoot, "tracked.txt"))).toBe("modified\n");
      expect(text(join(workspace.repoRoot, "untracked.txt"))).toBe("new\n");
      expect(existsSync(join(workspace.repoRoot, "ignored.txt"))).toBe(false);
      expect(existsSync(join(workspace.repoRoot, ".git"))).toBe(false);
      expect(listFilesRecursive(workspace.repoRoot)).toContain(".mcc-review");
    } finally {
      rmSync(workspace.tempRoot, { recursive: true, force: true });
    }
  }));

test("session creation records request, model, reviewer list, and stable layout", () =>
  withTemp((root) => {
    const repo = makeRepo(root);
    const cfg = config(root);
    const session = createSession("Review this exact thing.\n", repoContext(repo), cfg, new Date(2026, 0, 2, 3, 4, 5));

    expect(basename(session.path)).toBe("2026-01-02-030405-repo");
    expect(text(join(session.path, "request.md"))).toBe("Review this exact thing.\n");
    expect(text(join(session.path, ".provider"))).toBe("openai-codex\n");
    expect(text(join(session.path, ".model"))).toBe("gpt-5.5\n");
    expect(text(join(session.path, "README.md"))).toContain("conservative-maintainer");
    expect(text(join(session.path, "status.txt"))).toBe("IN_PROGRESS\n");
  }));

test("prompt rendering requires reviewer report files and chair output files", async () =>
  await withTempAsync(async (root) => {
    const repo = makeRepo(root);
    const cfg = config(root);
    const context = repoContext(repo);
    const workspace = await createWorkspaceCopy(context, "prompt-test");
    try {
      const reviewer = renderReviewerPrompt({
        config: cfg,
        persona: reviewerPersonas[0],
        request: "Review prompt rendering.",
        workspace,
        reportPath: join(workspace.reviewDir, "report.md"),
      });
      expect(reviewer).toContain("REVIEWER_ID: conservative-maintainer");
      expect(reviewer).toContain("REVIEWER_REPORT_PATH:");
      expect(reviewer).toContain("Review the whole requested scope");
      expect(reviewer).toContain("bash");

      const chair = renderChairPrompt({
        config: cfg,
        request: "Review prompt rendering.",
        workspace,
        reportsDir: join(workspace.reviewDir, "reports"),
        outputDir: join(workspace.reviewDir, "chair"),
      });
      expect(chair).toContain("CHAIR_OUTPUT_DIR:");
      expect(chair).toContain("FINAL_SUMMARY_PATH:");
      expect(chair).toContain("Pay extra attention to issues raised independently by multiple reviewers.");
      expect(chair).toContain("adversarial-cross-examiner");
    } finally {
      rmSync(workspace.tempRoot, { recursive: true, force: true });
    }
  }));

test("runCouncil executes all reviewers in parallel-ish, then chair, and deletes temp workspaces", async () =>
  await withTempAsync(async (root) => {
    const repo = makeRepo(root);
    const fakePi = makeFakePi(root);
    const cfg = config(root, { piBin: fakePi });
    const result = await runCouncil(
      { cwd: repo, request: "Review the fake repository for serious issues.", now: new Date(2026, 0, 2, 4, 5, 6) },
      cfg,
    );

    expect(result.reviewerResults).toHaveLength(6);
    expect(result.reviewerResults.every((entry) => entry.exitCode === 0)).toBe(true);
    for (const reviewer of result.reviewerResults) {
      expect(text(reviewer.reportPath)).toContain(`# Reviewer report: ${reviewer.persona.id}`);
      expect(reviewer.workspaceKeptAt).toBeUndefined();
    }
    expect(text(result.finalPath)).toContain("Fake chair synthesized reviewer reports.");
    expect(text(join(result.session, "chair", "issues", "01-shared-fake-issue.md"))).toContain("Shared fake issue");
    expect(text(join(result.session, "status.txt"))).toBe("COMPLETE\n");
    expect(text(join(result.session, "run.json"))).toContain('"model": "gpt-5.5"');

    const calls = text(join(root, "fake-pi-calls.log")).trim().split("\n").map((line) => JSON.parse(line));
    expect(calls).toHaveLength(7);
    expect(calls.slice(0, 6).every((call) => call.args.includes("high"))).toBe(true);
    expect(calls[6].args.includes("xhigh")).toBe(true);
    expect(calls.every((call) => call.args.includes("--no-session"))).toBe(true);
    expect(calls.every((call) => call.args.includes("gpt-5.5"))).toBe(true);
    expect(calls.every((call) => String(call.cwd).includes("/repo"))).toBe(true);
    expect(calls.every((call) => !existsSync(String(call.tmp).replace(/\/tmp$/, "")))).toBe(true);
  }));

test("runCouncil can keep workspaces for debugging", async () =>
  await withTempAsync(async (root) => {
    const repo = makeRepo(root);
    const fakePi = makeFakePi(root);
    const cfg = config(root, { piBin: fakePi });
    const result = await runCouncil({ cwd: repo, request: "Review and keep workspaces.", keepWorkspaces: true }, cfg);

    for (const reviewer of result.reviewerResults) {
      expect(reviewer.workspaceKeptAt).toBeTruthy();
      expect(existsSync(reviewer.workspaceKeptAt!)).toBe(true);
    }
    expect(result.chairResult.workspaceKeptAt).toBeTruthy();
    expect(existsSync(result.chairResult.workspaceKeptAt!)).toBe(true);
  }));

test("latest, status, and show expose completed council artifacts", async () =>
  await withTempAsync(async (root) => {
    const repo = makeRepo(root);
    const fakePi = makeFakePi(root);
    const cfg = config(root, { piBin: fakePi });
    const result = await runCouncil({ cwd: repo, request: "Review for status commands." }, cfg);

    expect(latestSession(cfg.reviewRoot)).toBe(result.session);
    expect(sessionSummary(result.session)).toContain("Final summary:");
    const status = await runCli(["status", "latest"], skillDir, { HOME: root, MCC_REVIEW_ROOT: cfg.reviewRoot, MCC_PI_BIN: fakePi });
    expect(status.lines.join("\n")).toContain("Status: COMPLETE");
    const shown = await runCli(["show", "latest"], skillDir, { HOME: root, MCC_REVIEW_ROOT: cfg.reviewRoot, MCC_PI_BIN: fakePi });
    expect(shown.lines.join("\n")).toContain("Multi-Character Code Council Summary");
  }));

test("CLI parsing, help, doctor, and run command", async () =>
  await withTempAsync(async (root) => {
    const repo = makeRepo(root);
    const fakePi = makeFakePi(root);

    expect(parseRunArgs(["--cwd", repo, "--request", "Review this", "--keep-workspaces"])).toEqual({
      cwd: repo,
      request: "Review this",
      keepWorkspaces: true,
    });

    const help = await runCli(["help"], skillDir, { HOME: root });
    expect(help.lines.join("\n")).toContain("Uses gpt-5.5 via openai-codex explicitly");
    expect(help.lines.join("\n")).toContain("conservative-maintainer");

    const doctor = await runCli(["doctor"], skillDir, { HOME: root, MCC_PI_BIN: fakePi });
    expect(doctor.lines).toContain("Doctor: model=gpt-5.5");

    const run = await runCli(
      ["run", "--cwd", repo, "--request", "Review through CLI."],
      skillDir,
      { HOME: root, MCC_REVIEW_ROOT: join(root, "reviews"), MCC_PI_BIN: fakePi, FAKE_PI_ROOT: root },
    );
    expect(run.code).toBe(0);
    expect(run.lines.join("\n")).toContain("Multi-character code council complete.");
    expect(run.lines.join("\n")).toContain("Final summary:");
  }));
