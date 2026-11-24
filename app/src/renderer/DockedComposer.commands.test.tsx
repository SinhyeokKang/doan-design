import { Children, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider } from "../main/agentAuth/types";
import type { SkillSummary } from "../main/conversation/types";
import { plainText, textSegments, type FieldSegment } from "./anchorField";
import { commandCard, PRESET_NOTICE, STALE_MODE_CARD } from "./commandView";
import * as Parts from "./ComposerParts";
import { DockedComposer, QueueRows, type DockedComposerProps, type DockedOutcome } from "./DockedComposer";
import { EMPTY_DRAFT, type DockedDraft, type DockedMode } from "./dockedRules";
import type { AttachmentDraft, ModelPickerView, PresetSummary } from "./homeComposer";

// The docked composer (Overview, canvas panel, prototype window) with provider commands: a command goes out alone, a
// built-in Doan does not run shows its card, and a queued command row has no Send now. Hooks run as plain state
// (DockedComposer.interaction).
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
const AUTH: AuthSnapshot = { revision: 1, providers: [status("claude"), status("codex"), status("copilot")] };
const PICKER: ModelPickerView = { trigger: { provider: "claude", label: "Opus 5.5", ariaLabel: "Agent: Claude Code, model Opus 5.5", placeholder: false, isDefault: false }, groups: [], effort: null };
const A: DockedMode = { kind: "existing", conversationId: "a", provider: "claude" };
const KEY = "conversation:a";
const POLISH: PresetSummary = { id: "polish", title: "Polish the details", description: "", scope: "", group: "refine" };
const FILE: AttachmentDraft = { key: "k", id: "f", name: "notes.md", kind: "file", pasted: false, status: "ready", size: 4096, path: "/Users/ada/notes.md" };
const ROWS: SkillSummary[] = [{ kind: "skill", name: "deploy", description: "" }, { kind: "command", name: "compact", description: "" }, { kind: "command", name: "clear", description: "" }];

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
    if (withQueue && typeof child.props.children === "function") return elements((child.props.children as (life: () => void) => ReactNode)(() => {}), true);
    if (PRIMITIVES.has(child.type)) return [...(child.type === Parts.ComposerField ? [child.props] : []), ...elements(expand(child.type, child.props), withQueue)];
    return [child.props, ...elements(child.props.children, withQueue)];
  });
}
function setup(patch: Partial<DockedComposerProps> = {}, drafts: [string, DockedDraft][] = []) {
  const store = { current: new Map<string, DockedDraft>(drafts) as ReadonlyMap<string, DockedDraft> };
  const send = vi.fn(async (_request: unknown): Promise<DockedOutcome> => ({ ok: true }));
  const queue = vi.fn(async (_request: unknown): Promise<DockedOutcome> => ({ ok: true }));
  const onCard = vi.fn();
  const props: DockedComposerProps = {
    skills: ROWS, onSkillsWanted: () => {}, onCard,
    mode: A, project: "doan-design", homeDirectory: null, placeholder: "Reply, / for presets",
    drafts: store.current, onDrafts: update => { store.current = update(store.current); props.drafts = store.current; },
    auth: AUTH, picker: PICKER, provider: "claude", effort: null,
    onPickerOpen: vi.fn(), onPickModel: vi.fn(), onPickEffort: vi.fn(), onPickFast: vi.fn(), onSettings: vi.fn(),
    presets: undefined, suggested: [], onPresetsOpen: vi.fn(), onPresetsRetry: vi.fn(),
    thumbnails: {}, onPastedText: async () => false, onAttach: vi.fn(), onFiles: vi.fn(), onAttachmentRemoved: vi.fn(),
    turn: "idle", canvasGone: false, queued: [],
    onSend: send, onQueue: queue, onStop: vi.fn(), onRemoveQueued: vi.fn(async () => true),
    ...patch,
  };
  const render = (withQueue = false) => { hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = []; return elements(DockedComposer(props), withQueue); };
  return { store, send, queue, onCard, props, render };
}
const find = (tree: Record<string, unknown>[], test: (props: Record<string, unknown>) => boolean) => { const found = tree.find(test); if (!found) throw new Error("not found"); return found; };
const field = (tree: Record<string, unknown>[]) => find(tree, props => props["aria-label"] === "Message");
const input = (tree: Record<string, unknown>[]) => find(tree, props => typeof props.onKey === "function" && "value" in props);
const type = (tree: Record<string, unknown>[], text: string) => (input(tree).onChange as (value: FieldSegment[]) => void)(textSegments(text));
const enter = () => ({ key: "Enter", shiftKey: false, keyCode: 13, nativeEvent: { isComposing: false }, preventDefault: vi.fn() });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const draft = (text: string, extra: Partial<DockedDraft> = {}): DockedDraft => ({ ...EMPTY_DRAFT, segments: textSegments(text), ...extra });
const said = (tree: Record<string, unknown>[]) => String(find(tree, props => props.className === "sr-only" && props.role === "status").children).trim();
const has = (tree: Record<string, unknown>[], text: string) => tree.some(props => props.children === text);

