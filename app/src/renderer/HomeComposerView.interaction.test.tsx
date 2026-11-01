import { Children, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AccountIdentity, AuthState, AuthStatusDto, Provider, ToolFacts } from "../main/agentAuth/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import * as Parts from "./ComposerParts";
import { tabKey } from "./ComposerParts";
import { emptyComposer, HeroComposer, pasteAction, slashKey, type ComposerMemory, type HeroComposerProps } from "./HomeComposerView";
import type { PresetListReply, PresetSummary } from "./homeComposer";
import type { LastRequest } from "./homeConversations";

// Hooks run as plain state so the component's own handlers can be called (ShellSidebar.interaction.test.tsx).
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, effects: [] as (() => unknown)[], redraw: () => {} }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useId: () => "id",
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
  useReducer: () => [0, hooks.redraw],
  useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
  useState: (value: unknown) => { const index = hooks.cursor++; if (!(index in hooks.states)) hooks.states[index] = typeof value === "function" ? (value as () => unknown)() : value; return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (v: unknown) => unknown)(hooks.states[index]) : next; }]; },
}));

const FACTS: ToolFacts = { cli: "found", version: "supported", tools: "ready" };
const ACCOUNT: AccountIdentity = { id: "acct", workspace: "org", email: "ada@example.com" };
function dto(provider: Provider): AuthStatusDto {
  const state: AuthState = { provider, generation: 1, verified: true, expired: false, connection: { provider, connectionId: "c", profile: provider, account: ACCOUNT }, attempt: null, error: null, phase: "connected" };
  return authStatus(state, FACTS, 1);
}
const AUTH: AuthSnapshot = { revision: 1, providers: [dto("claude")] };
const PRESETS: PresetSummary[] = [["context", "Gather design context", "start"], ["shape", "Shape a first screen", "start"], ["critique", "Critique the design", "review"], ["harden", "Harden for real conditions", "content"], ["polish", "Polish the details", "refine"]]
  .map(([id, title, group]) => ({ id: id!, title: title!, description: `About ${id}.`, scope: `${id} scope`, group: group! }));
const LISTED: PresetListReply = { v: 1, ok: true, result: { version: "1", presets: PRESETS } };
const row = (name: string): CanvasRow => ({ path: `.doan/canvases/${name}.html`, id: name, url: "u" });
const ENTRY: FolderEntry = { kind: "list", path: "/code/doan-design", servedRev: 0, canvases: [row("buzz-onboarding")], git: { common: "/code/doan-design/.git", main: "/code/doan-design", branch: "main", worktrees: [] } };

let doan: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = [];
  doan = {
    onAgentAuth: vi.fn(() => () => {}), listConversationModels: vi.fn(async () => ({ models: [] })), designSkills: { list: vi.fn(async () => LISTED) } as never,
    addAttachmentFiles: vi.fn(async (files: File[]) => files.map(file => ({ ok: true, attachment: { id: `id-${file.name}`, name: file.name, size: file.size, kind: "file", path: `/Users/ada/${file.name}`, pasted: false } }))),
    addPastedImage: vi.fn(async () => ({ ok: true, attachment: { id: "pasted", name: "pasted.png", size: 10, kind: "image", path: "/u/pasted.png", pasted: true } })),
    removeAttachment: vi.fn(async () => true), chooseAttachments: vi.fn(async () => []), addDroppedFiles: vi.fn(async () => {}), addProjects: vi.fn(),
  };
  vi.stubGlobal("window", { doan });
  vi.stubGlobal("queueMicrotask", (run: () => void) => run());
});
afterEach(() => vi.unstubAllGlobals());

// The composer's own primitives (ComposerParts) are drawn in place, so their elements and handlers are found as they
// were before the split; any other component stays an element with its props.
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
function setup(memory: Partial<ComposerMemory> = {}, props: Partial<HeroComposerProps> = {}) {
  const box = { current: { ...emptyComposer(), auth: AUTH, presets: LISTED, ...memory } };
  const start = vi.fn(async (_request: unknown, _last: unknown) => ({ ok: true } as const));
  const all: HeroComposerProps = { entries: [ENTRY], homeDirectory: null, shellProjects: {}, loaded: null, select: null, prefs: {}, memory: box, running: new Map(), restore: null, greeting: "Where should we start?", start, openConversation: vi.fn(), addProjects: vi.fn(), openSettings: vi.fn(), ...props };
  const render = () => { hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = []; return elements(HeroComposer(all)); };
  return { box, start, render, props: all };
}
const find = (tree: Record<string, unknown>[], test: (props: Record<string, unknown>) => boolean) => { const found = tree.find(test); if (!found) throw new Error("not found"); return found; };
const field = (tree: Record<string, unknown>[]) => find(tree, props => props["aria-label"] === "Message");
const key = (name: string, extra: Record<string, unknown> = {}) => ({ key: name, shiftKey: false, keyCode: 0, nativeEvent: { isComposing: false }, preventDefault: vi.fn(), ...extra });
const call = (props: Record<string, unknown>, handler: string, event: unknown) => (props[handler] as (event: unknown) => void)(event);

