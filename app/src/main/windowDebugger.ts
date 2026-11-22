import type { DocumentBindings } from "./document/bindings";
import { object } from "./document/identity";

// The main window's debugger feeds the document bindings that prove which canvas the page shows (seenProof.ts) and
// reads the main frame's id they are checked against. CDP sees the iframe's loader and frame evidence across
// out-of-process sessions, which the page itself cannot report.

// The part of Electron's `Debugger` used here, so tests can drive a fake.
export interface DebuggerLike {
  attach(protocolVersion?: string): void;
  isAttached(): boolean;
  sendCommand(method: string, commandParams?: object, sessionId?: string): Promise<unknown>;
  // Same shape as Node's EventEmitter, which Electron's Debugger extends.
  on(event: string, listener: (...args: any[]) => void): unknown;
}

export interface WindowDebugger {
  // The CDP id of the window's main frame, the parent a shown canvas iframe must have; null while it cannot be read.
  mainFrame(): Promise<string | null>;
  // The child session that committed this frame's current document and is still attached; null once that session
  // detached, or while no session owns it. Commands for a canvas go only to this session: a former OOPIF session can
  // outlive its replacement.
  sessionOf(frameId: string): string | null;
}

export function createWindowDebugger(dbg: DebuggerLike, documents: DocumentBindings): WindowDebugger {
  // The window's own auto-attached child sessions.
  const sessions = new Set<string>();
  // Each child session's root frame: the frame its target is. A same-process iframe inside it commits on the same
  // session but is not what the session owns.
  const sessionFrames = new Map<string, string>();
  // The root and still-present nested commits, so a nested frame's children cannot be mistaken for the root.
  const sessionCommits = new Map<string, Set<string>>();
  const frameOwners = new Map<string, string>();
  let connected: Promise<void> | null = null;
  let mainFrameId: Promise<string | null> | null = null;

  dbg.on("message", (_event: unknown, method: string, params: { sessionId?: string; targetInfo?: { type?: string } }, sessionId?: string) => {
    // An OOPIF's former session can deliver queued Page/Network events after
    // its replacement commits. Parent events still join the first response.
    if (sessionId) {
      const frame = sessionFrames.get(sessionId);
      if (!sessions.has(sessionId) || (frame && frameOwners.get(frame) !== sessionId)) return;
    }
    const value: unknown = params;
    if (method === "Network.responseReceived") documents.network(value);
    if (object(value)) {
      if ((method === "Network.loadingFinished" || method === "Network.loadingFailed") && typeof value.requestId === "string") documents.finish(value.requestId, method === "Network.loadingFinished");
      if (method === "Page.frameNavigated") {
        // The window's own document committed: its main frame is the one without a parent.
        if (!sessionId && object(value.frame) && typeof value.frame.id === "string" && value.frame.parentId === undefined) mainFrameId = Promise.resolve(value.frame.id);
        documents.commit(value.frame);
        if (sessionId && object(value.frame) && typeof value.frame.id === "string") {
          let commits = sessionCommits.get(sessionId);
          if (!commits) { commits = new Set(); sessionCommits.set(sessionId, commits); }
          // A nested frame recorded as the root would move the event filter below off the canvas frame, letting the
          // session's late commit of that frame through after its replacement took over.
          const nested = typeof value.frame.parentId === "string" && commits.has(value.frame.parentId);
          commits.add(value.frame.id);
          if (!nested) {
            sessionFrames.set(sessionId, value.frame.id);
            frameOwners.set(value.frame.id, sessionId);
          }
        }
      }
      if (method === "Page.frameStartedNavigating" && typeof value.frameId === "string") documents.start(value.frameId, typeof value.loaderId === "string" ? value.loaderId : "");
      // A parent-session swap transfers ownership to the OOPIF; the document still exists.
      if (method === "Page.frameDetached" && value.reason !== "swap" && typeof value.frameId === "string") {
        documents.start(value.frameId);
        // Keep the root until its session detaches: it still fences queued events after an ownership transfer.
        if (sessionId && sessionFrames.get(sessionId) !== value.frameId) sessionCommits.get(sessionId)?.delete(value.frameId);
      }
    }
    // Only the window's own auto-attach; child sessions never auto-attach.
    if (sessionId) return;
    if (method === "Target.attachedToTarget" && params.sessionId) {
      sessions.add(params.sessionId);
      const child = params.sessionId;
      // Only a frame target can hold a canvas document. Auto-attach also reports the window's workers (the canvas agent
      // notice's dot field runs one), which have no Page domain: clearing the bindings on their failed setup dropped
      // the shown canvas's proof until that canvas loaded again.
      const frame = params.targetInfo?.type === "iframe";
      // Auto-attached targets start paused; a path that skips this resume hangs the canvas.
      void (async () => {
        try { if (frame) { await dbg.sendCommand("Network.enable", {}, child); await dbg.sendCommand("Page.enable", {}, child); } }
        catch { documents.clear(); }
        finally { await dbg.sendCommand("Runtime.runIfWaitingForDebugger", {}, child).catch(() => { if (frame) documents.clear(); }); }
      })();
    }
    else if (method === "Target.detachedFromTarget" && params.sessionId) {
      sessions.delete(params.sessionId);
      const frame = sessionFrames.get(params.sessionId);
      if (frame && frameOwners.get(frame) === params.sessionId) {
        documents.start(frame);
        frameOwners.delete(frame);
      }
      sessionFrames.delete(params.sessionId);
      sessionCommits.delete(params.sessionId);
    }
  });
  // Detached (renderer gone, or another client took over): attach again on the next main frame read.
  dbg.on("detach", () => {
    sessions.clear();
    sessionFrames.clear();
    sessionCommits.clear();
    frameOwners.clear();
    documents.clear();
    connected = null;
    mainFrameId = null;
  });

  const connect = (): Promise<void> => {
    connected ??= (async () => {
      if (!dbg.isAttached()) dbg.attach("1.3");
      await dbg.sendCommand("Network.enable");
      await dbg.sendCommand("Page.enable");
      // flatten: iframe targets get sessions on this same debugger.
      await dbg.sendCommand("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    })().catch((error: unknown) => {
      connected = null;
      throw error;
    });
    return connected;
  };
  // Attach once up front so iframe sessions are tracked from the first canvas.
  connect().catch(() => undefined);

  const mainFrameOf = async () => ((await dbg.sendCommand("Page.getFrameTree")) as { frameTree: { frame: { id: string } } }).frameTree.frame.id;

  return {
    mainFrame() {
      mainFrameId ??= connect().then(mainFrameOf).catch(() => {
        mainFrameId = null;
        return null;
      });
      return mainFrameId;
    },
    sessionOf(frameId) {
      const owner = frameOwners.get(frameId);
      return owner !== undefined && sessions.has(owner) ? owner : null;
    },
  };
}
