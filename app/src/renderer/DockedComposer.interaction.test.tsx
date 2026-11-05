import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider } from "../main/agentAuth/types";
import { plainText, textSegments, type FieldSegment } from "./anchorField";
import * as Parts from "./ComposerParts";
import { DockedComposer, QueueRows, SEND_NOW_REFUSED_TEXT, type DockedComposerProps, type DockedOutcome } from "./DockedComposer";
import { draftKey, EMPTY_DRAFT, type DockedDraft, type DockedMode } from "./dockedRules";
import { emptyComposer, HeroComposer } from "./HomeComposerView";
import type { ModelPickerView } from "./homeComposer";

// Hooks run as plain state so the composer's handlers can be called without a DOM (HomeComposerView.interaction).
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, effects: [] as (() => unknown)[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useId: () => "id",
  useReducer: () => [0, () => {}],
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
  useLayoutEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
  useImperativeHandle: (ref: { current: unknown } | undefined, create: () => Record<string, unknown>) => {
    const handle = create();
    if (ref && "sendAll" in handle) ref.current = handle;
  },
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
function elements(node: ReactNode, withQueue = false): Record<string, unknown>[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode; [key: string]: unknown }>(child)) return [];
    if (withQueue && child.type === QueueRows) return [child.props, ...elements(expand(child.type, child.props), true)];
    // The field's own props (value, onChange, readOnly) are kept beside the element it draws.
    if (PRIMITIVES.has(child.type)) return [...(child.type === Parts.ComposerField ? [child.props] : []), ...elements(expand(child.type, child.props), withQueue)];
    return [child.props, ...elements(child.props.children, withQueue)];
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
    onSend: send, onQueue: queue, onStop: vi.fn(), onRemoveQueued: vi.fn(async () => true), onOpen: vi.fn(),
    ...patch,
  };
  const draw = () => { hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = []; return DockedComposer(props); };
  const render = (withQueue = false) => elements(draw(), withQueue);
  return { store, send, queue, props, draw, render };
}
const find = (tree: Record<string, unknown>[], test: (props: Record<string, unknown>) => boolean) => { const found = tree.find(test); if (!found) throw new Error("not found"); return found; };
const field = (tree: Record<string, unknown>[]) => find(tree, props => props["aria-label"] === "Message");
// ComposerField's props: its value as segments, onChange and readOnly.
const input = (tree: Record<string, unknown>[]) => find(tree, props => typeof props.onKey === "function" && "value" in props);
const type = (tree: Record<string, unknown>[], text: string) => (input(tree).onChange as (value: FieldSegment[]) => void)(textSegments(text));
const shownText = (tree: Record<string, unknown>[]) => plainText(input(tree).value as FieldSegment[]);
const button = (tree: Record<string, unknown>[], label: string) => find(tree, props => props["aria-label"] === label);
const enter = () => ({ key: "Enter", shiftKey: false, keyCode: 13, nativeEvent: { isComposing: false }, preventDefault: vi.fn() });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const draft = (text: string, shape: DockedDraft["shape"] = "capsule"): DockedDraft => ({ ...EMPTY_DRAFT, segments: textSegments(text), shape });
const draftText = (value: DockedDraft | undefined) => plainText(value?.segments ?? []);

test("the field is the same element, at the same place and with the same key, in both shapes", () => {
  const capsule = cardChildren(setup({}, [["conversation:a", draft("Short", "capsule")]]).draw());
  const box = cardChildren(setup({}, [["conversation:a", draft("Short", "box")]]).draw());
  expect(box).toEqual(capsule);
  expect(capsule.find(([name]) => name === "ComposerField")?.[1]).toBe(".$field");
});

test("typing a line break makes a box; the box stays when the text fits one line again, and only emptying returns to a capsule", () => {
  const { store, render } = setup();
  const change = (text: string) => type(render(), text);
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
  hooks.refs[2]!.current = { element: () => ({ scrollHeight: 40 }) };
  for (const effect of hooks.effects) effect();
  expect(store.current.get("conversation:a")?.shape).toBe("box");
});

test("each conversation keeps its own draft, and a switch shows the other draft in the same render", () => {
  const { props, render } = setup({}, [["conversation:a", draft("For A")], ["conversation:b", draft("For B")]]);
  expect(shownText(render())).toBe("For A");
  props.mode = B;
  expect(shownText(render())).toBe("For B");
  expect(draftKey({ kind: "new", root: "/r" })).toBe("root:/r");
});

