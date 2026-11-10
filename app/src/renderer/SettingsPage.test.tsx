import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CanvasMenu } from "./ShellSidebar";
const NO_CANVAS_MENU: CanvasMenu = { blocked: () => false, exporting: () => false, exportCanvas: () => {}, trash: () => {} };

// The Settings page frame and its sidebar categories, with hooks as plain state
// (App.addProjects.test.tsx style) so the page's own effects and the sidebar's handlers run.
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
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: effect, useLayoutEffect: effect,
  };
});

const { SettingsPage } = await import("./SettingsPage");
const { SettingsAgents } = await import("./SettingsAgents");
const { SettingsNotifications } = await import("./SettingsNotifications");
const { SettingsAbout } = await import("./SettingsAbout");
const { SettingsGeneral } = await import("./SettingsGeneral");
const { SettingsMcpConnectors } = await import("./SettingsMcpConnectors");
const { ShellSidebar } = await import("./ShellSidebar");

beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; });
  vi.stubGlobal("document", { activeElement: null, body: {}, querySelector: () => null, querySelectorAll: () => [] });
});
afterEach(() => vi.unstubAllGlobals());

function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
const words = (node: unknown): string => Array.isArray(node) ? node.map(words).join("") : typeof node === "string" ? node : isValidElement<Record<string, unknown>>(node) ? words(node.props.children) : "";
type PageProps = Parameters<typeof SettingsPage>[0];
const agents = { signIn: {} as never, preferences: null, save: vi.fn(), project: null } satisfies PageProps["agents"];
const buddy: PageProps["buddy"] = { shown: "doany", failure: null, select: vi.fn(async () => true), settled: async () => true, commit: async () => true, dismiss: vi.fn() };
let tree: ReactNode;
function render(props: Partial<PageProps> = {}) {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  tree = SettingsPage({ header: null, sidebar: null, section: "agents", arrival: null, onState: vi.fn(), agents, buddy, mcp: { watch: {} as never, openAgents: vi.fn() }, ...props });
  return tree;
}
function effects() { const pending = hooks.pending; hooks.pending = []; for (const run of pending) run(); }
const heading = () => all(tree).find(element => element.type === "h1")!;

test("the body is the scrolling white panel with a 48rem column, the category title and its lead", () => {
  const leads = {
    general: "Choices that apply across Doan on this Mac.",
    agents: "Doan signs in to each agent with its own connection, separate from your terminal. One account per agent. Agents you run in a terminal use Doan without any setup.",
    mcp: "MCP servers that Claude Code and Codex can use in Doan conversations, connected separately from your terminal. Claude Code also uses the servers connected to your claude.ai account. Cursor, Antigravity and GitHub Copilot can’t use these servers yet.",
    notifications: "macOS notifications for when an agent needs you while you work in another app.",
    about: "Versions on this Mac, for checking an update or reporting a problem.",
  };
  for (const [section, lead] of Object.entries(leads) as [PageProps["section"], string][]) {
    render({ section });
    const panel = all(tree).find(element => element.type === "main")!;
    expect(panel.props.className).toBe("home-panel settings-panel doan-scroll");
    expect(panel.props["aria-labelledby"]).toBe("settings-title");
    expect(heading().props).toMatchObject({ id: "settings-title", className: "settings-title", tabIndex: -1 });
    expect(words(heading().props.children)).toBe({ general: "General", agents: "Agents", mcp: "MCP Connectors", notifications: "Notifications", about: "About" }[section]);
    expect(all(tree).some(element => element.props.className === "settings-page")).toBe(true);
    expect(words(all(tree).find(element => element.props.className === "settings-lead")!.props.children)).toBe(lead);
    // Each category mounts its own body, and only that one.
    const bodies = { general: SettingsGeneral, agents: SettingsAgents, mcp: SettingsMcpConnectors, notifications: SettingsNotifications, about: SettingsAbout };
    for (const [id, body] of Object.entries(bodies)) expect(all(tree).some(element => element.type === body), `${section} ${id}`).toBe(id === section);
    // Copy details goes to the header's action slot.
    expect(all(tree).some(element => element.props.className === "settings-header-actions")).toBe(true);
  }
});

test("an arrival focuses the category title once; a provider arrival goes to Agents' row group instead", () => {
  const focus = vi.fn();
  render({ arrival: { focus: { kind: "heading" }, seq: 1 } });
  (heading().props.ref as (node: unknown) => void)({ focus });
  effects();
  expect(focus).toHaveBeenCalledTimes(1);
  render({ arrival: { focus: { kind: "heading" }, seq: 1 } }); effects();
  expect(focus).toHaveBeenCalledTimes(1);
  render({ arrival: { focus: { kind: "provider", provider: "codex" }, seq: 2 } }); effects();
  expect(focus).toHaveBeenCalledTimes(1);
  expect(all(tree).find(element => element.type === SettingsAgents)!.props.arrival).toEqual({ provider: "codex", seq: 2 });
  // A section picked in the sidebar keeps focus on its row: no new arrival, no focus.
  render({ section: "about", arrival: { focus: { kind: "provider", provider: "codex" }, seq: 2 } }); effects();
  expect(focus).toHaveBeenCalledTimes(1);
});

