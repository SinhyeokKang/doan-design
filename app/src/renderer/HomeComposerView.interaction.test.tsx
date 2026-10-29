import { Children, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AccountIdentity, AuthState, AuthStatusDto, Provider, ToolFacts } from "../main/agentAuth/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import { emptyComposer, HomeComposer, pasteAction, slashKey, tabKey, type ComposerMemory, type HomeComposerProps } from "./HomeComposerView";
import type { PresetListReply, PresetSummary } from "./homeComposer";
import type { LastRequest } from "./homeConversations";

// Hooks run as plain state so the component's own handlers can be called (ShellSidebar.interaction.test.tsx).
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, effects: [] as (() => unknown)[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useId: () => "id",
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
  useReducer: () => [0, () => {}],
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
const row = (name: string): CanvasRow => ({ path: `.doan/canvases/${name}.html`, id: name, url: "u", open: 0, resolved: 0 });
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

function elements(node: ReactNode): Record<string, unknown>[] {
  return Children.toArray(node).flatMap(child => isValidElement<{ children?: ReactNode; [key: string]: unknown }>(child) ? [child.props, ...elements(child.props.children)] : []);
}
function setup(memory: Partial<ComposerMemory> = {}, props: Partial<HomeComposerProps> = {}) {
  const box = { current: { ...emptyComposer(), auth: AUTH, presets: LISTED, ...memory } };
  const start = vi.fn(async (_request: unknown, _last: unknown) => ({ ok: true } as const));
  const all: HomeComposerProps = { entries: [ENTRY], homeDirectory: null, shellProjects: {}, loaded: null, handoff: null, select: null, prefs: {}, memory: box, running: new Map(), restore: null, greeting: "Where should we start?", start, openConversation: vi.fn(), ...props };
  const render = () => { hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = []; return elements(HomeComposer(all)); };
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
  hooks.refs[1]!.current = { focus, setSelectionRange, value: "" };
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
  hooks.refs[1]!.current = { selectionStart: 0, focus: vi.fn() };
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
  expect(hooks.states.some(state => (state as { text?: string } | null)?.text === "Folders can’t be attached. Drop a folder outside the message to add a project.")).toBe(true);
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
  expect(start.mock.calls[0]![0]).toEqual({ root: "/code/doan-design", mode: "newDesign", runtime: "claude", text: "Use the doan design preset `critique` (Critique the design).\n\nCritique the buzz-onboarding canvas.", attachments: [{ id: "id-a" }] });
  await vi.waitFor(() => expect(hooks.states.some(state => (state as { text?: string } | null)?.text === "Couldn’t start with Claude Code: its sign-in has expired. Choose another agent.")).toBe(true));
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
