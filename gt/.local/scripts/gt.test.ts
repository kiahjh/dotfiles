import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCli, commandUsage } from "./gt-src/cli.ts";
import { LOCAL_RESTORE_SQL_FILTER, taskDatabaseNames } from "./gt-src/databases.ts";
import { dotenvValue, parseSimpleDotenv } from "./gt-src/dotenv.ts";
import { renderTaskEnv, taskEnvOverridesFromGtSecrets } from "./gt-src/env.ts";
import { renderTaskPorts, taskPortsForSlot, taskPortsFromEnv, taskPortSlotForSlug } from "./gt-src/ports.ts";
import { run } from "./gt-src/process.ts";
import { signedScrubbedDumpHeaders } from "./gt-src/scrubbed-dump.ts";
import { isValidSlug, parsePullRequestNumber } from "./gt-src/slug.ts";
import { taskDirectoryNameForTitle } from "./gt-src/task.ts";
import { newWorkspace, readWorkspace, workspacePath, writeWorkspace } from "./gt-src/workspace-state.ts";

test("validates task slugs", () => {
  expect(isValidSlug("dashboard-redesign")).toBe(true);
  expect(isValidSlug("abc_123.foo")).toBe(true);
  expect(isValidSlug("../oops")).toBe(false);
  expect(isValidSlug("has/slash")).toBe(false);
  expect(isValidSlug("-starts-with-dash")).toBe(false);
  expect(isValidSlug("")).toBe(false);
});

test("parses the subcommand-oriented cli", () => {
  expect(parseCli([])).toEqual({ command: "help" });
  expect(parseCli(["spawn", "dashboard-redesign"])).toEqual({
    command: "spawn",
    name: "dashboard-redesign",
    agent: false,
  });
  expect(parseCli(["spawn", "--agent", "api-cleanup"])).toEqual({
    command: "spawn",
    name: "api-cleanup",
    agent: true,
  });
  expect(parseCli(["fork", "model-spike", "--agent"])).toEqual({
    command: "fork",
    name: "model-spike",
    agent: true,
  });
  expect(parseCli(["review", "891"])).toEqual({
    command: "review",
    pullRequestNumber: 891,
    agent: false,
  });
  expect(parseCli(["review", "#891", "--agent"])).toEqual({
    command: "review",
    pullRequestNumber: 891,
    agent: true,
  });
  expect(parseCli(["kill"])).toEqual({ command: "kill" });
  expect(parseCli(["list"])).toEqual({ command: "list" });
  expect(parseCli(["list", "--help"])).toEqual({ command: "help", topic: "list" });
  expect(parseCli(["spawn", "--help"])).toEqual({ command: "help", topic: "spawn" });
  expect(commandUsage("fork")).toContain("gt fork [--agent] <fork-name>");
  expect(commandUsage("review")).toContain("gt review [--agent] <PR#>");
  expect(commandUsage("list")).toContain("gt list");
  expect(() => parseCli(["review", "nope"])).toThrow("invalid pull request number: nope");
  expect(() => parseCli(["dashboard-redesign"])).toThrow("Use `gt spawn dashboard-redesign` to create a task");
});

test("parses pull request numbers", () => {
  expect(parsePullRequestNumber("891")).toBe(891);
  expect(parsePullRequestNumber("#891")).toBe(891);
  expect(() => parsePullRequestNumber("0")).toThrow("invalid pull request number: 0");
});

test("derives path-safe directory names for fork titles", () => {
  const directoryName = taskDirectoryNameForTitle("dashboard-redesign/sidebar-spike");
  expect(directoryName).toMatch(/^dashboard-redesign--sidebar-spike-[a-f0-9]{8}$/);
  expect(directoryName).not.toContain("/");
  expect(taskDirectoryNameForTitle("plain-task")).toBe("plain-task");
});

