// Finds every image and video on the page, keeps it hidden (see content.css) and
// asks the background worker whether to show it. Covers <img> and <picture>, CSS
// background images, <video> posters and frames, and open or closed shadow roots.

(() => {
  if (window.__veil) return;
  window.__veil = true;

  // content.css without the html:not([data-veil-off]) prefix, for shadow roots,
  // which page-level styles don't reach.
  const SHADOW_CSS = `
    :is(img, video):not([data-veil="allow"]) { visibility: hidden !important; }
    :is(img, video):is([data-veil="block"], [data-veil="error"]) {
      visibility: visible !important;
      object-position: -100000px -100000px !important;
      overflow: clip !important;
      background: repeating-linear-gradient(45deg, #8881 0 8px, #8883 8px 16px) !important;
    }
    [data-veil-bg="pending"] { background-image: none !important; }
    :is([data-veil-bg="block"], [data-veil-bg="error"]) {
      background-image: repeating-linear-gradient(45deg, #8881 0 8px, #8883 8px 16px) !important;
    }
    :is(img, video)[data-veil="error"], [data-veil-bg="error"] {
      outline: 1px dashed #c33 !important;
      outline-offset: -1px !important;
    }
  `;

  let minSide = 48;
  const checkedImg = new WeakMap();
  const checkedBg = new WeakMap();
  const watchedRoots = new WeakSet();

  // ---- Asking the background worker ----

  async function resolvable(url) {
    // A blob: URL only works in the page that made it, so read it here.
    if (!url.startsWith("blob:")) return url;
    const blob = await (await fetch(url)).blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function ask(message) {
    try {
      const result = await chrome.runtime.sendMessage(message);
      return result?.verdict ? result : { verdict: "error", reasons: [], error: result?.error };
    } catch (error) {
      return { verdict: "error", reasons: [], error: error.message };
    }
  }

  async function resultFor(url) {
    try {
      return await ask({ type: "check", url: await resolvable(url) });
    } catch (error) {
      return { verdict: "error", reasons: [], error: error.message };
    }
  }

  // ---- Saying why, when the pointer is over a blocked image ----

  // Why each blocked element was blocked. Kept here rather than in a title
  // attribute, because sites often cover their images with links and overlays.
  const why = new Map();

  function explain(result) {
    if (result.verdict === "error") return `Veil couldn't check this: ${result.error ?? "unknown error"}`;
    const reasons = result.reasons.map(({ label, p }) => `${label} ${Math.round(p * 100)}%`);
    return `Hidden by Veil\n${reasons.join("\n")}`;
  }

  function describe(el, result) {
    if (result.verdict === "allow") why.delete(el);
    else why.set(el, explain(result));
  }

  let tip;
  function tooltip() {
    if (tip) return tip;
    const host = document.createElement("veil-tooltip");
    host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; pointer-events: none; display: none;";
    const shadow = host.attachShadow({ mode: "open" });
    const box = document.createElement("div");
    box.style.cssText =
      "font: 12px/1.4 system-ui, sans-serif; white-space: pre; color: #fff; background: #222d; " +
      "padding: 6px 8px; border-radius: 6px; box-shadow: 0 2px 8px #0004;";
    shadow.append(box);
    document.documentElement.append(host);
    tip = { host, box };
    return tip;
  }

  function blockedAt(x, y) {
    for (const [el, text] of why) {
      if (!el.isConnected) {
        why.delete(el);
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return text;
    }
    return null;
  }

  let pointer = null;
  function onPointerMove(event) {
    const pending = pointer;
    pointer = { x: event.clientX, y: event.clientY };
    if (pending) return;
    requestAnimationFrame(() => {
      const { x, y } = pointer;
      pointer = null;
      const text = why.size ? blockedAt(x, y) : null;
      if (!text) {
        if (tip) tip.host.style.display = "none";
        return;
      }
      const { host, box } = tooltip();
      box.textContent = text;
      host.style.display = "block";
      const left = Math.min(x + 14, innerWidth - host.offsetWidth - 4);
      const top = y + 18 + host.offsetHeight > innerHeight ? y - host.offsetHeight - 8 : y + 18;
      host.style.left = `${Math.max(4, left)}px`;
      host.style.top = `${Math.max(4, top)}px`;
    });
  }

  // ---- <img>, including <picture> and srcset, via currentSrc ----

  async function checkImg(img) {
    if (!img.complete || !img.naturalWidth) return; // the load listener calls back
    const url = img.currentSrc || img.src;
    if (!url || checkedImg.get(img) === url) return;
    checkedImg.set(img, url);

    if (img.naturalWidth < minSide && img.naturalHeight < minSide) {
      img.dataset.veil = "allow";
      return;
    }
    img.dataset.veil = "pending";
    const result = await resultFor(url);
    if (checkedImg.get(img) !== url) return; // the source changed while we waited
    img.dataset.veil = result.verdict;
    describe(img, result);
  }

  function resetImg(img) {
    checkedImg.delete(img);
    delete img.dataset.veil;
    checkImg(img);
  }

  // ---- CSS background images ----

  function backgroundUrls(el) {
    // The pending/block rules override background-image, so read it without them.
    const mark = el.dataset.veilBg;
    if (mark && mark !== "allow") delete el.dataset.veilBg;
    const value = getComputedStyle(el).backgroundImage;
    if (mark) el.dataset.veilBg = mark;
    if (!value || value === "none") return [];
    return [...value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)].map((match) => match[2]);
  }

  async function checkBackground(el) {
    const urls = backgroundUrls(el);
    const key = urls.join("\n");
    if (checkedBg.get(el) === key) return;
    checkedBg.set(el, key);
    if (!urls.length) {
      delete el.dataset.veilBg;
      return;
    }

    el.dataset.veilBg = "pending";
    const results = await Promise.all(urls.map(resultFor));
    if (checkedBg.get(el) !== key) return;
    const result =
      results.find((r) => r.verdict === "block") ?? results.find((r) => r.verdict === "error") ?? results[0];
    el.dataset.veilBg = result.verdict;
    describe(el, result);
  }

  // ---- <video>: the poster, then the current frame every few seconds while it plays ----

  let videoInterval = 2;
  const videoStates = new WeakMap();
  const liveVideos = new Set();
  const frameCanvas = document.createElement("canvas");

  // The current frame as a JPEG data URL, "tainted" when the page isn't allowed to
  // read it (a cross-origin file without CORS), or null before there is a frame.
  function grabFrame(video) {
    if (video.readyState < 2 || !video.videoWidth) return null;
    const scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
    frameCanvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    frameCanvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    frameCanvas.getContext("2d").drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
    try {
      return frameCanvas.toDataURL("image/jpeg", 0.85);
    } catch {
      return "tainted";
    }
  }

  function applyVideo(video, state, result) {
    if (result.verdict === "allow") {
      state.safe += 1;
      // Once blocked, a video stays hidden until two checks in a row look fine.
      if (video.dataset.veil === "block" && state.safe < 2) return;
    } else {
      state.safe = 0;
      if (!state.counted) {
        state.counted = true;
        chrome.runtime.sendMessage({ type: "countVideo", verdict: result.verdict }).catch(() => {});
      }
    }
    video.dataset.veil = result.verdict;
    describe(video, result);
  }

  async function checkFrame(video, state) {
    if (state.busy) {
      state.again = true;
      return;
    }
    state.busy = true;
    state.lastCheck = performance.now();
    const src = video.currentSrc;
    try {
      const frame = grabFrame(video);
      if (!frame) return;
      const result =
        frame === "tainted"
          ? await ask({ type: "checkVideoAt", url: src, time: video.currentTime })
          : await ask({ type: "checkFrame", dataUrl: frame });
      if (video.currentSrc !== src) return;
      state.framesChecked = true;
      applyVideo(video, state, result);
    } finally {
      state.busy = false;
      if (state.again) {
        state.again = false;
        checkFrame(video, state);
      }
    }
  }

  async function checkPoster(video, state) {
    const poster = video.poster;
    if (!state || !poster || state.framesChecked) return;
    const result = await resultFor(poster);
    // Once there are frames, they decide.
    if (state.framesChecked || video.poster !== poster) return;
    video.dataset.veil = result.verdict;
    describe(video, result);
  }

  function trackVideo(video) {
    liveVideos.add(video);
    if (videoStates.has(video)) return;
    const state = { busy: false, again: false, lastCheck: 0, safe: 0, counted: false, framesChecked: false };
    videoStates.set(video, state);

    video.addEventListener("loadeddata", () => {
      // Keep the first frames hidden until one has been checked.
      if (!state.framesChecked) video.dataset.veil = "pending";
      checkFrame(video, state);
    });
    video.addEventListener("seeking", () => {
      if (video.dataset.veil === "allow") video.dataset.veil = "pending";
    });
    video.addEventListener("seeked", () => checkFrame(video, state));
    video.addEventListener("emptied", () => {
      delete video.dataset.veil;
      Object.assign(state, { safe: 0, framesChecked: false });
      checkPoster(video, state);
    });

    checkPoster(video, state);
    if (video.readyState >= 2) checkFrame(video, state);
  }

  setInterval(() => {
    const now = performance.now();
    for (const video of liveVideos) {
      if (!video.isConnected) {
        liveVideos.delete(video);
        continue;
      }
      const state = videoStates.get(video);
      const playing = !video.paused && !video.ended && video.readyState >= 2;
      if (playing && now - state.lastCheck >= videoInterval * 1000) checkFrame(video, state);
    }
  }, 250);

  // ---- Walking the DOM and watching it change ----

  function shadowRootOf(el) {
    // chrome.dom reaches closed shadow roots too.
    return chrome.dom?.openOrClosedShadowRoot?.(el) ?? el.shadowRoot;
  }

  function visit(el) {
    if (el.tagName === "IMG") checkImg(el);
    else if (el.tagName === "VIDEO") trackVideo(el);
    checkBackground(el);
    const shadow = shadowRootOf(el);
    if (shadow) watch(shadow);
  }

  function scan(root) {
    if (root.nodeType === Node.ELEMENT_NODE) visit(root);
    for (const el of root.querySelectorAll("*")) visit(el);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) scan(node);
        }
      } else if (mutation.target.tagName === "IMG" && (mutation.attributeName === "src" || mutation.attributeName === "srcset")) {
        resetImg(mutation.target);
      } else if (mutation.target.tagName === "VIDEO" && mutation.attributeName === "poster") {
        checkPoster(mutation.target, videoStates.get(mutation.target));
      } else if (mutation.attributeName === "style" || mutation.attributeName === "class") {
        checkBackground(mutation.target);
      }
    }
  });

  function onLoad(event) {
    const target = event.target;
    if (target.tagName === "IMG") checkImg(target);
    // A stylesheet that just arrived can add background images to anything.
    else if (target.tagName === "LINK" || target.tagName === "STYLE") rescanSoon();
  }

  function watch(root) {
    if (watchedRoots.has(root)) return;
    watchedRoots.add(root);
    if (root instanceof ShadowRoot) {
      const style = document.createElement("style");
      style.textContent = SHADOW_CSS;
      root.append(style);
    }
    // load doesn't bubble or leave a shadow root, so listen on each root, capturing.
    root.addEventListener("load", onLoad, true);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset", "poster", "style", "class"],
    });
    scan(root);
  }

  let rescanQueued = false;
  function rescanSoon() {
    if (rescanQueued) return;
    rescanQueued = true;
    requestAnimationFrame(() => {
      rescanQueued = false;
      scan(document);
    });
  }

  async function start() {
    let hello;
    try {
      hello = await chrome.runtime.sendMessage({ type: "hello" });
    } catch {
      hello = { active: true };
    }
    if (!hello?.active) {
      document.documentElement.setAttribute("data-veil-off", "");
      return;
    }
    minSide = hello.minSide ?? minSide;
    videoInterval = hello.videoInterval ?? videoInterval;
    watch(document);
    document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
    document.addEventListener("scroll", () => tip && (tip.host.style.display = "none"), { capture: true, passive: true });
    document.addEventListener("DOMContentLoaded", rescanSoon);
    window.addEventListener("load", rescanSoon);
  }

  start();
})();
