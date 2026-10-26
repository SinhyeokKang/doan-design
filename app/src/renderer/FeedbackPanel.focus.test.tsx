import { afterEach, describe, expect, test, vi, type Mock } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { Comment } from "../formats/types";
import type { ProjectComments } from "../main/projectComments";
import type { OrphanFile } from "../main/view";
import { orphanKey } from "./CommentsSession";
import { FeedbackPanel, REVEAL_MS, type FeedbackPanelProps } from "./FeedbackPanel";
import type { ProjectRead } from "./homeCards";

// FeedbackPanel's focus moves across renders without a DOM: hooks run as React
// would run them (layout effects every render, then effects whose dependencies
// changed), and every ref the render hands out gets a node that persists by key.
const harness = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], layouts: [] as (() => void)[], deps: [] as (readonly unknown[] | undefined)[], cleanups: [] as ((() => void) | undefined)[], refs: [] as { current: unknown }[], states: [] as unknown[], refIndex: 0, stateIndex: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
    const i = harness.effects.length, previous = harness.deps[i];
    const changed = !deps || !previous || deps.some((value, j) => !Object.is(value, previous[j]));
    harness.deps[i] = deps;
    harness.effects.push(changed ? () => { harness.cleanups[i]?.(); const cleanup = effect(); harness.cleanups[i] = typeof cleanup === "function" ? cleanup : undefined; } : () => {});
  },
  useLayoutEffect: (effect: () => void) => { harness.layouts.push(effect); },
  useRef: (initial: unknown = null) => harness.refs[harness.refIndex++] ??= { current: initial },
  useState: (initial: unknown) => {
    const i = harness.stateIndex++;
    if (!(i in harness.states)) harness.states[i] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [harness.states[i], (update: unknown) => { harness.states[i] = typeof update === "function" ? (update as (value: unknown) => unknown)(harness.states[i]) : update; }];
  },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); Object.assign(harness, { effects: [], layouts: [], deps: [], cleanups: [], refs: [], states: [], refIndex: 0, stateIndex: 0 }); });

type Node = { name: string; isConnected: boolean; focus: Mock; contains: (node: unknown) => boolean; button?: Node };
const kim = { kind: "human", name: "Kim Doe" } as const;
const note = (id: string): Comment => ({ comment: id, status: "open", body: id, target: {}, canvasHash: "h", createdBy: kim, createdAt: "2026-10-24T09:12:00.000Z", updatedAt: "2026-10-24T09:12:00.000Z" });
const orphan = (id: string, open: number): OrphanFile => ({ id, file: `.doan/comments/${id}.jsonl`, comments: { open, resolved: 0 }, uncertain: false });
const read = (orphans: { id: string; comments: Comment[] }[], revision = 1): ProjectRead => ({ root: "/r", revision, kind: "list", project: 4,
  canvases: [] as Extract<ProjectComments, { kind: "list" }>["canvases"], orphans: orphans.map(o => orphan(o.id, o.comments.length)), orphanComments: orphans });
const card = (id: string, comment: string) => `card:${orphanKey("/r", id, comment)}`;

