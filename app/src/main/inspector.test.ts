import { EventEmitter } from "node:events";
import { afterEach, expect, test, vi } from "vitest";
import { inspectRows, type InspectInput } from "./inspect";
import fixture from "./inspect.fixture.json";
import { createInspector, parseInspectRequest, type DebuggerLike } from "./inspector";

const BASE = "http://127.0.0.1:4000/t/tok/";
const CANVAS = `${BASE}k1/.doan/canvases/a.html`;
const c3 = (fixture as unknown as Record<string, InspectInput>)["#c3"];
if (!c3) throw new Error("no fixture");

interface Frame { id: string; parentId?: string; url: string }

// A fake `webContents.debugger`: answers by method and session, and records calls.
class FakeDebugger extends EventEmitter implements DebuggerLike {
  attached = false;
  attachError: Error | null = null;
  calls: [string, unknown, string | undefined][] = [];
  frames = new Map<string | undefined, Frame>([[undefined, { id: "MAIN", url: "file:///app/index.html" }]]);
  nodeId = 7;
  hang = false;
  styles: InspectInput | undefined = c3;
  tree: object = { nodeId: 1, nodeType: 9, localName: "", children: [{ nodeId: 2, nodeType: 1, localName: "html", children: [{ nodeId: 3, nodeType: 1, localName: "body", children: [{ nodeId: 7, nodeType: 1, localName: "div" }] }] }] };
  fail: string | null = null;
  attach(): void {
    if (this.attachError) throw this.attachError;
    this.attached = true;
  }
  isAttached(): boolean {
    return this.attached;
  }
  async sendCommand(method: string, params?: object, sessionId?: string): Promise<unknown> {
    this.calls.push([method, params, sessionId]);
    if (this.hang && method === "CSS.getMatchedStylesForNode") return new Promise(() => undefined);
    if (method === this.fail) throw new Error(`${method} failed`);
    switch (method) {
      case "Page.getFrameTree": {
        const frame = this.frames.get(sessionId);
        if (!frame) throw new Error("No target with given id");
        return { frameTree: { frame } };
      }
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
  target(sessionId: string, type: string, frame?: Frame): void {
    if (frame) this.frames.set(sessionId, frame);
    this.emit("message", {}, "Target.attachedToTarget", { sessionId, targetInfo: { type, url: "", targetId: frame?.id ?? sessionId } }, undefined);
  }
  sent(method: string): [string, unknown, string | undefined][] {
    return this.calls.filter(([name]) => name === method);
  }
}

afterEach(() => { vi.useRealTimers(); });

test("parseInspectRequest accepts only {selector} with 1 to 1,000 UTF-16 units", () => {
  expect(parseInspectRequest({ selector: "#a" })).toBe("#a");
  expect(parseInspectRequest({ selector: "a".repeat(1000) })).toBe("a".repeat(1000));
  for (const bad of [null, undefined, "#a", [], {}, { selector: "" }, { selector: 3 }, { selector: "a".repeat(1001) }, { selector: "#a", extra: 1 }]) {
    expect(parseInspectRequest(bad), JSON.stringify(bad)).toBeNull();
  }
  // Astral characters count two units each.
  expect(parseInspectRequest({ selector: "😀".repeat(501) })).toBeNull();
});

test("attaches once and auto-attaches flattened iframe targets", async () => {
  const dbg = new FakeDebugger();
  createInspector(dbg, () => BASE);
  await vi.waitFor(() => expect(dbg.sent("Target.setAutoAttach")).toHaveLength(1));
  expect(dbg.attached).toBe(true);
  expect(dbg.sent("Target.setAutoAttach")[0]?.[1]).toEqual({ autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  expect(dbg.sent("Target.setAutoAttach")[0]?.[2]).toBeUndefined();
});

test("inspects the canvas iframe and returns the rows", async () => {
  const dbg = new FakeDebugger();
  const inspector = createInspector(dbg, () => BASE);
  dbg.target("S1", "iframe", { id: "F1", parentId: "MAIN", url: CANVAS });
  const result = await inspector.inspect("#c3");
  expect(result).toEqual({ ok: true, rows: inspectRows({ ...c3, ancestors: ["body", "html"] }) });
  expect(dbg.sent("DOM.querySelector")[0]).toEqual(["DOM.querySelector", { nodeId: 1, selector: "#c3" }, "S1"]);
  expect(dbg.sent("CSS.getMatchedStylesForNode")[0]?.[2]).toBe("S1");
});

test("DOM and CSS are on only during a request", async () => {
  // Left on, a canvas that mutates its DOM sent ~6,300 events/s to main (Fix 2 measurement).
  const dbg = new FakeDebugger();
  const inspector = createInspector(dbg, () => BASE);
  dbg.target("S1", "iframe", { id: "F1", parentId: "MAIN", url: CANVAS });
  await inspector.inspect("#c3");
  dbg.nodeId = 0;
  await inspector.inspect("#none");
  dbg.nodeId = 7;
  dbg.fail = "CSS.getComputedStyleForNode";
  await inspector.inspect("#c3");
  const domain = dbg.calls.map(([method]) => method).filter((m) => /^(DOM|CSS)\.(enable|disable)$/.test(m));
  expect(domain).toEqual(Array.from({ length: 3 }, () => ["DOM.enable", "CSS.enable", "CSS.disable", "DOM.disable"]).flat());
  const last = dbg.calls.map(([method]) => method);
  expect(last.lastIndexOf("CSS.getMatchedStylesForNode")).toBeLessThan(last.lastIndexOf("CSS.disable"));
});

test("overlapping requests run one after another", async () => {
  const dbg = new FakeDebugger();
  const inspector = createInspector(dbg, () => BASE);
  dbg.target("S1", "iframe", { id: "F1", parentId: "MAIN", url: CANVAS });
  const [first, second] = await Promise.all([inspector.inspect("#c3"), inspector.inspect("#c3")]);
  expect(first).toMatchObject({ ok: true });
  expect(second).toMatchObject({ ok: true });
  const methods = dbg.calls.map(([method]) => method);
  expect(methods.filter((m) => m === "DOM.disable")).toHaveLength(2);
  // The second request enables only after the first has disabled.
  expect(methods.indexOf("DOM.disable")).toBeLessThan(methods.lastIndexOf("DOM.enable"));
});

test("picks the window's canvas child, not other iframes or targets", async () => {
  const dbg = new FakeDebugger();
  const inspector = createInspector(dbg, () => BASE);
  dbg.target("W", "worker");
  dbg.target("NESTED", "iframe", { id: "F2", parentId: "F1", url: `${BASE}k1/.doan/canvases/inner.html` });
  dbg.target("OTHER", "iframe", { id: "F3", parentId: "MAIN", url: "http://127.0.0.1:4000/t/other/k1/a.html" });
  expect(await inspector.inspect("#c3")).toMatchObject({ ok: false });
  dbg.target("S1", "iframe", { id: "F1", parentId: "MAIN", url: CANVAS });
  expect(await inspector.inspect("#c3")).toMatchObject({ ok: true });
  expect(dbg.sent("DOM.querySelector").map(([, , session]) => session)).toEqual(["S1"]);
});

test("prefers the newest canvas session and forgets detached ones", async () => {
  const dbg = new FakeDebugger();
  const inspector = createInspector(dbg, () => BASE);
  dbg.target("OLD", "iframe", { id: "F1", parentId: "MAIN", url: CANVAS });
  dbg.target("NEW", "iframe", { id: "F2", parentId: "MAIN", url: CANVAS });
  await inspector.inspect("#c3");
  expect(dbg.sent("DOM.querySelector").at(-1)?.[2]).toBe("NEW");
  dbg.emit("message", {}, "Target.detachedFromTarget", { sessionId: "NEW" }, undefined);
  await inspector.inspect("#c3");
  expect(dbg.sent("DOM.querySelector").at(-1)?.[2]).toBe("OLD");
  dbg.emit("message", {}, "Target.detachedFromTarget", { sessionId: "OLD" }, undefined);
  expect(await inspector.inspect("#c3")).toEqual({ ok: false, reason: "No canvas is loaded." });
});

test("ignores target events scoped to a child session", async () => {
  const dbg = new FakeDebugger();
  const inspector = createInspector(dbg, () => BASE);
  dbg.target("S1", "iframe", { id: "F1", parentId: "MAIN", url: CANVAS });
  dbg.emit("message", {}, "Target.detachedFromTarget", { sessionId: "S1" }, "S1");
  dbg.frames.set("S9", { id: "F9", parentId: "MAIN", url: CANVAS });
  dbg.emit("message", {}, "Target.attachedToTarget", { sessionId: "S9", targetInfo: { type: "iframe", url: "" } }, "S1");
  await inspector.inspect("#c3");
  expect(dbg.sent("DOM.querySelector").map(([, , session]) => session)).toEqual(["S1"]);
});

test("a reload of the same iframe keeps its session; the URL is read at request time", async () => {
  const dbg = new FakeDebugger();
  const inspector = createInspector(dbg, () => BASE);
  // URL is empty at attach time (PoC 2); the frame tree has it later.
  dbg.target("S1", "iframe", { id: "F1", parentId: "MAIN", url: "" });
  expect(await inspector.inspect("#c3")).toMatchObject({ ok: false });
  dbg.frames.set("S1", { id: "F1", parentId: "MAIN", url: CANVAS });
  expect(await inspector.inspect("#c3")).toMatchObject({ ok: true });
});

test("re-attaches on the next request after a detach", async () => {
  const dbg = new FakeDebugger();
  const inspector = createInspector(dbg, () => BASE);
  dbg.target("S1", "iframe", { id: "F1", parentId: "MAIN", url: CANVAS });
  dbg.attached = false;
  dbg.emit("detach", {}, "target closed");
  // Sessions from before the detach are gone; the fake reports no targets on
  // re-attach (Chromium would report the live ones again).
  expect(await inspector.inspect("#c3")).toEqual({ ok: false, reason: "No canvas is loaded." });
  expect(dbg.attached).toBe(true);
  expect(dbg.sent("Target.setAutoAttach")).toHaveLength(2);
  dbg.target("S2", "iframe", { id: "F1", parentId: "MAIN", url: CANVAS });
  expect(await inspector.inspect("#c3")).toMatchObject({ ok: true });
  expect(dbg.sent("DOM.querySelector").map(([, , session]) => session)).toEqual(["S2"]);
});

test("fails closed: no match, a failing command, an attach error", async () => {
  const dbg = new FakeDebugger();
  const inspector = createInspector(dbg, () => BASE);
  dbg.target("S1", "iframe", { id: "F1", parentId: "MAIN", url: CANVAS });
  dbg.nodeId = 0;
  expect(await inspector.inspect("#none")).toEqual({ ok: false, reason: "No element matches the selector." });
  dbg.nodeId = 7;
  dbg.fail = "DOM.querySelector";
  expect(await inspector.inspect("#c3")).toMatchObject({ ok: false });
  const broken = new FakeDebugger();
  broken.attachError = new Error("Another debugger is already attached");
  const refused = createInspector(broken, () => BASE);
  expect(await refused.inspect("#c3")).toMatchObject({ ok: false });
});

test("gives up after 2 seconds", async () => {
  vi.useFakeTimers();
  const dbg = new FakeDebugger();
  const inspector = createInspector(dbg, () => BASE);
  dbg.target("S1", "iframe", { id: "F1", parentId: "MAIN", url: CANVAS });
  dbg.hang = true;
  const result = inspector.inspect("#c3");
  await vi.advanceTimersByTimeAsync(1999);
  let settled = false;
  void result.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toEqual({ ok: false, reason: "Inspecting took longer than 2 seconds." });
});

test("inheritedFrom names the ancestor from the document tree", async () => {
  const c4 = (fixture as unknown as Record<string, InspectInput>)["#c4"];
  const dbg = new FakeDebugger();
  dbg.styles = c4;
  // html > body > div.inh-parent > p > span#c4
  const node = (nodeId: number, localName: string, children: object[] = []) => ({ nodeId, nodeType: 1, localName, children });
  dbg.tree = { nodeId: 1, nodeType: 9, localName: "", children: [node(2, "html", [node(3, "body", [node(4, "div", [node(5, "p", [node(7, "span")])])])])] };
  const inspector = createInspector(dbg, () => BASE);
  dbg.target("S1", "iframe", { id: "F1", parentId: "MAIN", url: CANVAS });
  const result = await inspector.inspect("#c4");
  if (!result.ok) throw new Error(result.reason);
  expect(result.rows.find((r) => r.label === "Text")).toMatchObject({ token: "--muted", inheritedFrom: "div" });
  expect(dbg.sent("DOM.getDocument")[0]?.[1]).toEqual({ depth: -1 });
});

test("a failed attach is retried on the next request", async () => {
  const dbg = new FakeDebugger();
  dbg.attachError = new Error("Another debugger is already attached");
  const inspector = createInspector(dbg, () => BASE);
  expect(await inspector.inspect("#c3")).toEqual({ ok: false, reason: "The inspector could not attach to the window." });
  dbg.attachError = null;
  const pending = inspector.inspect("#c3");
  await vi.waitFor(() => expect(dbg.sent("Target.setAutoAttach")).toHaveLength(1));
  await pending;
  dbg.target("S1", "iframe", { id: "F1", parentId: "MAIN", url: CANVAS });
  expect(await inspector.inspect("#c3")).toMatchObject({ ok: true });
});

test("comment observer enables parent and child domains, joins cross-session events, and resumes after setup failure", async () => {
  const { DocumentBindings } = await import("./comments/document");
  const docs = new DocumentBindings();
  const dbg = new FakeDebugger();
  createInspector(dbg, () => BASE, docs);
  await vi.waitFor(() => expect(dbg.sent("Target.setAutoAttach")).toHaveLength(1));
  expect(dbg.sent("Network.enable")[0]?.[2]).toBeUndefined();
  expect(dbg.sent("Page.enable")[0]?.[2]).toBeUndefined();
  dbg.target("S1", "iframe", { id: "FRAME", parentId: "MAIN", url: CANVAS });
  await vi.waitFor(() => expect(dbg.sent("Runtime.runIfWaitingForDebugger")).toHaveLength(1));
  docs.response({ marker: "response", root: "/repo", path: ".doan/canvases/a.html", hash: "sha256:" + "a".repeat(64), complete: true, stable: true });
  dbg.emit("message", {}, "Network.responseReceived", { type: "Document", requestId: "request", frameId: "FRAME", loaderId: "loader", response: { headers: { "X-Doan-Response": "response" } } });
  dbg.emit("message", {}, "Page.frameNavigated", { frame: { id: "FRAME", parentId: "MAIN", loaderId: "loader", url: CANVAS } }, "S1");
  dbg.emit("message", {}, "Network.loadingFinished", { requestId: "request" });
  expect(docs.current("FRAME", CANVAS)?.generation).toBe("loader");
  dbg.emit("message", {}, "Page.frameStartedNavigating", { frameId: "FRAME", loaderId: "new" }, "S1");
  expect(docs.current("FRAME", CANVAS)).toBeNull();
  dbg.fail = "Network.enable";
  dbg.target("S2", "iframe", { id: "NEW", parentId: "MAIN", url: CANVAS });
  await vi.waitFor(() => expect(dbg.sent("Runtime.runIfWaitingForDebugger")).toHaveLength(2));
  dbg.emit("detach");
  expect(docs.current("FRAME", CANVAS)).toBeNull();
});

test("OOPIF process swap preserves the committed document, but actual removal retires it", async () => {
  const { DocumentBindings } = await import("./comments/document");
  const docs = new DocumentBindings();
  const dbg = new FakeDebugger();
  createInspector(dbg, () => BASE, docs);
  dbg.target("S1", "iframe");
  docs.response({ marker: "response", root: "/repo", path: ".doan/canvases/a.html", hash: "sha256:" + "a".repeat(64), complete: true, stable: true });
  dbg.emit("message", {}, "Network.responseReceived", { type: "Document", requestId: "request", frameId: "FRAME", loaderId: "loader", response: { headers: { "X-Doan-Response": "response" } } });
  dbg.emit("message", {}, "Page.frameNavigated", { frame: { id: "FRAME", parentId: "MAIN", loaderId: "loader", url: CANVAS } }, "S1");
  dbg.emit("message", {}, "Page.frameDetached", { frameId: "FRAME", reason: "swap" });
  dbg.emit("message", {}, "Network.loadingFinished", { requestId: "request" }, "S1");
  expect(docs.current("FRAME", CANVAS)?.generation).toBe("loader");
  dbg.emit("message", {}, "Page.frameDetached", { frameId: "FRAME", reason: "remove" }, "S1");
  expect(docs.current("FRAME", CANVAS)).toBeNull();
});

for (const replacementLoader of ["loader", "replacement"]) {
  test(`former session detach preserves the current owner with ${replacementLoader}`, async () => {
    const { DocumentBindings } = await import("./comments/document");
    const docs = new DocumentBindings();
    const dbg = new FakeDebugger();
    createInspector(dbg, () => BASE, docs);
    const emit = (method: string, params: object, session?: string) => dbg.emit("message", {}, method, params, session);
    const commit = (session: string, loader: string) => emit("Page.frameNavigated", { frame: { id: "FRAME", parentId: "MAIN", loaderId: loader, url: CANVAS } }, session);
    const response = (loader: string) => {
      docs.response({ marker: loader, root: "/repo", path: ".doan/canvases/a.html", hash: loader, complete: true, stable: true });
      emit("Network.responseReceived", { type: "Document", requestId: loader, frameId: "FRAME", loaderId: loader, response: { headers: { "X-Doan-Response": loader } } });
    };
    dbg.target("OLD", "iframe");
    response("loader");
    commit("OLD", "loader");
    emit("Network.loadingFinished", { requestId: "loader" }, "OLD");
    expect(docs.current("FRAME", CANVAS)?.generation).toBe("loader");
    emit("Page.frameDetached", { frameId: "FRAME", reason: "swap" }, "OLD");
    dbg.target("NEW", "iframe");
    if (replacementLoader !== "loader") response(replacementLoader);
    commit("NEW", replacementLoader);
    emit("Network.loadingFinished", { requestId: replacementLoader }, "NEW");
    const current = docs.current("FRAME", CANVAS);
    expect(current?.generation).toBe(replacementLoader);
    emit("Target.detachedFromTarget", { sessionId: "OLD" });
    expect(docs.current("FRAME", CANVAS)).toEqual(current);
    emit("Target.detachedFromTarget", { sessionId: "NEW" });
    expect(docs.current("FRAME", CANVAS)).toBeNull();
  });
}

for (const detached of [false, true]) {
  for (const late of ["navigation", "start", "remove", "response", "failure", "finish"]) {
    test(`former session ${late} is ignored ${detached ? "after" : "before"} target detach`, async () => {
      const { DocumentBindings } = await import("./comments/document");
      const docs = new DocumentBindings();
      const dbg = new FakeDebugger();
      createInspector(dbg, () => BASE, docs);
      const emit = (method: string, params: object, session?: string) => dbg.emit("message", {}, method, params, session);
      const frame = { id: "FRAME", parentId: "MAIN", loaderId: "loader", url: CANVAS };
      dbg.target("OLD", "iframe");
      docs.response({ marker: "m", root: "/repo", path: ".doan/canvases/a.html", hash: "hash", complete: true, stable: true });
      emit("Network.responseReceived", { type: "Document", requestId: "request", frameId: "FRAME", loaderId: "loader", response: { headers: { "X-Doan-Response": "m" } } });
      emit("Page.frameNavigated", { frame }, "OLD");
      dbg.target("NEW", "iframe");
      emit("Page.frameNavigated", { frame }, "NEW");
      if (late !== "finish") emit("Network.loadingFinished", { requestId: "request" }, "NEW");
      const current = docs.current("FRAME", CANVAS);
      if (detached) emit("Target.detachedFromTarget", { sessionId: "OLD" });
      if (late === "navigation") emit("Page.frameNavigated", { frame: { ...frame, loaderId: "stale", url: "stale" } }, "OLD");
      if (late === "start") emit("Page.frameStartedNavigating", { frameId: "FRAME", loaderId: "stale" }, "OLD");
      if (late === "remove") emit("Page.frameDetached", { frameId: "FRAME", reason: "remove" }, "OLD");
      if (late === "response") emit("Network.responseReceived", { type: "Document", requestId: "stale", frameId: "FRAME", loaderId: "loader", response: { headers: { "X-Doan-Response": "missing" } } }, "OLD");
      if (late === "failure") emit("Network.loadingFailed", { requestId: "request" }, "OLD");
      if (late === "finish") emit("Network.loadingFinished", { requestId: "request" }, "OLD");
      expect(docs.current("FRAME", CANVAS)).toEqual(current);
      emit("Network.loadingFinished", { requestId: "request" }, "NEW");
      expect(docs.current("FRAME", CANVAS)?.generation).toBe("loader");
      emit("Page.frameStartedNavigating", { frameId: "FRAME", loaderId: "next" }, "NEW");
      expect(docs.current("FRAME", CANVAS)).toBeNull();
    });
  }
}

for (const invalidation of ["remove", "unspecified detach", "debugger loss", "network failure"]) {
  test(`current session still invalidates on ${invalidation}`, async () => {
    const { DocumentBindings } = await import("./comments/document");
    const docs = new DocumentBindings();
    const dbg = new FakeDebugger();
    createInspector(dbg, () => BASE, docs);
    dbg.target("CURRENT", "iframe");
    const emit = (method: string, params: object) => dbg.emit("message", {}, method, params, "CURRENT");
    docs.response({ marker: "m", root: "/repo", path: ".doan/canvases/a.html", hash: "hash", complete: true, stable: true });
    emit("Network.responseReceived", { type: "Document", requestId: "request", frameId: "FRAME", loaderId: "loader", response: { headers: { "X-Doan-Response": "m" } } });
    emit("Page.frameNavigated", { frame: { id: "FRAME", parentId: "MAIN", loaderId: "loader", url: CANVAS } });
    emit("Network.loadingFinished", { requestId: "request" });
    expect(docs.current("FRAME", CANVAS)?.generation).toBe("loader");
    if (invalidation === "remove") emit("Page.frameDetached", { frameId: "FRAME", reason: "remove" });
    if (invalidation === "unspecified detach") emit("Page.frameDetached", { frameId: "FRAME" });
    if (invalidation === "debugger loss") dbg.emit("detach");
    if (invalidation === "network failure") emit("Network.loadingFailed", { requestId: "request" });
    expect(docs.current("FRAME", CANVAS)).toBeNull();
  });
}
