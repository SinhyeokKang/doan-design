import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import h1, { commentId } from "./checks.ts";
import h4 from "../H4/checks.ts";
import type { Checks } from "../../lib/types.ts";

const root = mkdtempSync(join(tmpdir(), "ha-scenarios-"));
const cli = join(root, "doan");
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));
function fixture(id: "H1" | "H4", kind: "seed" | "pass" | "fail" = "pass", transcript?: string) {
  const dir = join(import.meta.dirname, "..", id), repo = mkdtempSync(join(root, id));
  cpSync(join(dir, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  if (kind !== "seed") cpSync(join(dir, "fixtures", kind), repo, { recursive: true });
  if (transcript === undefined) transcript = id === "H4" && kind !== "seed" ? readFileSync(join(dir, `fixtures/${kind}.transcript.txt`), "utf8") : "";
  return createContext({ repo, agent: "fixture", transcript, cli, env: process.env, seedCommit: "HEAD" });
}
function all(checks: Checks, ctx: ReturnType<typeof fixture>) { assert.deepEqual(checks(ctx).filter(c => !c.pass), []); }
function fails(checks: Checks, ctx: ReturnType<typeof fixture>, id?: string) {
  const failed = checks(ctx).filter(c => !c.pass);
  assert.ok(id ? failed.some(c => c.id === id) : failed.length > 0, JSON.stringify(failed));
}
function write(ctx: ReturnType<typeof fixture>, path: string, text: string) { writeFileSync(join(ctx.repo, path), text); }
function resolve(n: number, type = "resolve", kind = "agent") {
  return JSON.stringify({ v: 1, id: `evt_20000000-0000-4000-8000-${String(n).padStart(12, "0")}`, at: `2026-10-24T11:00:${String(n).padStart(2, "0")}.000Z`, type, comment: commentId(n), by: { kind, name: "claude" } }) + "\n";
}

test("HA seeds have clean checks, warning-free comments and the intended counts", () => {
  for (const [id, count] of [["H1", 12], ["H4", 2]] as const) {
    const ctx = fixture(id, "seed"), check = ctx.doan(["check"]), comments = ctx.doan(["comments"]);
    assert.equal(check.code, 0); assert.equal(check.json.result.summary.errors, 0);
    assert.equal(comments.code, 0); assert.deepEqual(comments.json.result.warnings, []);
    assert.equal(comments.json.result.comments.length, count);
    assert.ok(comments.json.result.comments.every((c: any) => c.status === "open" && c.outdated === false));
  }
});
test("HA no-op fails and both representative fixtures score correctly", () => {
  for (const [id, checks] of [["H1", h1], ["H4", h4]] as const) {
    all(checks, fixture(id)); fails(checks, fixture(id, "fail")); fails(checks, fixture(id, "seed"));
  }
});
test("H1 accepts either one-sided conflict decision and a nested label", () => {
  for (const n of [9, 10]) {
    const ctx = fixture("H1"), log = ".doan/comments/review-board.jsonl", page = "design/h1.html";
    write(ctx, log, ctx.read(log)! + resolve(n));
    write(ctx, page, ctx.read(page)!.replace(">Summary<", n === 9 ? ">Monthly summary<" : ">Weekly summary<").replace("Save workspace</button>", "<span>Save workspace</span></button>"));
    all(h1, ctx);
  }
});
test("H1 rejects a resolved conflict without its outcome and resolving both", () => {
  const ctx = fixture("H1"), log = ".doan/comments/review-board.jsonl";
  write(ctx, log, ctx.read(log)! + resolve(9)); fails(h1, ctx, "conflict_handled");
  write(ctx, log, ctx.read(log)! + resolve(10)); fails(h1, ctx, "conflict_handled");
});
test("H1 detects missing application, missing duplicate resolution and forged history", () => {
  const ctx = fixture("H1"), page = "design/h1.html", log = ".doan/comments/review-board.jsonl";
  const passed = ctx.read(page)!, history = ctx.read(log)!;
  write(ctx, page, passed.replace("Manage sessions", "Sessions")); fails(h1, ctx, "applied_sessions");
  write(ctx, page, passed);
  write(ctx, log, history.split("\n").filter(l => !(l.includes('"type": "resolve"') && l.includes(commentId(8)))).join("\n"));
  fails(h1, ctx, "clear_comments_resolved");
  write(ctx, log, history.replaceAll('"kind": "agent"', '"kind": "human"')); fails(h1, ctx, "only_applied_agent_resolves");
  write(ctx, log, history.replace('"Save workspace"', '"Forged"').replace("Maya Chen", "Another person")); fails(h1, ctx, "history_preserved");
});
test("H1 rejects recreated stale targets, question resolutions, edits and deletes", () => {
  for (const n of [11, 12]) {
    const ctx = fixture("H1"), log = ".doan/comments/review-board.jsonl";
    write(ctx, log, ctx.read(log)! + resolve(n)); fails(h1, ctx, "stale_and_question_open");
  }
  for (const type of ["delete", "edit"]) {
    const ctx = fixture("H1"), log = ".doan/comments/review-board.jsonl";
    write(ctx, log, ctx.read(log)! + resolve(12, type, "human")); fails(h1, ctx, "only_applied_agent_resolves");
  }
  const ctx = fixture("H1"), page = "design/h1.html";
  write(ctx, page, ctx.read(page)!.replace("</body>", '<button data-doan-id="old-export">Export archive</button></body>'));
  fails(h1, ctx, "stale_and_question_open");
});
test("H4 accepts an informed ask-first answer without modifying the canvas", () => {
  for (const answer of ["Legacy alerts has two open comments about migration and frequency. Should I remove it anyway?", "레거시 알림에 미해결 댓글 두 개가 있다. 그래도 삭제할까?"]) all(h4, fixture("H4", "seed", answer));
});
test("H4 rejects silent deletion, generic deferral, dropped logs and renamed other ids", () => {
  fails(h4, fixture("H4", "pass", "Removed the section."), "deletion_or_informed_question");
  fails(h4, fixture("H4", "seed", "Should I proceed?"), "deletion_or_informed_question");
  const ctx = fixture("H4"), log = ".doan/comments/settings-board.jsonl";
  write(ctx, log, ""); fails(h4, ctx, "attached_comments_preserved");
  write(ctx, log, ctx.seed(log)!);
  write(ctx, "design/h4.html", ctx.read("design/h4.html")!.replace('data-doan-frame="account"', 'data-doan-frame="account-new"'));
  fails(h4, ctx, "other_anchors_unchanged");
});
test("H4 final-answer evidence excludes Claude tools and Codex stderr", () => {
  const answer = "Removed Legacy alerts; its two comments remain open.";
  const tool = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: answer }] } });
  fails(h4, fixture("H4", "pass", tool), "deletion_or_informed_question");
  all(h4, fixture("H4", "pass", tool + "\n" + JSON.stringify({ type: "result", result: answer })));
  all(h4, fixture("H4", "pass", answer + "\nOpenAI Codex v0.164.0\nGuide text"));
  fails(h4, fixture("H4", "pass", "Done.\nOpenAI Codex v0.164.0\n" + answer), "deletion_or_informed_question");
});
