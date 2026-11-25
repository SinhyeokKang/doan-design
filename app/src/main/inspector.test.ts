import { EventEmitter } from "node:events";
import { afterEach, expect, test, vi } from "vitest";
import { DocumentBindings } from "./document/bindings";
import { inspectRows, type InspectInput } from "./inspect";
import fixture from "./inspect.fixture.json";
import { MAX_SELECTOR } from "../renderer/canvasMessage";
import { ancestorLabel as exportedViewerLabel } from "./cssomMatched";
import { ancestorLabel, createInspector, parseInspectRequest, type InspectRequest } from "./inspector";
import { createWindowDebugger, type DebuggerLike } from "./windowDebugger";

const CANVAS = { root: "/repo", path: ".doan/canvases/a.html" };
const URL_A = "http://127.0.0.1:4000/t/tok/k1/.doan/canvases/a.html";
const OTHER = { root: "/repo", path: ".doan/canvases/b.html" };
const URL_B = "http://127.0.0.1:4000/t/tok/k1/.doan/canvases/b.html";
const c3 = (fixture as unknown as Record<string, InspectInput>)["#c3"];
if (!c3) throw new Error("no fixture");

test("parseInspectRequest accepts {selector, canvas: {root, path}, seq} with a 1 to 1,000 unit selector", () => {
  expect(parseInspectRequest({ selector: "#a", canvas: CANVAS, seq: 3 })).toEqual({ selector: "#a", canvas: CANVAS, seq: 3 });
  expect(parseInspectRequest({ selector: "a".repeat(1000), canvas: CANVAS, seq: 0 })).toEqual({ selector: "a".repeat(1000), canvas: CANVAS, seq: 0 });
  const bad: unknown[] = [
    null, undefined, "#a", [], {},
    // The old `{selector}` shape.
    { selector: "#a" },
    { selector: "", canvas: CANVAS, seq: 1 },
    { selector: 3, canvas: CANVAS, seq: 1 },
    { selector: "a".repeat(1001), canvas: CANVAS, seq: 1 },
    { selector: "#a", canvas: CANVAS, seq: 1, extra: 1 },
  ];
  for (const value of bad) expect(parseInspectRequest(value), JSON.stringify(value)).toBeNull();
  // Astral characters count two units each.
  expect(parseInspectRequest({ selector: "😀".repeat(501), canvas: CANVAS, seq: 1 })).toBeNull();
});

test("parseInspectRequest refuses a bad canvas or seq", () => {
  const canvases: unknown[] = [null, "/repo", [], {}, { root: "/repo" }, { path: CANVAS.path }, { root: "", path: CANVAS.path }, { root: "/repo", path: "" }, { root: 1, path: CANVAS.path }, { ...CANVAS, id: "x" }];
  for (const canvas of canvases) expect(parseInspectRequest({ selector: "#a", canvas, seq: 1 }), JSON.stringify(canvas)).toBeNull();
  for (const seq of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1", null, undefined, 2 ** 53]) {
    expect(parseInspectRequest({ selector: "#a", canvas: CANVAS, seq }), String(seq)).toBeNull();
  }
});

