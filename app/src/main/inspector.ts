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
  // CDP's flat name, value list.
  attributes?: string[];
  children?: DomNode[];
}

// An ancestor's name as the element menu names nodes (canvasScript.ts `nodeLabel`, canvasTree.ts `frameLabel`), without
// the menu's quote of a tag's text, so an inherited row says where the value comes from in the person's terms: a frame
// by its title, else its id; an element by its data-doan-id; anything else by its tag.
function ancestorLabel(node: Pick<DomNode, "localName" | "attributes">): string {
  const attributes = new Map<string, string>();
  const list = node.attributes ?? [];
  for (let i = 0; i + 1 < list.length; i += 2) attributes.set(list[i]!, list[i + 1]!);
  const frame = attributes.get("data-doan-frame");
  if (frame !== undefined) return attributes.get("data-doan-title")?.trim() || frame || node.localName;
  return attributes.get("data-doan-id") || node.localName;
}

// Element labels above `nodeId`, nearest first, matching CDP's `inherited[]`.
function ancestorsOf(root: DomNode, nodeId: number): string[] {
  const walk = (node: DomNode, above: string[]): string[] | null => {
    if (node.nodeId === nodeId) return above;
    const next = node.nodeType === 1 ? [ancestorLabel(node), ...above] : above;
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
  // The newest request and the newest run started, by arrival. Arrival, not the renderer's seq: a reloaded renderer
  // counts from 1 again.
  let latest = 0;
  let started = 0;

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

  // A frame with the requested canvas's URL is committed under the main frame without a proof yet. Right after a switch
  // the new iframe can commit before the previous canvas's frame detaches, so a proven other canvas alone does not mean
  // the request lost. A frame whose proof names another canvas at that URL is no such frame: it is the other canvas.
  const requestedPending = (main: string, canvas: InspectRequest["canvas"]): boolean => {
    const url = deps.canvasUrl(canvas);
    return url !== null && deps.documents.frames().some((frame) => frame.parentId === main && frame.url === url && deps.documents.current(frame.id, frame.url) === null);
  };

  // Resolves true on the next bindings change, false once `end` settles first; the listener goes either way.
  const changeBefore = async (end: Promise<void>): Promise<boolean> => {
    let off = () => {};
    const changed = new Promise<boolean>((resolve) => { off = deps.documents.onChange(() => resolve(true)); });
    try { return await Promise.race([changed, end.then(() => false)]); }
    finally { off(); }
  };

  const run = async ({ selector, canvas }: InspectRequest, end: Promise<void>, ticket: number): Promise<InspectResult> => {
    started = ticket;
    // A run past its budget sends no further command: its answer is already given.
    let spent = false;
    void end.then(() => { spent = true; });
    const main = await deps.window.mainFrame();
    if (main === null) return failed("unavailable");
    // No proof yet (a load still finishing, or one lost to a debugger detach) is judged again on each bindings change,
    // as read-state does. Only a confirmed other canvas is not-shown: the renderer asks again when that document's
    // selection settles, while a missing proof gives it no such moment, so it gets unavailable and its Retry.
    let shown = shownNow(main, canvas);
    while (shown === null) {
      if (otherShown(main, canvas) && !requestedPending(main, canvas)) return failed("not-shown");
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
    const command = (method: string, params: object = {}) => deps.debugger.sendCommand(method, params, session);
    const send = (method: string, params: object = {}) => (spent ? Promise.reject(new Error("over budget")) : command(method, params));
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
      // main: about 6,300 a second on a canvas with a 60 fps counter and a rebuilt list. A run that timed out and a
      // later one has started since leaves them to that run, which needs them on and turns them off when it ends. A run
      // can start while CSS.disable is in flight, so DOM.disable checks again.
      if (started === ticket) await command("CSS.disable").catch(() => undefined);
      if (started === ticket) await command("DOM.disable").catch(() => undefined);
    }
  };

  return {
    inspect(request) {
      // The budget counts from the call, so time spent waiting in the queue counts too. A timeout does not cancel the
      // CDP commands already sent; their late answers are dropped. A request a newer one overtook while it waited runs
      // nothing: the renderer drops its answer anyway, and its CDP work would eat into the newer one's budget.
      const ticket = ++latest;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const end = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, BUDGET_MS);
      });
      const late = end.then(() => failed("unavailable"));
      const result = Promise.race([queue.then(() => (ticket === latest ? run(request, end, ticket) : failed("unavailable"))), late]).finally(() => clearTimeout(timer));
      // A request that ran out of time releases the queue, so one stuck call cannot block later ones.
      queue = result;
      return result;
    },
  };
}
