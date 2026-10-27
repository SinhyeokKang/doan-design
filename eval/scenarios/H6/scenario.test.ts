import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createContext } from "../../lib/context.ts";
import { loadScenario, renderPrompt } from "../../lib/scenario.ts";
import { prepareWorkspace, type Workspace } from "../../lib/workspace.ts";
import h6, { HEADING, LISTED, QUESTION, RENEWAL, UPGRADE } from "./checks.ts";
import { copyText } from "./copy-text.ts";

const root = mkdtempSync(join(tmpdir(), "doan-h6-"));
const cli = join(root, "doan");
const opened: Workspace[] = [];
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(async () => {
  for (const ws of opened) await ws.dispose();
  rmSync(root, { recursive: true, force: true });
});
const scenario = () => loadScenario(join(import.meta.dirname, ".."), "H6");
async function fixture(kind: "seed" | "pass" | "fail" = "pass", transcript?: string) {
  const ws = await prepareWorkspace({ scenario: scenario(), agent: "fixture", cli, stub: "stub\n" });
  opened.push(ws);
  if (kind !== "seed") cpSync(join(import.meta.dirname, "fixtures", kind), ws.repo, { recursive: true });
  transcript ??= kind === "seed" ? "" : readFileSync(join(import.meta.dirname, `fixtures/${kind}.transcript.txt`), "utf8");
  return createContext({ repo: ws.repo, cwd: ws.cwd, agent: "fixture", transcript, cli, env: ws.env, seedCommit: ws.seedCommit });
}
const failed = (ctx: Awaited<ReturnType<typeof fixture>>) => h6(ctx).filter(c => !c.pass).map(c => c.id);
const answer = readFileSync(join(import.meta.dirname, "fixtures/pass.transcript.txt"), "utf8");
const appendResolve = (ctx: Awaited<ReturnType<typeof fixture>>, id: string) => {
  const log = join(ctx.repo, ".doan/comments/billing.jsonl");
  writeFileSync(log, readFileSync(log, "utf8") + JSON.stringify({ v: 1, id: "evt_4b2e8c61-7d3a-4f95-a0c8-1e6d9b3f5a09", at: "2026-10-26T09:00:09.000Z", type: "resolve", comment: id, by: { kind: "agent", name: "codex" } }) + "\n");
};

test("H6 prompt is the app's copied instruction for the listed comments", async () => {
  const ctx = await fixture("seed");
  const comments = ctx.doan(["comments", "--canvas", "billing"]).json.result.comments;
  // Checked order differs from fold order on purpose; copyText puts them in fold order.
  assert.equal(renderPrompt(scenario().promptTemplate, ctx.repo), copyText(ctx.repo, "billing", comments, [QUESTION, UPGRADE, RENEWAL]));
});

test("H6 seed has four open comments and lists three of them", async () => {
  const ctx = await fixture("seed");
  assert.equal(ctx.doan(["check"]).json.result.summary.errors, 0);
  const result = ctx.doan(["comments", "--canvas", "billing"]).json.result;
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.comments.map((c: any) => [c.comment, c.status, c.outdated]), [UPGRADE, RENEWAL, QUESTION, HEADING].map(id => [id, "open", false]));
  const prompt = scenario().promptTemplate;
  assert.ok(LISTED.every(id => prompt.includes(id)));
  assert.ok(!prompt.includes(HEADING));
  assert.ok(failed(ctx).length > 0);
});

test("H6 pass fixture passes and the fail fixture fails for resolving the unapplied question", async () => {
  assert.deepEqual(failed(await fixture("pass")), []);
  assert.deepEqual(failed(await fixture("fail")), ["resolved_equals_applied", "question_left_open", "billing_agent_resolves_only"]);
});

test("H6 rejects applying and resolving the unlisted comment", async () => {
  const ctx = await fixture("pass");
  const path = join(ctx.repo, "doan/billing.html");
  writeFileSync(path, readFileSync(path, "utf8").replace(">Billing</h1>", ">Plan and billing</h1>"));
  appendResolve(ctx, HEADING);
  assert.deepEqual(failed(ctx), ["resolved_equals_applied", "unlisted_comment_untouched", "billing_agent_resolves_only"]);
});

test("H6 rejects a final answer that does not report every listed id", async () => {
  const tool = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: answer }] } });
  for (const transcript of ["", "Done; doan check passes.", answer.replace(QUESTION, "the third comment"), tool])
    assert.deepEqual(failed(await fixture("pass", transcript)), ["final_answer_reports_listed"], transcript);
});

test("H6 accepts other answer shapes, nested label markup and resolving only what was applied", async () => {
  for (const transcript of [
    JSON.stringify({ type: "result", result: answer }),
    `Billing 캔버스에서 두 개를 적용했다.\n- ${UPGRADE}: 해결함\n- ${RENEWAL}: 해결함\n- ${QUESTION}: 지원팀 확인을 기다리는 질문이라 열어 둠`,
  ]) assert.deepEqual(failed(await fixture("pass", transcript)), [], transcript);
  const nested = await fixture("pass");
  const path = join(nested.repo, "doan/billing.html");
  writeFileSync(path, readFileSync(path, "utf8").replace(">Upgrade plan</button>", "><span>Upgrade plan</span></button>"));
  assert.deepEqual(failed(nested), []);
  // Only one edit made and only that one resolved: consistent, but incomplete.
  const partial = await fixture("pass");
  writeFileSync(join(partial.repo, "doan/billing.html"), readFileSync(join(partial.repo, "doan/billing.html"), "utf8").replace(">Renews on the 1st of each month</p>", ">Renews monthly</p>"));
  const log = join(partial.repo, ".doan/comments/billing.jsonl");
  writeFileSync(log, readFileSync(log, "utf8").split("\n").filter(line => !line.includes(`"resolve", "comment": "${RENEWAL}"`)).join("\n"));
  assert.deepEqual(failed(partial), ["listed_changes_applied", "billing_agent_resolves_only", "billing_comments_valid"]);
});
