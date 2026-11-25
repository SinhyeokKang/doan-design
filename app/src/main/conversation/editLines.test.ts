import { describe, expect, it } from "vitest";
import { countStructuredPatch, countTextChange, countUnifiedDiff, EDIT_DISTANCE_MAX, EDIT_LINES_MAX } from "./editLines";

// How an applied edit's added and removed lines are counted from what each provider reports: a unified diff (Codex), a
// structured patch (Claude Code) or the text before and after (ACP). null means the count is unknown, and the step then
// shows no numbers.
const lines = (n: number, tag = "line") => Array.from({ length: n }, (_, i) => `${tag} ${i}\n`).join("");

describe("countUnifiedDiff", () => {
  it("counts the added and removed lines of a hunk", () => {
    expect(countUnifiedDiff("--- a/a.ts\n+++ b/a.ts\n@@ -1,3 +1,4 @@\n keep\n-old\n+new\n+more\n keep\n")).toEqual({ added: 2, removed: 1 });
  });
  it("counts every hunk of a diff with several", () => {
    const diff = "--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-a\n+A\n x\n@@ -10,2 +10,3 @@\n y\n-b\n+B\n+C\n";
    expect(countUnifiedDiff(diff)).toEqual({ added: 3, removed: 2 });
  });
  it("counts a diff without file headers", () => {
    expect(countUnifiedDiff("@@ -1 +1 @@\n-a\n+b\n")).toEqual({ added: 1, removed: 1 });
  });
  it("counts a new file's diff as added lines only", () => {
    expect(countUnifiedDiff("diff --git a/n.ts b/n.ts\nnew file mode 100644\n--- /dev/null\n+++ b/n.ts\n@@ -0,0 +1,3 @@\n+a\n+b\n+c\n")).toEqual({ added: 3, removed: 0 });
  });
  it("counts a deleted file's diff as removed lines only", () => {
    expect(countUnifiedDiff("--- a/d.ts\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-a\n-b\n")).toEqual({ added: 0, removed: 2 });
  });
  it("does not count the no-newline marker", () => {
    expect(countUnifiedDiff("--- a/a\n+++ b/a\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+a\n")).toEqual({ added: 1, removed: 1 });
  });
  // Inside a hunk, a line is a removal whatever follows its "-", even when it reads like a file header.
  it("counts removed lines that start with -- as removals, not headers", () => {
    expect(countUnifiedDiff("--- a/a.sql\n+++ b/a.sql\n@@ -1,3 +1,1 @@\n--- a comment\n-- another\n+x\n-y\n")).toEqual({ added: 1, removed: 3 });
    expect(countUnifiedDiff("--- a/a\n+++ b/a\n@@ -1 +1 @@\n-x\n+++ plus\n")).toEqual({ added: 1, removed: 1 });
  });
  it("counts a diff with CRLF line ends", () => {
    expect(countUnifiedDiff("--- a/a\r\n+++ b/a\r\n@@ -1,2 +1,2 @@\r\n-a\r\n+b\r\n c\r\n")).toEqual({ added: 1, removed: 1 });
  });
  it("counts the hunks of several files in one diff", () => {
    const diff = "--- a/a\n+++ b/a\n@@ -1 +1 @@\n-a\n+b\n--- a/b\n+++ b/b\n@@ -1 +1,2 @@\n x\n+y\n";
    expect(countUnifiedDiff(diff)).toEqual({ added: 2, removed: 1 });
  });
  it.each([
    ["an empty text", ""],
    ["headers only", "--- a/e.ts\n+++ b/e.ts\n"],
    ["an empty new file's headers", "diff --git a/e b/e\nnew file mode 100644\nindex 0000000..e69de29\n"],
    ["a binary diff", "diff --git a/i.png b/i.png\nindex 1..2 100644\nBinary files a/i.png and b/i.png differ\n"],
    ["a hunk header without counts", "--- a/a\n+++ b/a\n@@\n-a\n+b\n"],
    ["a hunk shorter than its header", "@@ -1,3 +1,3 @@\n-a\n+b\n"],
    ["a hunk line without a prefix", "@@ -1,2 +1,2 @@\n-a\n+b\nzz\n"],
    ["changed lines past the hunk's counts", "@@ -1 +1 @@\n-a\n+b\n+c\n"],
  ])("is unknown for %s", (_name, text) => {
    expect(countUnifiedDiff(text)).toBeNull();
  });
});

