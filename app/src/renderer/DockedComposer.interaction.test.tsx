import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider } from "../main/agentAuth/types";
import { plainText, textSegments, type FieldSegment } from "./anchorField";
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
  useImperativeHandle: () => {},
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
    // The field's own props (value, onChange, readOnly) are kept beside the element it draws.
    if (PRIMITIVES.has(child.type)) return [...(child.type === Parts.ComposerField ? [child.props] : []), ...elements(expand(child.type, child.props))];
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
