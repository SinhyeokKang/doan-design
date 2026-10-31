import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

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
  const commands = join(dir, "fixtures/pass.commands.json");
  if (existsSync(commands)) for (const args of JSON.parse(readFileSync(commands, "utf8"))) execFileSync(cli, args, { cwd: repo, env: { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") } });
  return createContext({ repo, agent: "fixture", transcript: readFileSync(join(dir, "fixtures/pass.transcript.txt"), "utf8"), cli, env: { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") }, seedCommit: "HEAD" });
}
test("D11e accepts the existing combined canvas and rejects re-splitting", () => {
  const ctx = setup("D11e");
  assert.deepEqual(checks(ctx).filter(c => !c.pass), []);
  writeFileSync(join(ctx.repo, ".doan/ds/colors.html"), "new split");
  assert.equal(checks(ctx).find(c => c.id === "no_changes")?.pass, false);
});
test("D11e rejects moving the existing canvas", () => {
  const ctx = setup("D11e");
  renameSync(join(ctx.repo, ".doan/ds/design-system.html"), join(ctx.repo, ".doan/ds/moved.html"));
  assert.equal(checks(ctx).find(c => c.id === "no_changes")?.pass, false);
});
