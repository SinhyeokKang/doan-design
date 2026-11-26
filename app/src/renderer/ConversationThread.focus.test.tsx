import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Question } from "../main/conversation/question";
import type { ConversationThreadProps } from "./ConversationThread";
import type { ThreadItem } from "./threadItems";

// Once a request ends, focus that was in the popover moves by composerRules.focusAfter. No DOM here (ARCHITECTURE §7 'Home
// tests without a DOM'); a native button's Enter and Space reach onClick, so the click covers them.
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0,
  layout: [] as ({ deps: unknown[] | undefined } | undefined)[], layoutCursor: 0, pending: [] as (() => void)[],
  handle: null as { focusItem(key: string): boolean } | null,
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const slot = <T,>(init: () => T): number => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = init();
    return index;
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = slot(() => typeof initial === "function" ? (initial as () => unknown)() : initial);
      return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[index]) : next; }];
    },
    useRef: (value: unknown) => hooks.slots[slot(() => ({ current: value }))],
    useMemo: (factory: () => unknown) => factory(),
    useEffect: () => {}, useImperativeHandle: (_ref: unknown, make: () => { focusItem(key: string): boolean }) => { hooks.handle = make(); },
    useLayoutEffect: (run: () => void, deps?: unknown[]) => {
      const index = hooks.layoutCursor++, previous = hooks.layout[index];
      if (previous && deps && previous.deps && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
      hooks.layout[index] = { deps };
      hooks.pending.push(run);
    },
    useId: () => "k",
  };
});
const { ConversationThread, HandoffBubble, ThreadEntry } = await import("./ConversationThread");
const { AnswerPopover } = await import("./AnswerPopover");

const question: Question = { id: "0", header: "Layout", question: "Which layout?", options: [{ label: "Compact" }], multiSelect: false, other: true };
const permission = (requestId: string, status: "pending" | "answered" | "expired" = "pending"): ThreadItem => ({ kind: "permission", key: `p${requestId}`, seq: 1, requestId, summary: `Run ${requestId}`,
  options: [{ id: "allow", kind: "allow", label: "Allow" }, { id: "reject", kind: "reject", label: "Deny" }], status, answer: status === "answered" ? { id: "allow", kind: "allow", label: "Allow" } : null } as ThreadItem);
const asked = (requestId: string, status: "pending" | "answered" | "skipped" | "expired" = "pending"): ThreadItem => ({ kind: "question", key: `q${requestId}`, seq: 2, requestId, questions: [question], status, answers: null });

const body = { tagName: "BODY" };
let active: unknown;
let controls: Map<string, { focus: ReturnType<typeof vi.fn>; scrollIntoView: ReturnType<typeof vi.fn>; closest(selector: string): unknown }>;
// Whether the drawn popover is cramped (its body and buttons scroll under its head).
let cramped = false;
let composer: ReturnType<typeof vi.fn<() => void>>;
let tree: ReactElement<Record<string, unknown>>[];
let props: ConversationThreadProps;
// The host's fold (conversationStore), as a flag.
let fold: { collapsed: boolean };

beforeEach(() => {
  hooks.slots = []; hooks.layout = [];
  active = body; controls = new Map(); composer = vi.fn<() => void>(); fold = { collapsed: false }; cramped = false;
  vi.stubGlobal("document", { get activeElement() { return active; }, body, hasFocus: () => true });
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  props = {
    conversationId: "c1", items: [], provider: "claude", project: "acme", liveAfter: 0, canvasListed: () => true, visibility: { onWindowVisible: () => () => {} }, now: 0,
    onAnswer: () => new Promise(() => {}), onAnswerQuestion: () => new Promise(() => {}), onFocusComposer: composer,
    onStop: vi.fn(), onEditAndResend: () => {}, onSignIn: () => {}, onRetry: () => {}, onOpenCanvas: () => {}, onOpenLink: () => {}, onCopy: async () => true,
    popoverCollapsed: () => fold.collapsed, onCollapse: vi.fn(() => { fold.collapsed = true; }), onExpand: vi.fn(() => { fold.collapsed = false; }),
  };
});
afterEach(() => vi.unstubAllGlobals());

