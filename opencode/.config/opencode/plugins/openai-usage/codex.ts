import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { parseCodexUsage, record, type Usage } from "./usage";

function codexExecutable(): string {
  // Desktop-launched OpenCode may not inherit the shell's PATH.
  const local = join(homedir(), ".local", "bin", "codex");
  return existsSync(local) ? local : "codex";
}

// Ask Codex itself so it owns credential storage, refresh, and account routing.
// No threads, model calls, login changes, or reset redemption are requested.
export function readCodexUsage(signal: AbortSignal): Promise<Usage> {
  if (signal.aborted) return Promise.reject(new Error("Codex usage lookup cancelled."));
  return new Promise((resolve, reject) => {
    const child = spawn(codexExecutable(), ["app-server", "--stdio"], {
      cwd: homedir(), stdio: ["pipe", "pipe", "ignore"],
    });
    const lines = createInterface({ input: child.stdout });
    let settled = false;
    let initialized = false;
    const timer = setTimeout(() => finish(new Error("Codex usage lookup timed out.")), 20_000);
    const abort = () => finish(new Error("Codex usage lookup cancelled."));

    function finish(error?: Error, usage?: Usage) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      lines.close();
      child.stdin.end();
      child.kill();
      // Do not leave an unresponsive app-server process behind.
      if (child.exitCode === null && child.signalCode === null) {
        const kill = setTimeout(() => child.kill("SIGKILL"), 2000);
        kill.unref();
        child.once("exit", () => clearTimeout(kill));
      }
      if (error) reject(error);
      else resolve(usage!);
    }

    function send(message: object) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    child.on("error", () => finish(new Error("Cannot start Codex. Install Codex and run codex login.")));
    child.stdin.on("error", () => finish(new Error("Could not communicate with Codex.")));
    child.on("exit", () => finish(new Error("Codex exited before returning usage.")));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    lines.on("line", (line) => {
      if (settled) return;
      try {
        const message: unknown = JSON.parse(line);
        if (!record(message)) return;
        if (message.id === 1 && !initialized) {
          if (message.error) { finish(new Error("Codex could not initialize its usage reader.")); return; }
          initialized = true;
          send({ method: "initialized" });
          send({ id: 2, method: "account/rateLimits/read" });
        } else if (message.id === 2 && initialized) {
          if (message.error) {
            finish(new Error("Codex could not read subscription usage. Check codex login status."));
            return;
          }
          finish(undefined, parseCodexUsage(message.result));
        }
      } catch {
        finish(new Error("Codex returned an unrecognized usage response."));
      }
    });
    send({
      id: 1, method: "initialize",
      params: { clientInfo: { name: "opencode_usage", version: "1.0.0" }, capabilities: null },
    });
  });
}
