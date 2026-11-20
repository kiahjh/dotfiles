// Checks what the content scripts find. For an image URL: fetch it, turn it into
// one or more still frames, shrink each to fit Jev's limits, ask Jev the questions
// from policy.js, and cache the answers by URL. For a video: check the frame the
// page grabbed, or have the offscreen document grab it when the page can't.

import {
  buildQuestions,
  covers,
  decide,
  fitSize,
  siteOf,
  withDefaults,
} from "./policy.js";
import { kindOf } from "./formats.js";

const CACHE_PREFIX = "c:";
const CACHE_LIMIT = 20000;
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const CONCURRENCY = 8;
const TIMEOUT = 20000;

let settings = withDefaults();
const ready = chrome.storage.local.get("settings").then(({ settings: stored }) => {
  settings = withDefaults(stored);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    settings = withDefaults(changes.settings.newValue);
  }
});

// ---- Per-tab counts, shown on the toolbar badge and in the popup ----

const tabStats = new Map();
let lastError = "";

function statsFor(tabId) {
  if (!tabStats.has(tabId)) tabStats.set(tabId, { checked: 0, blocked: 0 });
  return tabStats.get(tabId);
}

function count(tabId, verdict) {
  if (tabId == null || tabId < 0) return;
  const stats = statsFor(tabId);
  stats.checked += 1;
  if (verdict !== "allow") stats.blocked += 1;
  chrome.action.setBadgeText({ tabId, text: stats.blocked ? String(stats.blocked) : "" });
}

chrome.action.setBadgeBackgroundColor({ color: "#6b5b95" });

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading" && change.url) tabStats.delete(tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => tabStats.delete(tabId));

// ---- A small concurrency limit, so a gallery page doesn't open 200 connections ----

let running = 0;
const waiting = [];

