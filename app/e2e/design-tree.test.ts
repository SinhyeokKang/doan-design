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
