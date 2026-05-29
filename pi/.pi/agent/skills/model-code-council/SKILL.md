---
name: model-code-council
description: "Run a Multi-Character Code Council: parallel GPT-5.5/pi reviewer personas in isolated temp workspaces, followed by an xhigh chair synthesis. Use for adversarial review, second opinions, cross-review, review before implementation, or getting several distinct engineering perspectives on a change/plan/diff/architecture."
---

# Multi-Character Code Council

Run a file-based code review council using **GPT-5.5 via the pi CLI** with several hard-coded reviewer personalities. This is personality diversity, not model diversity: every reviewer examines the full requested scope, but each applies a different professional temperament.

The council runner is a Bun/TypeScript CLI at:

```bash
MCC="$HOME/.pi/agent/skills/model-code-council/scripts/mcc"
```

## When to use

Use when the user asks for a second opinion, adversarial review, model/council review, review before implementation, cross-review, or several different engineering perspectives on a change, plan, diff, branch, file set, or architecture.

Do **not** assume the target is the current git diff. The user's request defines the scope. Ask one concise clarifying question only if the target is too ambiguous to review responsibly.

## How it works

1. `mcc run` creates a global council session under `~/.local/share/pi/model-code-council/`.
2. The runner creates one disposable temp workspace per reviewer, copying the current working-tree state, including tracked and untracked non-ignored files.
3. Six reviewer pi processes run **in parallel**:
   - provider: `openai-codex`
   - model: `gpt-5.5`
   - thinking: `high`
   - tools: `read,bash,write,edit,grep,find,ls`
4. Each reviewer writes its own durable `report.md` inside its temp workspace; the runner copies it into the council session and deletes the temp workspace.
5. After all reviewer processes finish, a chair pi process runs:
   - provider: `openai-codex`
   - model: `gpt-5.5`
   - thinking: `xhigh`
6. The chair reads all reviewer reports, weighs corroborated findings more heavily, preserves strong lone findings, rejects weak claims, and writes `chair/final.md` plus individual issue files.
7. GPT-5.5 in the main Pi session reads the chair output, presents issues/proposed solutions/escalations to the human, and asks for approval before editing source code.

## Hard-coded reviewer personalities

All reviewers inspect correctness, safety, security, data integrity, architecture, maintainability, testing, UX, performance, deployment risk, and project fit. Their personality changes priors and pushback style, not scope.

- `conservative-maintainer` — favors boring, explicit, debuggable long-term maintainability.
- `production-incident-veteran` — imagines outages, partial failures, weird inputs, concurrency, rollback, and observability gaps.
- `formal-correctness-thinker` — demands contracts, invariants, state transitions, edge cases, and verifiable behavior.
- `pragmatic-product-engineer` — optimizes for smallest safe shippable improvement, clear value, low churn, and fast verification.
- `high-standards-principal-engineer` — focuses on conceptual integrity, boundaries, naming, dependency direction, and long-term design shape.
- `adversarial-cross-examiner` — challenges assumptions, weak evidence, hidden coupling, trust boundaries, abuse cases, and overconfidence.

## Commands

Run a complete council from the target repo or pass `--cwd`:

```bash
"$MCC" run --cwd "$PWD" <<'REQUEST'
<exact user review request>
REQUEST
```

Useful commands:

```bash
"$MCC" status latest
"$MCC" show latest
"$MCC" latest
"$MCC" doctor
```

Debug option:

```bash
"$MCC" run --keep-workspaces --cwd "$PWD" --request "Review ..."
```

Environment knobs for the runner itself:

```bash
MCC_REVIEW_ROOT="$HOME/.local/share/pi/model-code-council"
MCC_PI_BIN=pi
MCC_PROVIDER=openai-codex
MCC_MODEL=gpt-5.5
```

The model/provider are explicit so the council does not silently change if the user's interactive pi defaults change.

## Review folder

```text
~/.local/share/pi/model-code-council/YYYY-MM-DD-HHMMSS-repo-name/
  README.md
  request.md
  status.txt
  run.json
  reviewers/
    conservative-maintainer/report.md
    production-incident-veteran/report.md
    formal-correctness-thinker/report.md
    pragmatic-product-engineer/report.md
    high-standards-principal-engineer/report.md
    adversarial-cross-examiner/report.md
  chair/
    final.md
    issues/01-short-title.md
  logs/
  prompts/
```

## Non-negotiables

1. Pass the user's exact review request/scope to the council.
2. Create persistent council artifacts under `~/.local/share/pi/model-code-council/`, never inside the project unless explicitly asked.
3. Reviewers and chair may use bash only in disposable temp workspace copies.
4. Reviewers/chair must not intentionally mutate the real repo, home directory, global config, databases, cloud resources, Docker services, package registries, or network services.
5. GPT-5.5 in the main Pi session must not edit source code during the council.
6. After the council, read `chair/final.md` and relevant `chair/issues/*.md`, present the findings/proposed fixes/escalations, and ask the human for approval/input before implementation.

## Main Pi workflow

1. Capture the user's exact review request.
2. Run `"$MCC" run --cwd <target-dir>`.
3. Read `chair/final.md` and individual issue files if needed.
4. Present:
   - top issues
   - proposed solutions
   - corroboration/which perspectives raised them
   - escalated questions or tradeoffs
   - verification plan
   - review folder path
5. Ask for approval before editing code.

## Final response pattern

```text
Multi-character code council complete.

Top issues:
- ...

Proposed implementation plan:
- ...

Escalated questions:
- ...

Review folder: <path>
Ready for me to implement the recommended changes?
```
