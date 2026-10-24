import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-H3-checks-"));
const cli = join(root, "doan");
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));
function setup(pass = false, transcript = "") {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(import.meta.dirname, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "."], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  if (pass) cpSync(join(import.meta.dirname, "fixtures/pass"), repo, { recursive: true });
  return createContext({ repo, agent: "fixture", transcript, cli, env: process.env, seedCommit: "HEAD" });
}
const failures = (ctx: ReturnType<typeof setup>) => checks(ctx).filter(c => !c.pass).map(c => c.id);

test("H3 rejects an untouched target and comment-only copy", () => {
  const ctx = setup();
  assert.ok(failures(ctx).includes("target_function_implemented"));
  assert.ok(failures(ctx).includes("canvas_copy_in_component"));
  writeFileSync(join(ctx.repo, "web/src/components/DispatchQueue.tsx"), ctx.seed("web/src/components/DispatchQueue.tsx")! + "\n/* Ready for dispatch; Print packing slips */\n");
  assert.ok(failures(ctx).includes("canvas_copy_in_component"));
});
test("H3 accepts tokenized CSS and inline styles, rejects direct color and protected changes", () => {
  const ctx = setup(true);
  assert.deepEqual(failures(ctx), []);
  const target = "web/src/components/DispatchQueue.tsx";
  const good = ctx.read(target)!;
  writeFileSync(join(ctx.repo, target), good.replace('<main className="dispatch-queue">', '<main className="dispatch-queue" style={{ color: "var(--color-text)" }}>'));
  assert.deepEqual(failures(ctx), []);
  writeFileSync(join(ctx.repo, target), good.replace('<main className="dispatch-queue">', '<main className="dispatch-queue" style={{ color: "rgb(1, 2, 3)" }}>'));
  assert.ok(failures(ctx).includes("no_new_direct_colors"));
  writeFileSync(join(ctx.repo, target), good);
  writeFileSync(join(ctx.repo, "design/dispatch.html"), ctx.seed("design/dispatch.html")! + "\n");
  assert.ok(failures(ctx).includes("design_and_review_unchanged"));
});