test("a command goes out alone: no preset line, no attachments, which stay in the composer with the preset", async () => {
  const { store, send, render } = setup({}, [[KEY, draft("/compact", { preset: POLISH, attachments: [FILE], shape: "box" })]]);
  (field(render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  expect(send).toHaveBeenCalledWith({ text: "/compact", anchors: [], attachments: [] });
  const left = store.current.get(KEY)!;
  expect(plainText(left.segments)).toBe("");
  expect(left.preset).toBe(POLISH);
  expect(left.attachments).toEqual([FILE]);
});

test("an alias goes out as its command, with its argument after one space", async () => {
  const { send, render } = setup({}, [[KEY, draft("/compact해줘")]]);
  (field(render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  expect(send).toHaveBeenCalledWith({ text: "/compact 해줘", anchors: [], attachments: [] });
});

test("a skill word is still a message with its fixed line", async () => {
  const { send, render } = setup({}, [[KEY, draft("/deploy now")]]);
  (field(render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  expect(send).toHaveBeenCalledWith({ text: "Use the project skill `deploy`.\n\n/deploy now", anchors: [], attachments: [] });
});

test("a command while a turn runs queues alone, as its own row", async () => {
  const { queue, render } = setup({ turn: "running" }, [[KEY, draft("/compact", { preset: POLISH })]]);
  (field(render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  expect(queue).toHaveBeenCalledWith({ text: "/compact", anchors: [], attachments: [] });
});

test("a built-in Doan does not run sends nothing, shows its card and keeps the text, announced as status", async () => {
  const { store, send, queue, onCard, props, render } = setup({}, [[KEY, draft("/model opus")]]);
  (field(render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  expect(send).not.toHaveBeenCalled();
  expect(queue).not.toHaveBeenCalled();
  expect(onCard).toHaveBeenCalledWith(commandCard("claude", "model"));
  expect(plainText(store.current.get(KEY)!.segments)).toBe("/model opus");
  // The host shows the card it was given; the composer says it.
  props.card = onCard.mock.calls[0]![0];
  render(); runEffects();
  expect(said(render())).toBe("/model doesn’t run in Doan. Choose the model from the model picker.");
});

test("a send that goes out clears the conversation's card", async () => {
  const { onCard, render } = setup({}, [[KEY, draft("Make it darker")]]);
  (field(render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  expect(onCard).toHaveBeenCalledWith(null);
});

test("Codex's refusal of /review for the permission mode shows the stale-mode card and keeps the text", async () => {
  const { store, onCard, render } = setup({ mode: { kind: "existing", conversationId: "a", provider: "codex" }, provider: "codex", skills: [{ kind: "command", name: "review", description: "" }],
    onSend: async () => ({ error: "command_mode_stale" }) }, [[KEY, draft("/review")]]);
  (field(render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  expect(onCard).toHaveBeenCalledWith(STALE_MODE_CARD);
  expect(onCard.mock.calls[0]![0]).not.toBe(STALE_MODE_CARD);
  expect(plainText(store.current.get(KEY)!.segments)).toBe("/review");
  expect(render().some(props => typeof props.className === "string" && props.className.includes("composer-notice"))).toBe(false);
});

test("an unconfirmed ACP command is sent as written, alone", async () => {
  const { send, render } = setup({ mode: { kind: "existing", conversationId: "a", provider: "copilot" }, provider: "copilot", skills: [], passthrough: ["share"] },
    [[KEY, draft("/share the plan", { preset: POLISH, attachments: [FILE] })]]);
  (field(render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  expect(send).toHaveBeenCalledWith({ text: "/share the plan", anchors: [], attachments: [] });
});

test("while the field starts with a command the preset chip leaves for the notice, and comes back with the word gone", () => {
  const { render } = setup({}, [[KEY, draft("", { preset: POLISH, shape: "box" })]]);
  const chip = (tree: Record<string, unknown>[]) => tree.some(props => typeof props.className === "string" && props.className.includes("preset-chip"));
  // The notice row (the composer's status region keeps its last words, so the text alone is not the row).
  const notice = (tree: Record<string, unknown>[]) => tree.some(props => typeof props.className === "string" && props.className.includes("command-notice"));
  let tree = render();
  expect(chip(tree)).toBe(true);
  expect(notice(tree)).toBe(false);
  type(tree, "/compact ");
  tree = render();
  expect(notice(tree)).toBe(true);
  expect(has(tree, PRESET_NOTICE)).toBe(true);
  expect(chip(tree)).toBe(false);
  expect(find(tree, props => typeof props.className === "string" && props.className.includes("command-notice")).className).toBe("composer-chips command-notice");
  expect(said(tree)).toBe(PRESET_NOTICE);
  type(tree, "Tighten the spacing");
  tree = render();
  expect(notice(tree)).toBe(false);
  expect(chip(tree)).toBe(true);
});

test("the field highlights commands and card names as its first word, apart from the skills", () => {
  const tree = setup().render();
  expect(input(tree).skillNames).toEqual(new Set(["deploy"]));
  expect(input(tree).commandNames).toEqual(new Set(["compact", "clear", "new", "reset", "config", "login", "logout", "model", "permissions", "theme"]));
});

test("a queued command row has no Send now; the message rows keep theirs", () => {
  const { render } = setup({ turn: "running", sendNow: true, onSendQueuedNow: async () => {}, queued: [{ id: "q1", text: "Also make the caption shorter" }, { id: "q2", text: "/compact" }, { id: "q3", text: "Then align the buttons" }] });
  const tree = render(true);
  const sendNow = tree.filter(props => props.className === "doan-button queue-send");
  expect(sendNow.map(props => props["aria-describedby"])).toEqual(["id-0", "id-2"]);
});

test("Control+Enter sends the message rows now and leaves a command row queued", async () => {
  vi.stubGlobal("document", { body: {}, activeElement: null });
  const onSendQueuedNow = vi.fn(async () => {});
  const { render } = setup({ turn: "running", sendNow: true, onSendQueuedNow, queued: [{ id: "q1", text: "Also this" }, { id: "q2", text: "/compact" }] });
  const tree = render(true);
  (input(tree).onSteerKey as () => void)();
  await flush();
  expect(onSendQueuedNow.mock.calls.map(call => (call as unknown[])[0])).toEqual(["q1"]);
});

// A row reads its message's words (list markers dropped), so `- /compact` reads "/compact"; only the request it sends
// says whether it is a command.
const LIST_ROWS = [
  { id: "q1", text: "/compact", message: { text: "- /compact", attachments: [] } },
  { id: "q2", text: "/compact", message: { text: "/compact", attachments: [] } },
  // A project skill named like a command: main sends it as a message (its request starts with the skill line).
  { id: "q3", text: "/compact", message: { text: "Use the project skill `compact`.\n\n/compact", attachments: [] } },
];
test("a list item or a skill that reads like a command keeps Send now; the real command has none", () => {
  const { render } = setup({ turn: "running", sendNow: true, onSendQueuedNow: async () => {}, queued: LIST_ROWS });
  const sendNow = render(true).filter(props => props.className === "doan-button queue-send");
  expect(sendNow.map(props => props["aria-describedby"])).toEqual(["id-0", "id-2"]);
});
test("Control+Enter sends a list item or a skill that reads like a command and leaves the real command queued", async () => {
  vi.stubGlobal("document", { body: {}, activeElement: null });
  const onSendQueuedNow = vi.fn(async () => {});
  const { render } = setup({ turn: "running", sendNow: true, onSendQueuedNow, queued: LIST_ROWS });
  (input(render(true)).onSteerKey as () => void)();
  await flush();
  expect(onSendQueuedNow.mock.calls.map(call => (call as unknown[])[0])).toEqual(["q1", "q3"]);
});

const runEffects = () => { for (const effect of [...hooks.effects]) effect(); };
const MISSING: AttachmentDraft = { ...FILE, key: "m", id: "fm", status: "missing" };
const CHECKING: AttachmentDraft = { key: "c", name: "big.mov", kind: "file", pasted: false, status: "checking" };
const NEW_MODE: DockedMode = { kind: "new", root: "/w" };
const NEW_KEY = "root:/w";

// A command started from a new conversation leaves the preset and attachments it did not take; the composer then shows
// the started conversation, so they go to its key. A draft the person already has there stays.
test("a command that starts a conversation leaves its preset and attachments in the started conversation's draft", async () => {
  const { store, render } = setup({ mode: NEW_MODE, onSend: async () => ({ ok: true, conversationId: "c9" }) }, [[NEW_KEY, draft("/compact", { preset: POLISH, attachments: [FILE], shape: "box" })]]);
  expect(store.current.has(NEW_KEY)).toBe(true);
  (field(render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  const moved = store.current.get("conversation:c9")!;
  expect(plainText(moved.segments)).toBe("");
  expect(moved.preset).toBe(POLISH);
  expect(moved.attachments).toEqual([FILE]);
  expect(store.current.get(NEW_KEY)).toEqual(EMPTY_DRAFT);
});
test("a draft already in the started conversation stays; the leftover stays where it was sent from", async () => {
  const typed = draft("Then tighten it");
  const { store, render } = setup({ mode: NEW_MODE, onSend: async () => ({ ok: true, conversationId: "c9" }) }, [[NEW_KEY, draft("/compact", { attachments: [FILE], shape: "box" })], ["conversation:c9", typed]]);
  (field(render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  expect(store.current.get("conversation:c9")).toBe(typed);
  expect(store.current.get(NEW_KEY)?.attachments).toEqual([FILE]);
});

// Control+Enter queues the field and then steers its item; a command is never steered, so it only queues.
test("Control+Enter on a command in the field queues it and does not send it now", async () => {
  vi.stubGlobal("document", { body: {}, activeElement: null });
  const onSendQueuedNow = vi.fn(async () => {});
  const queue = vi.fn(async (_request: unknown): Promise<DockedOutcome> => ({ ok: true, itemId: "q9" }));
  const { render } = setup({ turn: "running", sendNow: true, onSendQueuedNow, onQueue: queue }, [[KEY, draft("/compact")]]);
  (input(render(true)).onSteerKey as () => void)();
  await flush();
  expect(queue).toHaveBeenCalledWith({ text: "/compact", anchors: [], attachments: [] });
  expect(onSendQueuedNow).not.toHaveBeenCalled();
});

// A card can come back without a send from this composer (a queued /review main returned): the composer says the
// card it is given once, through its status region, whichever way it came.
test("a card the host gives is said once through the composer's status", () => {
  const { props, render } = setup();
  props.card = { ...STALE_MODE_CARD };
  render(); runEffects();
  expect(said(render())).toBe("/review can’t use the new permission mode yet. Send a message first so Codex picks up the permission mode, then run /review again.");
  // Said once: a later status line is not replaced by the same card on the next draws.
  (input(render()).onAnnounce as (text: string) => void)("Removed Polish the details");
  render(); runEffects();
  expect(said(render())).toBe("Removed Polish the details");
});

// A command takes no attachments, so their state does not hold it.
test("a missing or checking attachment does not hold a command or its card", async () => {
  const { send, render } = setup({}, [[KEY, draft("/compact", { attachments: [MISSING], shape: "box" })]]);
  (field(render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  expect(send).toHaveBeenCalledWith({ text: "/compact", anchors: [], attachments: [] });
  const card = setup({}, [[KEY, draft("/model opus", { attachments: [CHECKING], shape: "box" })]]);
  (field(card.render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  expect(card.onCard).toHaveBeenCalledWith(commandCard("claude", "model"));
  // A message keeps the shipped check.
  const message = setup({}, [[KEY, draft("Use this file", { attachments: [MISSING], shape: "box" })]]);
  (field(message.render()).onKeyDown as (event: unknown) => void)(enter());
  await flush();
  expect(message.send).not.toHaveBeenCalled();
});