test("/ at the start opens a combobox on the field; arrows move, Enter picks and clears /query, focus stays in the field", () => {
  const { box, render } = setup({ text: "/c" });
  let tree = render();
  const textarea = field(tree);
  expect(textarea).toMatchObject({ role: "combobox", "aria-expanded": true, "aria-controls": "id-slash", "aria-autocomplete": "list", "aria-activedescendant": "id-s-0" });
  const focus = vi.fn(), setSelectionRange = vi.fn();
  hooks.refs[0]!.current = { focus, setSelectionRange, value: "" };
  const down = key("ArrowDown");
  call(textarea, "onKeyDown", down);
  expect(down.preventDefault).toHaveBeenCalled();
  tree = render();
  expect(field(tree)["aria-activedescendant"]).toBe("id-s-1");
  call(field(render()), "onKeyDown", key("Enter"));
  expect(box.current.preset?.id).toBe("critique");
  expect(box.current.text).toBe("");
  expect(focus).toHaveBeenCalled();
});

test("a preset read that fails, or an older CLI, shows its notice on the panel surface: the popover is glass over Home's gradient", () => {
  const older = { v: 1, ok: false, error: { code: "usage_error", message: "unknown command", nextSteps: [] } } as unknown as PresetListReply;
  const failed = { v: 1, ok: false, error: { code: "cli_error", reason: "failed", message: "The doan CLI stopped without a result.", nextSteps: [] } } as unknown as PresetListReply;
  const notice = (presets: PresetListReply) => find(setup({ text: "/", presets }).render(), props => typeof props.className === "string" && props.className.startsWith("doan-notice"));
  expect(notice(older).className).toBe("doan-notice doan-panel");
  expect(notice(failed).className).toBe("doan-notice error doan-panel");
});

test("Enter while an IME composes neither picks a preset nor sends", () => {
  const { box, start, render } = setup({ text: "/cri" });
  call(field(render()), "onKeyDown", key("Enter", { nativeEvent: { isComposing: true } }));
  expect(box.current.preset).toBeNull();
  const plain = setup({ text: "안녕" });
  call(field(plain.render()), "onKeyDown", key("Enter", { keyCode: 229 }));
  expect(start).not.toHaveBeenCalled();
  expect(plain.start).not.toHaveBeenCalled();
});

test("Escape closes the / list and it does not open again until the field is empty; Tab closes it too", () => {
  const { box, render } = setup({ text: "/cri" });
  const escape = key("Escape");
  call(field(render()), "onKeyDown", escape);
  expect(escape.preventDefault).toHaveBeenCalled();
  expect(field(render()).role).toBeUndefined();
  box.current = { ...box.current, text: "/crit" };
  expect(field(render()).role).toBeUndefined();
  box.current = { ...box.current, text: "" };
  render(); for (const effect of hooks.effects) effect();
  box.current = { ...box.current, text: "/" };
  expect(field(render()).role).toBe("combobox");
  const tab = key("Tab");
  call(field(render()), "onKeyDown", tab);
  expect(tab.preventDefault).not.toHaveBeenCalled();
  expect(field(render()).role).toBeUndefined();
  expect(slashKey("Tab", 0, 2, false)).toEqual({ kind: "close", dismiss: true });
});

test("group tabs move with ←/→ and wrap; other keys leave them", () => {
  const keys = ["suggested", "start", "review"];
  expect(tabKey(keys, "start", "ArrowRight")).toBe("review");
  expect(tabKey(keys, "suggested", "ArrowLeft")).toBe("review");
  expect(tabKey(keys, "start", "ArrowDown")).toBeNull();
});

test("× removes a chip, announces it and hands focus to the next chip's ×, or the field", () => {
  const attachments = ["a.pdf", "b.pdf"].map(name => ({ key: name, id: `id-${name}`, name, kind: "file" as const, pasted: false, status: "ready" as const, size: 10, path: `/u/${name}` }));
  const { box, render } = setup({ attachments });
  const tree = render();
  const focusNext = vi.fn();
  (hooks.refs.find(ref => Array.isArray(ref.current))!.current as unknown[])[0] = { focus: focusNext };
  call(find(tree, props => props["aria-label"] === "Remove a.pdf"), "onClick", {});
  expect(doan.removeAttachment).toHaveBeenCalledWith("id-a.pdf");
  expect(box.current.attachments.map(a => a.name)).toEqual(["b.pdf"]);
  expect(focusNext).toHaveBeenCalled();
  render();
  expect(hooks.states.includes("Removed a.pdf")).toBe(true);
});

