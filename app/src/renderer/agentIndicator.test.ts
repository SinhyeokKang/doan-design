import { describe, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { WorkItem } from "../main/workState";
import type { AgentPresence } from "./agentPresence";
import { agentNoticeView, canvasAgent, DOT_FIELD, DotFieldLoop, drawDotField, listForPresence, canvasWorkTarget, pickWork, workFrameTitle, settleStopping, siblingWork, stopFailedText, stopTurn, workFrameRect, workingCanvas } from "./agentIndicator";
import type { ConversationWork } from "../main/conversationWork";

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
    expect(canvasAgent([summary({})], target, null, [])).toEqual({ root: "/w/a", presence: working, provider: "Codex" });
  });
  test("a failed read keeps the previous presence and its provider", () => {
    const previous = canvasAgent([summary({})], target, null, []);
    expect(canvasAgent(null, target, previous, [])).toEqual(previous);
  });
  test("the turn's end clears it", () => {
    const previous = canvasAgent([summary({})], target, null, []);
    expect(canvasAgent([summary({ phase: "ended" })], target, previous, [])).toBeNull();
  });
  test("another canvas's conversation shows nothing", () => {
    expect(canvasAgent([summary({ canvas: { path: ".doan/canvases/other.html", id: "other" } })], target, null, [])).toBeNull();
  });
  test("a project conversation shows nothing", () => {
    const { canvas: _c, ...project } = summary({});
    expect(canvasAgent([project], target, null, [])).toBeNull();
  });
  test("no canvas (unlisted page, project problem) shows nothing even with a kept presence", () => {
    const previous = canvasAgent([summary({})], target, null, []);
    expect(canvasAgent([summary({})], null, previous, [])).toBeNull();
    expect(canvasAgent(null, null, previous, [])).toBeNull();
  });
  // RBR5 🔴1: worktrees of one repository share canvas ids and paths, so a kept presence must not cross roots. Opening
  // B's twin canvas while B's list is still loading or failed must not offer A's Stop.
  describe("a kept presence stays in its project", () => {
    const b = { root: "/w/b", canvas: target.canvas };
    for (const [name, state] of [["loading", "loading"], ["failed", "error"]] as const) {
      test(`A → B with B's list ${name}, matching ids: nothing from A`, () => {
        const previous = canvasAgent([summary({})], target, null, []);
        const after = canvasAgent(listForPresence(state), b, previous, []);
        expect(after).toBeNull();
        expect(agentNoticeView(after?.presence ?? null, null, false)).toBeNull();
      });
      test(`A → B with B's list ${name}, id-less canvases at the same path: nothing from A`, () => {
        const bare = { path: row.path };
        const previous = canvasAgent([summary({ canvas: bare })], { root: "/w/a", canvas: bare }, null, []);
        expect(previous?.presence?.conversationId).toBe("c1");
        expect(canvasAgent(listForPresence(state), { root: "/w/b", canvas: bare }, previous, [])).toBeNull();
      });
    }
    test("B's own read decides B; A's presence does not come back on returning to A with a failed read", () => {
      const inA = canvasAgent([summary({})], target, null, []);
      const inB = canvasAgent(listForPresence("error"), b, inA, []);
      expect(inB).toBeNull();
      expect(canvasAgent(listForPresence("error"), target, inB, [])).toBeNull();
    });
    test("within one project a moved canvas keeps its presence across a failed read (id match)", () => {
      const previous = canvasAgent([summary({})], target, null, []);
      const moved = { root: "/w/a", canvas: { path: ".doan/canvases/archive/billing.html", id: "billing" } };
      expect(canvasAgent(null, moved, previous, [])?.presence?.conversationId).toBe("c1");
    });
  });
});

