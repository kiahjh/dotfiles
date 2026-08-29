---
name: visual-spec
description: Create compact, dark-mode, browser-viewable HTML artifacts for specs and plans. Use only when the user explicitly asks for a visual spec or plan, an HTML spec or plan, a browser-viewable planning artifact, or directly invokes this skill. Never use it merely because the user requests an ordinary spec, plan, proposal, comparison, or other substantial planning content.
---

# Visual Spec

Create a small, self-contained HTML planning artifact instead of a long chat response.

## Activation requirement

Use this skill only when the user explicitly asks for one of the following:

- a visual spec or visual plan
- an HTML spec or HTML plan
- a browser-viewable planning/specification artifact
- this skill by name or command

Do not infer activation from the size or type of the task. A request for a spec, plan, PRD, RFC, proposal, roadmap, architecture note, task breakdown, comparison, or other planning content does not qualify unless the user explicitly asks for visual or HTML output.

Once explicitly activated, default to creating an artifact. Only paste the full plan in chat if the user asks for an inline answer.

## Output

- Write one self-contained `.html` file with inline CSS. Use JavaScript only when it meaningfully improves the document.
- Default output directory: `~/.local/share/pi/artifacts/specs/`, unless cwd has a gitignored `scratch/` directory, or some other obvious location for specs and docs
- Default filename: `YYYY-MM-DD-HHMM-short-kebab-slug.html`
- Never overwrite an existing artifact unless the user explicitly asks to update that file.

## Workflow

1. Identify the purpose, audience, and decision/action the doc should support.
2. Read relevant project context when the plan depends on an existing codebase.
3. Ask concise clarifying questions only when guessing would make the artifact misleading; otherwise state assumptions in the artifact.
4. Choose a lightweight structure for this task. No fixed template or mandatory section list.
5. Generate a unique filename, write the HTML, and sanity-check that it exists and is non-empty.

Useful shell pattern:

```bash
mkdir -p "$HOME/.local/share/pi/artifacts/specs"
date +"%Y-%m-%d-%H%M"
```

## Content guidance

- Optimize for one-time human reading: clear, compact, specific, and skimmable.
- Include only sections that earn their place. Good candidates: summary, recommendation, goals/non-goals, constraints, phases, risks, open questions, acceptance criteria, and next actions.
- Prefer tables, matrices, timelines, swimlanes, diagrams, callouts, and short checklists over long prose.
- Separate facts, assumptions, recommendations, and unresolved questions.
- Do not invent codebase, organizational, user, or timeline facts. Mark assumptions when needed.

## Visual style

Default to a dark editorial / technical dossier look:

- near-black page background, dark panels, subtle borders, readable off-white text, muted secondary text, and restrained accent colors
- compact top matter: title, purpose/key takeaway, and small metadata without a giant hero section
- body text around 14–16px, modest headings, tight-but-comfortable spacing
- high-value content above the fold

Avoid light-mode pages unless requested. Avoid landing-page drama, huge whitespace, gratuitous gradients/glassmorphism, decorative metric cards, and generic AI-template aesthetics. The artifact should look good, but information density matters more than polish.

## UI examples and sketches

When the spec affects UI, product flows, or user-facing behavior, and if it makes sense or would provide clarity, include compact visual examples. A quick picture is often worth more than another page of bullets.

Good examples:

- phone or desktop surface mockups
- card/list/detail states
- before/after comparisons
- flow diagrams or swimlanes
- tiny wireframes showing hierarchy, labels, and key interactions

Implement sketches with simple HTML/CSS or inline SVG. They do not need to be pixel-perfect; they should communicate shape, hierarchy, state, and copy. Pair each sketch with only the bullets needed to explain it.

## HTML constraints

This is a disposable reading artifact, not a production web page.

- Keep the HTML/CSS lean and easy to generate.
- Basic browser correctness is enough: title, viewport, inline styles, visible content, no remote dependencies by default.
- Do not spend tokens on perfect semantic HTML, exhaustive accessibility plumbing, elaborate print styles, or framework-like CSS systems.
- Do not include secrets, tokens, private environment values, or unnecessary sensitive content.
- Add a table of contents, print styles, or interactivity only when they clearly help this specific artifact.
