import { EventEmitter } from "node:events";
import { afterEach, expect, test, vi } from "vitest";
import { inspectRows, type InspectInput } from "./inspect";
import fixture from "./inspect.fixture.json";
import { createInspector, parseInspectRequest, type DebuggerLike } from "./inspector";

const BASE = "http://127.0.0.1:4000/t/tok/";
const CANVAS = `${BASE}k1/design/a.html`;
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
        return { root: { nodeId: 1, nodeType: 9, localName: "", children: [{ nodeId: 2, nodeType: 1, localName: "html", children: [{ nodeId: 3, nodeType: 1, localName: "body", children: [{ nodeId: 7, nodeType: 1, localName: "div" }] }] }] } };
      case "DOM.querySelector":
        return { nodeId: this.nodeId };
      case "CSS.getMatchedStylesForNode":
        return c3?.matched;
      case "CSS.getComputedStyleForNode":
        return { computedStyle: c3?.computed };
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
  // Domains are enabled once per session.
  await inspector.inspect("#c3");
  expect(dbg.sent("DOM.enable")).toHaveLength(1);
  expect(dbg.sent("CSS.enable")).toHaveLength(1);
});

test("picks the window's canvas child, not other iframes or targets", async () => {
  const dbg = new FakeDebugger();
  const inspector = createInspector(dbg, () => BASE);
  dbg.target("W", "worker");
  dbg.target("NESTED", "iframe", { id: "F2", parentId: "F1", url: `${BASE}k1/design/inner.html` });
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
  // Sessions from before the detach are gone; auto-attach reports them again.
  const pending = inspector.inspect("#c3");
  await vi.waitFor(() => expect(dbg.sent("Target.setAutoAttach")).toHaveLength(2));
  dbg.target("S2", "iframe", { id: "F1", parentId: "MAIN", url: CANVAS });
  expect(await pending).toMatchObject({ ok: false });
  expect(await inspector.inspect("#c3")).toMatchObject({ ok: true });
  expect(dbg.sent("DOM.querySelector").at(-1)?.[2]).toBe("S2");
  expect(dbg.attached).toBe(true);
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
