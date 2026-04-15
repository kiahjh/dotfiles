---
name: evaluation-package
description: Generate a polished HTML evaluation package for a completed or nearly completed task. Use when the user asks for an evaluation package, or for related evaluation, review, audit, or assessment tasks where they want an easy, pleasant way to assess the work instead of reading raw transcripts or diffs.
---

# Evaluation Package

Create an **HTML evaluation package** that makes it easy for the user to judge the quality of the work without reading a long transcript or raw diff output.

This skill is not just for summarization. It is a **review artifact**. The package should help the user quickly answer:

- What was done?
- Does it actually work?
- How do I verify that?
- What evidence proves it?
- Was it implemented cleanly and elegantly?
- What risks, hacks, compromises, or follow-ups should I know about?

## Core principle

An evaluation package is part of the work itself.

When you know the user wants an evaluation package, use package creation as a **final quality gate**:

- verify the work again
- collect strong proof
- look for weak spots, hacks, rough edges, or missing polish
- if you discover issues that should reasonably be fixed before presentation, **fix them first**
- then generate the package

Do **not** use the package to gloss over weak work. Use it to pressure-test the work before presenting it.

## Default behavior

- Treat evaluation packages as **final by default**.
- If the user explicitly asks mid-task, an interim package is fine.
- Save the report under **`.pi/evaluations/`** in the project.
- Prefer **one main HTML file**.
- If screenshots, videos, or other heavy assets help, it is acceptable to create **sibling assets** next to the HTML file.
- After generating the package, **open it in a browser**.
- Unless the user specifies otherwise, the HTML package should be a **slide deck / paginated review artifact**, not one giant scrolling page.

## Default presentation format: slide deck

By default, evaluation packages should be **slide-deck style HTML documents**.

That does **not** mean they must mimic PowerPoint visually. It means they should be organized into **discrete pages / slides / panels** so the user can move around quickly instead of scrolling through one huge document.

Default expectations:

- one HTML file with multiple “slides” or sections
- a persistent **table of contents / sidebar / navigation rail**
- clickable jump navigation to specific slides
- keyboard-friendly navigation when practical (arrow keys, next/prev)
- each slide should focus on one chunk of information
- slides may be dense if needed, but should remain scan-friendly

Good default slide types:

1. title / verdict
2. task + scope
3. proof / demo overview
4. changed files / architecture
5. verification performed
6. risks / caveats / hacks
7. recommendations / next actions

Avoid making the user scroll through one giant page unless they explicitly ask for that format.

## Output convention

Prefer this structure:

- HTML package: `.pi/evaluations/<timestamp>-<slug>.html`
- Optional assets dir: `.pi/evaluations/<timestamp>-<slug>.assets/`

Use a short slug based on the task.

Examples:

- `.pi/evaluations/2026-04-14-login-flow-audit.html`
- `.pi/evaluations/2026-04-14-dashboard-redesign.html`
- `.pi/evaluations/2026-04-14-dashboard-redesign.assets/hero-after.png`
- `.pi/evaluations/2026-04-14-dashboard-redesign.assets/demo.mp4`

## Two modes

There are two primary modes for this skill. Choose intentionally.

---

## Mode A: Build / implementation evaluation

Use this when the task was to **build, modify, fix, or ship something**.

In this mode, the package should be primarily an **evaluation artifact**, not a summary artifact.

### Main goal

Help the user evaluate whether the delivered thing:

- works
- is complete enough for the requested scope
- is implemented cleanly
- looks / behaves well if it has UI
- avoids unnecessary hacks or sloppy shortcuts
- is honest about any compromises that remain

### Build-mode priorities

Prioritize these over high-level prose:

- proof that the feature works
- screenshots and recordings of the real result
- before/after comparisons when useful
- concise explanation of what changed
- evidence of tests / build / verification
- code quality notes only where they matter to evaluating the implementation
- candid disclosure of hacks, shortcuts, or unresolved rough edges

### Build-mode required mindset

Before generating the package, ask yourself:

- If I had to defend this implementation in review, what would be questioned?
- Did I actually verify the critical behavior, or am I assuming it works?
- Is there any rough edge I should fix before presenting this?
- Did I choose the cleanest reasonable implementation for the scope?
- Am I hiding any workaround, hack, fragile selector, brittle logic, or known issue?

If you discover a problem during package preparation that should be fixed, **go fix it first** unless the user explicitly wants a pure audit of the current state.

### Build-mode typical slide structure

1. **Verdict** — what was built, whether it works, what to look at first
2. **Scope delivered** — requested vs delivered
3. **Demo / proof** — screenshots, recordings, UI walkthroughs, observable outcomes
4. **Implementation quality** — clean choices, notable tradeoffs, touched files, architecture notes
5. **Verification** — tests, commands, manual validation, browser flows, recordings
6. **Known issues / hacks / compromises** — brutally honest, high signal
7. **Next actions** — optional improvements, remaining polish, or approval recommendation

### Build-mode evidence examples

- browser screenshots of key states
- screen or browser recordings of a flow
- before/after UI comparisons
- test output snippets
- build/lint/typecheck results
- file manifest of meaningful touched files
- short code excerpts only for key implementation choices

