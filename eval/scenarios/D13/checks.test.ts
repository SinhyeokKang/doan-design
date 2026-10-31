import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import d10 from "../D10d/checks.ts";
import d11 from "../D11e/checks.ts";
import d13 from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-ds-checks-"));
const cli = join(root, "doan");
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));
function setup(id: string) {
  const dir = join(import.meta.dirname, "..", id);
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(dir, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "."], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  cpSync(join(dir, "fixtures/pass"), repo, { recursive: true });
  return createContext({ repo, agent: "fixture", transcript: readFileSync(join(dir, "fixtures/pass.transcript.txt"), "utf8"), cli, env: { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") }, seedCommit: "HEAD" });
}
test("D10d accepts tokens distributed across ds canvases and rejects a missing token", () => {
  const ctx = setup("D10d");
  assert.deepEqual(d10(ctx).filter(c => !c.pass), []);
  const path = ".doan/ds/typography.html";
  writeFileSync(join(ctx.repo, path), ctx.read(path)!.replaceAll("--type-title-size", "--type-body-size"));
  assert.equal(d10(ctx).find(c => c.id === "tokens_in_both")?.pass, false);
});
test("D11e accepts the existing combined canvas and rejects re-splitting", () => {
  const ctx = setup("D11e");
  assert.deepEqual(d11(ctx).filter(c => !c.pass), []);
  writeFileSync(join(ctx.repo, ".doan/ds/colors.html"), "new split");
  assert.equal(d11(ctx).find(c => c.id === "no_changes")?.pass, false);
});
test("D13 accepts targeted updates and rejects unrelated frames, ids, files and missing updates", () => {
  for (const mutation of ["none", "frame", "id", "file", "missing"]) {
    const ctx = setup("D13");
    const path = ".doan/ds/button.html";
    if (mutation === "frame") writeFileSync(join(ctx.repo, path), ctx.read(path)!.replace("Send invoice", "Pay now"));
    if (mutation === "id") writeFileSync(join(ctx.repo, path), ctx.read(path)!.replace('content="button"', 'content="button-new"'));
    if (mutation === "file") writeFileSync(join(ctx.repo, ".doan/ds/card.html"), ctx.read(".doan/ds/card.html")! + "\n");
    if (mutation === "missing") writeFileSync(join(ctx.repo, path), ctx.seed(path)!);
    const failures = d13(ctx).filter(c => !c.pass);
    if (mutation === "none") assert.deepEqual(failures, []);
    else assert.ok(failures.length > 0, mutation);
  }
});
