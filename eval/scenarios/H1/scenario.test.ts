import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import h1, { commentId } from "./checks.ts";
import type { Checks } from "../../lib/types.ts";

const root = mkdtempSync(join(tmpdir(), "ha-scenarios-"));
const cli = join(root, "doan");
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));
function fixture(id: "H1", kind: "seed" | "pass" | "fail" = "pass", transcript?: string) {
  const dir = join(import.meta.dirname, "..", id), repo = mkdtempSync(join(root, id));
  cpSync(join(dir, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  if (kind !== "seed") cpSync(join(dir, "fixtures", kind), repo, { recursive: true });
  if (transcript === undefined) transcript = "";
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

test("H1 seed has clean checks, warning-free comments and the intended counts", () => {
  for (const [id, count] of [["H1", 12]] as const) {
    const ctx = fixture(id, "seed"), check = ctx.doan(["check"]), comments = ctx.doan(["comments"]);
    assert.equal(check.code, 0); assert.equal(check.json.result.summary.errors, 0);
    assert.equal(comments.code, 0); assert.deepEqual(comments.json.result.warnings, []);
    assert.equal(comments.json.result.comments.length, count);
    assert.ok(comments.json.result.comments.every((c: any) => c.status === "open" && c.outdated === (id === "H1" && c.comment === commentId(11))));
  }
});
test("H1 no-op fails and both representative fixtures score correctly", () => {
  for (const [id, checks] of [["H1", h1]] as const) {
    all(checks, fixture(id)); fails(checks, fixture(id, "fail")); fails(checks, fixture(id, "seed"));
  }
});
test("H1 preserves existing identities while allowing new annotated elements", () => {
  const ctx = fixture("H1"), path = "design/h1.html", original = ctx.read(path)!;
  write(ctx, path, original.replace('</body>', '<p data-doan-id="pending-decision">Pending heading decision.</p></body>'));
  all(h1, ctx);
  write(ctx, path, original.replace('data-doan-id="save"', 'data-doan-id="renamed-save"'));
  fails(h1, ctx, "ids_stable");
  write(ctx, path, original.replace('</body>', '<p data-doan-id="save">Duplicate</p></body>'));
  fails(h1, ctx, "ids_stable");
  write(ctx, path, original.replace('<button data-doan-id="save">Save workspace</button>', '').replace('</body>', '<button data-doan-id="save">Save workspace</button></body>'));
  fails(h1, ctx, "ids_stable");
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

test("H1 stale target records the earlier canvas that contained it", () => {
  const ctx = fixture("H1", "seed"), page = ctx.read("design/h1.html")!;
  const events = ctx.read(".doan/comments/review-board.jsonl")!.trim().split("\n").map(line => JSON.parse(line));
  const stale = events.find(e => e.comment === commentId(11));
  const earlier = page.replace('  <h2 data-doan-id="digest-heading">', '  <button data-doan-id="old-export">Export</button>\n  <h2 data-doan-id="digest-heading">');
  assert.equal(stale.canvasHash, "sha256:" + createHash("sha256").update(earlier).digest("hex"));
  assert.ok(events.filter(e => e !== stale).every(e => e.at > stale.at));
});
