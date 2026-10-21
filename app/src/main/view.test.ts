import { describe, expect, test } from "vitest";
import { parseServePath } from "./serve/path";
import { canvasRows, folderEntry, openDecision, servingUrl } from "./view";

const base = "http://127.0.0.1:4000/t/tok/key/";

describe("canvasRows", () => {
  test("keeps path, title and open comment count", () => {
    const rows = canvasRows(
      [{ path: "design/a.html", id: "a", title: "Login", width: 1280, frames: [], comments: { open: 2, resolved: 1 } }],
      base,
    );
    expect(rows).toEqual([{ path: "design/a.html", title: "Login", open: 2, url: `${base}design/a.html` }]);
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
  test("a listed repo is stored by its root, even when a subfolder was picked", () => {
    expect(openDecision({ kind: "list", root: "/repo", scope: [], canvases: [] }, "/repo/design/sub", false)).toEqual({ store: "/repo" });
  });

  test("a folder outside any repo is stored as picked", () => {
    expect(openDecision({ kind: "uninitialized" }, "/plain", false)).toEqual({ store: "/plain" });
  });

  test("a failing repo root (it has .doan) is stored so its error shows in the list", () => {
    expect(openDecision({ kind: "error", message: "bad config" }, "/broken", true)).toEqual({ store: "/broken" });
    expect(openDecision({ kind: "cliError", reason: "spawn doan ENOENT" }, "/repo", true)).toEqual({ store: "/repo" });
  });

  // Without a root the picked folder may be a subfolder; stored as is, it would
  // read as "not initialized" and invite a nested `doan init`.
  test("a failure picked without .doan is refused with the reason", () => {
    expect(openDecision({ kind: "error", message: "bad config" }, "/broken/design", false)).toEqual({ refuse: "bad config" });
    expect(openDecision({ kind: "cliError", reason: "spawn doan ENOENT" }, "/repo/design", false))
      .toEqual({ refuse: "doan CLI 오류: spawn doan ENOENT" });
    expect(openDecision({ kind: "cliError", reason: "" }, "/repo/design", false)).toEqual({ refuse: "doan CLI 오류" });
  });
});