test("derives safe per-task postgres database names", () => {
  expect(taskDatabaseNames("dashboard-redesign")).toEqual({
    databaseName: "gt_dashboard_redesign_04d31cb2",
    testDatabaseName: "gt_dashboard_redesign_04d31cb2_test",
  });

  const names = taskDatabaseNames("This.IS.a-very-long.task-name-with_lots.of.parts-and-extra-words");
  expect(names.databaseName).toMatch(/^gt_[a-z0-9_]+_[a-f0-9]{8}$/);
  expect(names.testDatabaseName).toBe(`${names.databaseName}_test`);
  expect(names.testDatabaseName.length).toBeLessThanOrEqual(63);
});

test("filters production-only dump statements before local restore", () => {
  const input = [
    "\\restrict token",
    "SET transaction_timeout = 0;",
    "ALTER TABLE public.foo OWNER TO jared;",
    "GRANT USAGE ON SCHEMA system TO ops_agentd;",
    "GRANT ALL ON SCHEMA public TO PUBLIC;",
    "REVOKE USAGE ON SCHEMA public FROM PUBLIC;",
    "REVOKE USAGE ON SCHEMA system FROM ops_agentd;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE ops_agentd IN SCHEMA public GRANT SELECT ON TABLES TO readonly;",
    "CREATE EVENT TRIGGER search_path_on_login ON login",
    "    EXECUTE FUNCTION public.set_search_path_on_login();",
    "ALTER EVENT TRIGGER search_path_on_login OWNER TO jared;",
    "CREATE TABLE public.keep (id uuid);",
    "\\unrestrict token",
  ].join("\n") + "\n";

  expect(run("sed", [LOCAL_RESTORE_SQL_FILTER], { input }).stdout).toBe(
    [
      "GRANT ALL ON SCHEMA public TO PUBLIC;",
      "REVOKE USAGE ON SCHEMA public FROM PUBLIC;",
      "CREATE TABLE public.keep (id uuid);",
    ].join("\n") + "\n",
  );
});

test("derives and renders per-task local ports", () => {
  const slot = taskPortSlotForSlug("gertrude-fm");
  expect(slot).toBeGreaterThanOrEqual(0);
  expect(slot).toBeLessThan(4000);

  expect(taskPortsForSlot(7)).toEqual({
    slot: 7,
    apiPort: 18070,
    dashPort: 18071,
    sitePort: 18072,
    adminPort: 18073,
    storybookPort: 18074,
    ciApiPort: 18075,
    ciDashPort: 18076,
    accountPort: 18077,
    storybookV2Port: 18078,
  });

  const rendered = renderTaskPorts("demo", taskPortsForSlot(7));
  expect(rendered).toContain("API_PORT=18070");
  expect(rendered).toContain("DASH_PORT=18071");
  expect(rendered).toContain("SITE_PORT=18072");
  expect(rendered).toContain("ADMIN_PORT=18073");
  expect(rendered).toContain("STORYBOOK_PORT=18074");
  expect(rendered).toContain("ACCOUNT_PORT=18077");
  expect(rendered).toContain("STORYBOOK_V2_PORT=18078");
  expect(rendered).toContain("VITE_API_ENDPOINT=http://127.0.0.1:18070");
  expect(rendered).toContain("VITE_TURNSTILE_SITEKEY=not-real");
});

test.each([
  ["", {}, "signup@not-real"],
  ["", { SIGNUP_NOTIFICATION_EMAIL: "override@example.com" }, "override@example.com"],
  ["SIGNUP_NOTIFICATION_EMAIL=custom@example.com", {}, "custom@example.com"],
  ["export SIGNUP_NOTIFICATION_EMAIL = custom@example.com", {}, "custom@example.com"],
] as const)("renders signup notification recipient from template %j and overrides %j", (template, overrides, expected) => {
  const rendered = renderTaskEnv(template, {
    databaseUsername: "miciah",
    databasePassword: "",
    databaseName: "gt_demo",
    testDatabaseName: "gt_demo_test",
    accountDashboardUrl: "http://localhost:18077",
  }, overrides);

  expect(parseSimpleDotenv(rendered).SIGNUP_NOTIFICATION_EMAIL).toBe(expected);
  expect(rendered.match(/SIGNUP_NOTIFICATION_EMAIL\s*=/g)).toHaveLength(1);
});

