import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../process.ts";

export type ZellijSessionState = "missing" | "active" | "exited";

const ZELLIJ_SESSION_NAME_PREFERRED_MAX_LENGTH = 36;
const ZELLIJ_SESSION_PREFIX = "gertrude__";
const ZELLIJ_COMPACT_SESSION_PREFIX = "gt__";
const ZELLIJ_CONSERVATIVE_CONTRACT_DIR = "contract_version_999";

function compactSessionStem(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, "__")
    .replace(/__+/g, "__")
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "") || "task";
}

function currentUid(): string {
  return typeof process.getuid === "function" ? String(process.getuid()) : (process.env.UID ?? "0");
}

function zellijSocketBaseDir(): string {
  if (process.env.ZELLIJ_SOCKET_DIR) {
    return process.env.ZELLIJ_SOCKET_DIR;
  }

  if (process.platform !== "darwin" && process.env.XDG_RUNTIME_DIR) {
    return process.env.XDG_RUNTIME_DIR;
  }

  return join(tmpdir(), `zellij-${currentUid()}`);
}

export function zellijSessionNameMaxLength(): number {
  const override = Number.parseInt(process.env.GT_ZELLIJ_SESSION_NAME_MAX_LENGTH ?? "", 10);
  if (Number.isFinite(override) && override > 0) {
    return override;
  }

  if (process.platform === "win32") {
    return ZELLIJ_SESSION_NAME_PREFERRED_MAX_LENGTH;
  }

  const socketPathMaxLength = process.platform === "darwin" ? 104 : 108;
  const socketDir = join(zellijSocketBaseDir(), ZELLIJ_CONSERVATIVE_CONTRACT_DIR);

  // zellij validates the full Unix-domain socket path, including
  // `<socket-dir>/<session-name>`, and the path must be strictly shorter than
  // the platform limit. macOS' default TMPDIR is long, so the practical session
  // name limit can be much lower than the old 36-character gt cap.
  const maxSessionNameLength = socketPathMaxLength - Buffer.byteLength(socketDir) - 2;
  return Math.max(1, Math.min(ZELLIJ_SESSION_NAME_PREFERRED_MAX_LENGTH, maxSessionNameLength));
}

function hashedSessionName(prefix: string, stem: string, hash: string, maxLength: number): string {
  const hashedSuffix = `-${hash}`;
  const maxStemLength = maxLength - prefix.length - hashedSuffix.length;

  if (maxStemLength <= 0) {
    const hashOnlyName = `${prefix}${hash}`;
    return hashOnlyName.length <= maxLength ? hashOnlyName : hash.slice(0, maxLength);
  }

  const compactStem =
    stem
      .slice(0, maxStemLength)
      .replace(/[^A-Za-z0-9]+$/g, "") || "task";

  const name = `${prefix}${compactStem}${hashedSuffix}`;
  return name.length <= maxLength ? name : hash.slice(0, maxLength);
}

export function sessionNameForSlug(slug: string, maxLength = zellijSessionNameMaxLength()): string {
  const stem = compactSessionStem(slug);
  const hash = createHash("sha1").update(slug).digest("hex").slice(0, 8);
  const suffix = slug.includes("/") ? `-${hash}` : "";
  const fullName = `${ZELLIJ_SESSION_PREFIX}${stem}${suffix}`;

  // zellij 0.43 hangs when `attach --create-background` is given long session
  // names. Keep generated names short while preserving old names when safe.
  if (fullName.length <= maxLength) {
    return fullName;
  }

  const prefix = maxLength >= ZELLIJ_SESSION_NAME_PREFERRED_MAX_LENGTH
    ? ZELLIJ_SESSION_PREFIX
    : ZELLIJ_COMPACT_SESSION_PREFIX;
  const compactName = `${prefix}${stem}${suffix}`;
  if (compactName.length <= maxLength) {
    return compactName;
  }

  return hashedSessionName(prefix, stem, hash, maxLength);
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
