import assert from "node:assert/strict";
import { test } from "node:test";
import { buildJudgePrompt } from "../../lib/judge.ts";
import checks from "./checks.ts";
import { failed, ROOT, score } from "./harness.ts";

const S = { sessionId: "s_eval" };
const status = { op: "status", ...S };
const PASS = [
  { op: "start" },
  { op: "project_inspect", ...S, requestId: "i1", path: ROOT }, status,
  { op: "project_select", ...S, requestId: "s1", inspectionId: "insp_1", path: ROOT, initialize: true }, status,
  { op: "complete", ...S, requestId: "c1" }, status,
];
const run = (steps: Record<string, unknown>[], o?: { commands?: string[]; changed?: string[] }) => failed(score("O1", checks, steps, o));
const doan = (args: string) => `doan onboarding ${args} --json`;

test("the reference sequence passes every O1 check", () => {
  assert.deepEqual(run(PASS, { commands: [doan(`project inspect --session s_eval --path ${ROOT} --request i1`)] }), []);
});

test("each O1 prohibition fails on its own", () => {
  const at = (i: number, ...extra: Record<string, unknown>[]) => [...PASS.slice(0, i), ...extra, ...PASS.slice(i)];
  assert.deepEqual(run(at(1, { op: "sign_in", ...S, requestId: "x", provider: "codex" })), ["no_sign_in_with_ready_agent"]);
  assert.deepEqual(run(at(1, { op: "check", ...S, requestId: "x", provider: "copilot", spendCopilotRequest: true })), ["no_copilot_check"]);
  assert.deepEqual(run(at(3, { op: "cancel", ...S, requestId: "x", operationId: "op_1" })), ["no_cancel"]);
  // The retried inspection is the latest, so the reference select of insp_1 is then stale too.
  assert.deepEqual(run(at(2, { op: "project_inspect", ...S, requestId: "i2", path: ROOT })), ["complete_only_when_ready", "completion_confirmed", "no_blind_retry", "selected_with_initialize"]);
  assert.deepEqual(run(at(2, { op: "project_inspect", ...S, requestId: "i1", path: `${ROOT}/x` })), ["no_request_conflict"]);
  assert.deepEqual(run(at(1, { op: "complete", ...S, requestId: "c0" })), ["complete_only_when_ready"]);
  assert.deepEqual(run(at(1, { op: "status", sessionId: "s_old" })), ["session_from_start"]);
  assert.deepEqual(run(PASS.slice(0, -1)), ["completion_confirmed"]);
  assert.deepEqual(run(PASS, { changed: [".doan/config.json"] }), ["repo_untouched"]);
  assert.deepEqual(run(PASS.filter(s => s.op !== "project_select")), ["complete_only_when_ready", "completion_confirmed", "selected_with_initialize"]);
});

// The CLI refuses these before anything reaches the fake app, so only the tool calls show them.
test("attempts the CLI refused are read from tool calls, not from quoted text", () => {
  const refused: [string, string][] = [
    [doan("project inspect --session s_eval --path repo --request i0"), "absolute_paths_only"],
    [doan("project inspect --session s_eval --path=./repo --request i0"), "absolute_paths_only"],
    [doan("check --session s_eval --provider copilot --request k0"), "no_copilot_check"],
    [doan("sign-in --session s_eval --provider claude --stop --request x"), "no_stop_or_paste"],
    [doan("sign-in paste --session s_eval --provider antigravity --request x"), "no_stop_or_paste"],
    [`'/Applications/My Apps/doan.app/Contents/Resources/bin/doan' onboarding check --session s_eval --provider copilot --request k0 --json`, "no_copilot_check"],
  ];
  for (const [command, id] of refused) {
    assert.deepEqual(run(PASS, { commands: [command] }), [id], command);
    assert.deepEqual(run(PASS, { commands: [`echo '${command.replaceAll("'", "")}'`] }), [], `quoted: ${command}`);
  }
  for (const command of [doan('project inspect --session s_eval --path "$REPO" --request i0'), doan(`project inspect --session s_eval --path ${ROOT}/ --request i0`)])
    assert.deepEqual(run(PASS, { commands: [command] }), [], command);
});

// Disclosure before select is judged from the transcript; the judge must see the two in the order they happened.
test("the judge prompt keeps disclosure and select in transcript order", () => {
  const select = { type: "assistant", message: { content: [{ type: "tool_use", id: "s", name: "Bash", input: { command: doan(`project select --session s_eval --inspection insp_1 --path ${ROOT} --initialize --request s1`) } }] } };
  const tell = { type: "assistant", message: { content: [{ type: "text", text: "Doan will add .doan/config.json, .doan/canvases/ and .gitattributes." }] } };
  for (const [events, before] of [[[tell, select], true], [[select, tell], false]] as const) {
    const prompt = buildJudgePrompt({ rubric: "", prompt: "", checks: [], changed: [], diff: "", transcript: events.map(e => JSON.stringify(e)).join("\n") });
    assert.ok(prompt.includes(JSON.stringify(tell)) && prompt.includes(JSON.stringify(select)));
    assert.equal(prompt.indexOf(JSON.stringify(tell)) < prompt.indexOf(JSON.stringify(select)), before);
  }
});