test("an accepted send empties the field, returns it to a capsule and keeps focus in it", async () => {
  const { store, send, render } = setup({}, [["conversation:a", draft("Make the header lighter", "box")]]);
  const focus = vi.fn();
  render();
  hooks.refs[2]!.current = { focus };
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

// canvas-composer-polish A2: a queued message's files are drawn in the thread once Send now moves it there.
test("a queued message carries its files' names, sizes and kinds for the thread, apart from the ids main takes", async () => {
  const { queue, render, store, props } = setup({ turn: "running" });
  store.current = new Map([["conversation:a", { ...draft("With the notes"), attachments: [{ key: "k", id: "f", name: "notes.md", kind: "file", pasted: false, status: "ready", size: 4096 }] }]]); props.drafts = store.current;
  (button(render(), "Queue").onClick as () => void)();
  await flush();
  expect(queue).toHaveBeenCalledWith({ text: "With the notes", anchors: [], attachments: [{ id: "f" }], files: [{ name: "notes.md", size: 4096, kind: "file" }] });
});

test("a late project_busy keeps the draft and shows Home's busy sentence until the person edits", async () => {
  const { store, render } = setup({ onSend: async () => ({ error: "project_busy" }) }, [["conversation:a", draft("Draw it")]]);
  (button(render(), "Send").onClick as () => void)();
  await flush();
  expect(draftText(store.current.get("conversation:a"))).toBe("Draw it");
  expect(render().some(item => item.children === "Another conversation is still running in doan-design.")).toBe(true);
  expect(button(render(), "Send").disabled).toBe(true);
  type(render(), "Draw it again");
  expect(render().some(item => item.children === "Another conversation is still running in doan-design.")).toBe(false);
});

test("a busy refusal gives way once the host has reported that conversation and it ends", async () => {
  const { props, render } = setup({ onSend: async () => ({ error: "project_busy" }) }, [["conversation:a", draft("Draw it")]]);
  (button(render(), "Send").onClick as () => void)();
  await flush();
  expect(button(render(), "Send").disabled).toBe(true);
  props.busy = { kind: "project", open: "c9" };
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
  hooks.refs[2]!.current = { focus };
  (button(render(), "Send").onClick as () => void)();
  props.mode = B;
  expect(input(render()).readOnly).toBe(false);
  reply({ ok: true });
  await flush();
  expect(store.current.get("conversation:a")).toEqual(EMPTY_DRAFT);
  expect(draftText(store.current.get("conversation:b"))).toBe("For B");
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
  expect(input(render()).readOnly).toBe(true);
  replies.get("B")!({ ok: true });
  await flush();
  expect(input(render()).readOnly).toBe(true);
  expect(store.current.get("conversation:b")).toEqual(EMPTY_DRAFT);
  replies.get("A")!({ ok: true });
  await flush();
  expect(input(render()).readOnly).toBe(false);
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
  props.busy = { kind: "project", open: "other" };
  tree = render();
  const ids = String(field(tree)["aria-describedby"]).split(" ");
  expect(ids.every(id => tree.some(item => item.id === id))).toBe(true);
  expect(tree.some(item => item["aria-label"] === "Open the running conversation")).toBe(true);
  props.busy = null; props.turn = "waiting";
  tree = render();
  expect(tree.some(item => item.children === "Answer or stop the request above.")).toBe(true);
});

test("the / list's closed state and highlight belong to the draft on screen", () => {
  pressDocument();
  const { props, render } = setup({}, [["conversation:a", draft("/po")], ["conversation:b", draft("/cr")]]);
  const escape = { key: "Escape", shiftKey: false, keyCode: 27, nativeEvent: { isComposing: false }, preventDefault: vi.fn() };
  (field(render()).onKeyDown as (event: unknown) => void)(escape);
  expect(field(render()).role).toBe("textbox");
  props.mode = B;
  render();
  for (const effect of hooks.effects) effect();
  expect(field(render()).role).toBe("combobox");
});

// buzz-canvas-conversation R1: the field holds chips as segments; they leave as markers and anchors.
test("a draft with chips sends numbered markers and its anchors, and Backspace at the start keeps the preset while chips remain", async () => {
  const payment = { frame: { id: "payment", title: "Payment" } };
  const preset = { id: "critique", title: "Critique the design", description: "", scope: "" };
  const segments: FieldSegment[] = [{ kind: "chip", anchor: payment }, { kind: "text", text: " feels crowded" }];
  const { send, render } = setup({ chipScope: "canvas:payment" }, [["conversation:a", { ...EMPTY_DRAFT, segments, preset, shape: "box" }]]);
  expect(input(render()).chipScope).toBe("canvas:payment");
  hooks.refs[2]!.current = { focus: vi.fn(), caretAtStart: () => true };
  const back = { key: "Backspace", shiftKey: false, keyCode: 8, nativeEvent: { isComposing: false }, preventDefault: vi.fn() };
  (field(render()).onKeyDown as (event: unknown) => void)(back);
  expect(back.preventDefault).not.toHaveBeenCalled();
  (field(render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  expect(send).toHaveBeenCalledWith({ text: "Use the Doan design preset `critique` (Critique the design).\n\n{{1}} feels crowded", anchors: [payment], attachments: [] });
});

test("Overview's field takes no chips: chipScope defaults to null", () => {
  expect(input(setup().render()).chipScope).toBeNull();
});

// BR1 fix round 1: the field learns which draft it shows, so a switch ends the previous draft's undo history.
test("the field gets the draft key, which changes with the conversation while the element keeps its key", () => {
  const { props, render, draw } = setup({}, [["conversation:a", draft("")], ["conversation:b", draft("")]]);
  expect(input(render()).draftKey).toBe("conversation:a");
  props.mode = B;
  expect(input(render()).draftKey).toBe("conversation:b");
  expect(cardChildren(draw()).find(([name]) => name === "ComposerField")?.[1]).toBe(".$field");
});

// buzz-canvas-conversation design §2 'Errors' and §0 'Model and effort': the canvas panel's composer states.
const RESUME: DockedMode = { kind: "resume", root: "/w", canvas: { path: ".doan/canvases/a.html", id: "a" }, provider: "codex" };
// Drawn text outside the agent menu, whose own note can read like a reason.
const has = (tree: Record<string, unknown>[], text: string) => tree.some(item => item.children === text && item.className !== "menu-note");

test("held, Send waits without a reason line while the draft is kept", () => {
  const { render } = setup({ mode: { kind: "new", root: "/w", canvas: RESUME.canvas }, held: true }, [[draftKey(RESUME), draft("Fix the totals")]]);
  expect(button(render(), "Send").disabled).toBe(true);
  expect(render().some(item => item.className === "composer-reason docked-reason")).toBe(false);
  expect(shownText(render())).toBe("Fix the totals");
});

test("locked, the field keeps the draft but takes no input, and the reason line says why", () => {
  const reason = "This canvas isn’t listed in acme-web, so its conversation can’t continue.";
  const { render } = setup({ unavailable: reason, locked: true }, [["conversation:a", draft("Tighten the totals")]]);
  expect(input(render()).readOnly).toBe(true);
  expect(shownText(render())).toBe("Tighten the totals");
  expect(has(render(), reason)).toBe(true);
  expect(button(render(), "Send").disabled).toBe(true);
  expect(button(render(), "Attach files").disabled).toBe(true);
});

// A dropped or pasted file, shaped as the composer reads it.
const fileEvent = () => {
  const file = new File(["x"], "notes.md");
  return { preventDefault: vi.fn(), stopPropagation: vi.fn(),
    dataTransfer: { types: ["Files"], files: [file], items: [{ kind: "file", webkitGetAsEntry: () => ({ isDirectory: false }) }], dropEffect: "" },
    clipboardData: { files: [file], getData: () => "" } };
};
// A primitive's own props (elements() expands primitives into what they draw).
function primitive(node: ReactNode, type: unknown): Record<string, unknown> | null {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; [key: string]: unknown }>(child)) continue;
    if (child.type === type) return child.props;
    const inner = primitive(PRIMITIVES.has(child.type) ? expand(child.type, child.props) : child.props.children, type);
    if (inner) return inner;
  }
  return null;
}

test("locked, Presets, a dropped file and a pasted file add nothing to the kept draft", () => {
  const reason = "Another canvas has the same ID, so this conversation can’t continue. Run doan check in a terminal to find it.";
  const onFiles = vi.fn();
  const { render, draw } = setup({ unavailable: reason, locked: true, onFiles }, [["conversation:a", draft("Tighten the totals")]]);
  expect(primitive(draw(), Parts.PresetsButton)?.disabled).toBe(true);
  ((draw() as ReactElement<Record<string, unknown>>).props.onDrop as (event: unknown) => void)(fileEvent());
  const paste = fileEvent();
  (input(render()).onPaste as (event: unknown) => void)(paste);
  expect(onFiles).not.toHaveBeenCalled();
  expect(paste.preventDefault).toHaveBeenCalled();
  expect(shownText(render())).toBe("Tighten the totals");
  const withFile = setup({ unavailable: reason, locked: true }, [["conversation:a", { ...draft("Tighten the totals"), attachments: [{ key: "k", id: "f", name: "notes.md", kind: "file", pasted: false, status: "ready", size: 4096 }] }]]);
  expect(primitive(withFile.draw(), Parts.ComposerChips)?.disabled).toBe(true);
});

test("unlocked, the same drop and paste reach the host as files", () => {
  const onFiles = vi.fn();
  const { render, draw } = setup({ onFiles }, [["conversation:a", draft("Tighten the totals")]]);
  expect(primitive(draw(), Parts.PresetsButton)?.disabled).toBe(false);
  ((draw() as ReactElement<Record<string, unknown>>).props.onDrop as (event: unknown) => void)(fileEvent());
  (input(render()).onPaste as (event: unknown) => void)(fileEvent());
  expect(onFiles).toHaveBeenCalledTimes(2);
});

test("a terminal session keeps the trigger places, chosen by the terminal, and takes no files", () => {
  const { render } = setup({ mode: RESUME, provider: "codex", fixed: true });
  const agent = button(render(), "Model: set by the terminal session (Codex)");
  expect(agent["aria-disabled"]).toBe("true");
  expect(button(render(), "Effort: set by the terminal session")["aria-disabled"]).toBe("true");
  expect(button(render(), "Attach files")["aria-disabled"]).toBe("true");
  expect(has(render(), "Terminal session")).toBe(true);
  const tips = render().map(item => item.label);
  expect(tips).toContain("Set in your terminal");
  expect(tips).toContain("Files can’t be attached to a terminal session");
});

test("a refused terminal session offers a new conversation, which keeps the draft and drops the notice", async () => {
  const onStartNew = vi.fn();
  const refuse = vi.fn(() => ({ kind: "notice" as const, text: "Couldn’t continue the terminal session: it’s in use in another terminal.", startNew: true }));
  const { store, render } = setup({ mode: RESUME, provider: "codex", fixed: true, refuse, onStartNew, onSend: async () => ({ error: "session_in_use" }) }, [[draftKey(RESUME), draft("Fix the totals")]]);
  (button(render(), "Send").onClick as () => void)();
  await flush();
  expect(refuse).toHaveBeenCalledWith("session_in_use", "codex");
  expect(has(render(), "Couldn’t continue the terminal session: it’s in use in another terminal.")).toBe(true);
  (find(render(), item => item.children === "Start a new conversation").onClick as () => void)();
  expect(onStartNew).toHaveBeenCalledTimes(1);
  expect(has(render(), "Couldn’t continue the terminal session: it’s in use in another terminal.")).toBe(false);
  expect(draftText(store.current.get(draftKey(RESUME)))).toBe("Fix the totals");
});

test("a notice with Retry sends the same draft again", async () => {
  const send = vi.fn(async (): Promise<DockedOutcome> => ({ error: "rate_limited" }));
  const refuse = () => ({ kind: "notice" as const, text: "Couldn’t start with Codex: it is rate limited.", retry: true });
  const { render } = setup({ mode: { kind: "new", root: "/w", canvas: RESUME.canvas }, refuse, onSend: send }, [[draftKey({ kind: "new", root: "/w", canvas: RESUME.canvas }), draft("Fix")]]);
  (button(render(), "Send").onClick as () => void)();
  await flush();
  (find(render(), item => item.children === "Retry").onClick as () => void)();
  await flush();
  expect(send).toHaveBeenCalledTimes(2);
});

test("a blocked refusal holds Send with its reason until the person edits the draft", async () => {
  const refuse = () => ({ kind: "blocked" as const, text: "No agent is ready to run.", action: { label: "Sign in to an agent…", target: { section: "agents" as const } } });
  const { render } = setup({ refuse, onSend: async () => ({ error: "no_agent" }) }, [["conversation:a", draft("Draw it")]]);
  (button(render(), "Send").onClick as () => void)();
  await flush();
  expect(has(render(), "No agent is ready to run.")).toBe(true);
  expect(has(render(), "Sign in to an agent…")).toBe(true);
  expect(button(render(), "Send").disabled).toBe(true);
  type(render(), "Draw it now");
  expect(has(render(), "No agent is ready to run.")).toBe(false);
});

// The shipped queue rule (design §2 'Errors' not_running): the turn ended before the queue took the message.
test("a queue refused as not_running goes out as a send of the same message", async () => {
  const { props, store, send, queue, render } = setup({}, [["conversation:a", draft("Also this")]]);
  props.turn = "running";
  queue.mockResolvedValueOnce({ error: "not_running" });
  (button(render(), "Queue").onClick as () => void)();
  await flush();
  expect(queue).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ text: "Also this" }));
  expect(store.current.get("conversation:a")).toEqual(EMPTY_DRAFT);
});