// A fake `webContents.debugger`: answers by method and session, and records calls.
class FakeDebugger extends EventEmitter implements DebuggerLike {
  attached = false;
  attachError: Error | null = null;
  calls: [string, unknown, string | undefined][] = [];
  nodeId = 7;
  hang = false;
  styles: InspectInput | undefined = c3;
  tree: object = { nodeId: 1, nodeType: 9, localName: "", children: [{ nodeId: 2, nodeType: 1, localName: "html", children: [{ nodeId: 3, nodeType: 1, localName: "body", children: [{ nodeId: 7, nodeType: 1, localName: "div" }] }] }] };
  fail: string | null = null;
  // Runs inside a command, to move the window's state while a read is in flight.
  during: { method: string; run: () => void } | null = null;
  // Commands of these methods wait for `release()` before the session handles them.
  holdOn = new Set<string>();
  held: { method: string; go: () => void }[] = [];
  // The session's DOM agent: reads fail while it is off, as CDP's do after `DOM.disable`.
  domOn = false;
  attach(): void {
    if (this.attachError) throw this.attachError;
    this.attached = true;
  }
  isAttached(): boolean {
    return this.attached;
  }
  async sendCommand(method: string, params?: object, sessionId?: string): Promise<unknown> {
    this.calls.push([method, params, sessionId]);
    if (this.during?.method === method) {
      const { run } = this.during;
      this.during = null;
      run();
    }
    if (this.hang && method === "CSS.getMatchedStylesForNode") return new Promise(() => undefined);
    if (this.holdOn.has(method)) await new Promise<void>((go) => this.held.push({ method, go }));
    if (method === this.fail) throw new Error(`${method} failed`);
    if (method === "DOM.enable") this.domOn = true;
    if (method === "DOM.disable") this.domOn = false;
    if (/^(DOM\.(getDocument|querySelector)|CSS\.get)/.test(method) && !this.domOn) throw new Error(`${method}: DOM agent is not enabled`);
    switch (method) {
      case "Page.getFrameTree":
        return { frameTree: { frame: { id: "MAIN", url: "file:///app/index.html" } } };
      case "DOM.getDocument":
        return { root: this.tree };
      case "DOM.querySelector":
        return { nodeId: this.nodeId };
      case "CSS.getMatchedStylesForNode":
        return this.styles?.matched;
      case "CSS.getComputedStyleForNode":
        return { computedStyle: this.styles?.computed };
      default:
        return {};
    }
  }
  release(method: string): void {
    const index = this.held.findIndex((entry) => entry.method === method);
    if (index < 0) throw new Error(`no held ${method}`);
    this.held.splice(index, 1)[0]!.go();
  }
  sent(method: string): [string, unknown, string | undefined][] {
    return this.calls.filter(([name]) => name === method);
  }
}

// The window shows `url` from `root`/`path` in FRAME, committed by `session` (the same events the read-state proof uses).
function show(dbg: FakeDebugger, docs: DocumentBindings, session: string, loader: string, url = URL_A, path = CANVAS.path, frame = "FRAME") {
  commitOnly(dbg, docs, session, loader, url, path, frame);
  dbg.emit("message", {}, "Network.loadingFinished", { requestId: loader }, session);
}

// The frame has committed the document, but its load has not finished, so there is no proof yet.
function commitOnly(dbg: FakeDebugger, docs: DocumentBindings, session: string, loader: string, url: string, path: string, frame: string) {
  dbg.emit("message", {}, "Target.attachedToTarget", { sessionId: session, targetInfo: { type: "iframe", url: "" } }, undefined);
  docs.response({ marker: loader, root: CANVAS.root, path, hash: loader, complete: true, stable: true });
  dbg.emit("message", {}, "Network.responseReceived", { type: "Document", requestId: loader, frameId: frame, loaderId: loader, response: { headers: { "X-Doan-Response": loader } } });
  dbg.emit("message", {}, "Page.frameNavigated", { frame: { id: frame, parentId: "MAIN", loaderId: loader, url } }, session);
}

function setup(dbg = new FakeDebugger()) {
  const docs = new DocumentBindings();
  const window = createWindowDebugger(dbg, docs);
  const urls = new Map([[CANVAS.path, URL_A], [OTHER.path, URL_B]]);
  const inspector = createInspector({ debugger: dbg, window, documents: docs, canvasUrl: (canvas) => (canvas.root === CANVAS.root ? urls.get(canvas.path) ?? null : null) });
  return { dbg, docs, inspector };
}

const request = (selector = "#c3", canvas = CANVAS): InspectRequest => ({ selector, canvas, seq: 1 });

afterEach(() => { vi.useRealTimers(); });

test("inspects the shown canvas through its frame's session and returns the rows", async () => {
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "S1", "loader");
  expect(await inspector.inspect(request())).toEqual({ ok: true, rows: inspectRows({ ...c3, ancestors: ["body", "html"] }) });
  expect(dbg.sent("DOM.querySelector")[0]).toEqual(["DOM.querySelector", { nodeId: 1, selector: "#c3" }, "S1"]);
  expect(dbg.sent("CSS.getMatchedStylesForNode")[0]?.[2]).toBe("S1");
});

