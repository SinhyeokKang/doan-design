import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../lib/context.ts";
import { toolCalls } from "../lib/transcript.ts";
import type { Checks } from "../lib/types.ts";
import r1 from "./R1/checks.ts";
import r2 from "./R2/checks.ts";
import r3 from "./R3/checks.ts";
import w1 from "./W1/checks.ts";

const root = mkdtempSync(join(tmpdir(), "scenario-regression-"));
const cli = join(root, "doan");
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));
function fixture(id: string, transcript = "") {
  const repo = mkdtempSync(join(root, `${id}-`));
  cpSync(join(import.meta.dirname, id, "seed"), repo, { recursive: true });
  if (id === "W1") execFileSync(cli, ["init", "--repo", repo, "--token-css", join(repo, "styles/tokens.css")], { env });
  for (const args of [["init", "-q"], ["add", "."], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  cpSync(join(import.meta.dirname, id, "fixtures/pass"), repo, { recursive: true });
  return createContext({ repo, agent: "fixture", transcript, cli, env, seedCommit: "HEAD" });
}
test("scenario subprocesses use their temporary runtime instead of the inherited app runtime", () => {
  const ctx = fixture("R1");
  const runtime = ctx.run(process.execPath, ["-p", "process.env.DOAN_RUNTIME || 'default real HOME runtime'"]);
  assert.equal(runtime.code, 0, runtime.stderr);
  assert.equal(runtime.stdout.trim(), join(root, "runtime.json"));
});
function all(checks: Checks, ctx: ReturnType<typeof fixture>) {
  const failed = checks(ctx).filter(c => !c.pass);
  assert.deepEqual(failed, []);
}
const claude = (command: string) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] } });
test("R2 rejects guide-only and echoed active mentions, accepts actual shell calls", () => {
  for (const transcript of ["Guide: doan active --json", JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "doan active --json" }] } }), claude("echo 'doan active --json'")]) {
    assert.equal(r2(fixture("R2", transcript)).find(c => c.id === "asked_doan_active")?.pass, false);
  }
  for (const transcript of [claude("doan active --json"), 'exec\n/bin/zsh -lc \'doan active --json\' in /tmp/repo succeeded in 20ms:']) {
    assert.equal(r2(fixture("R2", transcript)).find(c => c.id === "asked_doan_active")?.pass, true);
  }
});
test("R1 accepts a schema-valid runtime name and rejects a human resolve", () => {
  const ctx = fixture("R1");
  const path = join(ctx.repo, ".doan/comments/profile.jsonl");
  writeFileSync(path, readFileSync(path, "utf8").replaceAll('"name": "codex"', '"name": "claude"'));
  all(r1, ctx);
  writeFileSync(path, readFileSync(path, "utf8").replaceAll('"kind": "agent"', '"kind": "human"'));
  assert.equal(r1(ctx).find(c => c.id === "profile_agent_resolves_only")?.pass, false);
});
test("R3 accepts an unresolved mixed comment but rejects delete-and-restore commands", () => {
  const ctx = fixture("R3");
  writeFileSync(join(ctx.repo, ".doan/comments/billing.jsonl"), ctx.seed(".doan/comments/billing.jsonl")!);
  all(r3, ctx);
  for (const transcript of [claude("rm .doan/canvases/team.html; git restore .doan/canvases/team.html"), 'exec\n/bin/zsh -lc \'rm .doan/canvases/team.html; git restore .doan/canvases/team.html\' in /tmp/repo succeeded in 20ms:']) {
    assert.ok(r3({ ...ctx, transcript, calls: toolCalls(transcript) }).some(c => !c.pass));
  }
});
test("W1 accepts inline and linked relative token imports", () => {
  for (const linked of [false, true]) {
    const ctx = fixture("W1");
    const path = join(ctx.repo, ".doan/canvases/settings.html");
    const replacement = linked ? '<link rel="stylesheet" href="canvas.css">' : '<style>@import "../styles/tokens.css";</style>';
    writeFileSync(path, readFileSync(path, "utf8").replace('<link rel="stylesheet" href="../styles/tokens.css">', replacement));
    if (linked) writeFileSync(join(ctx.repo, ".doan/canvases/canvas.css"), '@import "../styles/tokens.css";');
    all(w1, ctx);
  }
});
test("R2 selection is not the first of multiple similar candidates", () => {
  const seed = readFileSync(join(import.meta.dirname, "R2/seed/.doan/canvases/checkout.html"), "utf8");
  const selection = JSON.parse(readFileSync(join(import.meta.dirname, "R2/selection.json"), "utf8"));
  const buttons = [...seed.matchAll(/<button data-doan-id="([^"]+)"/g)].map(m => m[1]);
  assert.ok(buttons.length >= 3);
  assert.notEqual(selection.element.doanId, buttons[0]);
  assert.ok(seed.includes(selection.element.html));
});
test("R5 implementation is one of several opaque file candidates", () => {
  const files = readdirSync(join(import.meta.dirname, "R5/seed/web/billing"));
  assert.ok(files.length >= 3);
  assert.ok(files.every(f => !/receipt|detail/i.test(f)));
});

test("R2 active detail describes invocation evidence without claiming success", () => {
  const missing = r2(fixture("R2")).find(c => c.id === "asked_doan_active")!;
  assert.match(missing.detail, /no .*invocation/i);
  const called = r2(fixture("R2", claude("doan active --json") + '\napp_not_running')).find(c => c.id === "asked_doan_active")!;
  assert.equal(called.pass, true);
  assert.match(called.detail, /invoked.*success.*not/i);
});
