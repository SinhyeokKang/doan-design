import { describe, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { AgentPresence } from "./agentPresence";
import { agentNoticeView, canvasAgent, DOT_FIELD, DotFieldLoop, drawDotField, listForPresence, settleStopping, stopFailedText, stopTurn, workingCanvas } from "./agentIndicator";

// buzz-canvas R5 (design §2 '에이전트 작업 표시', §5 copy): which canvas the indicator reads, the notice's button, Stop's
// lifecycle and the dot field's loop.
const row: CanvasRow = { path: ".doan/canvases/billing.html", id: "billing", url: "u" };
const opened = { folder: "/w/a", canvas: row.path, row };
const listed: FolderEntry = { path: "/w/a", kind: "list", servedRev: 0, canvases: [row] };
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", state: "current", owner: "doan", provider: "codex", fromHome: true,
  phase: "running", unseen: false, queued: 0, working: true, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "",
  canvas: { path: row.path, id: "billing" }, ...patch,
});
const working: AgentPresence = { conversationId: "c1", kind: "working", label: "Codex is working", canvas: { path: row.path, id: "billing" } };
const waiting: AgentPresence = { ...working, kind: "waiting", label: "Codex needs your answer" };

describe("workingCanvas", () => {
  test("a read canvas shows the indicator in every state: normal, loading, failed, no width; the target names its project", () => {
    expect(workingCanvas(opened, false, listed)).toEqual({ root: "/w/a", canvas: { path: row.path, id: "billing" } });
  });
  test("a canvas without an id is matched by its path", () => {
    const bare = { ...row, id: undefined } as unknown as CanvasRow;
    expect(workingCanvas({ ...opened, row: bare }, false, listed)).toEqual({ root: "/w/a", canvas: { path: row.path } });
  });
  test("an unlisted page shows nothing", () => {
    expect(workingCanvas(opened, true, listed)).toBeNull();
  });
  test("a project problem shows nothing, whatever canvas was open", () => {
    expect(workingCanvas(opened, false, { path: "/w/a", kind: "notFound" })).toBeNull();
    expect(workingCanvas(opened, false, { path: "/w/a", kind: "loading" })).toBeNull();
    expect(workingCanvas(opened, false, undefined)).toBeNull();
  });
  test("no open canvas, or one from another project, shows nothing", () => {
    expect(workingCanvas(null, false, listed)).toBeNull();
    expect(workingCanvas({ ...opened, folder: "/w/b" }, false, listed)).toBeNull();
  });
});

describe("listForPresence", () => {
  test("a read list is used; a list still loading or failed reads as a failed read", () => {
    const list = [summary({})];
    expect(listForPresence(list)).toBe(list);
    expect(listForPresence("loading")).toBeNull();
    expect(listForPresence("error")).toBeNull();
    expect(listForPresence(undefined)).toBeNull();
  });
});

