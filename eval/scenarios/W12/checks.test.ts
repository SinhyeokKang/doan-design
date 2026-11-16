import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-W12-checks-"));
const cli = join(root, "doan");
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
const canvasPath = ".doan/canvases/inbox.html";
const pass = readFileSync(join(import.meta.dirname, "fixtures/pass", canvasPath), "utf8");
const fallback = "var(--doan-viewport-height, 900px)";

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
const withCanvas = (html: string, extra: Record<string, string> = {}) => failures(setup("pass", { [canvasPath]: html, ...extra }));

test("W12 seed has no canvas, and pass fits a desktop frame to the window with the fallback", () => {
  assert.deepEqual(failures(setup("seed")), ["canvas_created", "desktop_prototype", "viewport_height_fallback"]);
  assert.deepEqual(failures(setup("pass")), []);
});

test("W12 fail fixture follows the viewport with 100vh", () => {
  assert.deepEqual(failures(setup("fail")), ["no_viewport_height_unit", "viewport_height_fallback"]);
});

// Each check reads doan check's own finding codes or the canvas, so a renamed code cannot let every run pass.
test("W12 rejects a missing fallback, a vh fallback and a fallback other than the frame's height", () => {
  assert.deepEqual(withCanvas(pass.replace(fallback, "var(--doan-viewport-height)")), ["no_viewport_height_no_fallback", "viewport_height_fallback"]);
  assert.deepEqual(withCanvas(pass.replace(fallback, "var(--doan-viewport-height, 100vh)")), ["no_viewport_height_unit", "viewport_height_fallback"]);
  assert.deepEqual(withCanvas(pass.replace(fallback, "var(--doan-viewport-height, 800px)")), ["viewport_height_fallback"]);
  assert.deepEqual(withCanvas(pass.replace(fallback, "900px")), ["viewport_height_fallback"]);
});

test("W12 rejects a size taken from the content height and a frame that is not marked", () => {
  assert.deepEqual(withCanvas(pass.replace('data-doan-prototype="1440x900"', 'data-doan-prototype="1440x2400"').replace(fallback, "var(--doan-viewport-height, 2400px)")), ["desktop_prototype", "viewport_height_fallback"]);
  assert.deepEqual(withCanvas(pass.replace(' data-doan-prototype="1440x900"', "")), ["desktop_prototype", "viewport_height_fallback"]);
  assert.deepEqual(withCanvas(pass.replace(' data-doan-prototype="1440x900">', ">").replace("<body>", '<body><template><div data-doan-frame="t" data-doan-prototype="1440x900"></div></template>')), ["desktop_prototype", "viewport_height_fallback"]);
});

test("W12 rejects defining the variable in CSS or from a script", () => {
  assert.deepEqual(withCanvas(pass.replace("</style>", ":root { --doan-viewport-height: 100%; }\n</style>")), ["variable_not_defined"]);
  assert.deepEqual(withCanvas(pass.replace("</body>", "<script>document.documentElement.style.setProperty('--doan-viewport-height', innerHeight + 'px')</script></body>")), ["variable_not_defined"]);
});

test("W12 needs the variable on a height, not a min-height", () => {
  assert.deepEqual(withCanvas(pass.replace(`height: ${fallback}`, `min-height: ${fallback}`)), ["viewport_height_fallback"]);
});

test("W12 accepts the variable in calc(), a style attribute or a linked stylesheet", () => {
  assert.deepEqual(withCanvas(pass.replace(`flex: 1; min-height: 0;`, `height: calc(${fallback} - 64px); min-height: 0;`).replace(`height: ${fallback};`, "")), []);
  assert.deepEqual(withCanvas(pass.replace(`height: ${fallback};`, "").replace('<main class="app"', `<main style="height: ${fallback}" class="app"`)), []);
  const linked = pass.replace(`height: ${fallback};`, "").replace('<link rel="stylesheet" href="../assets/tokens.css">', '<link rel="stylesheet" href="../assets/tokens.css">\n<link rel="stylesheet" href="../assets/inbox.css">');
  assert.deepEqual(withCanvas(linked, { ".doan/assets/inbox.css": `.app { height: ${fallback}; }\n` }), []);
  // doan check does not scan linked stylesheets for vh, so the scenario reads them itself.
  assert.deepEqual(withCanvas(linked, { ".doan/assets/inbox.css": ".app { height: 100dvh; }\n" }), ["no_viewport_height_unit", "viewport_height_fallback"]);
});
