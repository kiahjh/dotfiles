import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { taskDatabaseNames } from "./gt-src/databases.ts";

const scripts = import.meta.dir;

test("support DB entry point uses its own stable database name", () => {
  const name = execFileSync(join(scripts, "gt-support-db"), ["--name"], { encoding: "utf8" }).trim();
  expect(name).toBe(taskDatabaseNames("support").databaseName);
});

test("support DB refresh runs every 30 minutes without an immediate reload run", () => {
  const plist = join(scripts, "..", "..", "Library", "LaunchAgents", "com.miciah.gt-support-db-refresh.plist");
  const interval = execFileSync("plutil", ["-extract", "StartInterval", "raw", "-o", "-", plist], {
    encoding: "utf8",
  }).trim();
  expect(interval).toBe("1800");
  const xml = readFileSync(plist, "utf8");
  expect(xml).not.toContain("<key>StartCalendarInterval</key>");
  expect(xml).not.toContain("<key>RunAtLoad</key>");
});

test("support code refresh refuses to overwrite modified tracked files", () => {
  const temp = mkdtempSync(join(tmpdir(), "gt-support-test-"));
  try {
    const support = join(temp, "support");
    const code = join(support, "gertrude");
    mkdirSync(support);
    execFileSync("git", ["init", "-q", "-b", "master", support]);
    execFileSync("git", ["init", "-q", "-b", "master", code]);
    const git = (...args: string[]) => execFileSync("git", ["-C", code, ...args]);
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    git("remote", "add", "origin", "https://github.com/gertrude-app/gertrude.git");
    writeFileSync(join(code, "tracked.txt"), "original\n");
    git("add", "tracked.txt");
    git("commit", "-qm", "initial");
    writeFileSync(join(code, "tracked.txt"), "unsaved work\n");

    const result = spawnSync(join(scripts, "gt-refresh-support"), ["code"], {
      encoding: "utf8",
      env: { ...process.env, SUPPORT_DIR: support, SUPPORT_LOCK_DIR: temp },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to reset modified tracked files");
    expect(git("diff", "--", "tracked.txt").toString()).toContain("unsaved work");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
