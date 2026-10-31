import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider } from "../main/agentAuth/types";
import * as Parts from "./ComposerParts";
import { DockedComposer, type DockedComposerProps, type DockedOutcome } from "./DockedComposer";
import { draftKey, EMPTY_DRAFT, type DockedDraft, type DockedMode } from "./dockedRules";
import type { ModelPickerView } from "./homeComposer";

// Hooks run as plain state so the composer's handlers can be called without a DOM (HomeComposerView.interaction).
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, effects: [] as (() => unknown)[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useId: () => "id",
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
  useLayoutEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
  useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
  useState: (value: unknown) => { const index = hooks.cursor++; if (!(index in hooks.states)) hooks.states[index] = typeof value === "function" ? (value as () => unknown)() : value; return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.states[index]) : next; }]; },
}));

function status(provider: Provider) {
  const state: AuthState = { provider, generation: 1, verified: true, expired: false, connection: { provider, connectionId: "c", profile: provider, account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" };
  return authStatus(state, { cli: "found", version: "supported", tools: "ready" }, 1);
}
const AUTH: AuthSnapshot = { revision: 1, providers: [status("claude")] };
const PICKER: ModelPickerView = { trigger: { provider: "claude", label: "Opus 5.5", ariaLabel: "Agent: Claude Code, model Opus 5.5" }, groups: [], effort: null };
const A: DockedMode = { kind: "existing", conversationId: "a", provider: "claude" };
const B: DockedMode = { kind: "existing", conversationId: "b", provider: "claude" };

beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = [];
  vi.stubGlobal("queueMicrotask", (run: () => void) => run());
  vi.stubGlobal("getComputedStyle", () => ({ lineHeight: "20px" }));
});
afterEach(() => vi.unstubAllGlobals());

const PRIMITIVES = new Set<unknown>(Object.values(Parts));
function expand(type: unknown, props: Record<string, unknown>): ReactNode {
  if (typeof type === "function") return (type as (p: unknown) => ReactNode)(props);
  return (type as { render(p: unknown, ref: unknown): ReactNode }).render(props, props.ref ?? null);
}
function elements(node: ReactNode): Record<string, unknown>[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode; [key: string]: unknown }>(child)) return [];
    if (PRIMITIVES.has(child.type)) return elements(expand(child.type, child.props));
    return [child.props, ...elements(child.props.children)];
  });
}
// The card's children as drawn, primitives not expanded: [type name, key] in order.
function cardChildren(root: ReactNode): [string, string | null][] {
  const card = Children.toArray((root as ReactElement<{ children: ReactNode }>).props.children).find(child => isValidElement(child) && child.type === Parts.ComposerCard) as ReactElement<{ children: ReactNode }>;
  return Children.toArray(card.props.children).filter(isValidElement).map(child => [typeof child.type === "string" ? child.type : (child.type as { displayName?: string; name?: string; render?: { name: string } }).render?.name ?? (child.type as { name: string }).name, child.key]);
}

function setup(patch: Partial<DockedComposerProps> = {}, drafts: [string, DockedDraft][] = []) {
  const store = { current: new Map<string, DockedDraft>(drafts) as ReadonlyMap<string, DockedDraft> };
  const send = vi.fn(async (_request: unknown): Promise<DockedOutcome> => ({ ok: true }));
  const queue = vi.fn(async (_request: unknown): Promise<DockedOutcome> => ({ ok: true }));
  const props: DockedComposerProps = {
    mode: A, project: "doan-design", homeDirectory: null, placeholder: "Reply, / for presets",
    drafts: store.current, onDrafts: update => { store.current = update(store.current); props.drafts = store.current; },
    auth: AUTH, picker: PICKER, provider: "claude", effort: null,
    onPickerOpen: vi.fn(), onPickModel: vi.fn(), onPickEffort: vi.fn(), onSettings: vi.fn(),
    presets: undefined, suggested: [], onPresetsOpen: vi.fn(), onPresetsRetry: vi.fn(),
    thumbnails: {}, onAttach: vi.fn(), onFiles: vi.fn(), onAttachmentRemoved: vi.fn(),
    turn: "idle", busy: null, canvasGone: false, queued: [],
    onSend: send, onQueue: queue, onStop: vi.fn(), onRemoveQueued: vi.fn(), onOpen: vi.fn(),
    ...patch,
  };
  const draw = () => { hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = []; return DockedComposer(props); };
  const render = () => elements(draw());
  return { store, send, queue, props, draw, render };
}
const find = (tree: Record<string, unknown>[], test: (props: Record<string, unknown>) => boolean) => { const found = tree.find(test); if (!found) throw new Error("not found"); return found; };
const field = (tree: Record<string, unknown>[]) => find(tree, props => props["aria-label"] === "Message");
const button = (tree: Record<string, unknown>[], label: string) => find(tree, props => props["aria-label"] === label);
const enter = () => ({ key: "Enter", shiftKey: false, keyCode: 13, nativeEvent: { isComposing: false }, preventDefault: vi.fn() });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const draft = (text: string, shape: DockedDraft["shape"] = "capsule"): DockedDraft => ({ ...EMPTY_DRAFT, text, shape });

