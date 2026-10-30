import { describe, expect, it } from "vitest";
import type { FolderEntry } from "../main/view";
import { countMatches, emptyText, groupResults, markRuns, matchPositions, outsideDialog, resultKey, resultParts, unavailableCanvasMessage, pickTarget, searchIndex, searchMatch, type SearchCanvas, type SearchFolder, type SearchResult } from "./quickOpen";

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
    const index = searchIndex([folder("/repo", [canvas(".doan/canvases/settings/billing.html", {
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
    const index = searchIndex([folder("/repo", [canvas(".doan/canvases/foo.html"), canvas(".doan/canvases/foo-bar.html", { title: " \t " })])]);
    expect(index.map((entry) => entry.label)).toEqual(["foo", "foo-bar"]);
  });

  it("replaces static frames only for the exact open root and canvas, including an empty rendered list", () => {
    const rows = [canvas(".doan/canvases/a.html", { frames: [{ id: "static" }] }), canvas(".doan/canvases/b.html", { frames: [{ id: "closed" }] })];
    const entries = [folder("/repo", rows), folder("/other", rows)];
    const rendered = { root: "/repo", path: ".doan/canvases/a.html", frames: [{ id: "live", title: "Live frame" }] };
    const index = searchIndex(entries, rendered);
    expect(index.filter((entry) => entry.kind === "frame").map((entry) => entry.label)).toEqual(["Live frame", "closed", "static", "closed"]);
    expect(searchIndex(entries, { ...rendered, frames: [] }).filter((entry) => entry.kind === "frame").map((entry) => entry.label)).toEqual(["closed", "static", "closed"]);
  });

  it("excludes loading and every problem state", () => {
    const entries: SearchFolder[] = [
      { path: "/loading", kind: "loading" }, { path: "/missing", kind: "notFound" },
      { path: "/empty", kind: "uninitialized" }, { path: "/error", kind: "error", message: "bad" },
      { path: "/cli", kind: "cliError", reason: "bad" }, folder("/repo", [canvas(".doan/canvases/a.html")]),
    ];
    expect(searchIndex(entries).map((entry) => entry.root)).toEqual(["/repo"]);
  });

  it("caps frame lists at 1000 while preserving document indexes and duplicate or empty ids", () => {
    const frames = Array.from({ length: 1001 }, (_, index) => ({ id: index < 2 ? "" : "duplicate" }));
    const entries = [folder("/repo", [canvas(".doan/canvases/a.html", { frames })])];
    for (const index of [searchIndex(entries), searchIndex(entries, { root: "/repo", path: ".doan/canvases/a.html", frames })]) {
      expect(index).toHaveLength(1001);
      expect(index[1]).toMatchObject({ frameId: "", frameIndex: 0 });
      expect(index[1000]).toMatchObject({ frameId: "duplicate", frameIndex: 999 });
    }
  });
});

describe("quick open matching", () => {
  it("keeps title and frame prefix matches within the cap without matching the design scope", () => {
    const index = searchIndex([folder("/repo", [
      ...Array.from({ length: 60 }, (_, i) => canvas(`.doan/canvases/screen-${i}.html`, { title: `Screen ${i}` })),
      canvas(".doan/canvases/settings/billing.html", { title: "Declined", frames: [{ id: "declined" }] }),
    ])]);
    const matches = searchMatch(index, "de", "/repo", commonOf);
    expect(matches.map((result) => result.kind)).toEqual(["canvas", "frame"]);
    expect(matches.map((result) => result.label)).toEqual(["Declined", "declined"]);
    expect(searchMatch(index, "doan", "/repo", commonOf)).toEqual([]);
    expect(searchMatch(index, "settings/billing", "/repo", commonOf)[0]?.path).toBe(".doan/canvases/settings/billing.html");
  });

  it("matches NFC and NFD queries against normalized canvas and frame fields without changing targets", () => {
    const path = `.doan/canvases/${"설정/결제".normalize("NFD")}.html`;
    const frameId = "실패".normalize("NFD");
    const index = searchIndex([folder("/repo", [canvas(path, {
      title: "청구".normalize("NFD"), id: "구독".normalize("NFD"),
      frames: [{ id: frameId, title: "거절".normalize("NFD") }],
    })])]);
    for (const query of ["설정/결제", "결제.html", "청구", "구독", "실패", "거절"]) {
      for (const form of ["NFC", "NFD"]) {
        const results = searchMatch(index, query.normalize(form), null, commonOf);
        expect(results).toHaveLength(1);
        expect(results[0]?.path).toBe(path);
        if (results[0]?.kind === "frame") expect(results[0].frameId).toBe(frameId);
      }
    }
    const composed = searchIndex([folder("/repo", [canvas(".doan/canvases/결제.html")])]);
    expect(searchMatch(composed, "결제".normalize("NFD"), null, commonOf)).toHaveLength(1);
  });

  it("omits internal fields from results for both empty and nonempty queries", () => {
    const index = searchIndex([folder("/repo", [canvas(".doan/canvases/card.html", { frames: [{ id: "card" }] })])]);
    for (const query of ["", "card"]) {
      const results = searchMatch(index, query, null, commonOf);
      expect(results.length).toBeGreaterThan(0);
      for (const result of results) expect(result).not.toHaveProperty("fields");
    }
    expect(index.every((entry) => entry.fields.length > 0)).toBe(true);
  });

  it("matches case-insensitive whitespace tokens with AND across fields", () => {
    const index = searchIndex([folder("/repo", [canvas(".doan/canvases/settings/card.html", { title: "Billing plans", id: "billing-v2" })])]);
    expect(searchMatch(index, "  BILLING\tsettings\nV2 ", null, commonOf)).toHaveLength(1);
    expect(searchMatch(index, "billing missing", null, commonOf)).toEqual([]);
  });

  it("ranks prefix above word-start above substring before root proximity", () => {
    const index = searchIndex([
      folder("/repo", [canvas(".doan/canvases/a.html", { title: "Discard" })]),
      folder("/sibling", [canvas(".doan/canvases/b.html", { title: "Payment card" })]),
      folder("/other", [canvas(".doan/canvases/c.html", { title: "Card payment" })]),
    ]);
    expect(searchMatch(index, "card", "/repo", commonOf).map((entry) => entry.root)).toEqual(["/other", "/sibling", "/repo"]);
  });

  it("recognizes punctuation and Unicode word boundaries and later stronger matches", () => {
    const index = searchIndex([folder("/repo", [
      canvas(".doan/canvases/a.html", { title: "Discard/card" }), canvas(".doan/canvases/b.html", { title: "Discard" }),
      canvas(".doan/canvases/c.html", { title: "결제실패" }), canvas(".doan/canvases/d.html", { title: "결제 실패" }),
    ])]);
    expect(searchMatch(index, "card", null, commonOf).map((entry) => entry.path)).toEqual([".doan/canvases/a.html", ".doan/canvases/b.html"]);
    expect(searchMatch(index, "실패", null, commonOf).map((entry) => entry.path)).toEqual([".doan/canvases/d.html", ".doan/canvases/c.html"]);
  });

  it("breaks ties by current root, common repo, then other roots with stable saved order", () => {
    const index = searchIndex([folder("/other", [canvas(".doan/canvases/card.html")]), folder("/sibling", [canvas(".doan/canvases/card.html")]), folder("/repo", [canvas(".doan/canvases/card.html")])]);
    expect(searchMatch(index, "card", "/repo", commonOf).map((entry) => entry.root)).toEqual(["/repo", "/sibling", "/other"]);
    expect(searchMatch(index, "card", null, commonOf).map((entry) => entry.root)).toEqual(["/other", "/sibling", "/repo"]);
    expect(searchMatch(index, "card", "/repo", () => undefined).map((entry) => entry.root)).toEqual(["/repo", "/other", "/sibling"]);
  });

  it("shows only canvases in saved order for empty home or workspace queries and limits to 50", () => {
    const index = searchIndex([folder("/other", [canvas(".doan/canvases/z.html")]), folder("/repo", Array.from({ length: 60 }, (_, i) => canvas(`.doan/canvases/card-${i}.html`, { frames: [{ id: "card" }] })))]);
    expect(searchMatch(index, " \n ", null, commonOf)).toHaveLength(50);
    expect(searchMatch(index, "", null, commonOf)[0]?.path).toBe(".doan/canvases/z.html");
    const workspace = searchMatch(index, "", "/repo", commonOf);
    expect(workspace).toHaveLength(50);
    expect(workspace.every((entry) => entry.kind === "canvas" && entry.root === "/repo")).toBe(true);
    expect(workspace[0]?.path).toBe(".doan/canvases/card-0.html");
    expect(searchMatch(index, "card", null, commonOf)).toHaveLength(50);
    expect(searchMatch(index, "", "/missing", commonOf)).toEqual([]);
    expect(searchMatch([], "", null, commonOf)).toEqual([]);
  });

  it("searches 1000 canvases with 50 frames each within 50ms", () => {
    const index = searchIndex([folder("/repo", Array.from({ length: 1000 }, (_, i) => canvas(`.doan/canvases/card-${i}.html`, {
      frames: Array.from({ length: 50 }, (_, j) => ({ id: `card-${j}`, title: `Card payment ${j}` })),
    })))]);
    expect(index).toHaveLength(51000);
    for (const query of ["card", "ard"]) {
      const started = performance.now();
      const results = searchMatch(index, query, "/repo", commonOf);
      const elapsed = performance.now() - started;
      console.info(`Quick open: 51000 entries searched for ${query} in ${elapsed.toFixed(2)}ms`);
      expect(results).toHaveLength(50);
      expect(elapsed).toBeLessThanOrEqual(50);
    }
    for (const kind of ["canvas", "frame"] as const) {
      for (const query of ["card", "ard"]) {
        let started = performance.now();
        const results = searchMatch(index, query, "/repo", commonOf, kind);
        let elapsed = performance.now() - started;
        console.info(`Quick open: 51000 entries searched for ${query} as ${kind} in ${elapsed.toFixed(2)}ms`);
        expect(results).toHaveLength(50);
        expect(results.every(result => result.kind === kind)).toBe(true);
        expect(elapsed).toBeLessThanOrEqual(50);
        started = performance.now();
        const count = countMatches(index, query, kind);
        elapsed = performance.now() - started;
        console.info(`Quick open: 51000 entries counted for ${query} as ${kind} in ${elapsed.toFixed(2)}ms`);
        expect(count).toBe(kind === "canvas" ? 1000 : 50000);
        expect(elapsed).toBeLessThanOrEqual(50);
      }
    }
  });

  it("retains late higher scores and root priorities at the result cap with stable ties", () => {
    const index = searchIndex([
      folder("/other", Array.from({ length: 60 }, (_, i) => canvas(`.doan/canvases/screen-${i}.html`, { title: "Discard" }))),
      folder("/sibling", Array.from({ length: 60 }, (_, i) => canvas(`.doan/canvases/screen-${i}.html`, { title: "Discard" }))),
      folder("/repo", [canvas(".doan/canvases/current.html", { title: "Discard" })]),
      folder("/last", [canvas(".doan/canvases/best.html", { title: "Card" })]),
    ]);
    const results = searchMatch(index, "card", "/repo", commonOf);
    expect(results).toHaveLength(50);
    expect(results.slice(0, 2).map((result) => result.path)).toEqual([".doan/canvases/best.html", ".doan/canvases/current.html"]);
    expect(results.slice(2).map((result) => [result.root, result.path])).toEqual(
      Array.from({ length: 48 }, (_, i) => ["/sibling", `.doan/canvases/screen-${i}.html`]),
    );
  });
});

describe("quick open target", () => {
  it("switches roots before opening, opens different canvases, and jumps within the open canvas", () => {
    const index = searchIndex([folder("/repo", [canvas(".doan/canvases/a.html", { frames: [{ id: "target" }] })])]);
    for (const result of index) {
      expect(pickTarget(result, "/other", ".doan/canvases/a.html")).toBe("switch");
      expect(pickTarget(result, null, null)).toBe("switch");
      expect(pickTarget(result, "/repo", ".doan/canvases/b.html")).toBe("open");
      expect(pickTarget(result, "/repo", null)).toBe("open");
      expect(pickTarget(result, "/repo", ".doan/canvases/a.html")).toBe("jump");
    }
  });
});

it("uses the tree fallback for blank frame labels", () => {
  const index = searchIndex([{ kind: "list", path: "/repo", servedRev: 0, canvases: [{ path: ".doan/canvases/a.html", url: "u", open: 0, resolved: 0, frames: [{ id: "", title: "  " }] }] }]);
  expect(index.find(row => row.kind === "frame")?.label).toBe("(no id)");
});

it("only calls a canvas missing when its project was successfully listed", () => {
  expect(unavailableCanvasMessage({ kind: "list", path: "/p", servedRev: 0, canvases: [] }, ".doan/canvases/moved.html")).toBe("moved is no longer in .doan/canvases/");
  expect(unavailableCanvasMessage({ kind: "loading", path: "/p" }, ".doan/canvases/moved.html")).toBe("Project is still being read. Try Open again shortly.");
  expect(unavailableCanvasMessage({ kind: "cliError", path: "/p", reason: "failed" }, ".doan/canvases/moved.html")).toBe("Project is unavailable. Fix it from its menu in the sidebar, then try again.");
  expect(unavailableCanvasMessage(undefined, ".doan/canvases/moved.html")).toBe("Project is unavailable. Fix it from its menu in the sidebar, then try again.");
});

it("does not call a still-listed canvas deleted when its captured identity became stale", () => {
  expect(unavailableCanvasMessage({ kind: "list", path: "/repo", servedRev: 0, canvases: [canvas(".doan/canvases/a.html")] }, ".doan/canvases/a.html"))
    .toBe("Canvas changed while opening. Choose it again from the sidebar or Quick Open.");
});

describe("quick open match positions", () => {
  it("marks a prefix, then a word start, then the first substring for each token", () => {
    expect(matchPositions("Card payment", "card")).toEqual([0, 1, 2, 3]);
    expect(matchPositions("Discard card", "card")).toEqual([8, 9, 10, 11]);
    expect(matchPositions("Discard", "card")).toEqual([3, 4, 5, 6]);
    expect(matchPositions("Discarded discard", "card")).toEqual([3, 4, 5, 6]);
  });

  it("merges several and overlapping tokens case-insensitively", () => {
    expect(matchPositions("Card payment", "PAY card")).toEqual([0, 1, 2, 3, 5, 6, 7]);
    expect(matchPositions("Card payment", "card ca")).toEqual([0, 1, 2, 3]);
    expect(matchPositions("CARD", "card")).toEqual([0, 1, 2, 3]);
  });

  it("marks only the tokens found in the name when others matched the path", () => {
    const index = searchIndex([folder("/repo", [canvas(".doan/canvases/settings/billing.html", { title: "Card plans" })])]);
    expect(searchMatch(index, "settings card", null, commonOf)).toHaveLength(1);
    expect(matchPositions("Card plans", "settings card")).toEqual([0, 1, 2, 3]);
    expect(matchPositions("Card plans", "settings")).toEqual([]);
  });

  it("marks an untitled frame's id name", () => {
    const index = searchIndex([folder("/repo", [canvas(".doan/canvases/a.html", { frames: [{ id: "card-declined" }] })])]);
    const [frame] = searchMatch(index, "declined", null, commonOf);
    expect(frame?.label).toBe("card-declined");
    expect(matchPositions(frame?.label ?? "", "declined")).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("marks nothing when normalization changes the name's length", () => {
    expect(matchPositions("결제".normalize("NFD"), "결제")).toEqual([]);
    expect(matchPositions("İstanbul", "stan")).toEqual([]);
  });

  it("marks an NFC name for an NFD query", () => {
    expect(matchPositions("결제 실패", "실패".normalize("NFD"))).toEqual([3, 4]);
  });

  it("counts positions in code points around emoji", () => {
    expect(matchPositions("🎨 Card", "card")).toEqual([2, 3, 4, 5]);
    expect(matchPositions("a🎨b", "🎨b")).toEqual([1, 2]);
  });

  it("marks nothing for an empty query", () => {
    expect(matchPositions("Card", "")).toEqual([]);
    expect(matchPositions("Card", " \t ")).toEqual([]);
  });

  it("splits a name into matched and unmatched runs by code point", () => {
    expect(markRuns("Card payment", [0, 1, 2, 3, 5, 6, 7])).toEqual([
      { text: "Card", match: true }, { text: " ", match: false }, { text: "pay", match: true }, { text: "ment", match: false },
    ]);
    expect(markRuns("🎨 Card", [2, 3, 4, 5])).toEqual([{ text: "🎨 ", match: false }, { text: "Card", match: true }]);
    expect(markRuns("Card", [])).toEqual([{ text: "Card", match: false }]);
    expect(markRuns("", [])).toEqual([]);
  });
});

describe("quick open kind filter", () => {
  it("filters by kind before the cap and keeps ranking within a tab", () => {
    const index = searchIndex([folder("/repo", [
      ...Array.from({ length: 60 }, (_, i) => canvas(`.doan/canvases/card-${i}.html`)),
      canvas(".doan/canvases/z.html", { frames: [{ id: "x", title: "Discard" }, { id: "y", title: "Card declined" }] }),
    ])]);
    expect(searchMatch(index, "card", "/repo", commonOf).every(result => result.kind === "canvas")).toBe(true);
    expect(searchMatch(index, "card", "/repo", commonOf, "all")).toEqual(searchMatch(index, "card", "/repo", commonOf));
    expect(searchMatch(index, "card", "/repo", commonOf, "frame").map(result => result.label)).toEqual(["Card declined", "Discard"]);
    const canvases = searchMatch(index, "card", "/repo", commonOf, "canvas");
    expect(canvases).toHaveLength(50);
    expect(canvases.every(result => result.kind === "canvas")).toBe(true);
  });

  it("shows the scope's canvases for empty All and Canvases queries", () => {
    const index = searchIndex([folder("/repo", [canvas(".doan/canvases/a.html", { frames: [{ id: "f" }] })])]);
    expect(searchMatch(index, "", "/repo", commonOf, "canvas")).toEqual(searchMatch(index, "", "/repo", commonOf));
  });

  const rows = () => [
    canvas(".doan/canvases/a.html", { frames: [{ id: "a1" }, { id: "a2" }] }),
    canvas(".doan/canvases/b.html", { frames: [{ id: "b1" }, { id: "b2" }] }),
  ];

  it("lists workspace frames for an empty Frames query with the open canvas's rendered frames first", () => {
    const entries = [folder("/other", rows()), folder("/repo", rows())];
    const rendered = { root: "/repo", path: ".doan/canvases/b.html", frames: [{ id: "live" }] };
    const index = searchIndex(entries, rendered);
    const open = { root: rendered.root, path: rendered.path };
    expect(searchMatch(index, "", "/repo", commonOf, "frame", open).map(result => [result.root, result.label])).toEqual([
      ["/repo", "live"], ["/repo", "a1"], ["/repo", "a2"],
    ]);
    expect(searchMatch(index, "", "/repo", commonOf, "frame").map(result => result.label)).toEqual(["a1", "a2", "live"]);
    const empty = searchIndex(entries, { ...rendered, frames: [] });
    expect(searchMatch(empty, "", "/repo", commonOf, "frame", open).map(result => result.label)).toEqual(["a1", "a2"]);
  });

  it("puts the open canvas first only when its root is the current workspace", () => {
    const index = searchIndex([folder("/repo", rows()), folder("/worktree", rows())]);
    expect(searchMatch(index, "", "/repo", commonOf, "frame", { root: "/worktree", path: ".doan/canvases/b.html" }).map(result => [result.root, result.label]))
      .toEqual([["/repo", "a1"], ["/repo", "a2"], ["/repo", "b1"], ["/repo", "b2"]]);
    expect(searchMatch(index, "", "/repo", commonOf, "frame", { root: "/repo", path: ".doan/canvases/b.html" }).map(result => [result.root, result.label]))
      .toEqual([["/repo", "b1"], ["/repo", "b2"], ["/repo", "a1"], ["/repo", "a2"]]);
  });

  it("lists every project's frames in saved order on Home and ignores the open canvas", () => {
    const index = searchIndex([folder("/other", rows()), folder("/repo", rows())], { root: "/repo", path: ".doan/canvases/a.html", frames: [{ id: "live" }] });
    expect(searchMatch(index, "", null, commonOf, "frame", { root: "/repo", path: ".doan/canvases/a.html" }).map(result => [result.root, result.label])).toEqual([
      ["/other", "a1"], ["/other", "a2"], ["/other", "b1"], ["/other", "b2"], ["/repo", "live"], ["/repo", "b1"], ["/repo", "b2"],
    ]);
  });

  it("limits empty Frames queries to 50 and returns nothing outside the scope", () => {
    const index = searchIndex([folder("/repo", [canvas(".doan/canvases/a.html", { frames: Array.from({ length: 60 }, (_, i) => ({ id: `f${i}` })) })])]);
    const frames = searchMatch(index, "", "/repo", commonOf, "frame");
    expect(frames).toHaveLength(50);
    expect(frames.every(result => result.kind === "frame")).toBe(true);
    expect(frames[49]?.label).toBe("f49");
    expect(searchMatch(index, "", "/missing", commonOf, "frame")).toEqual([]);
  });

  it("counts matches of one kind without the cap", () => {
    const index = (n: number) => searchIndex([folder("/repo", [
      canvas(".doan/canvases/card.html", { frames: Array.from({ length: n }, (_, i) => ({ id: `card-${i}` })) }),
      canvas(".doan/canvases/other.html"),
    ])]);
    for (const n of [0, 1, 2, 50, 51]) expect(countMatches(index(n), "card", "frame")).toBe(n);
    expect(countMatches(index(51), "card", "canvas")).toBe(1);
    expect(countMatches(index(51), "missing", "canvas")).toBe(0);
    expect(countMatches(index(3), "card 1", "frame")).toBe(1);
  });
});

describe("quick open empty text", () => {
  const listed: FolderEntry[] = [{ path: "/repo", kind: "list", canvases: [], servedRev: 0 }];
  it("keeps the All texts and names each kind tab", () => {
    expect(emptyText("all", "card", listed, 3)).toBe("No canvases or frames match");
    expect(emptyText("canvas", "card", listed, 0)).toBe("No canvases match");
    expect(emptyText("frame", "card", listed, 0)).toBe("No frames match");
  });

  it("adds how many of the other kind match in All", () => {
    expect(emptyText("frame", "card", listed, 1)).toBe("No frames match. 1 canvas matches in All.");
    expect(emptyText("frame", "card", listed, 2)).toBe("No frames match. 2 canvases match in All.");
    expect(emptyText("canvas", "card", listed, 1)).toBe("No canvases match. 1 frame matches in All.");
    expect(emptyText("canvas", "card", listed, 2)).toBe("No canvases match. 2 frames match in All.");
    expect(emptyText("canvas", "card", listed, 50)).toBe("No canvases match. 50 frames match in All.");
    expect(emptyText("canvas", "card", listed, 51)).toBe("No canvases match. 50+ frames match in All.");
  });

  it("puts reading and unavailable projects before the empty-query texts", () => {
    const loading = [{ path: "/repo", kind: "loading" } as const];
    const broken = [{ path: "/repo", kind: "notFound" } as const];
    for (const kind of ["all", "canvas", "frame"] as const) {
      expect(emptyText(kind, "", loading, 0)).toBe("Project is still being read. Try again shortly.");
      expect(emptyText(kind, " ", broken, 0)).toBe("Project is unavailable. Fix it from its menu in the sidebar.");
    }
    expect(emptyText("all", "", listed, 0)).toBe("No canvases to show");
    expect(emptyText("canvas", "", listed, 0)).toBe("No canvases to show");
    expect(emptyText("frame", "", listed, 0)).toBe("No frames to show");
    expect(emptyText("all", "", [], 0)).toBe("No canvases to show");
    expect(emptyText("frame", "", [], 0)).toBe("No frames to show");
  });
});

describe("quick open groups", () => {
  const names = new Map([
    ["/repo", { name: "acme-web", title: "acme-web · main" }],
    ["/sibling", { name: "acme-web", title: "acme-web · feat-billing" }],
    ["/other", { name: "brand-kit", title: "brand-kit" }],
    ["/x", { name: "brand-kit", title: "brand-kit" }],
  ]);
  const grouped = (results: readonly SearchResult[]) => groupResults(results, names).map(group => [group.root, group.rows.map(row => row.path)]);

  it("orders groups by their best match, even another root's exact match before the current root", () => {
    const index = searchIndex([
      folder("/repo", [canvas(".doan/canvases/a.html", { title: "Discard" }), canvas(".doan/canvases/b.html", { title: "Card" })]),
      folder("/other", [canvas(".doan/canvases/c.html", { title: "Card payment" })]),
    ]);
    const results = searchMatch(index, "card", "/repo", commonOf);
    expect(grouped(results)).toEqual([
      ["/repo", [".doan/canvases/b.html", ".doan/canvases/a.html"]],
      ["/other", [".doan/canvases/c.html"]],
    ]);
    const exact = searchIndex([
      folder("/repo", [canvas(".doan/canvases/a.html", { title: "Discard" })]),
      folder("/other", [canvas(".doan/canvases/c.html", { title: "Card" })]),
    ]);
    expect(grouped(searchMatch(exact, "card", "/repo", commonOf))).toEqual([["/other", [".doan/canvases/c.html"]], ["/repo", [".doan/canvases/a.html"]]]);
  });

  it("orders equal scores by proximity, then by first appearance for two other repositories", () => {
    const index = searchIndex([
      folder("/x", [canvas(".doan/canvases/x.html", { title: "Card" })]),
      folder("/other", [canvas(".doan/canvases/o.html", { title: "Card" })]),
      folder("/sibling", [canvas(".doan/canvases/s.html", { title: "Card" })]),
      folder("/repo", [canvas(".doan/canvases/r.html", { title: "Card" })]),
    ]);
    const commons = (root: string) => ({ "/repo": "/repo/.git", "/sibling": "/repo/.git", "/other": "/other/.git", "/x": "/x/.git" })[root];
    expect(grouped(searchMatch(index, "card", "/repo", commons)).map(([root]) => root)).toEqual(["/repo", "/sibling", "/x", "/other"]);
  });

  it("groups empty queries in saved order and keeps the order inside a group", () => {
    const index = searchIndex([folder("/other", [canvas(".doan/canvases/z.html"), canvas(".doan/canvases/a.html")]), folder("/repo", [canvas(".doan/canvases/m.html")])]);
    const results = searchMatch(index, "", null, commonOf);
    const groups = groupResults(results, names);
    expect(groups.map(group => [group.root, group.name, group.title, group.rows.map(row => row.path)])).toEqual([
      ["/other", "brand-kit", "brand-kit", [".doan/canvases/z.html", ".doan/canvases/a.html"]],
      ["/repo", "acme-web", "acme-web · main", [".doan/canvases/m.html"]],
    ]);
    expect(groups.flatMap(group => group.rows)).toEqual(results);
  });

  it("keeps same-named folders outside git in separate groups", () => {
    const same = new Map([["/a/design", { name: "design", title: "design" }], ["/b/design", { name: "design", title: "design" }]]);
    const index = searchIndex([folder("/a/design", [canvas(".doan/canvases/card.html")]), folder("/b/design", [canvas(".doan/canvases/card.html")])]);
    const groups = groupResults(searchMatch(index, "card", null, () => undefined), same);
    expect(groups.map(group => [group.root, group.title])).toEqual([["/a/design", "design"], ["/b/design", "design"]]);
  });

  it("gives every row a distinct key down to the frame index", () => {
    const index = searchIndex([
      folder("/repo", [canvas(".doan/canvases/a.html", { frames: [{ id: "dup" }, { id: "dup" }] }), canvas(".doan/canvases/b.html", { frames: [{ id: "dup" }] })]),
      folder("/sibling", [canvas(".doan/canvases/a.html", { frames: [{ id: "dup" }] })]),
    ]);
    const keys = index.map(entry => resultKey(entry));
    expect(new Set(keys).size).toBe(keys.length);
    const [, frame] = searchMatch(index, "", "/repo", commonOf, "frame");
    expect(resultKey(frame!)).toBe(resultKey(index[2]!));
  });
});

describe("quick open result parts", () => {
  it("names the canvas and frame detail lines and keeps the accessible name", () => {
    expect(resultParts({ kind: "frame", root: "/code/acme-web", path: ".doan/canvases/settings/billing.html", canvasLabel: "Billing & plans", label: "Card declined", frameId: "card-declined", frameIndex: 3 }, "acme-web · main"))
      .toEqual({ icon: "frame", name: "Card declined", detail: "Billing & plans › 4", accessibleName: "Card declined — Billing & plans › 4 · acme-web · main" });
    expect(resultParts({ kind: "canvas", root: "/b", path: ".doan/canvases/research/card-decline-patterns.html", canvasLabel: "Card decline patterns", label: "Card decline patterns" }, undefined))
      .toEqual({ icon: "canvas", name: "Card decline patterns", detail: "research/card-decline-patterns.html", accessibleName: "Card decline patterns — research/card-decline-patterns.html" });
  });
});

describe("quick open outside click", () => {
  const rect = { left: 100, top: 128, right: 740, bottom: 600 };
  const press = (x: number, y: number, button = 0) => ({ x, y, button });
  it("closes only for a primary press and release both outside the border box", () => {
    expect(outsideDialog(rect, press(300, 300), { x: 300, y: 300 })).toBe(false);
    for (const [x, y] of [[99, 300], [741, 300], [300, 127], [300, 601]] as const) {
      expect(outsideDialog(rect, press(x, y), { x, y })).toBe(true);
    }
    expect(outsideDialog(rect, press(300, 300), { x: 50, y: 50 })).toBe(false);
    expect(outsideDialog(rect, press(50, 50), { x: 300, y: 300 })).toBe(false);
    expect(outsideDialog(rect, press(50, 50, 2), { x: 50, y: 50 })).toBe(false);
    expect(outsideDialog(rect, press(50, 50, 1), { x: 50, y: 50 })).toBe(false);
  });

  it("treats the border line as inside", () => {
    for (const [x, y] of [[100, 300], [740, 300], [300, 128], [300, 600]] as const) {
      expect(outsideDialog(rect, press(x, y), { x, y })).toBe(false);
    }
  });

  it("never closes for a press or a release on the header strip, its no-drag controls included", () => {
    const strip = { left: 0, top: 0, right: 1238, bottom: 56 };
    // The mode capsule and the history buttons sit inside the strip; the backdrop below it still closes.
    expect(outsideDialog(rect, press(620, 28), { x: 620, y: 28 }, strip)).toBe(false);
    expect(outsideDialog(rect, press(400, 28), { x: 400, y: 400 }, strip)).toBe(false);
    expect(outsideDialog(rect, press(50, 400), { x: 50, y: 20 }, strip)).toBe(false);
    // The strip's bottom edge belongs to the strip.
    expect(outsideDialog(rect, press(50, 56), { x: 50, y: 56 }, strip)).toBe(false);
    expect(outsideDialog(rect, press(50, 57), { x: 50, y: 57 }, strip)).toBe(true);
    expect(outsideDialog(rect, press(50, 400), { x: 50, y: 400 }, strip)).toBe(true);
    expect(outsideDialog(rect, press(50, 400), { x: 50, y: 400 }, null)).toBe(true);
  });
});
