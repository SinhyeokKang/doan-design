import assert from "node:assert/strict";
import { test } from "node:test";
import type { WireRow } from "./conversation-checks";
const { verifyConversation, assertCodexResponse }: typeof import("./conversation-checks") = await import(new URL("./conversation-checks.ts", import.meta.url).href);
const { suiteGuard }: typeof import("./harness") = await import(new URL("./harness.ts", import.meta.url).href);

for (const failed of [[0], [1], [2], [0, 1, 2]]) {
  test(`verification attempts every obligation and propagates failures ${failed}`, async () => {
    const attempted: number[] = [];
    const errors = [new Error("synthetic copy ENOENT"), new Error("synthetic state mismatch"), new Error("synthetic surviving peer")];
    const check = (i: number) => async () => { attempted.push(i); if (failed.includes(i)) throw errors[i]; };
    let cleaned = false;
    const guard = suiteGuard({ name: "conversation-fixture", app: () => undefined,
      verify: () => verifyConversation(check(0), check(1), check(2)), cleanup: async () => { cleaned = true; } });
    await assert.rejects(guard.finish(), error => {
      assert.ok(error instanceof AggregateError);
      assert.ok(error.errors[0] instanceof AggregateError);
      assert.deepEqual(error.errors[0].errors, failed.map(i => errors[i]));
      return true;
    });
    assert.deepEqual(attempted, [0, 1, 2]);
    assert.equal(cleaned, true);
  });
}

test("verification accepts three successful obligations", async () => {
  const attempted: string[] = [];
  await verifyConversation(async () => { attempted.push("copy"); }, async () => { attempted.push("state"); }, async () => { attempted.push("peers"); });
  assert.deepEqual(attempted, ["copy", "state", "peers"]);
});

const pid = 123, id = "approval-fixture";
const rejected = { error: { code: -32601, message: "Unsupported request or unavailable owner." } };
const row = (payload: Record<string, unknown>, server = pid, request = id): WireRow => ({ runtime: "codex", pid: server, kind: "in", value: { id: request, ...payload } });
for (const payload of [rejected, { result: { decision: "accept" } }, { result: { decision: "decline" } }]) {
  test(`native response accepts sole exact payload ${JSON.stringify(payload)}`, () => {
    assert.doesNotThrow(() => assertCodexResponse([row(payload)], pid, id, payload));
  });
}
for (const [name, rows] of [
  ["error plus success duplicate", [row(rejected), row({ result: {} })]],
  ["wrong error code", [row({ error: { ...rejected.error, code: 123 } })]],
  ["wrong error message", [row({ error: { ...rejected.error, message: "wrong error" } })]],
  ["response only from another server", [row(rejected, pid + 1)]],
  ["response only for another request", [row(rejected, pid, "previous")]],
] as const) {
  test(`native response rejects ${name}`, () => {
    assert.throws(() => assertCodexResponse([...rows], pid, id, rejected));
  });
}
test("unrelated server, request and method do not count as the scoped response", () => {
  assert.doesNotThrow(() => assertCodexResponse([row(rejected), row(rejected, pid + 1), row(rejected, pid, "previous"), row({ method: "notification" })], pid, id, rejected));
});
test("allow cannot be satisfied by a previous permission or a decline", () => {
  assert.throws(() => assertCodexResponse([row({ result: { decision: "accept" } }, pid, "previous"), row({ result: { decision: "decline" } })], pid, id, { result: { decision: "accept" } }));
});
