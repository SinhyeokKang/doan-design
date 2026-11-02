import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// buzz-settings U2: the Settings page frame and its sidebar categories, with hooks as plain state
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
let tree: ReactNode;
function render(props: Partial<PageProps> = {}) {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  tree = SettingsPage({ header: null, sidebar: null, section: "agents", arrival: null, onState: vi.fn(), agents, ...props });
  return tree;
}
function effects() { const pending = hooks.pending; hooks.pending = []; for (const run of pending) run(); }
const heading = () => all(tree).find(element => element.type === "h1")!;

test("the body is the scrolling white panel with a 48rem column, the category title and its lead", () => {
  const leads = {
    agents: "Doan signs in to each agent with its own connection, separate from your terminal. One account per agent. Agents you run in a terminal use Doan without any setup.",
    notifications: "macOS notifications for when an agent needs you while you work in another app.",
    about: "Versions on this Mac, for checking an update or reporting a problem.",
  };
  for (const [section, lead] of Object.entries(leads) as [PageProps["section"], string][]) {
    render({ section });
    const panel = all(tree).find(element => element.type === "main")!;
    expect(panel.props.className).toBe("home-panel settings-panel doan-scroll");
    expect(panel.props["aria-labelledby"]).toBe("settings-title");
    expect(heading().props).toMatchObject({ id: "settings-title", className: "settings-title", tabIndex: -1 });
    expect(words(heading().props.children)).toBe({ agents: "Agents", notifications: "Notifications", about: "About" }[section]);
    expect(all(tree).some(element => element.props.className === "settings-page")).toBe(true);
    expect(words(all(tree).find(element => element.props.className === "settings-lead")!.props.children)).toBe(lead);
    // Each category mounts its own body, and only that one.
    const bodies = { agents: SettingsAgents, notifications: SettingsNotifications, about: SettingsAbout };
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

test("Agents' lock reaches App", () => {
  const onState = vi.fn();
  render({ onState });
  const body = all(tree).find(element => element.type === SettingsAgents)!;
  (body.props.onLock as (locked: boolean) => void)(true);
  expect(onState).toHaveBeenLastCalledWith({ locked: true });
  (body.props.onLock as (locked: boolean) => void)(false);
  expect(onState).toHaveBeenLastCalledWith({ locked: false });
});

function sidebar(settings: { section: PageProps["section"]; select(section: string): void }, locked = false) {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  return ShellSidebar({ cards: [], projects: {}, loaded: null, canvas: undefined, homeDirectory: null, search: vi.fn(), toggle: vi.fn(), toggleGroup: vi.fn(), worktree: vi.fn(), open: vi.fn(), overview: vi.fn(), action: vi.fn(), remove: vi.fn(), projectSettings: vi.fn(), home: true, locked, settings });
}

test("on the Settings page the sidebar keeps Search and lists the three categories as plain buttons", () => {
  const select = vi.fn();
  const side = all(sidebar({ section: "notifications", select }));
  expect(side[0]!.props["aria-label"]).toBe("Settings");
  expect(side.some(element => element.props.className === "shell-search")).toBe(true);
  expect(words(side.find(element => element.props.className === "shell-projects-heading")!.props.children)).toBe("Settings");
  expect(side.some(element => element.props.role === "tree" || element.props.role === "treeitem")).toBe(false);
  const nav = side.find(element => element.type === "nav")!;
  expect(nav.props["aria-label"]).toBe("Settings");
  const rows = all(nav.props.children as ReactNode).filter(element => element.type === "button");
  expect(rows.map(button => words(button.props.children))).toEqual(["Agents", "Notifications", "About"]);
  expect(rows.map(button => button.props["aria-current"])).toEqual([undefined, "page", undefined]);
  expect(rows.every(button => button.props.type === "button" && button.props.tabIndex === undefined)).toBe(true);
  (rows[2]!.props.onClick as () => void)();
  expect(select).toHaveBeenCalledWith("about");
});

test("while the page is locked the other categories and Search show as unavailable", () => {
  const side = all(sidebar({ section: "agents", select: vi.fn() }, true));
  const rows = all(side.find(element => element.type === "nav")!.props.children as ReactNode).filter(element => element.type === "button");
  expect(rows.map(button => button.props["aria-disabled"])).toEqual([undefined, true, true]);
  expect(side.find(element => element.props.className === "shell-search")!.props["aria-disabled"]).toBe(true);
});

// buzz-settings R3 (design-sync against .doan/canvases/buzz-settings.html): values a jsdom render cannot show.
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
