import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Destination = "browser" | "preview" | "default";
export type Offer = {
  id: string;
  sessionID: string;
  label: string;
  target: string;
  kind: "url" | "file" | "directory";
  destination: Destination;
  hostname: string;
};

export const offerSchema = {
  type: "object",
  properties: {
    id: { type: "string" }, sessionID: { type: "string" }, label: { type: "string" },
    target: { type: "string" }, kind: { type: "string", enum: ["url", "file", "directory"] },
    destination: { type: "string", enum: ["browser", "preview", "default"] }, hostname: { type: "string" },
  },
  required: ["id", "sessionID", "label", "target", "kind", "destination", "hostname"],
  additionalProperties: false,
};

const unsafeText = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
const browser = new Set([".html", ".htm", ".svg"]);
const preview = new Set([".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".avif", ".ico"]);
const documents = new Set([".txt", ".md", ".markdown", ".json", ".csv", ".tsv", ".log", ".rtf"]);
const applications = /\.(app|bundle|workflow|scptd|plugin|prefpane)$/i;

export function displayLabel(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").trim().slice(0, 120);
}

export function isOffer(value: unknown): value is Offer {
  if (!value || typeof value !== "object") return false;
  const item = value as Offer;
  return [item.id, item.sessionID, item.label, item.target, item.hostname].every((part) => typeof part === "string") &&
    ["url", "file", "directory"].includes(item.kind) && ["browser", "preview", "default"].includes(item.destination);
}

// Used both when offering and immediately before opening. Never trust a saved
// extension, a symlink, or a destination supplied by the model.
export async function resolveTarget(target: string, directory: string) {
  if (!target || target.length > 8192 || unsafeText.test(target)) throw new Error("Supply a file path or an HTTP(S) URL without control characters.");
  if (/^https?:/i.test(target)) {
    const url = new URL(target);
    if (!url.hostname || url.username || url.password) throw new Error("URLs must have a host and must not contain credentials.");
    return { target: url.href, kind: "url" as const, destination: "browser" as const, label: url.hostname };
  }
  let path = target;
  if (/^file:/i.test(path)) path = fileURLToPath(path);
  else if (/^[a-z][a-z\d+.-]*:/i.test(path)) throw new Error("Only HTTP(S) URLs and local files are supported.");
  if (path === "~") path = homedir();
  else if (path.startsWith("~/")) path = resolve(homedir(), path.slice(2));
  path = await realpath(resolve(directory, path));
  if (unsafeText.test(path) || applications.test(path)) throw new Error("Applications and executable bundles cannot be offered.");
  const info = await stat(path);
  if (info.isDirectory()) return { target: path, kind: "directory" as const, destination: "default" as const, label: basename(path) };
  if (!info.isFile() || (info.mode & 0o111) !== 0) throw new Error("Only ordinary, non-executable files and folders can be offered.");
  const extension = extname(path).toLowerCase();
  const destination: Destination = browser.has(extension) ? "browser" : preview.has(extension) ? "preview" : "default";
  if (destination === "default" && !documents.has(extension)) throw new Error("Unsupported file type. Offer HTML, an image, PDF, text document, or folder—not a script, app, or installer.");
  return { target: path, kind: "file" as const, destination, label: basename(path) };
}

export function openLabel(item: Offer): string {
  return item.destination === "browser" ? "Open in browser" : item.destination === "preview" ? "Open in Preview" : item.kind === "directory" ? "Open in Finder" : "Open";
}
