import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import type { ConversationEvent } from "../main/conversation/types";
import type { ConversationThreadProps } from "./ConversationThread";
import { threadItems, type ThreadItem } from "./threadItems";

// A streamed delta must draw only the reply it extends: every other thread item is skipped by its memo comparison.
// There is no DOM in these tests (no jsdom), so the thread body runs twice with its hooks kept by call order, as React
// keeps them, and each item element the two runs produced goes through the comparison React would use.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const slot = <T,>(init: () => T): { index: number; fresh: boolean } => {
    const index = hooks.cursor++;
    const fresh = !(index in hooks.slots);
    if (fresh) hooks.slots[index] = init();
    return { index, fresh };
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const { index } = slot(() => typeof initial === "function" ? (initial as () => unknown)() : initial);
      return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.slots[index]) : next; }];
    },
    useRef: (value: unknown) => hooks.slots[slot(() => ({ current: value })).index],
    useMemo: (factory: () => unknown, deps: unknown[]) => {
      const { index, fresh } = slot(() => ({ value: factory(), deps }));
      const kept = hooks.slots[index] as { value: unknown; deps: unknown[] };
      if (!fresh && (kept.deps.length !== deps.length || kept.deps.some((dep, i) => !Object.is(dep, deps[i])))) hooks.slots[index] = { value: factory(), deps };
      return (hooks.slots[index] as { value: unknown }).value;
    },
    useEffect: () => {}, useLayoutEffect: () => {}, useImperativeHandle: () => {},
    useId: () => "k",
  };
});
const { ConversationThread, ThreadEntry } = await import("./ConversationThread");

type EntryProps = { entry: ThreadItem };
type Memo = { compare: (a: EntryProps, b: EntryProps) => boolean };
const ROOT = "/Users/ada/code/doan";
let seq = 0;
const ev = (turnId: string, payload: Record<string, unknown>): ConversationEvent => ({ v: 1, conversationId: "c1", seq: ++seq, turnId, at: "2026-11-01T00:00:00Z", ...payload } as ConversationEvent);

// What a host passes on every render: new callbacks and a new canvasListed each time, as App's inline arrows are.
const props = (items: ThreadItem[], patch: Partial<ConversationThreadProps> = {}): ConversationThreadProps => ({
  conversationId: "c1", items, provider: "claude", project: "acme", liveAfter: 0, canvasListed: canvas => canvas.path !== ".doan/canvases/gone.html",
  onAnswer: () => {}, onStop: () => {}, onEditAndResend: () => {}, onSignIn: () => {}, onRetry: () => {}, onOpenCanvas: () => {}, onOpenLink: () => {},
  onCopy: async () => true, onLocate: async () => "shown", frames: [{ id: "f1", title: "Hero" }], homeDirectory: "/Users/ada", ...patch,
});

// Runs the thread body once and returns its item elements by key.
function run(p: ConversationThreadProps): Map<string, ReactElement<EntryProps>> {
  hooks.cursor = 0;
  const outer = (ConversationThread as unknown as { render(props: ConversationThreadProps, ref: null): ReactElement<ConversationThreadProps> }).render(p, null);
  const body = (outer.type as (props: ConversationThreadProps) => ReactNode)(outer.props);
  const found = new Map<string, ReactElement<EntryProps>>();
  const walk = (node: ReactNode): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!isValidElement<{ children?: ReactNode; entry?: ThreadItem }>(node)) return;
    if (node.type === ThreadEntry) { found.set(node.props.entry!.key, node as ReactElement<EntryProps>); return; }
    walk(node.props.children);
  };
  walk(body);
  return found;
}
const same = (a: ReactElement<EntryProps>, b: ReactElement<EntryProps>) => (ThreadEntry as unknown as Memo).compare(a.props, b.props);
// Finds the first element in a drawn item whose own text is `label` and returns its onClick.
function press(node: ReactNode, label: string): (() => void) | null {
  if (Array.isArray(node)) { for (const child of node) { const hit = press(child, label); if (hit) return hit; } return null; }
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return null;
  const kids = [node.props.children].flat();
  if (node.props.onClick && kids.some(kid => kid === label)) return node.props.onClick;
  if (typeof node.type === "function" && !(node.type as { prototype?: { render?: unknown } }).prototype?.render) return press((node.type as (p: unknown) => ReactNode)(node.props), label);
  return press(node.props.children, label);
}
const drawn = (element: ReactElement<EntryProps>): ReactNode => (element.type as unknown as { type: (p: EntryProps) => ReactNode }).type(element.props);