// terminal-agent-activity design '표시' (canvas page): a terminal session's `doan work` on the open canvas shows the same
// indicator without Stop; an app conversation on the canvas wins. Identity is root + path (POSTMORTEM 2026-11-01).
describe("canvasAgent with terminal sessions", () => {
  const target = { root: "/w/a", canvas: { path: row.path, id: "billing" } };
  const b = { root: "/w/b", canvas: target.canvas };
  const work = (root: string, provider: WorkItem["provider"] = "claude"): WorkItem => ({ root, path: row.path, provider, session: provider ? "s1" : null, touched: 0, turn: "none:t" });
  const terminal = (root: string) => ({ root, presence: null, terminal: true });
  test("a terminal session on the canvas shows the indicator: the app notice's text, no button", () => {
    expect(canvasAgent([], target, null, [work("/w/a")])).toEqual(terminal("/w/a"));
    expect(agentNoticeView(null, null, true)).toEqual({ text: "Agent is working", status: "Agent is working", steady: false, action: null });
  });
  test("an anonymous session shows it too, and a failed or loading list does not hide it", () => {
    expect(canvasAgent([], target, null, [work("/w/a", null)])).toEqual(terminal("/w/a"));
    expect(canvasAgent(listForPresence("error"), target, null, [work("/w/a")])).toEqual(terminal("/w/a"));
    expect(canvasAgent(listForPresence("loading"), target, null, [work("/w/a")])).toEqual(terminal("/w/a"));
  });
  test("an app conversation working or waiting on the same canvas wins, with its Stop or Open", () => {
    expect(canvasAgent([summary({})], target, null, [work("/w/a")])).toEqual({ root: "/w/a", presence: working, provider: "Codex" });
    expect(canvasAgent([summary({ phase: "waiting" })], target, null, [work("/w/a")])?.presence).toEqual(waiting);
  });
  test("when the app turn ends and the terminal session remains, the indicator stays and only Stop goes", () => {
    const app = canvasAgent([summary({})], target, null, [work("/w/a")]);
    const after = canvasAgent([summary({ phase: "ended", working: false })], target, app, [work("/w/a")]);
    expect(after).toEqual(terminal("/w/a"));
    const before = agentNoticeView(app!.presence, null, false), now = agentNoticeView(after!.presence, null, true);
    expect(now?.text).toBe(before?.text);
    expect(now?.action).toBeNull();
  });
  test("a failed read keeps the app conversation's presence over a terminal session", () => {
    const app = canvasAgent([summary({})], target, null, [work("/w/a")]);
    expect(canvasAgent(null, target, app, [work("/w/a")])).toEqual(app);
  });
  test("the terminal session's end clears it", () => {
    const shown = canvasAgent([], target, null, [work("/w/a")]);
    expect(canvasAgent([], target, shown, [])).toBeNull();
  });
  test("worktrees sharing the path: the session shows only in its own root, across switches back and forth", () => {
    const items = [work("/w/a")];
    const inA = canvasAgent([], target, null, items);
    expect(inA).toEqual(terminal("/w/a"));
    const inB = canvasAgent([], b, inA, items);
    expect(inB).toBeNull();
    expect(canvasAgent([], target, inB, items)).toEqual(terminal("/w/a"));
    expect(canvasAgent([], b, null, [work("/w/b")])).toEqual(terminal("/w/b"));
  });
  test("A's app conversation, kept across B's failed read, never shows in B; B's own terminal session does", () => {
    const inA = canvasAgent([summary({})], target, null, []);
    expect(canvasAgent(listForPresence("error"), b, inA, [work("/w/a")])).toBeNull();
    expect(canvasAgent(listForPresence("error"), b, inA, [work("/w/b")])).toEqual(terminal("/w/b"));
  });
  test("another canvas's session and no canvas show nothing", () => {
    expect(canvasAgent([], target, null, [{ ...work("/w/a"), path: ".doan/canvases/other.html" }])).toBeNull();
    expect(canvasAgent([], null, null, [work("/w/a")])).toBeNull();
  });
});