test("Backspace at the start of an empty field removes the preset chip first, then the last attachment", () => {
  const attachments = [{ key: "a", id: "id-a", name: "a.pdf", kind: "file" as const, pasted: false, status: "ready" as const, size: 10, path: "/u/a.pdf" }];
  const { box, render } = setup({ attachments, preset: PRESETS[2]! });
  render();
  hooks.refs[0]!.current = { selectionStart: 0, focus: vi.fn() };
  const first = key("Backspace");
  call(field(render()), "onKeyDown", first);
  expect(first.preventDefault).toHaveBeenCalled();
  expect(box.current.preset).toBeNull();
  call(field(render()), "onKeyDown", key("Backspace"));
  expect(box.current.attachments).toEqual([]);
  expect(hooks.states.includes("Removed a.pdf")).toBe(true);
});

test("Cmd+V: text pastes as text, Finder files attach by path, an image alone attaches as a pasted image", async () => {
  expect(pasteAction("Hello", [])).toBe("text");
  expect(pasteAction("brief.pdf", [{ name: "brief.pdf", type: "application/pdf" }])).toBe("files");
  expect(pasteAction("", [{ name: "image.png", type: "image/png" }])).toBe("files");
  const { box, render } = setup();
  const text = { preventDefault: vi.fn(), clipboardData: { files: [], getData: () => "Hello" } };
  call(field(render()), "onPaste", text);
  expect(text.preventDefault).not.toHaveBeenCalled();
  const finder = new File(["x"], "brief.pdf", { type: "application/pdf" });
  const files = { preventDefault: vi.fn(), clipboardData: { files: [finder], getData: () => "brief.pdf" } };
  call(field(render()), "onPaste", files);
  expect(files.preventDefault).toHaveBeenCalled();
  expect(doan.addAttachmentFiles).toHaveBeenCalledWith([finder]);
  await vi.waitFor(() => expect(box.current.attachments.map(a => a.status)).toEqual(["ready"]));
  doan.addAttachmentFiles!.mockResolvedValueOnce([{ ok: false, name: "image.png", error: "not_found" }]);
  const shot = new File(["png"], "image.png", { type: "image/png" });
  call(field(render()), "onPaste", { preventDefault: vi.fn(), clipboardData: { files: [shot], getData: () => "" } });
  await vi.waitFor(() => expect(doan.addPastedImage).toHaveBeenCalled());
  await vi.waitFor(() => expect(box.current.attachments.at(-1)).toMatchObject({ id: "pasted", pasted: true, status: "ready" }));
});

test("a folder dropped on the composer is refused there and never reaches the window's project drop", () => {
  const { box, render } = setup();
  const composer = find(render(), props => props.className === "composer");
  const folder = new File([""], "designs");
  const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: { types: ["Files"], files: [folder], items: [{ kind: "file", webkitGetAsEntry: () => ({ isDirectory: true }) }] } };
  call(composer, "onDrop", event);
  expect(event.stopPropagation).toHaveBeenCalled();
  expect(event.preventDefault).toHaveBeenCalled();
  expect(doan.addDroppedFiles).not.toHaveBeenCalled();
  expect(doan.addAttachmentFiles).not.toHaveBeenCalled();
  expect(box.current.attachments).toEqual([]);
  expect(box.current.notice?.text).toBe("Folders can’t be attached. Add a project from Add Projects.");
});

test("dragging files over the composer shows the drop target and stops the window overlay", () => {
  const { render } = setup();
  const composer = find(render(), props => props.className === "composer");
  const enter = { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: { types: ["Files"] } };
  call(composer, "onDragEnter", enter);
  expect(enter.stopPropagation).toHaveBeenCalled();
  expect(render().some(props => props.className === "drop-target")).toBe(true);
});

test("Send starts the composed request; a refusal keeps the draft and shows the code's wording; a moved file marks its chip", async () => {
  const attachments = [{ key: "a", id: "id-a", name: "a.pdf", kind: "file" as const, pasted: false, status: "ready" as const, size: 10, path: "/u/a.pdf" }];
  const { box, start, render } = setup({ text: "Critique the buzz-onboarding canvas.", preset: PRESETS[2]!, attachments });
  start.mockResolvedValueOnce({ error: "not_logged_in" } as never);
  call(field(render()), "onKeyDown", key("Enter"));
  await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  expect(start.mock.calls[0]![0]).toEqual({ root: "/code/doan-design", mode: "newDesign", runtime: "claude", text: "Use the Doan design preset `critique` (Critique the design).\n\nCritique the buzz-onboarding canvas.", attachments: [{ id: "id-a" }] });
  await vi.waitFor(() => expect(box.current.notice?.text).toBe("Couldn’t start with Claude Code: its sign-in has expired. Choose another agent."));
  expect(box.current.text).toBe("Critique the buzz-onboarding canvas.");
  start.mockResolvedValueOnce({ error: "attachment_missing", missing: ["id-a"] } as never);
  call(field(render()), "onKeyDown", key("Enter"));
  await vi.waitFor(() => expect(box.current.attachments[0]?.status).toBe("missing"));
  start.mockResolvedValueOnce({ ok: true });
  box.current = { ...box.current, attachments: [] };
  call(field(render()), "onKeyDown", key("Enter"));
  await vi.waitFor(() => expect(box.current).toMatchObject({ text: "", preset: null, attachments: [] }));
});