test("the field is the same element, at the same place and with the same key, in both shapes", () => {
  const capsule = cardChildren(setup({}, [["conversation:a", draft("Short", "capsule")]]).draw());
  const box = cardChildren(setup({}, [["conversation:a", draft("Short", "box")]]).draw());
  expect(box).toEqual(capsule);
  expect(capsule.find(([name]) => name === "ComposerField")?.[1]).toBe(".$field");
});

test("typing a line break makes a box; the box stays when the text fits one line again, and only emptying returns to a capsule", () => {
  const { store, render } = setup();
  const change = (text: string) => (field(render()).onChange as (event: { target: { value: string } }) => void)({ target: { value: text } });
  change("one");
  expect(store.current.get("conversation:a")?.shape).toBe("capsule");
  change("one\ntwo");
  expect(store.current.get("conversation:a")?.shape).toBe("box");
  change("one");
  expect(store.current.get("conversation:a")?.shape).toBe("box");
  change("");
  expect(store.current.get("conversation:a")?.shape).toBe("capsule");
});

test("a capsule whose text wraps at its own width becomes a box after the draw", () => {
  const { store, draw } = setup({}, [["conversation:a", draft("A long line that wraps in the capsule")]]);
  draw();
  hooks.refs[2]!.current = { scrollHeight: 40 };
  for (const effect of hooks.effects) effect();
  expect(store.current.get("conversation:a")?.shape).toBe("box");
});

test("each conversation keeps its own draft, and a switch shows the other draft in the same render", () => {
  const { props, render } = setup({}, [["conversation:a", draft("For A")], ["conversation:b", draft("For B")]]);
  expect(field(render()).value).toBe("For A");
  props.mode = B;
  expect(field(render()).value).toBe("For B");
  expect(draftKey({ kind: "new", root: "/r" })).toBe("root:/r");
});

