import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";
import { AlertIcon } from "../AlertIcon";
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

const { PrototypeConversationPanel, PrototypeHeadMenu } = await import("./PrototypeConversation");
const { NameTip } = await import("../NameTip");
const { DropdownMenu } = await import("radix-ui");
const { ConversationDeleteItem } = await import("../ConversationDeleteDialog");
const { PrototypeConversationRun } = await import("./conversationRun");
const { CanvasConversation } = await import("../CanvasConversationPanel");
const { authStatus } = await import("../../main/agentAuth/state");
const { modelsKey } = await import("../dockedSupport");

const ROOT = "/w/acme";
const CHECKOUT = { path: ".doan/canvases/checkout.html", id: "checkout" };
const summary = (patch: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId: "c1", canvas: CHECKOUT, title: "Ideas", owner: "doan",
  provider: "claude", fromHome: false, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "", ...patch,
});
const view = (over: Partial<PrototypeView> = {}): PrototypeView => ({
  gen: 1, root: ROOT, path: CHECKOUT.path, canvasId: "checkout", frame: "pay", title: "Pay", canvas: "checkout", phase: "ready", mode: "fit",
  run: { url: "http://x/a.html", markWidth: 390, markHeight: 844 }, frames: [{ id: "pay", title: "Pay", size: "390x844", number: 1 }],
  gotos: [], canGoBack: false, canGoForward: false, previousStopped: false, panel: { open: true, width: 280 }, canvasRow: "present", ...over,
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
    onConversationEvent: off(), onConversationStage: off(), onConversationBoundary: off(), onConversationListChanged: off(), onWorkChanged: off(), onTargetEntry: off(), onComposerSettings: off(), onAgentAuth: off(), onAgentUsage: off(), readAgentUsage: vi.fn(async () => []), onWindowVisible: off(),
    listConversations: vi.fn(async () => listed), getWork: vi.fn(async () => []), rememberedConversation: vi.fn(async () => null), conversationListed: vi.fn(async () => null), readTargetEntry: vi.fn(async () => ({ path: ROOT, kind: "list", servedRev: 0, canvases: [{ ...CHECKOUT, url: "u" }] })),
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
    // This window's calls, with its starts held in its canvas run so a list read never moves a draft still being sent.
    expect(panel.props.calls).toBe(run.bodyCalls);
    expect((panel.props.calls as Record<string, unknown>).listConversationSkills).toBe(calls.listConversationSkills);
    expect(panel.props.pick).toBeUndefined();
    expect(panel.props.composerLink).toBeUndefined();
    expect(panel.props.playing).toMatchObject({ frame: { id: "pay", title: "Pay" }, name: "Pay", description: "Frame Pay is sent with each message." });
    expect(panel.props.blocked).toBeNull();
    // The main window's panel rules: a failed read holds no send, and a refusal offers a new conversation.
    expect(panel.props.listFailed).toBeUndefined();
    expect(panel.props.newFromRefusal).toBeUndefined();
  });

  test("a canvas gone or sharing its ID locks the composer with the main panel's reasons", async () => {
    await playing({ canvasRow: "gone" });
    expect(render().props.blocked).toBe("This canvas isn’t listed in acme, so its conversation can’t continue.");
    run.setView(view({ canvasRow: "duplicate" }));
    expect(render().props.blocked).toBe("Another canvas has the same ID, so this conversation can’t continue. Run doan check in a terminal to find it.");
  });

  // Spec: a failed list read no longer holds Send in this window; the failure line offers Retry.
  test("a failed list read shows the failure line with Retry, and the composer can still send", async () => {
    calls.listConversations = vi.fn(async () => ({ error: "unknown" }));
    run = new PrototypeConversationRun(calls as never, { changed: () => { hooks.dirty = true; }, notice: () => {}, focused: () => true });
    await playing();
    expect(run.shown()).toEqual({ kind: "list_error" });
    const panel = render(true) as El & { inner: ReactNode };
    const composer = all(panel.inner).find(named("DockedComposer"))!.props as { unavailable: string | null; held: boolean };
    expect(composer.unavailable).toBeNull();
    expect(composer.held).toBe(false);
    const retry = all(panel.inner).find(element => element.type === "button" && element.props.children === "Retry")!;
    const reads = (calls.listConversations as ReturnType<typeof vi.fn>).mock.calls.length;
    (retry.props.onClick as () => void)();
    expect((calls.listConversations as ReturnType<typeof vi.fn>).mock.calls.length).toBe(reads + 1);
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
    panel.onOpenHandoff!(CHECKOUT as never, "c3" as never);
    // A canvas card's Open other than a handed-off one names the canvas alone; the main window opens it as Quick Open does.
    panel.onOpenHandoff!(CHECKOUT as never);
    // A handoff card from the Overview: its Open goes to the source conversation, which the main window shows there, and
    // whether that source still exists is the run's answer from main.
    panel.onOpenOverview!("p1" as never);
    expect(panel.conversationListed!("p1" as never)).toBe(true);
    expect((calls.reveal as ReturnType<typeof vi.fn>).mock.calls.map(([request]) => request)).toEqual([
      { kind: "reply", conversationId: "c1", link: { canvas: "checkout", kind: "frame", id: "pay" } },
      { kind: "settings", provider: "codex" },
      { kind: "handoff", canvas: CHECKOUT, conversationId: "c3" },
      { kind: "handoff", canvas: CHECKOUT },
      { kind: "conversation", conversationId: "p1" },
    ]);
  });

  // "Sign in to an agent" and "Manage agents" name no provider: Settings > Agents opens at its top.
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