function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  // A thread item and the popover draw their content when React renders them; draw it here as that render would.
  const drawn = node.type === ThreadEntry ? [(node.props.draw as (entry: unknown) => ReactNode)(node.props.entry)]
    : node.type === AnswerPopover ? [(AnswerPopover as (props: unknown) => ReactNode)(node.props)] : [];
  return [node, ...[node.props.children, ...drawn].flat().flatMap(child => all(child as ReactNode))];
}
// One render with these items, then its layout effects. commit: what happens to focus as React commits this render (a
// folded card's control leaving the page takes focus to the body).
function draw(items: ThreadItem[], commit?: () => void): void {
  hooks.cursor = 0; hooks.layoutCursor = 0; hooks.pending = [];
  props = { ...props, items };
  const outer = (ConversationThread as unknown as { render(props: ConversationThreadProps, ref: null): ReactElement<ConversationThreadProps> }).render(props, null);
  tree = all((outer.type as (props: ConversationThreadProps) => ReactNode)(outer.props));
  const scroller = tree.find(element => element.props.className === "thread-scroll doan-scroll")!.props.ref as { current: unknown };
  // Focus is found and moved within the whole thread, the popover included; a card's Open is found in the scroller.
  const root = tree.find(element => element.props.className === "conversation-thread")!.props.ref as { current: unknown };
  const query = {
    contains: (node: unknown) => typeof node === "object" && node !== null && "item" in node,
    querySelector: (selector: string) => {
      const key = /data-item="([^"]+)"/.exec(selector)?.[1] ?? "";
      if (!controls.has(key)) controls.set(key, { focus: vi.fn(() => { active = { key }; }), scrollIntoView: vi.fn(), closest: (selector: string) => cramped && selector.includes("data-cramped") ? {} : null });
      return controls.get(key);
    },
  };
  root.current = query;
  scroller.current = { scrollHeight: 100, scrollTop: 0, clientHeight: 100, querySelector: query.querySelector };
  commit?.();
  for (const run of hooks.pending) run();
}
const permissionButton = (requestId: string, label: string) => tree.find(element => element.type === "button" && element.props["data-request"] === requestId && [element.props.children].flat().includes(label))!;
const popover = () => tree.find(element => element.type === AnswerPopover);
const stopOf = (requestId: string) => {
  const shown = popover()!;
  expect((shown.props.item as { requestId: string }).requestId).toBe(requestId);
  return shown.props.onStop as () => void;
};
// The pressed button is gone once its card folds, so the page body holds focus by then.
const press = (run: () => void) => { active = { pressed: true }; run(); active = body; };
const focusedOption = () => [...controls].filter(([, control]) => control.focus.mock.calls.length > 0).map(([key]) => key);

test("a permission answer moves focus to the next waiting request once it ends, and to the composer after the last", () => {
  draw([permission("a"), permission("b")]);
  press(() => (permissionButton("a", "Allow").props.onClick as () => void)());
  // Still pending until main's resolution arrives: nothing moves yet.
  draw([permission("a"), permission("b")]);
  expect(focusedOption()).toEqual([]);
  draw([permission("a", "answered"), permission("b")]);
  expect(focusedOption()).toEqual(["pb"]);
  expect(composer).not.toHaveBeenCalled();
  active = body;
  press(() => (permissionButton("b", "Deny").props.onClick as () => void)());
  draw([permission("a", "answered"), permission("b", "answered")]);
  expect(composer).toHaveBeenCalledOnce();
});

test("a permission answer leaves focus alone when the person moved it elsewhere before the card folded", () => {
  draw([permission("a")]);
  press(() => (permissionButton("a", "Allow").props.onClick as () => void)());
  active = { elsewhere: true };
  draw([permission("a", "answered")]);
  expect(composer).not.toHaveBeenCalled();
  expect(focusedOption()).toEqual([]);
});

