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

const root = mkdtempSync(join(tmpdir(), "doan-r15-checks-"));
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
    request: { v, root: ctx.repo, handoff: "0".repeat(64), path, text: over.text ?? "The note now says the 5th." },
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

test("R15 passes with one accepted doan send for invoices", () => {
  const ctx = setup();
  assert.deepEqual(failed(ctx, { send: [send(ctx)] }), []);
});
test("R15 counts the accepted send: a refused attempt then one accepted passes, none or two accepted does not", () => {
  const ctx = setup();
  assert.deepEqual(failed(ctx, { send: [send(ctx, { ok: false }), send(ctx)] }), []);
  assert.deepEqual(failed(ctx, { send: [send(ctx, { ok: false })] }), ["send_requested_once"]);
  assert.deepEqual(failed(ctx, {}), ["send_requested_once"]);
  assert.deepEqual(failed(ctx, { send: [send(ctx), send(ctx)] }), ["send_requested_once"]);
});
// One missing send is one failed check, whichever command stood in for it (postmortem 2026-11-13).
test("R15 reports a doan handoff in place of the send as one failed check", () => {
  const ctx = setup();
  assert.deepEqual(failed(ctx, { handoff: [handoff(ctx)] }), ["send_requested_once"]);
});
test("R15 judges the target and message of every accepted request", () => {
  const ctx = setup();
  assert.deepEqual(failed(ctx, { send: [send(ctx), send(ctx, { path: ACCOUNT })] }), ["send_requested_once", "request_target_is_invoices"]);
  assert.deepEqual(failed(ctx, { send: [send(ctx)], handoff: [handoff(ctx, { path: ACCOUNT })] }), ["request_target_is_invoices"]);
  assert.deepEqual(failed(ctx, { send: [send(ctx), send(ctx, { path: ACCOUNT, text: "", ok: false })] }), []);
});
test("R15 fails an empty message once, or one that does not name the new date", () => {
  const ctx = setup();
  for (const text of ["", " \n\t "]) assert.deepEqual(failed(ctx, { send: [send(ctx, { text })] }), ["send_message_not_empty"]);
  assert.deepEqual(failed(ctx, { send: [send(ctx, { text: "Please update your note." })] }), ["send_message_names_the_change"]);
});
test("R15 puts the start of the delivered message in the detail", () => {
  const ctx = setup();
  const text = `The note says the 5th. ${"x".repeat(400)}`;
  const detail = checks({ ...ctx, handoff: () => [], send: () => [send(ctx, { text })] }).find(c => c.id === "send_message_not_empty")!.detail;
  assert.ok(detail.includes("The note says the 5th."));
  assert.ok(!detail.includes("x".repeat(300)));
});
test("R15 fails when invoices or another file changes, or the note does not say the 5th", () => {
  const log = (ctx: Ctx) => ({ send: [send(ctx)] });
  const invoices = edited(ctx => write(ctx, INVOICES, text => text.replace("first of each month", "5th of each month")));
  assert.deepEqual(failed(invoices, log(invoices)), ["only_source_edited"]);
  const other = edited(ctx => writeFileSync(join(ctx.repo, "notes.txt"), "x"));
  assert.deepEqual(failed(other, log(other)), ["only_source_edited"]);
  const same = edited(ctx => write(ctx, ACCOUNT, text => text.replace("5th", "6th")));
  assert.deepEqual(failed(same, log(same)), ["billing_note_updated"]);
});
test("R15 fails when the agent ran doan open", () => {
  const ctx = setup();
  const calls = { commands: ["doan open .doan/canvases/account.html"], mcpTools: [] } as unknown as typeof ctx.calls;
  assert.ok(checks({ ...ctx, calls, handoff: () => [], send: () => [send(ctx)] }).some(c => c.id === "no_doan_open" && !c.pass));
});
