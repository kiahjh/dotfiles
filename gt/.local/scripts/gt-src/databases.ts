import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { run } from "./process.ts";
import { downloadScrubbedDump } from "./scrubbed-dump.ts";

export type TaskDatabaseNames = {
  databaseName: string;
  testDatabaseName: string;
};

export function taskDatabaseNames(slug: string): TaskDatabaseNames {
  const hash = createHash("sha1").update(slug).digest("hex").slice(0, 8);
  const sanitized = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "task";
  const maxStemLength = 46;
  const stem = sanitized.slice(0, maxStemLength).replace(/_+$/g, "") || "task";
  const databaseName = `gt_${stem}_${hash}`;
  return {
    databaseName,
    testDatabaseName: `${databaseName}_test`,
  };
}

export function dropDatabaseIfExists(databaseName: string): void {
  run("dropdb", ["--if-exists", databaseName], { allowFailure: true });
}

function createEmptyDatabase(databaseName: string): void {
  run("createdb", [databaseName]);
}

export const LOCAL_RESTORE_SQL_FILTER = [
  // Newer pg_dump versions emit \\restrict/\\unrestrict meta-commands that older local psql
  // clients do not understand. They are safety markers, so stripping them is fine for restore.
  "/^\\\\restrict /d",
  "/^\\\\unrestrict /d",
  // Production may run on a newer Postgres than local development machines.
  "/^SET transaction_timeout = /d",
  // The local restore user owns recreated objects; production ownership and role grants are not needed.
  "/ OWNER TO /d",
  "/^ALTER DEFAULT PRIVILEGES.* FOR ROLE /d",
  "/^GRANT .* TO PUBLIC;$/!{/^GRANT /d;}",
  "/^REVOKE .* FROM PUBLIC;$/!{/^REVOKE /d;}",
  // Production-only login event triggers fail on local Postgres versions/configurations.
  "/^CREATE EVENT TRIGGER .* ON login/d",
  "/EXECUTE FUNCTION public.set_search_path_on_login()/d",
  "/^ALTER EVENT TRIGGER /d",
].join(";");

function restoreDumpIntoDatabase(dumpPath: string, databaseName: string): void {
  run(
    "/bin/sh",
    [
      "-c",
      `gunzip -c "$1" | sed '${LOCAL_RESTORE_SQL_FILTER}' | psql --quiet --set ON_ERROR_STOP=1 "$2"`,
      "sh",
      dumpPath,
      databaseName,
    ],
    { inherit: true },
  );
}

function createDatabaseFromTemplate(templateDatabaseName: string, databaseName: string): void {
  run("createdb", ["--template", templateDatabaseName, databaseName]);
}

export async function setupTaskDatabases(slug: string): Promise<TaskDatabaseNames> {
  const names = taskDatabaseNames(slug);
  const dir = mkdtempSync(join(tmpdir(), "gt-scrubbed-db-"));
  const dumpPath = join(dir, "latest.sql.gz");

  try {
    console.log("Downloading scrubbed production database dump...");
    await downloadScrubbedDump(dumpPath);

    console.log(`Creating local Postgres database ${names.databaseName}`);
    dropDatabaseIfExists(names.testDatabaseName);
    dropDatabaseIfExists(names.databaseName);
    createEmptyDatabase(names.databaseName);
    restoreDumpIntoDatabase(dumpPath, names.databaseName);

    console.log(`Creating local Postgres test database ${names.testDatabaseName}`);
    createDatabaseFromTemplate(names.databaseName, names.testDatabaseName);

    return names;
  } catch (error) {
    dropDatabaseIfExists(names.testDatabaseName);
    dropDatabaseIfExists(names.databaseName);
    throw error;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
