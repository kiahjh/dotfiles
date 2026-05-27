---
name: model-code-council
description: Run an adversarial model code review council between GPT-5.5 as driver and Opus 4.7 via Claude Code as reviewer. Use for Claude/Opus second opinions, Opus second opinion, Claude code review, adversarial review, model council, cross-review, or having GPT and Opus push back on each other before code edits.
---

# Model Code Council

Run a file-based code review council framed as **GPT-5.5 vs Opus 4.7**. Pi and Claude Code are only harnesses; write artifacts and summaries using the model names.

GPT-5.5 is the driver/implementer. Opus 4.7 is the independent reviewer/adversary. Opus may inspect the real working directory and run tests/builds/checks, but persistent council output goes in a global review folder. Only GPT-5.5 edits the codebase, and only after the human approves the final plan.

## When to use

Use when the user asks for a Claude/Opus second opinion, adversarial code review, model debate, cross-review, code review before implementation, or review of a change/plan/diff/branch/file set/architecture.

Do **not** assume the target is the current git diff. The user's request defines the scope. Ask one concise clarifying question only if the review target is too ambiguous to review responsibly.

## Non-negotiables

1. Pass the user's exact review request/scope to Opus.
2. Create review artifacts under `~/.local/share/pi/model-code-council/`, never inside the project unless explicitly asked.
3. Run Opus from the target working directory so it can inspect real project context.
4. Opus may run read/analysis/test/build commands with `--dangerously-skip-permissions`.
5. Opus may create/edit files only inside the global review folder; it must not intentionally edit the codebase.
6. GPT-5.5 must not edit source code during the council. Code edits happen only after human approval.
7. Each serious item gets its own append-only file under `items/`.
8. Extra useful observations go in `findings.md`; actionable/decision-worthy observations become item files.
9. Stop when each item is agreed, rejected, deferred, or escalated. Do not force consensus.
10. Before implementation, summarize agreed changes and escalations and ask the human for approval/input.

## Helper script

Use the installed helper path for copy/paste-safe commands from any working directory:

```bash
MCC="$HOME/.pi/agent/skills/model-code-council/scripts/mcc"
```

Start from the target repo directory, or pass `--cwd <repo>`:

```bash
"$MCC" start --cwd "$PWD" <<'REQUEST'
<exact user review request>
REQUEST
```

Run Opus. Both foreground and background modes capture Opus stdout/stderr to log files; they do **not** stream model output into GPT-5.5 context. Prefer `--bg` for long reviews because it returns immediately and lets the driver wait/poll compact status.

```bash
"$MCC" opus-initial --bg <session-dir>
"$MCC" wait <session-dir> --timeout 1800
"$MCC" status <session-dir>
```

After GPT-5.5 responds to item files, run Opus rebuttal passes as needed:

```bash
"$MCC" opus-respond --bg <session-dir>
"$MCC" wait <session-dir> --timeout 1800
```

Useful helpers:

```bash
"$MCC" doctor
"$MCC" latest
"$MCC" status <session-dir>
"$MCC" append-gpt <session-dir> O-001 --position accept-with-modification --body-file /tmp/response.md
"$MCC" set-status <session-dir> O-001 NEEDS_OPUS
"$MCC" resolve <session-dir> O-001 --status AGREED_IMPLEMENT_MODIFIED --decision-file /tmp/decision.md
"$MCC" cancel <session-dir>
```

Environment knobs:

```bash
MCC_CLAUDE_BIN=claude
MCC_OPUS_MODEL=opus
MCC_OPUS_EFFORT=xhigh        # Claude also supports max
MCC_DRIVER_MODEL_NAME='GPT-5.5'
MCC_REVIEWER_MODEL_NAME='Opus 4.7'
MCC_REVIEW_ROOT="$HOME/.local/share/pi/model-code-council"
MCC_DOCTOR_MODEL=sonnet
MCC_DOCTOR_EFFORT=low
```

The helper passes prompts via stdin because Claude Code's `--add-dir` accepts multiple values and can otherwise consume the prompt argument. Git status snapshots and lifecycle markers are stored in `logs/`.

## Review folder

```text
~/.local/share/pi/model-code-council/YYYY-MM-DD-HHMMSS-repo-name/
  README.md
  council.md
  findings.md
  request.md
  items/O-001-short-title.md
  logs/
  prompts/
```

Detailed Opus instructions, item templates, and the constitution live in `prompts/*.md`. GPT-5.5 should use `"$MCC" append-gpt`/`"$MCC" resolve` rather than hand-writing headers when possible.

## Statuses GPT-5.5 needs

Final statuses:

- `AGREED_IMPLEMENT`
- `AGREED_IMPLEMENT_MODIFIED`
- `AGREED_REJECT`
- `AGREED_DEFER`
- `ESCALATED`

Temporary statuses:

- `NEEDS_GPT` — GPT-5.5 should respond.
- `NEEDS_OPUS` — Opus should respond.
- `NEEDS_TEST` — verification needed before deciding.
- `OPEN` — legacy/ambiguous; move to a clearer status.

`append-gpt` defaults to marking an item `NEEDS_OPUS`; use `--status keep`/`--no-status` to preserve status.

## Escalation rules

Mark an item `ESCALATED` when multiple good solutions remain without a clear technical winner, the choice depends on human/product preference, the fix is out of scope/risky, evidence cannot be cheaply verified, a serious objection remains unresolved, or further debate would repeat arguments without adding evidence.

Escalation is a clean human handoff, not a failure.

## GPT-5.5 workflow

1. Capture the user's exact review request.
2. Start a session with `"$MCC" start --cwd <target-dir>`.
3. Run `opus-initial --bg`, then `wait` or `status` until the run is terminal. Do not respond while a run is still `RUNNING`; item files may be partial.
4. Read `council.md`, `findings.md`, and relevant `items/*.md`.
5. Append GPT-5.5 responses with `append-gpt`.
6. Run `opus-respond --bg` while items need Opus. Continue only while turns add evidence or narrow tradeoffs.
7. When all items are final, create/update `final.md` with agreed implementation items, agreed rejections/deferments, escalations, and verification commands.
8. Tell the user the council is complete. Ask whether to implement agreed changes and ask for decisions on escalated items.
9. Only after user approval, edit code and run verification.

## Final response pattern

```text
Model council complete.

Agreed changes:
- O-001: ...

Escalated:
- O-003: ... Option A ..., Option B ...

Review folder: <path>
Ready for me to implement the agreed changes?
For O-003, which option do you want?
```
