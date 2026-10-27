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
import r1b from "./R1b/checks.ts";
import r2 from "./R2/checks.ts";
import r2b from "./R2b/checks.ts";
import r3 from "./R3/checks.ts";
import w1 from "./W1/checks.ts";

const root = mkdtempSync(join(tmpdir(), "scenario-regression-"));
const cli = join(root, "doan");
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));
function fixture(id: string, transcript = "") {
  const repo = mkdtempSync(join(root, `${id}-`));
  cpSync(join(import.meta.dirname, id, "seed"), repo, { recursive: true });
  if (id === "W1") execFileSync(cli, ["init", "--repo", repo, "--token-css", join(repo, "styles/tokens.css")]);
  for (const args of [["init", "-q"], ["add", "."], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  cpSync(join(import.meta.dirname, id, "fixtures/pass"), repo, { recursive: true });
  return createContext({ repo, agent: "fixture", transcript, cli, env: process.env, seedCommit: "HEAD" });
}
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
  for (const transcript of [claude("rm doan/team.html; git restore doan/team.html"), 'exec\n/bin/zsh -lc \'rm doan/team.html; git restore doan/team.html\' in /tmp/repo succeeded in 20ms:']) {
    assert.ok(r3({ ...ctx, transcript, calls: toolCalls(transcript) }).some(c => !c.pass));
  }
});
test("W1 accepts inline and linked relative token imports", () => {
  for (const linked of [false, true]) {
    const ctx = fixture("W1");
    const path = join(ctx.repo, "doan/settings.html");
    const replacement = linked ? '<link rel="stylesheet" href="canvas.css">' : '<style>@import "../styles/tokens.css";</style>';
    writeFileSync(path, readFileSync(path, "utf8").replace('<link rel="stylesheet" href="../styles/tokens.css">', replacement));
    if (linked) writeFileSync(join(ctx.repo, "doan/canvas.css"), '@import "../styles/tokens.css";');
    all(w1, ctx);
  }
});
test("R2 selection is not the first of multiple similar candidates", () => {
  const seed = readFileSync(join(import.meta.dirname, "R2/seed/doan/checkout.html"), "utf8");
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
test("R2b accepts shell and both agents' MCP calls, rejects prose and other servers", () => {
  const mcp = (name: string) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name, input: { repo: "/tmp/repo" } }] } });
  const rollout = JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec", input: "text(await tools.mcp__doan__active({repo: '/tmp/repo'}));" } });
  for (const transcript of [claude("doan active --json"), mcp("mcp__doan__active"), rollout]) all(r2b, fixture("R2b", transcript));
  for (const transcript of ["Guide: doan active or mcp__doan__active", mcp("mcp__other__active"), claude("echo 'doan active'")]) assert.equal(r2b(fixture("R2b", transcript)).find(c => c.id === "asked_doan_active")?.pass, false);
  const ctx = fixture("R2b", rollout);
  writeFileSync(join(ctx.repo, "doan/checkout.html"), ctx.read("doan/checkout.html")!.replace("Start free trial", "Changed"));
  assert.equal(r2b(ctx).find(c => c.id === "other_elements_unchanged")?.pass, false);
});

test("R1b requires MCP resolve invocation and preserves R1 event checks", () => {
  const mcp = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__doan__resolve_comments", input: {} }] } });
  const rollout = JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec", input: "await tools.mcp__doan__resolve_comments({ids: [], agent: 'codex'});" } });
  for (const transcript of [mcp, rollout]) all(r1b, fixture("R1b", transcript));
  for (const transcript of ["Use mcp__doan__resolve_comments", claude("doan comment resolve cmt_id --agent codex")])
    assert.equal(r1b(fixture("R1b", transcript)).find(c => c.id === "mcp_resolve_invoked")?.pass, false);
  const ctx = fixture("R1b", mcp);
  const path = join(ctx.repo, ".doan/comments/profile.jsonl");
  writeFileSync(path, ctx.read(".doan/comments/profile.jsonl")!.replaceAll('"kind": "agent"', '"kind": "human"'));
  assert.equal(r1b(ctx).find(c => c.id === "profile_agent_resolves_only")?.pass, false);
  writeFileSync(path, ctx.seed(".doan/comments/profile.jsonl")!);
  assert.equal(r1b(ctx).find(c => c.id === "profile_agent_resolves_only")?.pass, false);
});
