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

function taskLeafName(title: string): string {
  return title.split("/").at(-1) || title;
}

function childrenByParent(tasks: TaskListItem[]): Map<string, TaskListItem[]> {
  const children = new Map<string, TaskListItem[]>();

  for (const task of tasks) {
    if (!task.forkOf || task.forkMissingParent) {
      continue;
    }

    children.set(task.forkOf, [...(children.get(task.forkOf) ?? []), task]);
  }

  for (const taskChildren of children.values()) {
    taskChildren.sort((left, right) => taskLeafName(left.title).localeCompare(taskLeafName(right.title)));
  }

  return children;
}

function renderTask(task: TaskListItem, children: Map<string, TaskListItem[]>, depth: number): string[] {
  const indent = "  ".repeat(depth);
  const marker = depth === 0 ? "•" : "↳";
  const label = depth === 0 ? task.title : taskLeafName(task.title);
  const lines = [`${indent}${marker} ${label}`];

  if (task.forkOf && (depth === 0 || task.forkMissingParent)) {
    lines.push(`${indent}  fork of: ${task.forkOf}${task.forkMissingParent ? " (missing)" : ""}`);
  }

  if (task.title !== label) {
    lines.push(`${indent}  title: ${task.title}`);
  }

  lines.push(`${indent}  checkout: ${task.directoryName}`);
  if (task.branchName !== task.directoryName) {
    lines.push(`${indent}  branch: ${task.branchName}`);
  }

  for (const child of children.get(task.title) ?? []) {
    lines.push(...renderTask(child, children, depth + 1));
  }

  return lines;
}

export function renderTaskList(tasks: TaskListItem[], baseDir = BASE_DIR): string {
  if (tasks.length === 0) {
    return `No Gertrude tasks found in ${baseDir}.\n`;
  }

  const children = childrenByParent(tasks);
  const roots = tasks
    .filter((task) => !task.forkOf || task.forkMissingParent)
    .sort((left, right) => left.title.localeCompare(right.title));
  const body = roots.map((task) => renderTask(task, children, 0).join("\n")).join("\n\n");

  return `Gertrude tasks (${tasks.length})\nRoot: ${baseDir}\n\n${body}\n`;
}

export function listTasks(): void {
  console.log(renderTaskList(currentTasks()).trimEnd());
}
