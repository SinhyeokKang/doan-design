import { describe, expect, it } from "vitest";
import type { Comment, Target } from "../formats/types";
import { copyText, matchTarget, outdated, projectList, projectPins } from "./projection";

const hash = `sha256:${"a".repeat(64)}`;
function comment(id: string, target: Target = {}, status: "open" | "resolved" = "open"): Comment {
  return { comment: id, target, status, body: "  안녕 😀\n", canvasHash: hash, createdBy: { kind: "human", name: "Kim" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}
const context = { root: "/repo", canvas: "home", generation: 1 };
const element = { element: { doanId: "button", selector: "#button", html: "<button/>" } };
const comments = [comment("a", { frame: "frame" }), comment("b", element), comment("c", element), comment("d"), comment("e", element, "resolved"), comment("f", element)];
const nodes = new Map([["a", "parent"], ["b", "parent"], ["c", "child"], ["e", "parent"]]);
const lookup = { ...context, nodes };

describe("target lookup and list projection", () => {
  it("prefers one exact doan id, then one selector, never frame fallback for an element", () => {
    expect(matchTarget(element, { doanId: ["a"], selector: ["b"], frame: ["c"] })).toBe("a");
    expect(matchTarget(element, { doanId: ["a", "b"], selector: ["c"], frame: ["d"] })).toBe("c");
    for (const selector of [null, [], ["a", "b"]]) expect(matchTarget(element, { doanId: [], selector, frame: ["d"] })).toBeNull();
    expect(matchTarget({ frame: "x" }, { frame: ["a"] })).toBe("a");
    expect(matchTarget({ frame: "x" }, { frame: ["a", "b"] })).toBeNull();
    expect(matchTarget({}, { frame: ["a"] })).toBeNull();
  });
  it("groups frame and element identity, excludes descendants, and retains resolved scope", () => {
    expect(projectList(comments, context, lookup, { scope: "selection", node: "parent", status: "open" }).map(c => c.comment)).toEqual(["a", "b"]);
    expect(projectList(comments, context, lookup, { scope: "selection", node: "parent", status: "resolved" }).map(c => c.comment)).toEqual(["e"]);
    expect(projectList(comments, context, lookup, { scope: "canvas", status: "open" }).map(c => c.comment)).toEqual(["a", "b", "c", "d", "f"]);
  });
  it.each([{ root: "/other" }, { canvas: "other" }, { generation: 2 }])("rejects stale or cross-project DOM identities %o", changed => {
    expect(projectList(comments, context, { ...lookup, ...changed }, { scope: "selection", node: "parent", status: "open" })).toEqual([]);
  });
  it("never treats hash unknown as same or ties outdated to location", () => {
    expect(outdated(hash, null)).toBe("unknown");
    expect(outdated(hash, hash)).toBe("same");
    expect(outdated(hash, `sha256:${"b".repeat(64)}`)).toBe("outdated");
  });
});

describe("screen-space pins", () => {
  it.each([.05, .25, 1, 4])("keeps exact same-node groups and top-right coordinates at scale %s", scale => {
    const rects = new Map([["parent", { x: 10, y: 20, width: 30, height: 40 }], ["child", { x: 11, y: 21, width: 5, height: 5 }]]);
    const pins = projectPins(comments, context, lookup, rects, { scale, x: 10, y: 15 }, { x: 0, y: 0, width: 500, height: 500 });
    expect(pins).toEqual([{ node: "parent", comments: ["a", "b"], x: 10 + 40 * scale, y: 15 + 20 * scale }, { node: "child", comments: ["c"], x: 10 + 16 * scale, y: 15 + 21 * scale }]);
  });
  it.each([.05, .25, 1, 4])("does not clamp an offscreen or clipped anchor at %s", scale => {
    const rects = new Map([["parent", { x: 0, y: -10, width: 100, height: 100 }]]);
    expect(projectPins(comments, context, lookup, rects, { scale, x: 0, y: 0 }, { x: 0, y: 0, width: 500, height: 500 })).toEqual([]);
    expect(projectPins(comments, context, lookup, rects, { scale, x: 0, y: 100 }, { x: 0, y: 100, width: 500, height: 500 })).toEqual([]);
  });
  it("rejects invalid geometry and stale generation; canvas comments never gain pins", () => {
    const rects = new Map([["parent", { x: 0, y: 0, width: Infinity, height: 10 }]]);
    expect(projectPins(comments, context, lookup, rects, { scale: 1, x: 0, y: 0 }, { x: 0, y: 0, width: 500, height: 500 })).toEqual([]);
    expect(projectPins(comments, context, { ...lookup, generation: 2 }, new Map(), { scale: 1, x: 0, y: 0 }, { x: 0, y: 0, width: 500, height: 500 })).toEqual([]);
  });
});

describe("copy scopes", () => {
  it("puts paths and ids in JSON data without bodies or shell command assembly", () => {
    const root = '/repo/"\n한글 `$(touch x)`;';
    const canvas = 'home"\n';
    const text = copyText(root, canvas, comments, { kind: "all" });
    expect(JSON.parse(text.split("\n").at(-1) ?? "")).toEqual({ root, canvas, comments: ["a", "b", "c", "d", "f"] });
    expect(text).not.toContain(comments[0]?.body);
    expect(text).toContain("CLI/MCP");
    expect(JSON.parse(copyText(root, canvas, comments, { kind: "one", comment: "b" }).split("\n").at(-1) ?? "").comments).toEqual(["b"]);
  });
  it("requires reopening resolved comments and rejects missing/empty scopes", () => {
    expect(() => copyText("/repo", "home", comments, { kind: "one", comment: "e" })).toThrow(/Reopen/);
    expect(() => copyText("/repo", "home", comments, { kind: "one", comment: "gone" })).toThrow();
    expect(() => copyText("/repo", "home", [], { kind: "all" })).toThrow();
  });
});