test("Stop on a permission request or a question moves focus to the composer once it ends, with or without another request", () => {
  for (const [stopped, other] of [["a", true], ["a", false], ["q", true], ["q", false]] as const) {
    hooks.slots = []; hooks.layout = []; controls = new Map(); composer.mockClear(); active = body;
    const card = (status: "pending" | "expired") => stopped === "a" ? permission("a", status) : asked("q", status);
    const rest = other ? [stopped === "a" ? asked("q") : permission("a")] : [];
    draw([card("pending"), ...rest]);
    press(stopOf(stopped));
    expect(props.onStop).toHaveBeenCalled();
    draw([card("expired"), ...rest]);
    expect(composer, `${stopped} other=${other}`).toHaveBeenCalledOnce();
    expect(focusedOption(), `${stopped} other=${other}`).toEqual([]);
  }
});

test("a question's Skip moves focus to the next waiting request once it ends", () => {
  draw([asked("q"), permission("b")]);
  press(popover()!.props.onSkip as () => void);
  draw([asked("q", "skipped"), permission("b")]);
  expect(focusedOption()).toEqual(["pb"]);
});

// A card the agent's CLI cancels folds as expired with no press here. Focus that was in it, or its
// Other text not sent, moves on as after an answer; any other card folding leaves focus alone.
const inCard = (key: string) => ({ item: key, closest: () => ({ getAttribute: () => key }) });
const toBody = () => { active = body; };
test("a cancelled card that held focus hands it to the next waiting request, or to the composer after the last", () => {
  draw([asked("q"), permission("b")]);
  active = inCard("qq");
  draw([asked("q", "expired"), permission("b")], toBody);
  expect(focusedOption()).toEqual(["pb"]);
  active = inCard("pb");
  draw([asked("q", "expired"), permission("b", "expired")], toBody);
  expect(composer).toHaveBeenCalledOnce();
});

test("a cancelled question whose Other field held unsent text moves focus from the page to the composer", () => {
  props = { ...props, questionDraft: () => ({ choices: { "0": { selected: [], other: true, text: "Grid" } }, step: 0, sending: null, failed: null }) };
  draw([asked("q")]);
  draw([asked("q", "expired")]);
  expect(composer).toHaveBeenCalledOnce();
});

test("a cancelled card focus was not in, with nothing typed, moves no focus", () => {
  draw([asked("q"), permission("b")]);
  draw([asked("q", "expired"), permission("b")]);
  active = inCard("pb");
  draw([asked("q", "expired"), permission("b"), permission("c")]);
  draw([asked("q", "expired"), permission("b"), permission("c", "expired")]);
  expect(composer).not.toHaveBeenCalled();
  expect(focusedOption()).toEqual([]);
});

// The first of two windows' answers wins; the later one's stale reply shows no failure, whichever of it and
// permission.resolved arrives first (Electron does not order a handle reply against an earlier send; POSTMORTEM 2026-10-26).
const alerted = () => tree.some(element => String(element.props.className).split(" ").includes("ask-error"));
test("a stale permission answer shows no failure, before or after the resolution arrives", async () => {
  for (const order of ["reply first", "resolved first"] as const) {
    hooks.slots = []; hooks.layout = []; controls = new Map(); active = body;
    let reply!: (value: { error: string }) => void;
    props = { ...props, onAnswer: () => new Promise(resolve => { reply = resolve; }) };
    draw([permission("a")]);
    press(() => (permissionButton("a", "Allow").props.onClick as () => void)());
    if (order === "reply first") {
      reply({ error: "stale" });
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      draw([permission("a")]);
      expect(alerted(), order).toBe(false);
      draw([permission("a", "answered")]);
    } else {
      draw([permission("a", "answered")]);
      reply({ error: "stale" });
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      draw([permission("a", "answered")]);
    }
    expect(alerted(), order).toBe(false);
  }
});

