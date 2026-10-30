import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";
import { resolveTarget, type Offer } from "./model";

const exec = promisify(execFile);
export type Runner = (file: string, args: string[]) => Promise<string>;
const run: Runner = async (file, args) => (await exec(file, args, { timeout: 15_000, maxBuffer: 64 * 1024 })).stdout.trim();

// No target is interpolated into shell or AppleScript source. This fixed query
// discovers the default HTTP browser without activating it or visiting a URL.
export const browserQuery = 'ObjC.import("AppKit"); $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString("https://example.com")).path.js';

export async function openOffer(item: Offer, options: { run?: Runner; platform?: string; hostname?: string } = {}) {
  if ((options.platform ?? process.platform) !== "darwin") throw new Error("This opener currently supports macOS only.");
  const localHost = options.hostname ?? hostname();
  if (item.kind !== "url" && item.hostname !== localHost) throw new Error("This file belongs to another machine. Download it locally before opening it.");
  const resolved = await resolveTarget(item.target, "/");
  if (resolved.kind !== item.kind || resolved.destination !== item.destination) throw new Error("The offered target changed. Ask the agent to offer it again.");
  const execute = options.run ?? run;
  if (resolved.kind === "url") {
    const host = new URL(resolved.target).hostname;
    if (item.hostname !== localHost && ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(host)) throw new Error("This link points to a different machine's localhost. Forward its port or use a reachable URL first.");
  }
  if (resolved.kind === "file" && resolved.destination === "browser") {
    const browser = await execute("/usr/bin/osascript", ["-l", "JavaScript", "-e", browserQuery]);
    if (!isAbsolute(browser) || !browser.endsWith(".app")) throw new Error("Could not find your default browser.");
    await execute("/usr/bin/open", ["-a", browser, "--", resolved.target]);
  } else if (resolved.destination === "preview") {
    await execute("/usr/bin/open", ["-a", "Preview", "--", resolved.target]);
  } else {
    await execute("/usr/bin/open", ["--", resolved.target]);
  }
}