test("DOM and CSS are on only during a request", async () => {
  // Left on, a canvas that mutates its DOM sends thousands of events a second to main.
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "S1", "loader");
  await inspector.inspect(request());
  dbg.nodeId = 0;
  await inspector.inspect(request("#none"));
  dbg.nodeId = 7;
  dbg.fail = "CSS.getComputedStyleForNode";
  await inspector.inspect(request());
  const domain = dbg.calls.map(([method]) => method).filter((m) => /^(DOM|CSS)\.(enable|disable)$/.test(m));
  expect(domain).toEqual(Array.from({ length: 3 }, () => ["DOM.enable", "CSS.enable", "CSS.disable", "DOM.disable"]).flat());
  const last = dbg.calls.map(([method]) => method);
  expect(last.lastIndexOf("CSS.getMatchedStylesForNode")).toBeLessThan(last.lastIndexOf("CSS.disable"));
  // Only the canvas session is enabled; the window's own session never is.
  expect(dbg.calls.filter(([m]) => /^(DOM|CSS)\./.test(m)).every(([, , session]) => session === "S1")).toBe(true);
});

test("overlapping requests run one after another", async () => {
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "S1", "loader");
  dbg.holdOn.add("DOM.getDocument");
  const first = inspector.inspect(request());
  await vi.waitFor(() => expect(dbg.held).toHaveLength(1));
  dbg.holdOn.clear();
  const second = inspector.inspect(request());
  dbg.release("DOM.getDocument");
  expect(await first).toMatchObject({ ok: true });
  expect(await second).toMatchObject({ ok: true });
  const methods = dbg.calls.map(([method]) => method);
  expect(methods.filter((m) => m === "DOM.disable")).toHaveLength(2);
  // The second request enables only after the first has disabled.
  expect(methods.indexOf("DOM.disable")).toBeLessThan(methods.lastIndexOf("DOM.enable"));
});

test("not-shown only while another canvas is confirmed shown, without any DOM command", async () => {
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "S1", "loader");
  // Another listed canvas, and one that is not listed.
  expect(await inspector.inspect(request("#c3", OTHER))).toEqual({ ok: false, reason: "not-shown" });
  expect(await inspector.inspect(request("#c3", { root: "/elsewhere", path: CANVAS.path }))).toEqual({ ok: false, reason: "not-shown" });
  // A row whose URL matches but whose document came from another root.
  const elsewhere = createInspector({ debugger: dbg, window: { mainFrame: () => Promise.resolve("MAIN"), sessionOf: () => "S1" }, documents: docs, canvasUrl: () => URL_A });
  expect(await elsewhere.inspect(request("#c3", { root: "/elsewhere", path: CANVAS.path }))).toEqual({ ok: false, reason: "not-shown" });
  expect(dbg.sent("DOM.enable")).toEqual([]);
});

// The renderer asks again on a not-shown only once a new document's selection settles; a missing proof for the canvas
// it shows has no such moment, so main waits for the proof within the budget and answers unavailable (Retry) without it.
test("with no proof yet, waits within the budget for the canvas's document and reads it", async () => {
  vi.useFakeTimers();
  const { dbg, docs, inspector } = setup();
  await vi.advanceTimersByTimeAsync(0);
  const pending = inspector.inspect(request());
  await vi.advanceTimersByTimeAsync(1500);
  expect(dbg.sent("DOM.enable")).toEqual([]);
  show(dbg, docs, "S1", "loader");
  await vi.advanceTimersByTimeAsync(0);
  expect(await pending).toMatchObject({ ok: true });
  // A reload that started: the proof comes back when it finishes.
  dbg.emit("message", {}, "Page.frameStartedNavigating", { frameId: "FRAME", loaderId: "next" }, "S1");
  const reloading = inspector.inspect(request());
  await vi.advanceTimersByTimeAsync(100);
  show(dbg, docs, "S1", "next");
  await vi.advanceTimersByTimeAsync(0);
  expect(await reloading).toMatchObject({ ok: true });
});

