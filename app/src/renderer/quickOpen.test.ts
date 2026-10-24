import { describe, expect, it } from "vitest";
import { pickTarget, searchIndex, searchMatch, type SearchCanvas, type SearchFolder } from "./quickOpen";

function canvas(path: string, extra: Partial<SearchCanvas> = {}): SearchCanvas {
  return { path, open: 0, resolved: 0, url: `http://localhost/${path}`, ...extra };
}

function folder(path: string, canvases: SearchCanvas[], common?: string): SearchFolder {
  return { path, kind: "list", canvases, servedRev: 0,
    ...(common === undefined ? {} : { git: { common, worktrees: [] } }) };
}

const commonOf = (root: string) => root === "/other" ? "/other/.git" : "/repo/.git";

describe("quick open index", () => {
  it("indexes canvas names, filenames, paths and ids and frame titles and ids", () => {
    const index = searchIndex([folder("/repo", [canvas("design/settings/billing.html", {
      title: "  Billing & plans  ", id: "payments", frames: [{ id: "card-declined", title: "Payment failed" }],
    })])]);
    expect(index.map((entry) => entry.label)).toEqual(["Billing & plans", "Payment failed"]);
    for (const query of ["Billing & plans", "billing.html", "settings/billing", "payments"]) {
      expect(searchMatch(index, query, null, commonOf)[0]?.kind).toBe("canvas");
    }
    for (const query of ["card-declined", "Payment failed"]) {
      expect(searchMatch(index, query, null, commonOf)[0]).toMatchObject({ kind: "frame", frameId: "card-declined", frameIndex: 0 });
    }
  });

  it("falls back from absent or blank titles to filenames without html", () => {
    const index = searchIndex([folder("/repo", [canvas("design/foo.html"), canvas("design/foo-bar.html", { title: " \t " })])]);
    expect(index.map((entry) => entry.label)).toEqual(["foo", "foo-bar"]);
  });

  it("replaces static frames only for the exact open root and canvas, including an empty rendered list", () => {
    const rows = [canvas("design/a.html", { frames: [{ id: "static" }] }), canvas("design/b.html", { frames: [{ id: "closed" }] })];
    const entries = [folder("/repo", rows), folder("/other", rows)];
    const rendered = { root: "/repo", path: "design/a.html", frames: [{ id: "live", title: "Live frame" }] };
    const index = searchIndex(entries, rendered);
    expect(index.filter((entry) => entry.kind === "frame").map((entry) => entry.label)).toEqual(["Live frame", "closed", "static", "closed"]);
    expect(searchIndex(entries, { ...rendered, frames: [] }).filter((entry) => entry.kind === "frame").map((entry) => entry.label)).toEqual(["closed", "static", "closed"]);
  });

  it("excludes loading and every problem state", () => {
    const entries: SearchFolder[] = [
      { path: "/loading", kind: "loading" }, { path: "/missing", kind: "notFound" },
      { path: "/empty", kind: "uninitialized" }, { path: "/error", kind: "error", message: "bad" },
      { path: "/cli", kind: "cliError", reason: "bad" }, folder("/repo", [canvas("design/a.html")]),
    ];
    expect(searchIndex(entries).map((entry) => entry.root)).toEqual(["/repo"]);
  });

  it("caps frame lists at 1000 while preserving document indexes and duplicate or empty ids", () => {
    const frames = Array.from({ length: 1001 }, (_, index) => ({ id: index < 2 ? "" : "duplicate" }));
    const entries = [folder("/repo", [canvas("design/a.html", { frames })])];
    for (const index of [searchIndex(entries), searchIndex(entries, { root: "/repo", path: "design/a.html", frames })]) {
      expect(index).toHaveLength(1001);
      expect(index[1]).toMatchObject({ frameId: "", frameIndex: 0 });
      expect(index[1000]).toMatchObject({ frameId: "duplicate", frameIndex: 999 });
    }
  });
});