test("an answer main refused for another reason still asks to choose again", async () => {
  props = { ...props, onAnswer: async () => ({ error: "not_found" }) };
  draw([permission("a")]);
  press(() => (permissionButton("a", "Allow").props.onClick as () => void)());
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  draw([permission("a")]);
  expect(alerted()).toBe(true);
  // The shared inline error line with the alert icon.
  const line = tree.find(element => String(element.props.className).split(" ").includes("ask-error"))!;
  expect(line.type).toBe("p");
  expect(line.props).toMatchObject({ className: "settings-msg error ask-error", role: "alert" });
});

// A turn's cards sit above a request still waiting and below it once it folds (threadItems placeCards), so React moves
// the card stack past the request, and moving a focused control's ancestor drops its focus to the page.
const card = (path: string): ThreadItem => ({ kind: "canvasCard", key: `ct1:${path}`, canvas: { path }, drawing: true, drawn: true });
test("a card's Open that held focus keeps it when the stack moves below a request that folded", () => {
  draw([card("a.html"), permission("p")]);
  active = inCard("ct1:a.html");
  draw([permission("p", "expired"), card("a.html")], toBody);
  expect(focusedOption()).toEqual(["ct1:a.html"]);
  expect(composer).not.toHaveBeenCalled();
});
test("focus is not brought back to a card when the person moved it elsewhere or the card is gone", () => {
  draw([card("a.html"), permission("p")]);
  active = inCard("ct1:a.html");
  draw([permission("p", "expired"), card("a.html")], () => { active = { elsewhere: true }; });
  expect(focusedOption()).toEqual([]);
  active = inCard("ct1:a.html");
  draw([permission("p", "expired")], toBody);
  expect(focusedOption()).toEqual([]);
});

// After a handoff's move the panel focuses the received handoff's group itself (labelled, tabindex -1), whose next Tab is
// its Open, and scrolls its top (the meta line) into view.
const received: ThreadItem = { kind: "handoffCard", key: "u1", seq: 1, origin: { kind: "handoff", conversationId: "c0", canvas: { path: ".doan/canvases/drafts.html", id: "drafts" } }, text: "Continue.", at: "2026-11-25T05:00:00.000Z" };
const handoffGroup = () => {
  const bubble = tree.find(element => element.type === HandoffBubble)!;
  return all((bubble.type as (props: unknown) => ReactNode)(bubble.props)).find(element => element.props.role === "group")!;
};
test("focusItem on a received handoff focuses its group, which is the item's entry", () => {
  const selectors: string[] = [];
  draw([received]);
  const root = tree.find(element => element.props.className === "conversation-thread")!.props.ref as { current: { querySelector(selector: string): unknown } };
  const query = root.current.querySelector.bind(root.current);
  root.current.querySelector = (selector: string) => { selectors.push(selector); return query(selector); };
  expect(handoffGroup().props).toMatchObject({ className: "msg-user", role: "group", tabIndex: -1, "data-entry": "", "aria-label": "Handoff from drafts.html" });
  expect(hooks.handle!.focusItem("u1")).toBe(true);
  expect(selectors).toEqual(['[data-item="u1"] :is([data-entry], .ap-bar)']);
  expect(focusedOption()).toEqual(["u1"]);
});
test("scrollToItem brings a received handoff's top into view, any other item's centre", () => {
  draw([received, { kind: "agent", key: "m2", messageId: "m2", text: "On it.", streaming: false }]);
  const scroller = tree.find(element => element.props.className === "thread-scroll doan-scroll")!.props.ref as { current: unknown };
  const scrolled: [string, unknown][] = [];
  scroller.current = { querySelector: (selector: string) => {
    const key = /data-item="([^"]+)"/.exec(selector)?.[1] ?? "";
    return { querySelector: (inner: string) => key === "u1" && inner === ".from-agent" ? {} : null, scrollIntoView: (options: unknown) => scrolled.push([key, options]) };
  } };
  const handle = hooks.handle as unknown as { scrollToItem(key: string): void };
  handle.scrollToItem("u1");
  handle.scrollToItem("m2");
  expect(scrolled).toEqual([["u1", { block: "start", behavior: "smooth" }], ["m2", { block: "center", behavior: "smooth" }]]);
});