// Right after a switch the new canvas's iframe can commit before the previous one detaches. The previous canvas is
// then proven shown, but the requested one is on its way, so main waits for its proof instead of answering not-shown.
test("waits while a frame with the requested URL is committed beside another canvas's proven frame, and reads it", async () => {
  vi.useFakeTimers();
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "SB", "lb", URL_B, OTHER.path, "FRAME_B");
  commitOnly(dbg, docs, "SA", "la", URL_A, CANVAS.path, "FRAME_A");
  const pending = inspector.inspect(request());
  let settled = false;
  void pending.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(100);
  expect(settled).toBe(false);
  expect(dbg.sent("DOM.enable")).toEqual([]);
  dbg.emit("message", {}, "Network.loadingFinished", { requestId: "la" }, "SA");
  dbg.emit("message", {}, "Page.frameDetached", { frameId: "FRAME_B", reason: "remove" }, "SB");
  await vi.advanceTimersByTimeAsync(0);
  expect(await pending).toMatchObject({ ok: true });
  expect(dbg.sent("DOM.querySelector")[0]?.[2]).toBe("SA");
});

test("while waiting beside another canvas's proven frame, not-shown once the requested URL's frame is gone, unavailable at the budget's end", async () => {
  vi.useFakeTimers();
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "SB", "lb", URL_B, OTHER.path, "FRAME_B");
  commitOnly(dbg, docs, "SA", "la", URL_A, CANVAS.path, "FRAME_A");
  const gone = inspector.inspect(request());
  await vi.advanceTimersByTimeAsync(100);
  dbg.emit("message", {}, "Page.frameDetached", { frameId: "FRAME_A", reason: "remove" }, "SA");
  await vi.advanceTimersByTimeAsync(0);
  expect(await gone).toEqual({ ok: false, reason: "not-shown" });
  // A frame that commits the requested URL but never proves it runs into the budget.
  commitOnly(dbg, docs, "SA2", "la2", URL_A, CANVAS.path, "FRAME_A2");
  const stuck = inspector.inspect(request());
  let settled = false;
  void stuck.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(1999);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await stuck).toEqual({ ok: false, reason: "unavailable" });
  expect(dbg.sent("DOM.enable")).toEqual([]);
});

test("with no proof by the end of the budget, answers unavailable and stops waiting", async () => {
  vi.useFakeTimers();
  const { dbg, docs, inspector } = setup();
  const pending = inspector.inspect(request());
  let settled = false;
  void pending.then(() => { settled = true; });
  // An unrelated change is judged again and keeps waiting.
  docs.response({ marker: "other", root: CANVAS.root, path: CANVAS.path, hash: "h", complete: true, stable: true });
  await vi.advanceTimersByTimeAsync(1999);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toEqual({ ok: false, reason: "unavailable" });
  expect(dbg.sent("DOM.enable")).toEqual([]);
  // Every listener the wait added is gone.
  const listeners = (docs as unknown as { listeners: Set<unknown> }).listeners;
  expect(listeners.size).toBe(0);
});

test("a document replaced during the read is not-shown, not its rows or a failure", async () => {
  for (const at of ["DOM.querySelector", "CSS.getComputedStyleForNode"]) {
    const { dbg, docs, inspector } = setup();
    show(dbg, docs, "S1", "loader");
    dbg.during = { method: at, run: () => dbg.emit("message", {}, "Page.frameStartedNavigating", { frameId: "FRAME", loaderId: "next" }, "S1") };
    expect(await inspector.inspect(request()), at).toEqual({ ok: false, reason: "not-shown" });
  }
  // The same holds when the command fails because the document went away.
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "S1", "loader");
  dbg.fail = "CSS.getMatchedStylesForNode";
  dbg.during = { method: "DOM.getDocument", run: () => show(dbg, docs, "S2", "replacement") };
  expect(await inspector.inspect(request())).toEqual({ ok: false, reason: "not-shown" });
});

test("commands go to the frame's current owner after an OOPIF swap, never the former session", async () => {
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "OLD", "loader");
  dbg.emit("message", {}, "Page.frameDetached", { frameId: "FRAME", reason: "swap" }, "OLD");
  dbg.emit("message", {}, "Target.attachedToTarget", { sessionId: "NEW", targetInfo: { type: "iframe", url: "" } }, undefined);
  dbg.emit("message", {}, "Page.frameNavigated", { frame: { id: "FRAME", parentId: "MAIN", loaderId: "loader", url: URL_A } }, "NEW");
  expect(await inspector.inspect(request())).toMatchObject({ ok: true });
  dbg.emit("message", {}, "Target.detachedFromTarget", { sessionId: "OLD" }, undefined);
  expect(await inspector.inspect(request())).toMatchObject({ ok: true });
  expect(dbg.sent("DOM.querySelector").map(([, , session]) => session)).toEqual(["NEW", "NEW"]);
});

