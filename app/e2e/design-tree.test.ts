import assert from "node:assert/strict";
import { test } from "node:test";
const nav: typeof import("./design-tree") = await import(new URL("./design-tree.ts", import.meta.url).href);

test("canvas identity keeps nested paths and roots distinct, including CSS punctuation", () => {
  assert.equal(nav.canvasKeySelector('design/a.html', '/tmp/a"b\\c'), '[data-key="/tmp/a\\"b\\\\c\\a design/a.html"]');
  assert.equal(nav.canvasKeySelector('a.html'), '[data-key$="/a.html"]');
  assert.notEqual(nav.canvasKeySelector('design/sub/a.html', '/tmp/a'), nav.canvasKeySelector('design/a.html', '/tmp/a'));
  assert.notEqual(nav.canvasKeySelector('design/a.html', '/tmp/a'), nav.canvasKeySelector('design/a.html', '/tmp/b'));
});

test("basename lookup remains scoped to its explicit root", () => {
  assert.equal(nav.canvasKeySelector('a.html', '/tmp/other'), '[data-key^="/tmp/other\\a "][data-key$="/a.html"]');
});

const canvas = (name: string, path: string, where = " · acme · main") => ({ glyph: "◧", name, context: ` — ${path.replace(/^design\//, "")}`, where });
const frame = (where = " · acme · main") => ({ glyph: "#", name: "Hero", context: " — Shared › 1", where });
const identity = { key: "/tmp/acme\ndesign/b.html", src: "doan://canvas/b", title: "Shared" };

test("frame selection resolves full current path and ignores earlier other-root results", () => {
  assert.equal(nav.frameOptionIndex(identity, 0, [canvas("Shared", "design/b.html")],
    [canvas("Shared", "design/b.html"), canvas("Shared", "design/b.html", " · other · main")],
    [frame(" · other · main"), frame()]), 1);
});

for (const [name, local, global, frames] of [
  ["same-root duplicate titles", [canvas("Shared", "design/a.html"), canvas("Shared", "design/b.html")], [canvas("Shared", "design/a.html"), canvas("Shared", "design/b.html")], [frame(), frame()]],
  ["different roots with identical display names", [canvas("Shared", "design/b.html")], [canvas("Shared", "design/b.html"), canvas("Shared", "design/b.html")], [frame(), frame()]],
  ["missing current frame", [canvas("Shared", "design/b.html")], [canvas("Shared", "design/b.html")], [frame(" · other · main")]],
  ["truncated evidence", Array.from({ length: 50 }, () => canvas("Shared", "design/b.html")), [canvas("Shared", "design/b.html")], [frame()]],
] as const) {
  test(`frame selection refuses ${name}`, () => {
    assert.throws(() => nav.frameOptionIndex(identity, 0, local, global, frames), /Quick Open.*identity/);
  });
}

test("frame selection refuses a unique title result for the wrong full path", () => {
  assert.throws(() => nav.frameOptionIndex(identity, 0, [canvas("Shared", "design/sub/b.html")],
    [canvas("Shared", "design/sub/b.html")], [frame()]), /Quick Open.*identity/);
});

test("first worktree visit verifies Overview and clears selection before explicitly opening the canvas", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./projects-home.ts", import.meta.url), "utf8");
  const start = source.indexOf('await guard.getByRole("button", { name: "Discard", exact: true }).click()');
  const end = source.indexOf('await shot("05-workspace")', start);
  const visit = source.slice(start, end);
  assert.match(visit, /name: "Overview"/);
  assert.match(visit, /result.selection, undefined/);
  assert.match(visit, /canvasRow\(page, "design\/shared.html", branch\)\.click\(\)/);
  assert.ok(visit.indexOf('name: "Overview"') < visit.indexOf('branch).click()'));
  assert.ok(visit.indexOf('result.selection, undefined') < visit.indexOf('branch).click()'));
});
