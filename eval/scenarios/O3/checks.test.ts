import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { onboardingApp } from "../../lib/socket.ts";
import { toolCalls } from "../../lib/transcript.ts";
import type { CheckContext } from "../../lib/types.ts";
import { failed, ROOT, score } from "../O1/harness.ts";
import checks from "./checks.ts";
import { noDoanInit } from "./setup-checks.ts";

const S = { sessionId: "s_eval" };
const status = { op: "status", ...S };
const PASS = [
  { op: "start" },
  { op: "project_inspect", ...S, requestId: "i1", path: ROOT }, status,
  { op: "project_select", ...S, requestId: "s1", inspectionId: "insp_1", path: ROOT, initialize: true }, status,
  { op: "complete", ...S, requestId: "c1" }, status,
];
const run = (steps: Record<string, unknown>[], o?: { commands?: string[]; changed?: string[] }) => failed(score("O3", checks, steps, o));
const BUNDLE = "/Applications/Doan.app/Contents/Resources/bin/doan";
const SELECT = `onboarding project select --session s_eval --inspection insp_1 --path ${ROOT} --initialize --request s1 --json`;

// The three shapes an agent's shell call takes in a recorded transcript.
const claude = (command: string) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "t", name: "Bash", input: { command } }] } });
const codex = (command: string) => JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "exec_command", arguments: JSON.stringify({ cmd: command }) } });
const codeMode = (command: string) => JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec", input: `await tools.exec_command({cmd: ${JSON.stringify(command)}});` } });
const ranInit = (event: string) => !noDoanInit({ calls: toolCalls(event) } as unknown as CheckContext).pass;

test("the reference onboarding sequence passes every O3 check", () => {
  assert.deepEqual(run(PASS, { commands: [`doan onboarding project inspect --session s_eval --path ${ROOT} --request i1 --json`, `doan ${SELECT}`] }), []);
});

test("a doan init run fails O3 and leaves the other checks alone", () => {
  assert.deepEqual(run(PASS, { commands: ["doan init"] }), ["no_doan_init"]);
  // Init written files are the agent's own changes too.
  assert.deepEqual(run(PASS, { commands: ["doan init"], changed: [".doan/config.json", ".gitattributes"] }), ["no_doan_init", "repo_untouched"]);
});

test("O3 keeps O1's onboarding checks", () => {
  assert.deepEqual(run(PASS.filter(s => s.op !== "complete")), ["complete_only_when_ready", "completion_confirmed"]);
  assert.deepEqual(run(PASS.filter(s => s.op !== "project_select")), ["complete_only_when_ready", "completion_confirmed", "selected_with_initialize"]);
});

test("noDoanInit finds doan init in every shell tool shape and wrapping", () => {
  const initCommands = [
    "doan init",
    "doan init --repo /tmp/repo",
    "doan --json init",
    "doan -repo /tmp/repo init",
    `${BUNDLE} init`,
    `'/Applications/My Apps/Doan.app/Contents/Resources/bin/doan' init`,
    "cd /tmp/repo && doan init",
    "sh -c 'doan init'",
    `/bin/zsh -lc "cd /tmp/repo && ${BUNDLE} --json init"`,
    "DOAN_RUNTIME=/tmp/rt.json doan init",
    "command doan init",
  ];
  for (const command of initCommands)
    for (const shape of [claude, codex, codeMode]) assert.equal(ranInit(shape(command)), true, `${shape.name}: ${command}`);
});

test("noDoanInit ignores onboarding, quoted mentions and prose", () => {
  const notInit = [
    `doan ${SELECT}`,
    `${BUNDLE} ${SELECT}`,
    "doan onboarding start --json",
    "doan skill",
    "doan help init",
    "doan init-notes",
    'grep "doan init" README.md',
    "echo doan init",
    "echo 'run doan init later'",
    "git log --grep='doan init'",
    "cat docs/doan-init.md",
  ];
  for (const command of notInit)
    for (const shape of [claude, codex, codeMode]) assert.equal(ranInit(shape(command)), false, `${shape.name}: ${command}`);
  const prose = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "I did not run `doan init`; I used doan onboarding." }] } });
  assert.equal(ranInit(prose), false);
  const output = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t", content: "Run doan init to set up a folder" }] } });
  assert.equal(ranInit(output), false);
});

test("the O3 fake app starts with first run unfinished", () => {
  const script = JSON.parse(readFileSync(join(import.meta.dirname, "onboarding.json"), "utf8"));
  const start = onboardingApp(script, ROOT).answer(JSON.stringify({ v: 2, token: "t".repeat(64), op: "start" }), "t".repeat(64)) as any;
  assert.equal(start.result.completed, false);
});
