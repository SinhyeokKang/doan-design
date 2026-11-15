import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import type { CheckContext } from "../../lib/types.ts";
import checks, { groupChecks } from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-W11-checks-"));
const cli = join(root, "doan");
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
const canvasPath = ".doan/canvases/onboarding.html";
const pass = readFileSync(join(import.meta.dirname, "fixtures/pass", canvasPath), "utf8");
const seed = readFileSync(join(import.meta.dirname, "seed", canvasPath), "utf8");

before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));

function setup(kind: "seed" | "pass" | "fail" = "pass", edit: Record<string, string> = {}) {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(import.meta.dirname, "seed"), repo, { recursive: true });
  execFileSync(cli, ["init", "--repo", repo, "--token-css", join(repo, ".doan/assets/tokens.css")], { env });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  if (kind !== "seed") cpSync(join(import.meta.dirname, "fixtures", kind), repo, { recursive: true });
  for (const [path, text] of Object.entries(edit)) writeFileSync(join(repo, path), text);
  return createContext({ repo, agent: "fixture", transcript: "", cli, env, seedCommit: "HEAD" });
}
// The work signals and `doan open` are exercised by the self-test against the fake app; here only the canvas checks.
const ownChecks = (ctx: CheckContext) => checks(ctx).filter(c => !["start_before_edit", "done_at_end", "start_path", "no_doan_open"].includes(c.id));
const failures = (ctx: CheckContext) => ownChecks(ctx).filter(c => !c.pass).map(c => c.id).sort();
const withCanvas = (html: string) => failures(setup("pass", { [canvasPath]: html }));

test("W11 seed is clean but unlinked, and pass connects all three marked frames", () => {
  const ctx = setup("seed");
  const result = ctx.doan(["check"]);
  assert.equal(result.code, 0);
  assert.deepEqual(result.json.result.findings, []);
  assert.deepEqual(failures(ctx), ["one_link_group", "only_canvas_changed"]);
  assert.deepEqual(failures(setup("pass")), []);
});

test("W11 fail fixture leaves done disconnected", () => {
  assert.deepEqual(failures(setup("fail")), ["one_link_group"]);
});

test("W11 allows reformatting and any link direction that connects the frames", () => {
  assert.deepEqual(withCanvas(pass.replace('data-doan-goto="signup"', 'data-doan-goto="done"')), []);
  assert.deepEqual(withCanvas(pass.replace('data-doan-goto="signup"', 'data-doan-goto="signup"\n ')), []);
});

test("W11 rejects invalid targets and missing links", () => {
  assert.deepEqual(withCanvas(pass.replace('data-doan-id="done-back" data-doan-goto="signup"', 'data-doan-id="done-back" data-doan-goto="missing"').replaceAll('data-doan-goto="done"', 'data-doan-goto="missing"')), ["doan_check_clean", "one_link_group"]);
  assert.deepEqual(withCanvas(pass.replaceAll(/ data-doan-goto="[^"]*"/g, '')), ["one_link_group", "only_canvas_changed"]);
});

test("W11 rejects hash-link wrappers and onclick navigation without goto attributes", () => {
  const hashLinks = pass.replace(/<button([^>]*?) data-doan-goto="([^"]+)"([^>]*)>([\s\S]*?)<\/button>/g, '<a href="#$2"><button$1$3>$4</button></a>');
  const onclick = pass.replace(/data-doan-goto="([^"]+)"/g, `onclick="location.hash = '$1'"`);
  for (const html of [hashLinks, onclick]) {
    assert.deepEqual(withCanvas(html), ["canvas_otherwise_unchanged", "one_link_group"]);
  }
});

test("W11 preserves text, scripts, marks, ids, and every other file", () => {
  for (const html of [
    pass.replace('>Welcome</h1>', '>Hello</h1>'),
    pass.replace('</body>', '<script>void 0</script></body>'),
    pass.replace('data-doan-prototype="390x844"', 'data-doan-prototype="375x812"'),
    pass.replace('data-doan-id="welcome-action"', 'data-doan-id="new-action"'),
  ]) assert.deepEqual(withCanvas(html), ["canvas_otherwise_unchanged"]);
  const ctx = setup("pass", { ".doan/assets/tokens.css": readFileSync(join(import.meta.dirname, "seed/.doan/assets/tokens.css"), "utf8") + ":root { --space-8: 32px; }\n" });
  assert.deepEqual(failures(ctx), ["only_canvas_changed"]);
});

test("W11 ignores template links, including self-closing template syntax", () => {
  for (const tag of ["<template>", "<template/>"]) {
    const html = seed.replace('</body>', `${tag}<div data-doan-frame="inert" data-doan-prototype="390x844"><button data-doan-goto="welcome"></button><button data-doan-goto="signup"></button><button data-doan-goto="done"></button></div></template></body>`);
    assert.equal(groupChecks(setup("pass", { [canvasPath]: html }))[0]?.pass, false);
  }
});

test("W11 rejects duplicate ids, outside links, raw value mismatches and an extra marked frame", () => {
  const group = (html: string) => groupChecks(setup("pass", { [canvasPath]: html }))[0]?.pass;
  assert.equal(group(pass.replace('data-doan-frame="signup"', 'data-doan-frame="welcome"')), false);
  assert.equal(group(seed.replace('</body>', '<button data-doan-goto="welcome"></button></body>')), false);
  assert.equal(group(pass.replace('data-doan-id="done-back" data-doan-goto="signup"', 'data-doan-id="done-back"').replaceAll('data-doan-goto="done"', 'data-doan-goto=" done"')), false);
  const nested = seed.replace('<section class="phone" data-doan-frame="signup"', '<section data-doan-frame="outer" data-doan-prototype="390x844"><section class="phone" data-doan-frame="signup"').replace('</body>', '</section></body>');
  assert.equal(group(nested.replace('data-doan-id="signup-action"', 'data-doan-id="signup-action" data-doan-goto="welcome"').replace('data-doan-id="done-back"', 'data-doan-id="done-back" data-doan-goto="signup"')), false);
});
