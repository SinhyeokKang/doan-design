import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-d10h-checks-"));
const cli = join(root, "doan");
const dir = import.meta.dirname;
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));

const read = (preset: string) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: `r-${preset}`, name: "Bash", input: { command: `doan design-skill ${preset} --json` } }] } });

function setup(transcript = readFileSync(join(dir, "fixtures/pass.transcript.txt"), "utf8")) {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(dir, "seed"), repo, { recursive: true });
  for (const args of [["init", "-q"], ["add", "."], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  cpSync(join(dir, "fixtures/pass"), repo, { recursive: true });
  const commands = join(dir, "fixtures/pass.commands.json");
  if (existsSync(commands)) for (const args of JSON.parse(readFileSync(commands, "utf8"))) execFileSync(cli, args, { cwd: repo, env });
  return createContext({ repo, agent: "fixture", transcript, cli, env, seedCommit: "HEAD" });
}
const failed = (ctx: ReturnType<typeof setup>) => checks(ctx).filter(c => !c.pass).map(c => c.id);

test("D10h passes without a context read: the README is the product context document", () => {
  const transcript = readFileSync(join(dir, "fixtures/pass.transcript.txt"), "utf8");
  assert.doesNotMatch(transcript, /design-skill context/);
  assert.deepEqual(failed(setup(transcript)), []);
});
test("D10h still allows reading context", () => {
  const transcript = readFileSync(join(dir, "fixtures/pass.transcript.txt"), "utf8") + read("context") + "\n";
  assert.deepEqual(failed(setup(transcript)), []);
});
test("D10h requires document and refuses other presets", () => {
  const base = readFileSync(join(dir, "fixtures/pass.transcript.txt"), "utf8");
  assert.deepEqual(failed(setup(base.replace(/.*design-skill document.*\n/, ""))), ["read_document"]);
  assert.deepEqual(failed(setup(base + read("polish") + "\n")), ["preset_reads_allowed"]);
});
test("D10h rejects an edited README", () => {
  const ctx = setup();
  writeFileSync(join(ctx.repo, "README.md"), ctx.read("README.md") + "\nEdited.\n");
  assert.deepEqual(failed(ctx), ["changes_in_scope"]);
});