test("a selector with no node in the shown document is not-found", async () => {
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "S1", "loader");
  dbg.nodeId = 0;
  expect(await inspector.inspect(request("#none"))).toEqual({ ok: false, reason: "not-found" });
});

test("fails closed as unavailable: a failing command, an attach error", async () => {
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "S1", "loader");
  dbg.fail = "DOM.querySelector";
  expect(await inspector.inspect(request())).toEqual({ ok: false, reason: "unavailable" });
  const broken = new FakeDebugger();
  broken.attachError = new Error("Another debugger is already attached");
  const refused = setup(broken);
  expect(await refused.inspector.inspect(request())).toEqual({ ok: false, reason: "unavailable" });
});

test("a failed attach is unavailable and the next request attaches again", async () => {
  const dbg = new FakeDebugger();
  dbg.attachError = new Error("Another debugger is already attached");
  const { docs, inspector } = setup(dbg);
  expect(await inspector.inspect(request())).toEqual({ ok: false, reason: "unavailable" });
  expect(dbg.sent("Target.setAutoAttach")).toHaveLength(0);
  dbg.attachError = null;
  // Attached; the document proven during the wait is read.
  const pending = inspector.inspect(request());
  await vi.waitFor(() => expect(dbg.sent("Target.setAutoAttach")).toHaveLength(1));
  show(dbg, docs, "S1", "loader");
  expect(await pending).toMatchObject({ ok: true });
});

test("re-attaches on the next request after a detach, answers unavailable without a proof, and reads through the new session", async () => {
  vi.useFakeTimers();
  const { dbg, docs, inspector } = setup();
  await vi.advanceTimersByTimeAsync(0);
  expect(dbg.sent("Target.setAutoAttach")).toHaveLength(1);
  show(dbg, docs, "S1", "loader");
  expect(await inspector.inspect(request())).toMatchObject({ ok: true });
  dbg.attached = false;
  dbg.emit("detach", {}, "target closed");
  // The detach forgot the document proof and the session, and the committed canvas does not commit again: a Retry,
  // not a wait for a new selection that never comes.
  const lost = inspector.inspect(request());
  await vi.advanceTimersByTimeAsync(2000);
  expect(await lost).toEqual({ ok: false, reason: "unavailable" });
  expect(dbg.attached).toBe(true);
  expect(dbg.sent("Target.setAutoAttach")).toHaveLength(2);
  show(dbg, docs, "S2", "again");
  expect(await inspector.inspect(request())).toMatchObject({ ok: true });
  expect(dbg.sent("DOM.querySelector").map(([, , session]) => session)).toEqual(["S1", "S2"]);
});

test("a shown frame with no owning session is unavailable", async () => {
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "S1", "loader");
  const orphan = createInspector({ debugger: dbg, window: { mainFrame: () => Promise.resolve("MAIN"), sessionOf: () => null }, documents: docs, canvasUrl: () => URL_A });
  expect(await orphan.inspect(request())).toEqual({ ok: false, reason: "unavailable" });
  expect(dbg.sent("DOM.enable")).toEqual([]);
  expect(await inspector.inspect(request())).toMatchObject({ ok: true });
});

test("gives up as unavailable after 2 seconds, and the next request runs", async () => {
  vi.useFakeTimers();
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "S1", "loader");
  dbg.hang = true;
  const result = inspector.inspect(request());
  await vi.advanceTimersByTimeAsync(1999);
  let settled = false;
  void result.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toEqual({ ok: false, reason: "unavailable" });
  dbg.hang = false;
  const next = inspector.inspect(request());
  await vi.advanceTimersByTimeAsync(0);
  expect(await next).toMatchObject({ ok: true });
});

