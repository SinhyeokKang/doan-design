import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { ConversationSummary } from "../../main/conversation/summary";
import type { PrototypeView } from "../../main/prototype/ipc";

// The prototype window's panel with hooks as plain state (the App tests' no-DOM style): the headless body gets this
// window's calls, its playing frame, its blocked reasons, and every main-window-only button goes to main as a reveal.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as ({ deps: unknown[] | undefined; cleanup?: () => void } | undefined)[],
  pending: [] as (() => void)[], cursor: 0, refCursor: 0, effectCursor: 0, dirty: false,
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const effect = (run: () => unknown, deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
    const slot: { deps: unknown[] | undefined; cleanup?: () => void } = { deps };
    hooks.effects[index] = slot;
    hooks.pending.push(() => { previous?.cleanup?.(); const cleanup = run(); if (typeof cleanup === "function") slot.cleanup = cleanup as () => void; });
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.states[index], (next: unknown) => {
        const value = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next;
        if (!Object.is(value, hooks.states[index])) { hooks.states[index] = value; hooks.dirty = true; }
      }];
    },
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: effect, useLayoutEffect: effect,
  };
});

const { PrototypeConversationPanel, PrototypeHeadTitle } = await import("./PrototypeConversation");
const { PrototypeConversationRun } = await import("./conversationRun");
const { CanvasConversation } = await import("../CanvasConversationPanel");
const { authStatus } = await import("../../main/agentAuth/state");
const { modelsKey } = await import("../dockedSupport");

const ROOT = "/w/acme";
const CHECKOUT = { path: ".doan/canvases/checkout.html", id: "checkout" };
const summary = (patch: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId: "c1", canvas: CHECKOUT, title: "Ideas", state: "current", owner: "doan",
  provider: "claude", fromHome: false, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "", ...patch,
});
const view = (over: Partial<PrototypeView> = {}): PrototypeView => ({
  gen: 1, root: ROOT, path: CHECKOUT.path, canvasId: "checkout", frame: "pay", title: "Pay", canvas: "checkout", phase: "ready", mode: "fit",
  run: { url: "http://x/a.html", markWidth: 390, markHeight: 844 }, frames: [{ id: "pay", title: "Pay", size: "390x844", number: 1 }],
  canGoBack: false, canGoForward: false, previousStopped: false, panel: { open: true, width: 280 }, canvasRow: "present", ...over,
});
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

type El = ReactElement<Record<string, unknown>>;
function all(node: ReactNode): El[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...all(node.props.children as ReactNode)];
}
const named = (name: string) => (element: El) => typeof element.type === "function" && element.type.name === name;

let calls: Record<string, ReturnType<typeof vi.fn> | Record<string, ReturnType<typeof vi.fn>>>;
let listed: ConversationSummary[];
let run: InstanceType<typeof PrototypeConversationRun>;

beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", { activeElement: null, hasFocus: () => true });
  listed = [summary()];
  const off = () => vi.fn(() => () => {});
  calls = {
    onConversationEvent: off(), onConversationStage: off(), onConversationListChanged: off(), onWorkChanged: off(), onTargetEntry: off(), onComposerSettings: off(), onAgentAuth: off(), onWindowVisible: off(), onDrawing: off(), readDrawing: vi.fn(async () => null), onPromoted: off(), readPromoted: vi.fn(async () => null),
    listConversations: vi.fn(async () => listed), getWork: vi.fn(async () => []), readTargetEntry: vi.fn(async () => ({ path: ROOT, kind: "list", servedRev: 0, canvases: [{ ...CHECKOUT, url: "u" }] })),
    readComposerSettings: vi.fn(async () => ({ home: null, newConversation: null, buddy: "doany" })),
    readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null), markConversationSeen: vi.fn(async () => {}),
    setShowing: vi.fn(async () => {}), reveal: vi.fn(async () => {}), rememberChoice: vi.fn(async () => {}),
    conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })), listConversationSkills: vi.fn(async () => ({ skills: [] })),
    listConversationModels: vi.fn(async () => ({ models: [{ id: "opus", label: "Opus", default: true, efforts: ["high"] }] })),
    designSkills: { list: vi.fn(async () => ({ v: 1, ok: true, result: { version: "1", presets: [] } })), get: vi.fn() },
    setConversationPermissionMode: vi.fn(async () => undefined), scheduledMessages: vi.fn(async () => []),
    startConversation: vi.fn(), sendConversation: vi.fn(), queueConversation: vi.fn(), removeQueuedMessage: vi.fn(), sendQueuedNow: vi.fn(), interruptConversation: vi.fn(),
    answerConversationPermission: vi.fn(), answerConversationQuestion: vi.fn(), openLink: vi.fn(), chooseAttachments: vi.fn(), addAttachmentFiles: vi.fn(), addPastedImage: vi.fn(),
    droppedPath: vi.fn(() => null), removeAttachment: vi.fn(async () => true), releaseAttachments: vi.fn(async () => true), recheckAttachments: vi.fn(), attachmentsFromPaths: vi.fn(),
  };
  run = new PrototypeConversationRun(calls as never, { changed: () => { hooks.dirty = true; }, notice: () => {}, focused: () => true });
});
afterEach(() => vi.unstubAllGlobals());