test("with no ready agent a new conversation shows no reason line; Send is disabled and carries the reason", () => {
  const draftKeyNew = draftKey({ kind: "new", root: "/w" });
  const { render } = setup({ mode: { kind: "new", root: "/w" }, provider: null }, [[draftKeyNew, draft("Draw it")]]);
  expect(render().some(props => props.role === "status" && props.className === "composer-reason docked-reason")).toBe(false);
  const send = button(render(), "Send");
  expect(send.disabled).toBe(true);
  expect(send.title).toBe("No agent is ready to run.");
  expect(send["aria-describedby"]).toBeTruthy();
});

test("a chosen agent that cannot run still shows its line", () => {
  const draftKeyNew = draftKey({ kind: "new", root: "/w" });
  const { render } = setup({ mode: { kind: "new", root: "/w" }, provider: "claude", auth: { revision: 1, providers: [] } }, [[draftKeyNew, draft("Draw it")]]);
  expect(has(render(), "Claude Code can’t run right now. Choose another agent.")).toBe(true);
});

// Review W1: a refusal goes to the composer's lasting live region; the same refusal again changes its text, so it is
// read again.
test("a repeated Send now refusal changes the composer's status text each time", () => {
  const { render } = setup({ turn: "running", sendNow: true, onSendQueuedNow: async () => {}, queued: [{ id: "q1", text: "Also this" }] });
  const announce = () => find(render(), props => typeof props.announce === "function").announce as (text: string) => void;
  const said = () => find(render(), props => props.className === "sr-only" && props.role === "status").children;
  const before = said();
  announce()(SEND_NOW_REFUSED_TEXT);
  const first = said();
  announce()(SEND_NOW_REFUSED_TEXT);
  const second = said();
  expect([before, first, second].map(text => String(text).trim())).toEqual(["", SEND_NOW_REFUSED_TEXT, SEND_NOW_REFUSED_TEXT]);
  expect(first).not.toBe(before);
  expect(second).not.toBe(first);
});

