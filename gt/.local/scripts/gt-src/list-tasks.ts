import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { BASE_DIR } from "./constants.ts";
import { taskInfoForRoot, type TaskInfo } from "./task.ts";

export type TaskListItem = TaskInfo & {
  forkOf: string | null;
  forkMissingParent: boolean;
};

function isTaskDirectory(path: string): boolean {
  return existsSync(join(path, ".git"));
}

export function currentTasks(): TaskListItem[] {
  if (!existsSync(BASE_DIR)) {
    return [];
  }

  const tasks = readdirSync(BASE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(BASE_DIR, entry.name))
    .filter(isTaskDirectory)
    .map(taskInfoForRoot)
    .sort((left, right) => left.title.localeCompare(right.title));

  const titles = new Set(tasks.map((task) => task.title));

  return tasks.map((task) => {
    const slashIndex = task.title.lastIndexOf("/");
    const forkOf = slashIndex === -1 ? null : task.title.slice(0, slashIndex);
    return {
      ...task,
      forkOf,
      forkMissingParent: forkOf !== null && !titles.has(forkOf),
    };
  });
}

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

export function renderTaskList(tasks: TaskListItem[], baseDir = BASE_DIR): string {
  if (tasks.length === 0) {
    return `No Gertrude tasks found in ${baseDir}.\n`;
  }

  const rows = tasks.map((task) => ({
    task: task.title,
    forkOf: task.forkOf ? `${task.forkOf}${task.forkMissingParent ? " (missing)" : ""}` : "—",
    branch: task.branchName,
    directory: task.directoryName,
  }));

  const widths = {
    task: Math.max("Task".length, ...rows.map((row) => row.task.length)),
    forkOf: Math.max("Fork of".length, ...rows.map((row) => row.forkOf.length)),
    branch: Math.max("Branch".length, ...rows.map((row) => row.branch.length)),
    directory: Math.max("Directory".length, ...rows.map((row) => row.directory.length)),
  };

  const header = [
    pad("Task", widths.task),
    pad("Fork of", widths.forkOf),
    pad("Branch", widths.branch),
    pad("Directory", widths.directory),
  ].join("  ");
  const divider = [
    "─".repeat(widths.task),
    "─".repeat(widths.forkOf),
    "─".repeat(widths.branch),
    "─".repeat(widths.directory),
  ].join("  ");
  const body = rows
    .map((row) =>
      [
        pad(row.task, widths.task),
        pad(row.forkOf, widths.forkOf),
        pad(row.branch, widths.branch),
        pad(row.directory, widths.directory),
      ].join("  "),
    )
    .join("\n");

  return `Gertrude tasks (${tasks.length}) in ${baseDir}\n\n${header}\n${divider}\n${body}\n`;
}

export function listTasks(): void {
  console.log(renderTaskList(currentTasks()).trimEnd());
}
