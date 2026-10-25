import { describe, expect, test } from "vitest";
import { classifyDesignChange } from "./designChange";

const quiet = (...revPaths: string[]) => ({ bumpServed: false, revPaths });
const bump = (...revPaths: string[]) => ({ bumpServed: true, revPaths });

describe("classifyDesignChange", () => {
  test("an unknown name set bumps with no row revisions", () => {
    expect(classifyDesignChange(null)).toEqual(bump());
  });

  test("an empty name set changes nothing", () => {
    expect(classifyDesignChange([])).toEqual(quiet());
  });

  test("canvas names only bump their rows, prefixed with design/", () => {
    expect(classifyDesignChange(["a.html"])).toEqual(quiet("design/a.html"));
    expect(classifyDesignChange(["account/profile.html", "deep/er/x.html"])).toEqual(quiet("design/account/profile.html", "design/deep/er/x.html"));
  });

  test("the extension is matched without case", () => {
    expect(classifyDesignChange(["A.HTML", "b.Html"])).toEqual(quiet("design/A.HTML", "design/b.Html"));
  });

  test("a name listed twice counts once", () => {
    expect(classifyDesignChange(["a.html", "a.html"])).toEqual(quiet("design/a.html"));
  });

  // A rename arrives as both names; creation and deletion as one each.
  test("create, delete and rename pairs stay row-only", () => {
    expect(classifyDesignChange(["old.html", "sub/new.html"])).toEqual(quiet("design/old.html", "design/sub/new.html"));
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
    expect(classifyDesignChange([name]).bumpServed).toBe(true);
  });

  test("canvas names still get row revisions when another name bumps", () => {
    expect(classifyDesignChange(["a.html", "theme.css"])).toEqual(bump("design/a.html"));
    expect(classifyDesignChange([".cache/x.html", "b.html"])).toEqual(bump("design/b.html"));
  });

  describe("temporary siblings of a saved canvas", () => {
    test.each([
      ["Claude Code Write/Edit", "a.html.tmp.48213.1f9c0a2b3d4e5f60"],
      ["a Node atomic write with a leading dot", ".a.html.tmp-48213"],
      ["a plain .tmp", "a.html.tmp"],
    ])("%s is left out when the canvas is in the same set", (_name, temp) => {
      expect(classifyDesignChange([temp, "a.html"])).toEqual(quiet("design/a.html"));
    });

    test("works in a subfolder", () => {
      expect(classifyDesignChange(["sub/b.html.tmp.1.ab", "sub/b.html"])).toEqual(quiet("design/sub/b.html"));
      expect(classifyDesignChange(["sub/.b.html.tmp-1", "sub/b.html"])).toEqual(quiet("design/sub/b.html"));
    });

    test("matches an upper-case canvas name without case", () => {
      expect(classifyDesignChange(["a.HTML.tmp.1.ab", "a.HTML"])).toEqual(quiet("design/a.HTML"));
      expect(classifyDesignChange(["A.HTML.TMP", "a.html"])).toEqual(quiet("design/a.html"));
    });

    test("needs the canvas in the same folder", () => {
      expect(classifyDesignChange(["other/a.html.tmp.1.ab", "a.html"])).toEqual(bump("design/a.html"));
      expect(classifyDesignChange(["a.html.tmp.1.ab", "other/a.html"])).toEqual(bump("design/other/a.html"));
    });

    test("bumps when the temporary name comes alone", () => {
      expect(classifyDesignChange(["a.html.tmp.48213.1f9c0a2b3d4e5f60"])).toEqual(bump());
      expect(classifyDesignChange([".a.html.tmp-48213"])).toEqual(bump());
    });

    test("needs the canvas basename followed by .tmp", () => {
      expect(classifyDesignChange(["ba.html.tmp.1", "a.html"]).bumpServed).toBe(true);
      expect(classifyDesignChange(["a.html.bak", "a.html"]).bumpServed).toBe(true);
      expect(classifyDesignChange(["..a.html.tmp", "a.html"]).bumpServed).toBe(true);
    });

    test("never pairs with a name that is not a canvas", () => {
      expect(classifyDesignChange([".a.html.tmp-1", ".a.html"]).bumpServed).toBe(true);
      expect(classifyDesignChange(["a.htm.tmp.1", "a.htm"]).bumpServed).toBe(true);
    });

    test("another non-canvas name in the set still bumps", () => {
      expect(classifyDesignChange(["a.html.tmp.1.ab", "a.html", "theme.css"])).toEqual(bump("design/a.html"));
    });
  });
});