test("Edit on Home asks before replacing a different draft, and fills an empty one at once", () => {
  const last: LastRequest = { root: "/code/doan-design", text: "Polish it.", preset: null, attachments: [], provider: "claude", model: null, effort: null };
  const busy = setup({ text: "Another idea" }, { restore: { request: last, seq: 1 } });
  busy.render(); for (const effect of hooks.effects) effect();
  expect(hooks.states.some(state => (state as { title?: string } | null)?.title === "Replace your draft?")).toBe(true);
  expect(busy.box.current.text).toBe("Another idea");
  const empty = setup({}, { restore: { request: last, seq: 1 } });
  empty.render(); for (const effect of hooks.effects) effect();
  expect(empty.box.current.text).toBe("Polish it.");
  // The same request is not applied again on a later visit.
  empty.box.current = { ...empty.box.current, text: "" };
  empty.render(); for (const effect of hooks.effects) effect();
  expect(empty.box.current.text).toBe("");
});

test("a dropped folder is recognised by its own item even when string items come first", () => {
  const { render } = setup();
  const composer = find(render(), props => props.className === "composer");
  const folder = new File([""], "designs"), file = new File(["x"], "brief.pdf");
  const items = [{ kind: "string", webkitGetAsEntry: () => null }, { kind: "file", webkitGetAsEntry: () => ({ isDirectory: true }) }, { kind: "file", webkitGetAsEntry: () => ({ isDirectory: false }) }];
  call(composer, "onDrop", { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: { types: ["Files"], files: [folder, file], items } });
  expect(doan.addAttachmentFiles).toHaveBeenCalledWith([file]);
});

// Review BU3 fix round 1.
const B: FolderEntry = { kind: "list", path: "/code/acme", servedRev: 0, canvases: [], git: { common: "/code/acme/.git", main: "/code/acme", branch: "main", worktrees: [] } };
const runEffects = () => { for (const effect of hooks.effects) effect(); };
const pending = () => { let resolve!: (value: { ok: true } | { error: string }) => void; const promise = new Promise<{ ok: true } | { error: string }>(r => { resolve = r; }); return { promise, resolve }; };

test("first run's project is chosen once; the person's later choice wins and the request goes there", async () => {
  const { box, start, render } = setup({ text: "Draw a pricing page." }, { entries: [ENTRY, B], select: { root: "/code/doan-design", seq: 1 } });
  render(); runEffects();
  expect(box.current.root).toBe("/code/doan-design");
  const projects = find(render(), props => typeof props.onValueChange === "function" && props.value === "/code/doan-design/.git");
  (projects.onValueChange as (key: string) => void)("/code/acme/.git");
  render(); runEffects();
  call(field(render()), "onKeyDown", key("Enter"));
  await vi.waitFor(() => expect(start).toHaveBeenCalled());
  expect((start.mock.calls[0]![0] as { root: string }).root).toBe("/code/acme");
});

test("a pending start keeps Home locked on a later visit, and a late reply clears only the draft it sent", async () => {
  const first = setup({ text: "Draw a pricing page." });
  const reply = pending();
  first.start.mockReturnValueOnce(reply.promise as never);
  call(field(first.render()), "onKeyDown", key("Enter"));
  // Leave Home and come back: a new mount over the same memory.
  hooks.states = []; hooks.refs = [];
  const again = { ...first, render: () => { hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = []; return elements(HeroComposer({ ...first.props })); } };
  const tree = again.render();
  expect(field(tree).readOnly).toBe(true);
  expect(find(tree, props => props["aria-label"] === "Send").disabled).toBe(true);
  call(field(tree), "onKeyDown", key("Enter"));
  expect(first.start).toHaveBeenCalledTimes(1);
  // A paste while pending changes nothing.
  const paste = { preventDefault: vi.fn(), clipboardData: { files: [new File(["x"], "brief.pdf")], getData: () => "brief.pdf" } };
  call(field(tree), "onPaste", paste);
  expect(doan.addAttachmentFiles).not.toHaveBeenCalled();
  // The draft changed meanwhile (Edit on Home): the late success leaves it alone and unlocks Send.
  first.box.current = { ...first.box.current, text: "A newer idea" };
  reply.resolve({ ok: true });
  await vi.waitFor(() => expect(first.box.current.sending).toBeNull());
  expect(first.box.current.text).toBe("A newer idea");
});