beforeEach(() => { hooks.slots = []; seq = 0; });

function history(): ConversationEvent[] {
  return [
    ev("t1", { type: "user.message", text: "Draw it", anchors: [] }), ev("t1", { type: "turn.started" }),
    ev("t1", { type: "activity", kind: "read", path: `${ROOT}/docs/design.md`, summary: "docs/design.md" }),
    ev("t1", { type: "message.delta", messageId: "m1", text: "Done." }), ev("t1", { type: "message.done", messageId: "m1", text: "Done." }),
    ev("t1", { type: "turn.failed", code: "process_exited" }),
    ev("t1", { type: "conversation.bound", canvas: { path: ".doan/canvases/s.html", id: "s" } }),
    ev("t2", { type: "user.message", text: "And {{1}}", anchors: [{ kind: "frame", frame: "f1" }] }), ev("t2", { type: "turn.started" }),
    ev("t2", { type: "message.delta", messageId: "m2", text: "Wor" }),
  ];
}

test("a streamed delta changes only the streaming reply's item; every other item keeps its render", () => {
  const events = history();
  const before = run(props(threadItems(events, ROOT, true)));
  events.push(ev("t2", { type: "message.delta", messageId: "m2", text: "king" }));
  const after = run(props(threadItems(events, ROOT, true)));
  expect([...after.keys()]).toEqual([...before.keys()]);
  const streaming = [...after.values()].find(element => element.props.entry.kind === "agent" && element.props.entry.streaming)!;
  expect(streaming.props.entry).toMatchObject({ text: "Working" });
  for (const [key, element] of after) expect([key, same(before.get(key)!, element)]).toEqual([key, key !== streaming.props.entry.key]);
  expect(new Set([...after.values()].map(element => element.props.entry.kind))).toEqual(new Set(["user", "activity", "agent", "end", "marker"]));
});

test("what an item draws from outside its own data still draws it again", () => {
  const items = threadItems(history(), ROOT, true);
  const key = (kind: ThreadItem["kind"]) => items.find(item => item.kind === kind)!.key;
  const base = run(props(items));
  const changed = (patch: Partial<ConversationThreadProps>, kind: ThreadItem["kind"], at = key(kind)) => {
    const next = run(props(items, patch));
    run(props(items));
    return !same(base.get(at)!, next.get(at)!);
  };
  expect(changed({ locateDisabled: true }, "user")).toBe(true);
  expect(changed({ frames: [{ id: "f1", title: "Hero renamed" }] }, "user")).toBe(true);
  const { onLocate: _, ...noLocate } = props(items);
  expect(!same(base.get(key("user"))!, run(noLocate).get(key("user"))!)).toBe(true);
  run(props(items));
  expect(changed({ canvasListed: () => false }, "marker")).toBe(true);
  expect(changed({ project: "other" }, "marker")).toBe(true);
  expect(changed({ provider: "codex" }, "end")).toBe(true);
});

