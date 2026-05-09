import { expect, test } from "bun:test";
import {
  defaultTabTemplateFromLayout,
  evaluateKillSafety,
  isValidSlug,
  kdlString,
  parseKdlConfigStringValue,
  sessionNameForSlug,
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
});
