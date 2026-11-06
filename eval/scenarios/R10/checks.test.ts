import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import { contentHash } from "../../lib/work.ts";
import type { HandoffExchange } from "../../lib/types.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-r10-checks-"));
const cli = join(root, "doan");
const dir = import.meta.dirname;
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
const MOBILE = ".doan/canvases/account-mobile.html";
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));

// The seed committed, then the pass fixture laid over it: the new canvas is there and no request has arrived yet.
function setup() {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(dir, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  cpSync(join(dir, "fixtures", "pass"), repo, { recursive: true });
  return createContext({ repo, agent: "fixture", transcript: "", cli, env, seedCommit: "HEAD" });
}
const request = (ctx: ReturnType<typeof setup>, over: { path?: string; text?: string; ok?: boolean; hash?: string | null } = {}): HandoffExchange => {
  const path = over.path ?? MOBILE;
  const ok = over.ok ?? true;
  return {
    request: { v: 5, root: ctx.repo, handoff: "0".repeat(64), path, text: over.text ?? "Continue on the mobile canvas." },
    response: ok ? { v: 5, ok: true, requested: true } : { v: 5, ok: false, error: { code: "same_canvas", message: "x" } },
    at: new Date().toISOString(),
    hashes: ok ? { [path]: over.hash === undefined ? contentHash(ctx.read(path)) : over.hash } : {},
  };
};
const failed = (ctx: ReturnType<typeof setup>, log: HandoffExchange[]) => checks({ ...ctx, handoff: () => log }).filter(c => !c.pass).map(c => c.id);

test("R10 passes with one accepted request for the new canvas after it was written", () => {
  const ctx = setup();
  assert.deepEqual(failed(ctx, [request(ctx)]), []);
});
test("R10 fails when no request arrived, two arrived or the only one was refused", () => {
  const ctx = setup();
  assert.deepEqual(failed(ctx, []), ["handoff_requested_once", "handoff_path_is_new_canvas", "canvas_written_before_request", "handoff_message_not_empty"]);
  assert.ok(failed(ctx, [request(ctx), request(ctx)]).includes("handoff_requested_once"));
  assert.ok(failed(ctx, [request(ctx, { ok: false })]).includes("handoff_requested_once"));
});
test("R10 counts the accepted request: a refused attempt followed by one accepted request passes, two accepted would not", () => {
  const ctx = setup();
  assert.deepEqual(failed(ctx, [request(ctx, { path: ".doan/canvases/account.html", ok: false }), request(ctx)]), []);
  assert.deepEqual(failed(ctx, [request(ctx), request(ctx, { ok: false })]), []);
  assert.ok(failed(ctx, [request(ctx, { ok: false }), request(ctx, { ok: false })]).includes("handoff_requested_once"));
  assert.ok(failed(ctx, [request(ctx), request(ctx)]).includes("handoff_requested_once"));
});
test("R10 requires the 390 px width and both screens' copy on the new canvas, in whatever frames", () => {
  const ctx = setup();
  const html = ctx.read(MOBILE)!;
  const edit = (change: (text: string) => string) => {
    const edited = setup();
    assert.notEqual(change(html), html, "the edit changed nothing");
    writeFileSync(join(edited.repo, MOBILE), change(html));
    return edited;
  };
  const wide = edit(text => text.replace('content="390"', 'content="1200"'));
  assert.deepEqual(failed(wide, [request(wide)]).filter(id => id !== "canvas_written_before_request"), ["new_canvas_390_wide"]);
  const noWidth = edit(text => text.replace(/<meta name="doan:width"[^>]*>\n?/, ""));
  assert.ok(failed(noWidth, [request(noWidth)]).includes("new_canvas_390_wide"));
  const noBilling = edit(text => text.replace("Invoices are sent on the first of each month.", "Invoices"));
  assert.ok(failed(noBilling, [request(noBilling)]).includes("new_canvas_has_both_screens"));
  const noProfile = edit(text => text.replace("Sign-in email: ada@example.com", "Email"));
  assert.ok(failed(noProfile, [request(noProfile)]).includes("new_canvas_has_both_screens"));
  // One frame holding both cards is a way to stack them, so it passes.
  const oneFrame = edit(text => text.replace(/<section data-doan-frame="billing-form"[^>]*>/, "<section>").replace(/<\/section>\s*<section>/, "</section><section>"));
  assert.ok(!failed(oneFrame, [request(oneFrame)]).some(id => id.startsWith("new_canvas")));
});
test("R10 puts the start of the delivered message in the detail", () => {
  const ctx = setup();
  const text = `Continue on the mobile canvas. ${"x".repeat(400)}`;
  const detail = checks({ ...ctx, handoff: () => [request(ctx, { text })] }).find(c => c.id === "handoff_message_not_empty")!.detail;
  assert.ok(detail.includes("Continue on the mobile canvas."));
  assert.ok(!detail.includes("x".repeat(300)));
});
test("R10 fails a request for the source canvas or another path", () => {
  const ctx = setup();
  assert.ok(failed(ctx, [request(ctx, { path: ".doan/canvases/account.html" })]).includes("handoff_path_is_new_canvas"));
});
test("R10 fails when the canvas changed after the request or did not exist at it", () => {
  const ctx = setup();
  assert.deepEqual(failed(ctx, [request(ctx, { hash: contentHash("an earlier draft") })]), ["canvas_written_before_request"]);
  assert.deepEqual(failed(ctx, [request(ctx, { hash: null })]), ["canvas_written_before_request"]);
});
test("R10 fails an empty or whitespace message", () => {
  const ctx = setup();
  for (const text of ["", " \n\t "]) assert.deepEqual(failed(ctx, [request(ctx, { text })]), ["handoff_message_not_empty"]);
});
test("R10 fails when another file changes or the source canvas is edited", () => {
  const ctx = setup();
  writeFileSync(join(ctx.repo, "notes.txt"), "x");
  assert.ok(failed(ctx, [request(ctx)]).includes("only_new_canvas_added"));
  const edited = setup();
  writeFileSync(join(edited.repo, ".doan/canvases/account.html"), edited.read(".doan/canvases/account.html")!.replace("Profile", "Profile page"));
  assert.ok(failed(edited, [request(edited)]).includes("only_new_canvas_added"));
});
test("R10 fails a second new canvas, since the target is then ambiguous", () => {
  const ctx = setup();
  writeFileSync(join(ctx.repo, ".doan/canvases/account-tablet.html"), ctx.read(MOBILE)!.replace("account-mobile", "account-tablet"));
  assert.ok(failed(ctx, [request(ctx)]).includes("only_new_canvas_added"));
});
test("R10 fails when the agent ran doan open", () => {
  const ctx = setup();
  const calls = { commands: ["doan open .doan/canvases/account-mobile.html"], mcpTools: [] } as unknown as typeof ctx.calls;
  assert.ok(checks({ ...ctx, calls, handoff: () => [request(ctx)] }).some(c => c.id === "no_doan_open" && !c.pass));
});