// A press outside the `/` list and its field closes it as Escape does, for the draft on screen, until that field is empty
// again; a press in the field or the list keeps it. A press in the canvas, which the app's document never sees, closes
// both preset lists through the canvas page's signal.
function pressDocument() {
  const listeners: ((event: { target: unknown }) => void)[] = [];
  vi.stubGlobal("document", {
    addEventListener: (type: string, listener: (event: { target: unknown }) => void, capture: boolean) => { if (type === "pointerdown" && capture) listeners.push(listener); },
    removeEventListener: (_type: string, listener: (event: { target: unknown }) => void) => { const at = listeners.indexOf(listener); if (at >= 0) listeners.splice(at, 1); },
  });
  return { listeners, press: (target: unknown) => { for (const listener of [...listeners]) listener({ target }); } };
}
const slashList = (tree: Record<string, unknown>[]) => find(tree, props => typeof props.className === "string" && props.className.includes("slash-popover"));
const runEffects = () => hooks.effects.map(effect => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === "function");

test("a press outside the / list closes it for that draft until its field is empty; a press in the field or the list keeps it", () => {
  const { listeners, press } = pressDocument();
  const { props, store, render } = setup({}, [["conversation:a", draft("/po")], ["conversation:b", draft("/cr")]]);
  const text = {}, row = {}, chip = {};
  const tree = render();
  hooks.refs[2]!.current = { focus: vi.fn(), element: () => ({ contains: (node: unknown) => node === text }) };
  (slashList(tree).ref as { current: unknown }).current = { contains: (node: unknown) => node === row };
  let cleanups = runEffects();
  press(text); press(row);
  expect(field(render()).role).toBe("combobox");
  press(chip);
  expect(field(render()).role).toBe("textbox");
  expect(draftText(store.current.get("conversation:a"))).toBe("/po");
  cleanups.forEach(cleanup => cleanup());
  expect(listeners).toHaveLength(0);
  // Typing on keeps it closed; the other conversation's list is its own.
  type(render(), "/pol");
  expect(field(render()).role).toBe("textbox");
  props.mode = B;
  render(); cleanups = runEffects();
  expect(field(render()).role).toBe("combobox");
  cleanups.forEach(cleanup => cleanup());
  props.mode = A;
  type(render(), "");
  render(); runEffects().forEach(cleanup => cleanup());
  type(render(), "/");
  expect(field(render()).role).toBe("combobox");
});