describe("the popover's focus", () => {
  const waiting = [permission("a"), asked("q")];
  const escape = () => ({ key: "Escape", defaultPrevented: false, nativeEvent: { isComposing: false, keyCode: 0 }, preventDefault: vi.fn(), stopPropagation: vi.fn() });
  const wrapper = () => all((AnswerPopover as (props: unknown) => ReactNode)(popover()!.props))[0]!;

  test("Esc collapses it, covering every waiting request, and sends focus to the composer", () => {
    draw(waiting);
    (wrapper().props.onKeyDown as (event: unknown) => void)(escape());
    expect(props.onCollapse).toHaveBeenCalledExactlyOnceWith(["a", "q"]);
    expect(composer).toHaveBeenCalledOnce();
  });

  test("Collapse puts focus on the bar once it draws", () => {
    draw(waiting);
    (popover()!.props.onCollapse as () => void)();
    expect(props.onCollapse).toHaveBeenCalledExactlyOnceWith(["a", "q"]);
    draw(waiting);
    expect(popover()!.props.collapsed).toBe(true);
    expect(focusedOption()).toEqual(["pa"]);
  });

  test("the bar opens it and focus goes to its first choice once it draws open", () => {
    fold.collapsed = true;
    draw(waiting);
    (popover()!.props.onExpand as () => void)();
    expect(fold.collapsed).toBe(false);
    draw(waiting);
    expect(focusedOption()).toEqual(["pa"]);
  });

  // Entry points no longer scroll to a request: they open the popover and focus what it shows.
  test("focusItem on the request shown opens a collapsed popover and focuses it once it draws open; a request not shown is not focused", () => {
    fold.collapsed = true;
    draw(waiting);
    expect(hooks.handle!.focusItem("qq")).toBe(false);
    expect(hooks.handle!.focusItem("pa")).toBe(true);
    expect(fold.collapsed).toBe(false);
    expect(focusedOption()).toEqual([]);
    draw(waiting);
    expect(focusedOption()).toEqual(["pa"]);
  });

  test("focusItem on the request shown, open already, focuses it at once", () => {
    draw(waiting);
    expect(hooks.handle!.focusItem("pa")).toBe(true);
    expect(focusedOption()).toEqual(["pa"]);
  });

  test("Next and Back move focus to the new step's choice once it draws", () => {
    const two = { kind: "question", key: "qm", seq: 2, requestId: "m", status: "pending", answers: null, questions: [question, { ...question, id: "1" }] } as ThreadItem;
    let draft = { choices: { "0": { selected: [0], other: false, text: "" } }, step: 0, sending: null, failed: null };
    const edits: unknown[] = [];
    props = { ...props, questionDraft: () => draft, onQuestionDraft: (_id, action) => { edits.push(action); if (action.type === "next") draft = { ...draft, step: 1 }; if (action.type === "back") draft = { ...draft, step: 0 }; } };
    draw([two]);
    (popover()!.props.onNext as () => void)();
    expect(edits).toEqual([{ type: "next", questions: (two as { questions: unknown }).questions }]);
    expect(focusedOption()).toEqual([]);
    draw([two]);
    expect(focusedOption()).toEqual(["qm"]);
    controls = new Map();
    (popover()!.props.onBack as () => void)();
    draw([two]);
    expect(focusedOption()).toEqual(["qm"]);
  });

  test("a refused question send or permission answer opens a collapsed popover", async () => {
    props = { ...props, onAnswer: async () => ({ error: "not_found" }), onAnswerQuestion: async () => ({ error: "bad_request" }) };
    draw(waiting);
    (popover()!.props.onAnswer as (id: string) => void)("allow");
    fold.collapsed = true;
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(fold.collapsed).toBe(false);
    draw([asked("q")]);
    (popover()!.props.onSkip as () => void)();
    fold.collapsed = true;
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(fold.collapsed).toBe(false);
  });

  test("a permission answer locks the request until main answers; a refusal unlocks it", async () => {
    let reply!: (value: { error: string }) => void;
    const onAnswer = vi.fn(() => new Promise<{ error: string }>(resolve => { reply = resolve; }));
    props = { ...props, onAnswer };
    draw([permission("a")]);
    (popover()!.props.onAnswer as (id: string) => void)("allow");
    draw([permission("a")]);
    expect(popover()!.props.pressed).toBe("allow");
    (popover()!.props.onAnswer as (id: string) => void)("reject");
    expect(onAnswer).toHaveBeenCalledOnce();
    reply({ error: "not_found" });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    draw([permission("a")]);
    expect(popover()!.props).toMatchObject({ pressed: null, failed: true });
  });
});