describe("canvasAgent", () => {
  const target = { root: "/w/a", canvas: { path: row.path, id: "billing" } };
  test("carries the provider's display name for the Stop failure toast", () => {
    expect(canvasAgent([summary({})], target, null)).toEqual({ root: "/w/a", presence: working, provider: "Codex" });
  });
  test("a failed read keeps the previous presence and its provider", () => {
    const previous = canvasAgent([summary({})], target, null);
    expect(canvasAgent(null, target, previous)).toEqual(previous);
  });
  test("the turn's end clears it", () => {
    const previous = canvasAgent([summary({})], target, null);
    expect(canvasAgent([summary({ phase: "ended" })], target, previous)).toBeNull();
  });
  test("another canvas's conversation shows nothing", () => {
    expect(canvasAgent([summary({ canvas: { path: ".doan/canvases/other.html", id: "other" } })], target, null)).toBeNull();
  });
  test("a project conversation shows nothing", () => {
    const { canvas: _c, ...project } = summary({});
    expect(canvasAgent([project], target, null)).toBeNull();
  });
  test("no canvas (unlisted page, project problem) shows nothing even with a kept presence", () => {
    const previous = canvasAgent([summary({})], target, null);
    expect(canvasAgent([summary({})], null, previous)).toBeNull();
    expect(canvasAgent(null, null, previous)).toBeNull();
  });
  // RBR5 🔴1: worktrees of one repository share canvas ids and paths, so a kept presence must not cross roots. Opening
  // B's twin canvas while B's list is still loading or failed must not offer A's Stop.
  describe("a kept presence stays in its project", () => {
    const b = { root: "/w/b", canvas: target.canvas };
    for (const [name, state] of [["loading", "loading"], ["failed", "error"]] as const) {
      test(`A → B with B's list ${name}, matching ids: nothing from A`, () => {
        const previous = canvasAgent([summary({})], target, null);
        const after = canvasAgent(listForPresence(state), b, previous);
        expect(after).toBeNull();
        expect(agentNoticeView(after?.presence ?? null, null)).toBeNull();
      });
      test(`A → B with B's list ${name}, id-less canvases at the same path: nothing from A`, () => {
        const bare = { path: row.path };
        const previous = canvasAgent([summary({ canvas: bare })], { root: "/w/a", canvas: bare }, null);
        expect(previous?.presence.conversationId).toBe("c1");
        expect(canvasAgent(listForPresence(state), { root: "/w/b", canvas: bare }, previous)).toBeNull();
      });
    }
    test("B's own read decides B; A's presence does not come back on returning to A with a failed read", () => {
      const inA = canvasAgent([summary({})], target, null);
      const inB = canvasAgent(listForPresence("error"), b, inA);
      expect(inB).toBeNull();
      expect(canvasAgent(listForPresence("error"), target, inB)).toBeNull();
    });
    test("within one project a moved canvas keeps its presence across a failed read (id match)", () => {
      const previous = canvasAgent([summary({})], target, null);
      const moved = { root: "/w/a", canvas: { path: ".doan/canvases/archive/billing.html", id: "billing" } };
      expect(canvasAgent(null, moved, previous)?.presence.conversationId).toBe("c1");
    });
  });
});

describe("agentNoticeView", () => {
  test("nothing to show without a presence", () => {
    expect(agentNoticeView(null, null)).toBeNull();
  });
  test("working: the moving dot, the label and Stop", () => {
    expect(agentNoticeView(working, null)).toEqual({ text: "Codex is working", steady: false, action: { kind: "stop", label: "Stop", disabled: false } });
  });
  test("after Stop: 'Stopping…', unavailable but still focusable", () => {
    expect(agentNoticeView(working, "c1")?.action).toEqual({ kind: "stop", label: "Stopping…", disabled: true });
  });
  test("a Stop pressed for another conversation does not hold this one", () => {
    expect(agentNoticeView(working, "c0")?.action).toEqual({ kind: "stop", label: "Stop", disabled: false });
  });
  test("waiting: a still dot and Open, named for the request; no Stop", () => {
    expect(agentNoticeView(waiting, null)).toEqual({ text: "Codex needs your answer", steady: true, action: { kind: "open", label: "Open", name: "Open the request" } });
    expect(agentNoticeView(waiting, "c1")?.action.kind).toBe("open");
  });
});

describe("settleStopping", () => {
  test("'Stopping…' holds while the same conversation still works or waits", () => {
    expect(settleStopping("c1", working)).toBe("c1");
    expect(settleStopping("c1", waiting)).toBe("c1");
  });
  test("it ends with the turn (no presence) or when another conversation shows", () => {
    expect(settleStopping("c1", null)).toBeNull();
    expect(settleStopping("c1", { ...working, conversationId: "c2" })).toBeNull();
    expect(settleStopping(null, working)).toBeNull();
  });
});

describe("stopTurn", () => {
  test("interrupts the conversation and reports nothing when main accepted", async () => {
    const interrupt = vi.fn(async () => undefined);
    expect(await stopTurn("c1", "Codex", interrupt)).toBeNull();
    expect(interrupt).toHaveBeenCalledWith({ conversationId: "c1" });
  });
  test("a ConversationError comes back as the toast text", async () => {
    expect(await stopTurn("c1", "Codex", async () => ({ error: "not_found" }))).toBe("Couldn’t stop Codex. Try again.");
  });
  test("a rejected call is a failure too", async () => {
    expect(await stopTurn("c1", "Claude Code", async () => { throw new Error("gone"); })).toBe("Couldn’t stop Claude Code. Try again.");
  });
  test("the text names the provider", () => {
    expect(stopFailedText("GitHub Copilot")).toBe("Couldn’t stop GitHub Copilot. Try again.");
  });
});