### Build-mode anti-pattern

Do **not** make a build evaluation package read like:

- a task diary
- a transcript recap
- a “here’s what I did” summary with weak proof
- a wall of implementation notes without showing the actual result

For build tasks, **proof and reviewability come first**.

---

## Mode B: Investigation / audit / research package

Use this when the task was to **look into, research, audit, review, compare, or assess** something.

In this mode, the package can be more findings-oriented.

### Main goal

Help the user quickly understand:

- what was investigated
- what was found
- how strong the evidence is
- what matters most
- what should happen next

### Investigation-mode priorities

- crisp findings
- severity / importance / confidence
- evidence and references
- recommendations
- relevant code or output excerpts
- screenshots only when they help explain the findings

### Investigation-mode typical slide structure

1. **Verdict / executive summary**
2. **Scope and method**
3. **Key findings**
4. **Evidence**
5. **Risks / implications**
6. **Recommendations / next steps**

---

## Workflow

### 1. Decide whether to generate now

If the user asked for an evaluation package, generate it.

If the work is still in progress and the user did **not** ask for an interim package, finish the work first and generate the package at the end.

### 2. Determine the mode

Classify the task:

- **build / implementation evaluation**
- **investigation / audit / research package**

Then shape the package accordingly.

### 3. Gather evidence before writing

Collect the most relevant evidence for this specific task.

Possible evidence includes:

- files changed
- notable implementation decisions
- verification commands and results
- test results
- lint/build/typecheck status
- screenshots
- browser captures
- screen recordings
- before/after comparisons
- audit findings
- reproduction steps
- bug fix proof
- unresolved issues
- follow-up recommendations

Do **not** include everything mechanically. Include what best helps the user evaluate the work.

### 4. Pressure-test the work

Especially in build mode, actively try to validate and challenge the work while assembling the package.

Examples:

- re-open the UI and inspect key states
- run the verification command again
- try the user flow one more time
- capture a proof artifact from the real result
- note if something looks awkward, brittle, or incomplete

If you find something worth fixing, fix it before packaging when reasonable.

### 5. Build the HTML package

The package should be **adaptive**, but should still feel like a polished review artifact.

## Required minimum contents

Unless truly irrelevant, the package should include:

1. **Title + task context**
2. **Quick verdict** — what I should know immediately
3. **What changed / what was evaluated**
4. **Evidence** — screenshots, recordings, snippets, command output, metrics, or findings
5. **Verification performed**
6. **Risks / caveats / unresolved issues**
7. **Recommended next actions**

## Presentation requirements

The package must feel like a **beautiful, reviewable website**, not a log dump.

When generating the HTML artifact:

- Use the **frontend-design** skill for the visual design and polish of the package itself
- Default to a **slide-deck / paginated** structure
- Make it responsive and pleasant to scan
- Use strong hierarchy, thoughtful spacing, and clear sectioning
- Prefer navigation rails, jump links, slide index, sticky TOC, and next/prev controls when useful
- Surface the most important conclusions early
- Make supporting evidence easy to inspect

## Content guidelines

### Do

- summarize intelligently
- show only the most relevant evidence
- use visuals whenever they help the evaluation
- include direct references to files and commands when useful
- make it obvious how the user can validate your claims
- be candid about uncertainty, weak spots, and tradeoffs
- explicitly call out hacks, brittle workarounds, rough edges, and known limitations
- decide whether weak spots should be fixed before presenting the package

### Don’t

- dump the entire transcript into HTML
- paste huge raw diffs unless the diff itself is the thing being evaluated
- overwhelm the user with unranked detail
- hide problems to make the work look better than it is
- generate decorative visuals that do not help evaluation
- mistake “summary” for “evaluation,” especially on build tasks

## Visual artifact guidance

When visuals are useful, generate them.

Examples:

- Use browser tools to capture key UI states
- Record a browser flow when motion or interaction is important
- Show before/after screenshots when that tells the story faster than text
- For audits, visuals may be unnecessary — focus on findings and evidence instead

Prefer embedding small images directly into the HTML when convenient. For large media like videos, use sibling assets and reference them from the package.

## Opening the package

After writing the package:

- Open it in a browser for the user
- On macOS, `open <path>` is usually the simplest choice
- On Linux, use `xdg-open <path>` if needed

If browser automation tools are available and helpful, you may also open the local HTML package through them for screenshots or quick validation. But the user-facing package should still be opened in a normal browser when practical.

## Final chat response

After generating the package, keep the terminal response short. Include:

- the package path
- whether assets were created
- a very short summary of what the package contains

## Quality bar

Before finishing, check:

- Would this let the user evaluate the work faster than reading the transcript?
- Is the package clearly organized into pages / slides by default?
- In build mode, does the package prove the thing works rather than merely describe it?
- Did I honestly surface hacks, caveats, and weak spots?
- If I discovered problems during packaging, did I fix the ones I reasonably should have fixed?
- Is the HTML actually pleasant to review?
- Did I open the package for the user?
