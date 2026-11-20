import { siteOf, withDefaults } from "./policy.js";

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const site = siteOf(tab?.url ?? "");
const { settings: stored } = await chrome.storage.local.get("settings");
const settings = withDefaults(stored);
const stats = await chrome.runtime.sendMessage({ type: "tabStats", tabId: tab?.id });

document.getElementById("site").textContent = site || "This page";
document.getElementById("stats").textContent =
  `${stats.blocked} of ${stats.checked} images hidden on this page.`;

const warning = document.getElementById("warning");
if (!settings.apiKey) {
  warning.textContent = "Add a TypeSafe API key in Options. Until then every image stays hidden.";
  warning.hidden = false;
} else if (stats.lastError) {
  warning.textContent = `Last error: ${stats.lastError}`;
  warning.hidden = false;
}

const paused = document.getElementById("paused");
paused.checked = settings.pausedSites.includes(site);
paused.disabled = !site;
paused.addEventListener("change", async () => {
  const sites = new Set(settings.pausedSites);
  if (paused.checked) sites.add(site);
  else sites.delete(site);
  await chrome.storage.local.set({ settings: { ...settings, pausedSites: [...sites] } });
  chrome.tabs.reload(tab.id);
  window.close();
});

document.getElementById("options").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});
