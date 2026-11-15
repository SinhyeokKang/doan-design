import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-W1-checks-"));
const cli = join(root, "doan");
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));
function setup() {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(import.meta.dirname, "seed"), repo, { recursive: true });
  execFileSync(cli, ["init", "--repo", repo, "--token-css", join(repo, "styles/tokens.css")], { env });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  cpSync(join(import.meta.dirname, "fixtures", "pass"), repo, { recursive: true });
  return createContext({ repo, agent: "fixture", transcript: "", cli, env, seedCommit: "HEAD" });
}
const failures = (ctx: ReturnType<typeof setup>) => checks(ctx).filter(c => !c.pass).map(c => c.id);
const path = ".doan/canvases/settings.html";

test("W1 passes the pass fixture", () => {
  assert.deepEqual(failures(setup()), []);
});

// The two checks read doan check's warning codes; a renamed code would let every run pass them, so the real CLI
// must report each one here.
test("W1 fails an external resource and a hardcoded color through doan check's own finding codes", () => {
  const external = setup();
  writeFileSync(join(external.repo, path), external.read(path)!.replace("</main>", '<img src="https://example.com/avatar.png" alt=""></main>'));
  assert.deepEqual(failures(external), ["no_external_resources"]);
  const color = setup();
  writeFileSync(join(color.repo, path), color.read(path)!.replace("background: var(--color-primary);", "background: #ff3366;"));
  assert.deepEqual(failures(color), ["no_hardcoded_colors"]);
});
