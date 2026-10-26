import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-r6b-"));
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
function label(ctx: ReturnType<typeof fixture>, html: string) {
  writeFileSync(join(ctx.repo, "design/profile.html"), ctx.read("design/profile.html")!.replace(/<button data-doan-id="save">[^<]*<\/button>/, `<button data-doan-id="save">${html}</button>`));
}

test("R6b seed: the reopened agent change already satisfies the body on its face", () => {
  const ctx = fixture();
  const result = ctx.doan(["comments", "--canvas", "profile"]);
  assert.equal(result.code, 0);
  assert.deepEqual(result.json.result.warnings, []);
  assert.equal(result.json.result.comments.length, 1);
  const comment = result.json.result.comments[0];
  assert.equal(comment.status, "open");
  assert.equal(comment.outdated, true);
  assert.deepEqual(comment.lastResolution, {
    at: "2026-10-24T09:00:02.000Z", by: { kind: "agent", name: "codex" },
    reopenedAt: "2026-10-24T09:00:03.000Z",
    reopenedBy: { kind: "human", name: "Maya Chen", email: "maya@example.com" },
  });
  const events = ctx.read(".doan/comments/profile.jsonl")!.trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(events.map(e => [e.type, e.by.kind]), [["create", "human"], ["resolve", "agent"], ["reopen", "human"]]);
  // The reopen carries no body and no edit precedes it, so the body is the create-time request.
  assert.equal(events[0].body, "The Save button label is too vague. Make it more descriptive.");
  assert.equal(comment.body, events[0].body);
  const current = ctx.read("design/profile.html")!;
  assert.match(current, />Save changes<\/button>/);
  const original = current.replace(">Save changes</button>", ">Save</button>");
  assert.equal(events[0].canvasHash, `sha256:${createHash("sha256").update(original).digest("hex")}`);
  assert.equal(events[0].target.element.text, "Save");
  // Without the change, the seed fails only on the label and the missing resolve.
  assert.deepEqual(checks(ctx).filter(c => !c.pass).map(c => c.id), ["rejected_label_replaced", "profile_agent_resolves_only", "profile_comments_valid"]);
});

test("R6b pass accepts other descriptive labels, nested markup and another agent name", () => {
  for (const html of ["Save profile", "<span>Save your profile</span>", "Save profile changes", "Update profile"]) {
    const ctx = fixture("pass");
    const log = join(ctx.repo, ".doan/comments/profile.jsonl");
    const lines = readFileSync(log, "utf8").trim().split("\n");
    lines[3] = lines[3].replace('"name": "codex"', '"name": "claude-code"');
    writeFileSync(log, lines.join("\n") + "\n");
    label(ctx, html);
    assert.deepEqual(checks(ctx).filter(c => !c.pass), [], html);
  }
});

test("R6b fail rejects resolving again with the rejected change in place", () => {
  const results = checks(fixture("fail"));
  assert.deepEqual(results.filter(c => !c.pass).map(c => c.id), ["rejected_label_replaced"]);
});

test("R6b rejects the rejected label in other spelling, the original label and an empty label", () => {
  for (const html of ["save  Changes", "<span>Save</span> changes", "Save", "SAVE", "", "Submit"]) {
    const ctx = fixture("pass");
    label(ctx, html);
    assert.equal(checks(ctx).find(c => c.id === "rejected_label_replaced")?.pass, false, html);
  }
});

test("R6b rejects rewriting original history and resolving as a human", () => {
  for (const rewrite of [false, true]) {
    const ctx = fixture("pass");
    const path = join(ctx.repo, ".doan/comments/profile.jsonl");
    const lines = ctx.read(".doan/comments/profile.jsonl")!.trim().split("\n");
    const index = rewrite ? 0 : 3;
    lines[index] = rewrite ? lines[index].replace("Make it more descriptive.", "Name the profile.") : lines[index].replace('"kind": "agent"', '"kind": "human"');
    writeFileSync(path, lines.join("\n") + "\n");
    assert.equal(checks(ctx).find(c => c.id === (rewrite ? "profile_history_preserved" : "profile_agent_resolves_only"))?.pass, false);
  }
});

test("R6b rejects unrelated repository changes", () => {
  const ctx = fixture("pass");
  writeFileSync(join(ctx.repo, "unrelated.md"), "Unrequested change\n");
  assert.equal(checks(ctx).find(c => c.id === "scope_preserved")?.pass, false);
});
