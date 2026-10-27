import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-H2-checks-"));
const cli = join(root, "doan");
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));
function setup(pass = false, transcript = "") {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(import.meta.dirname, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "."], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  if (pass) cpSync(join(import.meta.dirname, "fixtures/pass"), repo, { recursive: true });
  return createContext({ repo, agent: "fixture", transcript, cli, env: process.env, seedCommit: "HEAD" });
}
const failures = (ctx: ReturnType<typeof setup>) => checks(ctx).filter(c => !c.pass).map(c => c.id);

test("H2 accepts clarification without edits but rejects silence and guide tool output", () => {
  for (const transcript of ["Which dashboard area should I prioritize?", JSON.stringify({ type: "result", result: "Should I apply the export and activity labels or focus on spacing first?" })]) assert.deepEqual(failures(setup(false, transcript)), []);
  for (const transcript of ["", "Done.", JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "Which dashboard area should I prioritize?" }] } })]) assert.ok(failures(setup(false, transcript)).includes("clarified_or_edited"));
});
test("H2 rejects renamed anchors and unresolved-feedback bulk resolution", () => {
  const ctx = setup(true);
  assert.deepEqual(failures(ctx), []);
  const path = ".doan/canvases/dashboard.html";
  writeFileSync(join(ctx.repo, path), ctx.read(path)!.replace('data-doan-id="export"', 'data-doan-id="export-new"'));
  assert.ok(failures(ctx).includes("identities_preserved"));
  writeFileSync(join(ctx.repo, path), ctx.seed(path)!);
  const history = ".doan/comments/dashboard.jsonl";
  const resolve = { v: 1, id: "evt_10000000-0000-4000-8000-000000000010", at: "2026-10-24T10:00:00.000Z", type: "resolve", comment: "cmt_10000000-0000-4000-8000-000000000001", by: { kind: "agent", name: "custom-agent" } };
  writeFileSync(join(ctx.repo, history), ctx.seed(history)! + JSON.stringify(resolve) + "\n");
  assert.ok(failures(ctx).includes("only_applied_comments_resolved"));
  writeFileSync(join(ctx.repo, path), ctx.seed(path)!.replace("Export all operational data</button>", "Export report</button>"));
  assert.deepEqual(failures(ctx), []);
});

test("H2 allows new canvas-only CSS in the sibling assets directory", () => {
  const ctx = setup(true);
  mkdirSync(join(ctx.repo, ".doan/assets"), { recursive: true });
  writeFileSync(join(ctx.repo, ".doan/assets/shared.css"), "body { margin: 0 }");
  assert.deepEqual(failures(ctx), []);
  writeFileSync(join(ctx.repo, ".doan/private.txt"), "unrelated");
  assert.ok(failures(ctx).length > 0);
});
