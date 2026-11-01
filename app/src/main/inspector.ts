import type { DocumentBindings } from "./comments/document";
import { object } from "./comments/identity";
import { isCanvasFrame } from "./canvasFrame";
import { inspectRows, type InspectResult, type MatchedStyles } from "./inspect";

// Inspector values come from CDP on the window's debugger, not from the canvas
// script: CDP also sees sheets a canvas CSP or a CDN without CORS hides from
// the page (select-inspect PoC 2).

const BUDGET_MS = 2000;
const SELECTOR_LIMIT = 1000;

// The part of Electron's `Debugger` used here, so tests can drive a fake.
export interface DebuggerLike {
  attach(protocolVersion?: string): void;
  isAttached(): boolean;
  sendCommand(method: string, commandParams?: object, sessionId?: string): Promise<unknown>;
  // Same shape as Node's EventEmitter, which Electron's Debugger extends.
  on(event: string, listener: (...args: any[]) => void): unknown;
}

export interface Inspector {
  inspect(selector: string): Promise<InspectResult>;
}

interface DomNode {
  nodeId: number;
  nodeType: number;
  localName: string;
  children?: DomNode[];
}

// IPC `inspect:get` takes `{selector}` only; the cap is the selector cap of
// the canvas messages (UTF-16 units, as `String.length` counts).
export function parseInspectRequest(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  const selector: unknown = (value as { selector?: unknown }).selector;
  if (keys.length !== 1 || typeof selector !== "string") return null;
  return selector.length >= 1 && selector.length <= SELECTOR_LIMIT ? selector : null;
}

// Element tag names above `nodeId`, nearest first, matching CDP's `inherited[]`.
function ancestorsOf(root: DomNode, nodeId: number): string[] {
  const walk = (node: DomNode, above: string[]): string[] | null => {
    if (node.nodeId === nodeId) return above;
    const next = node.nodeType === 1 ? [node.localName, ...above] : above;
    for (const child of node.children ?? []) {
      const found = walk(child, next);
      if (found) return found;
    }
    return null;
  };
  return walk(root, []) ?? [];
}

