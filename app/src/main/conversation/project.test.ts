import { describe, expect, it } from "vitest";
import { BIND_GRACE_MS, contestedCanvas, projectBusy, promotionTarget, type ProjectTurn } from "./project";
import type { Canvas } from "./types";
describe("projectBusy", () => {
  const now = 1_000_000;
  const live = (entries: Record<string, ProjectTurn>) => new Map(Object.entries(entries));
  it("counts a start still preparing and a running turn", () => {
    expect(projectBusy(live({ a: { project: "/repo", busy: true, terminal: false } }), "/repo", "b", now)).toBe("a");
  });
  // canvas-composer-polish spec 4: a turn waiting for the person's answer does not keep another conversation out.
  it("does not count a turn while it waits for an answer, and counts it again once every request is answered", () => {
    expect(projectBusy(live({ a: { project: "/repo", busy: true, terminal: false, asking: new Set(["r1"]) } }), "/repo", "b", now)).toBeNull();
    expect(projectBusy(live({ a: { project: "/repo", busy: true, terminal: false, asking: new Set(["r1", "r2"]) } }), "/repo", "b", now)).toBeNull();
    expect(projectBusy(live({ a: { project: "/repo", busy: true, terminal: false, asking: new Set() } }), "/repo", "b", now)).toBe("a");
  });
  it("does not count the window of the conversation's earlier, judged turn against its turn now waiting for an answer", () => {
    expect(projectBusy(live({ a: { project: "/repo", busy: true, terminal: false, endedAt: now - 1, asking: new Set(["r1"]) } }), "/repo", "b", now)).toBeNull();
  });
  // The same state table as the renderer's start check (homeRun.test.ts 'blocksStart').
  it("allows only a turn waiting for an answer of the states that held the root", () => {
    const table: [string, ProjectTurn, string | null][] = [
      ["preparing", { project: "/repo", busy: true, terminal: false }, "a"],
      ["running", { project: "/repo", busy: true, terminal: false, asking: new Set() }, "a"],
      ["waiting for an answer", { project: "/repo", busy: true, terminal: false, asking: new Set(["r1"]) }, null],
      // agent-questions orch decision 3: a question waits as a permission does (service.ts keys both by kind).
      ["waiting for a question's answer", { project: "/repo", busy: true, terminal: false, asking: new Set(["question:q1"]) }, null],
      ["ended within the window", { project: "/repo", busy: false, terminal: true, endedAt: now - 1 }, "a"],
      ["queue about to go out", { project: "/repo", busy: false, terminal: true, endedAt: now - BIND_GRACE_MS - 1, holding: {} }, "a"],
      ["ended and judged", { project: "/repo", busy: false, terminal: true, endedAt: now - BIND_GRACE_MS - 1 }, null],
    ];
    for (const [state, turn, holder] of table) expect([state, projectBusy(live({ a: turn }), "/repo", "b", now)]).toEqual([state, holder]);
  });
  it("counts the binding window after a turn ended and nothing after it", () => {
    expect(projectBusy(live({ a: { project: "/repo", busy: false, terminal: true, endedAt: now - BIND_GRACE_MS } }), "/repo", "b", now)).toBe("a");
    expect(projectBusy(live({ a: { project: "/repo", busy: false, terminal: true, endedAt: now - BIND_GRACE_MS - 1 } }), "/repo", "b", now)).toBeNull();
  });
  it("counts a conversation holding queued messages for its next turn after its window", () => {
    expect(projectBusy(live({ a: { project: "/repo", busy: false, terminal: true, endedAt: now - BIND_GRACE_MS - 1, holding: true } }), "/repo", "b", now)).toBe("a");
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
  const turn = (edits: string[], changed: string[], taken: Canvas[] = [], contested: Canvas[] = []) => ({ root, edits, changed, taken, contested });
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
  it("does not guess which canvas an edit hit when two canvases swapped paths during the turn", () => {
    const swappedA: Canvas = { path: ".doan/canvases/b.html", id: "a" }, swappedB: Canvas = { path: ".doan/canvases/a.html", id: "b" };
    expect(promotionTarget(turn([".doan/canvases/a.html"], [".doan/canvases/a.html", ".doan/canvases/b.html"]), [swappedA, swappedB], [a, b], idle)).toBeNull();
  });
  it("does not hand an edit of a moved canvas to another canvas that took its old path", () => {
    const moved: Canvas = { path: ".doan/canvases/renamed.html", id: "a" }, taken: Canvas = { path: ".doan/canvases/a.html", id: "b" };
    expect(promotionTarget(turn([".doan/canvases/a.html"], [".doan/canvases/a.html", ".doan/canvases/b.html", ".doan/canvases/renamed.html"]), [moved, taken], [a, b], idle)).toBeNull();
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
  // canvas-composer-polish design §4: turns of one root may overlap once a waiting turn gets its answer.
  it("leaves out a canvas bound to another conversation after the snapshot, new or existing", () => {
    expect(promotionTarget(turn([], [], [b]), [a, b], [a], idle)).toBeNull();
    expect(promotionTarget(turn([], [], [b]), [a, b, c], [a], idle)).toEqual(c);
    expect(promotionTarget(turn([".doan/canvases/a.html"], [".doan/canvases/a.html"], [a]), [a, b], [a, b], idle)).toBeNull();
    expect(promotionTarget(turn([".doan/canvases/a.html", ".doan/canvases/b.html"], [".doan/canvases/a.html", ".doan/canvases/b.html"], [a]), [a, b], [a, b], idle)).toEqual(b);
  });
  it("does not promote to a new canvas another turn not judged yet could have made, as with two new canvases", () => {
    expect(promotionTarget(turn([], [], [], [b]), [a, b], [a], idle)).toBeNull();
    // Not even to an edited existing canvas: a new canvas wins over edits, and it is not this turn's to take.
    expect(promotionTarget(turn([".doan/canvases/a.html"], [".doan/canvases/a.html"], [], [b]), [a, b], [a], idle)).toBeNull();
    // A contested canvas that is not new to this turn is judged by the edit rule as before.
    expect(promotionTarget(turn([".doan/canvases/b.html"], [".doan/canvases/b.html"], [], [b]), [a, b], [a, b], idle)).toEqual(b);
  });
  it("names the one new canvas a judgement leaves to another unjudged turn, and none left for another reason", () => {
    expect(contestedCanvas(turn([], [], [], [b]), [a, b], [a])).toEqual(b);
    expect(contestedCanvas(turn([], [], [], [b, c]), [a, b, c], [a])).toBeNull();
    expect(contestedCanvas(turn([], [], [], []), [a, b], [a])).toBeNull();
    expect(contestedCanvas(turn([], [], [b], [b]), [a, b], [a])).toBeNull();
  });
  it("judges a turn that overlapped nothing as before", () => {
    expect(promotionTarget(turn([], [], [], []), [a, b], [a], idle)).toEqual(b);
  });
  it("applies the same rule to a failed or stopped turn, and promotes nothing without a turn from this run", () => {
    expect(promotionTarget(turn([".doan/canvases/a.html"], [".doan/canvases/a.html"]), [a], [a], idle)).toEqual(a);
    expect(promotionTarget(null, [a, b], [a], idle)).toBeNull();
  });
});