describe("countStructuredPatch", () => {
  it("counts the + and - lines of a hunk", () => {
    expect(countStructuredPatch([{ oldStart: 1, oldLines: 3, newStart: 1, newLines: 3, lines: [" a", "-b", "+B", " c"] }])).toEqual({ added: 1, removed: 1 });
  });
  // MultiEdit and replace_all each come as one patch with a hunk per changed place.
  it("sums the hunks of a MultiEdit or replace_all patch", () => {
    const hunks = [
      { oldStart: 2, oldLines: 1, newStart: 2, newLines: 1, lines: ["-foo()", "+bar()"] },
      { oldStart: 9, oldLines: 3, newStart: 9, newLines: 4, lines: [" x", "-foo()", "+bar()", "+baz()", " y"] },
      { oldStart: 20, oldLines: 1, newStart: 21, newLines: 0, lines: ["-foo()"] },
    ];
    expect(countStructuredPatch(hunks)).toEqual({ added: 3, removed: 3 });
  });
  it("does not count the no-newline marker and counts -- lines as removals", () => {
    expect(countStructuredPatch([{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["--- x", "\\ No newline at end of file", "+y"] }])).toEqual({ added: 1, removed: 1 });
  });
  it("counts an empty patch as no change", () => {
    expect(countStructuredPatch([])).toEqual({ added: 0, removed: 0 });
  });
  it.each<[string, unknown]>([
    ["not a list", { lines: ["+a"] }], ["a hunk that is not an object", ["+a"]], ["a hunk without lines", [{ oldStart: 1 }]],
    ["a line that is not text", [{ lines: ["+a", 3] }]], ["a line without a prefix", [{ lines: ["a"] }]], ["an empty line", [{ lines: [""] }]],
  ])("is unknown for %s", (_name, hunks) => {
    expect(countStructuredPatch(hunks)).toBeNull();
  });
});

describe("countTextChange", () => {
  it("counts the lines one edit changed in the middle of a file", () => {
    expect(countTextChange("a\nb\nc\nd\n", "a\nB\nc\nd\nE\n")).toEqual({ added: 2, removed: 1 });
  });
  it("counts a new file as added lines and a deleted file as removed lines", () => {
    expect(countTextChange("", "a\nb\nc\n")).toEqual({ added: 3, removed: 0 });
    expect(countTextChange("a\nb\n", "")).toEqual({ added: 0, removed: 2 });
  });
  it("counts empty files and unchanged text as no change", () => {
    expect(countTextChange("", "")).toEqual({ added: 0, removed: 0 });
    expect(countTextChange("same\ntext\n", "same\ntext\n")).toEqual({ added: 0, removed: 0 });
  });
  // As git counts it: a last line that gains or loses its newline is a changed line.
  it("counts a last line without a newline", () => {
    expect(countTextChange("a\nb", "a\nb\nc")).toEqual({ added: 2, removed: 1 });
    expect(countTextChange("a", "a\n")).toEqual({ added: 1, removed: 1 });
    expect(countTextChange("", "a")).toEqual({ added: 1, removed: 0 });
  });
  it("reads CRLF and LF line ends as the same", () => {
    expect(countTextChange("a\r\nb\r\nc\r\n", "a\nb\nc\n")).toEqual({ added: 0, removed: 0 });
    expect(countTextChange("a\r\nb\nc\r\n", "a\nB\r\nc\n")).toEqual({ added: 1, removed: 1 });
  });
  it("counts the shortest change when lines repeat", () => {
    expect(countTextChange("x\na\nx\nb\nx\n", "x\nb\nx\na\nx\n")).toEqual({ added: 2, removed: 2 });
    expect(countTextChange("a\nb\nc\na\nb\nb\na\n", "c\nb\na\nb\na\nc\n")).toEqual({ added: 2, removed: 3 });
  });
  it("counts a change at exactly the distance limit", () => {
    expect(countTextChange(lines(EDIT_DISTANCE_MAX / 2, "old"), lines(EDIT_DISTANCE_MAX / 2, "new"))).toEqual({ added: EDIT_DISTANCE_MAX / 2, removed: EDIT_DISTANCE_MAX / 2 });
  });
  it("is unknown past the distance limit", () => {
    expect(countTextChange("", lines(EDIT_DISTANCE_MAX + 1))).toBeNull();
    expect(countTextChange(lines(EDIT_DISTANCE_MAX / 2 + 1, "old"), lines(EDIT_DISTANCE_MAX / 2, "new"))).toBeNull();
  });
  it("is unknown when the two texts hold more lines than the limit, however small the change", () => {
    const text = lines(EDIT_LINES_MAX / 2);
    expect(countTextChange(text, text + "x\n")).toBeNull();
    const fits = lines(EDIT_LINES_MAX / 2 - 1);
    expect(countTextChange(fits, fits + "x\n")).toEqual({ added: 1, removed: 0 });
  });
  // The count runs synchronously in main while a turn streams, so its worst case must stay short.
  it("gives up on a whole 5,000-line canvas rewritten, within 50 ms", () => {
    const before = lines(5_000, "old"), after = lines(5_000, "new");
    const runs = Array.from({ length: 3 }, () => {
      const start = performance.now();
      expect(countTextChange(before, after)).toBeNull();
      return performance.now() - start;
    });
    expect(Math.min(...runs)).toBeLessThan(50);
  });
  it("stays within 50 ms for a change just under the distance limit among repeated lines", () => {
    const before = Array.from({ length: 9_000 }, (_, i) => i % 3 ? "}\n" : `x${i}\n`).join("");
    const after = Array.from({ length: 9_000 }, (_, i) => i % 3 ? "}\n" : i < 1_200 ? `y${i}\n` : `x${i}\n`).join("");
    const runs = Array.from({ length: 3 }, () => {
      const start = performance.now();
      expect(countTextChange(before, after)).toEqual({ added: 400, removed: 400 });
      return performance.now() - start;
    });
    expect(Math.min(...runs)).toBeLessThan(50);
  });
});
