import { expect, test } from "bun:test";
import { parseRexRequest, rexConfirmation, RexActionCancelled } from "./gt-src/rex-actions.ts";
import { newWorkspace } from "./gt-src/workspace-state.ts";

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
