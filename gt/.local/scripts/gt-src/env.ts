import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ENV_TEMPLATE_PATH } from "./constants.ts";
import { taskDatabaseNames, type TaskDatabaseNames } from "./databases.ts";
import { dotenvValue } from "./dotenv.ts";
import { fail } from "./errors.ts";
import { currentSystemUser } from "./process.ts";

export type TaskEnvValues = TaskDatabaseNames & {
  databaseUsername: string;
  databasePassword: string;
};

export function renderTaskEnv(template: string, values: TaskEnvValues): string {
  const replacements: Record<string, string> = {
    DATABASE_USERNAME: values.databaseUsername,
    DATABASE_PASSWORD: values.databasePassword,
    DATABASE_NAME: values.databaseName,
    TEST_DATABASE_NAME: values.testDatabaseName,
  };
  const unknownChangemeKeys = new Set<string>();

  const rendered = template
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
      if (!match) {
        return line;
      }

      const [, prefix, key, separator, rawValue] = match;
      if (!/changeme/i.test(rawValue)) {
        return line;
      }

      const replacement = replacements[key];
      if (replacement === undefined) {
        unknownChangemeKeys.add(key);
        return line;
      }

      return `${prefix}${key}${separator}${dotenvValue(replacement)}`;
    })
    .join("\n");

  if (unknownChangemeKeys.size > 0) {
    fail(`no gt value configured for changeme env var(s): ${[...unknownChangemeKeys].sort().join(", ")}`);
  }

  return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
}

export function writeSwiftApiEnv(worktreeDir: string, slug: string): TaskDatabaseNames {
  const swiftApiDir = join(worktreeDir, "swift", "api");
  if (!existsSync(swiftApiDir)) {
    fail(`expected swift api directory to exist: ${swiftApiDir}`);
  }

  if (!existsSync(ENV_TEMPLATE_PATH)) {
    fail(`missing env template: ${ENV_TEMPLATE_PATH}`);
  }

  const names = taskDatabaseNames(slug);
  const contents = renderTaskEnv(readFileSync(ENV_TEMPLATE_PATH, "utf8"), {
    ...names,
    databaseUsername: currentSystemUser(),
    databasePassword: "",
  });
  const envPath = join(swiftApiDir, ".env");
  writeFileSync(envPath, contents, "utf8");
  chmodSync(envPath, 0o600);
  return names;
}
