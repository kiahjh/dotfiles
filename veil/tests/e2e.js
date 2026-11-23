// End-to-end check of Veil in Playwright's Chromium, against a fake Jev.
// The fake calls anything red in the middle racy and everything else safe, so the
// test page can say what each image and video should end up as.
//
//   bun --install=fallback veil/tests/e2e.js     (needs ffmpeg for the fixtures)

import { chromium } from "playwright-core";
import jpeg from "jpeg-js";
import { deflateSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const extension = join(import.meta.dir, "..");
const work = mkdtempSync(join(tmpdir(), "veil-e2e-"));

// ---- Fixtures ----

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function png(width, height, [r, g, b]) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Solid-color clips joined end to end, e.g. [["green", 2], ["red", 2]].
function ffmpeg(name, segments, args) {
  const inputs = segments.flatMap(([color, seconds]) => ["-f", "lavfi", "-i", `color=c=${color}:s=400x300:d=${seconds}:r=10`]);
  const concat = segments.map((_, i) => `[${i}]`).join("") + `concat=n=${segments.length}:v=1`;
  const out = join(work, name);
  execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", concat, ...args, out]);
  return readFileSync(out);
}

const webm = (segments) => ffmpeg(`${crypto.randomUUID()}.webm`, segments, ["-c:v", "libvpx", "-b:v", "200k"]);
const svg = (width, height, color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/></svg>`;

const RED = [200, 30, 30];
const files = {
  "/safe.png": ["image/png", png(400, 400, [40, 160, 60])],
  "/safe2.png": ["image/png", png(300, 300, [40, 60, 160])],
  "/racy.png": ["image/png", png(600, 300, RED)],
  "/racy-bg.png": ["image/png", png(800, 300, RED)],
  "/racy-shadow.png": ["image/png", png(700, 300, RED)],
  "/racy-late.png": ["image/png", png(900, 300, RED)],
  "/racy-swap.png": ["image/png", png(500, 280, RED)],
  "/racy-blob.png": ["image/png", png(480, 360, RED)],
  "/icon.png": ["image/png", png(16, 16, [0, 0, 0])],
  "/racy.svg": ["image/svg+xml", svg(400, 300, "#c81e1e")],
  "/icon.svg": ["image/svg+xml", svg(16, 16, "#c81e1e")],
  "/turns-racy.gif": ["image/gif", ffmpeg("turns-racy.gif", [["green", 1], ["green", 1], ["red", 0.5]], [])],
  "/safe.gif": ["image/gif", ffmpeg("safe.gif", [["green", 1], ["blue", 1]], [])],
  "/turns-racy.webm": ["video/webm", webm([["green", 2.5], ["red", 2.5]])],
  "/racy.webm": ["video/webm", webm([["red", 3]])],
  "/still.webm": ["video/webm", webm([["yellow", 6]])],
  "/turns-racy-late.webm": ["video/webm", webm([["green", 1], ["red", 9]])],
};

// ---- The fake Jev ----

const calls = [];

async function fakeJev(request) {
  const body = await request.json();
  const [ref] = Object.keys(body.assets);
  const image = jpeg.decode(Buffer.from(body.assets[ref].data_base64, "base64"), { useTArray: true });
  const middle = 4 * (Math.floor(image.height / 2) * image.width + Math.floor(image.width / 2));
  const [r, g, b] = image.data.subarray(middle, middle + 3);
  calls.push({
    auth: request.headers.get("authorization"),
    images: request.headers.get("typesafe-danger-zone-images"),
    model: body.model,
    state: body.state,
    ref,
    center: [r, g, b],
    questions: Object.values(body.questions),
    size: { width: image.width, height: image.height },
  });
  await Bun.sleep(400);
  const p = r > 150 && g < 90 && b < 90 ? 0.9 : 0.02;
  const answers = Object.fromEntries(Object.keys(body.questions).map((id) => [id, { type: "noul", noul: p }]));
  return Response.json({ model: "jev-fake", answers, usage: { input_tokens: 400, output_tokens: 0 } });
}

const page = (crossOrigin) => `<!doctype html>
<title>Veil test</title>
<img id="safe" src="/safe.png">
<img id="racy" src="/racy.png">
<img id="icon" src="/icon.png">
<picture><source srcset="/racy.png"><img id="picture" src="/safe.png"></picture>
<div id="bg" style="width:200px;height:80px;background:url('/racy-bg.png')"></div>
<div id="bg-safe" style="width:200px;height:80px;background-image:url(/safe2.png)"></div>
<div id="host"></div>
<img id="swap" src="/safe2.png">
<img id="svg" src="/racy.svg">
<img id="svg-icon" src="/icon.svg">
<img id="gif" src="/turns-racy.gif">
<img id="gif-safe" src="/safe.gif">
<video id="video" src="/turns-racy.webm" autoplay muted playsinline></video>
<video id="video-cors" src="${crossOrigin}/racy.webm" autoplay muted playsinline></video>
<video id="still" autoplay muted playsinline></video>
<div style="height:4000px"></div>
<video id="offscreen" src="/turns-racy-late.webm" autoplay muted playsinline></video>
<script>
  const shadow = document.getElementById("host").attachShadow({ mode: "closed" });
  shadow.innerHTML = '<img id="inner" src="/racy-shadow.png">';
  window.inner = shadow.getElementById("inner");
  setTimeout(() => {
    const late = document.createElement("img");
    late.id = "late";
    late.src = "/racy-late.png";
    document.body.append(late);
  }, 300);
  setTimeout(() => { document.getElementById("swap").src = "/racy-swap.png"; }, 600);
  // Like YouTube and X, which stream into a blob: URL: the page can read its frames.
  fetch("/still.webm").then((r) => r.blob()).then((blob) => {
    document.getElementById("still").src = URL.createObjectURL(blob);
  });
  // Like iCloud Photos: load a blob: URL off the page, revoke it, then show the image.
  fetch("/racy-blob.png").then((r) => r.blob()).then((blob) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.id = "blob";
    img.onload = () => {
      URL.revokeObjectURL(url);
      document.body.append(img);
    };
    img.src = url;
  });
</script>`;

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/v1/systemone") return fakeJev(request);
    if (files[pathname]) {
      const [type, bytes] = files[pathname];
      return new Response(bytes, { headers: { "content-type": type } });
    }
    return new Response(page(`http://media.test:${server.port}`), { headers: { "content-type": "text/html" } });
  },
});
// Veil skips localhost, so the test page gets made-up names that Chromium maps to it.
const origin = `http://veil.test:${server.port}`;

