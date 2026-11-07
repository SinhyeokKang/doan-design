import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ConversationThreadProps } from "./ConversationThread";
import type { ThreadItem } from "./threadItems";
import type { ThreadTurn, TurnStatus } from "./turnStatus";

// The thread's turn indicator. There is no DOM in these tests (the App tests' no-DOM style): hooks
// run as plain state with their effects and cleanups, so the settle wait and the indicator's own timer run on fake
// timers; static markup checks what is drawn.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], memos: [] as { value: unknown; deps: unknown[] }[],
  effects: [] as ({ deps: unknown[] | undefined; cleanup?: () => void } | undefined)[],
  pending: [] as (() => void)[], cursor: 0, refCursor: 0, memoCursor: 0, effectCursor: 0, dirty: false, mocked: false,
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const effect = (run: () => unknown, deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
    // Kept only once it runs: a render discarded for a state set while rendering commits no effect.
    hooks.pending.push(() => {
      const slot: { deps: unknown[] | undefined; cleanup?: () => void } = { deps };
      previous?.cleanup?.();
      hooks.effects[index] = slot;
      const cleanup = run();
      if (typeof cleanup === "function") slot.cleanup = cleanup as () => void;
    });
  };
  // Static markup renders with React's own hooks; the hook runs below switch to plain state.
  const pick = <T,>(mine: T, theirs: T): T => hooks.mocked ? mine : theirs;
  return {
    ...actual,
    useState: (initial: unknown) => pick(() => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.states[index], (next: unknown) => {
        const value = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next;
        if (!Object.is(value, hooks.states[index])) { hooks.states[index] = value; hooks.dirty = true; }
      }];
    }, () => actual.useState(initial))(),
    useRef: (value: unknown) => pick(() => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; }, () => actual.useRef(value))(),
    useMemo: (factory: () => unknown, deps: unknown[]) => pick(() => {
      const index = hooks.memoCursor++, kept = hooks.memos[index];
      if (!kept || kept.deps.length !== deps.length || kept.deps.some((dep, i) => !Object.is(dep, deps[i]))) hooks.memos[index] = { value: factory(), deps };
      return hooks.memos[index]!.value;
    }, () => actual.useMemo(factory, deps))(),
    useEffect: (run: () => unknown, deps?: unknown[]) => hooks.mocked ? effect(run, deps) : actual.useEffect(run as () => void, deps),
    useLayoutEffect: (run: () => unknown, deps?: unknown[]) => hooks.mocked ? effect(run, deps) : actual.useLayoutEffect(run as () => void, deps),
    useImperativeHandle: (...args: Parameters<typeof actual.useImperativeHandle>) => hooks.mocked ? undefined : actual.useImperativeHandle(...args),
    useId: () => hooks.mocked ? "k" : actual.useId(),
  };
});
const { ConversationThread, TurnIndicator } = await import("./ConversationThread");

function reset() { hooks.states = []; hooks.refs = []; hooks.memos = []; hooks.effects = []; hooks.pending = []; }
// Renders until state settles, then runs the effects, as React would.
function render(component: () => ReactNode): ReactNode {
  hooks.mocked = true;
  try {
    for (let round = 0; round < 20; round++) {
      hooks.cursor = 0; hooks.refCursor = 0; hooks.memoCursor = 0; hooks.effectCursor = 0; hooks.pending = []; hooks.dirty = false;
      const tree = component();
      if (hooks.dirty) continue;
      for (const run of hooks.pending) run();
      if (!hooks.dirty) return tree;
    }
  } finally { hooks.mocked = false; }
  throw new Error("did not settle");
}
function unmount() { for (const slot of hooks.effects) slot?.cleanup?.(); hooks.effects = []; }
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
const textOf = (node: ReactNode): string => Array.isArray(node) ? node.map(textOf).join("") : typeof node === "string" || typeof node === "number" ? String(node)
  : isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : "";

