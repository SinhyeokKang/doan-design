import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import { toolCalls } from "../../lib/transcript.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-r13-checks-"));
const cli = join(root, "doan");
const dir = import.meta.dirname;
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));

// The seed committed, then a fixture laid over it.
function setup(kind: "pass" | "fail" = "pass") {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(dir, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  cpSync(join(dir, "fixtures", kind), repo, { recursive: true });
  return createContext({ repo, agent: "fixture", transcript: "", cli, env, seedCommit: "HEAD" });
}
const claude = (blocks: object[]) => blocks.map(block => JSON.stringify({ type: "assistant", message: { content: [block] } })).join("\n");
const read = (path: string) => ({ type: "tool_use", id: "r", name: "Read", input: { file_path: path } });
const bash = (command: string) => ({ type: "tool_use", id: "b", name: "Bash", input: { command } });
const failed = (ctx: ReturnType<typeof setup>, transcript: string) =>
  checks({ ...ctx, transcript, calls: toolCalls(transcript) }).filter(c => !c.pass).map(c => c.id);

test("R13 passes the pass fixture with a Read of the anchored canvas", () => {
  const ctx = setup();
  assert.deepEqual(failed(ctx, claude([read(`${ctx.repo}/.doan/canvases/plans.html`)])), []);
});
test("R13 counts a shell read of the anchored canvas, not a doan call or a read of the other canvas", () => {
  const ctx = setup();
  for (const command of ["cat .doan/canvases/plans.html", "sed -n '1,80p' .doan/canvases/plans.html", "cd .doan/canvases && cp plans.html checkout.html"])
    assert.deepEqual(failed(ctx, claude([bash(command)])), [], command);
  for (const transcript of ["", claude([bash("doan check .doan/canvases/plans.html --json")]), claude([bash("cat .doan/canvases/plans-2025.html")]), claude([read(`${ctx.repo}/.doan/canvases/plans-2025.html`)])])
    assert.deepEqual(failed(ctx, transcript), ["anchor_path_read"], transcript);
});
test("R13 fails a canvas drawn from the other canvas", () => {
  const ctx = setup("fail");
  assert.deepEqual(failed(ctx, claude([read(".doan/canvases/plans.html")])), ["new_canvas_from_reference"]);
});
test("R13 fails any change to the anchored canvas, even a trailing newline", () => {
  const ctx = setup();
  const path = join(ctx.repo, ".doan/canvases/plans.html");
  assert.ok(readFileSync(path, "utf8").endsWith("\n"));
  appendFileSync(path, "\n");
  assert.deepEqual(failed(ctx, claude([read(".doan/canvases/plans.html")])), ["reference_unchanged", "only_new_canvas_added", "new_canvas_from_reference"]);
});
