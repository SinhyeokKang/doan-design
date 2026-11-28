import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import { contentHash } from "../../lib/work.ts";
import type { HandoffExchange, SendExchange } from "../../lib/types.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-r14-checks-"));
const cli = join(root, "doan");
const dir = import.meta.dirname;
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
const ACCOUNT = ".doan/canvases/account.html";
const INVOICES = ".doan/canvases/invoices.html";
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));

// The seed committed, then the pass fixture laid over it: no request has arrived yet.
function setup() {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(dir, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  cpSync(join(dir, "fixtures", "pass"), repo, { recursive: true });
  return createContext({ repo, agent: "fixture", transcript: "", cli, env, seedCommit: "HEAD" });
}
type Ctx = ReturnType<typeof setup>;
interface Over { path?: string; text?: string; ok?: boolean }
const exchange = <V extends 5 | 8>(v: V, ctx: Ctx, over: Over) => {
  const path = over.path ?? INVOICES;
  const ok = over.ok ?? true;
  return {
    request: { v, root: ctx.repo, handoff: "0".repeat(64), path, text: over.text ?? "Save changes is the new wording; reword Download PDF the same way." },
    response: ok ? { v, ok: true, requested: true } : { v, ok: false, error: { code: "already_requested", message: "x" } },
    at: new Date().toISOString(),
    hashes: ok ? { [path]: contentHash(ctx.read(path)) } : {},
  };
};
const handoff = (ctx: Ctx, over: Over = {}) => exchange(5, ctx, over) as HandoffExchange;
const send = (ctx: Ctx, over: Over = {}) => exchange(8, ctx, over) as SendExchange;
const failed = (ctx: Ctx, log: { handoff?: HandoffExchange[]; send?: SendExchange[] }) => checks({ ...ctx, handoff: () => log.handoff ?? [], send: () => log.send ?? [] }).filter(c => !c.pass).map(c => c.id);
const edited = (change: (ctx: Ctx) => void) => { const ctx = setup(); change(ctx); return ctx; };
const write = (ctx: Ctx, path: string, change: (text: string) => string) => {
  const text = ctx.read(path)!;
  assert.notEqual(change(text), text, "the edit changed nothing");
  writeFileSync(join(ctx.repo, path), change(text));
};

test("R14 passes with one accepted doan handoff for invoices", () => {
  const ctx = setup();
  assert.deepEqual(failed(ctx, { handoff: [handoff(ctx)] }), []);
});
test("R14 counts the accepted handoff: a refused attempt then one accepted passes, none or two accepted does not", () => {
  const ctx = setup();
  assert.deepEqual(failed(ctx, { handoff: [handoff(ctx, { ok: false }), handoff(ctx)] }), []);
  assert.deepEqual(failed(ctx, { handoff: [handoff(ctx, { ok: false })] }), ["handoff_requested_once"]);
  assert.deepEqual(failed(ctx, {}), ["handoff_requested_once"]);
});
// One missing handoff is one failed check, whichever command stood in for it (postmortem 2026-11-13).
test("R14 reports a doan send in place of the handoff as one failed check", () => {
  const ctx = setup();
  assert.deepEqual(failed(ctx, { send: [send(ctx)] }), ["handoff_requested_once"]);
});
test("R14 judges the target and message of every accepted request, so a request for another canvas is its own failure", () => {
  const ctx = setup();
  assert.deepEqual(failed(ctx, { handoff: [handoff(ctx), handoff(ctx, { path: ACCOUNT })] }), ["handoff_requested_once", "request_target_is_invoices"]);
  assert.deepEqual(failed(ctx, { handoff: [handoff(ctx)], send: [send(ctx, { path: ACCOUNT })] }), ["request_target_is_invoices"]);
  // A refused request is not judged.
  assert.deepEqual(failed(ctx, { handoff: [handoff(ctx), handoff(ctx, { path: ACCOUNT, text: "", ok: false })] }), []);
});
test("R14 fails an empty message once, or one that does not name the new wording", () => {
  const ctx = setup();
  for (const text of ["", " \n\t "]) assert.deepEqual(failed(ctx, { handoff: [handoff(ctx, { text })] }), ["handoff_message_not_empty"]);
  assert.deepEqual(failed(ctx, { handoff: [handoff(ctx, { text: "Continue on invoices." })] }), ["handoff_message_names_the_wording"]);
});
test("R14 puts the start of the delivered message in the detail", () => {
  const ctx = setup();
  const text = `Save changes is the new wording. ${"x".repeat(400)}`;
  const detail = checks({ ...ctx, handoff: () => [handoff(ctx, { text })], send: () => [] }).find(c => c.id === "handoff_message_not_empty")!.detail;
  assert.ok(detail.includes("Save changes is the new wording."));
  assert.ok(!detail.includes("x".repeat(300)));
});
test("R14 fails when invoices or another file changes, or the Save button is not renamed", () => {
  const log = (ctx: Ctx) => ({ handoff: [handoff(ctx)] });
  const invoices = edited(ctx => write(ctx, INVOICES, text => text.replace("Download PDF", "Download invoice")));
  assert.deepEqual(failed(invoices, log(invoices)), ["only_source_edited"]);
  const other = edited(ctx => writeFileSync(join(ctx.repo, "notes.txt"), "x"));
  assert.deepEqual(failed(other, log(other)), ["only_source_edited"]);
  const same = edited(ctx => write(ctx, ACCOUNT, text => text.replace("Save changes", "Submit")));
  assert.deepEqual(failed(same, log(same)), ["save_button_renamed"]);
});
test("R14 fails when the agent ran doan open", () => {
  const ctx = setup();
  const calls = { commands: ["doan open .doan/canvases/account.html"], mcpTools: [] } as unknown as typeof ctx.calls;
  assert.ok(checks({ ...ctx, calls, handoff: () => [handoff(ctx)], send: () => [] }).some(c => c.id === "no_doan_open" && !c.pass));
});
