export { usage, commandUsage, main, parseCli } from "./cli.ts";
export { GtError, fail } from "./errors.ts";
export { run, runOutput, commandExists, requireCommands, currentSystemUser } from "./process.ts";
export type { RunOptions, RunResult } from "./process.ts";

export { dotenvValue, parseSimpleDotenv } from "./dotenv.ts";
export { isValidSlug, isValidTaskTitle, validateGitBranchName, validateSlug, validateTaskTitle } from "./slug.ts";

export { LOCAL_RESTORE_SQL_FILTER, taskDatabaseNames, setupTaskDatabases, dropDatabaseIfExists } from "./databases.ts";
export type { TaskDatabaseNames } from "./databases.ts";
export { renderTaskEnv, taskEnvOverridesFromGtSecrets, writeSwiftApiEnv } from "./env.ts";
export type { TaskEnvOverrides, TaskEnvValues } from "./env.ts";

export {
  allocateTaskPorts,
  renderTaskPorts,
  setupTaskPorts,
  taskPortsForSlot,
  taskPortsFromEnv,
  taskPortsPath,
  taskPortSlotForSlug,
} from "./ports.ts";
export type { TaskPorts } from "./ports.ts";

export {
  loadGtSecrets,
  scrubbedDumpCredentials,
  scrubbedDumpUrl,
  signedScrubbedDumpHeaders,
} from "./scrubbed-dump.ts";
export type { ScrubbedDumpCredentials } from "./scrubbed-dump.ts";

export { ensureTaskRoot, getGitRoot, taskRootFromArg } from "./git.ts";
export { currentTasks, listTasks, renderTaskList } from "./list-tasks.ts";
export type { TaskListItem } from "./list-tasks.ts";
export {
  collectKillSafetyFacts,
  confirmKillIfNeeded,
  evaluateKillSafety,
  killConfirmationPhrase,
} from "./kill-safety.ts";
export type { KillSafetyEvaluation, KillSafetyFacts } from "./kill-safety.ts";

export {
  findTaskRootByTitle,
  renderTaskMetadata,
  taskBranchNameForTitle,
  taskDirectoryNameForTitle,
  taskInfoForRoot,
  taskMetadataPath,
  taskWorktreeDirForTitle,
} from "./task.ts";
export type { TaskInfo } from "./task.ts";
export { forkDirectoryNameForCurrentTask, forkTitleForCurrentTask } from "./fork-task.ts";
export { closeGhosttyTabScript } from "./ghostty.ts";
export {
  defaultTabTemplateFromLayout,
  FALLBACK_DEFAULT_TAB_TEMPLATE,
  indentKdl,
  kdlString,
  parseKdlConfigStringValue,
} from "./zellij/kdl.ts";
export { writeCachedLayout, zellijLayout, zellijLayoutForCurrentConfig } from "./zellij/layout.ts";
export { sessionNameForSlug, zellijSessionStateFromList } from "./zellij/session.ts";
export type { ZellijSessionState } from "./zellij/session.ts";