test("a late refusal after leaving Home is shown on the next visit and keeps the draft", async () => {
  const { box, start, render } = setup({ text: "Draw a pricing page." });
  const reply = pending();
  start.mockReturnValueOnce(reply.promise as never);
  call(field(render()), "onKeyDown", key("Enter"));
  reply.resolve({ error: "busy" });
  await vi.waitFor(() => expect(box.current.sending).toBeNull());
  expect(box.current).toMatchObject({ text: "Draw a pricing page.", notice: { text: "Claude Code is finishing a previous run. Try again in a moment.", retry: true } });
  expect(render().some(props => props.className === "doan-notice error doan-panel composer-notice")).toBe(true);
});

test("projects and worktrees that are still being read are disabled with their status chip", () => {
  const loading = (path: string): FolderEntry => ({ kind: "loading", path, lastCommon: path === "/code/wt" ? "/code/doan-design/.git" : undefined } as FolderEntry);
  const mixed: FolderEntry = { ...ENTRY, lastCommon: "/code/doan-design/.git" };
  const tree = render3([mixed, loading("/code/wt"), loading("/code/only")]);
  const items = tree.filter(props => props.className === "doan-menu-item project-item");
  expect(items.map(props => !!props.disabled)).toEqual([false, true]);
  const worktrees = tree.filter(props => props.className === "doan-menu-item shell-worktree");
  expect(worktrees.map(props => !!props.disabled)).toEqual([false, true]);
  expect(tree.filter(props => props.className === "ob-chip").map(props => props.children)).toEqual(["Reading…", "Reading…"]);
  function render3(entries: FolderEntry[]) { return setup({}, { entries }).render(); }
});

test("a group tab's ←/→ selects the next tab and focuses it once drawn, with the list taken before React clears the event", () => {
  const { render } = setup();
  const tabs = render().filter(props => props.role === "tab");
  const focus = vi.fn(), list = { querySelector: vi.fn(() => ({ focus })) };
  const frames: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { frames.push(run); return frames.length; });
  const event = { key: "ArrowRight", preventDefault: vi.fn(), currentTarget: { parentElement: list } as { parentElement: unknown } | null };
  (tabs[0]!.onKeyDown as (event: unknown) => void)(event);
  // React nulls currentTarget right after the handler; the frame runs only afterwards.
  event.currentTarget = null;
  expect(frames).toHaveLength(1);
  frames[0]!();
  expect(event.preventDefault).toHaveBeenCalled();
  expect(render().find(props => props.role === "tab" && props["aria-selected"])?.children).toContain("Start");
  expect(list.querySelector).toHaveBeenCalledWith('[aria-selected="true"]');
  expect(focus).toHaveBeenCalled();
});

test("Edit on Home checks the restored attachments again at once: checking, then ready or moved", async () => {
  const sent = ["a.pdf", "b.pdf"].map(name => ({ key: name, id: `id-${name}`, name, kind: "file" as const, pasted: false, status: "ready" as const, size: 10, path: `/u/${name}` }));
  const last: LastRequest = { root: "/code/doan-design", text: "Polish it.", preset: null, attachments: sent, provider: "claude", model: null, effort: null };
  let finish!: (value: unknown) => void;
  doan.recheckAttachments = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const { box, render } = setup({}, { restore: { request: last, seq: 1 } });
  render(); runEffects();
  expect(doan.recheckAttachments).toHaveBeenCalledWith(["id-a.pdf", "id-b.pdf"]);
  expect(box.current.attachments.map(a => a.status)).toEqual(["checking", "checking"]);
  finish([{ id: "id-a.pdf", ok: true, attachment: { id: "id-a.pdf", name: "a.pdf", size: 12, kind: "file", path: "/u/a.pdf", pasted: false } }, { id: "id-b.pdf", ok: false, error: "not_found" }]);
  await vi.waitFor(() => expect(box.current.attachments.map(a => a.status)).toEqual(["ready", "missing"]));
  expect(box.current.attachments[0]?.size).toBe(12);
});

test("a request rebuilt after a reload brings its image thumbnails into the composer's object URLs", () => {
  const shot = { key: "k-shot", id: "id-shot", name: "shot.png", kind: "image" as const, pasted: false, status: "ready" as const, size: 10, path: "/u/shot.png" };
  const last: LastRequest = { root: "/code/doan-design", text: "Polish it.", preset: null, attachments: [shot], provider: "claude", model: null, effort: null, thumbnails: { "k-shot": new Uint8Array([1, 2, 3]) } };
  const create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:shot");
  doan.recheckAttachments = vi.fn(() => new Promise(() => {}));
  const { box, render } = setup({}, { restore: { request: last, seq: 1 } });
  render(); runEffects();
  expect(create).toHaveBeenCalledTimes(1);
  expect(box.current.thumbnails["k-shot"]).toBe("blob:shot");
  create.mockRestore();
});

