import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as ({ deps: unknown[] | undefined; cleanup?: () => void } | undefined)[],
  pending: [] as (() => void)[], cursor: 0, refCursor: 0, effectCursor: 0,
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const effect = (run: () => unknown, deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
    const slot: { deps: unknown[] | undefined; cleanup?: () => void } = { deps };
    hooks.effects[index] = slot;
    hooks.pending.push(() => { previous?.cleanup?.(); const cleanup = run(); if (typeof cleanup === "function") slot.cleanup = cleanup as () => void; });
  };
  return {
    ...actual,
    useId: () => "id",
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next; }];
    },
    useReducer: () => [0, () => {}],
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: effect, useLayoutEffect: effect,
    useMemo: <T,>(factory: () => T) => factory(),
    useCallback: <T,>(callback: T) => callback,
  };
});
// A portal renders in place here, so the header actions it places are in the tree.
vi.mock("react-dom", async original => ({ ...await original<typeof import("react-dom")>(), createPortal: (children: ReactNode) => children }));

function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
const words = (node: unknown): string => Array.isArray(node) ? node.map(words).join("") : typeof node === "string" || typeof node === "number" ? String(node) : isValidElement<Record<string, unknown>>(node) ? words(node.props.children) : "";
let tree: ReactNode;
function run(make: () => ReactNode): ReactNode {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  tree = make();
  for (const effect of hooks.pending) effect();
  return tree;
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const unmount = () => { for (const slot of hooks.effects) slot?.cleanup?.(); };
const button = (label: string) => { const found = all(tree).find(element => element.type === "button" && (element.props["aria-label"] === label || words(element.props.children) === label)); if (!found) throw new Error(`no button ${label}`); return found; };
const click = (label: string) => (button(label).props.onClick as () => void)();
const text = () => words(all(tree).filter(element => typeof element.type === "string").map(element => element.props.children));
function resetHooks() { hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = []; }

// buzz-settings U4: Settings > About (design 'About'), over BM's aboutView rows.
const { SettingsAbout } = await import("./SettingsAbout");
import type { AboutRead } from "../main/about";

const READ: AboutRead = { version: "0.1.0", cli: { path: "/Applications/Doan.app/Contents/Resources/bin/doan", version: "0.1.0" }, tools: [
  { provider: "claude", cli: "found", installed: "2.1.330", support: "supported" }, { provider: "codex", cli: "found", installed: "0.163.0", support: "unsupported" },
  { provider: "cursor", cli: "missing", installed: null, support: "unknown" }, { provider: "antigravity", cli: "missing", installed: null, support: "unknown" },
  { provider: "copilot", cli: "found", installed: null, support: "unknown" }] };
let doan: Record<string, ReturnType<typeof vi.fn>>;
let windowListeners: Record<string, () => void>;
let reply: (value: AboutRead | null) => void;
beforeEach(() => {
  resetHooks(); windowListeners = {};
  doan = { startConversation: vi.fn(), sendConversation: vi.fn(), readAbout: vi.fn(() => new Promise(resolve => { reply = resolve; })), copyAbout: vi.fn(async () => ({ kind: "success" })) };
  vi.stubGlobal("window", { doan, addEventListener: (name: string, listener: () => void) => { windowListeners[name] = listener; }, removeEventListener: vi.fn() });
});
// review BU1 ⚪4: nothing on the Settings page may start or send a conversation.
afterEach(() => { expect(doan.startConversation).not.toHaveBeenCalled(); expect(doan.sendConversation).not.toHaveBeenCalled(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const actions = {} as HTMLElement;
const render = () => run(() => SettingsAbout({ actions }));
const row = (id: string) => all(tree).find(element => element.props["data-about"] === id)!;

test("rows say Checking… while About is read on entry, then show versions and support", async () => {
  render();
  expect(doan.readAbout).toHaveBeenCalledTimes(1);
  for (const id of ["version", "cli", "claude", "codex"]) expect(words(row(id).props.children), id).toContain("Checking…");
  expect(all(row("cli").props.children as ReactNode).some(element => element.props.role === "status")).toBe(true);
  reply(READ); await flush(); render();
  expect(words(row("version").props.children)).toContain("0.1.0");
  expect(words(row("cli").props.children)).toContain("/Applications/Doan.app/Contents/Resources/bin/doan");
  expect(words(row("claude").props.children)).toContain("2.1.330");
  expect(all(row("claude").props.children as ReactNode).find(element => String(element.props.className).startsWith("ob-chip"))!.props.className).toBe("ob-chip ok");
  expect(all(row("codex").props.children as ReactNode).find(element => String(element.props.className).startsWith("ob-chip"))!.props.className).toBe("ob-chip warn");
  expect(words(row("antigravity").props.children)).toContain("Downloaded by Doan");
  for (const copy of ["Doan", "Agent tools", "The command-line tools Doan runs for your agent connections."]) expect(text()).toContain(copy);
});

test("a row whose version couldn’t be read says so with Retry, which reads About again", async () => {
  render();
  reply({ ...READ, cli: { ...READ.cli, version: null } }); await flush(); render();
  expect(words(row("cli").props.children)).toContain("Couldn’t read the doan command’s version.");
  expect(words(row("copilot").props.children)).toContain("Couldn’t read the version.");
  const retries = all(tree).filter(element => element.type === "button" && words(element.props.children) === "Retry");
  expect(retries).toHaveLength(2);
  (retries[0]!.props.onClick as () => void)();
  expect(doan.readAbout).toHaveBeenCalledTimes(2);
});

// review BU2-3: a focus re-read keeps the shown versions, and a read in flight is not started again.
test("returning to the window reads About again without Checking…; a focus during a read starts no other", async () => {
  render();
  windowListeners.focus!();
  expect(doan.readAbout).toHaveBeenCalledTimes(1);
  reply(READ); await flush(); render();
  windowListeners.focus!(); render();
  expect(doan.readAbout).toHaveBeenCalledTimes(2);
  expect(words(row("claude").props.children)).toContain("2.1.330");
  expect(words(row("claude").props.children)).not.toContain("Checking…");
  windowListeners.focus!();
  expect(doan.readAbout).toHaveBeenCalledTimes(2);
  reply({ ...READ, tools: READ.tools!.map(tool => tool.provider === "claude" ? { ...tool, installed: "2.1.400" } : tool) }); await flush(); render();
  expect(words(row("claude").props.children)).toContain("2.1.400");
});

test("Copy details asks main to copy, then reads Copied for a moment", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  render();
  click("Copy details");
  expect(doan.copyAbout).toHaveBeenCalledWith();
  await flush(); render();
  expect(button("Copied").props["aria-live"]).toBe("polite");
  vi.advanceTimersByTime(2000); render();
  expect(button("Copy details")).toBeDefined();
  doan.copyAbout!.mockResolvedValueOnce({ kind: "error", message: "The clipboard is busy." });
  click("Copy details"); await flush(); render();
  expect(text()).toContain("Couldn’t copy the details.");
});