// A turn can end with its request expired and no resolved event (threadItems endTurn): nothing waits, so the fold goes.
test("the host's fold is cleared once nothing waits, also without a resolved event", () => {
  fold.collapsed = true;
  draw([permission("a")]);
  expect(fold.collapsed).toBe(true);
  draw([permission("a", "expired")]);
  expect(fold.collapsed).toBe(false);
});

// After a new request opened it, the popover stays open (the store drops the fold on arrival); a fold left from before
// is cleared as soon as the popover draws open.
test("a popover drawn open clears any fold left in the host", () => {
  draw([permission("a")]);
  expect(props.onExpand).toHaveBeenCalled();
});

// Not a modal: focus moving outside does not collapse it, and nothing listens for it.
test("focus leaving the popover does not collapse it", () => {
  draw([permission("a")]);
  const props = all((AnswerPopover as (p: unknown) => ReactNode)(popover()!.props))[0]!.props;
  for (const name of ["onBlur", "onBlurCapture", "onFocusOut"]) expect(props[name], name).toBeUndefined();
  active = { elsewhere: true };
  draw([permission("a")]);
  expect(popover()!.props.collapsed).toBe(false);
});

test("a new request opening a collapsed popover leaves focus where it was", () => {
  fold.collapsed = true;
  draw([permission("a")]);
  active = { composer: true };
  // The store drops the fold when the request arrives.
  fold.collapsed = false;
  draw([permission("a"), asked("q")]);
  expect(popover()!.props.collapsed).toBe(false);
  expect(focusedOption()).toEqual([]);
  expect(composer).not.toHaveBeenCalled();
  expect(active).toEqual({ composer: true });
});

// focusItem focuses without scrolling the thread; in a cramped popover the choice may sit below what shows, so it is
// scrolled into view within the popover.
test("an entry's focus in a cramped popover brings the choice into view; elsewhere it scrolls nothing", () => {
  draw([permission("a")]);
  expect(hooks.handle!.focusItem("pa")).toBe(true);
  expect(controls.get("pa")!.scrollIntoView).not.toHaveBeenCalled();
  controls = new Map(); cramped = true;
  expect(hooks.handle!.focusItem("pa")).toBe(true);
  expect(controls.get("pa")!.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
});

// After an expand's height run the popover can turn cramped with focus already on its choice (the bar focused it while
// the run held the floor off), so the choice is brought into view then.
test("a popover turning cramped with focus inside brings the focused control into view", () => {
  draw([permission("a")]);
  const focused = { scrollIntoView: vi.fn() };
  const surface = {
    style: { overflow: "", minHeight: "" }, attributes: new Set<string>(),
    hasAttribute(name: string) { return this.attributes.has(name); }, toggleAttribute(name: string, on: boolean) { if (on) this.attributes.add(name); else this.attributes.delete(name); return on; },
    querySelector: () => null, querySelectorAll: (selector: string) => selector.includes(":scope") ? [{ offsetHeight: 80 }, { offsetHeight: 80 }] : [],
    closest: () => ({ getBoundingClientRect: () => ({ top: 0 }) }), parentElement: { getBoundingClientRect: () => ({ bottom: 100 }) }, contains: (node: unknown) => node === focused,
  };
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "", paddingTop: "0px", paddingBottom: "0px" }));
  active = focused;
  (popover()!.props.rootRef as (node: unknown) => void)(surface);
  draw([permission("a")]);
  expect(surface.attributes.has("data-cramped")).toBe(true);
  expect(focused.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
});

