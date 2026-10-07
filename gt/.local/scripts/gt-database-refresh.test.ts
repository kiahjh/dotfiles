import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { taskDatabaseNames } from "./gt-src/databases.ts";

const names = taskDatabaseNames("refresh-regression");

function withRefresh(
  options: { downloadFailure?: boolean; invalidArchive?: boolean; restoreFailure?: boolean; localDump?: "valid" | "missing" } = {},
  check: (result: ReturnType<typeof spawnSync>, dir: string) => void,
): void {
  const dir = mkdtempSync(join(tmpdir(), "gt-refresh-regression-"));
  try {
    const bin = join(dir, "bin");
    const state = join(dir, "databases");
    mkdirSync(bin);
    mkdirSync(state);
    for (const name of [names.databaseName, names.testDatabaseName]) {
      writeFileSync(join(state, name), "previous snapshot\n");
    }
    const fixture = join(dir, "fixture.sql.gz");
    writeFileSync(fixture, options.invalidArchive ? "truncated archive" : gzipSync("SELECT 1;\n"));
    const stub = (name: string, body: string) => writeFileSync(join(bin, name), `#!/bin/bash\nset -eu\n${body}\n`, { mode: 0o755 });
    stub("curl", `
printf '%s\\n' "$@" > "$TEST_DIR/curl-args"
cat > "$TEST_DIR/curl-config"
if [[ "$DOWNLOAD_FAILURE" == 1 ]]; then
  echo 'curl: (56) Recv failure: Connection reset by peer' >&2
  exit 56
fi
while [[ $# -gt 0 ]]; do
  if [[ "$1" == --output ]]; then cp "$FIXTURE" "$2"; exit 0; fi
  shift
done
exit 2`);
    stub("dropdb", `
printf 'dropdb %s\\n' "$*" >> "$TEST_DIR/calls"
for name in "$@"; do :; done
rm -f "$TEST_DIR/databases/$name"`);
    stub("createdb", `
printf 'createdb %s\\n' "$*" >> "$TEST_DIR/calls"
for name in "$@"; do :; done
printf 'new snapshot\\n' > "$TEST_DIR/databases/$name"`);
    stub("psql", `
printf 'psql %s\\n' "$*" >> "$TEST_DIR/calls"
cat > "$TEST_DIR/restored-sql"
if [[ "$RESTORE_FAILURE" == 1 ]]; then echo 'simulated SQL restore failure' >&2; exit 1; fi`);
    const driver = join(dir, "driver.ts");
    writeFileSync(driver, `import { setupTaskDatabases } from ${JSON.stringify(join(import.meta.dir, "gt-src/databases.ts"))};\ntry { await setupTaskDatabases('refresh-regression'); } catch (error) { console.error(String(error)); process.exitCode = 1; }\n`);
    const result = spawnSync(process.execPath, [driver], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        // No real database or credentials are involved, even if a stub is missing.
        PGHOST: join(dir, "no-postgres-here"),
        GT_SECRETS_FILE: join(dir, "no-secrets-here"),
        GT_SCRUBBED_DUMPS_ACCESS_KEY_ID: "FAKE_TEST_ACCESS_KEY",
        GT_SCRUBBED_DUMPS_SECRET_ACCESS_KEY: "FAKE_TEST_SECRET_KEY",
        GT_SCRUBBED_DUMP_PATH: options.localDump === "valid" ? fixture : options.localDump === "missing" ? join(dir, "missing.gz") : "",
        TEST_DIR: dir,
        FIXTURE: fixture,
        DOWNLOAD_FAILURE: options.downloadFailure ? "1" : "0",
        RESTORE_FAILURE: options.restoreFailure ? "1" : "0",
      },
    });
    check(result, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function expectPreviousSnapshot(dir: string): void {
  for (const name of [names.databaseName, names.testDatabaseName]) {
    expect(readFileSync(join(dir, "databases", name), "utf8")).toBe("previous snapshot\n");
  }
  expect(existsSync(join(dir, "calls"))).toBe(false);
}

test("failed download preserves existing support and test databases", () => {
  withRefresh({ downloadFailure: true }, (result, dir) => {
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Connection reset by peer");
    expectPreviousSnapshot(dir);
    expect(result.stderr).not.toContain("FAKE_TEST_ACCESS_KEY");
    expect(result.stderr).not.toContain("Authorization");
  });
});

test("invalid gzip download preserves existing databases before restoration", () => {
  withRefresh({ invalidArchive: true }, (result, dir) => {
    expect(result.status).toBe(1);
    expectPreviousSnapshot(dir);
  });
});

test("missing local dump override preserves existing databases", () => {
  withRefresh({ localDump: "missing" }, (result, dir) => {
    expect(result.status).toBe(1);
    expectPreviousSnapshot(dir);
    expect(existsSync(join(dir, "curl-args"))).toBe(false);
  });
});

test("valid curl download restores both databases with bounded retries and private headers", () => {
  withRefresh({}, (result, dir) => {
    expect(result.status).toBe(0);
    const args = readFileSync(join(dir, "curl-args"), "utf8").trim().split("\n");
    expect(args[0]).toBe("--disable");
    for (const [flag, value] of [["--config", "-"], ["--retry", "2"], ["--retry-max-time", "600"], ["--max-time", "180"], ["--connect-timeout", "20"]]) {
      expect(args[args.indexOf(flag) + 1]).toBe(value);
    }
    expect(args).toContain("--fail");
    expect(args).toContain("--retry-all-errors");
    expect(args.join(" ")).not.toContain("FAKE_TEST_ACCESS_KEY");
    expect(args.join(" ")).not.toContain("authorization");
    expect(args).not.toContain("--location");
    const config = readFileSync(join(dir, "curl-config"), "utf8");
    expect(config).toContain("header = \"authorization: AWS4-HMAC-SHA256 Credential=FAKE_TEST_ACCESS_KEY/");
    expect(config).toContain("x-amz-date:");
    const calls = readFileSync(join(dir, "calls"), "utf8").trim().split("\n");
    expect(calls).toEqual([
      `dropdb --if-exists ${names.testDatabaseName}`,
      `dropdb --if-exists ${names.databaseName}`,
      `createdb ${names.databaseName}`,
      `psql --quiet --set ON_ERROR_STOP=1 ${names.databaseName}`,
      `createdb --template ${names.databaseName} ${names.testDatabaseName}`,
    ]);
    expect(readFileSync(join(dir, "restored-sql"), "utf8")).toBe("SELECT 1;\n");
    for (const name of [names.databaseName, names.testDatabaseName]) {
      expect(readFileSync(join(dir, "databases", name), "utf8")).toBe("new snapshot\n");
    }
  });
});

test("valid local dump override still restores without curl or credentials", () => {
  withRefresh({ localDump: "valid" }, (result, dir) => {
    expect(result.status).toBe(0);
    expect(existsSync(join(dir, "curl-args"))).toBe(false);
    expect(readFileSync(join(dir, "databases", names.testDatabaseName), "utf8")).toBe("new snapshot\n");
  });
});

test("failed SQL restore cleans up partial databases after replacement starts", () => {
  withRefresh({ restoreFailure: true }, (result, dir) => {
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("simulated SQL restore failure");
    expect(existsSync(join(dir, "databases", names.databaseName))).toBe(false);
    expect(existsSync(join(dir, "databases", names.testDatabaseName))).toBe(false);
    const calls = readFileSync(join(dir, "calls"), "utf8").trim().split("\n");
    expect(calls.slice(-2)).toEqual([
      `dropdb --if-exists ${names.testDatabaseName}`,
      `dropdb --if-exists ${names.databaseName}`,
    ]);
  });
});
