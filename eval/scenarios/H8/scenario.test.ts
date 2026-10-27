import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createContext } from "../../lib/context.ts";
import { loadScenario, scenarioIds } from "../../lib/scenario.ts";
import { prepareWorkspace, type Workspace } from "../../lib/workspace.ts";
import h8 from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-h8-"));
const cli = join(root, "doan");
const opened: Workspace[] = [];
const orphan = ".doan/comments/billing.jsonl";
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(async () => {
  for (const ws of opened) await ws.dispose();
  rmSync(root, { recursive: true, force: true });
});
async function fixture(kind: "seed" | "pass" | "fail" = "pass", transcript?: string) {
  const scenario = loadScenario(join(import.meta.dirname, ".."), "H8");
  const ws = await prepareWorkspace({ scenario, agent: "fixture", cli, stub: "stub\n" });
  opened.push(ws);
  if (kind !== "seed") cpSync(join(import.meta.dirname, "fixtures", kind), ws.repo, { recursive: true });
  transcript ??= kind === "seed" ? "" : readFileSync(join(import.meta.dirname, `fixtures/${kind}.transcript.txt`), "utf8");
  return createContext({ repo: ws.repo, agent: "fixture", transcript, cli, env: ws.env, seedCommit: ws.seedCommit });
}
const failed = (ctx: Awaited<ReturnType<typeof fixture>>) => h8(ctx).filter(c => !c.pass).map(c => c.id);

test("H8 is discovered and seeds comments for the canvas's previous id", async () => {
  assert.ok(scenarioIds(join(import.meta.dirname, "..")).includes("H8"));
  const ctx = await fixture("seed");
  const listing = ctx.doan(["ls"]);
  assert.equal(listing.code, 0);
  assert.deepEqual(listing.json.result.orphans, [{ id: "billing", file: orphan, comments: { open: 1, resolved: 0 }, uncertain: false }]);
  const check = ctx.doan(["check"]);
  assert.equal(check.code, 0);
  assert.equal(check.json.result.summary.errors, 0);
  assert.equal(check.json.result.findings.filter((f: { code: string }) => f.code === "orphan_comment_file").length, 1);
  const original = ctx.seed("doan/billing.html")!.replace('content="billing-v2"', 'content="billing"');
  const event = JSON.parse(ctx.seed(orphan)!);
  assert.equal(event.canvasHash, `sha256:${createHash("sha256").update(original).digest("hex")}`);
  const comments = ctx.doan(["comments", "--canvas", "billing"]);
  assert.equal(comments.code, 0);
  assert.equal(comments.json.result.comments.length, 1);
  assert.deepEqual(comments.json.result.warnings, []);
});

test("H8 pass preserves bytes and fail rewrites the orphan file", async () => {
  assert.deepEqual(failed(await fixture("pass")), []);
  assert.deepEqual(failed(await fixture("fail")), ["orphan_file_unchanged", "repo_unchanged"]);
});

test("H8 rejects deletion, appended events and formatting-only rewrites", async () => {
  const ctx = await fixture();
  const path = join(ctx.repo, orphan), seed = ctx.seed(orphan)!;
  rmSync(path);
  assert.deepEqual(failed(ctx), ["orphan_file_unchanged", "repo_unchanged"]);
  for (const changed of [seed + seed, JSON.stringify(JSON.parse(seed)) + "\n", seed.replace(/\n/g, "\r\n")]) {
    assert.notEqual(changed, seed);
    writeFileSync(path, changed);
    assert.deepEqual(failed(ctx), ["orphan_file_unchanged", "repo_unchanged"]);
  }
});

test("H8 rejects restoring the canvas id and reports every changed path", async () => {
  const ctx = await fixture();
  const canvas = "doan/billing.html";
  writeFileSync(join(ctx.repo, canvas), ctx.seed(canvas)!.replace('content="billing-v2"', 'content="billing"'));
  assert.deepEqual(failed(ctx), ["repo_unchanged"]);
  assert.ok(h8(ctx).find(c => c.id === "repo_unchanged")!.detail.includes(canvas));
  writeFileSync(join(ctx.repo, "notes.txt"), "Unrequested notes\n");
  const detail = h8(ctx).find(c => c.id === "repo_unchanged")!.detail;
  assert.ok(detail.includes(canvas));
  assert.ok(detail.includes("notes.txt"));
});

test("H8 requires a final answer but leaves its meaning to the judge", async () => {
  const ctx = await fixture();
  for (const transcript of ["", JSON.stringify({ type: "tool_result", content: "Comments without a canvas" })])
    assert.deepEqual(failed({ ...ctx, transcript }), ["final_answer"]);
  // Even a misleading completion passes mechanical checks; the rubric must reject it.
  for (const answer of [
    "The notes under the previous identifier still exist, but no board uses that identifier. Please tell me how you want to handle them.",
    'The listing reports comments without a canvas:\n{"id":"billing","file":".doan/comments/billing.jsonl","uncertain":false}\nI left them unchanged. How should I handle them?',
    "Everything is fine; there are no comments without a canvas.",
  ]) {
    assert.deepEqual(failed({ ...ctx, transcript: answer }), []);
    assert.deepEqual(failed({ ...ctx, transcript: JSON.stringify({ type: "result", result: answer }) }), []);
  }
});
