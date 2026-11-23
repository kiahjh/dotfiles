import { CATEGORIES, PRICE_PER_MTOK, withDefaults } from "./policy.js";

const form = document.getElementById("form");

for (const [id, category] of Object.entries(CATEGORIES)) {
  const label = document.createElement("label");
  label.className = "row";
  label.innerHTML = `<input type="checkbox" name="category.${id}"> `;
  label.append(category.label);
  document.getElementById("categories").append(label);
}

async function load() {
  const { settings: stored, usage = { tokens: 0, images: 0 } } = await chrome.storage.local.get(["settings", "usage"]);
  const settings = withDefaults(stored);
  form.apiKey.value = settings.apiKey;
  form.model.value = settings.model;
  form.extraRules.value = settings.extraRules;
  form.threshold.value = settings.threshold;
  form.failClosed.checked = settings.failClosed;
  form.menExempt.checked = settings.menExempt;
  form.minSide.value = settings.minSide;
  form.videoInterval.value = settings.videoInterval;
  form.pausedSites.value = settings.pausedSites.join("\n");
  for (const id of Object.keys(CATEGORIES)) form[`category.${id}`].checked = settings.categories[id];

  const cost = (usage.tokens / 1e6) * PRICE_PER_MTOK;
  const perImage = usage.images ? Math.round(usage.tokens / usage.images) : 0;
  document.getElementById("usage").textContent =
    `${usage.images.toLocaleString()} images checked, ${usage.tokens.toLocaleString()} input tokens ` +
    `(about ${perImage} per image), about $${cost.toFixed(4)} at $${PRICE_PER_MTOK} per million tokens.`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const { settings: stored } = await chrome.storage.local.get("settings");
  const categories = {};
  for (const id of Object.keys(CATEGORIES)) categories[id] = form[`category.${id}`].checked;
  const settings = {
    ...withDefaults(stored),
    apiKey: form.apiKey.value.trim(),
    model: form.model.value.trim() || "jev-latest",
    extraRules: form.extraRules.value,
    threshold: Math.min(0.99, Math.max(0.01, Number(form.threshold.value) || 0.25)),
    failClosed: form.failClosed.checked,
    menExempt: form.menExempt.checked,
    minSide: Math.max(0, Number(form.minSide.value) || 0),
    videoInterval: Math.min(30, Math.max(0.5, Number(form.videoInterval.value) || 2)),
    pausedSites: form.pausedSites.value.split("\n").map((site) => site.trim()).filter(Boolean),
    categories,
  };
  await chrome.storage.local.set({ settings });
  document.getElementById("saved").textContent = "Saved. Reload open tabs to apply.";
});

document.getElementById("clear").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "clearCache" });
  document.getElementById("cleared").textContent = "Cleared.";
});

load();
