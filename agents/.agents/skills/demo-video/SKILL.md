---
name: demo-video
description: Use when the user asks for a short demo video of a change, feature, or proposal, such as for a PR, a teammate, or a design pitch.
---

# Demo videos

Before building anything, agree with the user on the general flow: what the video will
show, and in what order. You can work out the exact timing yourself.

Use whatever fits the job best. For example: a temporary Storybook story driving real
components, a [Remotion](https://www.remotion.dev/) project,
[psychopomp](https://github.com/kitlangton/psychopomp) for diagram-style explainers, an
ad hoc animated web page, or simulator screenshots stitched with ffmpeg. These are just
examples. Choose whatever makes the most sense for the scenario.

## Guidelines

- Make frame-driven videos: render each frame from a timeline (frame = f(time)) instead
  of recording in real time. It gives smooth 60fps at any resolution, parallel
  rendering, and reproducible frames.
- Make sure each frame is fully loaded and painted (fonts, images, the new state) before
  capturing it.
- Check stills and a contact sheet of key moments before a full render.
- Before building the whole video, show the user a 5–10 second moving clip with sound, and
  get their OK on the look, pacing and audio.
- Render at 1080p unless the user asks for more.
- Keep scratch work outside the repo, remove any temporary stories or pages afterward,
  and deliver to ~/Desktop.
- Use sound effects and pleasant, not-distracting music.
- This is a video, not a slideshow. Tell a story, don't merely present findings.

## Improving this skill

Pitch the user a line for this skill when you report back if you learn something
practical that would help next time: a workflow that worked really well, an approach
that gave great or poor results, something that didn't work, a good way to do something,
or a problem that cost real time. Don't add it yourself unless the user tells you to.
