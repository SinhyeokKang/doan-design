import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext } from "../../lib/context.ts";
import { finalResult } from "../../lib/judge.ts";
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
const unmarked = pass.replace(mark, "").replace(frameScript, "");
const partial = { verdict: "partial" as const, reasons: [], stalls: [], layer: "guide" as const };

test("W15 seed and pass leave the judge to grade, fail clicks on the board", () => {
  // The seed has no interaction, so nothing needs a prototype mark; the judge fails a run that changed nothing.
  assert.deepEqual(failures(setup("seed")), []);
  assert.deepEqual(failures(setup("pass")), []);
  assert.deepEqual(failures(setup("fail")), ["no_board_click_trigger", "prototype_marked"]);
});

test("W15 grades still states partial through the judge and a board click fail", () => {
  const still = setup("pass", { [canvasPath]: addFrame(unmarked, '<article class="card" data-doan-id="atlas-card-open"><p>Expanded state</p></article>') });
  assert.equal(finalResult(checks(still), partial), "partial");
  const board = setup("pass", { [canvasPath]: addScript(unmarked, "document.querySelector('[data-doan-id=\"atlas-toggle\"]').addEventListener('click', () => {});") });
  assert.equal(finalResult(checks(board), partial), "fail");
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

test("W15 ignores inert templates for board elements and for frame marks", () => {
  assert.deepEqual(withCanvas(pass.replace("</body>", "<template><details><summary>More</summary></details><button onclick=\"go()\">x</button></template>\n</body>")), []);
  // A click-state rule that matches nothing still counts as interaction, so a mark is needed; one inside a template does not count.
  const templated = addCss(unmarked, ".ghost:focus { outline: none; }").replace("</body>", `<template><section data-doan-frame="extra"${mark}><button class="ghost">x</button></section></template>\n</body>`);
  assert.deepEqual(withCanvas(templated), ["prototype_marked"]);
});

test("W15 attributes each click registration by its receiver", () => {
  for (const script of [
    "document.querySelector('[data-doan-id=\"empty-action\"]').addEventListener('click', () => {});",
    "document.querySelectorAll('button').forEach(b => b.onclick = () => {});",
    "for (const b of document.querySelectorAll('button')) b.addEventListener('mousedown', () => {});",
    "document.addEventListener(\"pointerdown\", () => {});",
    "addEventListener('click', () => {});",
    "window.onclick = () => {};",
    "document.querySelector('.primary').addEventListener(`mousedown`, () => {});",
    // Mentioning the prototype does not make a board registration the prototype's.
    "const frame = document.querySelector('[data-doan-prototype]'); document.querySelector('.primary').onclick = () => {};",
    "const action = document.querySelector('.primary'); action['onclick'] = () => {};",
    "document.querySelector('.primary')[\"onclick\"] = () => {};",
  ]) assert.deepEqual(withCanvas(addScript(pass, script)), ["no_board_click_trigger"], script);
});

test("W15 rejects a script inside the marked frame that reaches a board element", () => {
  const reach = pass.replace(frameScript, "<script>document.querySelector('[data-doan-id=\"empty-action\"]').addEventListener('click', () => {});</script>");
  assert.deepEqual(withCanvas(reach), ["no_board_click_trigger"]);
});

test("W15 accepts registrations whose receiver is inside the marked frame", () => {
  const moved = pass.replace(frameScript, "");
  for (const script of [
    // The Codex baseline's page-level script, scoped by the frame id.
    "const toggle = document.querySelector('[data-doan-frame=\"project-list\"] [data-doan-id=\"atlas-toggle\"]');\nconst details = document.querySelector('#atlas-details');\ntoggle.addEventListener('click', () => details.hidden = !details.hidden);",
    "document.querySelector('[data-doan-id=\"atlas-toggle\"]').addEventListener('click', e => e.currentTarget.closest('.card').classList.toggle('is-open'));",
    "document.querySelectorAll('[data-doan-prototype] button').forEach(b => b.addEventListener('click', () => {}));",
    "const frame = document.querySelector('[data-doan-frame=\"project-list\"]'); frame.querySelector('.toggle').onclick = () => {};",
    // The first button in the document is the prototype's toggle.
    "document.querySelector('button').onclick = () => {};",
  ]) assert.deepEqual(withCanvas(addScript(moved, script)), [], script);
});

test("W15 leaves receivers it cannot resolve statically to the judge", () => {
  for (const script of [
    "for (const id of ['atlas-toggle', 'empty-action']) document.querySelector(`[data-doan-id=\"${id}\"]`).addEventListener('click', () => {});",
    "function wire(el) { el.addEventListener('click', () => {}); } wire(document.body.lastElementChild);",
  ]) assert.deepEqual(withCanvas(addScript(pass, script)), [], script);
});

test("W15 matches click-only CSS states against the element they apply to", () => {
  for (const css of [
    ".primary:active { transform: scale(0.98); }",
    ".primary:FOCUS { outline: none; }",
    ".empty:focus-within p { color: var(--color-primary); }",
    "button:focus { outline: 2px solid var(--color-primary); }",
    "[data-doan-frame]:not([data-doan-prototype]) button:focus { outline: none; }",
    ".card:focus, .primary:focus { outline: none; }",
    ":is(.primary):active { opacity: 0.8; }",
    ":target { outline: 2px solid var(--color-primary); }",
    "@media (min-width: 0) { .primary:active, .primary:hover { opacity: 0.8; } }",
  ]) assert.deepEqual(withCanvas(addCss(pass, css)), ["no_board_click_trigger"], css);
  // The board shares the class, but only the prototype's button has it.
  const shared = addFrame(pass, '<a class="toggle" href="#top">Top</a>');
  assert.deepEqual(withCanvas(addCss(shared, "button.toggle:focus { outline: none; }")), []);
  for (const css of [
    ".primary:hover { opacity: 0.9; }",
    ".primary:focus-visible { outline: 2px solid var(--color-primary); }",
    "/* .primary:active { transform: scale(0.98); } */",
    ".card:not(.primary):focus { outline: none; }",
    '[data-doan-frame="project-list"] .card:focus-within .details { grid-template-rows: 1fr; }',
    "[data-doan-prototype] :target { outline: none; }",
    "input:checked ~ p { display: block; }",
  ]) assert.deepEqual(withCanvas(addCss(pass, css)), [], css);
});

test("W15 reads linked stylesheets, their @import chains and linked scripts", () => {
  const css = pass.replace('<link rel="stylesheet" href="../assets/tokens.css">', '<link rel="stylesheet" href="../assets/tokens.css">\n<link rel="stylesheet" href="../assets/projects.css">');
  assert.deepEqual(withCanvas(css, { ".doan/assets/projects.css": ".primary:active { opacity: 0.8; }\n" }), ["no_board_click_trigger"]);
  assert.deepEqual(withCanvas(css, { ".doan/assets/projects.css": ".card:active { opacity: 0.8; }\n" }), []);
  const imported = pass.replace("<style>", '<style>\n  @import url("../assets/a.css");');
  const chain = { ".doan/assets/a.css": '@import "parts/b.css";\n@import "a.css";\n', ".doan/assets/parts/b.css": "@import '../a.css';\n.primary:focus { outline: none; }\n" };
  assert.deepEqual(withCanvas(imported, chain), ["no_board_click_trigger"]);
  assert.deepEqual(withCanvas(imported, { ...chain, ".doan/assets/parts/b.css": ".card:focus { outline: none; }\n" }), []);
  const page = addScript(pass, "").replace("<script></script>", '<script src="../assets/projects.js"></script>');
  assert.deepEqual(withCanvas(page, { ".doan/assets/projects.js": "document.querySelector('.primary').addEventListener('click', () => {});\n" }), ["no_board_click_trigger"]);
  const inFrame = pass.replace(frameScript, '<script src="../assets/projects.js"></script>');
  assert.deepEqual(withCanvas(inFrame, { ".doan/assets/projects.js": "document.currentScript.closest('[data-doan-frame]').querySelector('.toggle').addEventListener('click', () => {});\n" }), []);
});

test("W15 accepts page-level selectors scoped to the marked frame and rejects them without the mark", () => {
  assert.deepEqual(withCanvas(addScript(unmarked, "document.querySelector('[data-doan-id=\"atlas-toggle\"]').addEventListener('click', () => {});")), ["no_board_click_trigger", "prototype_marked"]);
  assert.deepEqual(withCanvas(addCss(unmarked, ".card:focus-within .details { grid-template-rows: 1fr; }")), ["no_board_click_trigger", "prototype_marked"]);
});

test("W15 accepts the interaction in a new marked frame", () => {
  const playable = '<article class="card" data-doan-id="atlas-play-card"><button class="toggle" type="button" data-doan-id="atlas-play-toggle">Show details</button></article>\n'
    + "<script>document.querySelector('[data-doan-id=\"atlas-play-toggle\"]').addEventListener('click', () => document.querySelector('[data-doan-id=\"atlas-play-card\"]').classList.toggle('is-open'));</script>";
  assert.deepEqual(withCanvas(addFrame(unmarked, playable, true)), []);
});

test("W15 prototype_marked checks only the mark; where the interaction lives is the board check's and the judge's", () => {
  // A marked but empty new frame beside a click on the unmarked target.
  const empty = addFrame(addScript(unmarked, "document.querySelector('[data-doan-id=\"atlas-toggle\"]').onclick = () => {};"), "<p>Play me</p>", true);
  assert.deepEqual(withCanvas(empty), ["no_board_click_trigger"]);
  // A mark on a child of the target is not a frame mark (doan check also refuses it).
  assert.deepEqual(withCanvas(pass.replace(mark, "").replace('<div class="cards">', `<div class="cards"${mark}>`)), ["doan_check_clean", "prototype_marked"]);
  // Marking the other existing frame changes it.
  assert.deepEqual(withCanvas(addCss(unmarked, ".ghost:focus { outline: none; }").replace('data-doan-title="No projects"', `data-doan-title="No projects"${mark}`)), ["other_frames_unchanged", "prototype_marked"]);
});

test("W15 needs the other frames byte-identical", () => {
  assert.deepEqual(withCanvas(pass.replace('<h1 data-doan-id="empty-heading">Projects</h1>', '<h1  data-doan-id="empty-heading">Projects</h1>')), ["other_frames_unchanged"]);
  const empty = pass.slice(pass.indexOf('<section data-doan-frame="project-empty"'), pass.indexOf("</body>"));
  assert.deepEqual(withCanvas(pass.replace(empty, "")), ["other_frames_unchanged"]);
  assert.deepEqual(withCanvas(pass.replace("</body>", `${empty}</body>`)), ["doan_check_clean", "other_frames_unchanged"]);
  // Shared styles in <head> and the target frame may change.
  assert.deepEqual(withCanvas(addCss(pass, ".empty { gap: var(--space-4); }").replace("<h1 data-doan-id=\"list-heading\">Projects</h1>", "<h1 data-doan-id=\"list-heading\">All projects</h1>")), []);
});

test("W15 compares frames by text when astral characters come before or inside them", () => {
  assert.deepEqual(withCanvas(pass.replace('<h2 data-doan-id="atlas-name">Atlas redesign</h2>', '<h2 data-doan-id="atlas-name">🚀 Atlas redesign</h2>')), []);
  assert.deepEqual(withCanvas(pass.replace("<title>Projects</title>", "<title>Projects 🚀</title>")), []);
  assert.deepEqual(withCanvas(pass.replace('<p data-doan-id="empty-copy">No projects yet.', '<p data-doan-id="empty-copy">🚀 No projects yet.')), ["other_frames_unchanged"]);
});

test("W15 fails every canvas check when the canvas is gone", () => {
  const ctx = setup("pass");
  rmSync(join(ctx.repo, canvasPath));
  assert.deepEqual(failures(ctx).filter(id => id !== "doan_check_clean"), ["no_board_click_trigger", "other_frames_unchanged", "prototype_marked"]);
});
