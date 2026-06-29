import { expect, test } from "bun:test";
import {
  commandUsage,
  defaultTabTemplateFromLayout,
  dotenvValue,
  evaluateKillSafety,
  forkTitleForCurrentTask,
  isValidSlug,
  isValidTaskTitle,
  kdlString,
  killConfirmationPhrase,
  LOCAL_RESTORE_SQL_FILTER,
  parseCli,
  parseKdlConfigStringValue,
  parseSimpleDotenv,
  renderTaskEnv,
  renderTaskList,
  renderTaskMetadata,
  renderTaskPorts,
  run,
  sessionNameForSlug,
  signedScrubbedDumpHeaders,
  taskBranchNameForTitle,
  taskDatabaseNames,
  taskDirectoryNameForTitle,
  taskEnvOverridesFromGtSecrets,
  taskMetadataPath,
  taskPortsForSlot,
  taskPortsFromEnv,
  taskPortSlotForSlug,
  zellijLayout,
  zellijSessionStateFromList,
  type KillSafetyFacts,
} from "./gt";

const safeFacts: KillSafetyFacts = {
  workingTreeClean: true,
  currentBranch: "dashboard-redesign",
  expectedBranch: "dashboard-redesign",
  expectedSessionName: "gertrude__dashboard-redesign",
  actualZellijSessionName: "gertrude__dashboard-redesign",
  originMasterAvailable: true,
  remoteBranchExists: true,
  localMatchesRemote: true,
  remoteBranchMergedIntoMaster: true,
};

test("validates task slugs", () => {
  expect(isValidSlug("dashboard-redesign")).toBe(true);
  expect(isValidSlug("abc_123.foo")).toBe(true);
  expect(isValidSlug("../oops")).toBe(false);
  expect(isValidSlug("has/slash")).toBe(false);
  expect(isValidSlug("-starts-with-dash")).toBe(false);
  expect(isValidSlug("")).toBe(false);
});

test("derives zellij session names", () => {
  expect(sessionNameForSlug("dashboard-redesign")).toBe("gertrude__dashboard-redesign");

  const forkSessionName = sessionNameForSlug("dashboard-redesign/sidebar-spike");
  expect(forkSessionName).toMatch(/^gertrude__[A-Za-z0-9._-]+-[a-f0-9]{8}$/);
  expect(forkSessionName.length).toBeLessThanOrEqual(36);

  expect(sessionNameForSlug("gertrude-fm/app-design")).toBe("gertrude__gertrude-fm__app-888e6e40");
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
  expect(parseCli(["kill"])).toEqual({ command: "kill" });
  expect(parseCli(["list"])).toEqual({ command: "list" });
  expect(parseCli(["list", "--help"])).toEqual({ command: "help", topic: "list" });
  expect(parseCli(["spawn", "--help"])).toEqual({ command: "help", topic: "spawn" });
  expect(commandUsage("fork")).toContain("gt fork [--agent] <fork-name>");
  expect(commandUsage("list")).toContain("gt list");
  expect(() => parseCli(["dashboard-redesign"])).toThrow("Use `gt spawn dashboard-redesign` to create a task");
});

test("derives fork titles and path-safe task identifiers", () => {
  expect(isValidTaskTitle("dashboard-redesign/sidebar-spike")).toBe(true);
  expect(isValidTaskTitle("dashboard-redesign//sidebar-spike")).toBe(false);
  expect(isValidTaskTitle("dashboard-redesign/../oops")).toBe(false);
  expect(forkTitleForCurrentTask("dashboard-redesign", "sidebar-spike")).toBe(
    "dashboard-redesign/sidebar-spike",
  );

  const directoryName = taskDirectoryNameForTitle("dashboard-redesign/sidebar-spike");
  expect(directoryName).toMatch(/^dashboard-redesign--sidebar-spike-[a-f0-9]{8}$/);
  expect(directoryName).not.toContain("/");
  expect(taskBranchNameForTitle("dashboard-redesign/sidebar-spike")).toBe(directoryName);
  expect(taskDirectoryNameForTitle("plain-task")).toBe("plain-task");

  expect(renderTaskMetadata({
    title: "dashboard-redesign/sidebar-spike",
    branchName: directoryName,
    directoryName,
  })).toContain("GTASK_TITLE=dashboard-redesign/sidebar-spike");
  expect(taskMetadataPath("/tmp/demo")).toBe("/tmp/demo/scratch/.gtask");
});

