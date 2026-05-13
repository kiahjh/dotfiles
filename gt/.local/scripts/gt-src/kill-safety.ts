import * as readline from "node:readline/promises";
import { CONFIRMATION, MASTER_BRANCH } from "./constants.ts";
import { fail } from "./errors.ts";
import { fetchRemoteTrackingBranch, git, gitOutput, remoteTrackingRefExists } from "./git.ts";
import { sessionNameForSlug } from "./zellij/session.ts";

export type KillSafetyFacts = {
  workingTreeClean: boolean;
  currentBranch: string | null;
  expectedBranch: string;
  expectedSessionName: string;
  actualZellijSessionName: string | null;
  originMasterAvailable: boolean;
  remoteBranchExists: boolean;
  localMatchesRemote: boolean;
  remoteBranchMergedIntoMaster: boolean;
};

export type KillSafetyEvaluation = {
  safeToSkipConfirmation: boolean;
  reasons: string[];
};

export function collectKillSafetyFacts(repoRoot: string, expectedBranch: string, taskTitle = expectedBranch): KillSafetyFacts {
  const currentBranch = gitOutput(repoRoot, ["branch", "--show-current"]) || null;
  const expectedSessionName = sessionNameForSlug(taskTitle);
  const actualZellijSessionName = process.env.ZELLIJ_SESSION_NAME || null;
  const branchToCheck = currentBranch || expectedBranch;

  const workingTreeClean = gitOutput(repoRoot, ["status", "--porcelain"]) === "";
  const originMasterAvailable = fetchRemoteTrackingBranch(repoRoot, MASTER_BRANCH);
  const fetchedTaskBranch = fetchRemoteTrackingBranch(repoRoot, branchToCheck);
  const remoteBranchExists = fetchedTaskBranch && remoteTrackingRefExists(repoRoot, branchToCheck);

  let localMatchesRemote = false;
  let remoteBranchMergedIntoMaster = false;

  if (currentBranch && remoteBranchExists) {
    const localHead = gitOutput(repoRoot, ["rev-parse", "HEAD"]);
    const remoteHead = gitOutput(repoRoot, ["rev-parse", `refs/remotes/origin/${branchToCheck}`]);
    localMatchesRemote = localHead === remoteHead;
  }

  if (remoteBranchExists && originMasterAvailable) {
    remoteBranchMergedIntoMaster =
      git(repoRoot, ["merge-base", "--is-ancestor", `refs/remotes/origin/${branchToCheck}`, `refs/remotes/origin/${MASTER_BRANCH}`], true).status === 0;
  }

  return {
    workingTreeClean,
    currentBranch,
    expectedBranch,
    expectedSessionName,
    actualZellijSessionName,
    originMasterAvailable,
    remoteBranchExists,
    localMatchesRemote,
    remoteBranchMergedIntoMaster,
  };
}

export function evaluateKillSafety(facts: KillSafetyFacts): KillSafetyEvaluation {
  const reasons: string[] = [];

  if (!facts.workingTreeClean) {
    reasons.push("working tree has uncommitted or untracked changes");
  }

  if (!facts.currentBranch) {
    reasons.push("checkout is in detached HEAD state");
  } else if (facts.currentBranch !== facts.expectedBranch) {
    reasons.push(`current branch is ${facts.currentBranch}, expected ${facts.expectedBranch}`);
  }

  if (facts.actualZellijSessionName && facts.actualZellijSessionName !== facts.expectedSessionName) {
    reasons.push(`current zellij session is ${facts.actualZellijSessionName}, expected ${facts.expectedSessionName}`);
  }

  if (!facts.originMasterAvailable) {
    reasons.push(`origin/${MASTER_BRANCH} could not be fetched`);
  }

  if (!facts.remoteBranchExists) {
    reasons.push(`origin/${facts.currentBranch || facts.expectedBranch} does not exist or could not be fetched`);
  }

  if (facts.currentBranch && facts.remoteBranchExists && !facts.localMatchesRemote) {
    reasons.push("local HEAD does not match the corresponding origin branch");
  }

  if (facts.remoteBranchExists && facts.originMasterAvailable && !facts.remoteBranchMergedIntoMaster) {
    reasons.push(`corresponding origin branch has not been merged into origin/${MASTER_BRANCH}`);
  }

  return {
    safeToSkipConfirmation: reasons.length === 0,
    reasons,
  };
}

export async function confirmKillIfNeeded(evaluation: KillSafetyEvaluation): Promise<void> {
  if (evaluation.safeToSkipConfirmation) {
    console.log(`Branch is pushed and merged into origin/${MASTER_BRANCH}; skipping confirmation.`);
    return;
  }

  console.error("This task does not look fully safe to delete:");
  for (const reason of evaluation.reasons) {
    console.error(`  - ${reason}`);
  }
  console.error("Are you sure you want to kill this task?");

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`Type "${CONFIRMATION}" to confirm: `);
    if (answer !== CONFIRMATION) {
      fail("aborted");
    }
  } finally {
    rl.close();
  }
}