// Review BU3 r2.
// One mount's life: render, run its effects, and keep their cleanups to unmount it like React does.
function mount(props: HeroComposerProps, redraw: () => void) {
  hooks.states = []; hooks.refs = []; hooks.redraw = redraw;
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = [];
  elements(HeroComposer(props));
  const cleanups = hooks.effects.map(effect => effect());
  const tree = () => { hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = []; return elements(HeroComposer(props)); };
  return { tree, unmount: () => { for (const cleanup of cleanups) if (typeof cleanup === "function") cleanup(); } };
}

test("a refusal that arrives after leaving and coming back redraws the Home now on screen, with the notice and the field unlocked", async () => {
  const { box, start, props } = setup({ text: "Draw a pricing page." });
  const reply = pending();
  start.mockReturnValueOnce(reply.promise as never);
  const first = mount(props, vi.fn());
  call(field(first.tree()), "onKeyDown", key("Enter"));
  first.unmount();
  const redraw = vi.fn();
  const second = mount(props, redraw);
  expect(field(second.tree()).readOnly).toBe(true);
  reply.resolve({ error: "busy" });
  await vi.waitFor(() => expect(redraw).toHaveBeenCalled());
  expect(box.current.notice?.text).toBe("Claude Code is finishing a previous run. Try again in a moment.");
  expect(field(second.tree()).readOnly).toBe(false);
});

test("an attachment reply after a remount redraws the new mount too", async () => {
  const { box, props } = setup();
  let finish!: (value: unknown) => void;
  doan.addAttachmentFiles!.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const first = mount(props, vi.fn());
  call(field(first.tree()), "onPaste", { preventDefault: vi.fn(), clipboardData: { files: [new File(["x"], "brief.pdf")], getData: () => "brief.pdf" } });
  first.unmount();
  const redraw = vi.fn();
  mount(props, redraw);
  finish([{ ok: true, attachment: { id: "id-brief", name: "brief.pdf", size: 1, kind: "file", path: "/u/brief.pdf", pasted: false } }]);
  await vi.waitFor(() => expect(redraw).toHaveBeenCalled());
  expect(box.current.attachments[0]?.status).toBe("ready");
});

test("a last request's thumbnail and sent id stay while any root's last request or the draft uses them, and go when none does", async () => {
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  doan.releaseAttachments = vi.fn(async () => true);
  const shot = { key: "shot", id: "id-shot", name: "shot.png", kind: "image" as const, pasted: false, status: "ready" as const, size: 10, path: "/u/shot.png" };
  const other = { ...shot, key: "other", id: "id-other", name: "other.png", path: "/u/other.png" };
  const { box, start, render } = setup({ text: "A", attachments: [shot], thumbnails: { shot: "blob:shot", other: "blob:other" } }, { entries: [ENTRY, B] });
  const send = async () => { const calls = start.mock.calls.length; call(field(render()), "onKeyDown", key("Enter")); await vi.waitFor(() => expect(start.mock.calls.length).toBe(calls + 1)); await vi.waitFor(() => expect(box.current.sending).toBeNull()); };
  await send();                                                                    // A's last request uses shot
  box.current = { ...box.current, root: "/code/acme", text: "B", attachments: [shot] }; // restored, sent in B
  await send();
  box.current = { ...box.current, root: "/code/doan-design", text: "A again", attachments: [other] };
  await send();                                                                    // A's last request is replaced
  expect(revoke).not.toHaveBeenCalledWith("blob:shot");
  expect(box.current.thumbnails.shot).toBe("blob:shot");
  expect(doan.releaseAttachments).not.toHaveBeenCalledWith(expect.arrayContaining(["id-shot"]));
  box.current = { ...box.current, root: "/code/acme", text: "B again", attachments: [] };
  await send();                                                                    // B's last request is replaced too
  expect(revoke).toHaveBeenCalledWith("blob:shot");
  expect(doan.releaseAttachments).toHaveBeenCalledWith(["id-shot"]);
  revoke.mockRestore();
});

test("removing a restored chip that no last request uses releases its sent id", async () => {
  doan.releaseAttachments = vi.fn(async () => true);
  const chip = { key: "k", id: "id-k", name: "a.pdf", kind: "file" as const, pasted: false, status: "ready" as const, size: 1, path: "/u/a.pdf" };
  const kept = setup({ attachments: [chip], lastIds: { "/code/acme": ["id-k"] } });
  call(find(kept.render(), props => props["aria-label"] === "Remove a.pdf"), "onClick", {});
  await vi.waitFor(() => expect(doan.removeAttachment).toHaveBeenCalledTimes(1));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(doan.releaseAttachments).not.toHaveBeenCalled();
  const loose = setup({ attachments: [chip] });
  call(find(loose.render(), props => props["aria-label"] === "Remove a.pdf"), "onClick", {});
  await vi.waitFor(() => expect(doan.releaseAttachments).toHaveBeenCalledWith(["id-k"]));
});