const noop = () => {};
const user: ThreadItem = { kind: "user", key: "u1", seq: 1, parts: [{ text: "Make the checkout button full width" }], anchors: [], preset: null, attachments: [] };
const running: ThreadItem = { kind: "activity", key: "a3", running: true, head: "Running a command", steps: [{ key: "s3", kind: "command", verb: "Running a command", path: null }] };
const AT = "2026-11-06T10:00:00.000Z";
const props = (items: readonly ThreadItem[], turn: ThreadTurn | null, patch: Partial<ConversationThreadProps> = {}): ConversationThreadProps => ({
  items, conversationId: "c1", provider: "claude", project: "acme", liveAfter: 0, canvasListed: () => true, turn,
  onAnswer: noop, onStop: noop, onEditAndResend: noop, onSignIn: noop, onRetry: noop, onOpenCanvas: noop, onOpenLink: noop, onCopy: async () => true, ...patch,
});
const at = (status: TurnStatus, turnId = "t1"): ThreadTurn => ({ turnId, status, at: AT });
const html = (items: readonly ThreadItem[], turn: ThreadTurn | null, patch: Partial<ConversationThreadProps> = {}) => renderToStaticMarkup(<ConversationThread {...props(items, turn, patch)} />);
// The thread body run with plain hooks (ConversationThread is a forwardRef whose render keys the body by conversation).
function body(p: ConversationThreadProps): () => ReactNode {
  return () => {
    const outer = (ConversationThread as unknown as { render(props: ConversationThreadProps, ref: null): ReactElement<ConversationThreadProps> }).render(p, null);
    return (outer.type as (props: ConversationThreadProps) => ReactNode)(outer.props);
  };
}
const indicator = (tree: ReactNode) => all(tree).find(element => element.type === TurnIndicator);
const status = (tree: ReactNode) => textOf(all(tree).find(element => element.props.role === "status")?.props.children as ReactNode);