test("renders a task list with fork relationships", () => {
  const rendered = renderTaskList(
    [
      {
        title: "dashboard-redesign",
        branchName: "dashboard-redesign",
        directoryName: "dashboard-redesign",
        worktreeDir: "/tasks/dashboard-redesign",
        forkOf: null,
        forkMissingParent: false,
      },
      {
        title: "dashboard-redesign/sidebar-spike",
        branchName: "dashboard-redesign--sidebar-spike-755f2331",
        directoryName: "dashboard-redesign--sidebar-spike-755f2331",
        worktreeDir: "/tasks/dashboard-redesign--sidebar-spike-755f2331",
        forkOf: "dashboard-redesign",
        forkMissingParent: false,
      },
      {
        title: "missing-base/tangent",
        branchName: "missing-base--tangent-deadbeef",
        directoryName: "missing-base--tangent-deadbeef",
        worktreeDir: "/tasks/missing-base--tangent-deadbeef",
        forkOf: "missing-base",
        forkMissingParent: true,
      },
    ],
    "/tasks",
  );

  expect(rendered).toContain("Gertrude tasks (3)\nRoot: /tasks");
  expect(rendered).not.toContain("Task  ");
  expect(rendered).not.toContain("Fork of");
  expect(rendered).toContain("• dashboard-redesign");
  expect(rendered).toContain("  ↳ sidebar-spike");
  expect(rendered).toContain("    title: dashboard-redesign/sidebar-spike");
  expect(rendered).toContain("    checkout: dashboard-redesign--sidebar-spike-755f2331");
  expect(rendered).toContain("• missing-base/tangent");
  expect(rendered).toContain("  fork of: missing-base (missing)");

  expect(renderTaskList([], "/tasks")).toBe("No Gertrude tasks found in /tasks.\n");
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
  });

  const rendered = renderTaskPorts("demo", taskPortsForSlot(7));
  expect(rendered).toContain("API_PORT=18070");
  expect(rendered).toContain("DASH_PORT=18071");
  expect(rendered).toContain("SITE_PORT=18072");
  expect(rendered).toContain("ADMIN_PORT=18073");
  expect(rendered).toContain("STORYBOOK_PORT=18074");
  expect(rendered).toContain("ACCOUNT_PORT=18077");
  expect(rendered).toContain("VITE_API_ENDPOINT=http://127.0.0.1:18070");
  expect(rendered).toContain("VITE_TURNSTILE_SITEKEY=not-real");
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

test("escapes KDL strings", () => {
  expect(kdlString('a "quoted" path \\ with newline\n')).toBe('"a \\"quoted\\" path \\\\ with newline\\n"');
});

test("zellij layout starts pi left and nvim right without bars by default", () => {
  const layout = zellijLayout("dashboard-redesign", "/tmp/dashboard-redesign");

  expect(layout).toContain('tab name="dashboard-redesign" cwd="/tmp/dashboard-redesign"');
  expect(layout).toContain('pane split_direction="vertical"');
  expect(layout).toContain('pane name="pi" command="pi" focus=true');
  expect(layout).toContain('pane name="nvim" command="nvim"');
  expect(layout).not.toContain("tab-bar");
  expect(layout).not.toContain("status-bar");
});

test("zellij layout uses a supplied default tab template", () => {
  const layout = zellijLayout(
    "dashboard-redesign",
    "/tmp/dashboard-redesign",
    `default_tab_template {
    children
    pane size=1 borderless=true {
        plugin location="zellij:compact-bar"
    }
}`,
  );

  expect(layout).toContain("default_tab_template");
  expect(layout).toContain("children");
  expect(layout).toContain('plugin location="zellij:compact-bar"');
  expect(layout).toContain('pane name="pi" command="pi" focus=true');
  expect(layout).toContain('pane name="nvim" command="nvim"');
});

test("derives a tab template from a zellij default layout", () => {
  const template = defaultTabTemplateFromLayout(`layout {
    pane size=1 borderless=true {
        plugin location="zellij:tab-bar"
    }
    pane
    pane size=1 borderless=true {
        plugin location="zellij:status-bar"
    }
}`);

  expect(template).toContain("default_tab_template");
  expect(template).toContain("children");
  expect(template).toContain('plugin location="zellij:tab-bar"');
  expect(template).toContain('plugin location="zellij:status-bar"');
  expect(template).not.toContain("\n    pane\n");
});

test("parses kdl config string values", () => {
  expect(parseKdlConfigStringValue('// default_layout "default"\ndefault_layout "no-bars"', "default_layout")).toBe(
    "no-bars",
  );
  expect(parseKdlConfigStringValue('layout_dir "~/zellij layouts"', "layout_dir")).toBe("~/zellij layouts");
});