// buzz-settings U3: a group that cannot run sends the person to its Agents row; the fixed new-conversation default
// starts each input, and a pick lasts until the input is sent (design '홈 공급자 선택기', 'New conversations').
function status(provider: Provider, patch: { expired?: boolean; facts?: Partial<ToolFacts> } = {}): AuthStatusDto {
  const state: AuthState = { provider, generation: 1, verified: true, expired: patch.expired ?? false, connection: { provider, connectionId: "c", profile: provider, account: ACCOUNT }, attempt: null, error: null, phase: patch.expired ? "reauthRequired" : "connected" };
  return authStatus(state, { ...FACTS, ...patch.facts }, 1);
}
const words = (props: Record<string, unknown>): string => [props.children].flat(Infinity).map(child => typeof child === "string" ? child : isValidElement<Record<string, unknown>>(child) ? words(child.props) : "").join("");
const item = (tree: Record<string, unknown>[], label: string) => find(tree, props => typeof props.onSelect === "function" && words(props) === label);

test("settings action: a group that cannot run offers its fix, and Manage agents… opens Agents, each after the menu closes", () => {
  const openSettings = vi.fn();
  const { render } = setup({ auth: { revision: 1, providers: [dto("claude"), status("codex", { expired: true }), status("copilot", { facts: { version: "unsupported" } })] } }, { openSettings });
  const tree = render();
  expect(tree.some(props => props.className === "agent-note" && words(props) === "Sign-in expired")).toBe(true);
  for (const [label, target] of [["Sign in again…", { section: "agents", provider: "codex" }], ["Update…", { section: "agents", provider: "copilot" }], ["Manage agents…", { section: "agents" }]] as const) {
    openSettings.mockClear();
    const select = item(tree, label);
    expect(select.disabled).toBeFalsy();
    (select.onSelect as () => void)();
    expect(openSettings, label).toHaveBeenCalledTimes(1);
    expect(openSettings).toHaveBeenCalledWith(target);
  }
});

test("settings action: with no agent able to run, Sign in to an agent… sits under the note", () => {
  for (const providers of [[], [status("codex", { expired: true })]]) {
    const openSettings = vi.fn();
    const tree = setup({ auth: { revision: 1, providers } }, { openSettings }).render();
    expect(tree.some(props => props.className === "menu-note" && words(props) === "No agent is ready to run.")).toBe(true);
    expect(() => item(tree, "Manage agents…")).toThrow();
    (item(tree, "Sign in to an agent…").onSelect as () => void)();
    expect(openSettings).toHaveBeenCalledWith({ section: "agents" });
  }
});

test("settings action: the fixed default starts each input; a pick lasts until a successful send, then the default returns", async () => {
  doan.listConversationModels = vi.fn(async () => ({ models: [{ id: "gpt-y", label: "GPT Y", default: true }, { id: "gpt-x", label: "GPT X", default: false, efforts: ["low", "high"] }] }));
  const { box, start, render } = setup({ text: "One", auth: { revision: 1, providers: [dto("claude"), dto("codex")] } },
    { prefs: { lastProvider: "claude", models: { codex: { model: "gpt-y" } } }, defaults: { provider: "codex", model: "gpt-x", effort: "high" } });
  render();
  for (const effect of hooks.effects) effect();
  await vi.waitFor(() => expect(box.current.lists["/code/doan-design\ncodex"]).toMatchObject({ models: expect.any(Array) }));
  const send = async () => { const calls = start.mock.calls.length; call(field(render()), "onKeyDown", key("Enter")); await vi.waitFor(() => expect(start.mock.calls.length).toBe(calls + 1)); await vi.waitFor(() => expect(box.current.sending).toBeNull()); return start.mock.calls.at(-1)![0] as Record<string, unknown>; };
  // The person picks Low for the fixed model: kept until this input is sent.
  const effort = find(render(), props => typeof props.onValueChange === "function" && props.value === "high");
  (effort.onValueChange as (value: string) => void)("low");
  expect(await send()).toMatchObject({ runtime: "codex", model: "gpt-x", effort: "low" });
  box.current = { ...box.current, text: "Two" };
  expect(await send()).toMatchObject({ runtime: "codex", model: "gpt-x", effort: "high" });
  // Claude picked from the agent menu (its group is the empty radio group): kept until sent, then back to Codex.
  const claude = find(render(), props => typeof props.onValueChange === "function" && props.value === "");
  (claude.onValueChange as (value: string) => void)("default");
  box.current = { ...box.current, text: "Three" };
  expect((await send()).runtime).toBe("claude");
  expect(box.current).toMatchObject({ provider: null, models: {}, efforts: {} });
  box.current = { ...box.current, text: "Four" };
  expect((await send()).runtime).toBe("codex");
});