test("the canvas's press signal closes the / list and the Presets popover", () => {
  pressDocument();
  const subscribers = new Set<() => void>();
  const canvasPress = vi.fn((listener: () => void) => { subscribers.add(listener); return () => { subscribers.delete(listener); }; });
  const { render } = setup({ canvasPress }, [["conversation:a", draft("/po")]]);
  const root = (tree: Record<string, unknown>[]) => find(tree, props => typeof props.onOpenChange === "function" && typeof props.open === "boolean");
  (root(render()).onOpenChange as (open: boolean) => void)(true);
  render();
  const cleanups = runEffects();
  expect(subscribers.size).toBe(2);
  for (const listener of [...subscribers]) listener();
  const tree = render();
  expect(field(tree).role).toBe("textbox");
  expect(root(tree).open).toBe(false);
  cleanups.forEach(cleanup => cleanup());
  expect(subscribers.size).toBe(0);
});

// The composer's Pick from canvas starts the same pick as the toolbar Picker and ⌘L, so its tooltip shows ⌘L like the
// toolbar's; an unavailable Pick shows only its reason.
test("Pick from canvas shows ⌘L in its tooltip, and only the reason while unavailable", () => {
  const pickButton = (node: ReactNode): ReactElement<Record<string, unknown>> | null => {
    for (const child of Children.toArray(node)) {
      if (!isValidElement<Record<string, unknown>>(child)) continue;
      if (typeof child.type === "function" && child.type.name === "PickButton") return child;
      const found = pickButton(child.props.children as ReactNode);
      if (found) return found;
    }
    return null;
  };
  const tip = (pick: NonNullable<DockedComposerProps["pick"]>) => {
    const element = pickButton(setup({ pick }).draw())!;
    const drawn = (element.type as (props: unknown) => ReactNode)(element.props);
    return elements(drawn).find(props => typeof props.className === "string" ? props.className.includes("has-key") : false) ?? elements(drawn).at(-1)!;
  };
  const on = tip({ pressed: false, enabled: true, reason: null, onToggle: () => {} });
  expect(on.className).toBe("has-key");
  const kbd = elements(on.children as ReactNode).find(props => props.className === "doan-kbd");
  expect(kbd).toMatchObject({ "data-ui-variant": "on-prominent", "data-ui-size": "sm", children: "⌘L" });
  const off = tip({ pressed: false, enabled: false, reason: "Pick from canvas isn’t available while the canvas can’t be shown.", onToggle: () => {} });
  expect(off.className).toBeUndefined();
  expect(off.children).toBe("Pick from canvas isn’t available while the canvas can’t be shown.");
});