test("detects active and resurrectable zellij sessions", () => {
  const listSessionsOutput = `gertrude__design-system [Created 1h ago] (EXITED - attach to resurrect)
gertrude__dashboard-redesign [Created 2m ago]
_dotfiles [Created 30m ago] (current)`;

  expect(zellijSessionStateFromList(listSessionsOutput, "gertrude__design-system")).toBe("exited");
  expect(zellijSessionStateFromList(listSessionsOutput, "gertrude__dashboard-redesign")).toBe("active");
  expect(zellijSessionStateFromList(listSessionsOutput, "_dotfiles")).toBe("active");
  expect(zellijSessionStateFromList(listSessionsOutput, "gertrude__missing")).toBe("missing");
});

test("kill safety is safe only when clean, pushed, and merged", () => {
  expect(evaluateKillSafety(safeFacts).safeToSkipConfirmation).toBe(true);

  expect(
    evaluateKillSafety({
      ...safeFacts,
      localMatchesRemote: false,
    }),
  ).toEqual({
    safeToSkipConfirmation: false,
    reasons: ["local HEAD does not match the corresponding origin branch"],
  });

  expect(
    evaluateKillSafety({
      ...safeFacts,
      remoteBranchMergedIntoMaster: false,
    }).reasons,
  ).toContain("corresponding origin branch has not been merged into origin/master");

  expect(
    evaluateKillSafety({
      ...safeFacts,
      workingTreeClean: false,
    }).reasons,
  ).toContain("working tree has uncommitted or untracked changes");
});

test("kill safety prompts on wrong zellij session or branch", () => {
  const evaluation = evaluateKillSafety({
    ...safeFacts,
    currentBranch: "other-branch",
    actualZellijSessionName: "gertrude__other-branch",
  });

  expect(evaluation.safeToSkipConfirmation).toBe(false);
  expect(evaluation.reasons).toContain("current branch is other-branch, expected dashboard-redesign");
  expect(evaluation.reasons).toContain(
    "current zellij session is gertrude__other-branch, expected gertrude__dashboard-redesign",
  );
  expect(killConfirmationPhrase("dashboard-redesign")).toBe("yes, kill dashboard-redesign");
  expect(killConfirmationPhrase("gertrude-fm/app-design")).toBe("yes, kill gertrude-fm/app-design");
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
    'export DATABASE_USERNAME="local user"\nDATABASE_PASSWORD="secret value"\n',
  );

  expect(() => renderTaskEnv("THIRD_PARTY_API_KEY=changeme\n", values)).toThrow(
    "no gt value configured for changeme env var(s): THIRD_PARTY_API_KEY",
  );
});

test("derives tab templates from new_tab_template and falls back for explicit tabs", () => {
  expect(
    defaultTabTemplateFromLayout(`layout {
    new_tab_template {
        pane size=1 borderless=true
        children
    }
}`).startsWith("default_tab_template {"),
  ).toBe(true);

  expect(
    defaultTabTemplateFromLayout(`layout {
    tab name="already structured" {
        pane
    }
}`),
  ).toBe(`default_tab_template {
    children
}`);
});

test("kdl config parser unescapes strings and ignores session-name prefixes", () => {
  expect(parseKdlConfigStringValue('default_layout "line\\nwith\\ttab and \\\"quote\\\""', "default_layout")).toBe(
    'line\nwith\ttab and "quote"',
  );

  const listSessionsOutput = `gertrude__foo-extra [Created 1m ago]
gertrude__foo [Created 2m ago] (EXITED - attach to resurrect)`;
  expect(zellijSessionStateFromList(listSessionsOutput, "gertrude__foo")).toBe("exited");
  expect(zellijSessionStateFromList("gertrude__foo-extra [Created 1m ago]", "gertrude__foo")).toBe("missing");
});

test("kill safety reports detached and remote availability problems", () => {
  const evaluation = evaluateKillSafety({
    ...safeFacts,
    currentBranch: null,
    actualZellijSessionName: null,
    originMasterAvailable: false,
    remoteBranchExists: false,
  });

  expect(evaluation.safeToSkipConfirmation).toBe(false);
  expect(evaluation.reasons).toContain("checkout is in detached HEAD state");
  expect(evaluation.reasons).toContain("origin/master could not be fetched");
  expect(evaluation.reasons).toContain("origin/dashboard-redesign does not exist or could not be fetched");
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