async function limited(task) {
  if (running >= CONCURRENCY) await new Promise((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

// ---- Cache of Jev's answers, keyed by image URL ----

const memory = new Map();
const inFlight = new Map();

async function cacheKey(url) {
  if (url.length <= 2048) return CACHE_PREFIX + url;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  return CACHE_PREFIX + "sha256:" + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function cached(key) {
  if (memory.has(key)) return memory.get(key);
  const { [key]: entry } = await chrome.storage.local.get(key);
  if (entry && Date.now() - entry.t < CACHE_TTL) {
    memory.set(key, entry);
    return entry;
  }
  return null;
}

async function remember(key, nouls) {
  const entry = { t: Date.now(), nouls };
  memory.set(key, entry);
  await chrome.storage.local.set({ [key]: entry });
}

async function pruneCache() {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all).filter(([key]) => key.startsWith(CACHE_PREFIX));
  const now = Date.now();
  const stale = entries.filter(([, entry]) => now - entry.t >= CACHE_TTL).map(([key]) => key);
  const fresh = entries.filter(([, entry]) => now - entry.t < CACHE_TTL).sort(([, a], [, b]) => b.t - a.t);
  const excess = fresh.slice(CACHE_LIMIT).map(([key]) => key);
  if (stale.length || excess.length) await chrome.storage.local.remove([...stale, ...excess]);
}

async function clearCache() {
  memory.clear();
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter((key) => key.startsWith(CACHE_PREFIX)));
}

chrome.runtime.onStartup.addListener(pruneCache);
chrome.runtime.onInstalled.addListener(pruneCache);

// ---- The offscreen document, for what a service worker can't draw ----

let creatingOffscreen = null;

async function offscreen(message) {
  if (!(await chrome.offscreen.hasDocument())) {
    creatingOffscreen ??= chrome.offscreen
      .createDocument({
        url: "offscreen.html",
        reasons: ["DOM_SCRAPING"],
        justification: "Draw SVGs, decode animated images, and grab video frames so Jev can check them.",
      })
      .finally(() => (creatingOffscreen = null));
    await creatingOffscreen;
  }
  // The document exists before its module script is listening, so retry briefly.
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await chrome.runtime.sendMessage({ target: "offscreen", ...message });
      if (!result || result.error) throw new Error(result?.error ?? "offscreen document didn't answer");
      return result;
    } catch (error) {
      if (!/Receiving end does not exist/.test(error.message) || attempt >= 20) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

// ---- Turning an image into still frames ----

class Skip extends Error {}

async function bitmapFrom(dataUrl) {
  return createImageBitmap(await (await fetch(dataUrl)).blob());
}

async function framesOf(url) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "force-cache",
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!response.ok) throw new Error(`image fetch failed: ${response.status}`);
  const blob = await response.blob();
  const kind = kindOf(new Uint8Array(await blob.arrayBuffer()), blob.type);
  if (kind === "still") return [await createImageBitmap(blob)];
  // The offscreen document fetches the URL itself; it shares this worker's HTTP cache.
  const { frames } = await offscreen({ type: "frames", url, kind });
  return Promise.all(frames.map(bitmapFrom));
}

async function toJpeg(bitmap) {
  const size = fitSize(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(size.canvasWidth, size.canvasHeight);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    bitmap,
    Math.round((canvas.width - size.drawWidth) / 2),
    Math.round((canvas.height - size.drawHeight) / 2),
    size.drawWidth,
    size.drawHeight,
  );
  bitmap.close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
}

async function base64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// ---- Asking Jev ----

async function askJev(jpeg, questions) {
  if (!settings.apiKey) throw new Error("No TypeSafe API key. Add one in Veil's options.");
  const ref = crypto.randomUUID();
  const body = JSON.stringify({
    model: settings.model,
    state: { image: ref },
    assets: { [ref]: { type: "image", format: "jpg", data_base64: await base64(jpeg) } },
    questions,
  });

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${settings.apiBase}/v1/systemone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
        "TypeSafe-Danger-Zone-Images": "true",
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (response.ok) {
      const result = await response.json();
      const nouls = {};
      for (const [id, answer] of Object.entries(result.answers)) nouls[id] = answer.noul;
      await addUsage(result.usage?.input_tokens ?? 0);
      return nouls;
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= 3) {
      throw new Error(`Jev returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
}

// An animation is as bad as its worst frame.
async function askAboutFrames(bitmaps, questions) {
  const answers = await Promise.all(bitmaps.map(async (bitmap) => askJev(await toJpeg(bitmap), questions)));
  const worst = {};
  for (const id of Object.keys(questions)) worst[id] = Math.max(...answers.map((nouls) => nouls[id] ?? 0));
  return worst;
}

let usageWrite = Promise.resolve();

function addUsage(tokens) {
  usageWrite = usageWrite.then(async () => {
    const { usage = { tokens: 0, images: 0 } } = await chrome.storage.local.get("usage");
    await chrome.storage.local.set({ usage: { tokens: usage.tokens + tokens, images: usage.images + 1 } });
  });
  return usageWrite;
}

// ---- Checking one image URL ----

// URLs that turned out to be icons, so they aren't fetched again.
const skipped = new Map();

async function nouls(url, questions) {
  const key = await cacheKey(url);
  if (skipped.has(key)) throw new Skip(skipped.get(key));
  const hit = await cached(key);
  if (hit && covers(hit.nouls, questions)) return hit.nouls;

  if (!inFlight.has(key)) {
    const work = limited(async () => {
      const bitmaps = await framesOf(url);
      const [first] = bitmaps;
      if (first.width < settings.minSide && first.height < settings.minSide) {
        bitmaps.forEach((bitmap) => bitmap.close());
        throw new Skip("icon");
      }
      const answers = await askAboutFrames(bitmaps, questions);
      await remember(key, answers);
      return answers;
    })
      .catch((error) => {
        if (error instanceof Skip) skipped.set(key, error.message);
        throw error;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, work);
  }
  return inFlight.get(key);
}

async function judge(work) {
  await ready;
  const asked = buildQuestions(settings);
  if (!Object.keys(asked.questions).length) return { verdict: "allow", reasons: [] };
  try {
    return decide(await work(asked.questions), asked, settings);
  } catch (error) {
    if (error instanceof Skip) return { verdict: "allow", reasons: [] };
    lastError = `${new Date().toLocaleTimeString()}: ${error.message}`;
    console.warn("Veil couldn't check", error);
    return { verdict: settings.failClosed ? "error" : "allow", reasons: [], error: error.message };
  }
}

// ---- Checking one video frame (never cached: the next frame is different) ----

// Frames skip the queue that images wait in: a playing video can't wait behind a
// page of thumbnails, and each video only ever has one frame in flight.
async function frameNouls(dataUrl, questions) {
  return askJev(await toJpeg(await bitmapFrom(dataUrl)), questions);
}

// ---- Messages from content scripts, the popup and the options page ----

const handlers = {
  async hello(_message, sender) {
    await ready;
    const site = siteOf(sender.tab?.url ?? sender.url ?? "");
    return {
      active: !settings.pausedSites.includes(site),
      minSide: settings.minSide,
      videoInterval: settings.videoInterval,
    };
  },
  async check({ url }, sender) {
    const result = await judge((questions) => nouls(url, questions));
    count(sender.tab?.id, result.verdict);
    return result;
  },
  // A frame the page drew itself.
  async checkFrame({ dataUrl }) {
    return judge((questions) => frameNouls(dataUrl, questions));
  },
  // A frame from a cross-origin video the page can't read, grabbed offscreen instead.
  async checkVideoAt({ url, time }) {
    return judge(async (questions) => {
      const { frame } = await offscreen({ type: "videoFrame", url, time });
      return frameNouls(frame, questions);
    });
  },
  // A video blocked for the first time counts once, like an image.
  async countVideo({ verdict }, sender) {
    count(sender.tab?.id, verdict);
    return { ok: true };
  },
  async tabStats({ tabId }) {
    return { ...statsFor(tabId), lastError };
  },
  async clearCache() {
    await clearCache();
    skipped.clear();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "offscreen") return false;
  const handler = handlers[message?.type];
  if (!handler) return false;
  handler(message, sender).then(sendResponse, (error) => sendResponse({ error: error.message }));
  return true;
});
