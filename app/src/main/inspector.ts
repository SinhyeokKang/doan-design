import type { DocumentBindings, LoadedDocument } from "./document/bindings";
import { inspectRows, type InspectResult, type MatchedStyles } from "./inspect";
import { shownDocument } from "./seenProof";
import type { DebuggerLike, WindowDebugger } from "./windowDebugger";

// Inspector values come from CDP on the main window's debugger, not from the canvas script: CDP also sees sheets a
// canvas CSP or a CDN without CORS hides from the page. The document must be the one the window shows (the read-state
// proof, seenProof.ts), and commands go only to the session that owns its frame now (WindowDebugger.sessionOf).

const BUDGET_MS = 2000;
// The cap is the selector cap of the canvas messages (UTF-16 units, as `String.length` counts).
const SELECTOR_LIMIT = 1000;

export interface InspectRequest {
  selector: string;
  // The listed canvas the renderer means; main answers only while the window shows that document.
  canvas: { root: string; path: string };
  seq: number;
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;

// IPC `inspect:get` takes `{selector, canvas: {root, path}, seq}` and nothing else.
export function parseInspectRequest(value: unknown): InspectRequest | null {
  if (!exactKeys(value, ["selector", "canvas", "seq"])) return null;
  const { selector, canvas, seq } = value;
  if (typeof selector !== "string" || selector.length < 1 || selector.length > SELECTOR_LIMIT) return null;
  if (!exactKeys(canvas, ["root", "path"]) || !text(canvas.root) || !text(canvas.path)) return null;
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0) return null;
  return { selector, canvas: { root: canvas.root, path: canvas.path }, seq };
}

export interface InspectorDeps {
  debugger: Pick<DebuggerLike, "sendCommand">;
  // Its mainFrame() also attaches again after a detach or a failed attach.
  window: Pick<WindowDebugger, "mainFrame" | "sessionOf">;
  documents: Pick<DocumentBindings, "frames" | "current" | "onChange">;
  // The listed canvas row's URL, or null when the canvas is not listed.
  canvasUrl(canvas: { root: string; path: string }): string | null;
}

// The reply carries the request it answers, so the renderer can drop one that a newer request or selection overtook.
export type InspectReply = InspectRequest & InspectResult;
// What a request main refuses (another sender, a bad shape) gets: there is no parsed request to echo.
export type InspectRefused = { ok: false; reason: "unavailable" };

export interface Inspector {
  inspect(request: InspectRequest): Promise<InspectResult>;
}

interface DomNode {
  nodeId: number;
  nodeType: number;
  localName: string;
  children?: DomNode[];
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

const failed = (reason: "not-shown" | "not-found" | "unavailable"): InspectResult => ({ ok: false, reason });

export function createInspector(deps: InspectorDeps): Inspector {
  // Requests run one at a time: each one turns DOM and CSS off when it ends, which would break another request still
  // reading the same session.
  let queue: Promise<unknown> = Promise.resolve();

  const shownNow = (main: string, canvas: InspectRequest["canvas"]): LoadedDocument | null => {
    const url = deps.canvasUrl(canvas);
    if (url === null) return null;
    return shownDocument(deps.documents.frames(), (frame, at) => deps.documents.current(frame, at), main, { url, ...canvas });
  };

  // Another canvas's document is proven shown in the window, so the request lost a switch.
  const otherShown = (main: string, canvas: InspectRequest["canvas"]): boolean =>
    deps.documents.frames().some((frame) => {
      if (frame.parentId !== main) return false;
      const doc = deps.documents.current(frame.id, frame.url);
      return doc !== null && (doc.root !== canvas.root || doc.path !== canvas.path);
    });

  // Resolves true on the next bindings change, false once `end` settles first; the listener goes either way.
  const changeBefore = async (end: Promise<void>): Promise<boolean> => {
    let off = () => {};
    const changed = new Promise<boolean>((resolve) => { off = deps.documents.onChange(() => resolve(true)); });
    try { return await Promise.race([changed, end.then(() => false)]); }
    finally { off(); }
  };

  const run = async ({ selector, canvas }: InspectRequest, end: Promise<void>): Promise<InspectResult> => {
    const main = await deps.window.mainFrame();
    if (main === null) return failed("unavailable");
    // No proof yet (a load still finishing, or one lost to a debugger detach) is judged again on each bindings change,
    // as read-state does. Only a confirmed other canvas is not-shown: the renderer asks again when that document's
    // selection settles, while a missing proof gives it no such moment, so it gets unavailable and its Retry.
    let shown = shownNow(main, canvas);
    while (shown === null) {
      if (otherShown(main, canvas)) return failed("not-shown");
      if (!(await changeBefore(end))) return failed("unavailable");
      shown = shownNow(main, canvas);
    }
    const session = deps.window.sessionOf(shown.frame);
    if (session === null) return failed("unavailable");
    // What was read belongs to the requested canvas only if the same document and session are still current.
    const still = () => {
      const now = shownNow(main, canvas);
      return now !== null && now.frame === shown.frame && now.generation === shown.generation && deps.window.sessionOf(shown.frame) === session;
    };
    const send = (method: string, params: object = {}) => deps.debugger.sendCommand(method, params, session);
    try {
      await send("DOM.enable");
      await send("CSS.enable");
      const { root } = (await send("DOM.getDocument", { depth: -1 })) as { root: DomNode };
      const { nodeId } = (await send("DOM.querySelector", { nodeId: root.nodeId, selector })) as { nodeId: number };
      if (!nodeId) return failed(still() ? "not-found" : "not-shown");
      const [matched, computed] = await Promise.all([
        send("CSS.getMatchedStylesForNode", { nodeId }) as Promise<MatchedStyles>,
        send("CSS.getComputedStyleForNode", { nodeId }) as Promise<{ computedStyle: { name: string; value: string }[] }>,
      ]);
      if (!still()) return failed("not-shown");
      return { ok: true, rows: inspectRows({ matched, computed: computed.computedStyle, ancestors: ancestorsOf(root, nodeId) }) };
    } catch {
      return failed(still() ? "unavailable" : "not-shown");
    } finally {
      // Left on, the whole tree known from `getDocument` turns every later DOM mutation of the canvas into an event to
      // main: about 6,300 a second on a canvas with a 60 fps counter and a rebuilt list.
      await send("CSS.disable").catch(() => undefined);
      await send("DOM.disable").catch(() => undefined);
    }
  };

  return {
    inspect(request) {
      // The budget counts from the call, so time spent waiting in the queue counts too. A timeout does not cancel the
      // CDP commands already sent; their late answers are dropped.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const end = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, BUDGET_MS);
      });
      const late = end.then(() => failed("unavailable"));
      const result = Promise.race([queue.then(() => run(request, end)), late]).finally(() => clearTimeout(timer));
      // A request that ran out of time releases the queue, so one stuck call cannot block later ones.
      queue = result;
      return result;
    },
  };
}