test("an accepted send empties the field, returns it to a capsule and keeps focus in it", async () => {
  const { store, send, render } = setup({}, [["conversation:a", { ...draft("Make the header lighter", "box"), anchors: [] }]]);
  const focus = vi.fn();
  render();
  hooks.refs[2]!.current = { focus, setSelectionRange: vi.fn(), value: "" };
  (field(render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  expect(send).toHaveBeenCalledWith({ text: "Make the header lighter", anchors: [], attachments: [] });
  expect(store.current.get("conversation:a")).toEqual(EMPTY_DRAFT);
  expect(focus).toHaveBeenCalled();
});

test("while the turn runs, Enter on an empty field does nothing, Stop stops, and text queues", async () => {
  const { send, queue, props, render, store } = setup({ turn: "running" });
  (field(render()).onKeyDown as (event: unknown) => void)(enter());
  expect(props.onStop).not.toHaveBeenCalled();
  (button(render(), "Stop").onClick as () => void)();
  expect(props.onStop).toHaveBeenCalledTimes(1);
  store.current = new Map([["conversation:a", draft("Also shorten the caption")]]); props.drafts = store.current;
  (button(render(), "Queue").onClick as () => void)();
  await flush();
  expect(queue).toHaveBeenCalledWith({ text: "Also shorten the caption", anchors: [], attachments: [] });
  expect(send).not.toHaveBeenCalled();
  expect(store.current.get("conversation:a")).toEqual(EMPTY_DRAFT);
});

test("Remove on a queued message hands its id to the host", () => {
  const { props, render } = setup({ turn: "running", queued: [{ id: "q1", text: "First" }, { id: "q2", text: "Second" }] });
  const removes = render().filter(item => item["aria-label"] === "Remove queued message");
  expect(removes).toHaveLength(2);
  (removes[1]!.onClick as () => void)();
  expect(props.onRemoveQueued).toHaveBeenCalledWith("q2");
});

test("a late project_busy keeps the draft and shows Home's busy sentence until the person edits", async () => {
  const { store, render } = setup({ onSend: async () => ({ error: "project_busy" }) }, [["conversation:a", draft("Draw it")]]);
  (button(render(), "Send").onClick as () => void)();
  await flush();
  expect(store.current.get("conversation:a")?.text).toBe("Draw it");
  expect(render().some(item => item.children === "Another conversation is still running in doan-design.")).toBe(true);
  expect(button(render(), "Send").disabled).toBe(true);
  (field(render()).onChange as (event: { target: { value: string } }) => void)({ target: { value: "Draw it again" } });
  expect(render().some(item => item.children === "Another conversation is still running in doan-design.")).toBe(false);
});

test("a busy refusal gives way once the host has reported that conversation and it ends", async () => {
  const { props, render } = setup({ onSend: async () => ({ error: "project_busy" }) }, [["conversation:a", draft("Draw it")]]);
  (button(render(), "Send").onClick as () => void)();
  await flush();
  expect(button(render(), "Send").disabled).toBe(true);
  props.busy = { kind: "project", waiting: false, open: "c9" };
  expect(render().some(item => item["aria-label"] === "Open the running conversation")).toBe(true);
  props.busy = null;
  expect(button(render(), "Send").disabled).toBe(false);
});

test("an accepted send clears the notice an earlier refusal left", async () => {
  let reply: DockedOutcome = { error: "rate_limited" };
  const { props, render } = setup({ onSend: async () => reply }, [["conversation:a", draft("Draw it")]]);
  (button(render(), "Send").onClick as () => void)();
  await flush();
  expect(render().some(item => item.children === "Claude Code is rate limited. Try again later.")).toBe(true);
  reply = { ok: true };
  (button(render(), "Send").onClick as () => void)();
  await flush();
  props.turn = "waiting";
  expect(render().some(item => item.children === "Claude Code is rate limited. Try again later.")).toBe(false);
  expect(render().some(item => item.children === "Answer or stop the request above.")).toBe(true);
});

test("a refusal belongs to the draft it was sent from: another conversation does not show it", async () => {
  const { props, render } = setup({ onSend: async () => ({ error: "project_busy" }) }, [["conversation:a", draft("Draw it")], ["conversation:b", draft("Other")]]);
  (button(render(), "Send").onClick as () => void)();
  await flush();
  props.mode = B;
  expect(render().some(item => item.children === "Another conversation is still running in doan-design.")).toBe(false);
  expect(button(render(), "Send").disabled).toBe(false);
});

test("a restore refused because the canvas is gone replaces the composer", async () => {
  const archived: DockedMode = { kind: "archived", conversationId: "a", provider: "claude" };
  const { draw, render } = setup({ mode: archived, onSend: async () => ({ error: "canvas_not_found" }) }, [["conversation:a", draft("Go back")]]);
  (button(render(), "Send").onClick as () => void)();
  await flush();
  const shown = draw() as ReactElement<{ className: string }>;
  expect(shown.props.className).toBe("canvas-gone");
});

test("attachment_missing marks the moved chip instead of a notice", async () => {
  const file = { key: "k1", id: "f1", name: "notes.md", kind: "file" as const, pasted: false, status: "ready" as const };
  const { store, render } = setup({ onSend: async () => ({ error: "attachment_missing", missing: ["f1"] }) }, [["conversation:a", { ...draft("See this", "box"), attachments: [file] }]]);
  (button(render(), "Send").onClick as () => void)();
  await flush();
  expect(store.current.get("conversation:a")?.attachments[0]?.status).toBe("missing");
});

test("a reply that lands after a switch settles its own draft and leaves focus where the person is", async () => {
  let reply!: (outcome: DockedOutcome) => void;
  const { store, props, render } = setup({ onSend: () => new Promise(resolve => { reply = resolve; }) }, [["conversation:a", draft("For A")], ["conversation:b", draft("For B")]]);
  render();
  const focus = vi.fn();
  hooks.refs[2]!.current = { focus, setSelectionRange: vi.fn(), value: "" };
  (button(render(), "Send").onClick as () => void)();
  props.mode = B;
  expect(field(render()).readOnly).toBe(false);
  reply({ ok: true });
  await flush();
  expect(store.current.get("conversation:a")).toEqual(EMPTY_DRAFT);
  expect(store.current.get("conversation:b")?.text).toBe("For B");
  expect(focus).not.toHaveBeenCalled();
});

// Review RB2 🟡1–🟡4, ⚪2.
test("sends from two conversations stay pending independently, and each reply settles only its own draft", async () => {
  const replies = new Map<string, (outcome: DockedOutcome) => void>();
  const { props, store, render } = setup({ onSend: request => new Promise(resolve => { replies.set((request as { text: string }).text, resolve); }) }, [["conversation:a", draft("A")], ["conversation:b", draft("B")]]);
  (button(render(), "Send").onClick as () => void)();
  props.mode = B;
  (button(render(), "Send").onClick as () => void)();
  props.mode = A;
  expect(field(render()).readOnly).toBe(true);
  replies.get("B")!({ ok: true });
  await flush();
  expect(field(render()).readOnly).toBe(true);
  expect(store.current.get("conversation:b")).toEqual(EMPTY_DRAFT);
  replies.get("A")!({ ok: true });
  await flush();
  expect(field(render()).readOnly).toBe(false);
  expect(store.current.get("conversation:a")).toEqual(EMPTY_DRAFT);
});

test("chips the host adds turn a capsule into a box, and a draft the host changes drops its refusal", async () => {
  const { props, store, draw, render } = setup({ onSend: async () => ({ error: "project_busy" }) }, [["conversation:a", draft("Draw it")]]);
  (button(render(), "Send").onClick as () => void)();
  await flush();
  expect(button(render(), "Send").disabled).toBe(true);
  const file = { key: "f", id: "f", name: "a.txt", kind: "file" as const, pasted: false, status: "ready" as const };
  store.current = new Map([["conversation:a", { ...draft("Draw it"), attachments: [file] }]]); props.drafts = store.current;
  draw();
  for (const effect of hooks.effects) effect();
  expect(store.current.get("conversation:a")?.shape).toBe("box");
  expect((draw() as ReactElement<{ "data-shape": string }>).props["data-shape"]).toBe("box");
  expect(button(render(), "Send").disabled).toBe(false);
});

test("a live blocking reason and its action show over an old error notice, and the field names only drawn ids", async () => {
  const { props, render } = setup({ onSend: async () => ({ error: "rate_limited" }) }, [["conversation:a", draft("A")]]);
  (button(render(), "Send").onClick as () => void)();
  await flush();
  let tree = render();
  expect(tree.some(item => item.children === "Claude Code is rate limited. Try again later.")).toBe(true);
  expect(field(tree)["aria-describedby"]).toBeUndefined();
  props.busy = { kind: "project", waiting: true, open: "other" };
  tree = render();
  const ids = String(field(tree)["aria-describedby"]).split(" ");
  expect(ids.every(id => tree.some(item => item.id === id))).toBe(true);
  expect(tree.some(item => item["aria-label"] === "Open the running conversation")).toBe(true);
  props.busy = null; props.turn = "waiting";
  tree = render();
  expect(tree.some(item => item.children === "Answer or stop the request above.")).toBe(true);
});

test("the / list's closed state and highlight belong to the draft on screen", () => {
  const { props, render } = setup({}, [["conversation:a", draft("/po")], ["conversation:b", draft("/cr")]]);
  const escape = { key: "Escape", shiftKey: false, keyCode: 27, nativeEvent: { isComposing: false }, preventDefault: vi.fn() };
  (field(render()).onKeyDown as (event: unknown) => void)(escape);
  expect(field(render()).role).toBeUndefined();
  props.mode = B;
  render();
  for (const effect of hooks.effects) effect();
  expect(field(render()).role).toBe("combobox");
});