async function playing(over: Partial<PrototypeView> = {}) {
  run.connect();
  run.setView(view(over));
  await flush();
  run.support.auth = { revision: 1, providers: [authStatus({ provider: "claude", generation: 1, verified: true, expired: false, connection: { provider: "claude", connectionId: "c", profile: "claude", account: {} }, attempt: null, error: null, phase: "connected" } as never, { cli: "found", version: "supported", tools: "ready" }, 1)] };
  run.support.models = { [modelsKey(ROOT, "claude", 1)]: { models: [{ id: "opus", label: "Opus", default: true, efforts: ["high"] }] } };
}
// The panel, and the body inside it run too (`body`), so their effects run as they would mounted.
function render(body = false): El {
  for (let round = 0; round < 20; round++) {
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.dirty = false;
    const tree = PrototypeConversationPanel({ run, calls: calls as never, now: Date.parse("2026-11-01T15:00:00") });
    const panel = all(tree).find(element => element.type === CanvasConversation)!;
    const inner = body ? CanvasConversation(panel.props as never) : null;
    const pending = hooks.pending.splice(0);
    for (const task of pending) task();
    if (!hooks.dirty && pending.length === 0) return (body ? { ...panel, inner } : panel) as El;
  }
  throw new Error("did not settle");
}
const props = (element: El) => element.props as Record<string, (...args: never[]) => unknown> & Record<string, unknown>;

describe("the headless body in the prototype window", () => {
  test("renders with this window's calls and no window.doan", async () => {
    await playing();
    const panel = render();
    expect((window as { doan?: unknown }).doan).toBeUndefined();
    // This window's calls, with its sends counted so a list read never moves a draft still being sent.
    expect(panel.props.calls).toBe(run.bodyCalls);
    expect((panel.props.calls as Record<string, unknown>).listConversationSkills).toBe(calls.listConversationSkills);
    expect(panel.props.pick).toBeUndefined();
    expect(panel.props.composerLink).toBeUndefined();
    expect(panel.props.playing).toMatchObject({ frame: { id: "pay", title: "Pay" }, name: "Pay", description: "Frame Pay is sent with each message." });
    expect(panel.props.blocked).toBeNull();
    expect(panel.props.listFailed).toBe(false);
  });

  test("a canvas gone or sharing its ID locks the composer with the main panel's reasons", async () => {
    await playing({ canvasRow: "gone" });
    expect(render().props.blocked).toBe("This canvas isn’t listed in acme, so its conversation can’t continue.");
    run.setView(view({ canvasRow: "duplicate" }));
    expect(render().props.blocked).toBe("Another canvas has the same ID, so this conversation can’t continue. Run doan check in a terminal to find it.");
  });

  test("a failed list read gives the body its failure line, and the composer cannot send", async () => {
    calls.listConversations = vi.fn(async () => ({ error: "unknown" }));
    run = new PrototypeConversationRun(calls as never, { changed: () => { hooks.dirty = true; }, notice: () => {}, focused: () => true });
    await playing();
    expect(render().props.listFailed).toBe(true);
  });
});

describe("main-window-only buttons go to main as reveals", () => {
  test("a person's chip in the thread names its conversation", async () => {
    await playing();
    await expect(props(render()).onLocate!({ frame: { id: "pay", title: "Pay" } } as never)).resolves.toBe("shown");
    expect(calls.reveal).toHaveBeenCalledWith({ kind: "chip", conversationId: "c1", anchor: { frame: { id: "pay", title: "Pay" } } });
  });

  test("an answer's chip, Sign in and the Open buttons", async () => {
    await playing();
    const panel = props(render());
    await expect(panel.onReplyChip!({ canvas: "checkout", kind: "frame", id: "pay" } as never)).resolves.toBeNull();
    panel.onSettings!({ section: "agents", provider: "codex" } as never);
    panel.onOpenProjectConversation!("p1" as never);
    panel.onOpenPromoted!("c2" as never);
    panel.onOpenHandoff!(CHECKOUT as never, "c3" as never);
    expect((calls.reveal as ReturnType<typeof vi.fn>).mock.calls.map(([request]) => request)).toEqual([
      { kind: "reply", conversationId: "c1", link: { canvas: "checkout", kind: "frame", id: "pay" } },
      { kind: "settings", provider: "codex" },
      { kind: "conversation", conversationId: "p1" },
      { kind: "conversation", conversationId: "c2" },
      { kind: "handoff", canvas: CHECKOUT, conversationId: "c3" },
    ]);
  });

  // "Sign in to an agent…" and "Manage agents…" name no provider: Settings > Agents opens at its top.
  test("a Settings action without a provider still goes to the main window", async () => {
    await playing();
    props(render()).onSettings!({ section: "agents" } as never);
    expect(calls.reveal).toHaveBeenCalledExactlyOnceWith({ kind: "settings" });
  });

  test("a chip in the new conversation state's field has no conversation to name, so nothing moves", async () => {
    listed = [];
    await playing();
    await expect(props(render()).onLocate!({ frame: { id: "pay" } } as never)).resolves.toBe("unavailable");
    expect(calls.reveal).not.toHaveBeenCalled();
  });
});

