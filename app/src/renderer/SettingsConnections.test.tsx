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

// buzz-settings U4: Settings > Connections, moved from the Settings window (design 'Connections').
const { SettingsConnections } = await import("./SettingsConnections");
const { ConnectionRows } = await import("./ConnectionRows");
const { SettingsDialog } = await import("./SettingsDialog");
import type { MachineState } from "../main/onboarding/machine";
import type { SetupStatus } from "../main/setupBroker";

const home = "/Users/alex", app = "/Applications/Doan.app/Contents/Resources/bin/doan";
function machine(cli: MachineState["cli"]["state"] = "dangling"): MachineState {
  const link = (state: MachineState["cli"]["state"], value: string | null = null) => ({ state, value, stamp: "s" });
  const agents: MachineState["agents"] = {
    claude: { executable: "/opt/homebrew/bin/claude", config: `${home}/.claude`, mcp: { state: "missing", value: "" } },
    codex: { executable: null, config: `${home}/.codex`, mcp: { state: "missing", value: "" } },
  } as never;
  const display: MachineState["display"] = {
    home, cliPath: `${home}/.local/bin/doan`, cliTarget: app, stubPath: `${home}/.agents/skills/doan/SKILL.md`, claudeLinkPath: `${home}/.claude/skills/doan`,
    claudeLinkTarget: "../../.agents/skills/doan", mcpCommand: `${home}/.local/bin/doan mcp`, configFile: { claude: `${home}/.claude.json`, codex: `${home}/.codex/config.toml` },
    configFromEnv: { claude: false, codex: false }, blocked: { cli: null, stub: null, claudeLink: null }, appVersion: "0.1.0",
  };
  const state = { requestId: "r", available: true, reason: null, pathPresent: true, rcFile: "~/.zshrc", probe: { ok: true, path: "/usr/bin" } as const,
    cli: link(cli, cli === "dangling" ? "/gone/doan" : null), stub: { state: "missing" as const, stamp: "s" }, claudeLink: link("missing"), agents, display };
  return { ...state, expected: { cli: state.cli, stub: state.stub, claudeLink: state.claudeLink, agents: state.agents } } as MachineState;
}
const SUMMARY = { cli: "needs-attention", claude: "not-connected", codex: "not-installed" } as const;
let doan: Record<string, ReturnType<typeof vi.fn>>;
let statusListener: (status: SetupStatus) => void;
let props: Parameters<typeof SettingsConnections>[0];
beforeEach(() => {
  resetHooks();
  doan = { startConversation: vi.fn(), sendConversation: vi.fn(),
    readSetup: vi.fn(async () => ({ kind: "state", state: machine(), summary: SUMMARY })),
    onSetupStatus: vi.fn((listener: typeof statusListener) => { statusListener = listener; return () => {}; }),
    runSetupStep: vi.fn(async () => ({ kind: "confirm", id: "c1", target: "cli", message: "" })),
    answerSetupConfirm: vi.fn(async () => ({ kind: "success" })),
    openInstallPage: vi.fn(async () => true), copyPathLine: vi.fn(async () => ({ kind: "success" })),
  };
  vi.stubGlobal("window", { doan, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelector: () => null });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 0; });
  vi.stubGlobal("HTMLButtonElement", class {});
  props = { onLock: vi.fn(), actions: {} as HTMLElement };
});
// review BU1 ⚪4: nothing on the Settings page may start or send a conversation.
afterEach(() => { expect(doan.startConversation).not.toHaveBeenCalled(); expect(doan.sendConversation).not.toHaveBeenCalled(); });
afterEach(() => vi.unstubAllGlobals());
const render = () => run(() => SettingsConnections(props));
const rows = () => all(tree).find(element => element.type === ConnectionRows)!.props as Record<string, (...args: never[]) => void> & { machine: MachineState | null; busy: boolean };
const status = (patch: Partial<SetupStatus>): SetupStatus => ({ summary: SUMMARY, causes: {}, checking: false, busy: false, onboardingClosed: true, ...patch } as SetupStatus);

test("the three rows are read on entry, inside a settings group with Check Again in the page header", async () => {
  render(); await flush(); render();
  expect(doan.readSetup).toHaveBeenCalledTimes(1);
  expect(rows().rows).toEqual(["cli", "claude", "codex"]);
  expect(rows().machine?.cli.state).toBe("dangling");
  click("Check Again"); await flush();
  expect(doan.readSetup).toHaveBeenCalledTimes(2);
});

test("a fix holds the page lock through its confirmation and write; another setup step never shows the old busy notice", async () => {
  render(); await flush(); render();
  (rows().run as (row: string) => void)("cli");
  expect(props.onLock).toHaveBeenLastCalledWith(true);
  await flush(); render();
  const dialog = all(tree).find(element => element.type === SettingsDialog)!;
  expect(dialog.props.title).toBe("Fix the Doan link?");
  expect(props.onLock).toHaveBeenLastCalledWith(true);
  expect(button("Check Again").props.disabled).toBe(true);
  statusListener(status({ busy: true })); render();
  expect(text()).not.toContain("Another window");
  (dialog.props.answer as (allow: boolean) => void)(true);
  expect(doan.answerSetupConfirm).toHaveBeenCalledWith({ id: "c1", allow: true });
  await flush(); render();
  expect(props.onLock).toHaveBeenLastCalledWith(false);
  expect(all(tree).some(element => element.type === SettingsDialog)).toBe(false);
});

test("leaving while locked is not possible, but unmounting releases the lock it held", async () => {
  doan.runSetupStep!.mockImplementation(() => new Promise(() => {}));
  render(); await flush(); render();
  (rows().run as (row: string) => void)("cli");
  unmount();
  expect(props.onLock).toHaveBeenLastCalledWith(false);
});

test("main's focus re-read (its shared 60 s throttle) reaches the rows only when the summary changed; the page's own reads do not loop", async () => {
  render(); await flush(); render();
  statusListener(status({ checking: true })); statusListener(status({})); await flush();
  expect(doan.readSetup).toHaveBeenCalledTimes(1);
  statusListener(status({ summary: { ...SUMMARY, codex: "not-connected" } })); await flush(); render();
  expect(doan.readSetup).toHaveBeenCalledTimes(2);
  expect(doan.readSetup).toHaveBeenLastCalledWith(expect.stringMatching(/^settings:/));
});

test("only the latest install page result is shown", async () => {
  let first: (ok: boolean) => void = () => {};
  doan.openInstallPage!.mockImplementationOnce(() => new Promise(resolve => { first = resolve; })).mockResolvedValueOnce(true);
  render(); await flush(); render();
  (rows().install as (agent: string) => void)("codex");
  (rows().install as (agent: string) => void)("codex");
  await flush();
  first(false); await flush(); render();
  expect(text()).not.toContain("Couldn’t open the install page.");
});
