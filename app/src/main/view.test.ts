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
    expect(rows).toEqual([{ path: "design/a.html", title: "Login", width: 1280, open: 2, url: `${base}design/a.html` }]);
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
    expect(rows).toEqual([{ path: "design/b.html", open: 0, url: `${base}design/b.html` }]);
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
  test("narrows a list into rows", () => {
    const entry = folderEntry("/repo", { kind: "list", root: "/repo", scope: ["design"], canvases: [{ path: "design/a.html" }] }, base);
    expect(entry).toEqual({ path: "/repo", kind: "list", canvases: [{ path: "design/a.html", open: 0, url: `${base}design/a.html` }] });
  });

  test("passes the other states through", () => {
    expect(folderEntry("/r", { kind: "uninitialized" }, base)).toEqual({ path: "/r", kind: "uninitialized" });
    expect(folderEntry("/r", { kind: "error", message: "bad config" }, base)).toEqual({ path: "/r", kind: "error", message: "bad config" });
    expect(folderEntry("/r", { kind: "cliError", reason: "spawn doan ENOENT" }, base))
      .toEqual({ path: "/r", kind: "cliError", reason: "spawn doan ENOENT" });
    expect(folderEntry("/r", { kind: "notFound" }, base)).toEqual({ path: "/r", kind: "notFound" });
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
    expect(openDecision(noCli, "/repo/design", noRepo)).toEqual({ refuse: "doan CLI 오류: spawn doan ENOENT" });
    expect(openDecision({ kind: "cliError", reason: "" }, "/repo/design", noRepo)).toEqual({ refuse: "doan CLI 오류" });
  });

  test("a failing pick is refused when the CLI cannot say whether it is a root", () => {
    expect(openDecision(broken, "/broken/design", noCli)).toEqual({ refuse: "bad config" });
    expect(openDecision(noCli, "/repo", noCli)).toEqual({ refuse: "doan CLI 오류: spawn doan ENOENT" });
  });

  test("a failing pick without a second run is refused", () => {
    expect(openDecision(broken, "/broken", null)).toEqual({ refuse: "bad config" });
  });
});
