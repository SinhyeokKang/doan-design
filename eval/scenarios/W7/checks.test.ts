import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import type { CheckContext } from "../../lib/types.ts";
import checks, { validSize } from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-W7-checks-"));
const cli = join(root, "doan");
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
const canvasPath = ".doan/canvases/onboarding.html";
const pass = readFileSync(join(import.meta.dirname, "fixtures/pass", canvasPath), "utf8");
const seed = readFileSync(join(import.meta.dirname, "seed", canvasPath), "utf8");
const mark = ' data-doan-prototype="390x844"';
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

test("W7 seed checks clean with no mark, and the pass fixture marks only the phone frame", () => {
  const ctx = setup("seed");
  const result = ctx.doan(["check"]);
  assert.equal(result.code, 0);
  assert.deepEqual(result.json.result.findings, []);
  assert.deepEqual(failures(ctx), ["only_canvas_changed", "prototype_on_frame"]);
  assert.deepEqual(failures(setup("pass")), []);
});

test("W7 size check follows the shared prototype mark grammar", () => {
  const cases = JSON.parse(readFileSync(join(import.meta.dirname, "../../../schema/fixtures/prototype-mark/cases.json"), "utf8"));
  for (const c of cases.values as { name: string; value: string; valid: boolean }[]) assert.equal(validSize(c.value), c.valid, c.name);
});

test("W7 fail fixture puts the mark on a child of the frame", () => {
  assert.deepEqual(failures(setup("fail")), ["doan_check_clean", "prototype_on_frame"]);
});

test("W7 rejects an invalid size on the right frame", () => {
  assert.deepEqual(withCanvas(pass.replace(mark, ' data-doan-prototype="390"')), ["doan_check_clean", "prototype_on_frame"]);
  assert.deepEqual(withCanvas(pass.replace(mark, ' data-doan-prototype="390X844"')), ["doan_check_clean", "prototype_on_frame"]);
});

test("W7 rejects the mark on another frame, on two frames, or missing", () => {
  const desktop = 'data-doan-title="Sign up (desktop)"';
  assert.deepEqual(withCanvas(seed.replace(desktop, `${desktop}${mark}`)), ["prototype_on_frame"]);
  assert.deepEqual(withCanvas(pass.replace(desktop, `${desktop}${mark}`)), ["prototype_on_frame"]);
  assert.deepEqual(withCanvas(seed), ["only_canvas_changed", "prototype_on_frame"]);
});

test("W7 ignores a mark inside <template> and still needs one on the frame", () => {
  assert.deepEqual(withCanvas(pass.replace("</body>", `<template><div data-doan-frame="extra"${mark}></div></template>\n</body>`)), ["canvas_otherwise_unchanged"]);
  assert.deepEqual(withCanvas(seed.replace("</body>", `<template><div data-doan-frame="signup-phone"${mark}></div></template>\n</body>`)), ["canvas_otherwise_unchanged", "prototype_on_frame"]);
});

test("W7 accepts any valid size and reformatted markup, and rejects other edits", () => {
  assert.deepEqual(withCanvas(pass.replace(mark, ' data-doan-prototype="375x812"')), []);
  assert.deepEqual(withCanvas(pass.replace(`data-doan-title="Sign up (phone)"${mark}`, `data-doan-prototype="390x844"\n  data-doan-title="Sign up (phone)"`)), []);
  assert.deepEqual(withCanvas(pass.replace(">Sign up</button>\n</div>", ">Join now</button>\n</div>")), ["canvas_otherwise_unchanged"]);
  assert.deepEqual(withCanvas(pass.replace("</body>", "<script>document.querySelector('button').onclick = () => {};</script>\n</body>")), ["canvas_otherwise_unchanged"]);
});

test("W7 rejects a change to another file", () => {
  const ctx = setup("pass", { ".doan/assets/tokens.css": readFileSync(join(import.meta.dirname, "seed/.doan/assets/tokens.css"), "utf8") + ":root { --space-8: 32px; }\n" });
  assert.deepEqual(failures(ctx), ["only_canvas_changed"]);
});