const queued = [{ id: "q1", text: "First" }, { id: "q2", text: "Second" }, { id: "q3", text: "Third" }];
const controlEnter = () => ({ ...enter(), ctrlKey: true, metaKey: false, altKey: false });
function pressControl(tree: Record<string, unknown>[], event = controlEnter()) {
  (field(tree).onKeyDown as (event: unknown) => void)(event);
  return event;
}
function shortcutSetup(patch: Partial<DockedComposerProps> = {}, text = "") {
  const activeElement = { name: "input" };
  vi.stubGlobal("document", { body: {}, activeElement });
  const result = setup({ turn: "running", sendNow: true, queued, onSendQueuedNow: vi.fn(async () => {}), ...patch }, [["conversation:a", draft(text)]]);
  return { ...result, render: () => result.render(true), activeElement };
}

test("Control+Enter sends three rows in order without waiting or resending flying rows and keeps input focus", async () => {
  const onSendQueuedNow = vi.fn(() => new Promise<void>(() => {}));
  const { render, props, activeElement } = shortcutSetup({ onSendQueuedNow });
  const event = pressControl(render());
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(onSendQueuedNow.mock.calls).toEqual([["q1"], ["q2"], ["q3"]]);
  pressControl(render());
  expect(onSendQueuedNow).toHaveBeenCalledTimes(3);
  expect(document.activeElement).toBe(activeElement);
  expect(props.onStop).not.toHaveBeenCalled();
});

