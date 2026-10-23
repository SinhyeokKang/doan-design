import { describe, expect, it } from "vitest";
import { acceptCanvasMessage } from "./canvasMessage";
import { anchorSnapshot } from "./commentAnchors";
import type { Comment } from "../formats/types";

const comment = (id: string, target: Comment["target"]): Comment => ({ comment: id, target, status: "open", body: "x", canvasHash: "h", createdBy: { kind: "human", name: "A" }, createdAt: "t", updatedAt: "t" });
const context = { root: "/repo", canvas: "a", generation: 4 };
const rect = { x: 10, y: 20, width: 30, height: 40, clip: { x: 0, y: 0, width: 500, height: 500 } };
const response = { type: "anchors", href: "http://localhost/a", document: "doc", generation: 4, request: 2, revision: 1, viewport: 500, width: 500, selectionSeq: 0, selected: null, results: [
  { id: "f", candidates: { frame: ["n1"] } },
  { id: "e", candidates: { doanId: ["n1"], selector: ["n2"] } },
  { id: "child", candidates: { selector: ["n2"] } },
  { id: "bad", candidates: { doanId: ["n1", "n2"], selector: null, frame: ["n1"] } },
], rects: [{ node: "n1", ...rect }, { node: "n2", ...rect }] };

describe("anchor response boundary", () => {
  it("validates all fields and rejects nonfinite geometry and malformed candidate tokens", () => {
    const source = {};
    const accept = (data: unknown, origin = "null", sender = source) => acceptCanvasMessage({ data, origin, source: sender }, source);
    expect(accept(response)).toEqual(response);
    expect(accept(response, "https://canvas")).toBeNull();
    expect(accept(response, "null", {})).toBeNull();
    for (const field of ["generation", "request", "revision", "viewport", "width"]) expect(accept({ ...response, [field]: NaN })).toBeNull();
    expect(accept({ ...response, rects: [{ node: "n1", ...rect, x: Infinity }] })).toBeNull();
    expect(accept({ ...response, results: [{ id: "f", candidates: { frame: [4] } }] })).toBeNull();
  });
  it("uses shared C matching for frame/element identity without merging children or falling back to frame", () => {
    const comments = [comment("f", { frame: "frame" }), comment("e", { element: { doanId: "el", selector: ".el", html: "" } }), comment("child", { element: { selector: ".child", html: "" } }), comment("bad", { frame: "frame", element: { doanId: "dup", selector: "[", html: "" } })];
    const result = anchorSnapshot(comments, context, response);
    expect([...result.lookup.nodes]).toEqual([["f", "n1"], ["e", "n1"], ["child", "n2"]]);
    expect(result.rects.get("n1")).toEqual(rect);
  });
  it("does not truncate more than 1000 requested targets", () => {
    const results = Array.from({ length: 1001 }, (_, i) => ({ id: String(i), candidates: { selector: ["n1"] } }));
    const parsed = acceptCanvasMessage({ source: 1, origin: "null", data: { ...response, results } }, 1);
    expect(parsed?.type === "anchors" && parsed.results.length).toBe(1001);
  });
});