// This window cannot start a new conversation while the canvas has a current one: a refusal of that conversation
// (another sign-in owns it) offers no "Start a new conversation" here. A terminal session's refusal still switches to
// the new conversation it shares a field with.
describe("refusals in the prototype window", () => {
  test("a refused conversation offers no new conversation; a refused terminal session still does", async () => {
    await playing();
    const panel = render(true) as El & { inner: ReactNode };
    const composer = all(panel.inner).find(named("DockedComposer"))!.props as { refuse(code: string, provider: string, resets: string | null): Record<string, unknown> };
    expect(composer.refuse("account_changed", "claude", null)).toMatchObject({ kind: "notice" });
    expect(composer.refuse("account_changed", "claude", null).startNew).toBeFalsy();
  });

  test("in the new conversation state the terminal session's refusal keeps its way to a new conversation", async () => {
    listed = [];
    calls.conversationResumeTarget = vi.fn(async () => ({ available: true, runtime: "claude", lastCheckAt: "2026-11-01T12:00:00.000Z", session: "s1" }));
    run = new PrototypeConversationRun(calls as never, { changed: () => { hooks.dirty = true; }, notice: () => {}, focused: () => true });
    await playing();
    await flush();
    const panel = render(true) as El & { inner: ReactNode };
    const composer = all(panel.inner).find(named("DockedComposer"))!.props as { mode: { kind: string }; refuse(code: string, provider: string, resets: string | null): Record<string, unknown> };
    expect(composer.mode.kind).toBe("resume");
    expect(composer.refuse("session_unavailable", "claude", null)).toMatchObject({ kind: "notice", startNew: true });
  });
});

// POSTMORTEM 2026-11-06: an untouched composer remembers nothing; a pick is Last used, through the main window.
describe("Last used from the prototype composer", () => {
  test("an untouched mount remembers nothing; a pick goes to main as the choice", async () => {
    listed = [];
    await playing();
    let panel = render(true) as El & { inner: ReactNode };
    expect(calls.rememberChoice).not.toHaveBeenCalled();
    const composer = all(panel.inner).find(named("DockedComposer"))!.props as { onPickPermission(mode: string): void };
    composer.onPickPermission("plan");
    panel = render(true) as El & { inner: ReactNode };
    expect(calls.rememberChoice).toHaveBeenCalledOnce();
    expect((calls.rememberChoice as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({ provider: "claude", permissionMode: "plan" });
    expect((calls.rememberChoice as ReturnType<typeof vi.fn>).mock.calls[0]![0]).not.toHaveProperty("modelPicked");
  });
});

// The head's title is one line: the whole title is the native tooltip only while the span is cut short, judged again on
// the span's own resize (the window, the handle) and on a new title.
describe("the panel head's title", () => {
  let observed: (() => void) | null;
  const span = { scrollWidth: 120, clientWidth: 200 };
  function head(): El {
    for (let round = 0; round < 20; round++) {
      hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.dirty = false;
      const tree = PrototypeHeadTitle({ run }) as El;
      const pending = hooks.pending.splice(0);
      for (const task of pending) task();
      if (!hooks.dirty && pending.length === 0) return tree;
    }
    throw new Error("did not settle");
  }
  beforeEach(() => {
    observed = null;
    span.scrollWidth = 120; span.clientWidth = 200;
    hooks.refs[0] = { current: span };
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { observed = callback; } observe() {} disconnect() {} });
  });

  test("the shell's static h2 with the title in a span, focusable by script only", async () => {
    listed = [summary({ title: "Checkout Review details button" })];
    await playing();
    const tree = head();
    expect(tree.type).toBe("h2");
    expect(tree.props).toMatchObject({ className: "phead rp-head", tabIndex: -1, title: undefined });
    const text = tree.props.children as El;
    expect(text.props).toMatchObject({ className: "pw-side-title", children: "Checkout Review details button" });
  });

  test("a title cut short is the native tooltip; once it fits again it is not", async () => {
    listed = [summary({ title: "Checkout Review details button" })];
    await playing();
    expect(head().props.title).toBeUndefined();
    span.clientWidth = 80;
    observed!();
    expect(head().props.title).toBe("Checkout Review details button");
    span.clientWidth = 200;
    observed!();
    expect(head().props.title).toBeUndefined();
  });

  test("a new title is judged again", async () => {
    listed = [summary({ title: "Ideas" })];
    await playing();
    expect(head().props.title).toBeUndefined();
    span.scrollWidth = 400;
    run.setView(view({ canvasRow: "gone" }));
    expect(head().props).toMatchObject({ title: "Conversation" });
  });
});