test("Control+Enter shows a refusal only under the middle row and still attempts the last row", async () => {
  const onSendQueuedNow = vi.fn(async (id: string) => id === "q2" ? { error: "not_running", turnRuns: true } : undefined);
  const { render } = shortcutSetup({ onSendQueuedNow });
  pressControl(render());
  await flush();
  expect(onSendQueuedNow.mock.calls).toEqual([["q1"], ["q2"], ["q3"]]);
  const rows = render().filter(item => item.role === "listitem");
  expect(rows.map(row => elements(row.children as ReactNode).some(item => item.children === SEND_NOW_REFUSED_TEXT))).toEqual([false, true, false]);
});

test("Control+Enter queues the draft then steers its item last and empties the field with focus kept", async () => {
  const calls: string[] = [];
  const { render, store } = shortcutSetup({
    onSendQueuedNow: vi.fn(async id => { calls.push(id); }),
    onQueue: vi.fn(async (): Promise<DockedOutcome> => { calls.push("queue"); return { ok: true, itemId: "q4" }; }),
  }, "Fourth");
  render();
  const focus = vi.fn(); hooks.refs[2]!.current = { focus };
  pressControl(render());
  await flush();
  expect(calls).toEqual(["q1", "q2", "q3", "queue", "q4"]);
  expect(store.current.get("conversation:a")).toEqual(EMPTY_DRAFT);
  expect(focus).toHaveBeenCalledOnce();
});

test("Control+Enter sends instead when queue says not_running and does not steer that draft", async () => {
  const onSendQueuedNow = vi.fn(async () => {});
  const { render, send, store } = shortcutSetup({ onSendQueuedNow, onQueue: async () => ({ error: "not_running" }) }, "Fourth");
  pressControl(render()); await flush();
  expect(send).toHaveBeenCalledWith({ text: "Fourth", anchors: [], attachments: [] });
  expect(onSendQueuedNow.mock.calls).toEqual([["q1"], ["q2"], ["q3"]]);
  expect(store.current.get("conversation:a")).toEqual(EMPTY_DRAFT);
});

test.each(["idle", "running"] as const)("Control+Enter falls back to Enter without Send now in %s", async turn => {
  const { render, props, send, queue } = shortcutSetup({ sendNow: false, turn }, "Reply");
  pressControl(render()); await flush();
  expect(turn === "idle" ? send : queue).toHaveBeenCalledOnce();
  expect(props.onSendQueuedNow).not.toHaveBeenCalled();
});

test("Control+Enter with an empty draft and queue does nothing, including Stop", async () => {
  const { render, props, send, queue } = shortcutSetup({ queued: [] });
  pressControl(render()); await flush();
  expect(send).not.toHaveBeenCalled(); expect(queue).not.toHaveBeenCalled();
  expect(props.onSendQueuedNow).not.toHaveBeenCalled(); expect(props.onStop).not.toHaveBeenCalled();
});

test.each(["composition", "229"])("Control+Enter ignores IME %s without consuming the key", async kind => {
  const { render, props, queue } = shortcutSetup({}, "한글");
  const event = controlEnter();
  if (kind === "composition") event.nativeEvent.isComposing = true; else event.keyCode = 229;
  pressControl(render(), event); await flush();
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(props.onSendQueuedNow).not.toHaveBeenCalled(); expect(queue).not.toHaveBeenCalled();
});

