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

const root = mkdtempSync(join(tmpdir(), "doan-r11-checks-"));
const cli = join(root, "doan");
const dir = import.meta.dirname;
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
const paths = [".doan/canvases/profile-mobile.html", ".doan/canvases/billing-mobile.html"];
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));

// The seed committed, then the pass fixture laid over it: both new canvases are there and no request has arrived yet.
function setup() {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(dir, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  cpSync(join(dir, "fixtures", "pass"), repo, { recursive: true });
  return createContext({ repo, agent: "fixture", transcript: "", cli, env, seedCommit: "HEAD" });
}
const request = (ctx: ReturnType<typeof setup>, path: string): HandoffExchange => ({
  request: { v: 5, root: ctx.repo, handoff: "0".repeat(64), path, text: "Continue with this button's tap target." },
  response: { v: 5, ok: true, requested: true }, at: "", hashes: { [path]: contentHash(ctx.read(path)) },
});
const failed = (ctx: ReturnType<typeof setup>, log = paths.map(path => request(ctx, path))) => checks({ ...ctx, handoff: () => log }).filter(c => !c.pass).map(c => c.id);

test("R11 passes two accepted handoffs and fails the one-handoff fixture", () => {
  const ctx = setup();
  assert.deepEqual(failed(ctx), []);
  assert.ok(failed(ctx, [request(ctx, paths[0]!)]).includes("handoff_each_canvas_once"));
});
test("R11 rejects source edits and unrelated additions", () => {
  for (const path of ["notes.txt", ".doan/canvases/account.html", ".doan/canvases/extra.html"]) {
    const ctx = setup();
    writeFileSync(join(ctx.repo, path), "changed");
    assert.ok(failed(ctx).includes("only_two_new_canvases_added"));
  }
});
test("R11 requires each target's width and original frame copy", () => {
  for (const [index, copy] of [[0, "Sign-in email: ada@example.com"], [1, "Invoices are sent on the first of each month."]] as const) {
    for (const before of [copy, 'content="390"']) {
      const ctx = setup();
      const path = paths[index]!;
      writeFileSync(join(ctx.repo, path), ctx.read(path)!.replace(before, "changed"));
      assert.ok(failed(ctx).includes(index === 0 ? "profile_mobile_content" : "billing_mobile_content"));
    }
  }
});
