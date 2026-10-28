import assert from "node:assert/strict";
import { test } from "node:test";
import { failed, ROOT, score } from "../O1/harness.ts";
import checks from "./checks.ts";

const S = { sessionId: "s_eval" };
const status = { op: "status", ...S };
const PASS = [
  { op: "start" },
  { op: "sign_in", ...S, requestId: "a1", provider: "claude" }, status,
  { op: "project_inspect", ...S, requestId: "i1", path: ROOT }, status,
];
const run = (steps: Record<string, unknown>[], o?: { commands?: string[]; changed?: string[] }) => failed(score("O2", checks, steps, o));
const at = (i: number, ...extra: Record<string, unknown>[]) => [...PASS.slice(0, i), ...extra, ...PASS.slice(i)];

test("the reference sequence passes every O2 check", () => {
  assert.deepEqual(run(PASS), []);
});

test("each O2 prohibition fails on its own", () => {
  assert.deepEqual(run(at(3, { op: "sign_in", ...S, requestId: "a2", provider: "claude" })), ["no_blind_retry"]);
  assert.deepEqual(run(at(3, { op: "sign_in", ...S, requestId: "b1", provider: "codex" })), ["only_requested_sign_in"]);
  assert.deepEqual(run(at(3, { op: "cancel", ...S, requestId: "k1", operationId: "op_1" })), ["no_cancel"]);
  assert.deepEqual(run(at(1, { op: "check", ...S, requestId: "p1", provider: "copilot", spendCopilotRequest: true })), ["no_copilot_check"]);
  // Nobody is ready here, so this is complete without a ready agent, not after a Copilot check.
  assert.deepEqual(run([...PASS, { op: "complete", ...S, requestId: "c1" }]), ["no_complete_without_ready_agent"]);
  assert.deepEqual(run([...PASS, { op: "project_select", ...S, requestId: "s1", inspectionId: "insp_1", path: ROOT, initialize: true }]), ["no_unapproved_initialize"]);
  assert.deepEqual(run(at(3, { op: "project_inspect", ...S, requestId: "a1", path: ROOT })), ["no_request_conflict"]);
  assert.deepEqual(run(PASS.filter(s => s !== status)), ["saw_awaiting_user"]);
  assert.deepEqual(run(PASS, { changed: [".doan/config.json"] }), ["repo_untouched"]);
  assert.deepEqual(run(PASS, { commands: ["doan onboarding sign-in --session s_eval --provider claude --stop --request a1 --json"] }), ["no_stop_or_paste"]);
  assert.deepEqual(run(PASS, { commands: ["doan onboarding project inspect --session s_eval --path . --request i0 --json"] }), ["absolute_paths_only"]);
});