function panel(initial: Partial<FeedbackPanelProps>) {
  const body: Node = { name: "body", isConnected: true, focus: vi.fn(), contains: () => false };
  const doc = { body, activeElement: body as unknown };
  vi.stubGlobal("document", doc);
  // A press as the window sees it: pointerdown, then mousedown with its click count.
  const listeners = new Map<string, (event: { target: unknown; detail: number }) => void>();
  vi.stubGlobal("window", { addEventListener: (type: string, listener: (event: { target: unknown; detail: number }) => void) => { listeners.set(type, listener); }, removeEventListener: () => {} });
  const press = (target: unknown, detail = 1) => { listeners.get("pointerdown")?.({ target, detail: 0 }); listeners.get("mousedown")?.({ target, detail }); };
  const nodes = new Map<string, Node>();
  const node = (name: string): Node => {
    let found = nodes.get(name);
    if (!found) {
      const made: Node = { name, isConnected: true, focus: vi.fn(() => { doc.activeElement = made; }), contains: other => other === made || other === made.button };
      made.button = { name: `${name} button`, isConnected: true, focus: vi.fn(() => { doc.activeElement = made.button; }), contains: other => other === made.button };
      nodes.set(name, found = made);
    }
    return found;
  };
  let props: FeedbackPanelProps = { root: "/r", rows: [], read: undefined, orphans: { mutations: new Map(), busy: false, statusLine: null, gitMissing: () => false },
    onRetry: () => {}, onOrphan: () => {}, onRetryGit: () => {}, onOpenComment: () => {}, onOpenCanvas: () => {}, onReview: () => {}, ...initial };
  let attached = new Map<string, (node: unknown) => void>();
  const render = (over: Partial<FeedbackPanelProps> = {}) => {
    props = { ...props, ...over };
    harness.effects = []; harness.layouts = []; harness.refIndex = 0; harness.stateIndex = 0;
    const tree = FeedbackPanel(props);
    // React detaches the previous refs, then attaches this render's before layout effects.
    const next = new Map<string, (node: unknown) => void>();
    const walk = (children: ReactNode, key: string | null) => {
      if (Array.isArray(children)) { children.forEach(child => walk(child, key)); return; }
      if (!isValidElement(children)) return;
      const element = children as ReactElement<Record<string, unknown> & { children?: ReactNode }>;
      const own = element.props.role === "none" && element.key !== null ? element.key : key;
      if (typeof element.props.ref === "function" && own !== null) next.set(own, element.props.ref as (node: unknown) => void);
      if (typeof element.props.cardRef === "function") next.set(`card:${orphanKey("/r", String(key).replace(/^orphan:\.doan\/comments\/|\.jsonl$/g, ""), (element.props.comment as Comment).comment)}`, element.props.cardRef as (node: unknown) => void);
      walk(element.props.children, own);
    };
    walk(tree, null);
    for (const [name, ref] of attached) {
      ref(null);
      if (!next.has(name)) { const gone = nodes.get(name); if (gone) { gone.isConnected = false; if (gone.button) gone.button.isConnected = false; } }
    }
    for (const [name, ref] of next) ref(node(name));
    attached = next;
    // useRef slot 0 is the panel title (an object ref).
    const heading = harness.refs[0] as { current: unknown } | undefined;
    if (heading && !heading.current) heading.current = node("title");
    harness.layouts.forEach(effect => effect());
    harness.effects.forEach(effect => effect());
    return tree;
  };
  // An orphan card's own props, for its focus and blur handlers.
  const cardProps = (tree: ReactElement, comment: string) => {
    let found: Record<string, unknown> | undefined;
    const walk = (children: ReactNode) => {
      if (Array.isArray(children)) { children.forEach(walk); return; }
      if (!isValidElement(children)) return;
      const props = children.props as Record<string, unknown> & { children?: ReactNode };
      if (typeof props.cardRef === "function" && (props.comment as Comment).comment === comment) found = props;
      walk(props.children);
    };
    walk(tree);
    return found as { focusIn: () => void; focusOut: () => void };
  };
  return { doc, body, node, render, cardProps, press, props: () => props };
}

describe("an orphan card that leaves while it held focus (R-V1 🟡3)", () => {
  const two = read([{ id: "invoice", comments: [note("c1"), note("c2")] }]);
  const one = read([{ id: "invoice", comments: [note("c2")] }], 2);
  // Focus on c1's button, as a Tab or a click would leave it.
  function focusedOnFirst() {
    const f = panel({ read: two });
    const tree = f.render();
    f.node(card("invoice", "c1")).button!.focus();
    f.cardProps(tree, "c1").focusIn();
    f.render();
    return f;
  }
  const moved = (f: ReturnType<typeof panel>) => [card("invoice", "c2"), "orphan:.doan/comments/invoice.jsonl", "orphans"].filter(name => f.node(name).focus.mock.calls.length > 0);

  test("a press outside the card forgets it, though focus falls to <body> with no render", () => {
    const f = focusedOnFirst();
    f.press(f.node("orphans"));
    f.doc.activeElement = f.body;
    f.render({ read: one });
    expect(moved(f)).toEqual([]);
  });

  test("focus that falls to <body> with no change under way forgets it at the next render", () => {
    const f = focusedOnFirst();
    f.doc.activeElement = f.body;
    f.render();
    f.render({ read: one });
    expect(moved(f)).toEqual([]);
  });

  test("its own Resolve keeps it through the write and the read after it, then focus goes to the next card", () => {
    const f = focusedOnFirst();
    f.press(f.node(card("invoice", "c1")).button);
    // The button disables while saving and drops focus to <body>.
    f.doc.activeElement = f.body;
    f.render({ orphans: { ...f.props().orphans, busy: true } });
    f.render({ orphans: { ...f.props().orphans, busy: false, statusLine: { root: "/r", canvas: "invoice", comment: "c1", text: "Resolved." } } });
    f.render({ read: one });
    expect(moved(f)).toEqual([card("invoice", "c2")]);
  });

  // R-V1b ⚪1: Electron may deliver the write's reply before main's earlier
  // comments:invalidated, so a read sent before the write can still land
  // after busy ends, showing the card.
  test("a read from before its saved write keeps it until the read without the card", () => {
    const f = focusedOnFirst();
    f.press(f.node(card("invoice", "c1")).button);
    f.doc.activeElement = f.body;
    f.render({ orphans: { ...f.props().orphans, busy: true } });
    f.render({ orphans: { ...f.props().orphans, busy: false } });
    f.render({ read: read([{ id: "invoice", comments: [note("c1"), note("c2")] }], 2) });
    f.render({ read: read([{ id: "invoice", comments: [note("c2")] }], 3) });
    expect(moved(f)).toEqual([card("invoice", "c2")]);
  });

  test("a write that failed ends it; a later read without the card moves nothing", () => {
    const f = focusedOnFirst();
    f.press(f.node(card("invoice", "c1")).button);
    f.doc.activeElement = f.body;
    f.render({ orphans: { ...f.props().orphans, busy: true } });
    f.render({ orphans: { ...f.props().orphans, busy: false, mutations: new Map([[orphanKey("/r", "invoice", "c1"), { status: "failed", message: "Disk full" }]]) } });
    f.render({ read: one });
    expect(moved(f)).toEqual([]);
  });
});

