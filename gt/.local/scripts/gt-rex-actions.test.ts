import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRexRequest, planRexAction, rexConfirmation, rexTask, rexTodo, type RexPlan } from "./gt-src/rex-actions.ts";
import { taskPortsForSlot } from "./gt-src/ports.ts";
import { newWorkspace, writeWorkspace } from "./gt-src/workspace-state.ts";

test("Rex context accepts only known operations, fields, and typed arguments", () => {
  expect(parseRexRequest("new", '{"args":{"name":" demo "}}')).toEqual({
    operation: "new", sourceSession: undefined, clientID: undefined, args: { name: "demo" },
  });
  expect(parseRexRequest("pr", '{"args":{"number":42}}').args.number).toBe(42);
  expect(parseRexRequest("pr", '{"args":{"number":"#42"}}').args.number).toBe("#42");
  expect(parseRexRequest("finish", '{"args":{"task":"demo","confirm":"finish demo"}}').args.confirm).toBe("finish demo");
  for (const [operation, raw] of [
    ["unknown", "{}"], ["new", "not-json"], ["new", "null"], ["new", "[]"],
    ["new", '{"sourceSession":"other"}'], ["new", '{"clientID":"--server"}'],
    ["new", '{"args":{"name":123}}'], ["pr", '{"args":{"number":-1}}'],
    ["pr", '{"args":{"number":1.5}}'], ["new", '{"args":{"name":"demo","discard":true}}'],
    ["finish", '{"args":{"confirm":true}}'], ["support", '{"args":{"task":"demo"}}'],
    ["open", '{"args":{"confirm":"open demo"}}'], ["new", '{"args":{"confirm":"x"}}'],
    ["finish", '{"sourceSession":"session:valid","cwd":"/must-not-guess"}'],
  ]) expect(() => parseRexRequest(operation, raw)).toThrow();
});

test("each destructive action has a distinct task-specific confirmation", () => {
  const task = newWorkspace("parent/spike", "/unused", "fixture");
  expect(rexConfirmation("finish", task)).toBe("finish parent/spike");
  expect(rexConfirmation("discard", task)).toBe("discard parent/spike");
  expect(rexConfirmation("refresh-db", task)).toBe("refresh parent/spike");
});

