import { createHash } from "node:crypto";
import { run } from "../process.ts";

export type ZellijSessionState = "missing" | "active" | "exited";

export function sessionNameForSlug(slug: string): string {
  if (!slug.includes("/")) {
    return `gertrude__${slug}`;
  }

  const readable = slug.replace(/[^A-Za-z0-9._-]+/g, "__").replace(/__+/g, "__");
  const hash = createHash("sha1").update(slug).digest("hex").slice(0, 8);
  return `gertrude__${readable}-${hash}`;
}

export function zellijSessionStateFromList(listSessionsOutput: string, sessionName: string): ZellijSessionState {
  const line = listSessionsOutput
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate === sessionName || candidate.startsWith(`${sessionName} [`));

  if (!line) {
    return "missing";
  }

  return line.includes("(EXITED") ? "exited" : "active";
}

export function zellijSessionState(sessionName: string): ZellijSessionState {
  const result = run("zellij", ["list-sessions", "--no-formatting"], { allowFailure: true });
  if (result.status !== 0) {
    return "missing";
  }

  return zellijSessionStateFromList(result.stdout, sessionName);
}

export function deleteZellijSession(sessionName: string): void {
  run("zellij", ["delete-session", "--force", sessionName]);
}
