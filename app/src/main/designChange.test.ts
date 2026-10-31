import { describe, expect, test } from "vitest";
import { classifyDesignChange } from "./designChange";

const quiet = (...revPaths: string[]) => ({ bumpServed: false, revPaths });
const bump = (...revPaths: string[]) => ({ bumpServed: true, revPaths });
// Most cases are about names inside one canvas directory; the watcher reports them repo-relative.
const classify = (names: readonly string[]) => classifyDesignChange(names.map((name) => `.doan/canvases/${name}`));

describe("classifyDesignChange", () => {
  test("an unknown name set bumps with no row revisions", () => {
    expect(classifyDesignChange(null)).toEqual(bump());
  });

  test("an empty name set changes nothing", () => {
    expect(classify([])).toEqual(quiet());
  });

  test("canvas paths only bump their rows", () => {
    expect(classify(["a.html"])).toEqual(quiet(".doan/canvases/a.html"));
    expect(classify(["account/profile.html", "deep/er/x.html"])).toEqual(quiet(".doan/canvases/account/profile.html", ".doan/canvases/deep/er/x.html"));
  });

  test("the extension is matched without case", () => {
    expect(classify(["A.HTML", "b.Html"])).toEqual(quiet(".doan/canvases/A.HTML", ".doan/canvases/b.Html"));
  });

  test("a name listed twice counts once", () => {
    expect(classify(["a.html", "a.html"])).toEqual(quiet(".doan/canvases/a.html"));
  });

  // A rename arrives as both names; creation and deletion as one each.
  test("create, delete and rename pairs stay row-only", () => {
    expect(classify(["old.html", "sub/new.html"])).toEqual(quiet(".doan/canvases/old.html", ".doan/canvases/sub/new.html"));
  });

  test.each([
    ["a stylesheet", "theme.css"],
    ["a script", "lib/app.js"],
    ["an image", "img/logo.png"],
    [".htm", "legacy.htm"],
    ["a directory name", "account"],
    ["a dot file", ".a.html"],
    ["a file in a dot folder", ".cache/a.html"],
    ["a dot folder deeper down", "sub/.hidden/a.html"],
    ["an empty name", ""],
  ])("%s bumps the served revision", (_name, name) => {
    expect(classify([name]).bumpServed).toBe(true);
  });

  test("canvas names still get row revisions when another name bumps", () => {
    expect(classify(["a.html", "theme.css"])).toEqual(bump(".doan/canvases/a.html"));
    expect(classify([".cache/x.html", "b.html"])).toEqual(bump(".doan/canvases/b.html"));
  });

  describe("temporary siblings of a saved canvas", () => {
    test.each([
      ["Claude Code Write/Edit", "a.html.tmp.48213.1f9c0a2b3d4e5f60"],
      ["a Node atomic write with a leading dot", ".a.html.tmp-48213"],
      ["a plain .tmp", "a.html.tmp"],
    ])("%s is left out when the canvas is in the same set", (_name, temp) => {
      expect(classify([temp, "a.html"])).toEqual(quiet(".doan/canvases/a.html"));
    });

    test("works in a subfolder", () => {
      expect(classify(["sub/b.html.tmp.1.ab", "sub/b.html"])).toEqual(quiet(".doan/canvases/sub/b.html"));
      expect(classify(["sub/.b.html.tmp-1", "sub/b.html"])).toEqual(quiet(".doan/canvases/sub/b.html"));
    });

    test("matches an upper-case canvas name without case", () => {
      expect(classify(["a.HTML.tmp.1.ab", "a.HTML"])).toEqual(quiet(".doan/canvases/a.HTML"));
      expect(classify(["A.HTML.TMP", "a.html"])).toEqual(quiet(".doan/canvases/a.html"));
    });

    test("needs the canvas in the same folder", () => {
      expect(classify(["other/a.html.tmp.1.ab", "a.html"])).toEqual(bump(".doan/canvases/a.html"));
      expect(classify(["a.html.tmp.1.ab", "other/a.html"])).toEqual(bump(".doan/canvases/other/a.html"));
    });

    test("bumps when the temporary name comes alone", () => {
      expect(classify(["a.html.tmp.48213.1f9c0a2b3d4e5f60"])).toEqual(bump());
      expect(classify([".a.html.tmp-48213"])).toEqual(bump());
    });

    test("needs the canvas basename followed by .tmp", () => {
      expect(classify(["ba.html.tmp.1", "a.html"]).bumpServed).toBe(true);
      expect(classify(["a.html.bak", "a.html"]).bumpServed).toBe(true);
      expect(classify(["..a.html.tmp", "a.html"]).bumpServed).toBe(true);
    });

    test("never pairs with a name that is not a canvas", () => {
      expect(classify([".a.html.tmp-1", ".a.html"]).bumpServed).toBe(true);
      expect(classify(["a.htm.tmp.1", "a.htm"]).bumpServed).toBe(true);
    });

    test("another non-canvas name in the set still bumps", () => {
      expect(classify(["a.html.tmp.1.ab", "a.html", "theme.css"])).toEqual(bump(".doan/canvases/a.html"));
    });
  });

  describe("repo-relative paths from both canvas directories", () => {
    test(".doan/ds/ canvases bump only their rows", () => {
      expect(classifyDesignChange([".doan/ds/button.html", ".doan/ds/forms/input.HTML"])).toEqual(quiet(".doan/ds/button.html", ".doan/ds/forms/input.HTML"));
    });

    test("the same file name in the two directories is two rows", () => {
      expect(classifyDesignChange([".doan/canvases/a.html", ".doan/ds/a.html"])).toEqual(quiet(".doan/canvases/a.html", ".doan/ds/a.html"));
    });

    test.each([
      ["a .doan/ds/ stylesheet", ".doan/ds/tokens.css"],
      ["a .doan/ds/ dot file", ".doan/ds/.a.html"],
      ["the .doan/ds directory itself", ".doan/ds"],
      ["a look-alike directory", ".doan/dsx/a.html"],
    ])("%s bumps the served revision", (_label, path) => {
      expect(classifyDesignChange([path])).toEqual(bump());
    });

    test("a temporary sibling pairs only with the canvas in its own directory", () => {
      expect(classifyDesignChange([".doan/ds/a.html.tmp.1.ab", ".doan/ds/a.html"])).toEqual(quiet(".doan/ds/a.html"));
      expect(classifyDesignChange([".doan/ds/a.html.tmp.1.ab", ".doan/canvases/a.html"])).toEqual(bump(".doan/canvases/a.html"));
    });
  });
});
