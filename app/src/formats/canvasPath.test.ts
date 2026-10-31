import { describe, expect, test } from "vitest";
import { CANVAS_DIRS, canvasDir, canvasKind } from "./canvasPath";

describe("canvasKind", () => {
  test.each([
    [".doan/canvases/a.html", "canvases"],
    [".doan/canvases/sub/deep/a.html", "canvases"],
    [".doan/ds/button.html", "ds"],
    [".doan/ds/forms/input.html", "ds"],
    [".doan/ds/A.HTML", "ds"],
    [".doan/canvases/b.Html", "canvases"],
  ])("%s is a %s canvas", (path, kind) => {
    expect(canvasKind(path)).toBe(kind);
  });

  test.each([
    ["the ds directory itself", ".doan/ds"],
    ["the ds directory with a slash", ".doan/ds/"],
    ["the canvases directory itself", ".doan/canvases"],
    ["a look-alike directory", ".doan/dsx/a.html"],
    ["another look-alike", ".doan/canvases-old/a.html"],
    ["a stylesheet", ".doan/ds/tokens.css"],
    [".htm", ".doan/ds/a.htm"],
    ["a dot file", ".doan/ds/.a.html"],
    ["a file in a dot folder", ".doan/canvases/.cache/a.html"],
    ["an empty segment", ".doan/ds//a.html"],
    ["a temporary save", ".doan/ds/a.html.tmp.1.ab"],
    ["the assets directory", ".doan/assets/a.html"],
    ["outside .doan", "ds/a.html"],
    ["a comment file", ".doan/comments/a.jsonl"],
  ])("%s is not a canvas", (_label, path) => {
    expect(canvasKind(path)).toBeNull();
  });
});

describe("canvasDir", () => {
  test.each([
    [".doan/ds", "ds"],
    [".doan/ds/", "ds"],
    [".doan/ds/tokens.css", "ds"],
    [".doan/ds/.a.html", "ds"],
    [".doan/canvases", "canvases"],
    [".doan/canvases/sub", "canvases"],
  ])("%s is in %s", (path, kind) => {
    expect(canvasDir(path)).toBe(kind);
  });

  test.each([".doan", ".doan/dsx", ".doan/dsx/a.html", ".doan/assets/a.css", "../.doan/ds/a.html", ""])("%s is in neither", (path) => {
    expect(canvasDir(path)).toBeNull();
  });

  test("names both directories", () => {
    expect(CANVAS_DIRS).toEqual({ ds: ".doan/ds", canvases: ".doan/canvases" });
  });
});