// DESIGN 'Terminal work in another worktree': a terminal session on the open canvas's path in another worktree of the same
// project (the sidebar's group) is named on the board with Open; identity stays root + path (POSTMORTEM 2026-11-01).
describe("siblingWork", () => {
  const COMMON = "/repo/.git";
  const git = (main: string, branch?: string) => ({ common: COMMON, main, worktrees: ["/w/a", "/w/b", "/w/c"], ...(branch === undefined ? {} : { branch }) });
  const a: FolderEntry = { path: "/w/a", kind: "list", servedRev: 0, canvases: [row], git: git("/w/a", "main") };
  const b: FolderEntry = { path: "/w/b", kind: "list", servedRev: 0, canvases: [row], git: git("/w/a", "feat/checkout-copy") };
  const c: FolderEntry = { path: "/w/c", kind: "list", servedRev: 0, canvases: [row], git: { ...git("/w/a"), detached: "0123456789abcdef" } };
  const target = { root: "/w/a", canvas: { path: row.path, id: "billing" } };
  const work = (root: string, path = row.path): WorkItem => ({ touched: 0, turn: "none:t", root, path, provider: "claude", session: "s1" });
  test("another worktree of the same project working on the same path is named by its branch", () => {
    expect(siblingWork([work("/w/b")], target, [a, b])).toEqual({ root: "/w/b", label: "feat/checkout-copy" });
  });
  test("a worktree without a branch (detached HEAD) is named by its folder", () => {
    expect(siblingWork([work("/w/c")], target, [a, b, c])).toEqual({ root: "/w/c", label: "c" });
  });
  test("with several, the last item of the work list wins", () => {
    expect(siblingWork([work("/w/b"), work("/w/c")], target, [a, b, c])?.root).toBe("/w/c");
    expect(siblingWork([work("/w/c"), work("/w/b")], target, [a, b, c])?.root).toBe("/w/b");
  });
  test("this root's own session on the path wins: nothing here, the terminal indicator shows instead", () => {
    expect(siblingWork([work("/w/b"), work("/w/a")], target, [a, b])).toBeNull();
    expect(siblingWork([work("/w/a"), work("/w/b")], target, [a, b])).toBeNull();
  });
  test("another path, another project, or a twin project outside git shows nothing", () => {
    expect(siblingWork([work("/w/b", ".doan/canvases/other.html")], target, [a, b])).toBeNull();
    const other: FolderEntry = { ...b, path: "/x/b", git: { ...git("/x/a", "feat/x"), common: "/x/.git", worktrees: ["/x/b"] } };
    expect(siblingWork([work("/x/b")], target, [a, other])).toBeNull();
    const plain: FolderEntry = { path: "/p/b", kind: "list", servedRev: 0, canvases: [row] };
    expect(siblingWork([work("/p/b")], target, [a, plain])).toBeNull();
  });
  test("a worktree that is not a list, or has not listed the path yet, shows nothing", () => {
    for (const kind of ["loading", "uninitialized", "notFound"] as const) {
      expect(siblingWork([work("/w/b")], target, [a, { path: "/w/b", kind, lastCommon: COMMON }])).toBeNull();
    }
    expect(siblingWork([work("/w/b")], target, [a, { ...b, canvases: [] }])).toBeNull();
  });
  test("no open canvas shows nothing", () => {
    expect(siblingWork([work("/w/b")], null, [a, b])).toBeNull();
  });
});

describe("agentNoticeView", () => {
  test("nothing to show without a presence", () => {
    expect(agentNoticeView(null, null, false)).toBeNull();
  });
  test("working: the moving dot, the label and Stop", () => {
    expect(agentNoticeView(working, null, false)).toEqual({ text: "Agent is working", status: "Agent is working", steady: false, action: { kind: "stop", label: "Stop", disabled: false } });
  });
  test("after Stop: 'Stopping', unavailable but still focusable", () => {
    expect(agentNoticeView(working, "c1", false)?.action).toEqual({ kind: "stop", label: "Stopping", disabled: true });
  });
  test("a Stop pressed for another conversation does not hold this one", () => {
    expect(agentNoticeView(working, "c0", false)?.action).toEqual({ kind: "stop", label: "Stop", disabled: false });
  });
  test("waiting: a still dot and Open, named for the request; no Stop", () => {
    expect(agentNoticeView(waiting, null, false)).toEqual({ text: "Agent needs your answer", status: "Agent needs your answer", steady: true, action: { kind: "open", label: "Open", name: "Open the request" } });
    expect(agentNoticeView(waiting, "c1", false)?.action?.kind).toBe("open");
  });
});

