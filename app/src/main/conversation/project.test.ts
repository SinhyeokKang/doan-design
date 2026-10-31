import { describe, expect, it } from "vitest";
import { BIND_GRACE_MS, projectBusy, promotionTarget, type ProjectTurn } from "./project";
import type { Canvas } from "./types";
describe("projectBusy", () => {
  const now = 1_000_000;
  const live = (entries: Record<string, ProjectTurn>) => new Map(Object.entries(entries));
  it("counts a start still preparing, a running turn and a turn waiting for an answer", () => {
    expect(projectBusy(live({ a: { project: "/repo", busy: true, terminal: false } }), "/repo", "b", now)).toBe("a");
  });
  it("counts the binding window after a turn ended and nothing after it", () => {
    expect(projectBusy(live({ a: { project: "/repo", busy: false, terminal: true, endedAt: now - BIND_GRACE_MS } }), "/repo", "b", now)).toBe("a");
    expect(projectBusy(live({ a: { project: "/repo", busy: false, terminal: true, endedAt: now - BIND_GRACE_MS - 1 } }), "/repo", "b", now)).toBeNull();
  });
  it("ignores the asking conversation, other roots, canvas turns and refused preparations", () => {
    expect(projectBusy(live({ a: { project: "/repo", busy: true, terminal: false } }), "/repo", "a", now)).toBeNull();
    expect(projectBusy(live({ a: { project: "/other", busy: true, terminal: false } }), "/repo", "b", now)).toBeNull();
    expect(projectBusy(live({ a: { busy: true, terminal: false } }), "/repo", "b", now)).toBeNull();
    expect(projectBusy(live({ a: { project: "/repo", busy: false, terminal: false } }), "/repo", "b", now)).toBeNull();
    expect(projectBusy(live({ a: { project: "/repo", busy: true, terminal: false, failedPersistence: true } }), "/repo", "b", now)).toBeNull();
  });
});
describe("promotionTarget", () => {
  const root = "/private/tmp/repo";
  const a: Canvas = { path: ".doan/canvases/a.html", id: "a" }, b: Canvas = { path: ".doan/canvases/b.html", id: "b" }, c: Canvas = { path: ".doan/canvases/c.html", id: "c" };
  const idle = () => false;
  const turn = (edits: string[], changed: string[]) => ({ root, edits, changed });
  it("binds exactly one new canvas and prefers it over an edited one", () => {
    expect(promotionTarget(turn([], []), [a, b], [a], idle)).toEqual(b);
    expect(promotionTarget(turn([".doan/canvases/a.html"], [".doan/canvases/a.html", ".doan/canvases/b.html"]), [a, b], [a], idle)).toEqual(b);
  });
  it("stays a project conversation with two new canvases", () => {
    expect(promotionTarget(turn([], []), [a, b, c], [a], idle)).toBeNull();
  });
  it("promotes to the one existing canvas both an edit and a file change point at", () => {
    expect(promotionTarget(turn([".doan/canvases/a.html", "./.doan/canvases/a.html"], [".doan/canvases/a.html"]), [a, b], [a, b], idle)).toEqual(a);
  });
  it("needs both evidences: a refused edit without a file change and a change without an edit do not promote", () => {
    expect(promotionTarget(turn([".doan/canvases/a.html"], []), [a, b], [a, b], idle)).toBeNull();
    expect(promotionTarget(turn([], [".doan/canvases/a.html"]), [a, b], [a, b], idle)).toBeNull();
  });
  it("stays with two edited canvases", () => {
    expect(promotionTarget(turn([".doan/canvases/a.html", ".doan/canvases/b.html"], [".doan/canvases/a.html", ".doan/canvases/b.html"]), [a, b], [a, b], idle)).toBeNull();
  });
  it("ignores files that are not listed canvases", () => {
    expect(promotionTarget(turn(["src/app.ts", ".doan/canvases/a.html"], ["src/app.ts", ".doan/canvases/a.html"]), [a, b], [a, b], idle)).toEqual(a);
    expect(promotionTarget(turn([".doan/assets/x.png"], [".doan/assets/x.png"]), [a], [a], idle)).toBeNull();
  });
  it("reads absolute, aliased, dotted and outside paths against the root", () => {
    const changed = [".doan/canvases/a.html"];
    expect(promotionTarget(turn([`${root}/.doan/canvases/a.html`], changed), [a], [a], idle)).toEqual(a);
    expect(promotionTarget(turn(["/tmp/repo/.doan/canvases/a.html"], changed), [a], [a], idle)).toEqual(a);
    expect(promotionTarget(turn([".doan/x/../canvases/a.html"], changed), [a], [a], idle)).toEqual(a);
    expect(promotionTarget(turn(["../repo/.doan/canvases/a.html"], changed), [a], [a], idle)).toEqual(a);
    expect(promotionTarget(turn(["../other/.doan/canvases/a.html"], changed), [a], [a], idle)).toBeNull();
    expect(promotionTarget(turn(["/private/tmp/repo-worktree/.doan/canvases/a.html"], changed), [a], [a], idle)).toBeNull();
  });
  it("follows a canvas moved during the turn by its ID", () => {
    const moved: Canvas = { path: ".doan/canvases/renamed.html", id: "a" };
    expect(promotionTarget(turn([".doan/canvases/a.html"], [".doan/canvases/renamed.html"]), [moved, b], [a, b], idle)).toEqual(moved);
  });
  it("leaves out rows that share an ID and canvases deleted during the turn", () => {
    const twin: Canvas = { path: ".doan/canvases/twin.html", id: "a" };
    expect(promotionTarget(turn([".doan/canvases/a.html"], [".doan/canvases/a.html"]), [a, twin, b], [a, b], idle)).toBeNull();
    expect(promotionTarget(turn([".doan/canvases/a.html"], [".doan/canvases/a.html"]), [b], [a, b], idle)).toBeNull();
  });
  it("does not promote onto a canvas whose current conversation is working", () => {
    expect(promotionTarget(turn([".doan/canvases/a.html"], [".doan/canvases/a.html"]), [a], [a], canvas => canvas.id === "a")).toBeNull();
    expect(promotionTarget(turn([], []), [a, b], [a], canvas => canvas.id === "b")).toBeNull();
  });
  it("applies the same rule to a failed or stopped turn, and promotes nothing without a turn from this run", () => {
    expect(promotionTarget(turn([".doan/canvases/a.html"], [".doan/canvases/a.html"]), [a], [a], idle)).toEqual(a);
    expect(promotionTarget(null, [a, b], [a], idle)).toBeNull();
  });
});
