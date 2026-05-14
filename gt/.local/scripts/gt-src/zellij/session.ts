import { createHash } from "node:crypto";
import { run } from "../process.ts";

export type ZellijSessionState = "missing" | "active" | "exited";

const ZELLIJ_SESSION_NAME_MAX_LENGTH = 36;
const ZELLIJ_SESSION_PREFIX = "gertrude__";

function compactSessionStem(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, "__")
    .replace(/__+/g, "__")
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "") || "task";
}

export function sessionNameForSlug(slug: string): string {
  const stem = compactSessionStem(slug);
  const hash = createHash("sha1").update(slug).digest("hex").slice(0, 8);
  const suffix = slug.includes("/") ? `-${hash}` : "";
  const fullName = `${ZELLIJ_SESSION_PREFIX}${stem}${suffix}`;

  // zellij 0.43 hangs when `attach --create-background` is given long session
  // names. Keep generated names short while preserving old names when safe.
  if (fullName.length <= ZELLIJ_SESSION_NAME_MAX_LENGTH) {
    return fullName;
  }

  const hashedSuffix = `-${hash}`;
  const maxStemLength = ZELLIJ_SESSION_NAME_MAX_LENGTH - ZELLIJ_SESSION_PREFIX.length - hashedSuffix.length;
  const compactStem =
    stem
      .slice(0, maxStemLength)
      .replace(/[^A-Za-z0-9]+$/g, "") || "task";

  return `${ZELLIJ_SESSION_PREFIX}${compactStem}${hashedSuffix}`;
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