// Spec: a send to a conversation another sign-in owns offers "Start a new conversation" here too, as the main window
// does; a new conversation no longer ends another one.
describe("refusals in the prototype window", () => {
  test("a conversation refused for a sign-in mismatch offers a new conversation", async () => {
    await playing();
    const panel = render(true) as El & { inner: ReactNode };
    const composer = all(panel.inner).find(named("DockedComposer"))!.props as { refuse(code: string, provider: string, resets: string | null): Record<string, unknown> };
    expect(composer.refuse("account_changed", "claude", null)).toMatchObject({ kind: "notice", startNew: true });
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

// Spec: the head's title is the canvas's conversation menu, the main window's menu model (draft frame
// prototype-head-menu). Its trigger uses aria-disabled, never disabled, so the head keeps a focus target while the list
// is read or the canvas is blocked.
describe("the head's conversation menu", () => {
  let onPicked: Mock<() => void>, onDelete: Mock<(target: unknown, trigger: HTMLElement | null) => boolean>;
  beforeEach(() => { onPicked = vi.fn<() => void>(); onDelete = vi.fn((_target: unknown, _trigger: HTMLElement | null) => true); });
  function head(): El {
    for (let round = 0; round < 20; round++) {
      hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.dirty = false;
      const tree = PrototypeHeadMenu({ run, now: Date.parse("2026-11-01T15:00:00"), onPicked, onDelete }) as El;
      const pending = hooks.pending.splice(0);
      for (const task of pending) task();
      if (!hooks.dirty && pending.length === 0) return tree;
    }
    throw new Error("did not settle");
  }
  const find = (tree: El, test: (element: El) => boolean) => all(tree).find(test);
  const trigger = (tree: El) => find(tree, element => element.type === "button" && String(element.props.className).startsWith("ov-title"))!;
  const root = (tree: El) => find(tree, element => element.type === DropdownMenu.Root)!;
  const rows = (tree: El) => all(tree).filter(element => element.type === DropdownMenu.RadioItem).map(element => element.props.value as string);
  const open = () => { (root(head()).props.onOpenChange as (open: boolean) => void)(true); return head(); };
  const at = (minute: number) => `2026-11-01T12:${String(minute).padStart(2, "0")}:00.000Z`;

  test("the trigger is the main window's title button with the shown conversation's title, and the head keeps New conversation", async () => {
    listed = [summary({ title: "Checkout Review details button" })];
    await playing();
    const tree = head();
    // The title shows in full in the shared tooltip while it is cut, not in a native title.
    expect(trigger(tree).props).toMatchObject({ type: "button", className: "ov-title doan-button" });
    expect(trigger(tree).props.title).toBeUndefined();
    expect(find(tree, element => element.type === NameTip)!.props.text).toBe("Checkout Review details button");
    expect(trigger(tree).props.disabled).toBeUndefined();
    expect(trigger(tree).props["aria-disabled"]).toBeUndefined();
    expect(find(tree, element => element.type === "span" && element.props.className === "ov-title-wrap doan-conv-title")).toBeDefined();
    const fresh = find(tree, element => element.type === "button" && element.props["aria-label"] === "New conversation")!;
    expect(fresh.props["aria-disabled"]).toBeUndefined();
  });

  test("while the list is read and while the canvas is blocked, the trigger reads Conversation, is aria-disabled and opens no menu", async () => {
    calls.listConversations = vi.fn(() => new Promise(() => {}));
    run = new PrototypeConversationRun(calls as never, { changed: () => { hooks.dirty = true; }, notice: () => {}, focused: () => true });
    await playing();
    for (const step of [() => {}, () => run.setView(view({ canvasRow: "gone" })), () => run.setView(view({ canvasRow: "duplicate" }))]) {
      step();
      const tree = open();
      expect(trigger(tree).props).toMatchObject({ "aria-disabled": true });
      expect(find(tree, element => element.type === NameTip)!.props.text).toBe("Conversation");
      expect(trigger(tree).props.disabled).toBeUndefined();
      expect(find(tree, element => element.type === DropdownMenu.Trigger)!.props.disabled).toBeFalsy();
      expect(root(tree).props.open).toBe(false);
    }
  });

  test("the menu: New conversation, then the canvas's conversations by recent activity, the shown one pressed, each with Delete", async () => {
    listed = [summary({ conversationId: "older", title: "Older", lastActivityAt: at(1) }), summary({ conversationId: "newer", title: "Newer", phase: "running", working: true, lastActivityAt: at(5) }),
      summary({ conversationId: "elsewhere", canvas: { path: ".doan/canvases/b.html", id: "b" }, lastActivityAt: at(9) })];
    await playing();
    run.run.select("older");
    const tree = open();
    expect(rows(tree)).toEqual(["", "newer", "older"]);
    const pressed = all(tree).filter(element => element.type === DropdownMenu.RadioItem && String(element.props.className).includes(" current")).map(element => element.props.value);
    expect(pressed).toEqual(["older"]);
    expect(all(tree).filter(element => element.type === ConversationDeleteItem).map(element => element.props.conversationId)).toEqual(["newer", "older"]);
    expect(find(tree, element => element.type === DropdownMenu.Content)!.props["aria-label"]).toBe("Conversations on checkout");
  });

  test("while open the order stays and a conversation started meanwhile goes last; closed, it is recent activity again", async () => {
    let answerList!: (list: ConversationSummary[]) => void;
    let changedList!: (change: { root: string }) => void;
    calls.onConversationListChanged = vi.fn((listener: typeof changedList) => { changedList = listener; return () => {}; });
    listed = [summary({ conversationId: "a", lastActivityAt: at(1) }), summary({ conversationId: "b", lastActivityAt: at(5) })];
    run = new PrototypeConversationRun(calls as never, { changed: () => { hooks.dirty = true; }, notice: () => {}, focused: () => true });
    await playing();
    expect(rows(open())).toEqual(["", "b", "a"]);
    calls.listConversations = vi.fn(() => new Promise(resolve => { answerList = resolve; }));
    changedList({ root: ROOT });
    answerList([summary({ conversationId: "a", lastActivityAt: at(8) }), summary({ conversationId: "b", lastActivityAt: at(5) }), summary({ conversationId: "c", lastActivityAt: at(9) })]);
    await flush();
    expect(rows(head())).toEqual(["", "b", "a", "c"]);
    (root(head()).props.onOpenChange as (open: boolean) => void)(false);
    expect(rows(head())).toEqual(["", "c", "a", "b"]);
  });

  // Review: rows added while the menu is open keep the place they were drawn at, also when later reads change their
  // activity; only closing sorts again.
  test("rows added one after another while open keep their drawn order", async () => {
    let answerList!: (list: ConversationSummary[]) => void;
    let changedList!: (change: { root: string }) => void;
    calls.onConversationListChanged = vi.fn((listener: typeof changedList) => { changedList = listener; return () => {}; });
    listed = [summary({ conversationId: "a", lastActivityAt: at(1) })];
    run = new PrototypeConversationRun(calls as never, { changed: () => { hooks.dirty = true; }, notice: () => {}, focused: () => true });
    await playing();
    expect(rows(open())).toEqual(["", "a"]);
    calls.listConversations = vi.fn(() => new Promise(resolve => { answerList = resolve; }));
    const steps: [ConversationSummary[], string[]][] = [
      [[summary({ conversationId: "a", lastActivityAt: at(1) }), summary({ conversationId: "b", lastActivityAt: at(5) })], ["", "a", "b"]],
      [[summary({ conversationId: "a", lastActivityAt: at(1) }), summary({ conversationId: "b", lastActivityAt: at(5) }), summary({ conversationId: "c", lastActivityAt: at(9) })], ["", "a", "b", "c"]],
      [[summary({ conversationId: "a", lastActivityAt: at(1) }), summary({ conversationId: "b", lastActivityAt: at(12) }), summary({ conversationId: "c", lastActivityAt: at(9) })], ["", "a", "b", "c"]],
    ];
    for (const [next, order] of steps) {
      changedList({ root: ROOT });
      answerList(next);
      await flush();
      expect(rows(head())).toEqual(order);
    }
    (root(head()).props.onOpenChange as (open: boolean) => void)(false);
    expect(rows(head())).toEqual(["", "b", "c", "a"]);
  });

  test("a failed read: the menu's failure line with Retry, which reads again", async () => {
    calls.listConversations = vi.fn(async () => ({ error: "unknown" }));
    run = new PrototypeConversationRun(calls as never, { changed: () => { hooks.dirty = true; }, notice: () => {}, focused: () => true });
    await playing();
    const tree = open();
    expect(root(tree).props.open).toBe(true);
    expect(trigger(tree).props["aria-disabled"]).toBeUndefined();
    const line = find(tree, element => element.props.className === "conv-error")!;
    // DESIGN 'No coloured edge stripes': the failure line leads with the alert icon.
    expect(all(line).some(element => element.type === AlertIcon)).toBe(true);
    const retry = all(line).find(element => element.type === DropdownMenu.Item)!;
    const reads = (calls.listConversations as ReturnType<typeof vi.fn>).mock.calls.length;
    (retry.props.onSelect as (event: { preventDefault(): void }) => void)({ preventDefault: () => {} });
    expect((calls.listConversations as ReturnType<typeof vi.fn>).mock.calls.length).toBe(reads + 1);
  });

  // D11: the row runs while its read is out, the panel's thread Retry with it, and a second failure is read out again.
  test("a failed read's Retry runs until the read settles, and a repeated failure changes the line", async () => {
    let fail: (reply: { error: string }) => void = () => {};
    calls.listConversations = vi.fn(async () => ({ error: "unknown" }));
    run = new PrototypeConversationRun(calls as never, { changed: () => { hooks.dirty = true; }, notice: () => {}, focused: () => true });
    await playing();
    expect(run.listRetry()).toEqual({ running: false, failures: 0 });
    const firstLine = (all(find(open(), element => element.props.className === "conv-error")!).find(element => element.type === "span")!.props.children);
    calls.listConversations = vi.fn(() => new Promise(resolve => { fail = resolve; }));
    run.retry();
    expect(run.listRetry()).toEqual({ running: true, failures: 0 });
    const line = find(open(), element => element.props.className === "conv-error")!;
    const retry = all(line).find(element => element.type === DropdownMenu.Item)!;
    expect(retry.props).toMatchObject({ "aria-disabled": true, "aria-busy": true });
    // A press while it runs reads nothing more.
    (retry.props.onSelect as (event: { preventDefault(): void }) => void)({ preventDefault: () => {} });
    expect(calls.listConversations).toHaveBeenCalledTimes(1);
    fail({ error: "unknown" });
    await flush();
    expect(run.listRetry()).toEqual({ running: false, failures: 1 });
    const againLine = all(find(open(), element => element.props.className === "conv-error")!).find(element => element.type === "span")!.props.children;
    expect(againLine).not.toBe(firstLine);
    expect(String(againLine).trim()).toBe(String(firstLine).trim());
  });

  test("choosing a row or New conversation changes what this window shows, and focus goes on once the menu closes", async () => {
    listed = [summary({ conversationId: "a", title: "A", lastActivityAt: at(1) }), summary({ conversationId: "b", title: "B", lastActivityAt: at(5) })];
    await playing();
    const group = () => find(open(), element => element.type === DropdownMenu.RadioGroup)!;
    (group().props.onValueChange as (value: string) => void)("a");
    expect(run.shown()).toEqual({ kind: "conversation", conversationId: "a" });
    (find(head(), element => element.type === DropdownMenu.Content)!.props.onCloseAutoFocus as (event: { preventDefault(): void }) => void)({ preventDefault: () => {} });
    expect(onPicked).toHaveBeenCalledOnce();
    (group().props.onValueChange as (value: string) => void)("");
    expect(run.shown()).toEqual({ kind: "new" });
    expect(head() && find(head(), element => element.type === "button" && element.props["aria-label"] === "New conversation")!.props["aria-disabled"]).toBe(true);
  });

  test("a row's Delete hands the host the conversation, from the canvas, with the trigger to return focus to", async () => {
    listed = [summary({ conversationId: "a", title: "A", provider: "codex" })];
    await playing();
    const item = find(open(), element => element.type === ConversationDeleteItem)!;
    (item.props.onDelete as () => void)();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete.mock.calls[0]![0]).toEqual({ conversationId: "a", root: ROOT, title: "A", provider: "codex", from: "canvas" });
  });
});
