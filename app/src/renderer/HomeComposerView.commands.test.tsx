import { Children, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AccountIdentity, AuthState, AuthStatusDto, Provider, ToolFacts } from "../main/agentAuth/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import * as Parts from "./ComposerParts";
import { emptyComposer, HeroComposer, type ComposerMemory, type HeroComposerProps } from "./HomeComposerView";
import type { PresetListReply, PresetSummary } from "./homeComposer";

// Home's composer with provider commands; hooks run as plain state.
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, effects: [] as (() => unknown)[], deps: [] as (unknown[] | undefined)[], redraw: () => {} }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useId: () => "id",
  // Effects run on demand; their dependency lists are kept so a test can run only those React would (runChanged).
  useEffect: (effect: () => unknown, deps?: unknown[]) => { hooks.effects.push(effect); hooks.deps.push(deps); },
  useLayoutEffect: () => {},
  useImperativeHandle: () => {},
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
const ENTRY: FolderEntry = { kind: "list", path: "/code/doan-design", servedRev: 0, canvases: [row("doan-onboarding")], git: { common: "/code/doan-design/.git", main: "/code/doan-design", branch: "main", worktrees: [] } };

let doan: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.deps = [];
  doan = {
    listConversationSkills: vi.fn(async () => ({ skills: [] })),
    onAgentAuth: vi.fn(() => () => {}), listConversationModels: vi.fn(async () => ({ models: [] })), designSkills: { list: vi.fn(async () => LISTED) } as never,
    addAttachmentFiles: vi.fn(async (files: File[]) => files.map(file => ({ ok: true, attachment: { id: `id-${file.name}`, name: file.name, size: file.size, kind: "file", path: `/Users/ada/${file.name}`, pasted: false } }))),
    addPastedImage: vi.fn(async () => ({ ok: true, attachment: { id: "pasted", name: "pasted.png", size: 10, kind: "image", path: "/u/pasted.png", pasted: true } })),
    removeAttachment: vi.fn(async () => true), chooseAttachments: vi.fn(async () => []), addDroppedFiles: vi.fn(async () => {}), addProjects: vi.fn(),
    // Pasted test files are page-made (no disk path) unless a test says otherwise.
    droppedPath: vi.fn(() => null),
    takeStartDraft: vi.fn(async () => null), attachmentsFromPaths: vi.fn(async () => []),
  };
  vi.stubGlobal("window", { doan });
  vi.stubGlobal("queueMicrotask", (run: () => void) => run());
});
afterEach(() => vi.unstubAllGlobals());

// The composer's own primitives are drawn in place, so their elements and handlers are found directly; any other component
// stays an element with its props.
const PRIMITIVES = new Set<unknown>(Object.values(Parts));
function expand(type: unknown, props: Record<string, unknown>): ReactNode {
  if (typeof type === "function") return (type as (p: unknown) => ReactNode)(props);
  return (type as { render(p: unknown, ref: unknown): ReactNode }).render(props, props.ref ?? null);
}
function elements(node: ReactNode): Record<string, unknown>[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode; [key: string]: unknown }>(child)) return [];
    // The field's own props (value, onChange, readOnly, onInput) are kept beside the element it draws.
    if (PRIMITIVES.has(child.type)) return [...(child.type === Parts.ComposerField ? [child.props] : []), ...elements(expand(child.type, child.props))];
    return [child.props, ...elements(child.props.children)];
  });
}
function setup(memory: Partial<ComposerMemory> = {}, props: Partial<HeroComposerProps> = {}) {
  const box = { current: { ...emptyComposer(), auth: AUTH, presets: LISTED, ...memory } };
  const start = vi.fn(async (_request: unknown, _last: unknown) => ({ ok: true } as const));
  const all: HeroComposerProps = { entries: [ENTRY], homeDirectory: null, shellProjects: {}, loaded: null, select: null, prefs: {}, memory: box, working: new Set(), restore: null, greeting: "Where should we start?", start, addProjects: vi.fn(), openSettings: vi.fn(), ...props };
  const render = () => { hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = []; hooks.deps = []; return elements(HeroComposer(all)); };
  return { box, start, render, props: all };
}
const find = (tree: Record<string, unknown>[], test: (props: Record<string, unknown>) => boolean) => { const found = tree.find(test); if (!found) throw new Error("not found"); return found; };
const field = (tree: Record<string, unknown>[]) => find(tree, props => props["aria-label"] === "Message");
// ComposerField's props: its value as segments, onChange, readOnly and onInput.
const input = (tree: Record<string, unknown>[]) => find(tree, props => typeof props.onKey === "function" && "value" in props);
const key = (name: string, extra: Record<string, unknown> = {}) => ({ key: name, shiftKey: false, keyCode: 0, nativeEvent: { isComposing: false }, preventDefault: vi.fn(), ...extra });
const call = (props: Record<string, unknown>, handler: string, event: unknown) => (props[handler] as (event: unknown) => void)(event);

const runEffects = () => { for (const effect of hooks.effects) effect(); };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const COMMANDS = { skills: [{ kind: "skill", name: "deploy", description: "Deploy" }, { kind: "command", name: "compact", description: "Compact" }, { kind: "command", name: "clear", description: "Clear" }] };
const said = (tree: Record<string, unknown>[]) => String(find(tree, props => props.className === "sr-only" && props.role === "status").children).trim();

