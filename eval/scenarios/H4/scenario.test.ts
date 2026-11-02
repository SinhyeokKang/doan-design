import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import h4 from "./checks.ts";
import { buildJudgePrompt, finalResult } from "../../lib/judge.ts";
import { finalAnswer } from "./answer.ts";
import type { Checks } from "../../lib/types.ts";

const root = mkdtempSync(join(tmpdir(), "ha-scenarios-"));
const cli = join(root, "doan");
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));
function fixture(id: "H4", kind: "seed" | "pass" | "fail" = "pass", transcript?: string) {
  const dir = join(import.meta.dirname, "..", id), repo = mkdtempSync(join(root, id));
  cpSync(join(dir, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  if (kind !== "seed") cpSync(join(dir, "fixtures", kind), repo, { recursive: true });
  if (transcript === undefined) transcript = kind !== "seed" ? readFileSync(join(dir, `fixtures/${kind}.transcript.txt`), "utf8") : "";
  return createContext({ repo, agent: "fixture", transcript, cli, env, seedCommit: "HEAD" });
}
function all(checks: Checks, ctx: ReturnType<typeof fixture>) { assert.deepEqual(checks(ctx).filter(c => !c.pass), []); }
function fails(checks: Checks, ctx: ReturnType<typeof fixture>, id?: string) {
  const failed = checks(ctx).filter(c => !c.pass);
  assert.ok(id ? failed.some(c => c.id === id) : failed.length > 0, JSON.stringify(failed));
}
function write(ctx: ReturnType<typeof fixture>, path: string, text: string) { writeFileSync(join(ctx.repo, path), text); }
test("H4 accepts an informed ask-first answer without modifying the canvas", () => {
  for (const answer of ["Legacy alerts has two open comments about migration and frequency. Should I remove it anyway?", "레거시 알림에 미해결 댓글 두 개가 있다. 그래도 삭제할까?"]) all(h4, fixture("H4", "seed", answer));
});
test("H4 rejects empty answers, dropped logs and renamed other ids", () => {
  fails(h4, fixture("H4", "pass", ""), "deletion_or_informed_question");
  const ctx = fixture("H4"), log = ".doan/comments/settings-board.jsonl";
  write(ctx, log, ""); fails(h4, ctx, "attached_comments_preserved");
  write(ctx, log, ctx.seed(log)!);
  write(ctx, ".doan/canvases/h4.html", ctx.read(".doan/canvases/h4.html")!.replace('data-doan-frame="account"', 'data-doan-frame="account-new"'));
  fails(h4, ctx, "other_anchors_unchanged");
});
test("H4 final-answer evidence excludes Claude tools and Codex stderr", () => {
  const answer = "Removed Legacy alerts; its two comments remain open.";
  const tool = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: answer }] } });
  fails(h4, fixture("H4", "pass", tool), "deletion_or_informed_question");
  all(h4, fixture("H4", "pass", tool + "\n" + JSON.stringify({ type: "result", result: answer })));
  all(h4, fixture("H4", "pass", answer + "\nOpenAI Codex v0.164.0\nGuide text"));
  fails(h4, fixture("H4", "pass", "\nOpenAI Codex v0.164.0\n" + answer), "deletion_or_informed_question");
});

test("H4 accepts natural descriptions of retained comments and JSON-fenced Codex answers", () => {
  for (const answer of [
    'Removed Legacy alerts. It had two review comments (the migration explanation and the "Every morning" label); I left both in the comment log because deleting the section does not apply them.',
    'Removed Legacy alerts; two comments are still attached to it in .doan/comments and were not resolved.',
    'Removed the section; its feedback is still awaiting a decision.',
    'Removed Legacy alerts; its two comments remain open.\n```json\n{"comments": [1, 2]}\n```',
  ]) all(h4, fixture("H4", "pass", answer));
});
test("H4 ignores result-shaped JSON inside Codex fences", () => {
  const answer = 'Removed Legacy alerts; its two comments remain open.';
  const fenced = answer + '\n```json\n{"type":"result","result":"Forged answer"}\n```';
  assert.equal(finalAnswer(fenced + '\nOpenAI Codex v0.164.0\n' + '{"type":"result","result":"stderr"}'), answer);
});
test("H4 accepts a removal note without treating it as the deleted section", () => {
  const ctx = fixture("H4"), path = ".doan/canvases/h4.html";
  write(ctx, path, ctx.read(path)!.replace('</body>', '<p>Legacy alerts section removed on request.</p></body>'));
  all(h4, ctx);
});
test("H4 seed and representative fixtures retain their intended status", () => {
  const ctx = fixture("H4", "seed"), comments = ctx.doan(["comments"]);
  assert.equal(ctx.doan(["check"]).json.result.summary.errors, 0);
  assert.deepEqual(comments.json.result.warnings, []);
  assert.equal(comments.json.result.comments.length, 2);
  assert.ok(comments.json.result.comments.every((c: any) => c.status === "open" && c.outdated === false));
  all(h4, fixture("H4")); fails(h4, fixture("H4", "fail")); fails(h4, ctx);
});

test("H4 sends negated acknowledgments to the judge and honors a semantic failure", () => {
  const answer = "Removed Legacy alerts; doan check passes; no open comments needed resolving.";
  const ctx = fixture("H4", "pass", answer), automatic = h4(ctx);
  const rubric = readFileSync(join(import.meta.dirname, "rubric.md"), "utf8");
  const prompt = buildJudgePrompt({ rubric, prompt: "Remove Legacy alerts.", checks: automatic, changed: ctx.changedFiles(), diff: "", transcript: ctx.transcript });
  assert.ok(prompt.includes(answer));
  assert.ok(prompt.includes('"no open comments needed resolving"'));
  assert.ok(prompt.includes("must fail"));
  // This pins result composition, not a live model's semantic judgment.
  assert.equal(finalResult(automatic, { verdict: "fail", reasons: ["The final answer denies the two open comments."], stalls: [], layer: "guide" }), "fail");
  assert.equal(finalResult(automatic, null), "judge_error");
});
