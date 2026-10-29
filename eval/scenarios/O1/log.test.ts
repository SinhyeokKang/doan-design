import assert from "node:assert/strict";
import { test } from "node:test";
import { lastState, noBlindRetry, oneSession, type Exchange } from "./log.ts";

const S = { v: 2, sessionId: "s_eval" };
const start: Exchange = { request: { v: 2, op: "start" }, response: { v: 2, ok: true, op: "start", result: { sessionId: "s_eval", operations: [] } } };
const inspect = (requestId: string, operationId: string | null): Exchange => ({
  request: { ...S, op: "project_inspect", requestId, path: "/r" },
  response: operationId ? { v: 2, ok: true, op: "project_inspect", result: { operation: { operationId, requestId, kind: "project_inspect", state: "running" } } } : { v: 2, ok: false, error: { code: "busy", message: "m" } },
});
const status = (operationId: string, state: string): Exchange => ({ request: { ...S, op: "status" }, response: { v: 2, ok: true, op: "status", result: { sessionId: "s_eval", operations: [{ operationId, state }] } } });
const retried = (log: Exchange[]) => !noBlindRetry(log).pass;

test("a blind retry is an accepted request repeated under a new id before its outcome was seen", () => {
  assert.equal(retried([start, inspect("a", "op_1"), inspect("b", "op_2")]), true);
  assert.equal(retried([start, inspect("a", "op_1"), status("op_1", "running"), inspect("b", "op_2")]), true);
  assert.equal(retried([start, inspect("a", "op_1"), inspect("a", "op_1")]), false, "same requestId re-queries");
  assert.equal(retried([start, inspect("a", null), inspect("b", "op_1")]), false, "the first was refused");
  for (const state of ["succeeded", "failed", "cancelled"])
    assert.equal(retried([start, inspect("a", "op_1"), status("op_1", state), inspect("b", "op_2")]), false, state);
});

test("lastState reads the latest report before an index", () => {
  const log = [start, inspect("a", "op_1"), status("op_1", "succeeded")];
  assert.equal(lastState(log, 2, "op_1"), "running");
  assert.equal(lastState(log, 3, "op_1"), "succeeded");
  assert.equal(lastState(log, 3, "op_9"), null);
});

test("requests must stay in the started session", () => {
  assert.equal(oneSession([start, inspect("a", "op_1")]).pass, true);
  assert.equal(oneSession([inspect("a", "op_1")]).pass, false);
  assert.equal(oneSession([start, { ...inspect("a", "op_1"), request: { ...inspect("a", "op_1").request, sessionId: "s_old" } }]).pass, false);
});
