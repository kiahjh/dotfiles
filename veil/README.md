# Veil

Veil is a Chromium extension (Helium, Chrome) that hides every image and video on a
page until [Jev](https://docs.typesafe.ai) has looked at it, then shows it or blocks
it. It's meant to block anything even slightly racy, suggestive or immodest.

## Install

1. Open `chrome://extensions` in Helium and turn on **Developer mode**.
2. Click **Load unpacked** and pick `~/.dotfiles/veil`.
3. Open Veil's options and paste a TypeSafe API key. Until you do, every image stays hidden.

After editing the code, click the reload arrow on Veil's card in `chrome://extensions`.

## What it checks

- **Images:** `<img>`, `<picture>` and srcset (by `currentSrc`), CSS background images,
  and images inside open or closed shadow roots, including ones added or swapped in later.
  JPEG, PNG, WebP, AVIF, GIF, BMP, ICO and SVG.
- **Animations:** animated GIF, WebP, PNG and AVIF are checked at up to six frames
  spread across the animation, and blocked if any frame is.
- **Video:** `<video>` stays hidden until its poster or first frame is checked. While it
  plays, Veil checks the current frame every 2 seconds (configurable), and again after
  every seek. A blocked video stays hidden until two checks in a row look fine.

Hover over anything Veil hid to see why: the questions that reached the threshold and
Jev's probability for each.

## How it works

- `content.css` hides every `<img>` and `<video>` from the first paint. `content.js`
  finds each image and video and asks the background worker for a verdict. It grabs
  video frames itself (this works for streaming sites such as YouTube and X).
- `background.js` fetches each image, shrinks it to 512 pixels on the long side (or
  enlarges or pads it to Jev's 280-pixel minimum), and sends it to Jev as a JPEG. It
  sends one image per request, with one Noul question per category.
- `offscreen.js` runs in a hidden extension page and does what the worker can't: it
  draws SVGs, decodes animation frames, and grabs frames from cross-origin video files
  the page isn't allowed to read.
- `policy.js` holds the questions and the rule: an image is blocked when any
  question's probability reaches the threshold (0.25 by default; lower is stricter).
  Blocked things keep their size but show stripes instead.
- Image answers are cached by URL for 30 days, up to 20,000 images, so repeat images
  are free. Changing the threshold reuses cached answers. Changing a question's wording,
  or turning on a category or rule, asks Jev again. Video frames are never cached.

Images under 48 pixels a side (icons) are let through without a check. When a check
fails (no key, network error, an image that can't be downloaded), the image stays
hidden with a red dashed outline, unless you turn off **Keep images hidden when they
can't be checked**.

The popup shows how many things were hidden on the page, any recent error, and a
switch to pause Veil on the current site.

## Cost

Jev charges $0.042 per million input tokens and nothing for output. The options page
adds up the tokens Jev reports. In real browsing an image came to about 850 tokens,
so about 28,000 images per dollar. A video costs one image's worth per check: at one
check every 2 seconds, an hour of video is 1,800 checks, about $0.06.

## Limits

- Images on TypeSafe's API are a "danger zone" feature: not production quality yet, and
  subject to change. Test it against your own standard before relying on it.
- Each image is downloaded a second time by the extension, and checking adds roughly
  0.1–0.5 seconds before an image appears.
- Video is checked by sampling, so up to about the check interval plus Jev's response
  time (roughly 2.5 seconds by default) can play before a racy scene is caught.
  Lower the interval to tighten that, at a higher cost. DRM-protected video (Netflix and
  the like) draws as black frames, so Veil can't see it. Blocking hides the picture but
  doesn't mute the sound.
- `<canvas>`, CSS `::before`/`::after` images, `<svg><image>`, and backgrounds that
  only appear on hover aren't checked. A background image added by a stylesheet that
  loads after its element can show briefly before Veil catches up.
- Sites that check the Referer header before serving an image will fail the check, so
  those images stay hidden.
- Every image and video frame you see is sent to TypeSafe. The API key is stored in the
  extension's local storage.

## Tests

```sh
bun test ./veil/       # questions, thresholds, sizing, format sniffing
just veil-e2e          # the whole extension in Playwright's Chromium, against a fake Jev
```

The end-to-end test needs ffmpeg and Playwright's Chromium in
`~/Library/Caches/ms-playwright` (or set `CHROMIUM` to a Chrome for Testing binary).
