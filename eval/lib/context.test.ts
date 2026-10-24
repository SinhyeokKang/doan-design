import assert from "node:assert/strict";
import { test } from "node:test";
import { addedLines, parseEvents, resolveInside } from "./context.ts";

test("paths stay inside the repo", () => {
  assert.equal(resolveInside("/tmp/r", "design/a.html"), "/tmp/r/design/a.html");
  for (const bad of ["/etc/passwd", "../x", "design/../../x", ""]) assert.throws(() => resolveInside("/tmp/r", bad), Error, bad);
});

test("added comment lines are the ones the seed did not have", () => {
  assert.deepEqual(addedLines(null, null), []);
  assert.deepEqual(addedLines(null, "a\nb\n"), ["a", "b"]);
  assert.deepEqual(addedLines("a\nb\n", "a\nb\nc\n"), ["c"]);
  // A rewrite that drops or reorders seed lines still reports only new lines, each as often as it was added.
  assert.deepEqual(addedLines("a\nb\n", "b\nc\nc\n"), ["c", "c"]);
  assert.deepEqual(addedLines("a\na\n", "a\na\na\n"), ["a"]);
});

test("events are parsed and a bad line is kept visible", () => {
  assert.deepEqual(parseEvents(['{"type":"resolve"}', "nope"]), [{ type: "resolve" }, { invalid: "nope" }]);
});
