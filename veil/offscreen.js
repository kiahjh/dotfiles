// Draws what the service worker can't: SVGs, the frames of animated GIF, WebP,
// PNG and AVIF images, and frames of cross-origin videos the page isn't allowed to
// read. Returns PNG data URLs; the worker shrinks them to fit Jev.

const MAX_FRAMES = 6;
const MAX_SIDE = 1024;
const TIMEOUT = 20000;

function draw(source, width, height) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  // PNG keeps transparency, which the worker fills with white.
  return canvas.toDataURL("image/png");
}

function once(target, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(reject, new Error(`timed out waiting for ${event}`)), TIMEOUT);
    const onEvent = () => done(resolve);
    const onError = () => done(reject, new Error(target.error?.message || `couldn't load media`));
    function done(settle, value) {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener("error", onError);
      settle(value);
    }
    target.addEventListener(event, onEvent);
    target.addEventListener("error", onError);
  });
}

async function fetchBlob(url) {
  const response = await fetch(url, { credentials: "include", cache: "force-cache", signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) throw new Error(`image fetch failed: ${response.status}`);
  return response.blob();
}

// ---- SVG ----

async function svgFrames(url) {
  const blob = await fetchBlob(url);
  const objectUrl = URL.createObjectURL(new Blob([blob], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = objectUrl;
    await img.decode();
    // An SVG with only a viewBox has no natural size of its own.
    const width = img.naturalWidth || 512;
    const height = img.naturalHeight || 512;
    return [draw(img, width, height)];
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// ---- Animated images ----

function mimeOf(bytes) {
  const text = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
  if (text(0, 4) === "GIF8") return "image/gif";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  if (bytes[0] === 0x89 && text(1, 4) === "PNG") return "image/png";
  if (text(4, 8) === "ftyp") return "image/avif";
  throw new Error("unknown animated image format");
}

function spread(count, max) {
  if (count <= max) return [...Array(count).keys()];
  return [...Array(max).keys()].map((i) => Math.round((i * (count - 1)) / (max - 1)));
}

async function animatedFrames(url) {
  const data = await (await fetchBlob(url)).arrayBuffer();
  const decoder = new ImageDecoder({ data, type: mimeOf(new Uint8Array(data)) });
  try {
    await decoder.tracks.ready;
    await decoder.completed;
    const frames = [];
    for (const frameIndex of spread(decoder.tracks.selectedTrack.frameCount, MAX_FRAMES)) {
      const { image } = await decoder.decode({ frameIndex });
      frames.push(draw(image, image.displayWidth, image.displayHeight));
      image.close();
    }
    return frames;
  } finally {
    decoder.close();
  }
}

// ---- Video frames ----

// A few loaded videos, so checking every couple of seconds doesn't reload them.
const videos = new Map();

function videoFor(url) {
  if (videos.has(url)) {
    const entry = videos.get(url);
    videos.delete(url);
    videos.set(url, entry); // most recently used last
    return entry;
  }
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  // The extension's host permissions let it read cross-origin frames, but only in
  // CORS mode.
  video.crossOrigin = "anonymous";
  video.src = url;
  const entry = { video, queue: once(video, "loadeddata") };
  videos.set(url, entry);
  if (videos.size > 4) {
    const [oldest, { video: old }] = videos.entries().next().value;
    old.removeAttribute("src");
    old.load();
    videos.delete(oldest);
  }
  return entry;
}

function videoFrame(url, time) {
  const entry = videoFor(url);
  const frame = entry.queue.then(async () => {
    const { video } = entry;
    const target = Math.min(time, Math.max(0, (video.duration || time) - 0.05));
    if (Math.abs(video.currentTime - target) > 0.05) {
      video.currentTime = target;
      await once(video, "seeked");
    }
    return draw(video, video.videoWidth, video.videoHeight);
  });
  // After a failure, start over with a fresh element next time.
  entry.queue = frame.catch(() => videos.get(url) === entry && videos.delete(url));
  return frame;
}

// ---- Messages from the worker ----

const handlers = {
  async frames({ url, kind }) {
    return { frames: kind === "svg" ? await svgFrames(url) : await animatedFrames(url) };
  },
  async videoFrame({ url, time }) {
    return { frame: await videoFrame(url, time) };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return false;
  const handler = handlers[message.type];
  if (!handler) return false;
  handler(message).then(sendResponse, (error) => sendResponse({ error: error.message }));
  return true;
});