// .doan/canvases/buddy-choice.html 'settings-general', 'settings-general-failed'.
describe("Settings > General", () => {
  const snapshot = (notice: "broken" | "newer" | null) => ({ preferences: { v: 1 as const, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: null, updates: { autoCheck: true } }, notice });
  const general = (patch: Partial<PageProps["buddy"]> = {}, notice: "broken" | "newer" | null = null) => {
    render({ section: "general", agents: { ...agents, preferences: snapshot(notice) }, buddy: { ...buddy, ...patch } });
    const body = all(tree).find(element => element.type === SettingsGeneral)!;
    return expand(SettingsGeneral(body.props as Parameters<typeof SettingsGeneral>[0]));
  };
  // The picker's rows and notice are function components: drawn here so the tree holds them.
  function expand(node: ReactNode): ReactElement<Record<string, unknown>>[] {
    if (Array.isArray(node)) return node.flatMap(expand);
    if (!isValidElement<Record<string, unknown>>(node)) return [];
    if (typeof node.type === "function" && node.type !== SettingsGeneral) return expand((node.type as (props: unknown) => ReactNode)(node.props));
    return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? expand(value as ReactNode) : [])];
  }
  const radios = (nodes: ReturnType<typeof general>) => nodes.filter(element => element.type === "input");

  test("one Buddy group of rows named by its title, the saved buddy checked; a pick saves through App's selection", () => {
    const select = vi.fn(async () => true);
    const nodes = general({ shown: "popo", select });
    const title = nodes.find(element => element.type === "h2")!;
    expect(title.props).toMatchObject({ id: "settings-general-buddy", className: "settings-section-title", children: "Buddy" });
    expect(words(nodes.find(element => element.props.className === "settings-section-description")!.props.children)).toBe("Shown on Home and while an agent works on a canvas. It also sets the accent color.");
    const group = nodes.find(element => element.props.role === "radiogroup")!;
    expect(group.props["aria-labelledby"]).toBe("settings-general-buddy");
    expect(radios(nodes).find(radio => radio.props.checked)!.props.value).toBe("popo");
    expect(radios(nodes).every(radio => radio.props.disabled === false)).toBe(true);
    (radios(nodes)[4]!.props.onChange as () => void)();
    expect(select).toHaveBeenCalledWith("dori");
    expect(nodes.some(element => String(element.props.className ?? "").includes("doan-notice"))).toBe(false);
  });

  test("a failed save: the notice above the group names both buddies with Retry, read once by the category's live region", async () => {
    const select = vi.fn(async () => true);
    const checked = { focus: vi.fn() };
    vi.stubGlobal("document", { activeElement: null, body: {}, querySelector: (selector: string) => selector === ".settings-panel .buddy-rows" ? { querySelector: () => checked } : null, querySelectorAll: () => [] });
    const nodes = general({ shown: "dori", failure: { picked: "popo", kept: "dori" }, select });
    const order = nodes.map(element => element.props.className ?? element.props.role);
    expect(order.indexOf("doan-notice error settings-notice buddy-notice")).toBeLessThan(order.indexOf("doan-settings-group"));
    expect(nodes.find(element => element.props.id === "settings-buddy-error")!.props.children).toBe("Couldn’t switch to Popo. Dori is still your buddy.");
    expect(nodes.find(element => element.props.className === "ob-live")!.props).toMatchObject({ role: "status", children: "Couldn’t switch to Popo. Dori is still your buddy." });
    expect(radios(nodes).find(radio => radio.props.checked)!.props.value).toBe("dori");
    (nodes.find(element => element.type === "button" && element.props.children === "Retry")!.props.onClick as () => void)();
    expect(select).toHaveBeenCalledWith("popo");
    await vi.waitFor(() => expect(checked.focus).toHaveBeenCalled());
  });

  test("a newer or broken notice sits above the save failure; newer and an unread snapshot turn the rows off", () => {
    const broken = general({ failure: { picked: "popo", kept: "doany" } }, "broken");
    const order = broken.map(element => element.props.role === "alert" ? "broken" : element.props.className);
    expect(order.indexOf("broken")).toBeLessThan(order.indexOf("doan-notice error settings-notice buddy-notice"));
    expect(radios(broken).every(radio => radio.props.disabled === false)).toBe(true);
    expect(radios(general({}, "newer")).every(radio => radio.props.disabled === true)).toBe(true);
    render({ section: "general" });
    const body = all(tree).find(element => element.type === SettingsGeneral)!;
    expect(radios(expand(SettingsGeneral(body.props as Parameters<typeof SettingsGeneral>[0]))).every(radio => radio.props.disabled === true)).toBe(true);
  });

  test("leaving the category clears a failure notice", () => {
    const dismiss = vi.fn();
    general({ dismiss });
    effects();
    const cleanup = hooks.effects.find(effect => effect?.cleanup)?.cleanup;
    cleanup?.();
    expect(dismiss).toHaveBeenCalled();
  });
});

