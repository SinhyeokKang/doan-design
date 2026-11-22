import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { DocumentBindings } from "./document/bindings";
import { createWindowDebugger, type DebuggerLike } from "./windowDebugger";

const CANVAS = "http://127.0.0.1:4000/t/tok/k1/.doan/canvases/a.html";

interface Frame { id: string; parentId?: string; url: string }

// A fake `webContents.debugger`: answers by method and session, and records calls.
class FakeDebugger extends EventEmitter implements DebuggerLike {
  attached = false;
  attachError: Error | null = null;
  calls: [string, unknown, string | undefined][] = [];
  frames = new Map<string | undefined, Frame>([[undefined, { id: "MAIN", url: "file:///app/index.html" }]]);
  fail: string | null = null;
  // Per-session failures, as Chromium answers a domain a target type lacks (a worker has no Page domain).
  failOn: ((method: string, sessionId: string | undefined) => Error | null) | null = null;
  attach(): void {
    if (this.attachError) throw this.attachError;
    this.attached = true;
  }
  isAttached(): boolean {
    return this.attached;
  }
  async sendCommand(method: string, params?: object, sessionId?: string): Promise<unknown> {
    this.calls.push([method, params, sessionId]);
    if (method === this.fail) throw new Error(`${method} failed`);
    const failure = this.failOn?.(method, sessionId);
    if (failure) throw failure;
    if (method === "Page.getFrameTree") {
      const frame = this.frames.get(sessionId);
      if (!frame) throw new Error("No target with given id");
      return { frameTree: { frame } };
    }
    return {};
  }
  target(sessionId: string, type: string, frame?: Frame): void {
    if (frame) this.frames.set(sessionId, frame);
    this.emit("message", {}, "Target.attachedToTarget", { sessionId, targetInfo: { type, url: "", targetId: frame?.id ?? sessionId } }, undefined);
  }
  sent(method: string): [string, unknown, string | undefined][] {
    return this.calls.filter(([name]) => name === method);
  }
}