test("a queued request that a newer one overtook runs no command and answers unavailable", async () => {
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "S1", "loader");
  dbg.holdOn.add("CSS.getMatchedStylesForNode");
  const first = inspector.inspect({ ...request(), seq: 1 });
  await vi.waitFor(() => expect(dbg.held).toHaveLength(1));
  const second = inspector.inspect({ ...request(), seq: 2 });
  const third = inspector.inspect({ ...request(), seq: 3 });
  dbg.holdOn.clear();
  dbg.release("CSS.getMatchedStylesForNode");
  expect(await first).toMatchObject({ ok: true });
  expect(await second).toEqual({ ok: false, reason: "unavailable" });
  expect(await third).toMatchObject({ ok: true });
  expect(dbg.sent("DOM.enable")).toHaveLength(2);
});

test("a timed-out read that answers late leaves DOM and CSS on for the read that started after it", async () => {
  vi.useFakeTimers();
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "S1", "loader");
  dbg.holdOn.add("CSS.getMatchedStylesForNode");
  const first = inspector.inspect(request());
  await vi.advanceTimersByTimeAsync(2000);
  expect(await first).toEqual({ ok: false, reason: "unavailable" });
  dbg.holdOn = new Set(["DOM.querySelector"]);
  const second = inspector.inspect(request());
  await vi.advanceTimersByTimeAsync(0);
  expect(dbg.held.map((entry) => entry.method)).toEqual(["CSS.getMatchedStylesForNode", "DOM.querySelector"]);
  // The first read's command answers while the second is mid-read.
  dbg.release("CSS.getMatchedStylesForNode");
  await vi.advanceTimersByTimeAsync(0);
  dbg.release("DOM.querySelector");
  await vi.advanceTimersByTimeAsync(0);
  expect(await second).toMatchObject({ ok: true });
  const methods = dbg.calls.map(([method]) => method).filter((m) => /^(DOM|CSS)\.(enable|disable)$/.test(m));
  expect(methods).toEqual(["DOM.enable", "CSS.enable", "DOM.enable", "CSS.enable", "CSS.disable", "DOM.disable"]);
});

// The late cleanup awaits CSS.disable; a read that starts during that wait needs DOM on, so DOM.disable is checked again.
test("a timed-out read's late cleanup leaves DOM on for a read that started while its CSS.disable was in flight", async () => {
  vi.useFakeTimers();
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "S1", "loader");
  dbg.holdOn.add("CSS.getMatchedStylesForNode");
  const first = inspector.inspect(request());
  await vi.advanceTimersByTimeAsync(2000);
  expect(await first).toEqual({ ok: false, reason: "unavailable" });
  dbg.holdOn = new Set(["CSS.disable"]);
  dbg.release("CSS.getMatchedStylesForNode");
  await vi.advanceTimersByTimeAsync(0);
  expect(dbg.held.map((entry) => entry.method)).toEqual(["CSS.disable"]);
  dbg.holdOn = new Set(["DOM.querySelector"]);
  const second = inspector.inspect(request());
  await vi.advanceTimersByTimeAsync(0);
  expect(dbg.held.map((entry) => entry.method)).toEqual(["CSS.disable", "DOM.querySelector"]);
  dbg.holdOn.clear();
  // The first read's CSS.disable answers while the second is mid-read.
  dbg.release("CSS.disable");
  await vi.advanceTimersByTimeAsync(0);
  dbg.release("DOM.querySelector");
  await vi.advanceTimersByTimeAsync(0);
  expect(await second).toMatchObject({ ok: true });
  const methods = dbg.calls.map(([method]) => method).filter((m) => /^(DOM|CSS)\.(enable|disable)$/.test(m));
  expect(methods).toEqual(["DOM.enable", "CSS.enable", "CSS.disable", "DOM.enable", "CSS.enable", "CSS.disable", "DOM.disable"]);
});

test("a timed-out read sends no further read once its budget is spent, and with no later read turns DOM and CSS off", async () => {
  vi.useFakeTimers();
  const { dbg, docs, inspector } = setup();
  show(dbg, docs, "S1", "loader");
  dbg.holdOn.add("DOM.getDocument");
  const first = inspector.inspect(request());
  await vi.advanceTimersByTimeAsync(2000);
  expect(await first).toEqual({ ok: false, reason: "unavailable" });
  dbg.release("DOM.getDocument");
  await vi.advanceTimersByTimeAsync(0);
  expect(dbg.sent("DOM.querySelector")).toHaveLength(0);
  expect(dbg.calls.map(([method]) => method).slice(-2)).toEqual(["CSS.disable", "DOM.disable"]);
});