describe("quick open matching", () => {
  it("matches case-insensitive whitespace tokens with AND across fields", () => {
    const index = searchIndex([folder("/repo", [canvas("design/settings/card.html", { title: "Billing plans", id: "billing-v2" })])]);
    expect(searchMatch(index, "  BILLING\tsettings\nV2 ", null, commonOf)).toHaveLength(1);
    expect(searchMatch(index, "billing missing", null, commonOf)).toEqual([]);
  });

  it("ranks prefix above word-start above substring before root proximity", () => {
    const index = searchIndex([
      folder("/repo", [canvas("design/a.html", { title: "Discard" })]),
      folder("/sibling", [canvas("design/b.html", { title: "Payment card" })]),
      folder("/other", [canvas("design/c.html", { title: "Card payment" })]),
    ]);
    expect(searchMatch(index, "card", "/repo", commonOf).map((entry) => entry.root)).toEqual(["/other", "/sibling", "/repo"]);
  });

  it("recognizes punctuation and Unicode word boundaries and later stronger matches", () => {
    const index = searchIndex([folder("/repo", [
      canvas("design/a.html", { title: "Discard/card" }), canvas("design/b.html", { title: "Discard" }),
      canvas("design/c.html", { title: "결제실패" }), canvas("design/d.html", { title: "결제 실패" }),
    ])]);
    expect(searchMatch(index, "card", null, commonOf).map((entry) => entry.path)).toEqual(["design/a.html", "design/b.html"]);
    expect(searchMatch(index, "실패", null, commonOf).map((entry) => entry.path)).toEqual(["design/d.html", "design/c.html"]);
  });

  it("breaks ties by current root, common repo, then other roots with stable saved order", () => {
    const index = searchIndex([folder("/other", [canvas("design/card.html")]), folder("/sibling", [canvas("design/card.html")]), folder("/repo", [canvas("design/card.html")])]);
    expect(searchMatch(index, "card", "/repo", commonOf).map((entry) => entry.root)).toEqual(["/repo", "/sibling", "/other"]);
    expect(searchMatch(index, "card", null, commonOf).map((entry) => entry.root)).toEqual(["/other", "/sibling", "/repo"]);
    expect(searchMatch(index, "card", "/repo", () => undefined).map((entry) => entry.root)).toEqual(["/repo", "/other", "/sibling"]);
  });

  it("shows only canvases in saved order for empty home or workspace queries and limits to 50", () => {
    const index = searchIndex([folder("/other", [canvas("design/z.html")]), folder("/repo", Array.from({ length: 60 }, (_, i) => canvas(`design/card-${i}.html`, { frames: [{ id: "card" }] })))]);
    expect(searchMatch(index, " \n ", null, commonOf)).toHaveLength(50);
    expect(searchMatch(index, "", null, commonOf)[0]?.path).toBe("design/z.html");
    const workspace = searchMatch(index, "", "/repo", commonOf);
    expect(workspace).toHaveLength(50);
    expect(workspace.every((entry) => entry.kind === "canvas" && entry.root === "/repo")).toBe(true);
    expect(workspace[0]?.path).toBe("design/card-0.html");
    expect(searchMatch(index, "card", null, commonOf)).toHaveLength(50);
    expect(searchMatch(index, "", "/missing", commonOf)).toEqual([]);
    expect(searchMatch([], "", null, commonOf)).toEqual([]);
  });

  it("searches 1000 canvases with 50 frames each within 50ms", () => {
    const index = searchIndex([folder("/repo", Array.from({ length: 1000 }, (_, i) => canvas(`design/card-${i}.html`, {
      frames: Array.from({ length: 50 }, (_, j) => ({ id: `card-${j}`, title: `Card payment ${j}` })),
    })))]);
    expect(index).toHaveLength(51000);
    const started = performance.now();
    const results = searchMatch(index, "card", "/repo", commonOf);
    const elapsed = performance.now() - started;
    console.info(`Quick open: 51000 entries searched in ${elapsed.toFixed(2)}ms`);
    expect(results).toHaveLength(50);
    expect(elapsed).toBeLessThanOrEqual(50);
  });
});

describe("quick open target", () => {
  it("switches roots before opening, opens different canvases, and jumps within the open canvas", () => {
    const index = searchIndex([folder("/repo", [canvas("design/a.html", { frames: [{ id: "target" }] })])]);
    for (const result of index) {
      expect(pickTarget(result, "/other", "design/a.html")).toBe("switch");
      expect(pickTarget(result, null, null)).toBe("switch");
      expect(pickTarget(result, "/repo", "design/b.html")).toBe("open");
      expect(pickTarget(result, "/repo", null)).toBe("open");
      expect(pickTarget(result, "/repo", "design/a.html")).toBe("jump");
    }
  });
});