// ---- Run it ----

function playwrightChromium() {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const dir = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort().at(-1);
  const build = join(cache, dir, "chrome-mac-arm64");
  // Chrome for Testing, unlike Chrome, still honors --load-extension.
  const app = readdirSync(build).find((name) => name.endsWith(".app"));
  return join(build, app, "Contents/MacOS", app.replace(/\.app$/, ""));
}

const context = await chromium.launchPersistentContext(join(work, "profile"), {
  executablePath: process.env.CHROMIUM ?? playwrightChromium(),
  headless: true,
  viewport: { width: 1280, height: 2000 },
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "--autoplay-policy=no-user-gesture-required",
    "--host-resolver-rules=MAP veil.test 127.0.0.1, MAP media.test 127.0.0.1",
  ],
});

let failures = 0;
function expectEqual(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
}

const look = (tab) =>
  tab.evaluate(() => {
    const el = (id) => document.getElementById(id) ?? window[id];
    const media = (id) => ({ veil: el(id)?.dataset.veil ?? null, visibility: el(id) && getComputedStyle(el(id)).visibility });
    const bg = (id) => ({ veilBg: el(id).dataset.veilBg ?? null, hasUrl: getComputedStyle(el(id)).backgroundImage.includes("url(") });
    const ids = ["blob", "safe", "racy", "icon", "picture", "late", "swap", "inner", "svg", "svg-icon", "gif", "gif-safe", "video", "video-cors", "offscreen"];
    return { ...Object.fromEntries(ids.map((id) => [id, media(id)])), bg: bg("bg"), bgSafe: bg("bg-safe") };
  });

