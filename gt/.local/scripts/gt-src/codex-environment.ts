import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { GT_PACKAGE_DIR } from "./constants.ts";
import { gtStateDir } from "./codex-state.ts";
import { fail, GtError } from "./errors.ts";
import { getGitRoot, gitOutput } from "./git.ts";
import { withResourceLockSync } from "./resource-lock.ts";

const backupPath = join(GT_PACKAGE_DIR, ".config", "gt", "codex-environments", "gertrude.toml");
const ignoreRule = "/.codex/environments/";

function readEnvironment(path: string): Buffer {
  if (!existsSync(path)) fail(`missing environment config: ${path}`);
  const data = readFileSync(path);
  if (!data.toString("utf8").trim()) fail(`empty environment config: ${path}`);
  try {
    Bun.TOML.parse(data.toString("utf8"));
  } catch {
    fail(`invalid TOML environment config: ${path}`);
  }
  return data;
}

function writeCopy(path: string, data: Buffer): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, data, { flag: "wx", mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function ignoreEnvironment(repository: string): void {
  const tracked = gitOutput(repository, ["ls-files", "--", ".codex/environments"]);
  if (tracked) fail("this repository already tracks an environment config; a local ignore cannot hide tracked files");
  const path = gitOutput(repository, ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"]);
  const previous = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (previous.split(/\r?\n/).some((line) => line.trim() === ignoreRule)) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${previous && !previous.endsWith("\n") ? "\n" : ""}${ignoreRule}\n`, { mode: 0o600 });
}

function manageEnvironment(command: "backup" | "restore", repository: string): void {
  const livePath = join(repository, ".codex", "environments", "environment.toml");
  withResourceLockSync(join(gtStateDir(), "locks", "codex-environment.lock"), () => {
    if (command === "backup") {
      const data = readEnvironment(livePath);
      if (!existsSync(backupPath) || !readFileSync(backupPath).equals(data)) writeCopy(backupPath, data);
      ignoreEnvironment(repository);
      console.log(`Backed up Gertrude environment: ${backupPath}`);
    } else {
      const data = readEnvironment(backupPath);
      ignoreEnvironment(repository);
      if (existsSync(livePath)) {
        const previous = readFileSync(livePath);
        if (!previous.equals(data)) {
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          const history = join(gtStateDir(), "environment-backups", `gertrude-${stamp}-${randomUUID().slice(0, 8)}.toml`);
          writeCopy(history, previous);
          console.log(`Saved previous environment: ${history}`);
          writeCopy(livePath, data);
        }
      } else writeCopy(livePath, data);
      console.log(`Restored Gertrude environment: ${livePath}`);
    }
  });
}

if (import.meta.main) {
  try {
    const [command, argument, ...extra] = process.argv.slice(2);
    if (command === "--help" || command === "-h") {
      console.log("usage: codex-gertrude-environment backup|restore [repository-path]\nDefaults to ~/codex-projects/gertrude.\nBackup saves your current environment into dotfiles. Restore installs a regular copy and saves any config it replaces.\nBoth commands configure the repository's personal Git ignore.");
    } else {
      if ((command !== "backup" && command !== "restore") || extra.length || argument?.startsWith("-")) {
        fail("usage: codex-gertrude-environment backup|restore [repository-path]");
      }
      const repository = getGitRoot(resolve(argument || join(homedir(), "codex-projects", "gertrude")));
      manageEnvironment(command, repository);
    }
  } catch (error) {
    if (error instanceof GtError) console.error(`codex-gertrude-environment: ${error.message}`);
    else console.error(error);
    process.exit(1);
  }
}