test("Control+Enter leaves a late queued item in its original conversation after switching", async () => {
  let resolve!: (outcome: DockedOutcome) => void;
  const pending = new Promise<DockedOutcome>(done => { resolve = done; });
  const originalQueue: string[] = [];
  const { render, props, store } = shortcutSetup({ queued: [], onQueue: async () => { const outcome = await pending; originalQueue.push("q4"); return outcome; } }, "For A");
  pressControl(render());
  props.mode = B; render();
  resolve({ ok: true, itemId: "q4" }); await flush();
  expect(props.onSendQueuedNow).not.toHaveBeenCalled();
  expect(originalQueue).toEqual(["q4"]);
  expect(store.current.get("conversation:a")).toEqual(EMPTY_DRAFT);
});

test("Control+Enter keeps an unavailable draft and its reason while sending existing rows", async () => {
  const { render, props, queue, store } = shortcutSetup({ locked: true, unavailable: "This page is not a listed canvas." }, "Fourth");
  pressControl(render()); await flush();
  expect(props.onSendQueuedNow).toHaveBeenCalledTimes(3);
  expect(queue).not.toHaveBeenCalled();
  expect(draftText(store.current.get("conversation:a"))).toBe("Fourth");
  expect(render().some(item => item.children === "This page is not a listed canvas.")).toBe(true);
});

test("Control+Enter keeps a draft refused by queue while existing rows go ahead", async () => {
  const { render, props, store } = shortcutSetup({ onQueue: async () => ({ error: "queue_limit" }) }, "Fourth");
  pressControl(render()); await flush();
  expect(props.onSendQueuedNow).toHaveBeenCalledTimes(3);
  expect(draftText(store.current.get("conversation:a"))).toBe("Fourth");
});

test("the field advertises Control+Enter only while Send now is available", () => {
  const { render, props } = shortcutSetup();
  expect(field(render())["aria-keyshortcuts"]).toBe("Control+Enter");
  props.sendNow = false;
  expect(field(render())["aria-keyshortcuts"]).toBeUndefined();
});

test("the preset list handles Control+Enter before the steer shortcut", () => {
  const { render, props, queue } = shortcutSetup({ presets: { v: 1, ok: true, result: { version: "1", presets: [{ id: "polish", title: "Polish", scope: "screen", description: "Polish it" }] } } }, "/pol");
  pressControl(render());
  expect(props.onSendQueuedNow).not.toHaveBeenCalled(); expect(queue).not.toHaveBeenCalled();
  expect(input(render()).value).toEqual([]);
});


test("Home Control+Enter still sends through its actual ComposerField", async () => {
  const memory = { current: { ...emptyComposer(), auth: AUTH, text: "Draw a page" } };
  const start = vi.fn(async () => ({ ok: true as const }));
  const tree = elements(HeroComposer({
    entries: [{ kind: "list", path: "/project", servedRev: 0, canvases: [] }], homeDirectory: null,
    shellProjects: {}, loaded: null, select: null, prefs: {}, memory, running: new Map(), restore: null,
    greeting: "Start", start, openConversation: vi.fn(), addProjects: vi.fn(), openSettings: vi.fn(),
  }));
  pressControl(tree); await flush();
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ text: "Draw a page" }), expect.anything());
  expect(field(tree)["aria-keyshortcuts"]).toBeUndefined();
});

const shortcutCaption = "Press Ctrl + Enter to send all now.";
test.each([1, 3])("the queue shortcut caption is plain text for %i rows with Send now", count => {
  const { render } = shortcutSetup({ queued: queued.slice(0, count) });
  const captions = render().filter(item => item.children === shortcutCaption);
  expect(captions).toHaveLength(1);
  expect(String(captions[0]!.className ?? "")).not.toContain("doan-kbd");
  expect(elements(captions[0]!.children as ReactNode)).toEqual([]);
});

test.each([
  { sendNow: false }, { queued: [] }, { onSendQueuedNow: undefined },
])("the queue shortcut caption is absent when rows or Send now are absent: %j", patch => {
  const { render } = shortcutSetup(patch);
  expect(render().some(item => item.children === shortcutCaption)).toBe(false);
});