// A handoff in each direction, then a turn waiting on a permission and a question.
function asks(): ConversationEvent[] {
  const canvas = { path: ".doan/canvases/b.html", id: "b" };
  return [
    ev("t3", { type: "user.message", text: "Carry on", anchors: [], origin: { kind: "handoff", conversationId: "c0", canvas } }), ev("t3", { type: "turn.started" }),
    ev("t3", { type: "handoff.requested", canvas: { path: canvas.path }, text: "Move it" }), ev("t3", { type: "turn.done" }),
    ev("t3", { type: "handoff.resolved", outcome: "started", target: { conversationId: "c2", canvas } }),
    ev("t4", { type: "user.message", text: "Go", anchors: [], attachments: [{ kind: "file", name: "a.png", size: 1, path: "/Users/ada/a.png" }] }), ev("t4", { type: "turn.started" }),
    ev("t4", { type: "permission.request", requestId: "r1", tool: "Bash", summary: "Run ls", options: [{ id: "a", label: "Allow", kind: "allow" }, { id: "d", label: "Deny", kind: "deny" }] }),
    ev("t4", { type: "question.request", requestId: "q1", questions: [{ id: "0", header: "H", question: "Which?", options: [], multiSelect: false, other: true }] }),
  ];
}

test("handoffs, asks and attachments draw again when what they read from outside their data changes", () => {
  const items = threadItems(asks(), ROOT, true);
  const key = (kind: ThreadItem["kind"]) => items.find(item => item.kind === kind)!.key;
  expect(new Set(items.map(item => item.kind))).toEqual(new Set(["handoffCard", "handoff", "noReply", "user", "permission", "question"]));
  const base = run(props(items));
  const changed = (patch: Partial<ConversationThreadProps>, kind: ThreadItem["kind"]) => {
    const next = run(props(items, patch));
    run(props(items));
    return !same(base.get(key(kind))!, next.get(key(kind))!);
  };
  expect(changed({ homeDirectory: "/Users/bob" }, "user")).toBe(true);
  expect(changed({ canvasListed: () => false }, "handoff")).toBe(true);
  expect(changed({ canvasListed: () => false }, "handoffCard")).toBe(true);
  expect(changed({ liveAfter: 1000 }, "permission")).toBe(true);
  expect(changed({ questionDraft: () => ({ choices: {}, sending: "answer", failed: false }) }, "question")).toBe(true);
});

// Finds the first element in a drawn item with `prop` and returns its onClick.
function pressWith(node: ReactNode, prop: string): (() => void) | null {
  if (Array.isArray(node)) { for (const child of node) { const hit = pressWith(child, prop); if (hit) return hit; } return null; }
  if (!isValidElement<Record<string, unknown> & { children?: ReactNode; onClick?: () => void }>(node)) return null;
  if (node.props.onClick && prop in node.props) return node.props.onClick;
  return pressWith(node.props.children, prop);
}

test("an activity draws again when it opens", () => {
  const items = threadItems(history(), ROOT, true);
  const at = items.find(item => item.kind === "activity")!.key;
  const before = run(props(items));
  pressWith(drawn(before.get(at)!), "aria-expanded")!();
  expect(same(before.get(at)!, run(props(items)).get(at)!)).toBe(false);
});

test("a permission draws again when its answer did not reach main", async () => {
  const items = threadItems(asks(), ROOT, true);
  const at = items.find(item => item.kind === "permission")!.key;
  const before = run(props(items, { onAnswer: async () => ({ error: "gone" }) }));
  press(drawn(before.get(at)!), "Allow")!();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(same(before.get(at)!, run(props(items)).get(at)!)).toBe(false);
});

test("an item kept from an earlier render calls the host's latest callbacks", () => {
  const events = [...history().slice(0, 6)];
  const items = threadItems(events, ROOT, true);
  const first = run(props(items, { onEditAndResend: () => { throw new Error("stale callback"); } }));
  const latest = vi.fn();
  const second = run(props(items, { onEditAndResend: latest }));
  const end = items.find(item => item.kind === "end")!.key;
  expect(same(first.get(end)!, second.get(end)!)).toBe(true);
  // React keeps the first render's output for a skipped item; its button must reach the latest host.
  press(drawn(first.get(end)!), "Edit and resend")!();
  expect(latest).toHaveBeenCalledOnce();
});