test("renders swift api env from template with generated values and local overrides", () => {
  const rendered = renderTaskEnv(
    `DATABASE_USERNAME=changeme
DATABASE_PASSWORD=
DATABASE_NAME="changeme"
TEST_DATABASE_NAME='changeme'
ACCOUNT_DASHBOARD_URL=changeme
SENDGRID_API_KEY=not-real
POSTMARK_API_KEY=not-real
REAL_KEY=real-looking-value
`,
    {
      databaseUsername: "miciah",
      databasePassword: "",
      databaseName: "gt_dashboard_redesign_4d053875",
      testDatabaseName: "gt_dashboard_redesign_4d053875_test",
      accountDashboardUrl: "http://localhost:18077",
    },
    {
      POSTMARK_API_KEY: "real key with spaces",
    },
  );

  expect(rendered).toContain("DATABASE_USERNAME=miciah");
  expect(rendered).toContain("DATABASE_PASSWORD=");
  expect(rendered).toContain("DATABASE_NAME=gt_dashboard_redesign_4d053875");
  expect(rendered).toContain("TEST_DATABASE_NAME=gt_dashboard_redesign_4d053875_test");
  expect(rendered).toContain("ACCOUNT_DASHBOARD_URL=http://localhost:18077");
  expect(rendered).toContain("SENDGRID_API_KEY=not-real");
  expect(rendered).toContain('POSTMARK_API_KEY="real key with spaces"');
  expect(rendered).toContain("REAL_KEY=real-looking-value");
});


test("uses non-gt secrets as env overrides without replacing generated database settings", () => {
  expect(
    taskEnvOverridesFromGtSecrets({
      GT_SCRUBBED_DUMPS_ACCESS_KEY_ID: "do-not-render",
      DATABASE_NAME: "do-not-render",
      ACCOUNT_DASHBOARD_URL: "do-not-render",
      POSTMARK_API_KEY: "real-postmark-key",
      POSTMARK_SERVER_ID: "123",
    }),
  ).toEqual({
    POSTMARK_API_KEY: "real-postmark-key",
    POSTMARK_SERVER_ID: "123",
  });
});

test("parses and quotes simple dotenv values", () => {
  expect(
    parseSimpleDotenv(`
# comment
export SIMPLE=one
SPACED = "two words"
SINGLE='three=equals'
EMPTY=
IGNORED
`),
  ).toEqual({
    SIMPLE: "one",
    SPACED: "two words",
    SINGLE: "three=equals",
    EMPTY: "",
  });

  expect(dotenvValue("simple-1_2./:@")).toBe("simple-1_2./:@");
  expect(dotenvValue("has space")).toBe('"has space"');
  expect(dotenvValue('needs"quote')).toBe('"needs\\\"quote"');
});

test("round-trips rendered task ports through dotenv parsing", () => {
  const ports = taskPortsForSlot(123);
  const parsed = taskPortsFromEnv(parseSimpleDotenv(renderTaskPorts("demo", ports)));

  expect(parsed).toEqual(ports);
  expect(taskPortsFromEnv({
    API_PORT: "18000",
    DASH_PORT: "18001",
    SITE_PORT: "18002",
    ADMIN_PORT: "18003",
    STORYBOOK_PORT: "18004",
    CI_API_PORT: "18005",
    CI_DASH_PORT: "18006",
  })?.accountPort).toBe(18007);
  // Port files written before Storybook V2 had a port derive it from the same block.
  expect(taskPortsFromEnv({
    API_PORT: "18000", DASH_PORT: "18001", SITE_PORT: "18002", ADMIN_PORT: "18003",
    STORYBOOK_PORT: "18004", CI_API_PORT: "18005", CI_DASH_PORT: "18006", ACCOUNT_PORT: "18007",
  })?.storybookV2Port).toBe(18008);
  expect(taskPortsFromEnv({
    API_PORT: "18000", DASH_PORT: "18001", SITE_PORT: "18002", ADMIN_PORT: "18003",
    STORYBOOK_PORT: "18004", CI_API_PORT: "18005", CI_DASH_PORT: "18006", STORYBOOK_V2_PORT: "nope",
  })).toBeNull();
});