let listeners: Map<string, Set<() => void>>;
const fire = (type: string) => { for (const listener of listeners.get(type) ?? []) listener(); };
beforeEach(() => {
  reset();
  vi.useFakeTimers({ now: Date.parse(AT) });
  listeners = new Map();
  vi.stubGlobal("document", {
    hidden: false, activeElement: null,
    addEventListener: vi.fn((type: string, listener: () => void) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(listener); }),
    removeEventListener: vi.fn((type: string, listener: () => void) => { listeners.get(type)?.delete(listener); }),
  });
});
afterEach(() => { unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("the turn indicator in the thread", () => {
  test("is the thread's last item from the render the message enters, with the provider's logo, words and time", () => {
    const out = html([user], at({ kind: "general" }));
    expect(out).toMatch(/<div class="thread-item"><div class="ti ti-reply"><img class="logo" src="[^"]+" alt=""\/><span class="ti-text ti-shimmer">Claude Code is working<\/span><span class="ti-time" aria-hidden="true">0s<\/span><\/div><\/div><\/div><\/div>/);
    expect(out.indexOf("Make the checkout button")).toBeLessThan(out.indexOf("ti-reply"));
  });

  test("is not there while a card waits, after the turn's end, or without a turn", () => {
    const ask: ThreadItem = { kind: "permission", key: "pr1", seq: 4, requestId: "r1", summary: "Run doan check", options: [{ id: "a", label: "Allow once", kind: "allow" }], status: "pending", answer: null };
    expect(html([user, ask], at({ kind: "waiting" }))).not.toContain("ti-reply");
    expect(html([user], at({ kind: "none" }))).not.toContain("ti-reply");
    expect(html([user], null)).not.toContain("ti-reply");
  });

  test("is no live region and has nothing to focus; the time is hidden from screen readers", () => {
    const out = html([user], at({ kind: "thinking" }));
    const line = out.slice(out.indexOf('<div class="ti ti-reply"'), out.indexOf("</div>", out.indexOf("ti-reply")) + 6);
    expect(line).not.toMatch(/role=|aria-live|tabindex|<button|<a /);
    expect(line).toContain('<span class="ti-time" aria-hidden="true">');
  });

  test("comes after a message Send now has in flight", () => {
    const sending: ThreadItem = { ...user, key: "qq1", seq: null, sending: true, parts: [{ text: "Also keep the margin" }] };
    const out = html([user, sending], at({ kind: "general" }));
    expect(out.indexOf("Also keep the margin")).toBeLessThan(out.indexOf("ti-reply"));
  });

  test("shows with a spinning activity row, both progress marks at once", () => {
    const out = html([user, running], at({ kind: "general" }));
    expect(out).toContain('<span class="doan-spinner" aria-hidden="true"></span><span>Running a command</span>');
    expect(out).toContain('<span class="ti-text ti-shimmer">Claude Code is working</span>');
  });

  test("keeps one line of the same parts for every stage, so a stage change never changes the thread's height", () => {
    const shapes = [{ kind: "general" }, { kind: "thinking" }, { kind: "reply" }, { kind: "tool", activity: "read", text: "Reading src/components/checkout/payment/PaymentMethodSelector.tsx" }]
      .map(stage => html([user], at(stage as TurnStatus)).replace(/>[^<]*</g, "><"));
    expect(new Set(shapes).size).toBe(1);
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toContain(".conversation-thread .ti-reply .ti-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }");
    expect(css).toContain(".conversation-thread .ti-reply .ti-time { flex: none;");
  });

  test("stops its sweep under reduced motion and keeps the words' colour", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .conversation-thread .caret"));
    expect(reduced.slice(0, reduced.indexOf("}\n}") + 3)).toContain(".conversation-thread .ti-shimmer { animation: none; background: none; color: var(--text-metadata); }");
  });
});

describe("settle and the screen reader's status", () => {
  test("a new stage shows after 300 ms; replying shows at once", () => {
    let p = props([user], at({ kind: "general" }));
    const run = () => render(body(p));
    expect(indicator(run())?.props.text).toBe("Claude Code is working");
    p = props([user, running], at({ kind: "tool", activity: "command", text: "Running a command" }));
    expect(indicator(run())?.props.text).toBe("Claude Code is working");
    vi.advanceTimersByTime(299);
    expect(indicator(run())?.props.text).toBe("Claude Code is working");
    vi.advanceTimersByTime(1);
    const tree = run();
    expect(indicator(tree)?.props.text).toBe("Running a command");
    expect(status(tree)).toBe("Claude Code is running a command");
    p = props([user, { kind: "agent", key: "m1", messageId: "m1", text: "I made", streaming: true }], at({ kind: "reply" }));
    expect(indicator(run())?.props.text).toBe("Claude Code is replying");
  });

  test("a stage replaced within 300 ms never shows, and its wait is cleared", () => {
    let p = props([user], at({ kind: "general" }));
    const run = () => render(body(p));
    run();
    p = props([user], at({ kind: "tool", activity: "read", text: "Reading a.ts" }));
    run();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(100);
    p = props([user], at({ kind: "general" }));
    run();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(indicator(run())?.props.text).toBe("Claude Code is working");
  });

  test("hides at once when a card waits or the turn ends; the status says so and nothing waits", () => {
    let p = props([user, running], at({ kind: "tool", activity: "command", text: "Running a command" }));
    const run = () => render(body(p));
    run();
    const ask: ThreadItem = { kind: "permission", key: "pr1", seq: 4, requestId: "r1", summary: "Run doan check", options: [{ id: "a", label: "Allow once", kind: "allow" }], status: "pending", answer: null };
    p = props([user, running, ask], at({ kind: "waiting" }));
    let tree = run();
    expect(indicator(tree)).toBeUndefined();
    expect(status(tree)).toBe("Claude Code needs your answer");
    p = props([user, { kind: "end", key: "e5", seq: 5, end: { kind: "interrupted", reason: "user" } }], at({ kind: "none" }));
    tree = run();
    expect(indicator(tree)).toBeUndefined();
    expect(status(tree)).toBe("Stopped");
    expect(vi.getTimerCount()).toBe(0);
  });

  test("the status changes only with the stage's kind and never carries a path or the time", () => {
    let p = props([user], at({ kind: "tool", activity: "read", text: "Reading src/a.ts" }));
    const run = () => render(body(p));
    const first = status(run());
    expect(first).toBe("Claude Code is reading files");
    p = props([user], at({ kind: "tool", activity: "read", text: "Reading src/b.ts" }));
    run(); vi.advanceTimersByTime(300);
    const tree = run();
    expect(indicator(tree)?.props.text).toBe("Reading src/b.ts");
    expect(status(tree)).toBe(first);
  });

  // Review RU-R1: the same conversation's next turn arrives in the render after the earlier one's stage, with no render
  // of its end between (a queue starting it at once).
  test("a next turn starts from nothing: the earlier turn's shown or pending stage never shows beside it", () => {
    let p = props([user, running], at({ kind: "tool", activity: "read", text: "Reading old.ts" }, "t1"));
    const run = () => render(body(p));
    expect(indicator(run())?.props.text).toBe("Reading old.ts");
    p = props([user], at({ kind: "general" }, "t2"));
    expect(indicator(run())?.props.text).toBe("Claude Code is working");
    expect(vi.getTimerCount()).toBe(0);
    // A stage still waiting out its 300 ms in the earlier turn is dropped too, and the new turn's first stage shows at once.
    p = props([user], at({ kind: "tool", activity: "read", text: "Reading old.ts" }, "t2"));
    run();
    expect(vi.getTimerCount()).toBe(1);
    p = props([user], at({ kind: "thinking" }, "t3"));
    const tree = run();
    expect(indicator(tree)?.props.text).toBe("Claude Code is thinking");
    expect(status(tree)).toBe("Claude Code is thinking");
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(indicator(run())?.props.text).toBe("Claude Code is thinking");
  });

  test("the body sets no timer of its own while the stage holds, so the thread does not redraw every second", () => {
    render(body(props([user], at({ kind: "thinking" }))));
    expect(vi.getTimerCount()).toBe(0);
  });

  test("another conversation starts with a body of its own, so no stage of the first one shows there", () => {
    const outer = (id: string) => (ConversationThread as unknown as { render(props: ConversationThreadProps, ref: null): ReactElement }).render(props([user], null, { conversationId: id }), null);
    expect(outer("c1").key).toBe("c1");
    expect(outer("c2").key).toBe("c2");
  });
});

describe("the indicator's time", () => {
  const time = (tree: ReactNode) => textOf(all(tree).find(element => element.props.className === "ti-time")?.props.children as ReactNode);
  const run = (startedAt = AT) => render(() => TurnIndicator({ text: "Claude Code is working", at: startedAt, provider: "claude" }));

  test("counts each second from the turn's start, redrawing only the indicator", () => {
    expect(time(run())).toBe("0s");
    vi.advanceTimersByTime(1000);
    expect(time(run())).toBe("1s");
    vi.advanceTimersByTime(59_000);
    expect(time(run())).toBe("1m 0s");
    // A turn that started before the thread opened (a read after a reload) counts from its recorded start.
    reset();
    expect(time(run("2026-11-06T09:00:00.000Z"))).toBe("1h 1m 0s");
  });

  test("stops while the window is hidden and counts again from the start once it shows", () => {
    run();
    expect(vi.getTimerCount()).toBe(1);
    (document as { hidden: boolean }).hidden = true;
    fire("visibilitychange");
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(90_000);
    (document as { hidden: boolean }).hidden = false;
    fire("visibilitychange");
    expect(hooks.dirty).toBe(true);
    expect(time(run())).toBe("1m 30s");
    expect(vi.getTimerCount()).toBe(1);
  });

  test("clears its timer and listener when it goes: the turn's end, another conversation, a closed panel", () => {
    run();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(listeners.get("visibilitychange")?.size ?? 0).toBe(0);
  });

  test("reads an unreadable or future start as 0s", () => {
    expect(time(run("not a time"))).toBe("0s");
    reset();
    expect(time(run("2026-11-06T10:05:00.000Z"))).toBe("0s");
  });
});
