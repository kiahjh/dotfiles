# Native Codex Image Prompting Notes

Use with Codex's built-in `$imagegen` capability. The native tool chooses quality and pixel dimensions automatically, returns PNG, and creates one image per call.

Sources:

- https://developers.openai.com/codex/image-generation
- https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide

## General structure

Use a maintainable order:

1. Intended artifact or use
2. Canvas orientation, framing, and layout
3. Background or scene
4. Main subject and action
5. Materials, lighting, and palette
6. Exact text, if any
7. Constraints and exclusions

Clear prose and labeled specifications both work. Prefer concrete visible instructions over praise words such as “beautiful,” “professional,” or “masterpiece.”

## Composition

Specify only the controls that matter:

- Canvas: square, portrait, landscape, or widescreen
- Framing: close-up, full body, wide establishing shot, top-down
- Viewpoint: eye level, low angle, three-quarter view
- Placement: centered, upper-right logo, negative space on left
- Lighting: soft diffuse daylight, hard side light, golden hour
- Atmosphere: fog, rain, film grain, clean studio air

The built-in tool uses automatic size selection. Describe the intended orientation and composition rather than promising exact dimensions.

For people, clarify body framing, gaze, relative scale, and physical interaction with objects.

## Photorealism

Use “photorealistic,” “real photograph,” or a plausible capture context directly. Describe natural texture and ordinary imperfections. Camera details are most useful for broad framing and visual character rather than exact physical simulation.

Example:

> Photorealistic candid photograph, eye-level medium shot, natural window light, visible material and skin texture, restrained color, unposed everyday detail, no heavy retouching.

## Stylized work

Name the medium and its visible physical properties. For claymation, for example, describe hand-shaped clay, subtle fingerprints, miniature-set construction, tactile surfaces, practical lighting, and stop-motion character. Then state the composition and palette separately.

Avoid contradictory style lists. Two or three compatible cues usually outperform a long collection of references.

## Text and structured visuals

- Put every required string in quotes.
- Say whether it must appear exactly once.
- Specify hierarchy, font character, color, placement, and contrast.
- Spell unusual names letter by letter when necessary.
- For diagrams, name zones, nodes, arrows, labels, legends, and their visual semantics explicitly.
- For multi-panel work, give the exact panel count and a concrete role for every panel.

Text rendering is improved but not infallible. Verify generated copy visually.

## Editing and references

Lead with the requested transformation, followed by invariants:

> Change only X. Preserve identity, geometry, camera angle, framing, layout, labels, lighting, and every surrounding object.

For multiple references, label their roles explicitly:

> Image 1: product photograph. Image 2: room and lighting reference. Preserve the product from Image 1, place it in Image 2, and match the perspective, scale, lighting, and shadows.

The native tool accepts at most five attached references. It does not expose masks or pixel-exact edit regions, so describe the changed area and preserved elements precisely.

## Transparency

The native GPT Image 2 path does not expose true transparent output. When transparency is required without API fallback:

1. Generate the isolated subject against a perfectly flat chroma-key color absent from the subject.
2. Require no gradient, floor plane, cast shadow, reflection, texture, or background lighting variation.
3. Remove the key locally and validate the alpha edge.

Do not switch to an API or CLI image-generation fallback.

## Iteration

A native generation can take several minutes. Generate only the requested asset and inspect it afterward. If revision is needed, make one focused change and repeat the important invariants; do not silently generate extra variants or retries.