test("Agents' lock reaches App", () => {
  const onState = vi.fn();
  render({ onState });
  const body = all(tree).find(element => element.type === SettingsAgents)!;
  (body.props.onLock as (locked: boolean) => void)(true);
  expect(onState).toHaveBeenLastCalledWith({ locked: true });
  (body.props.onLock as (locked: boolean) => void)(false);
  expect(onState).toHaveBeenLastCalledWith({ locked: false });
});

function sidebar(settings: { section: PageProps["section"]; select(section: string): void; mcp?: boolean }, locked = false) {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  return ShellSidebar({ cards: [], projects: {}, loaded: null, canvas: undefined, homeDirectory: null, search: vi.fn(), toggle: vi.fn(), disclose: vi.fn(), toggleGroup: vi.fn(), worktree: vi.fn(), open: vi.fn(), overview: vi.fn(), action: vi.fn(), remove: vi.fn(), projectSettings: vi.fn(), canvasMenu: NO_CANVAS_MENU, home: true, locked, settings });
}

test("on the Settings page the sidebar keeps Search and lists the categories as plain buttons", () => {
  const select = vi.fn();
  const side = all(sidebar({ section: "notifications", select }));
  expect(side[0]!.props["aria-label"]).toBe("Settings");
  expect(side.some(element => element.props.className === "shell-search")).toBe(true);
  expect(words(side.find(element => element.props.className === "shell-projects-heading")!.props.children)).toBe("Settings");
  expect(side.some(element => element.props.role === "tree" || element.props.role === "treeitem")).toBe(false);
  const nav = side.find(element => element.type === "nav")!;
  expect(nav.props["aria-label"]).toBe("Settings");
  const rows = all(nav.props.children as ReactNode).filter(element => element.type === "button");
  expect(rows.map(button => words(button.props.children))).toEqual(["General", "Agents", "Notifications", "About"]);
  expect(rows.map(button => button.props["aria-current"])).toEqual([undefined, undefined, "page", undefined]);
  expect(rows.every(button => button.props.type === "button" && button.props.tabIndex === undefined)).toBe(true);
  (rows[3]!.props.onClick as () => void)();
  expect(select).toHaveBeenCalledWith("about");
});

// MCP Connectors sits between Agents and Notifications while Claude Code or Codex is signed in.
test("MCP Connectors is listed between Agents and Notifications only while the category exists", () => {
  const nav = (mcp: boolean) => all(all(sidebar({ section: "agents", select: vi.fn(), mcp })).find(element => element.type === "nav")!.props.children as ReactNode).filter(element => element.type === "button");
  expect(nav(true).map(button => words(button.props.children))).toEqual(["General", "Agents", "MCP Connectors", "Notifications", "About"]);
  expect(nav(false).map(button => words(button.props.children))).toEqual(["General", "Agents", "Notifications", "About"]);
});

test("the page reads a given announcement in its own live region", () => {
  render({ announcement: "MCP Connectors is available while Claude Code or Codex is signed in." });
  expect(words(all(tree).find(element => element.props.className === "ob-live" && element.props.role === "status")?.props.children)).toBe("MCP Connectors is available while Claude Code or Codex is signed in.");
  render();
  expect(all(tree).some(element => element.props.className === "ob-live")).toBe(false);
});

test("while the page is locked the other categories and Search show as unavailable", () => {
  const side = all(sidebar({ section: "agents", select: vi.fn() }, true));
  const rows = all(side.find(element => element.type === "nav")!.props.children as ReactNode).filter(element => element.type === "button");
  expect(rows.map(button => button.props["aria-disabled"])).toEqual([true, undefined, true, true]);
  expect(side.find(element => element.props.className === "shell-search")!.props["aria-disabled"]).toBe(true);
});

// design-sync against .doan/canvases/doan-settings.html: values a jsdom render cannot show.
test("the current category takes the pressed fill with standard ink, and a locked category's icon dims with its label", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain('.shell-side .shell-settings-row[aria-current="page"] { background: var(--affordance-backdrop-pressed); color: var(--text-standard); }');
  expect(css).toContain('.shell-side .shell-settings-row[aria-current="page"] svg { color: var(--text-standard); }');
  expect(css).toContain('.shell-side .shell-settings-row[aria-disabled="true"] svg { color: var(--text-disabled); }');
});

test("a confirmation over a Settings page drops the page's tracking", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  // The Fix… and Share confirmations are rendered inside the panel and would inherit its body-sm tracking.
  expect(css).toContain(".settings-panel .doan-dialog { letter-spacing: normal; }");
});

test("a line that belongs to the group, not a row (the recovery actions), is a row of its own under a hairline", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain(".doan-settings-group > .doan-preference-row-extra { margin-top: 0; padding: var(--space-3) 0; }");
  expect(css).not.toContain(".doan-settings-group > .settings-recovery");
  // The permission hint under Desktop notifications is the same kind of line but hugs the row above: its rule comes later.
  expect(css.indexOf(".doan-settings-group > .doan-preference-row-extra {")).toBeLessThan(css.indexOf(".doan-settings-group > .settings-permission {"));
});