test("rejects incomplete or malformed task port env files", () => {
  expect(taskPortsFromEnv({ API_PORT: "18000" })).toBeNull();
  expect(
    taskPortsFromEnv({
      API_PORT: "18000",
      DASH_PORT: "18001",
      SITE_PORT: "18002",
      ADMIN_PORT: "18003",
      STORYBOOK_PORT: "not-a-number",
      CI_API_PORT: "18005",
      CI_DASH_PORT: "18006",
    }),
  ).toBeNull();
  expect(
    taskPortsFromEnv({
      API_PORT: "18000",
      DASH_PORT: "18001",
      SITE_PORT: "18002",
      ADMIN_PORT: "18003",
      STORYBOOK_PORT: "18004",
      CI_API_PORT: "18005",
      CI_DASH_PORT: "18006",
      ACCOUNT_PORT: "not-a-number",
    }),
  ).toBeNull();
});

test("renders env replacements with quoting and reports unknown changeme keys", () => {
  const values = {
    databaseUsername: "local user",
    databasePassword: "secret value",
    databaseName: "gt_demo_abcd1234",
    testDatabaseName: "gt_demo_abcd1234_test",
    accountDashboardUrl: "http://localhost:18077",
  };

  expect(renderTaskEnv("export DATABASE_USERNAME=changeme\nDATABASE_PASSWORD=changeme\n", values)).toBe(
    'export DATABASE_USERNAME="local user"\nDATABASE_PASSWORD="secret value"\n\nSIGNUP_NOTIFICATION_EMAIL=signup@not-real\n',
  );

  expect(() => renderTaskEnv("THIRD_PARTY_API_KEY=changeme\n", values)).toThrow(
    "no gt value configured for changeme env var(s): THIRD_PARTY_API_KEY",
  );
});

test("signs scrubbed dump requests deterministically", () => {
  const headers = signedScrubbedDumpHeaders(
    {
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    },
    new Date("2015-08-30T12:36:00.000Z"),
  );

  expect(headers.get("x-amz-date")).toBe("20150830T123600Z");
  expect(headers.get("x-amz-content-sha256")).toBe(
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  expect(headers.get("authorization")).toBe(
    "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=ee59e322ac1a9593c606713f26265f30c617826a49811d5d5b44665edab86217",
  );
});

test("task records from before Storybook V2 had a port still load, with its reserved port", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-old-ports-"));
  const previous = process.env.GT_STATE_DIR;
  process.env.GT_STATE_DIR = root;
  try {
    const task = newWorkspace("old-ports", join(root, "old-ports"), "fixture");
    const { storybookV2Port: _, ...oldPorts } = taskPortsForSlot(7);
    task.ports = oldPorts as typeof task.ports;
    writeWorkspace(task);
    expect(readWorkspace(workspacePath(task.id)).ports).toEqual(taskPortsForSlot(7));

    task.ports = { ...taskPortsForSlot(7), storybookV2Port: 6007 };
    writeWorkspace(task);
    expect(() => readWorkspace(workspacePath(task.id))).toThrow("task record does not match its resources");
  } finally {
    if (previous === undefined) delete process.env.GT_STATE_DIR; else process.env.GT_STATE_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
