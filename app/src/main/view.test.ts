import { describe, expect, test } from "vitest";
import { parseServePath } from "./serve/path";
import type { FolderState } from "./folderState";
import { canvasRows, folderEntry, openDecision, servingUrl } from "./view";

const base = "http://127.0.0.1:4000/t/tok/key/";

describe("canvasRows", () => {
  test("keeps path, title and open comment count", () => {
    const rows = canvasRows(
      [{ path: "design/a.html", id: "a", title: "Login", width: 1280, frames: [], comments: { open: 2, resolved: 1 } }],
      base,
    );
    expect(rows).toEqual([{ path: "design/a.html", id: "a", title: "Login", width: 1280, open: 2, resolved: 1, url: `${base}design/a.html` }]);
  });

  test("omits absent and non-string ids", () => {
    const rows = canvasRows([{}, { id: 3 }, { id: null }].map((extra) => ({ path: "design/a.html", ...extra })), base);
    for (const row of rows) expect(row).not.toHaveProperty("id");
  });

  test("defaults malformed resolved counts to zero", () => {
    const invalid = [undefined, -1, 1.5, "3", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1];
    expect(canvasRows(invalid.map((resolved) => ({ path: "design/a.html", comments: { resolved } })), base).map((row) => row.resolved)).toEqual(invalid.map(() => 0));
    expect(canvasRows([{ path: "design/a.html", comments: { resolved: Number.MAX_SAFE_INTEGER } }], base)[0]?.resolved).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("omits a width that is not a positive safe integer", () => {
    const widths = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "1280", null, undefined, {}];
    const rows = canvasRows(widths.map((width) => ({ path: "design/a.html", width })), base);
    expect(rows).toHaveLength(widths.length);
    for (const row of rows) expect(row).not.toHaveProperty("width");
  });

  test("keeps the largest safe integer width and the smallest positive one", () => {
    const rows = canvasRows(
      [
        { path: "design/a.html", width: 1 },
        { path: "design/b.html", width: Number.MAX_SAFE_INTEGER },
      ],
      base,
    );
    expect(rows.map((row) => row.width)).toEqual([1, Number.MAX_SAFE_INTEGER]);
  });

  test("omits a missing title", () => {
    const rows = canvasRows([{ path: "design/b.html", frames: [], comments: { open: 0, resolved: 0 } }], base);
    expect(rows).toEqual([{ path: "design/b.html", open: 0, resolved: 0, url: `${base}design/b.html` }]);
    expect(rows[0]).not.toHaveProperty("title");
  });

  test("keeps the CLI order", () => {
    const rows = canvasRows([{ path: "design/foo.html" }, { path: "design/foo-bar.html" }, { path: "design/a.html" }], base);
    expect(rows.map((row) => row.path)).toEqual(["design/foo.html", "design/foo-bar.html", "design/a.html"]);
  });

  test("drops elements without a usable path", () => {
    const rows = canvasRows([null, "design/x.html", 3, [], {}, { path: 7 }, { path: "" }, { path: "design/ok.html" }], base);
    expect(rows.map((row) => row.path)).toEqual(["design/ok.html"]);
  });

  test("treats a malformed comment count as zero", () => {
    const rows = canvasRows(
      [
        { path: "design/a.html", comments: { open: -1 } },
        { path: "design/b.html", comments: { open: 1.5 } },
        { path: "design/c.html", comments: { open: "3" } },
        { path: "design/d.html", comments: null },
        { path: "design/e.html", comments: { open: Number.POSITIVE_INFINITY } },
      ],
      base,
    );
    expect(rows.map((row) => row.open)).toEqual([0, 0, 0, 0, 0]);
  });

  test("ignores a title that is not a string", () => {
    const rows = canvasRows([{ path: "design/a.html", title: 5 }], base);
    expect(rows[0]).not.toHaveProperty("title");
  });
});

describe("servingUrl", () => {
  test("joins the base and a plain path", () => {
    expect(servingUrl(base, "design/a.html")).toBe(`${base}design/a.html`);
  });

  test("encodes each segment so the server decodes it back", () => {
    const rel = "design/한글 #1?.html";
    const url = servingUrl(base, rel);
    expect(url).toBe(`${base}design/${encodeURIComponent("한글 #1?.html")}`);
    expect(parseServePath(new URL(url).pathname, "tok")).toEqual({ folderKey: "key", rel });
  });

  test("keeps a percent sign literal", () => {
    expect(servingUrl(base, "design/100%.html")).toBe(`${base}design/100%25.html`);
  });
});

describe("folderEntry", () => {
  test("narrows a list into rows and carries the served revision", () => {
    const entry = folderEntry("/repo", { kind: "list", root: "/repo", scope: ["design"], canvases: [{ path: "design/a.html" }] }, base, 3);
    expect(entry).toEqual({ path: "/repo", kind: "list", servedRev: 3, canvases: [{ path: "design/a.html", open: 0, resolved: 0, url: `${base}design/a.html` }] });
  });

  test("passes git through and adds file mtimes with the newest as changedAt", () => {
    const git = { common: "/repo/.git", main: "/repo", branch: "main", worktrees: ["/repo"] };
    const view = { kind: "list" as const, root: "/repo", scope: ["design"], canvases: [{ path: "design/a.html" }, { path: "design/b.html" }, { path: "design/gone.html" }], git };
    const mtimes = new Map([["design/a.html", 100], ["design/b.html", 300]]);
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
    const unread = folderEntry("/repo", { kind: "list", root: "/repo", scope: [], canvases: [{ path: "design/a.html" }] }, base, 0);
    expect(unread).not.toHaveProperty("changedAt");
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
    expect(openDecision({ kind: "list", root: "/repo", scope: [], canvases: [] }, "/repo/design/sub", null)).toEqual({ store: "/repo" });
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
    expect(openDecision(broken, "/broken/design", noRepo)).toEqual({ refuse: "bad config" });
    expect(openDecision(noCli, "/repo/design", noRepo)).toEqual({ refuse: "doan CLI error: spawn doan ENOENT" });
    expect(openDecision({ kind: "cliError", reason: "" }, "/repo/design", noRepo)).toEqual({ refuse: "doan CLI error" });
  });

  test("a failing pick is refused when the CLI cannot say whether it is a root", () => {
    expect(openDecision(broken, "/broken/design", noCli)).toEqual({ refuse: "bad config" });
    expect(openDecision(noCli, "/repo", noCli)).toEqual({ refuse: "doan CLI error: spawn doan ENOENT" });
  });

  test("a failing pick without a second run is refused", () => {
    expect(openDecision(broken, "/broken", null)).toEqual({ refuse: "bad config" });
  });
});
