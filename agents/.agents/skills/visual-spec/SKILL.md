---
name: visual-spec
description: Create polished, compact, browser-viewable HTML artifacts for specs, plans, PRDs, RFCs, roadmaps, implementation plans, architecture proposals, decision docs, and strategy briefs. Use whenever the user asks to spec something out, write a spec, make a plan, create a design doc, draft a proposal, compare options, or produce substantial planning content; save the clean/scannable artifact and return its path instead of dumping a large markdown plan in chat.
---

# Visual Spec

Create clean, compact, self-contained HTML planning artifacts instead of long chat responses or giant Markdown files.

## When to use

Use this skill when the user asks for substantial planning or specification work, including:

- “spec this out”, “write me a spec”, “make a plan”
- PRDs, RFCs, design docs, proposals, strategy briefs
- implementation plans, migration plans, refactor plans, launch plans
- architecture explanations, system designs, data models, API plans
- roadmap creation, task breakdowns, decision matrices, tradeoff analyses

Default to creating an artifact for these requests. Do not paste the full spec/plan into chat unless the user explicitly asks for an inline answer.

## Output contract

1. Produce a browser-ready artifact that conveys the plan/spec clearly, compactly, and pleasantly.
2. Prefer a single self-contained `.html` file with inline CSS and, only when useful, inline JavaScript.
3. Save it to disk.
4. Reply with a concise summary, the absolute file path, and an `open` command.
5. Do not dump the artifact content into chat.

Default output directory:

```text
~/.local/share/codex/artifacts/specs/
```

Default filename pattern:

```text
YYYY-MM-DD-HHMM-short-kebab-slug.html
```

Use a project-local path only when the user asks for it or when the artifact is clearly intended to be checked into the project, for example:

```text
docs/specs/
.codex/artifacts/specs/
```

Always avoid overwriting an existing artifact unless the user explicitly asks to update that exact file.

## Workflow

1. Identify the artifact’s purpose, audience, and desired decision/action.
2. If essential context is missing and guessing would make the artifact misleading, ask concise clarifying questions. Otherwise make reasonable assumptions and list them in the artifact.
3. Gather relevant project context with file reads/searches when the plan depends on an existing codebase.
4. Choose the artifact format that best serves the request.
5. Create the output directory and generate a unique filename.
6. Write the complete HTML file.
7. Sanity-check that the file exists and is non-empty.
8. Respond only with a short note and the path/open command.

Useful shell pattern:

```bash
mkdir -p "$HOME/.local/share/codex/artifacts/specs"
date +"%Y-%m-%d-%H%M"
```

## Artifact format selection

Do not use a fixed template or mandatory section list. Decide the structure separately for each task.

Choose a form that matches the work:

- **Long-form spec page** for detailed product, technical, or process specs.
- **Compact slide-style narrative** for executive proposals, pitches, and high-level strategy; avoid full-viewport slides unless the user asks for a true deck.
- **Blueprint / architecture brief** for system designs, flows, dependencies, and integration plans.
- **Roadmap / workback plan** for phased execution, milestones, ownership, and sequencing.
- **Decision dossier** for option comparison, tradeoffs, recommendation, and risks.
- **Checklist / runbook** for operational execution or repeatable procedures.
- **Hybrid layouts** when the content benefits from multiple modes.

Adapt sections to the request. Examples of possible sections include goals, constraints, user stories, risks, architecture, phases, acceptance criteria, open questions, and next steps—but include only what earns its place.

## Design requirements

The artifact is an information document first and a designed object second. It should be pleasant to read, but optimized for fast scanning, comprehension, and dense information transfer—not spectacle.

Default aesthetic: clean editorial/report, compact technical dossier, crisp briefing note. Use distinctive details sparingly.

- Keep layouts compact. Avoid oversized hero sections, full-screen slides, huge headings, large empty bands of whitespace, and landing-page-style drama unless explicitly requested.
- Use a restrained type scale: body text typically 14–16px; headings should establish hierarchy without dominating the viewport.
- Use tight but comfortable spacing: small gaps inside related groups, moderate section separation, and no giant padding around every block.
- Keep high-value content above the fold: title, purpose, and key takeaway should appear without requiring a dramatic scroll.
- Favor tables, matrices, concise callouts, sidebars, inline diagrams, compact timelines, and checklists over roomy card grids.
- Use semantic HTML, clear hierarchy, and polished typography.
- Use a visual direction suited to the topic: editorial, blueprint, technical dossier, roadmap wall, calm minimal spec, etc.—but keep it information-dense.
- Prefer diagrams, timelines, matrices, callouts, swimlanes, and structured visual components over walls of bullets.
- Use inline SVG/CSS for diagrams when helpful.
- Make it responsive and readable on desktop and mobile.
- Include print styles for clean PDF export.
- Use accessible color contrast, meaningful headings, and sensible focus styles.
- Keep all CSS and JS inline unless supporting assets are genuinely needed.
- Avoid network dependencies by default; do not rely on remote fonts/scripts unless the user requests it.
- Avoid generic AI aesthetics: gratuitous glassmorphism, cyan/purple dark gradients, repetitive cards, meaningless metric blocks, decorative sparklines, and overused template layouts.
- Avoid “wow-piece” artifacts that look like marketing pages. The goal is to help the user glean information quickly.

If the `frontend-design` skill is available and the task calls for a particularly polished visual artifact, borrow its craft guidance while overriding any bias toward maximalism or visual spectacle. Prioritize compact information design and scannability.

## Content quality

- Make the artifact useful for decision-making and execution.
- Prefer specificity over vague planning language.
- Clearly distinguish recommendations, assumptions, unresolved questions, and known constraints.
- Do not invent facts about the codebase, organization, users, or timeline. Mark assumptions when needed.
- Make tradeoffs explicit.
- Include concrete next actions when useful.
- Keep the chat response short; the artifact is the deliverable.

## HTML implementation checklist

Every generated artifact should include:

- `<!doctype html>`
- `<html lang="en">`
- `<meta charset="utf-8">`
- `<meta name="viewport" content="width=device-width, initial-scale=1">`
- A meaningful `<title>`
- Inline `<style>` with CSS variables and responsive layout
- Print CSS via `@media print`
- A generated timestamp or small metadata note inside the page
- No secrets, tokens, private environment values, or unnecessary sensitive content

Optional enhancements:

- Sticky table of contents for long docs
- Keyboard navigation for slide decks
- Expand/collapse details for dense reference material
- Mermaid-like diagrams implemented as inline SVG/CSS, not external renderers
- “Open questions” or “Decision needed” panels when the user needs to choose

## Response format

After writing the artifact, respond like:

```text
Created visual spec: <short title>
Path: /absolute/path/to/artifact.html
Open: open "/absolute/path/to/artifact.html"
```

Add at most one short sentence about assumptions or notable unresolved questions. Do not include the full spec in chat.