export function createInspector(dbg: DebuggerLike, tokenBase: () => string, documents?: DocumentBindings): Inspector {
  // sessionId -> target type, in attach order.
  const sessions = new Map<string, string>();
  const sessionFrames = new Map<string, string>();
  const frameOwners = new Map<string, string>();
  let connected: Promise<void> | null = null;
  // Requests run one at a time: each one turns DOM and CSS off when it ends,
  // which would break another request still reading the same session.
  let queue: Promise<unknown> = Promise.resolve();

  dbg.on("message", (_event: unknown, method: string, params: { sessionId?: string; targetInfo?: { type?: string } }, sessionId?: string) => {
    if (documents) {
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
          documents.commit(value.frame);
          if (sessionId && object(value.frame) && typeof value.frame.id === "string") {
            sessionFrames.set(sessionId, value.frame.id);
            frameOwners.set(value.frame.id, sessionId);
          }
        }
        if (method === "Page.frameStartedNavigating" && typeof value.frameId === "string") documents.start(value.frameId, typeof value.loaderId === "string" ? value.loaderId : "");
        // A parent-session swap transfers ownership to the OOPIF; the document still exists.
        if (method === "Page.frameDetached" && value.reason !== "swap" && typeof value.frameId === "string") documents.start(value.frameId);
      }
    }
    // Only the window's own auto-attach; child sessions never auto-attach.
    if (sessionId) return;
    if (method === "Target.attachedToTarget" && params.sessionId) {
      sessions.set(params.sessionId, params.targetInfo?.type ?? "");
      if (documents) {
        const child = params.sessionId;
        void (async () => {
          try { await dbg.sendCommand("Network.enable", {}, child); await dbg.sendCommand("Page.enable", {}, child); }
          catch { documents.clear(); }
          finally { await dbg.sendCommand("Runtime.runIfWaitingForDebugger", {}, child).catch(() => { documents.clear(); }); }
        })();
      }
    }
    else if (method === "Target.detachedFromTarget" && params.sessionId) {
      sessions.delete(params.sessionId);
      const frame = sessionFrames.get(params.sessionId);
      if (frame && frameOwners.get(frame) === params.sessionId) {
        documents?.start(frame);
        frameOwners.delete(frame);
      }
      sessionFrames.delete(params.sessionId);
    }
  });
  // Detached (renderer gone, or another client took over): attach again on the next request.
  dbg.on("detach", () => {
    sessions.clear();
    sessionFrames.clear();
    frameOwners.clear();
    documents?.clear();
    connected = null;
  });

  const connect = (): Promise<void> => {
    connected ??= (async () => {
      if (!dbg.isAttached()) dbg.attach("1.3");
      if (documents) { await dbg.sendCommand("Network.enable"); await dbg.sendCommand("Page.enable"); }
      // flatten: iframe targets get sessions on this same debugger.
      await dbg.sendCommand("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: documents !== undefined, flatten: true });
    })().catch((error: unknown) => {
      connected = null;
      throw error;
    });
    return connected;
  };
  // Attach once up front so iframe sessions are tracked from the first canvas.
  connect().catch(() => undefined);

  const frameOf = async (sessionId?: string) =>
    ((await dbg.sendCommand("Page.getFrameTree", {}, sessionId)) as { frameTree: { frame: { id: string; parentId?: string; url: string } } }).frameTree.frame;

  // A target's URL is empty when it attaches, and a canvas reloads in a new
  // iframe, so the canvas is found at request time: the newest iframe session
  // whose frame is a child of the window's main frame on the token path.
  const canvasSession = async (): Promise<string | null> => {
    const base = tokenBase();
    const main = (await frameOf()).id;
    for (const [id, type] of [...sessions].reverse()) {
      if (type !== "iframe") continue;
      try {
        const frame = await frameOf(id);
        if (isCanvasFrame(frame.url, base, frame.parentId === main)) return id;
      } catch {
        continue;
      }
    }
    return null;
  };

  const run = async (selector: string): Promise<InspectResult> => {
    try {
      await connect();
    } catch {
      return { ok: false, reason: "The inspector could not attach to the window." };
    }
    let session: string | null = null;
    const send = (method: string, params: object = {}) => dbg.sendCommand(method, params, session ?? undefined);
    try {
      session = await canvasSession();
      if (session === null) return { ok: false, reason: "No canvas is loaded." };
      await send("DOM.enable");
      await send("CSS.enable");
      const { root } = (await send("DOM.getDocument", { depth: -1 })) as { root: DomNode };
      const { nodeId } = (await send("DOM.querySelector", { nodeId: root.nodeId, selector })) as { nodeId: number };
      if (!nodeId) return { ok: false, reason: "No element matches the selector." };
      const [matched, computed] = await Promise.all([
        send("CSS.getMatchedStylesForNode", { nodeId }) as Promise<MatchedStyles>,
        send("CSS.getComputedStyleForNode", { nodeId }) as Promise<{ computedStyle: { name: string; value: string }[] }>,
      ]);
      return { ok: true, rows: inspectRows({ matched, computed: computed.computedStyle, ancestors: ancestorsOf(root, nodeId) }) };
    } catch {
      return { ok: false, reason: "The canvas could not be inspected." };
    } finally {
      // Left on, the whole tree known from `getDocument` turns every later DOM
      // mutation of the canvas into an event to main: about 6,300 a second on
      // a canvas with a 60 fps counter and a rebuilt list (select-inspect M fix 2).
      if (session !== null) {
        await send("CSS.disable").catch(() => undefined);
        await send("DOM.disable").catch(() => undefined);
      }
    }
  };

  return {
    inspect(selector) {
      // The budget counts from the call, so time spent waiting in the queue counts too.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<InspectResult>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, reason: "Inspecting took longer than 2 seconds." }), BUDGET_MS);
      });
      const result = Promise.race([queue.then(() => run(selector)), late]).finally(() => clearTimeout(timer));
      // A request that ran out of time releases the queue, so one stuck call cannot block later ones.
      queue = result;
      return result;
    },
  };
}
