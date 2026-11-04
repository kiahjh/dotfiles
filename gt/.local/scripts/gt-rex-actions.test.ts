import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRexRequest, rexConfirmation, RexActionCancelled, rexTask, rexTodo } from "./gt-src/rex-actions.ts";
import { taskPortsForSlot } from "./gt-src/ports.ts";
import { newWorkspace, writeWorkspace } from "./gt-src/workspace-state.ts";

test("Rex context accepts only known operations, fields, and typed arguments", () => {
  expect(parseRexRequest("new", '{"args":{"name":"demo"}}')).toEqual({
    operation: "new", sourceSession: undefined, clientID: undefined, args: { name: "demo" },
  });
  expect(parseRexRequest("pr", '{"args":{"number":42}}').args.number).toBe(42);
  for (const [operation, raw] of [
    ["unknown", "{}"], ["new", "not-json"], ["new", "null"], ["new", "[]"],
    ["new", '{"sourceSession":"other"}'], ["new", '{"clientID":"--server"}'],
    ["new", '{"args":{"name":123}}'], ["pr", '{"args":{"number":-1}}'],
    ["pr", '{"args":{"number":1.5}}'], ["new", '{"args":{"name":"demo","discard":true}}'],
    ["finish", '{"args":{"confirm":true}}'], ["support", '{"args":{"task":"demo"}}'],
    ["finish", '{"sourceSession":"session:valid","cwd":"/must-not-guess"}'],
  ]) expect(() => parseRexRequest(operation, raw)).toThrow();
});

test("each destructive action has a distinct task-specific confirmation", () => {
  const task = newWorkspace("parent/spike", "/unused", "fixture");
  expect(rexConfirmation("finish", task)).toBe("finish parent/spike");
  expect(rexConfirmation("discard", task)).toBe("discard parent/spike");
  expect(rexConfirmation("refresh-db", task)).toBe("refresh parent/spike");
  expect(new RexActionCancelled()).toBeInstanceOf(Error);
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