describe("Show from the id-change notice (R-V1 🟡4)", () => {
  const before = read([]);
  const after = read([{ id: "checkout-v1", comments: [note("c1")] }], 2);
  const head = "orphan:.doan/comments/checkout-v1.jsonl";
  // The Overview still shows a read without the old id's file.
  function waiting() {
    const onRevealed = vi.fn();
    const f = panel({ read: before, reveal: { id: "checkout-v1", seq: 1 } });
    const revealed = () => { if (onRevealed.mock.calls.length) f.render({ reveal: null }); };
    f.render({ onRevealed });
    f.render();
    expect(onRevealed).not.toHaveBeenCalled();
    return { ...f, onRevealed, revealed };
  }

  test("the next read focuses the old id's file head", () => {
    const f = waiting();
    f.render({ read: after }); f.revealed();
    expect(f.onRevealed).toHaveBeenCalledOnce();
    expect(f.node(head).focus).toHaveBeenCalledOnce();
  });

  test("a failure kept from an earlier visit waits for the next read", () => {
    const onRevealed = vi.fn();
    const f = panel({ read: { kind: "failed" }, reveal: { id: "checkout-v1", seq: 1 }, onRevealed });
    f.render(); f.render();
    expect(onRevealed).not.toHaveBeenCalled();
    expect(f.node("title").focus).not.toHaveBeenCalled();
    f.render({ read: after });
    expect(onRevealed).toHaveBeenCalledOnce();
    f.render({ reveal: null });
    expect(f.node(head).focus).toHaveBeenCalledOnce();
  });

  test("focus the person moved meanwhile ends it without a move", () => {
    const f = waiting();
    f.node("Resolved filter").focus();
    f.render({ read: after }); f.revealed();
    expect(f.onRevealed).toHaveBeenCalledOnce();
    expect(f.node(head).focus).not.toHaveBeenCalled();
    expect(f.doc.activeElement).toBe(f.node("Resolved filter"));
  });

  test("a failed read ends it; a later read moves nothing", () => {
    const f = waiting();
    f.render({ read: { kind: "failed" } }); f.revealed();
    expect(f.onRevealed).toHaveBeenCalledOnce();
    expect(f.node("title").focus).toHaveBeenCalledOnce();
    f.render({ read: after });
    expect(f.node(head).focus).not.toHaveBeenCalled();
  });

  // R-V1b 🟡1: a press on a blank area leaves focus on <body>, the same as
  // Show left it, so only the press itself tells the person moved on.
  test("a blank press ends it; a later read moves nothing", () => {
    const f = waiting();
    // The listener is registered once; it calls the latest render's onRevealed.
    const latest = vi.fn();
    f.render({ onRevealed: latest });
    f.press(f.node("blank Overview"));
    expect(latest).toHaveBeenCalledOnce();
    f.render({ reveal: null });
    f.render({ read: after });
    expect(f.node(head).focus).not.toHaveBeenCalled();
    expect(f.node("title").focus).not.toHaveBeenCalled();
  });

  test("a blank press ends it; its time moves nothing", () => {
    vi.useFakeTimers();
    const f = waiting();
    f.press(f.node("blank Overview"));
    vi.advanceTimersByTime(REVEAL_MS + 1); f.revealed();
    expect(f.node("title").focus).not.toHaveBeenCalled();
  });

  // A double click on Show: its second press is part of the same click.
  test("the second press of a double click does not end it", () => {
    const f = waiting();
    f.press(f.node("blank Overview"), 2); f.revealed();
    f.render({ read: after }); f.revealed();
    expect(f.node(head).focus).toHaveBeenCalledOnce();
  });

  // The Show click's own press lands before the request exists.
  test("the press that asked for Show does not end it", () => {
    const onRevealed = vi.fn();
    const f = panel({ read: before, onRevealed });
    f.render();
    f.press(f.node("Show"));
    f.render({ reveal: { id: "checkout-v1", seq: 1 } });
    f.render({ read: after });
    expect(onRevealed).toHaveBeenCalledOnce();
    f.render({ reveal: null });
    expect(f.node(head).focus).toHaveBeenCalledOnce();
  });

  test.each([["on <body>", false], ["moved elsewhere", true]])("its time ends it, on the title only with focus %s", (_label, elsewhere) => {
    vi.useFakeTimers();
    const f = waiting();
    if (elsewhere) f.node("Resolved filter").focus();
    vi.advanceTimersByTime(REVEAL_MS + 1); f.revealed();
    expect(f.onRevealed).toHaveBeenCalledOnce();
    expect(f.node("title").focus).toHaveBeenCalledTimes(elsewhere ? 0 : 1);
    f.render({ read: after });
    expect(f.node(head).focus).not.toHaveBeenCalled();
  });
});