// review BU1 ❓1 (design 'New conversations' 적용 규칙): a default changed in Settings applies from the next new input;
// an input already started keeps the default it started with.
test("settings action: a changed default waits for the next input; the draft keeps the one it started with", async () => {
  const { box, start, render, props } = setup({ auth: { revision: 1, providers: [dto("claude"), dto("codex")] } }, { defaults: { provider: "codex" } });
  render();
  for (const effect of hooks.effects) effect();
  call(field(render()), "onChange", { target: { value: "Draft" } });
  props.defaults = { provider: "claude" };
  render();
  for (const effect of hooks.effects) effect();
  call(field(render()), "onKeyDown", key("Enter"));
  await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  expect((start.mock.calls[0]![0] as { runtime: string }).runtime).toBe("codex");
  await vi.waitFor(() => expect(box.current.sending).toBeNull());
  render();
  for (const effect of hooks.effects) effect();
  box.current = { ...box.current, text: "Next" };
  call(field(render()), "onKeyDown", key("Enter"));
  await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2));
  expect((start.mock.calls[1]![0] as { runtime: string }).runtime).toBe("claude");
});

// doan-mascot spec 'Home 전송': Doany hops when a send starts, through Send, the submit key or the notice's Retry, and
// not when the guard refuses; input draws its gaze (IME composition included).
function withDoany(tree: Record<string, unknown>[]) {
  const doany = { hop: vi.fn(), typing: vi.fn() };
  (find(tree, props => props.size === 114).ref as { current: unknown }).current = doany;
  return doany;
}
const sendButton = (tree: Record<string, unknown>[]) => find(tree, props => props["aria-label"] === "Send");

test("Doany does not hop when Send or the submit key cannot start a send", () => {
  const { start, render } = setup({ text: "" });
  const tree = render();
  const doany = withDoany(tree);
  expect(sendButton(tree).disabled).toBe(true);
  call(sendButton(tree), "onClick", {});
  call(field(tree), "onKeyDown", key("Enter"));
  expect(doany.hop).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
});

test("Doany hops once when Send, the submit key or the notice's Retry starts a send", async () => {
  const button = setup({ text: "Draw a pricing page." });
  let tree = button.render();
  const doany = withDoany(tree);
  call(sendButton(tree), "onClick", {});
  expect(doany.hop).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(button.start).toHaveBeenCalledTimes(1));
  const submit = setup({ text: "Draw a pricing page." });
  tree = submit.render();
  const keyed = withDoany(tree);
  call(field(tree), "onKeyDown", key("Enter"));
  expect(keyed.hop).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(submit.start).toHaveBeenCalledTimes(1));
  const retry = setup({ text: "Draw a pricing page.", notice: { text: "Claude Code is finishing a previous run. Try again in a moment.", retry: true } });
  tree = retry.render();
  const again = withDoany(tree);
  call(find(tree, props => props.children === "Retry" && typeof props.onClick === "function"), "onClick", {});
  expect(again.hop).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(retry.start).toHaveBeenCalledTimes(1));
});

test("input in the field, an IME composition's included, draws Doany's gaze", () => {
  const { render } = setup();
  const tree = render();
  const doany = withDoany(tree);
  call(field(tree), "onInput", { nativeEvent: { isComposing: false } });
  call(field(tree), "onInput", { nativeEvent: { isComposing: true } });
  expect(doany.typing).toHaveBeenCalledTimes(2);
  expect(doany.hop).not.toHaveBeenCalled();
});

test("while a start is pending, Send, the submit key and the notice's Retry neither start again nor hop again", async () => {
  const { box, start, render } = setup({ text: "Draw a pricing page." });
  start.mockReturnValueOnce(new Promise(() => {}) as never);
  let tree = render();
  const doany = withDoany(tree);
  call(sendButton(tree), "onClick", {});
  await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  expect(box.current.sending).not.toBeNull();
  // A refusal notice from an earlier send can still be on screen; its Retry goes through the same guard.
  box.current = { ...box.current, notice: { text: "Claude Code is finishing a previous run. Try again in a moment.", retry: true } };
  tree = render();
  (find(tree, props => props.size === 114).ref as { current: unknown }).current = doany;
  expect(sendButton(tree).disabled).toBe(true);
  call(sendButton(tree), "onClick", {});
  call(field(tree), "onKeyDown", key("Enter"));
  call(find(tree, props => props.children === "Retry" && typeof props.onClick === "function"), "onClick", {});
  await Promise.resolve();
  expect(start).toHaveBeenCalledTimes(1);
  expect(doany.hop).toHaveBeenCalledTimes(1);
});
