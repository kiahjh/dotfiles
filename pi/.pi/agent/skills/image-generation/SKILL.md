---
name: image-generation
description: Generate new images and edit, restyle, or combine existing images with OpenAI GPT Image 2 through Codex's native subscription-backed image tool. Use when the user asks to create an image, illustration, poster, logo, icon, mockup, diagram, product shot, visual asset, or to modify one or more image files.
compatibility: Requires the Codex CLI logged in with ChatGPT and its native image_generation feature. No OPENAI_API_KEY or separately billed API access is used.
---

# Image Generation

Generate and edit local PNG files with Codex's native `$imagegen` capability through the bundled wrapper. This skill is Codex-only: never use the OpenAI API CLI, an API key, or another fallback.

Resolve paths in this skill relative to the skill directory. Invoke the wrapper by its resolved absolute path while retaining the user's current working directory so relative input and output paths resolve there.

## Authentication

The wrapper uses the existing ChatGPT login managed by Codex. It deliberately removes API-related environment variables from the child process and instructs Codex to use only the native built-in image tool.

If authentication is unavailable:

1. Run `codex login` locally and choose ChatGPT authentication.
2. Confirm with `codex login status`.
3. Retry the wrapper.

Never ask the user to paste credentials, inspect Codex OAuth files, or switch to an API fallback.

## Commands

Generate one image:

```bash
scripts/gpt-image generate \
  --prompt "A concise but complete visual prompt" \
  --output generated-images/2026-07-19-forest-observatory.png
```

Edit an existing image:

```bash
scripts/gpt-image edit \
  --image source.png \
  --prompt "Change only the sky to an overcast evening. Preserve the subject, framing, geometry, and all other details." \
  --output generated-images/source-overcast.png
```

Combine references by repeating `--image`:

```bash
scripts/gpt-image edit \
  --image product.png \
  --image room.png \
  --prompt "Image 1 is the product. Image 2 is the setting. Place the product naturally on the table in Image 2; match its perspective, scale, lighting, and shadows." \
  --output generated-images/product-in-room.png
```

The native tool accepts up to five references. Outputs are PNG. Use `--force` only when the user explicitly asks to replace an existing output.

## Native execution contract

The wrapper:

- starts an isolated, ephemeral `codex exec` turn with an explicit `$imagegen` mention;
- uses the lightweight Codex agent model only to orchestrate one native image-generation call;
- runs model-authored shell access in a read-only sandbox;
- disables user configuration and API-key environment variables;
- locates the native PNG by the Codex thread ID under Codex's `generated_images` artifact area;
- validates and atomically copies that PNG to the requested path.

Do not call `codex exec` separately when the wrapper can handle the request.

## Workflow

1. Determine whether the request is a new generation or an edit/reference composition.
2. Preserve a detailed user prompt as written. Expand it only when additional visible specificity will materially help.
3. For non-trivial prompts, read [references/prompting.md](references/prompting.md) and apply only the relevant guidance.
4. Put orientation and aspect-ratio intent into the prompt: square, portrait, landscape, or widescreen. Native quality and pixel dimensions are selected automatically and are not command-line controls.
5. Generate exactly one output per wrapper invocation. Do not add a cost-confirmation step for an ordinary request, and do not silently generate retries or variants.
6. Use the user's requested output path. Otherwise save under `generated-images/` with a date and short descriptive slug. Never overwrite an input image.
7. After generation, use `read` on the output and assess it against the request: subject, style, composition, text accuracy, and obvious artifacts.
8. If the result misses the request, explain the specific issue and offer one focused revision rather than silently spending another generation.
9. Report the final path and actual pixel dimensions. If the user asks to view it on macOS, run `open -a Preview <path>`.

## Prompt essentials

- Put intended artifact, canvas, and layout before visual details.
- State landscape or portrait orientation explicitly; exact output dimensions remain automatic.
- Quote literal in-image text and specify placement and typography.
- For edits, state what changes and what must remain invariant.
- For multiple references, identify each image by index and role.
- The native path has no mask parameter or native transparent-background control. For transparency, request a flat removable chroma-key background and remove it locally; do not switch to an API fallback.
