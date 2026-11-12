import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-W6-checks-"));
const cli = join(root, "doan");
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
const canvasPath = ".doan/canvases/notifications.html";
const shellPath = ".doan/assets/components/app-shell.css";
const pass = readFileSync(join(import.meta.dirname, "fixtures/pass", canvasPath), "utf8");
const seedShell = readFileSync(join(import.meta.dirname, "seed", shellPath), "utf8");
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
const failures = (ctx: ReturnType<typeof setup>) => checks(ctx).filter(c => !c.pass).map(c => c.id).sort();

test("W6 seed checks clean and the pass fixture passes", () => {
  const seed = setup("seed").doan(["check"]);
  assert.equal(seed.code, 0);
  assert.deepEqual(seed.json.result.findings.map((f: { code: string }) => f.code), ["no_canvases"]);
  assert.deepEqual(failures(setup("pass")), []);
});

test("W6 fail fixture trips every sprite and custom url check", () => {
  assert.deepEqual(failures(setup("fail")), ["doan_check_clean", "icons_inline", "no_ambiguous_custom_url", "no_svg_use_not_inline"]);
});

test("W6 rejects one external <use> left in the canvas", () => {
  const html = pass.replace('<use href="#icon-bell"/>', '<use href="../assets/icons.svg#icon-bell"/>');
  assert.deepEqual(failures(setup("pass", { [canvasPath]: html })), ["doan_check_clean", "icons_inline", "no_svg_use_not_inline"]);
});

test("W6 rejects an ambiguous custom property url left in the shared stylesheets", () => {
  assert.deepEqual(failures(setup("pass", { [shellPath]: seedShell })), ["no_ambiguous_custom_url"]);
});

test("W6 accepts the custom property registered with @property instead of the stylesheet edit", () => {
  const ctx = setup("pass", { [shellPath]: seedShell });
  appendFileSync(join(ctx.repo, ".doan/assets/tokens.css"), '@property --brand-logo { syntax: "<url>"; inherits: true; initial-value: url(brand/logo.svg); }\n');
  assert.deepEqual(failures(ctx), []);
});

test("W6 needs each icon's symbol in the canvas, outside <template>, named by a fragment <use>", () => {
  const ids = (html: string) => failures(setup("pass", { [canvasPath]: html }));
  const bell = /\s*<symbol id="icon-bell"[^\n]*<\/symbol>/;
  const bellSymbol = pass.match(bell)![0];
  assert.deepEqual(ids(pass.replace(bell, "")), ["icons_inline"]);
  assert.deepEqual(ids(pass.replace(bell, "").replace("</body>", `<template><svg>${bellSymbol}</svg></template>\n</body>`)), ["icons_inline"]);
  assert.deepEqual(ids(pass.replace('<use href="#icon-bell"/>', '<use href="#icon-user"/>')), ["icons_inline"]);
  // A different drawing under the right id is not the sprite's icon.
  assert.deepEqual(ids(pass.replace(bellSymbol, bellSymbol.replace(/d="M6 16[^"]*"/, 'd="M0 0h24v24H0z"'))), ["icons_inline"]);
});

test("W6 accepts xlink:href, a renamed symbol and a symbol restyled without the sprite's class", () => {
  const ids = (html: string) => failures(setup("pass", { [canvasPath]: html }));
  assert.deepEqual(ids(pass.replace('<use href="#icon-bell"/>', '<use xlink:href=" #icon-bell "/>')), []);
  assert.deepEqual(ids(pass.replace('id="icon-bell"', 'id="nav-bell"').replace('href="#icon-bell"', 'href="#nav-bell"')), []);
  assert.deepEqual(ids(pass.replaceAll(' class="icon-line"', "")), []);
});

test("W6 requires the canvas to use the tokens and the app shell stylesheet", () => {
  const ids = (html: string) => failures(setup("pass", { [canvasPath]: html }));
  assert.deepEqual(ids(pass.replace('  <link rel="stylesheet" href="../assets/components/app-shell.css">\n', "")), ["shell_styles_linked"]);
  assert.deepEqual(ids(pass.replace('  <link rel="stylesheet" href="../assets/components/app-shell.css">\n', "").replace("<style>", '<style>\n    @import "../assets/components/app-shell.css";')), []);
});