test("a command starts the conversation alone: no preset line, and the files stay in the composer", async () => {
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  doan.listConversationSkills!.mockResolvedValue(COMMANDS);
  const file = { key: "k", id: "f", name: "notes.md", kind: "file" as const, pasted: false, status: "ready" as const, size: 5, path: "/Users/ada/notes.md" };
  const { box, render, start } = setup({ text: "/compact", preset: PRESETS[4]!, attachments: [file] });
  render(); runEffects(); await flush();
  call(field(render()), "onKeyDown", key("Enter")); await flush();
  expect(start.mock.calls[0]?.[0]).toMatchObject({ text: "/compact" });
  expect(start.mock.calls[0]?.[0]).not.toHaveProperty("attachments");
  expect(box.current.text).toBe("");
  expect(box.current.preset?.id).toBe("polish");
  expect(box.current.attachments).toEqual([file]);
});

test("a built-in Doan does not run starts nothing: its card shows under the composer, the text stays, and Dismiss closes it", async () => {
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  doan.listConversationSkills!.mockResolvedValue(COMMANDS);
  const { box, render, start, props } = setup({ text: "/model opus" });
  render(); runEffects(); await flush();
  call(field(render()), "onKeyDown", key("Enter")); await flush();
  expect(start).not.toHaveBeenCalled();
  expect(box.current.text).toBe("/model opus");
  let tree = render();
  expect(tree.some(p => p.children === "/model doesn’t run in Doan")).toBe(true);
  expect(said(tree)).toBe("/model doesn’t run in Doan. Choose the model from the model picker.");
  const card = find(tree, p => typeof p.className === "string" && p.className.includes("command-card"));
  expect(card.className).toBe("doan-notice thread-notice command-card");
  // Settings > Agents for the account commands.
  box.current = { ...box.current, card: null, text: "/logout" };
  call(field(render()), "onKeyDown", key("Enter")); await flush();
  tree = render();
  (find(tree, p => p.children === "Open Agents settings").onClick as () => void)();
  expect(props.openSettings).toHaveBeenCalledWith({ section: "agents", provider: "claude" });
  (find(render(), p => p.children === "Dismiss").onClick as () => void)();
  expect(box.current.card).toBeNull();
  expect(render().some(p => p.children === "/logout doesn’t run in Doan")).toBe(false);
});

test("while the field starts with a command the preset chip leaves for the notice; the field highlights the command", async () => {
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  doan.listConversationSkills!.mockResolvedValue(COMMANDS);
  const { render } = setup({ text: "/compact ", preset: PRESETS[4]! });
  render(); runEffects(); await flush();
  const tree = render();
  expect(tree.some(p => p.children === "Presets don’t apply to commands")).toBe(true);
  expect(tree.some(p => typeof p.className === "string" && p.className.includes("preset-chip"))).toBe(false);
  expect(input(tree).skillNames).toEqual(new Set(["deploy"]));
  expect((input(tree).commandNames as Set<string>).has("compact")).toBe(true);
});

// Codex's first /review: main has no permission mode the thread was told (no message yet), so it refuses with
// command_mode_stale. Home says why with the stale-mode card, not a start error with Retry, and keeps the text.
test("Codex's first /review on Home shows the stale-mode card and keeps the text", async () => {
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  doan.listConversationSkills!.mockResolvedValue({ skills: [{ kind: "command", name: "compact", description: "" }, { kind: "command", name: "review", description: "" }] });
  const { box, render, start } = setup({ text: "/review", provider: "codex", auth: { revision: 1, providers: [dto("claude"), dto("codex")] } });
  start.mockImplementation(async () => ({ error: "command_mode_stale" }) as never);
  render(); runEffects(); await flush();
  call(field(render()), "onKeyDown", key("Enter")); await flush();
  expect(start.mock.calls[0]?.[0]).toMatchObject({ runtime: "codex", text: "/review" });
  expect(box.current.card?.title).toBe("/review can’t use the new permission mode yet");
  expect(box.current.notice).toBeNull();
  expect(box.current.text).toBe("/review");
  const tree = render();
  expect(tree.some(p => p.children === "/review can’t use the new permission mode yet")).toBe(true);
  expect(said(tree)).toBe("/review can’t use the new permission mode yet. Send a message first so Codex picks up the permission mode, then run /review again.");
});

// A command takes no attachments, so a moved or checking file does not hold it on Home either.
test("a missing attachment does not hold a command on Home; a message keeps the shipped check", async () => {
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  doan.listConversationSkills!.mockResolvedValue(COMMANDS);
  const missing = { key: "m", id: "fm", name: "notes.md", kind: "file" as const, pasted: false, status: "missing" as const, size: 5, path: "/Users/ada/notes.md" };
  const { render, start } = setup({ text: "/compact", attachments: [missing] });
  render(); runEffects(); await flush();
  call(field(render()), "onKeyDown", key("Enter")); await flush();
  expect(start.mock.calls[0]?.[0]).toMatchObject({ text: "/compact" });
  const message = setup({ text: "Use this file", attachments: [missing] });
  message.render(); runEffects(); await flush();
  call(field(message.render()), "onKeyDown", key("Enter")); await flush();
  expect(message.start).not.toHaveBeenCalled();
});
