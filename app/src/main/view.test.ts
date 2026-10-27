import { describe, expect, test } from "vitest";
import { parseServePath } from "./serve/path";
import type { FolderState } from "./folderState";
import { canvasRows, folderEntry, openDecision, servingUrl } from "./view";

const base = "http://127.0.0.1:4000/t/tok/key/";

describe("canvasRows", () => {
  test("keeps path, title and open comment count", () => {
    const rows = canvasRows(
      [{ path: "doan/a.html", id: "a", title: "Login", width: 1280, frames: [], comments: { open: 2, resolved: 1 } }],
      base,
    );
    expect(rows).toEqual([{ path: "doan/a.html", id: "a", title: "Login", width: 1280, frames: [], open: 2, resolved: 1, url: `${base}doan/a.html` }]);
  });

  test("omits absent and non-string ids", () => {
    const rows = canvasRows([{}, { id: 3 }, { id: null }].map((extra) => ({ path: "doan/a.html", ...extra })), base);
    for (const row of rows) expect(row).not.toHaveProperty("id");
  });

  test("defaults malformed resolved counts to zero", () => {
    const invalid = [undefined, -1, 1.5, "3", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1];
    expect(canvasRows(invalid.map((resolved) => ({ path: "doan/a.html", comments: { resolved } })), base).map((row) => row.resolved)).toEqual(invalid.map(() => 0));
    expect(canvasRows([{ path: "doan/a.html", comments: { resolved: Number.MAX_SAFE_INTEGER } }], base)[0]?.resolved).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("omits a width that is not a positive safe integer", () => {
    const widths = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "1280", null, undefined, {}];
    const rows = canvasRows(widths.map((width) => ({ path: "doan/a.html", width })), base);
    expect(rows).toHaveLength(widths.length);
    for (const row of rows) expect(row).not.toHaveProperty("width");
  });

  test("keeps the largest safe integer width and the smallest positive one", () => {
    const rows = canvasRows(
      [
        { path: "doan/a.html", width: 1 },
        { path: "doan/b.html", width: Number.MAX_SAFE_INTEGER },
      ],
      base,
    );
    expect(rows.map((row) => row.width)).toEqual([1, Number.MAX_SAFE_INTEGER]);
  });

  test("omits a missing title", () => {
    const rows = canvasRows([{ path: "doan/b.html", frames: [], comments: { open: 0, resolved: 0 } }], base);
    expect(rows).toEqual([{ path: "doan/b.html", frames: [], open: 0, resolved: 0, url: `${base}doan/b.html` }]);
    expect(rows[0]).not.toHaveProperty("title");
  });

  test("passes static frames in document order, empty and duplicate ids included", () => {
    const frames = [{ id: "hero", title: "Hero", implements: "x" }, { id: "" }, { id: "hero" }];
    const rows = canvasRows([{ path: "doan/a.html", frames }], base);
    expect(rows[0]?.frames).toEqual([{ id: "hero", title: "Hero" }, { id: "" }, { id: "hero" }]);
    expect(rows[0]).not.toHaveProperty("framesTruncated");
  });

  test("caps static frames at 1,000 and marks the cut", () => {
    const frames = Array.from({ length: 1001 }, (_, index) => ({ id: `f${index}` }));
    const row = canvasRows([{ path: "doan/a.html", frames }], base)[0];
    expect(row?.frames).toHaveLength(1000);
    expect(row?.frames?.at(-1)).toEqual({ id: "f999" });
    expect(row?.framesTruncated).toBe(true);
    const exact = canvasRows([{ path: "doan/a.html", frames: frames.slice(0, 1000) }], base)[0];
    expect(exact?.frames).toHaveLength(1000);
    expect(exact).not.toHaveProperty("framesTruncated");
  });

  test("clips long static frame ids and titles like the rendered list", () => {
    const long = "x".repeat(250);
    expect(canvasRows([{ path: "doan/a.html", frames: [{ id: long, title: long }] }], base)[0]?.frames).toEqual([{ id: "x".repeat(200), title: "x".repeat(200) }]);
  });

  test("drops malformed frame entries and a frames value that is not a list", () => {
    const rows = canvasRows([
      { path: "doan/a.html", frames: [null, 3, {}, { id: 4 }, { id: "ok", title: 5 }] },
      { path: "doan/b.html", frames: "hero" },
      { path: "doan/c.html" },
    ], base);
    expect(rows[0]?.frames).toEqual([{ id: "ok" }]);
    expect(rows[1]).not.toHaveProperty("frames");
    expect(rows[2]).not.toHaveProperty("frames");
  });

  test("keeps the CLI order", () => {
    const rows = canvasRows([{ path: "doan/foo.html" }, { path: "doan/foo-bar.html" }, { path: "doan/a.html" }], base);
    expect(rows.map((row) => row.path)).toEqual(["doan/foo.html", "doan/foo-bar.html", "doan/a.html"]);
  });

  test("drops elements without a usable path", () => {
    const rows = canvasRows([null, "doan/x.html", 3, [], {}, { path: 7 }, { path: "" }, { path: "doan/ok.html" }], base);
    expect(rows.map((row) => row.path)).toEqual(["doan/ok.html"]);
  });

  test("treats a malformed comment count as zero", () => {
    const rows = canvasRows(
      [
        { path: "doan/a.html", comments: { open: -1 } },
        { path: "doan/b.html", comments: { open: 1.5 } },
        { path: "doan/c.html", comments: { open: "3" } },
        { path: "doan/d.html", comments: null },
        { path: "doan/e.html", comments: { open: Number.POSITIVE_INFINITY } },
      ],
      base,
    );
    expect(rows.map((row) => row.open)).toEqual([0, 0, 0, 0, 0]);
  });

  test("ignores a title that is not a string", () => {
    const rows = canvasRows([{ path: "doan/a.html", title: 5 }], base);
    expect(rows[0]).not.toHaveProperty("title");
  });

  // project-feedback design §1: a row ls could not read stays in the tree
  // with its error; its counts are 0 only because ls sent none.
  test("keeps unreadable rows with their error and comments error", () => {
    const rows = canvasRows([
      { path: "doan/a.html", id: "a", frames: [], commentsError: { code: "unreadable_comments", message: ".doan/comments/a.jsonl: permission denied" } },
      { path: "doan/b.html", frames: [], error: { code: "unreadable_canvas", message: "doan/b.html: permission denied" } },
    ], base);
    expect(rows).toEqual([
      { path: "doan/a.html", id: "a", frames: [], commentsError: { code: "unreadable_comments", message: ".doan/comments/a.jsonl: permission denied" }, open: 0, resolved: 0, url: `${base}doan/a.html` },
      { path: "doan/b.html", frames: [], error: { code: "unreadable_canvas", message: "doan/b.html: permission denied" }, open: 0, resolved: 0, url: `${base}doan/b.html` },
    ]);
  });

  test("drops a malformed row error", () => {
    const bad = [null, "boom", { code: 1, message: "m" }, { code: "c" }, { message: "m" }];
    const rows = canvasRows(bad.flatMap((value) => [{ path: "doan/a.html", error: value }, { path: "doan/a.html", commentsError: value }]), base);
    expect(rows).toHaveLength(bad.length * 2);
    for (const row of rows) {
      expect(row).not.toHaveProperty("error");
      expect(row).not.toHaveProperty("commentsError");
    }
  });
});

describe("servingUrl", () => {
  test("joins the base and a plain path", () => {
    expect(servingUrl(base, "doan/a.html")).toBe(`${base}doan/a.html`);
  });

  test("encodes each segment so the server decodes it back", () => {
    const rel = "doan/한글 #1?.html";
    const url = servingUrl(base, rel);
    expect(url).toBe(`${base}doan/${encodeURIComponent("한글 #1?.html")}`);
    expect(parseServePath(new URL(url).pathname, "tok")).toEqual({ folderKey: "key", rel });
  });

  test("keeps a percent sign literal", () => {
    expect(servingUrl(base, "doan/100%.html")).toBe(`${base}doan/100%25.html`);
  });
});

describe("folderEntry", () => {
  test("narrows a list into rows and carries the served revision", () => {
    const entry = folderEntry("/repo", { kind: "list", root: "/repo", scope: ["doan"], canvases: [{ path: "doan/a.html" }] }, base, 3);
    expect(entry).toEqual({ path: "/repo", kind: "list", servedRev: 3, canvases: [{ path: "doan/a.html", open: 0, resolved: 0, url: `${base}doan/a.html` }] });
  });

  test("passes git through and adds file mtimes with the newest as changedAt", () => {
    const git = { common: "/repo/.git", main: "/repo", branch: "main", worktrees: ["/repo"] };
    const view = { kind: "list" as const, root: "/repo", scope: ["doan"], canvases: [{ path: "doan/a.html" }, { path: "doan/b.html" }, { path: "doan/gone.html" }], git };
    const mtimes = new Map([["doan/a.html", 100], ["doan/b.html", 300]]);
    const entry = folderEntry("/repo", view, base, 0, mtimes);
    expect(entry).toMatchObject({ kind: "list", git, changedAt: 300 });
    if (entry.kind !== "list") throw new Error("not a list");
    expect(entry.canvases.map((row) => row.mtimeMs)).toEqual([100, 300, undefined]);
    // A canvas deleted between `doan ls` and the stat has no key at all.
    expect(entry.canvases[2]).not.toHaveProperty("mtimeMs");
  });

  test("leaves changedAt out without canvases or mtimes", () => {
    const empty = folderEntry("/repo", { kind: "list", root: "/repo", scope: [], canvases: [] }, base, 0, new Map());
    expect(empty).not.toHaveProperty("changedAt");
    expect(empty).not.toHaveProperty("git");
    const unread = folderEntry("/repo", { kind: "list", root: "/repo", scope: [], canvases: [{ path: "doan/a.html" }] }, base, 0);
    expect(unread).not.toHaveProperty("changedAt");
  });

  test("passes orphans through, and leaves them out when ls sent none", () => {
    const orphans = [{ id: "old", file: ".doan/comments/old.jsonl", comments: { open: 1, resolved: 0 }, uncertain: false }];
    const entry = folderEntry("/repo", { kind: "list", root: "/repo", scope: [], canvases: [], orphans }, base, 0);
    expect(entry).toEqual({ path: "/repo", kind: "list", servedRev: 0, canvases: [], orphans });
    expect(folderEntry("/repo", { kind: "list", root: "/repo", scope: [], canvases: [] }, base, 0)).not.toHaveProperty("orphans");
  });

  // Only a list is served, so only a list has a revision to reload on.
  test("passes the other states through without a served revision", () => {
    expect(folderEntry("/r", { kind: "uninitialized" }, base, 3)).toEqual({ path: "/r", kind: "uninitialized" });
    expect(folderEntry("/r", { kind: "error", message: "bad config" }, base, 3)).toEqual({ path: "/r", kind: "error", message: "bad config" });
    expect(folderEntry("/r", { kind: "cliError", reason: "spawn doan ENOENT" }, base, 3))
      .toEqual({ path: "/r", kind: "cliError", reason: "spawn doan ENOENT" });
    expect(folderEntry("/r", { kind: "notFound" }, base, 3)).toEqual({ path: "/r", kind: "notFound" });
  });
});

describe("openDecision", () => {
  const listed: FolderState = { kind: "list", root: "/broken", scope: [], canvases: [] };
  const broken: FolderState = { kind: "error", message: "bad config" };
  const noRepo: FolderState = { kind: "uninitialized" };
  const noCli: FolderState = { kind: "cliError", reason: "spawn doan ENOENT" };

  test("a listed repo is stored by its root, even when a subfolder was picked", () => {
    expect(openDecision({ kind: "list", root: "/repo", scope: [], canvases: [] }, "/repo/doan/sub", null)).toEqual({ store: "/repo" });
  });

  test("a folder outside any repo is stored as picked", () => {
    expect(openDecision(noRepo, "/plain", null)).toEqual({ store: "/plain" });
  });

  // The second run is `doan ls --repo <picked>`: Go, not TS, says whether the
  // picked folder is itself a repo root.
  test("a failing pick is stored when the CLI reads it as a repo root", () => {
    expect(openDecision(broken, "/broken", broken)).toEqual({ store: "/broken" });
    expect(openDecision(broken, "/broken", listed)).toEqual({ store: "/broken" });
    expect(openDecision(noCli, "/repo", broken)).toEqual({ store: "/repo" });
  });

  // Without a root the picked folder may be a subfolder; stored as is, it would
  // read as "not initialized" and invite a nested `doan init`.
  test("a failing pick that is not a repo root is refused with the first run's reason", () => {
    expect(openDecision(broken, "/broken/doan", noRepo)).toEqual({ refuse: "bad config" });
    expect(openDecision(noCli, "/repo/doan", noRepo)).toEqual({ refuse: "doan CLI error: spawn doan ENOENT" });
    expect(openDecision({ kind: "cliError", reason: "" }, "/repo/doan", noRepo)).toEqual({ refuse: "doan CLI error" });
  });

  test("a failing pick is refused when the CLI cannot say whether it is a root", () => {
    expect(openDecision(broken, "/broken/doan", noCli)).toEqual({ refuse: "bad config" });
    expect(openDecision(noCli, "/repo", noCli)).toEqual({ refuse: "doan CLI error: spawn doan ENOENT" });
  });

  test("a failing pick without a second run is refused", () => {
    expect(openDecision(broken, "/broken", null)).toEqual({ refuse: "bad config" });
  });
});