function withTasks(check: (root: string, tasks: Record<string, ReturnType<typeof newWorkspace>>) => void): void {
  const root = mkdtempSync(join(tmpdir(), "gt-rex-plan-"));
  const saved = { state: process.env.GT_STATE_DIR, tasks: process.env.GT_TASKS_DIR, repo: process.env.GT_REPOSITORY_DIR };
  process.env.GT_STATE_DIR = join(root, "state");
  process.env.GT_TASKS_DIR = join(root, "tasks");
  process.env.GT_REPOSITORY_DIR = join(root, "missing-repository");
  try {
    const tasks: Record<string, ReturnType<typeof newWorkspace>> = {};
    for (const name of ["demo", "review-7", "half-done"]) {
      const directory = join(root, "tasks", name);
      mkdirSync(directory, { recursive: true });
      const task = newWorkspace(name, directory, "fixture");
      task.phase = name === "half-done" ? "setup" : "ready";
      task.rexSession = `session:${name}`;
      writeWorkspace(task);
      tasks[name] = task;
    }
    check(root, tasks);
  } finally {
    for (const [key, value] of [["GT_STATE_DIR", saved.state], ["GT_TASKS_DIR", saved.tasks], ["GT_REPOSITORY_DIR", saved.repo]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

const plan = (operation: string, context: object, pullRequests = () => undefined as never): RexPlan =>
  planRexAction(parseRexRequest(operation, JSON.stringify(context)), pullRequests);
const asked = (result: RexPlan) => {
  if (!("ask" in result)) throw new Error(`expected a question, got ${JSON.stringify(result)}`);
  return result.ask;
};

test("Rex plans ask for a task name until it is usable, then run a focused job", () => {
  withTasks(() => {
    expect(asked(plan("new", { args: {} }))).toMatchObject({ field: "name", kind: "input", prompt: { title: "New task" } });
    // The problem is the whole title, because Rex cuts long titles off at the end.
    for (const [name, problem] of [["", "Enter a name"], ["bad name", "Use only letters"], ["master", "The name can't be master"],
      ["support", "Support is permanent"], ["demo", "Demo already exists"]]) {
      const question = asked(plan("new", { args: { name } }));
      expect(question.prompt.title.startsWith(problem)).toBe(true);
      expect(question.prompt.value).toBe(name);
    }
    expect(plan("new", { args: { name: "fresh" } })).toEqual({ run: "job", title: "New fresh", focus: true });
  });
});

test("Rex PR plans offer open pull requests, accept typed numbers, and reopen existing reviews", () => {
  withTasks(() => {
    const listed = () => [{ number: 7, title: "Seven", author: "a", branch: "b7", draft: false },
      { number: 8, title: "Eight", author: "c", branch: "b8", draft: true }];
    const question = asked(plan("pr", { args: {} }, listed));
    expect(question).toMatchObject({ field: "number", kind: "pick", prompt: { allow_other: true } });
    expect(question.prompt.items!.map((item) => [item.id, item.detail])).toEqual([["7", "reopen"], ["8", "draft"]]);
    expect(asked(plan("pr", { args: {} }, () => undefined)).kind).toBe("input");
    expect(asked(plan("pr", { args: { number: "abc" } }, listed)).prompt.title).toContain("isn't a pull request number");
    expect(plan("pr", { args: { number: "#8" } })).toEqual({ run: "job", title: "Review PR #8", focus: true });
    expect(plan("pr", { args: { number: 7 } })).toEqual({ run: "inline", title: "Open review-7", focus: true });
  });
});

test("Rex task plans use the source session's task, except reopen, which always picks", () => {
  withTasks((_, tasks) => {
    expect(asked(plan("setup", { sourceSession: "session:unrelated", args: {} }))).toMatchObject({ field: "task", kind: "pick" });
    const items = asked(plan("open", { sourceSession: "session:demo", args: {} })).prompt.items!;
    expect(items.map((item) => item.title)).toEqual(["demo", "half-done", "review-7"]);
    expect(items.find((item) => item.title === "half-done")!.detail).toBe("setup");
    expect(plan("open", { args: { task: tasks.demo.id } })).toEqual({ run: "inline", title: "Open demo", focus: true });
    expect(plan("setup", { sourceSession: "session:half-done", args: {} })).toEqual({ run: "job", title: "Set up half-done", focus: true });
    expect(asked(plan("fork", { sourceSession: "session:demo", args: {} })).prompt.title).toBe("Fork demo");
    expect(asked(plan("fork", { sourceSession: "session:demo", args: { name: "bad name" } })).prompt.value).toBe("bad name");
    expect(plan("fork", { sourceSession: "session:demo", args: { name: "child" } })).toEqual({ run: "job", title: "Fork demo/child", focus: true });
    expect(() => plan("fork", { sourceSession: "session:half-done", args: { name: "child" } })).toThrow("isn't ready to fork");
  });
});

test("Rex finish and refresh confirm by choosing their one item and run in the background", () => {
  withTasks(() => {
    for (const [operation, phrase, title] of [["finish", "finish demo", "Finish demo?"], ["refresh-db", "refresh demo", "Refresh demo's databases?"]]) {
      const context = { sourceSession: "session:demo", args: {} };
      const question = asked(plan(operation, context));
      expect(question).toMatchObject({ field: "confirm", kind: "pick", prompt: { title } });
      expect(question.prompt.items!.map((item) => item.id)).toEqual([phrase]);
      expect(question.prompt.items![0].subtitle).toBeTruthy();
      for (const wrong of ["", "yes", phrase.toUpperCase()]) {
        expect(asked(plan(operation, { ...context, args: { confirm: wrong } })).field).toBe("confirm");
      }
      expect(plan(operation, { ...context, args: { confirm: phrase } })).toMatchObject({ run: "job", focus: false });
    }
  });
});

test("Rex discard requires the exact typed phrase, and a wrong one says so first", () => {
  withTasks(() => {
    const context = { sourceSession: "session:demo", args: {} };
    const question = asked(plan("discard", context));
    expect(question).toMatchObject({ field: "confirm", kind: "input", prompt: { title: "Discard demo and all its work?" } });
    expect(question.prompt.placeholder).toContain("discard demo");
    for (const wrong of ["", "yes", "DISCARD DEMO"]) {
      const retry = asked(plan("discard", { ...context, args: { confirm: wrong } }));
      expect(retry.prompt.title).toBe("Type “discard demo” exactly to discard");
      expect(retry.prompt.value).toBe(wrong);
    }
    expect(plan("discard", { ...context, args: { confirm: "discard demo" } })).toMatchObject({ run: "job", focus: false });
  });
});

test("Rex todo resolves only the session's registered task and never overwrites notes", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-rex-todo-"));
  const previous = process.env.GT_STATE_DIR;
  process.env.GT_STATE_DIR = join(root, "state");
  try {
    const directory = join(root, "demo");
    mkdirSync(directory);
    const task = newWorkspace("demo", directory, "fixture");
    task.rexSession = "session:demo";
    writeWorkspace(task);

    expect(rexTask("session:demo")).toEqual({ directory, apiPort: null });
    expect(existsSync(join(directory, "scratch")), "plain task lookup must not create files").toBe(false);
    task.ports = taskPortsForSlot(7);
    writeWorkspace(task);
    expect(rexTask("session:demo")).toEqual({ directory, apiPort: 18070 });
    const todo = join(directory, "scratch", "todo.md");
    expect(rexTodo("session:demo")).toEqual({ directory, todo });
    expect(readFileSync(todo, "utf8")).toBe("");
    expect(readFileSync(join(directory, "scratch", "prompt.md"), "utf8")).toBe("");

    writeFileSync(todo, "- keep me\n");
    rexTodo("session:demo");
    expect(readFileSync(todo, "utf8")).toBe("- keep me\n");

    expect(() => rexTodo("session:other")).toThrow("isn't a Gertrude task");
    expect(() => rexTodo("--server")).toThrow("invalid Rex session");
    rmSync(directory, { recursive: true });
    expect(() => rexTodo("session:demo")).toThrow("task checkout is missing");
  } finally {
    if (previous === undefined) delete process.env.GT_STATE_DIR; else process.env.GT_STATE_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
