import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { addedLines, createContext, parseEvents, repoPath, resolveInside } from "./context.ts";

test("paths stay inside the repo", () => {
  assert.equal(resolveInside("/tmp/r", "doan/a.html"), "/tmp/r/doan/a.html");
  for (const bad of ["/etc/passwd", "../x", "doan/../../x", ""]) assert.throws(() => resolveInside("/tmp/r", bad), Error, bad);
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

test("git sees the same normalized path as the file system", () => {
  assert.equal(repoPath("/tmp/r", "doan/../styles/a.css"), "styles/a.css");
});

test("read and exists refuse a symlink, or a symlinked ancestor, that leaves the repo", () => {
  const base = realpathSync(mkdtempSync("/tmp/doan-eval-test-"));
  try {
    const repo = join(base, "repo");
    mkdirSync(join(repo, "doan"), { recursive: true });
    mkdirSync(join(base, "outside"));
    writeFileSync(join(base, "outside", "secret.txt"), "outside sentinel");
    writeFileSync(join(repo, "doan", "a.html"), "inside");
    symlinkSync(join(base, "outside", "secret.txt"), join(repo, "answer.txt"));
    symlinkSync(join(base, "outside"), join(repo, "linked"));
    symlinkSync("doan/a.html", join(repo, "alias.html"));
    const ctx = createContext({ repo, agent: "fixture", transcript: "", cli: "/nonexistent", env: process.env, seedCommit: "HEAD" });
    for (const escape of ["answer.txt", "linked/secret.txt", "linked/missing.txt"]) {
      assert.throws(() => ctx.read(escape), /leaves the repo/, escape);
      assert.throws(() => ctx.exists(escape), /leaves the repo/, escape);
    }
    // Links that stay inside, and plain misses, behave as before.
    assert.equal(ctx.read("alias.html"), "inside");
    assert.equal(ctx.exists("alias.html"), true);
    assert.equal(ctx.read("doan/missing.html"), null);
    assert.equal(ctx.exists("doan/missing.html"), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
