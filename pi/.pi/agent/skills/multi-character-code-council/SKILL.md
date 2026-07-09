---
name: multi-character-code-council
description: "Run a Multi-Character Code Council: four radically different GPT-5.6 Sol reviewer characters in isolated temp workspaces, followed by an xhigh skeptical chair. Use for adversarial review, second opinions, cross-review, review before implementation, or distinct engineering perspectives on a change, plan, diff, or architecture."
---

# Multi-Character Code Council

Run a file-based code review council using **GPT-5.6 Sol via the pi CLI** with four deliberately incompatible reviewer characters. This is personality diversity, not model diversity: each reviewer owns a different jurisdiction, method, voice, and definition of a valuable finding.

The council runner is a Bun/TypeScript CLI at:

```bash
MCC="$HOME/.pi/agent/skills/multi-character-code-council/scripts/mcc"
```

## When to use

Use when the user asks for a second opinion, adversarial review, model/council review, review before implementation, cross-review, or several different engineering perspectives on a change, plan, diff, branch, file set, or architecture.

Do **not** assume the target is the current git diff. The user's request defines the scope. Ask one concise clarifying question only if the target is too ambiguous to review responsibly.

## How it works

1. `mcc run` creates a global council session under `~/.local/share/pi/multi-character-code-council/`.
2. The runner creates one disposable temp workspace per reviewer, copying the current working-tree state, including tracked and untracked non-ignored files.
3. Four reviewer pi processes run **in parallel**:
   - provider: `openai-codex`
   - model: `gpt-5.6-sol`
   - thinking: `high`
   - tools: `read,bash,write,edit,grep,find,ls`
4. Each reviewer follows a role-specific method and report anatomy, writes its own durable `report.md` inside its temp workspace, and stays out of the other reviewers' jurisdictions. The runner copies the report into the council session and deletes the temp workspace.
5. After all reviewer processes finish, a skeptical chair pi process runs:
   - provider: `openai-codex`
   - model: `gpt-5.6-sol`
   - thinking: `xhigh`
6. The chair reads all reviewer reports, treats repeated same-model claims as correlated evidence rather than votes, cross-examines consensus, preserves dissent, separates facts from intent assumptions, and writes `chair/final.md` plus individual issue files.
7. The main Pi session reads the chair output, presents issues/proposed solutions/escalations to the human, and asks for approval before editing source code.

## Hard-coded reviewer characters

The reviewers are intentionally not full-spectrum clones. Each has exclusive interests, a distinct investigative method, explicit anti-goals, a finding budget, characteristic language, and a role-specific report structure. Out-of-jurisdiction blockers may be noted briefly, but reviewers must not widen into generic review.

- `ruthless-simplifier` — audits abstraction rent, API surface, dependency choices, and existing simpler alternatives; writes blunt KEEP/FLATTEN/MOVE/DELETE judgments and a complexity ledger.
- `failure-mode-red-teamer` — runs concrete incident pre-mortems through trigger, propagation, impact, detection, and recovery; ignores aesthetics and unsupported hypotheticals.
- `shipping-intent-advocate` — steelmans the intended workflow, protects user value and team velocity, classifies concerns as FIX/ASK/DEFER/REJECT, and pushes back on review-driven overbuilding.
- `contract-prosecutor` — derives numbered invariants, constructs minimal counterexamples, and reports only proved contract violations or explicitly unproven obligations.

The chair performs the true adversarial cross-examination because it can see all reports; an isolated reviewer cannot challenge a consensus it has never observed.

## Commands

Run a complete council from the target repo or pass `--cwd`:

```bash
"$MCC" run --cwd "$PWD" <<'REQUEST'
<exact user review request>
REQUEST
```

Useful commands:

```bash
"$MCC" status latest          # detailed per-reviewer state, PID, report existence, log sizes, activity
"$MCC" show latest            # print chair/final.md if it exists
"$MCC" doctor                 # check runner configuration
"$MCC" doctor latest          # diagnose a session
"$MCC" cleanup-stale latest   # mark stale sessions aborted and remove known temp workspaces
"$MCC" retry latest           # start a fresh session with the same cwd/request
"$MCC" latest
```

Debug option:

```bash
"$MCC" run --keep-workspaces --cwd "$PWD" --request "Review ..."
```

If a terminal disconnect, timeout, or abort interrupts the parent runner, `status` computes live state from per-process metadata. It marks abandoned `IN_PROGRESS` sessions as `STALE` when no reviewer/chair PID is alive and required outputs are missing. Use `cleanup-stale` to remove known temp workspaces and mark the session `ABORTED`; use `retry` to start a new session from the same request.

Environment knobs for the runner itself:

```bash
MCC_REVIEW_ROOT="$HOME/.local/share/pi/multi-character-code-council"
MCC_PI_BIN=pi
MCC_PROVIDER=openai-codex
MCC_MODEL=gpt-5.6-sol
```

The model/provider are explicit so the council does not silently change if the user's interactive pi defaults change.

## Review folder

```text
~/.local/share/pi/multi-character-code-council/YYYY-MM-DD-HHMMSS-repo-name/
  README.md
  request.md
  status.txt
  run.json                 # written at start; updated on completion/failure
  reviewers/
    ruthless-simplifier/workspace.txt
    ruthless-simplifier/report.md
    failure-mode-red-teamer/report.md
    shipping-intent-advocate/report.md
    contract-prosecutor/report.md
  chair/
    workspace.txt
    final.md
    issues/01-short-title.md
  logs/                    # stdout/stderr/meta JSON with PIDs and exit codes
  prompts/
```

## Non-negotiables

1. Pass the user's exact review request/scope to the council.
2. Create persistent council artifacts under `~/.local/share/pi/multi-character-code-council/`, never inside the project unless explicitly asked.
3. Reviewers and chair may use bash only in disposable temp workspace copies.
4. Reviewers/chair must not intentionally mutate the real repo, home directory, global config, databases, cloud resources, Docker services, package registries, or network services.
5. The main Pi session must not edit source code during the council.
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