// The surface's motion with stand-in animations: finished and cancel events arrive only when the test says, as a browser
// dispatches them on a later frame.
describe("the popover's motion", () => {
  type Run = { cancel: ReturnType<typeof vi.fn>; finished: Promise<void>; finish(): void; onfinish: null | (() => void); oncancel: null | (() => void) };
  let runs: Run[];
  const stand = (name: string) => ({
    name, style: { overflow: "", minHeight: "" }, offsetHeight: 120, parentElement: null, hasAttribute: (attribute: string) => attribute === "data-cramped" && cramped, toggleAttribute: () => false, scrollTo: vi.fn(),
    animate: () => { let finish!: () => void; const run: Run = { cancel: vi.fn(), finished: new Promise<void>(resolve => { finish = resolve; }), finish: () => finish(), onfinish: null, oncancel: null }; runs.push(run); return run; },
  });
  let surface: ReturnType<typeof stand> & { querySelector(): null; querySelectorAll(selector: string): unknown[]; closest(): null };
  beforeEach(() => {
    runs = [];
    const parts = [stand("body"), stand("actions")];
    surface = Object.assign(stand("surface"), { querySelector: () => null, querySelectorAll: (selector: string) => selector.includes(":scope") ? [] : parts, closest: () => null });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: (name: string) => name === "--time-fast" ? "0.12s" : name === "--time-thread-enter" ? "0.4s" : "ease", paddingTop: "0px", paddingBottom: "0px" }));
  });
  const attach = () => (popover()!.props.rootRef as (node: unknown) => void)(surface);

  test("a request that arrives while the body fades out leaves the popover open with its body and buttons back", async () => {
    draw([permission("a"), permission("b")]);
    attach();
    (popover()!.props.onCollapse as () => void)();
    const fades = [...runs];
    expect(fades).toHaveLength(2);
    draw([permission("a"), permission("b"), permission("c")]);
    for (const fade of fades) fade.finish();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(props.onCollapse).not.toHaveBeenCalled();
    for (const fade of fades) expect(fade.cancel).toHaveBeenCalled();
  });

  // The fold draws the bar of the request shown then; a key taken at the press would point at one that ended.
  test("Collapse while the shown request ends during the fade puts focus on the next request's bar", async () => {
    draw([permission("a"), permission("b")]);
    attach();
    active = inCard("pa");
    (popover()!.props.onCollapse as () => void)();
    draw([permission("a", "answered"), permission("b")], toBody);
    expect(focusedOption()).toEqual(["pb"]);
    const before = controls.get("pb")!.focus.mock.calls.length;
    active = inCard("pb");
    for (const fade of [...runs]) fade.finish();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(props.onCollapse).toHaveBeenCalledExactlyOnceWith(["b"]);
    draw([permission("a", "answered"), permission("b")], toBody);
    expect(popover()!.props.collapsed).toBe(true);
    expect(controls.get("pb")!.focus.mock.calls.length).toBeGreaterThan(before);
  });

  // Esc hands focus to the composer at once, so a quick Return after it cannot press a control that is fading out.
  test("Esc moves focus to the composer at once and folds once the fade ends", async () => {
    draw([permission("a")]);
    attach();
    (popover()!.props.onEscape as () => void)();
    expect(composer).toHaveBeenCalledOnce();
    expect(props.onCollapse).not.toHaveBeenCalled();
    for (const fade of [...runs]) fade.finish();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(props.onCollapse).toHaveBeenCalledExactlyOnceWith(["a"]);
    expect(composer).toHaveBeenCalledOnce();
  });

  test("reduced motion folds at once and runs no motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    draw([permission("a")]);
    attach();
    (popover()!.props.onCollapse as () => void)();
    expect(props.onCollapse).toHaveBeenCalledExactlyOnceWith(["a"]);
    draw([permission("a")]);
    expect(runs).toEqual([]);
    expect(surface.style.overflow).toBe("");
  });

  // In a cramped popover the popover itself scrolls the body, so a new step starts from its top there.
  test("Next in a cramped popover brings the popover's own scroll back to the top", () => {
    const two = { kind: "question", key: "qm", seq: 2, requestId: "m", status: "pending", answers: null, questions: [question, { ...question, id: "1" }] } as ThreadItem;
    let draft = { choices: { "0": { selected: [0], other: false, text: "" } }, step: 0, sending: null, failed: null };
    props = { ...props, questionDraft: () => draft, onQuestionDraft: (_id, action) => { if (action.type === "next") draft = { ...draft, step: 1 }; } };
    cramped = true;
    draw([two]);
    attach();
    (popover()!.props.onNext as () => void)();
    draw([two]);
    expect(surface.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  test("a request that ends while the body fades out still collapses, over the requests left", async () => {
    draw([permission("a"), permission("b")]);
    attach();
    (popover()!.props.onEscape as () => void)();
    draw([permission("a", "answered"), permission("b")]);
    for (const fade of [...runs]) fade.finish();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(props.onCollapse).toHaveBeenCalledExactlyOnceWith(["b"]);
    expect(composer).toHaveBeenCalledOnce();
  });

  test("a height run cancelled for the next one leaves the next run's clip alone when its cancel event comes", async () => {
    draw([permission("a")]);
    attach();
    fold.collapsed = true;
    draw([permission("a")]);
    const first = runs.at(-1)!;
    expect(surface.style.overflow).toBe("hidden");
    fold.collapsed = false;
    draw([permission("a")]);
    expect(first.cancel).toHaveBeenCalled();
    expect(surface.style.overflow).toBe("hidden");
    // The browser dispatches the first run's cancel event on a later frame, while the second still runs.
    first.oncancel?.();
    expect(surface.style.overflow).toBe("hidden");
  });
});

describe("the popover's announcement", () => {
  const announce = () => popover()?.props.announce as number;
  test("a request drawn from the history is not read; one that arrives live is, once", () => {
    props = { ...props, liveAfter: 5 };
    draw([permission("a")]);
    expect(announce()).toBe(0);
    hooks.slots = []; hooks.layout = [];
    draw([{ ...permission("b"), seq: 6 } as ThreadItem]);
    const first = announce();
    expect(first).toBeGreaterThan(0);
    draw([{ ...permission("b"), seq: 6 } as ThreadItem]);
    expect(announce()).toBe(first);
  });

  test("each change of the request shown is read once; a later request waiting behind it is not", () => {
    props = { ...props, liveAfter: 100 };
    draw([permission("a")]);
    const start = announce();
    draw([permission("a"), asked("q")]);
    expect(announce()).toBe(start);
    draw([permission("a", "answered"), asked("q")]);
    expect(announce()).toBe(start + 1);
  });

  test("a new request opening a collapsed popover is read once", () => {
    props = { ...props, liveAfter: 100 };
    fold.collapsed = true;
    draw([permission("a")]);
    const start = announce();
    fold.collapsed = false;
    draw([permission("a"), asked("q")]);
    expect(announce()).toBe(start + 1);
    // Opened by the person, nothing new: not read.
    fold.collapsed = true;
    draw([permission("a"), asked("q")]);
    fold.collapsed = false;
    draw([permission("a"), asked("q")]);
    expect(announce()).toBe(start + 1);
  });
});