const shown = { veil: "allow", visibility: "visible" };
const blocked = { veil: "block", visibility: "visible" };

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  worker.on("console", (message) => message.type() === "warning" && console.log("worker:", message.text()));
  await worker.evaluate(
    (apiBase) => chrome.storage.local.set({ settings: { apiKey: "test-key", apiBase, videoInterval: 0.5 } }),
    origin,
  );

  const tab = await context.newPage();
  tab.on("console", (message) => message.type() === "error" && console.log("page:", message.text()));

  // Before the fake Jev answers, nothing should be painted.
  await tab.goto(origin);
  expectEqual(
    "images hidden while Jev is thinking",
    await tab.evaluate(() => ["safe", "racy", "video"].map((id) => getComputedStyle(document.getElementById(id)).visibility)),
    ["hidden", "hidden", "hidden"],
  );

  // The first video is green for 2.5 seconds, then red.
  await tab.waitForTimeout(1600);
  expectEqual("video shown while its frames are safe", (await look(tab)).video, shown);

  await tab.waitForTimeout(3400);
  if (process.env.SCREENSHOT) await tab.screenshot({ path: process.env.SCREENSHOT, fullPage: true });
  const state = await look(tab);

  expectEqual("safe image shown", state.safe, shown);
  expectEqual("racy image blocked", state.racy, blocked);
  expectEqual("icon skipped", state.icon, shown);
  expectEqual("<picture> judged by the source it chose", state.picture, blocked);
  expectEqual("image added later blocked", state.late, blocked);
  expectEqual("image whose src changed rechecked", state.swap, blocked);
  expectEqual("image in closed shadow root blocked", state.inner, blocked);
  expectEqual("racy background blocked", state.bg, { veilBg: "block", hasUrl: false });
  expectEqual("safe background shown", state.bgSafe, { veilBg: "allow", hasUrl: true });
  expectEqual("revoked blob: image blocked, read from the page", state.blob, blocked);
  expectEqual("racy SVG blocked", state.svg, blocked);
  expectEqual("SVG icon skipped", state["svg-icon"], shown);
  expectEqual("GIF that turns racy in a later frame blocked", state.gif, blocked);
  expectEqual("safe animated GIF shown", state["gif-safe"], shown);
  expectEqual("video blocked once its frames turn racy", state.video, blocked);
  expectEqual("cross-origin video blocked, checked offscreen", state["video-cors"], blocked);
  const yellow = calls.filter(({ center: [r, g, b] }) => r > 200 && g > 200 && b < 60).length;
  expectEqual("a video whose picture doesn't change is checked once", yellow, 1);
  expectEqual("a video played off screen isn't checked again", state.offscreen, shown);
  await tab.locator("#offscreen").scrollIntoViewIfNeeded();
  await tab.waitForTimeout(100);
  expectEqual("...until it's back on screen, hidden until then", (await look(tab)).offscreen.visibility, "hidden");
  await tab.waitForTimeout(1000);
  expectEqual("...where it's checked again", (await look(tab)).offscreen, blocked);
  await tab.evaluate(() => scrollTo(0, 0));

  // Hovering a blocked image says why.
  const racy = await tab.locator("#racy").boundingBox();
  await tab.mouse.move(racy.x + racy.width / 2, racy.y + racy.height / 2);
  await tab.waitForTimeout(200);
  const tip = await tab.evaluate(() => {
    const host = document.querySelector("veil-tooltip");
    return host && { display: host.style.display, text: host.shadowRoot?.textContent };
  });
  expectEqual("hover explains the block", tip?.display === "block" && /^Hidden by Veil\nNudity or sexual content 90%/.test(tip.text), true);
  const safe = await tab.locator("#safe").boundingBox();
  await tab.mouse.move(safe.x + safe.width / 2, safe.y + safe.height / 2);
  await tab.waitForTimeout(200);
  expectEqual("no tooltip over a shown image", await tab.evaluate(() => document.querySelector("veil-tooltip").style.display), "none");

  const first = calls[0];
  expectEqual("sends the key and the images header", [first.auth, first.images, first.model], ["Bearer test-key", "true", "jev-latest"]);
  expectEqual("state refers to the asset", first.state, { image: first.ref });
  expectEqual("asks every category, with criteria where defined", first.questions.map((q) => !!q.criteria), [true, false, false, true, true, true]);
  const outOfBounds = calls.map((call) => call.size).filter(({ width, height }) => Math.min(width, height) < 280 || Math.max(width, height) > 1568);
  expectEqual("every image sent fits Jev's limits", outOfBounds, []);

  // A reload answers images from the cache; only the four videos' frames go to Jev again.
  await tab.goto("about:blank");
  const before = calls.length;
  await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({ settings: { ...settings, videoInterval: 30 } });
  });
  await tab.goto(origin);
  await tab.waitForTimeout(1500);
  expectEqual("reload uses the cache for images", calls.length - before <= 4, true);
  expectEqual("still blocked after reload", await tab.evaluate(() => document.getElementById("racy").dataset.veil), "block");

  // Paused sites are left alone.
  await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({ settings: { ...settings, pausedSites: ["veil.test"] } });
  });
  await tab.reload();
  await tab.waitForTimeout(500);
  expectEqual(
    "paused site shows everything",
    await tab.evaluate(() => [document.documentElement.hasAttribute("data-veil-off"), getComputedStyle(document.getElementById("racy")).visibility]),
    [true, "visible"],
  );

  // Localhost is never touched, so dev servers don't see Veil's attributes.
  await tab.goto(`http://localhost:${server.port}`);
  await tab.waitForTimeout(500);
  expectEqual(
    "localhost left alone",
    await tab.evaluate(() => [document.querySelectorAll("[data-veil], [data-veil-bg], [data-veil-off]").length, getComputedStyle(document.getElementById("racy")).visibility]),
    [0, "visible"],
  );
} finally {
  await context.close();
  server.stop(true);
  rmSync(work, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