describe("settleStopping", () => {
  test("'Stopping' holds while the same conversation still works or waits", () => {
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
  // Dogfooding #4: at 0.08→0.3 the white dots barely showed on the light board.
  test("uses the doan values: 12px grid, radius 1.5→2, alpha 0.16→0.5, a 320px cursor sweeping 5 rows at 320px/s", () => {
    expect(DOT_FIELD).toEqual({ gap: 12, baseRadius: 1.5, maxRadius: 2, baseAlpha: 0.16, maxAlpha: 0.5, radius: 320, speed: 320, rows: 5 });
  });
  test("paints every dot outside the cursor's radius as one path, in one fill", () => {
    const { ctx, calls } = recorder();
    const dots = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 1000, y: 0 }, { x: 1012, y: 0 }];
    drawDotField(ctx, 1100, 20, dots, { x: 0, y: 0 }, "white");
    const fills = calls.filter(call => call.startsWith("fill"));
    // Two near dots, each with its own alpha, and one fill for both far dots at the base alpha.
    expect(fills).toHaveLength(3);
    expect(fills).toContain("fill@0.16");
    expect(calls.filter(call => call === "arc")).toHaveLength(4);
    expect(calls[0]).toBe("clear");
    expect(ctx.fillStyle).toBe("white");
  });
  test("without a cursor (reduced motion) every dot is far: one fill", () => {
    const { ctx, calls } = recorder();
    drawDotField(ctx, 100, 100, [{ x: 0, y: 0 }, { x: 12, y: 0 }], null, "white");
    expect(calls.filter(call => call.startsWith("fill"))).toEqual(["fill@0.16"]);
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

// work-update A5 (design §1 rules 6–8, decisions 13, 15, 18): which work content the open canvas shows, the notice's
// words for it, and the frame its marker goes on. Identity is root + path (POSTMORTEM 2026-11-01).
describe("work content on the open canvas", () => {
  const target = { root: "/w/a", canvas: { path: row.path, id: "billing" } };
  const b = { root: "/w/b", canvas: target.canvas };
  const term = (patch: Partial<WorkItem> = {}): WorkItem => ({ session: "s1", provider: "claude", root: "/w/a", path: row.path, touched: 10, turn: "t1", ...patch });
  const conv = (patch: Partial<ConversationWork> = {}): ConversationWork => ({ conversationId: "p1", root: "/w/a", path: row.path, touched: 20, turnId: "u1", ...patch });

  describe("pickWork", () => {
    test("the canvas's own working conversation wins over a later terminal update", () => {
      const own = conv({ conversationId: "c1", frame: "plans", note: "Drawing Plans", touched: 5 });
      expect(pickWork(target, working, [own], [term({ touched: 50, frame: "other" })])).toEqual({
        source: "conversation:c1", key: "conversation:c1:u1", touched: 5, frame: "plans", note: "Drawing Plans", waiting: false });
    });
    test("the canvas's own conversation without content on this canvas shows no content, not the terminal's", () => {
      expect(pickWork(target, working, [conv({ conversationId: "c1", path: ".doan/canvases/other.html" })], [term({ frame: "a" })])).toBeNull();
    });
    test("waiting keeps the content, marked waiting: the marker stays and stops moving", () => {
      expect(pickWork(target, waiting, [conv({ conversationId: "c1", frame: "plans" })], [])).toMatchObject({ frame: "plans", waiting: true });
    });
    test("without an app presence, the last update wins among project conversations and terminal sessions", () => {
      expect(pickWork(target, null, [conv({ touched: 20, frame: "p" })], [term({ touched: 10, frame: "t" })])).toMatchObject({ source: "conversation:p1", frame: "p" });
      expect(pickWork(target, null, [conv({ touched: 20, frame: "p" })], [term({ touched: 30, frame: "t" })])).toEqual({
        source: "terminal:claude:s1", key: "terminal:t1", touched: 30, frame: "t", waiting: false });
    });
    test("a canvas conversation bound to another canvas that names this one counts like a project conversation (decision 13)", () => {
      expect(pickWork(target, null, [conv({ conversationId: "c9", frame: "f" })], [])).toMatchObject({ source: "conversation:c9", frame: "f" });
    });
    test("another root's work on the same path never shows here, across switches between the two roots", () => {
      const items = [term({ root: "/w/b", frame: "tb" })], convs = [conv({ root: "/w/b", frame: "cb" })];
      expect(pickWork(target, null, convs, items)).toBeNull();
      expect(pickWork(b, null, convs, items)).toMatchObject({ source: "conversation:p1", frame: "cb" });
      expect(pickWork(target, null, convs, items)).toBeNull();
      expect(pickWork(b, null, [], items)).toMatchObject({ frame: "tb" });
    });
    test("another canvas's work and no canvas show nothing", () => {
      expect(pickWork(target, null, [conv({ path: ".doan/canvases/other.html" })], [term({ path: ".doan/canvases/other.html" })])).toBeNull();
      expect(pickWork(null, null, [conv()], [term()])).toBeNull();
    });
  });

  describe("canvasAgent with conversation work", () => {
    test("a project conversation naming this canvas shows the indicator without Stop (decision 15)", () => {
      expect(canvasAgent([], target, null, [], [conv()])).toEqual({ root: "/w/a", presence: null, terminal: true });
      expect(agentNoticeView(null, null, true)?.action).toBeNull();
    });
    test("a canvas conversation bound to another canvas naming this one shows the same variant", () => {
      const elsewhere = summary({ canvas: { path: ".doan/canvases/other.html", id: "other" } });
      expect(canvasAgent([elsewhere], target, null, [], [conv({ conversationId: "c1" })])).toEqual({ root: "/w/a", presence: null, terminal: true });
    });
    test("another root's conversation work on the same path shows nothing here", () => {
      expect(canvasAgent([], target, null, [], [conv({ root: "/w/b" })])).toBeNull();
      expect(canvasAgent([], b, null, [], [conv({ root: "/w/b" })])).toEqual({ root: "/w/b", presence: null, terminal: true });
    });
  });

  describe("agentNoticeView with content", () => {
    test("the note is the text; with a frame too the status adds the frame's title", () => {
      expect(agentNoticeView(null, null, true, { note: "Drawing the empty state", frame: "plans-empty", title: "Plans · empty" })).toEqual({
        text: "Drawing the empty state", status: "Drawing the empty state — Plans · empty", steady: false, action: null });
      expect(agentNoticeView(null, null, true, { note: "Drawing the empty state" })).toMatchObject({ text: "Drawing the empty state", status: "Drawing the empty state" });
    });
    test("a frame without a note: 'Working on <title>', else its id before a layout names it", () => {
      expect(agentNoticeView(null, null, true, { frame: "plans", title: "Plans" })).toMatchObject({ text: "Working on Plans", status: "Working on Plans" });
      expect(agentNoticeView(null, null, true, { frame: "plans" })).toMatchObject({ text: "Working on plans", status: "Working on plans" });
    });
    test("no frame and no note keeps 'Agent is working'", () => {
      expect(agentNoticeView(null, null, true, {})).toMatchObject({ text: "Agent is working", status: "Agent is working" });
    });
    test("the canvas's own conversation keeps Stop with the content's words", () => {
      expect(agentNoticeView(working, null, false, { note: "Drawing" })).toEqual({ text: "Drawing", status: "Drawing", steady: false, action: { kind: "stop", label: "Stop", disabled: false } });
    });
    test("waiting: 'Agent needs your answer' over any content, with a still dot", () => {
      expect(agentNoticeView(waiting, null, false, { note: "Drawing", frame: "plans", title: "Plans" })).toEqual({
        text: "Agent needs your answer", status: "Agent needs your answer", steady: true, action: { kind: "open", label: "Open", name: "Open the request" } });
    });
  });

  describe("workFrameRect", () => {
    const frames = [{ id: "a", title: "A", x: 0, y: 0, width: 10, height: 10 }, { id: "b", x: 0, y: 20, width: 10, height: 10 }, { id: "a", x: 0, y: 40, width: 10, height: 10 }];
    test("the frame with the id; with duplicate ids the first, as frame jumps take it", () => {
      expect(workFrameRect({ frames }, "b")).toEqual(frames[1]);
      expect(workFrameRect({ frames }, "a")).toEqual(frames[0]);
    });
    test("an id the document does not have, an empty layout, no layout (a canvas without doan:width) or no frame: none", () => {
      expect(workFrameRect({ frames }, "missing")).toBeNull();
      expect(workFrameRect({ frames: [] }, "a")).toBeNull();
      expect(workFrameRect(null, "a")).toBeNull();
      expect(workFrameRect({ frames }, undefined)).toBeNull();
    });
    // R1: a reload's first layout can carry every frame as 0 × 0 before the document is measured; no marker goes there.
    test("a frame with no size is not placed", () => {
      expect(workFrameRect({ frames: [{ id: "a", x: 0, y: 0, width: 0, height: 0 }] }, "a")).toBeNull();
      expect(workFrameRect({ frames: [{ id: "a", x: 0, y: 0, width: 10, height: 0 }] }, "a")).toBeNull();
    });
  });
});

// work-update R2: what App hands the controller for the marker and following, from the notice's own pick.
describe("canvasWorkTarget", () => {
  const target = { root: "/w/a", canvas: { path: row.path, id: "billing" } };
  const term = (patch: Partial<WorkItem> = {}): WorkItem => ({ session: "s1", provider: "claude", root: "/w/a", path: row.path, touched: 10, turn: "claude:t1", ...patch });
  const conv = (patch: Partial<ConversationWork> = {}): ConversationWork => ({ conversationId: "p1", root: "/w/a", path: row.path, touched: 20, turnId: "u1", ...patch });
  test("the open canvas, the picked work and every work turn on this root and path", () => {
    const conversations = [conv({ frame: "plans" }), conv({ conversationId: "p2", root: "/w/b" })], terminal = [term(), term({ path: ".doan/canvases/other.html", turn: "claude:t9" })];
    expect(canvasWorkTarget(target, pickWork(target, null, conversations, terminal), conversations, terminal)).toEqual({
      root: "/w/a", path: row.path, work: { source: "conversation:p1", key: "conversation:p1:u1", frame: "plans", waiting: false },
      keys: ["conversation:p1:u1", "terminal:claude:t1"] });
  });
  test("a canvas without work still names it, so the controller sees the canvas change; no canvas is null", () => {
    expect(canvasWorkTarget(target, null, [], [])).toEqual({ root: "/w/a", path: row.path, work: null, keys: [] });
    expect(canvasWorkTarget(null, null, [conv()], [term()])).toBeNull();
  });
  test("waiting carries to the controller", () => {
    const own = [conv({ conversationId: "c1", frame: "plans" })];
    expect(canvasWorkTarget(target, pickWork(target, waiting, own, []), own, [])?.work).toMatchObject({ frame: "plans", waiting: true });
  });
});

// V3 review 🟡6: the frame title kept across a reload belongs to its root, canvas path and work turn.
describe("workFrameTitle", () => {
  const a = { root: "/w/a", canvas: { path: ".doan/canvases/a.html" } };
  const picked = { source: "terminal:claude:s1", key: "terminal:claude:t1", touched: 1, frame: "plans", waiting: false };
  const frames = [{ id: "plans", title: "Plans A", x: 0, y: 0, width: 1, height: 1 }];
  test("a found title is used and kept while the same turn's frame has no layout", () => {
    const first = workFrameTitle(null, a, picked, frames);
    expect(first.title).toBe("Plans A");
    expect(workFrameTitle(first.cache, a, picked, null).title).toBe("Plans A");
    expect(workFrameTitle(first.cache, a, picked, []).title).toBe("Plans A");
  });
  test("another canvas path, another root or a new turn does not reuse it", () => {
    const { cache } = workFrameTitle(null, a, picked, frames);
    expect(workFrameTitle(cache, { root: "/w/a", canvas: { path: ".doan/canvases/b.html" } }, picked, null).title).toBeUndefined();
    expect(workFrameTitle(cache, { root: "/w/b", canvas: a.canvas }, picked, null).title).toBeUndefined();
    expect(workFrameTitle(cache, a, { ...picked, key: "terminal:claude:t2" }, null).title).toBeUndefined();
  });
  test("an update without a frame, or no work, clears it", () => {
    const { cache } = workFrameTitle(null, a, picked, frames);
    const { frame: _f, ...plain } = picked;
    const cleared = workFrameTitle(cache, a, plain, frames);
    expect(cleared).toEqual({ title: undefined, cache: null });
    expect(workFrameTitle(cache, a, null, frames).cache).toBeNull();
  });
  test("a frame without data-doan-title is named by its id", () => {
    expect(workFrameTitle(null, a, picked, [{ id: "plans", x: 0, y: 0, width: 1, height: 1 }]).title).toBe("plans");
  });
});
