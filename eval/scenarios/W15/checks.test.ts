import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

const root = mkdtempSync(join(tmpdir(), "doan-W15-checks-"));
const cli = join(root, "doan");
const env = { ...process.env, DOAN_RUNTIME: join(root, "runtime.json") };
const canvasPath = ".doan/canvases/projects.html";
const pass = readFileSync(join(import.meta.dirname, "fixtures/pass", canvasPath), "utf8");
const mark = ' data-doan-prototype="1280x800"';
const frameScript = pass.slice(pass.indexOf("<script>"), pass.indexOf("</script>") + "</script>".length);

before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(root, { recursive: true, force: true }));

function setup(kind: "seed" | "pass" | "fail" = "pass", edit: Record<string, string> = {}) {
  const repo = mkdtempSync(join(root, "repo-"));
  cpSync(join(import.meta.dirname, "seed"), repo, { recursive: true });
  execFileSync(cli, ["init", "--repo", repo, "--token-css", join(repo, ".doan/assets/tokens.css")], { env });
  for (const args of [["init", "-q"], ["add", "-A", "-f"], ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed"]]) execFileSync("git", args, { cwd: repo });
  if (kind !== "seed") cpSync(join(import.meta.dirname, "fixtures", kind), repo, { recursive: true });
  for (const [path, text] of Object.entries(edit)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  return createContext({ repo, agent: "fixture", transcript: "", cli, env, seedCommit: "HEAD" });
}
const failures = (ctx: ReturnType<typeof setup>) => checks(ctx).filter(c => !c.pass).map(c => c.id).sort();
const withCanvas = (html: string, extra: Record<string, string> = {}) => failures(setup("pass", { [canvasPath]: html, ...extra }));
// A frame the agent adds after the existing ones, outside any prototype mark unless `marked`.
const addFrame = (html: string, body: string, marked = false) =>
  html.replace("</body>", `<section data-doan-frame="extra" data-doan-title="Extra"${marked ? mark : ""}>\n${body}\n</section>\n</body>`);
const addScript = (html: string, script: string) => html.replace("</body>", `<script>${script}</script>\n</body>`);
const addCss = (html: string, css: string) => html.replace("</style>", `  ${css}\n</style>`);

test("W15 seed has no prototype, pass clicks inside the marked target frame, fail clicks on the board", () => {
  assert.deepEqual(failures(setup("seed")), ["prototype_marked"]);
  assert.deepEqual(failures(setup("pass")), []);
  assert.deepEqual(failures(setup("fail")), ["no_board_click_trigger", "prototype_marked"]);
});

test("W15 rejects click handlers, popovers and details on an unmarked frame", () => {
  for (const body of [
    '<button type="button" onclick="this.nextElementSibling.hidden = false">Replay</button><p hidden>Shown</p>',
    '<button type="button" onpointerdown="go()">Replay</button>',
    '<button type="button" onmousedown="go()">Replay</button>',
    '<button type="button" popovertarget="tip">Info</button><div id="tip" popover>Tip</div>',
    "<details><summary>More</summary><p>Hidden</p></details>",
  ]) assert.deepEqual(withCanvas(addFrame(pass, body)), ["no_board_click_trigger"], body);
});

test("W15 rejects a page script that listens for clicks on board elements or unscoped elements", () => {
  for (const script of [
    "document.querySelector('[data-doan-id=\"empty-action\"]').addEventListener('click', () => {});",
    "document.querySelector('button').onclick = () => {};",
    "document.addEventListener(\"pointerdown\", () => {});",
    "document.querySelector('.primary').addEventListener(`mousedown`, () => {});",
    // A script naming the prototype's elements and a board element still reaches the board.
    "for (const id of ['atlas-toggle', 'empty-action']) document.querySelector(`[data-doan-id=\"${id}\"]`).addEventListener('click', () => {});",
  ]) assert.deepEqual(withCanvas(addScript(pass, script)), ["no_board_click_trigger"], script);
});

test("W15 rejects click-only CSS states on the board but allows hover and keyboard focus", () => {
  for (const css of [
    ".primary:active { transform: scale(0.98); }",
    ".empty:focus-within p { color: var(--color-primary); }",
    "button:focus { outline: 2px solid var(--color-primary); }",
    "input:checked ~ p { display: block; }",
    ":target { outline: 2px solid var(--color-primary); }",
    "@media (min-width: 0) { .primary:active, .primary:hover { opacity: 0.8; } }",
  ]) assert.deepEqual(withCanvas(addCss(pass, css)), ["no_board_click_trigger"], css);
  for (const css of [
    ".primary:hover { opacity: 0.9; }",
    ".primary:focus-visible { outline: 2px solid var(--color-primary); }",
    "/* .primary:active { transform: scale(0.98); } */",
  ]) assert.deepEqual(withCanvas(addCss(pass, css)), [], css);
});

test("W15 reads linked stylesheets and scripts", () => {
  const css = pass.replace('<link rel="stylesheet" href="../assets/tokens.css">', '<link rel="stylesheet" href="../assets/tokens.css">\n<link rel="stylesheet" href="../assets/projects.css">');
  assert.deepEqual(withCanvas(css, { ".doan/assets/projects.css": ".primary:active { opacity: 0.8; }\n" }), ["no_board_click_trigger"]);
  assert.deepEqual(withCanvas(css, { ".doan/assets/projects.css": ".card:active { opacity: 0.8; }\n" }), []);
  const page = addScript(pass, "").replace("<script></script>", '<script src="../assets/projects.js"></script>');
  assert.deepEqual(withCanvas(page, { ".doan/assets/projects.js": "document.querySelector('button').addEventListener('click', () => {});\n" }), ["no_board_click_trigger"]);
  // A linked script inside the marked frame belongs to it.
  const inFrame = pass.replace(frameScript, '<script src="../assets/projects.js"></script>');
  assert.deepEqual(withCanvas(inFrame, { ".doan/assets/projects.js": "document.querySelector('button').addEventListener('click', () => {});\n" }), []);
});

test("W15 accepts page-level scripts and selectors that name only the marked frame's elements", () => {
  const moved = pass.replace(frameScript, "");
  assert.deepEqual(withCanvas(addScript(moved, "document.querySelector('[data-doan-id=\"atlas-toggle\"]').addEventListener('click', e => e.currentTarget.closest('.card').classList.toggle('is-open'));")), []);
  assert.deepEqual(withCanvas(addScript(moved, "document.querySelectorAll('[data-doan-prototype] button').forEach(b => b.addEventListener('click', () => {}));")), []);
  assert.deepEqual(withCanvas(addCss(pass, '[data-doan-frame="project-list"] .card:focus-within .details { grid-template-rows: 1fr; }')), []);
  assert.deepEqual(withCanvas(addCss(pass, "[data-doan-prototype] :target { outline: none; }")), []);
  // Without the mark the same script and selector are on the board.
  const unmarked = moved.replace(mark, "");
  assert.deepEqual(withCanvas(addScript(unmarked, "document.querySelector('[data-doan-id=\"atlas-toggle\"]').addEventListener('click', () => {});")), ["no_board_click_trigger", "prototype_marked"]);
  assert.deepEqual(withCanvas(addCss(pass.replace(mark, "").replace(frameScript, ""), ".card:focus-within .details { grid-template-rows: 1fr; }")), ["no_board_click_trigger", "prototype_marked"]);
});

test("W15 accepts the motion in a new marked frame and rejects a mark that is not on the target or a new frame", () => {
  const unmarked = pass.replace(mark, "").replace(frameScript, "");
  assert.deepEqual(withCanvas(addFrame(unmarked, `<div class="card" data-doan-id="atlas-card-play"><button class="toggle" type="button">Show details</button></div>\n${frameScript}`, true)), []);
  assert.deepEqual(withCanvas(addFrame(unmarked, "<p>Static expanded state</p>")), ["prototype_marked"]);
  // A mark on a child of the target is not a frame mark (doan check also refuses it).
  assert.deepEqual(withCanvas(pass.replace(mark, "").replace('<div class="cards">', `<div class="cards"${mark}>`)), ["doan_check_clean", "prototype_marked"]);
  // Marking the other existing frame changes it.
  assert.deepEqual(withCanvas(unmarked.replace('data-doan-title="No projects"', `data-doan-title="No projects"${mark}`)), ["other_frames_unchanged", "prototype_marked"]);
});

test("W15 needs the other frames byte-identical", () => {
  assert.deepEqual(withCanvas(pass.replace('<h1 data-doan-id="empty-heading">Projects</h1>', '<h1  data-doan-id="empty-heading">Projects</h1>')), ["other_frames_unchanged"]);
  const empty = pass.slice(pass.indexOf('<section data-doan-frame="project-empty"'), pass.indexOf("</body>"));
  assert.deepEqual(withCanvas(pass.replace(empty, "")), ["other_frames_unchanged"]);
  assert.deepEqual(withCanvas(pass.replace("</body>", `${empty}</body>`)), ["doan_check_clean", "other_frames_unchanged"]);
  // Shared styles in <head> and the target frame may change.
  assert.deepEqual(withCanvas(addCss(pass, ".empty { gap: var(--space-4); }").replace("<h1 data-doan-id=\"list-heading\">Projects</h1>", "<h1 data-doan-id=\"list-heading\">All projects</h1>")), []);
});

test("W15 fails every canvas check when the canvas is gone", () => {
  const ctx = setup("pass");
  rmSync(join(ctx.repo, canvasPath));
  assert.deepEqual(failures(ctx).filter(id => id !== "doan_check_clean"), ["no_board_click_trigger", "other_frames_unchanged", "prototype_marked"]);
});
