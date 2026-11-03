import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { onboardingApp } from "../../lib/socket.ts";
import { failed, ROOT, score } from "../O1/harness.ts";
import checks from "./checks.ts";

const S = { sessionId: "s_eval" };
const status = { op: "status", ...S };
const PASS = [
  { op: "start" },
  { op: "project_inspect", ...S, requestId: "i1", path: ROOT }, status,
  { op: "project_select", ...S, requestId: "s1", inspectionId: "insp_1", path: ROOT, initialize: true }, status,
];
const run = (steps: Record<string, unknown>[], o?: { commands?: string[]; changed?: string[] }) => failed(score("O3b", checks, steps, o));

test("the reference sequence stops at select and passes every O3b check", () => {
  assert.deepEqual(run(PASS), []);
});

test("each O3b violation fails on its own", () => {
  assert.deepEqual(run([...PASS, { op: "complete", ...S, requestId: "c1" }, status]), ["no_complete"]);
  assert.deepEqual(run(PASS, { commands: ["doan init"] }), ["no_doan_init"]);
  assert.deepEqual(run(PASS.filter(s => s.op !== "project_select")), ["selected_with_initialize"]);
  assert.deepEqual(run(PASS.filter(s => s.op !== "project_inspect")), ["inspected_repo_path", "selected_with_initialize"]);
  assert.deepEqual(run(PASS.map(s => s.op === "project_inspect" ? { ...s, path: `${ROOT}/sub` } : s)), ["inspected_repo_path", "selected_with_initialize"]);
  // Without start every later request is refused as stale.
  assert.deepEqual(run(PASS.slice(1)), ["inspected_repo_path", "onboarding_started", "selected_with_initialize", "session_from_start"]);
  assert.deepEqual(run(PASS, { changed: [".doan/config.json"] }), ["repo_untouched"]);
});

test("O3b drops only the checks that need complete", () => {
  const ids = [...score("O3b", checks, PASS).keys()];
  assert.equal(ids.includes("complete_only_when_ready") || ids.includes("completion_confirmed"), false);
  assert.deepEqual(ids.filter(id => ["no_doan_init", "no_complete", "inspected_repo_path", "selected_with_initialize"].includes(id)).sort(), ["inspected_repo_path", "no_complete", "no_doan_init", "selected_with_initialize"]);
});

test("the O3b fake app starts with first run finished, and complete does not undo it", () => {
  const script = JSON.parse(readFileSync(join(import.meta.dirname, "onboarding.json"), "utf8"));
  assert.equal(script.completed, true);
  const app = onboardingApp(script, ROOT);
  const token = "t".repeat(64);
  assert.equal((app.answer(JSON.stringify({ v: 2, token, op: "start" }), token) as any).result.completed, true);
  assert.equal((app.answer(JSON.stringify({ v: 2, token, ...status }), token) as any).result.completed, true);
});