test("inheritedFrom names the ancestor from the document tree", async () => {
  const c4 = (fixture as unknown as Record<string, InspectInput>)["#c4"];
  const { dbg, docs, inspector } = setup();
  dbg.styles = c4;
  // html > body > div.inh-parent > p > span#c4
  const node = (nodeId: number, localName: string, children: object[] = []) => ({ nodeId, nodeType: 1, localName, children });
  dbg.tree = { nodeId: 1, nodeType: 9, localName: "", children: [node(2, "html", [node(3, "body", [node(4, "div", [node(5, "p", [node(7, "span")])])])])] };
  show(dbg, docs, "S1", "loader");
  const result = await inspector.inspect(request("#c4"));
  if (!result.ok) throw new Error(result.reason);
  expect(result.rows.find((r) => r.label === "Text")).toMatchObject({ token: "--muted", inheritedFrom: "div" });
  expect(dbg.sent("DOM.getDocument")[0]?.[1]).toEqual({ depth: -1 });
});

// The ancestor is named as the canvas's own path labels name it: a frame by its title, else its id; an element by its
// data-doan-id; anything else by its tag. So the tooltip says "Inherited from Payment", not "Inherited from section".
test("inheritedFrom names a frame by its title or id and an element by its data-doan-id", async () => {
  const c4 = (fixture as unknown as Record<string, InspectInput>)["#c4"];
  const node = (nodeId: number, localName: string, attributes: string[], children: object[] = []) => ({ nodeId, nodeType: 1, localName, attributes, children });
  const named = async (parent: { localName: string; attributes: string[] }) => {
    const { dbg, docs, inspector } = setup();
    dbg.styles = c4;
    // html > body > (frame section) > div(parent under test) > p > span#c4; the fixture's inherited value is two up.
    dbg.tree = { nodeId: 1, nodeType: 9, localName: "", children: [node(2, "html", [], [node(3, "body", [], [node(4, parent.localName, parent.attributes, [node(5, "p", [], [node(7, "span", ["id", "c4"])])])])])] };
    show(dbg, docs, "S1", "loader");
    const result = await inspector.inspect(request("#c4"));
    if (!result.ok) throw new Error(result.reason);
    return result.rows.find((r) => r.label === "Text")?.inheritedFrom;
  };
  expect(await named({ localName: "section", attributes: ["class", "f", "data-doan-frame", "payment", "data-doan-title", " Payment "] })).toBe("Payment");
  expect(await named({ localName: "section", attributes: ["data-doan-frame", "payment", "data-doan-title", "  "] })).toBe("payment");
  expect(await named({ localName: "div", attributes: ["data-doan-id", "order-total", "data-doan-title", "ignored"] })).toBe("order-total");
  expect(await named({ localName: "div", attributes: ["class", "x"] })).toBe("div");
});

test("the selector cap is the canvas messages' cap", () => {
  const request = (length: number) => parseInspectRequest({ selector: "a".repeat(length), canvas: CANVAS, seq: 0 });
  expect(request(MAX_SELECTOR)).not.toBeNull();
  expect(request(MAX_SELECTOR + 1)).toBeNull();
});

test.each([
  ["section", { "data-doan-frame": "payment", "data-doan-title": " Payment " }],
  ["section", { "data-doan-frame": "payment", "data-doan-title": "  " }],
  ["section", { "data-doan-frame": "payment" }],
  ["section", { "data-doan-frame": "" }],
  ["div", { "data-doan-id": "order-total", "data-doan-title": "ignored" }],
  ["div", { "data-doan-id": "" }],
  ["div", {}],
] as [string, Record<string, string>][])("the app and the exported viewer name an ancestor <%s %o> alike", (localName, attributes) => {
  const element = { localName, getAttribute: (name: string) => attributes[name] ?? null } as unknown as Element;
  expect(ancestorLabel({ localName, attributes: Object.entries(attributes).flat() })).toBe(exportedViewerLabel(element));
});