test("attaches once and auto-attaches paused, flattened iframe targets", async () => {
  const dbg = new FakeDebugger();
  createWindowDebugger(dbg, new DocumentBindings());
  await vi.waitFor(() => expect(dbg.sent("Target.setAutoAttach")).toHaveLength(1));
  expect(dbg.attached).toBe(true);
  expect(dbg.sent("Target.setAutoAttach")[0]?.[1]).toEqual({ autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  expect(dbg.sent("Target.setAutoAttach")[0]?.[2]).toBeUndefined();
});

test("a failed attach is retried on the next main frame read", async () => {
  const dbg = new FakeDebugger();
  dbg.attachError = new Error("Another debugger is already attached");
  const debuggerOf = createWindowDebugger(dbg, new DocumentBindings());
  expect(await debuggerOf.mainFrame()).toBeNull();
  dbg.attachError = null;
  expect(await debuggerOf.mainFrame()).toBe("MAIN");
  expect(dbg.sent("Target.setAutoAttach")).toHaveLength(1);
});

test("document observer enables parent and child domains, joins cross-session events, and resumes after setup failure", async () => {
  const docs = new DocumentBindings();
  const dbg = new FakeDebugger();
  createWindowDebugger(dbg, docs);
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

// The canvas agent notice's dot field runs a dedicated Worker in the main window, which auto-attach reports too. A
// worker has no Page domain: Chromium answers Page.enable with "'Page.enable' wasn't found". Clearing the bindings
// there dropped the shown canvas's proof, and every inspector read answered unavailable until the canvas loaded again.
for (const failing of ["Page.enable", "Runtime.runIfWaitingForDebugger"]) {
  test(`a worker target whose ${failing} fails keeps the shown canvas's proof and is still resumed`, async () => {
    const docs = new DocumentBindings();
    const dbg = new FakeDebugger();
    createWindowDebugger(dbg, docs);
    await vi.waitFor(() => expect(dbg.sent("Target.setAutoAttach")).toHaveLength(1));
    dbg.target("S1", "iframe", { id: "FRAME", parentId: "MAIN", url: CANVAS });
    await vi.waitFor(() => expect(dbg.sent("Runtime.runIfWaitingForDebugger")).toHaveLength(1));
    docs.response({ marker: "response", root: "/repo", path: ".doan/canvases/a.html", hash: "sha256:" + "a".repeat(64), complete: true, stable: true });
    dbg.emit("message", {}, "Network.responseReceived", { type: "Document", requestId: "request", frameId: "FRAME", loaderId: "loader", response: { headers: { "X-Doan-Response": "response" } } });
    dbg.emit("message", {}, "Page.frameNavigated", { frame: { id: "FRAME", parentId: "MAIN", loaderId: "loader", url: CANVAS } }, "S1");
    dbg.emit("message", {}, "Network.loadingFinished", { requestId: "request" }, "S1");
    const shown = docs.current("FRAME", CANVAS);
    expect(shown?.generation).toBe("loader");
    dbg.failOn = (method, session) => (session === "W1" && method === failing ? new Error(`'${method}' wasn't found`) : null);
    dbg.target("W1", "worker");
    await vi.waitFor(() => expect(dbg.sent("Runtime.runIfWaitingForDebugger").map(([, , session]) => session)).toContain("W1"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(docs.current("FRAME", CANVAS)).toEqual(shown);
  });
}

test("OOPIF process swap preserves the committed document, but actual removal retires it", async () => {
  const docs = new DocumentBindings();
  const dbg = new FakeDebugger();
  createWindowDebugger(dbg, docs);
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
      const docs = new DocumentBindings();
    const dbg = new FakeDebugger();
    createWindowDebugger(dbg, docs);
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
          const docs = new DocumentBindings();
      const dbg = new FakeDebugger();
      createWindowDebugger(dbg, docs);
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
      const docs = new DocumentBindings();
    const dbg = new FakeDebugger();
    createWindowDebugger(dbg, docs);
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

// The read-state proof needs the main frame's id: read once, followed when the window's own document commits, and read
// again after a detach.
test("mainFrame reads the window's main frame once, follows its commits and forgets it on detach", async () => {
  const dbg = new FakeDebugger();
  const debuggerOf = createWindowDebugger(dbg, new DocumentBindings());
  expect(await debuggerOf.mainFrame()).toBe("MAIN");
  expect(await debuggerOf.mainFrame()).toBe("MAIN");
  expect(dbg.sent("Page.getFrameTree")).toHaveLength(1);
  dbg.emit("message", {}, "Page.frameNavigated", { frame: { id: "MAIN2", loaderId: "l", url: "file:///app/index.html" } }, undefined);
  expect(await debuggerOf.mainFrame()).toBe("MAIN2");
  // A child frame's commit is not the main frame.
  dbg.emit("message", {}, "Page.frameNavigated", { frame: { id: "C", parentId: "MAIN2", loaderId: "l", url: CANVAS } }, undefined);
  expect(await debuggerOf.mainFrame()).toBe("MAIN2");
  dbg.emit("detach");
  expect(await debuggerOf.mainFrame()).toBe("MAIN");
});

// While a window closes, Electron's attach succeeds and detaches again at once ("target closed"). The read state reads
// the main frame on every document change and runs one more pass for a change during a pass; if that failed attach woke
// it again, the passes would chain in microtasks and starve the close, so quit never finished.
test("a closing window's failed re-attach does not wake document listeners again", async () => {
  const docs = new DocumentBindings();
  const dbg = new FakeDebugger();
  const debuggerOf = createWindowDebugger(dbg, docs);
  await vi.waitFor(() => expect(dbg.sent("Target.setAutoAttach")).toHaveLength(1));
  dbg.emit("message", {}, "Page.frameNavigated", { frame: { id: "C", parentId: "MAIN", loaderId: "l", url: CANVAS } }, undefined);
  let changes = 0;
  docs.onChange(() => { changes++; });
  dbg.attach = () => {
    dbg.attached = false;
    dbg.emit("detach", {}, "target closed");
  };
  dbg.failOn = () => dbg.attached ? null : new Error("target closed while handling command");
  dbg.attached = false;
  dbg.emit("detach", {}, "target closed");
  expect(changes).toBe(1);
  expect(await debuggerOf.mainFrame()).toBeNull();
  expect(changes).toBe(1);
});

// The inspector sends its commands only to the session sessionOf names, so a former OOPIF session that outlives its
// replacement is never asked.
test("sessionOf names the frame's current owner, never a former or detached session", () => {
  const dbg = new FakeDebugger();
  const debuggerOf = createWindowDebugger(dbg, new DocumentBindings());
  const emit = (method: string, params: object, session?: string) => dbg.emit("message", {}, method, params, session);
  const commit = (session: string | undefined, loader: string) => emit("Page.frameNavigated", { frame: { id: "FRAME", parentId: "MAIN", loaderId: loader, url: CANVAS } }, session);
  expect(debuggerOf.sessionOf("FRAME")).toBeNull();
  dbg.target("OLD", "iframe");
  // Attached is not owning: the frame has no commit from it yet.
  expect(debuggerOf.sessionOf("FRAME")).toBeNull();
  commit("OLD", "loader");
  expect(debuggerOf.sessionOf("FRAME")).toBe("OLD");
  expect(debuggerOf.sessionOf("OTHER")).toBeNull();
  // A commit seen only in the window's own session gives no child session.
  emit("Page.frameNavigated", { frame: { id: "SAME", parentId: "MAIN", loaderId: "l", url: CANVAS } });
  expect(debuggerOf.sessionOf("SAME")).toBeNull();
  // Process swap: the replacement commits, then the former session detaches late.
  emit("Page.frameDetached", { frameId: "FRAME", reason: "swap" }, "OLD");
  dbg.target("NEW", "iframe");
  commit("NEW", "loader");
  expect(debuggerOf.sessionOf("FRAME")).toBe("NEW");
  emit("Target.detachedFromTarget", { sessionId: "OLD" });
  expect(debuggerOf.sessionOf("FRAME")).toBe("NEW");
  // A queued commit from the former session does not take the frame back.
  commit("OLD", "stale");
  expect(debuggerOf.sessionOf("FRAME")).toBe("NEW");
});

test("sessionOf is null after a swapped OOPIF's session detaches before its replacement commits", () => {
  const dbg = new FakeDebugger();
  const debuggerOf = createWindowDebugger(dbg, new DocumentBindings());
  const emit = (method: string, params: object, session?: string) => dbg.emit("message", {}, method, params, session);
  dbg.target("OLD", "iframe");
  emit("Page.frameNavigated", { frame: { id: "FRAME", parentId: "MAIN", loaderId: "loader", url: CANVAS } }, "OLD");
  emit("Page.frameDetached", { frameId: "FRAME", reason: "swap" }, "OLD");
  dbg.target("NEW", "iframe");
  emit("Target.detachedFromTarget", { sessionId: "OLD" });
  expect(debuggerOf.sessionOf("FRAME")).toBeNull();
  emit("Page.frameNavigated", { frame: { id: "FRAME", parentId: "MAIN", loaderId: "next", url: CANVAS } }, "NEW");
  expect(debuggerOf.sessionOf("FRAME")).toBe("NEW");
  // The current owner detaching leaves no owner.
  emit("Target.detachedFromTarget", { sessionId: "NEW" });
  expect(debuggerOf.sessionOf("FRAME")).toBeNull();
});

test("sessionOf forgets every owner on a debugger detach and follows the sessions of the next attach", async () => {
  const dbg = new FakeDebugger();
  const debuggerOf = createWindowDebugger(dbg, new DocumentBindings());
  await vi.waitFor(() => expect(dbg.sent("Target.setAutoAttach")).toHaveLength(1));
  dbg.target("S1", "iframe");
  dbg.emit("message", {}, "Page.frameNavigated", { frame: { id: "FRAME", parentId: "MAIN", loaderId: "loader", url: CANVAS } }, "S1");
  expect(debuggerOf.sessionOf("FRAME")).toBe("S1");
  dbg.attached = false;
  dbg.emit("detach", {}, "target closed");
  expect(debuggerOf.sessionOf("FRAME")).toBeNull();
  // A late event from the old session changes nothing.
  dbg.emit("message", {}, "Page.frameNavigated", { frame: { id: "FRAME", parentId: "MAIN", loaderId: "late", url: CANVAS } }, "S1");
  expect(debuggerOf.sessionOf("FRAME")).toBeNull();
  // The next read attaches again; the frame's new session owns it once it commits.
  expect(await debuggerOf.mainFrame()).toBe("MAIN");
  expect(dbg.attached).toBe(true);
  expect(dbg.sent("Target.setAutoAttach")).toHaveLength(2);
  dbg.target("S2", "iframe");
  dbg.emit("message", {}, "Page.frameNavigated", { frame: { id: "FRAME", parentId: "MAIN", loaderId: "again", url: CANVAS } }, "S2");
  expect(debuggerOf.sessionOf("FRAME")).toBe("S2");
});

// A same-process iframe inside the canvas commits on the canvas's own session. Ownership belongs to the target's root
// frame only, or that nested commit would let a superseded session's late commit take the canvas frame back.
test("a nested same-process frame does not let a former session take the canvas frame back", () => {
  const docs = new DocumentBindings();
  const dbg = new FakeDebugger();
  const debuggerOf = createWindowDebugger(dbg, docs);
  const emit = (method: string, params: object, session?: string) => dbg.emit("message", {}, method, params, session);
  const frame = { id: "FRAME", parentId: "MAIN", loaderId: "loader", url: CANVAS };
  dbg.target("OLD", "iframe");
  docs.response({ marker: "m", root: "/repo", path: ".doan/canvases/a.html", hash: "hash", complete: true, stable: true });
  emit("Network.responseReceived", { type: "Document", requestId: "request", frameId: "FRAME", loaderId: "loader", response: { headers: { "X-Doan-Response": "m" } } });
  emit("Page.frameNavigated", { frame }, "OLD");
  emit("Network.loadingFinished", { requestId: "request" }, "OLD");
  // Nested two deep: the canvas's srcdoc iframe and an iframe inside it.
  emit("Page.frameNavigated", { frame: { id: "NESTED", parentId: "FRAME", loaderId: "nested", url: "about:srcdoc" } }, "OLD");
  emit("Page.frameNavigated", { frame: { id: "DEEPER", parentId: "NESTED", loaderId: "deeper", url: "about:srcdoc" } }, "OLD");
  expect(debuggerOf.sessionOf("FRAME")).toBe("OLD");
  expect(debuggerOf.sessionOf("NESTED")).toBeNull();
  expect(debuggerOf.sessionOf("DEEPER")).toBeNull();
  emit("Page.frameDetached", { frameId: "FRAME", reason: "swap" }, "OLD");
  dbg.target("NEW", "iframe");
  emit("Page.frameNavigated", { frame }, "NEW");
  expect(debuggerOf.sessionOf("FRAME")).toBe("NEW");
  const current = docs.current("FRAME", CANVAS);
  expect(current?.generation).toBe("loader");
  // The former session's queued commit, then its late detach.
  emit("Page.frameNavigated", { frame }, "OLD");
  expect(debuggerOf.sessionOf("FRAME")).toBe("NEW");
  emit("Target.detachedFromTarget", { sessionId: "OLD" });
  expect(debuggerOf.sessionOf("FRAME")).toBe("NEW");
  expect(docs.current("FRAME", CANVAS)).toEqual(current);
});

for (const reason of ["remove", undefined]) {
  test(`nested frame commits are released on ${reason ?? "unspecified"} detach while the root stays attached`, () => {
    const dbg = new FakeDebugger();
    const debuggerOf = createWindowDebugger(dbg, new DocumentBindings());
    dbg.target("LIVE", "iframe");
    const emit = (method: string, params: object) => dbg.emit("message", {}, method, params, "LIVE");
    emit("Page.frameNavigated", { frame: { id: "ROOT", parentId: "MAIN", url: CANVAS } });
    // Observe retention without adding a diagnostic API to the production debugger.
    const added = vi.spyOn(Set.prototype, "add");
    let commits: Set<unknown> | undefined;
    try {
      for (let i = 0; i < 100; i++) {
        const id = `CHURN-${i}`;
        emit("Page.frameNavigated", { frame: { id, parentId: "ROOT", url: "about:srcdoc" } });
        const recorded = added.mock.contexts.find((_, n) => added.mock.calls[n]?.[0] === id);
        if (recorded instanceof Set) commits ??= recorded;
        emit("Page.frameDetached", { frameId: id, reason });
      }
    } finally { added.mockRestore(); }
    expect(commits).toEqual(new Set(["ROOT"]));
    emit("Page.frameNavigated", { frame: { id: "SWAP", parentId: "ROOT", url: "about:srcdoc" } });
    emit("Page.frameDetached", { frameId: "SWAP", reason: "swap" });
    expect(commits).toEqual(new Set(["ROOT", "SWAP"]));
    emit("Page.frameDetached", { frameId: "ROOT", reason });
    expect(commits?.has("ROOT")).toBe(true);
    expect(debuggerOf.sessionOf("ROOT")).toBe("LIVE");
  });
}
