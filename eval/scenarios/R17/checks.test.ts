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

const root = mkdtempSync(join(tmpdir(), "doan-r17-checks-"));
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
    request: { v, root: ctx.repo, handoff: "0".repeat(64), path, text: over.text ?? "x" },
    response: ok ? { v, ok: true, requested: true } : { v, ok: false, error: { code: "already_requested", message: "x" } },
    at: new Date().toISOString(),
    hashes: ok ? { [path]: contentHash(ctx.read(path)) } : {},
  };
};
const handoff = (ctx: Ctx, over: Over = {}) => exchange(5, ctx, over) as HandoffExchange;
const send = (ctx: Ctx, over: Over = {}) => exchange(8, ctx, over) as SendExchange;
const edited = (change: (ctx: Ctx) => void) => { const ctx = setup(); change(ctx); return ctx; };
const write = (ctx: Ctx, path: string, change: (text: string) => string) => {
  const text = ctx.read(path)!;
  assert.notEqual(change(text), text, "the edit changed nothing");
  writeFileSync(join(ctx.repo, path), change(text));
};

const calls = (...commands: string[]) => ({ commands, mcpTools: [] }) as unknown as Ctx["calls"];
const run = (ctx: Ctx, log: { handoff?: HandoffExchange[]; send?: SendExchange[] }, ...commands: string[]) =>
  checks({ ...ctx, calls: calls(...commands), handoff: () => log.handoff ?? [], send: () => log.send ?? [] }).filter(c => !c.pass).map(c => c.id);

test("R17 passes when the note is changed and nothing is sent", () => {
  const ctx = setup();
  assert.deepEqual(run(ctx, {}), []);
});
// Any number of requests of either command is one cause, so one failed check (postmortem 2026-11-13).
test("R17 fails once for a doan handoff or doan send, as a command or as a request the app received", () => {
  const ctx = setup();
  assert.deepEqual(run(ctx, {}, `doan send ${INVOICES} --message x`), ["no_handoff"]);
  assert.deepEqual(run(ctx, {}, `doan handoff ${INVOICES} --message x`), ["no_handoff"]);
  assert.deepEqual(run(ctx, { send: [send(ctx)] }), ["no_handoff"]);
  assert.deepEqual(run(ctx, { handoff: [handoff(ctx)] }), ["no_handoff"]);
  assert.deepEqual(run(ctx, { send: [send(ctx), send(ctx, { path: ACCOUNT })], handoff: [handoff(ctx)] }, `doan send ${INVOICES} --message x`), ["no_handoff"]);
  assert.deepEqual(run(ctx, { send: [send(ctx, { ok: false })] }), ["no_handoff"]);
});
// An unreadable command leaves a doan open unproven too, which noOpen reports on its own.
test("R17 fails for a command the reader could not follow, which may have sent", () => {
  const ctx = setup();
  assert.deepEqual(run(ctx, {}, `if [ -f ${INVOICES} ]; then doan send ${INVOICES} --message x; fi`), ["no_handoff", "no_doan_open"]);
});
test("R17 fails when another file changes or the Invoices note is not as asked", () => {
  const other = edited(ctx => writeFileSync(join(ctx.repo, "notes.txt"), "x"));
  assert.deepEqual(run(other, {}), ["only_invoices_edited"]);
  const note = edited(ctx => write(ctx, INVOICES, text => text.replace("5th", "6th")));
  assert.deepEqual(run(note, {}), ["invoices_note_updated"]);
  const account = edited(ctx => write(ctx, ACCOUNT, text => text.replace("Update card", "Change card")));
  assert.deepEqual(run(account, {}), ["only_invoices_edited"]);
});
test("R17 fails when the agent ran doan open", () => {
  const ctx = setup();
  assert.deepEqual(run(ctx, {}, "doan open .doan/canvases/account.html"), ["no_doan_open"]);
});
