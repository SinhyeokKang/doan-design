import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
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
test("D13 accepts targeted updates and rejects unrelated frames, ids, files and missing updates", () => {
  for (const mutation of ["none", "frame", "id", "file", "missing"]) {
    const ctx = setup("D13");
    const path = ".doan/ds/button.html";
    if (mutation === "frame") writeFileSync(join(ctx.repo, path), ctx.read(path)!.replace("Send invoice", "Pay now"));
    if (mutation === "id") writeFileSync(join(ctx.repo, path), ctx.read(path)!.replace('content="button"', 'content="button-new"'));
    if (mutation === "file") writeFileSync(join(ctx.repo, ".doan/ds/card.html"), ctx.read(".doan/ds/card.html")! + "\n");
    if (mutation === "missing") writeFileSync(join(ctx.repo, path), ctx.seed(path)!);
    const failures = checks(ctx).filter(c => !c.pass);
    if (mutation === "none") assert.deepEqual(failures, []);
    else assert.ok(failures.length > 0, mutation);
  }
});
test("D13 accepts a new hover frame while preserving existing button frames", () => {
  const ctx = setup("D13");
  const path = ".doan/ds/button.html";
  writeFileSync(join(ctx.repo, path), ctx.seed(path)!.replace("</main>", `<section data-doan-frame="button-hover" data-doan-title="Button hover" data-doan-implements="components/button.css">
<button class="button button--primary" style="background: var(--color-primary-hover)">Send invoice</button>
<p><code>--color-primary-hover</code> applies on primary hover, excluding disabled buttons.</p>
</section></main>`));
  assert.deepEqual(checks(ctx).filter(c => !c.pass), []);
});
test("D13 rejects an added frame in an unrelated canvas", () => {
  const ctx = setup("D13");
  const path = ".doan/ds/card.html";
  writeFileSync(join(ctx.repo, path), ctx.read(path)!.replace("</main>", '<section data-doan-frame="card-extra" data-doan-title="Extra" data-doan-implements="components/card.css">Extra</section></main>'));
  assert.equal(checks(ctx).find(c => c.id === "changes_in_scope")?.pass, false);
});
