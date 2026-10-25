import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-r6-"));
const cli = join(root, "doan");
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));
function fixture(kind?: "pass" | "fail") {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(import.meta.dirname, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "."], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  if (kind) cpSync(join(import.meta.dirname, "fixtures", kind), repo, { recursive: true });
  return createContext({ repo, agent: "fixture", transcript: "", cli, env: process.env, seedCommit: "HEAD" });
}

test("R6 seed exposes an open human-reopened comment with its previous agent resolution", () => {
  const ctx = fixture();
  const result = ctx.doan(["comments", "--canvas", "profile"]);
  assert.equal(result.code, 0);
  assert.deepEqual(result.json.result.warnings, []);
  assert.equal(result.json.result.comments.length, 1);
  const comment = result.json.result.comments[0];
  assert.equal(comment.status, "open");
  assert.equal(comment.outdated, false);
  assert.deepEqual(comment.lastResolution, {
    at: "2026-10-24T09:00:02.000Z", by: { kind: "agent", name: "codex" },
    reopenedAt: "2026-10-24T09:00:03.000Z",
    reopenedBy: { kind: "human", name: "Maya Chen", email: "maya@example.com" },
  });
  const events = ctx.read(".doan/comments/profile.jsonl")!.trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(events.map(e => [e.type, e.by.kind]), [["create", "human"], ["resolve", "agent"], ["reopen", "human"]]);
});

test("R6 pass accepts another agent name and nested button markup", () => {
  const ctx = fixture("pass");
  const log = join(ctx.repo, ".doan/comments/profile.jsonl");
  const lines = readFileSync(log, "utf8").trim().split("\n");
  lines[3] = lines[3].replace('"name": "codex"', '"name": "claude-code"');
  writeFileSync(log, lines.join("\n") + "\n");
  writeFileSync(join(ctx.repo, "design/profile.html"), ctx.read("design/profile.html")!.replace(">Save profile</button>", "><span>Save profile</span></button>"));
  assert.deepEqual(checks(ctx).filter(c => !c.pass), []);
});

test("R6 fail rejects resolving again without correcting the previous change", () => {
  const results = checks(fixture("fail"));
  assert.deepEqual(results.filter(c => !c.pass).map(c => c.id), ["reopened_request_applied"]);
});

test("R6 rejects rewriting original history and resolving as a human", () => {
  for (const rewrite of [false, true]) {
    const ctx = fixture("pass");
    const path = join(ctx.repo, ".doan/comments/profile.jsonl");
    const lines = ctx.read(".doan/comments/profile.jsonl")!.trim().split("\n");
    const index = rewrite ? 0 : 3;
    lines[index] = rewrite ? lines[index].replace("Save profile", "Save changes") : lines[index].replace('"kind": "agent"', '"kind": "human"');
    writeFileSync(path, lines.join("\n") + "\n");
    assert.equal(checks(ctx).find(c => c.id === (rewrite ? "profile_history_preserved" : "profile_agent_resolves_only"))?.pass, false);
  }
});

test("R6 rejects unrelated repository changes", () => {
  const ctx = fixture("pass");
  writeFileSync(join(ctx.repo, "unrelated.md"), "Unrequested change\n");
  assert.equal(checks(ctx).find(c => c.id === "scope_preserved")?.pass, false);
});