// A recorder for the 2D calls the field makes.
function recorder() {
  const calls: string[] = [];
  let alpha = 1;
  const ctx = {
    get globalAlpha() { return alpha; }, set globalAlpha(value: number) { alpha = value; },
    fillStyle: "",
    clearRect: () => calls.push("clear"), beginPath: () => calls.push("begin"), moveTo: () => {}, arc: () => calls.push("arc"),
    fill: () => calls.push(`fill@${alpha.toFixed(2)}`),
  };
  return { ctx, calls };
}

describe("drawDotField", () => {
  test("uses the doan values: 12px grid, radius 1.5→2, alpha 0.08→0.3, a 320px cursor sweeping 5 rows at 320px/s", () => {
    expect(DOT_FIELD).toEqual({ gap: 12, baseRadius: 1.5, maxRadius: 2, baseAlpha: 0.08, maxAlpha: 0.3, radius: 320, speed: 320, rows: 5 });
  });
  test("paints every dot outside the cursor's radius as one path, in one fill", () => {
    const { ctx, calls } = recorder();
    const dots = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 1000, y: 0 }, { x: 1012, y: 0 }];
    drawDotField(ctx, 1100, 20, dots, { x: 0, y: 0 }, "white");
    const fills = calls.filter(call => call.startsWith("fill"));
    // Two near dots, each with its own alpha, and one fill for both far dots at the base alpha.
    expect(fills).toHaveLength(3);
    expect(fills).toContain("fill@0.08");
    expect(calls.filter(call => call === "arc")).toHaveLength(4);
    expect(calls[0]).toBe("clear");
    expect(ctx.fillStyle).toBe("white");
  });
  test("without a cursor (reduced motion) every dot is far: one fill", () => {
    const { ctx, calls } = recorder();
    drawDotField(ctx, 100, 100, [{ x: 0, y: 0 }, { x: 12, y: 0 }], null, "white");
    expect(calls.filter(call => call.startsWith("fill"))).toEqual(["fill@0.08"]);
  });
});

describe("DotFieldLoop", () => {
  function loop(reduced = false) {
    const frames: ((now: number) => void)[] = [];
    const cancel = vi.fn();
    const draw = vi.fn();
    const field = new DotFieldLoop({ draw, reducedMotion: () => reduced, request: run => { frames.push(run); return frames.length; }, cancel });
    return { field, frames, cancel, draw };
  }
  test("runs one frame after another while running", () => {
    const { field, frames, draw } = loop();
    field.set({ running: true });
    expect(frames).toHaveLength(1);
    frames[0]!(100); frames[1]!(116);
    expect(draw).toHaveBeenCalledTimes(2);
    expect(frames).toHaveLength(3);
  });
  test("draws a cursor that moves with time", () => {
    const { field, frames, draw } = loop();
    field.set({ running: true });
    frames[0]!(1000); frames[1]!(2000);
    const [first, second] = draw.mock.calls.map(call => call[0]);
    expect(first).not.toEqual(second);
  });
  test("stops its frames when paused (hidden workspace, Overview cover, hidden window) and resumes", () => {
    const { field, frames, cancel } = loop();
    field.set({ running: true });
    field.set({ running: false });
    expect(cancel).toHaveBeenCalledWith(1);
    field.set({ running: true });
    expect(frames).toHaveLength(2);
  });
  test("reduced motion draws once without a cursor and asks for no frame", () => {
    const { field, frames, draw } = loop(true);
    field.set({ running: true });
    expect(frames).toHaveLength(0);
    expect(draw).toHaveBeenCalledWith(null);
  });
  test("a resize redraws the still frame while paused, and dispose cancels the frame", () => {
    const { field, frames, cancel, draw } = loop();
    field.set({ running: false });
    field.resized();
    expect(draw).toHaveBeenCalledTimes(1);
    field.set({ running: true });
    field.dispose();
    expect(cancel).toHaveBeenCalledWith(frames.length);
  });
});
