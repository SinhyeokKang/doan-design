import { isValidElement, type ReactElement, type ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { AuthStatusDto, Provider, Readiness } from "../main/agentAuth/types";
import type { McpSnapshot } from "../main/mcpConnectors/service";
import type { McpProvider } from "../main/mcpConnectors/presets";

// mcp-connectors task D2: Settings > MCP Connectors, driven with hooks as plain state so the component's own handlers
// and effects run (SettingsAgents.test.tsx style). The watch is the real one over a fake snapshot feed.
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
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next; }];
    },
    useReducer: () => [0, () => {}],
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: effect, useLayoutEffect: effect,
  };
});
// The header action is portalled into the page header; here it renders in place.
vi.mock("react-dom", async original => ({ ...await original<typeof import("react-dom")>(), createPortal: (children: ReactNode) => children }));

const { SettingsMcpConnectors } = await import("./SettingsMcpConnectors");
const { McpConnectorsWatch } = await import("./mcpConnectorsWatch");
const { NoticeView } = await import("./Onboarding");

const SERVERS: McpSnapshot["servers"] = [
  { name: "doan-notion", label: "Notion", url: "https://mcp.notion.com/mcp", preset: true, removable: false, removeFailed: false },
  { name: "doan-atlassian", label: "Atlassian", url: "https://mcp.atlassian.com/v1/mcp", preset: true, removable: false, removeFailed: false },
  { name: "doan-figma", label: "Figma", url: "https://mcp.figma.com/mcp", preset: true, removable: false, removeFailed: false },
  { name: "doan-mcp-example-com", label: "mcp.example.com", url: "https://mcp.example.com/mcp", preset: false, removable: true, removeFailed: false },
  { name: "doan-mcp-two-com", label: "mcp.two.com", url: "https://mcp.two.com/mcp", preset: false, removable: true, removeFailed: false },
];
type Status = McpSnapshot["providers"][number]["rows"][number]["view"]["status"];
const ACTION: Record<Status, McpSnapshot["providers"][number]["rows"][number]["view"]["action"]> = {
  checking: null, not_connected: "connect", connecting: "cancel", connected: "disconnect", disconnecting: null, removing: null, reconnect_needed: "reconnect", check_failed: "retry",
};
let revision = 0;
function snap(rows: Partial<Record<McpProvider, Record<string, Status>>> = {}, servers = SERVERS, meta: Partial<Record<McpProvider, { lastChanged: string; generation: number }>> = {}): McpSnapshot {
  return {
    revision: ++revision, file: "ok", servers,
    providers: (["claude", "codex"] as const).map(provider => ({
      provider, lastChanged: meta[provider]?.lastChanged ?? null, generation: meta[provider]?.generation ?? 0,
      rows: servers.map(server => { const status = rows[provider]?.[server.name] ?? "not_connected"; return { name: server.name, failure: null, link: false, view: { status, action: ACTION[status], disabled: null, blocked: false } }; }),
    })),
  };
}
const dto = (provider: Provider, signedIn: boolean, readiness: Readiness = { ready: true }): AuthStatusDto =>
  ({ provider, revision: 1, phase: readiness.ready ? "connected" : "reauthRequired", account: signedIn ? { email: "ada@example.com" } : null, attempt: null, readiness, error: null, actions: [] });

let api: Record<string, ReturnType<typeof vi.fn>>;
let feed: (snapshot: McpSnapshot) => void;
let watch: InstanceType<typeof McpConnectorsWatch>;
let running: Set<McpProvider>;
let signIn: { state: { auth: AuthSnapshot | null | undefined }; subscribe: ReturnType<typeof vi.fn> };
let props: Parameters<typeof SettingsMcpConnectors>[0];
let tree: ReactNode;
let nodes: Map<string, { focus: ReturnType<typeof vi.fn>; scrollIntoView: ReturnType<typeof vi.fn>; isConnected: boolean; matches: (selector: string) => boolean }>;
let doc: Record<string, unknown>;

beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  revision = 0;
  api = {
    onMcpConnectors: vi.fn((listener: typeof feed) => { feed = listener; return () => {}; }),
    // main answers a refresh with its current snapshot; the reads it starts publish later.
    readMcpConnectors: vi.fn(async () => watch.snapshot),
    addMcpServer: vi.fn(async () => ({ ok: true, name: "doan-new-example-com" })),
    connectMcpServer: vi.fn(async () => ({ ok: true })), disconnectMcpServer: vi.fn(async () => ({ ok: true })),
    cancelMcpConnect: vi.fn(async () => ({ ok: true })), openMcpLink: vi.fn(async () => ({ ok: true })), removeMcpServer: vi.fn(async () => ({ ok: true })),
    startConversation: vi.fn(), sendConversation: vi.fn(),
  };
  nodes = new Map();
  const node = (selector: string) => {
    if (!nodes.has(selector)) {
      const created = { focus: vi.fn(() => { doc.activeElement = created; }), scrollIntoView: vi.fn(), isConnected: true, matches: () => false };
      nodes.set(selector, created);
    }
    return nodes.get(selector)!;
  };
  doc = { activeElement: null, body: {}, hasFocus: () => true, querySelector: (selector: string) => node(selector) };
  vi.stubGlobal("window", { doan: api, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; });
  vi.stubGlobal("HTMLElement", class {});
  running = new Set();
  watch = new McpConnectorsWatch({ api: api as never, running: provider => running.has(provider), pageShown: () => true, toast: vi.fn(), openPage: vi.fn() });
  watch.start();
  feed(snap());
  signIn = { state: { auth: { revision: 1, providers: [dto("claude", true), dto("codex", true), dto("cursor", true)] } }, subscribe: vi.fn(() => () => {}) };
  props = { watch, signIn: signIn as never, onLock: vi.fn(), openAgents: vi.fn(), actions: {} as never };
});
// The page shares the main window's preload, so nothing here may start or send a conversation.
afterEach(() => {
  expect(api.startConversation).not.toHaveBeenCalled();
  expect(api.sendConversation).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

function render(next: Partial<typeof props> = {}): ReactNode {
  props = { ...props, ...next };
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  tree = SettingsMcpConnectors(props);
  for (const run of hooks.pending) run();
  return tree;
}
async function settle(next: Partial<typeof props> = {}) {
  render(next);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return render();
}
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const inner = typeof node.type === "function" && (node.type === NoticeView || ["McpRow", "RowButton", "ActionButton"].includes((node.type as { name?: string }).name ?? "") || (node.type as { name?: string }).name === "AddServerDialog" || (node.type as { name?: string }).name === "RemoveAlert")
    ? all((node.type as (props: unknown) => ReactNode)(node.props)) : [];
  return [node, ...inner, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
const words = (node: unknown): string => Array.isArray(node) ? node.map(words).join("") : typeof node === "string" ? node : isValidElement<Record<string, unknown>>(node) ? words(node.props.children) : "";
const byLabel = (label: string) => all(tree).find(element => element.props["aria-label"] === label);
const click = (element: ReactElement<Record<string, unknown>> | undefined) => (element!.props.onClick as () => void)();

test("entering the page reads the statuses once; sections are groups named by their agent, with one page live region", async () => {
  await settle();
  expect(api.readMcpConnectors).toHaveBeenCalledWith({ refresh: true });
  expect(api.readMcpConnectors).toHaveBeenCalledTimes(1);
  const sections = all(tree).filter(element => element.type === "section");
  expect(sections.map(section => section.props.role)).toEqual(["group", "group"]);
  const titles = all(tree).filter(element => typeof element.props.id === "string" && sections.some(section => section.props["aria-labelledby"] === element.props.id));
  expect(titles.map(title => words(title.props.children))).toEqual(["Claude Code", "Codex"]);
  expect(all(tree).filter(element => element.props.className === "ob-live")).toHaveLength(1);
  const group = byLabel("Notion for Codex")!;
  expect(group.props).toMatchObject({ role: "group", tabIndex: -1, className: "ob-provider" });
  render();
  expect(api.readMcpConnectors).toHaveBeenCalledTimes(1);
});

test("Connect runs for that agent and server; when its button goes away focus moves to the item's row group", async () => {
  await settle();
  const connect = byLabel("Connect Notion for Codex")!;
  doc.activeElement = { isConnected: false, matches: () => false };
  click(connect);
  expect(api.connectMcpServer).toHaveBeenCalledWith("codex", "doan-notion");
  feed(snap({ codex: { "doan-notion": "connecting" } }));
  render();
  expect(nodes.get('[data-mcp-row="codex:doan-notion"]')?.focus).toHaveBeenCalled();
});

test("Cancel, Open again, Disconnect and Retry reach main with the row's agent and server", async () => {
  feed({ ...snap({ claude: { "doan-notion": "connecting", "doan-figma": "connected" }, codex: { "doan-atlassian": "check_failed" } }), providers: snap({ claude: { "doan-notion": "connecting", "doan-figma": "connected" }, codex: { "doan-atlassian": "check_failed" } }).providers.map(p => ({ ...p, rows: p.rows.map(r => r.name === "doan-notion" && p.provider === "claude" ? { ...r, link: true } : r) })) });
  await settle();
  click(byLabel("Cancel connecting Notion for Claude Code"));
  expect(api.cancelMcpConnect).toHaveBeenCalledWith("claude", "doan-notion");
  click(byLabel("Open Notion’s sign-in again for Claude Code"));
  expect(api.openMcpLink).toHaveBeenCalledWith("claude", "doan-notion");
  click(byLabel("Disconnect Figma for Claude Code"));
  expect(api.disconnectMcpServer).toHaveBeenCalledWith("claude", "doan-figma");
  click(byLabel("Check Atlassian for Codex again"));
  expect(api.readMcpConnectors).toHaveBeenLastCalledWith({ refresh: true });
});

test("a busy agent's other Connect buttons stay focusable with the reason as their tooltip, and do nothing", async () => {
  feed(snap({ codex: { "doan-notion": "connecting" } }));
  const rows = watch.snapshot!.providers[1]!.rows.map(row => row.view.status === "not_connected" ? { ...row, view: { ...row.view, disabled: "busy" as const } } : row);
  feed({ ...watch.snapshot!, revision: ++revision, providers: [watch.snapshot!.providers[0]!, { ...watch.snapshot!.providers[1]!, rows }] });
  await settle();
  const figma = byLabel("Connect Figma for Codex")!;
  expect(figma.props["aria-disabled"]).toBe(true);
  expect(figma.props.disabled).toBeFalsy();
  click(figma);
  expect(api.connectMcpServer).not.toHaveBeenCalled();
  expect(all(tree).some(element => words(element.props.children) === "Finish or cancel the Notion connection first.")).toBe(true);
});

test("Add server by URL opens a compact dialog that locks the page; a bad URL is an inline error, Escape returns to the button", async () => {
  await settle();
  const add = all(tree).find(element => words(element.props.children).endsWith("Add server by URL") && element.type === "button")!;
  click(add);
  render();
  expect(props.onLock).toHaveBeenLastCalledWith(true);
  const dialog = () => all(tree).find(element => element.type === "dialog")!;
  expect(words(all(tree).find(element => element.props.className === "doan-dialog-title")?.props.children)).toBe("Add server by URL");
  const input = () => all(tree).find(element => element.type === "input")!;
  expect(input().props).toMatchObject({ "aria-label": "Server URL", placeholder: "https://mcp.example.com/mcp" });
  const submit = () => all(tree).find(element => element.props.type === "submit")!;
  expect(submit().props.disabled).toBe(true);
  (input().props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "http://mcp.internal.example.com/mcp" } });
  render();
  expect(submit().props.disabled).toBe(false);
  api.addMcpServer!.mockResolvedValueOnce({ ok: false, reason: "not_https" });
  (all(tree).find(element => element.type === "form")!.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault: () => {} });
  await settle();
  expect(api.addMcpServer).toHaveBeenCalledWith("http://mcp.internal.example.com/mcp");
  const error = all(tree).find(element => element.props.role === "alert" && words(element.props.children) === "Enter a URL that starts with https://.")!;
  expect(input().props["aria-invalid"]).toBe(true);
  expect(input().props["aria-describedby"]).toBe(error.props.id);
  (dialog().props.onCancel as (event: { preventDefault(): void }) => void)({ preventDefault: () => {} });
  render();
  expect(all(tree).some(element => element.type === "dialog")).toBe(false);
  expect(props.onLock).toHaveBeenLastCalledWith(false);
  expect(nodes.get("[data-mcp-add]")?.focus).toHaveBeenCalled();
});

test("after Add, focus goes to the new item's row group in the first section, scrolled into view", async () => {
  await settle();
  click(all(tree).find(element => words(element.props.children).endsWith("Add server by URL") && element.type === "button"));
  render();
  (all(tree).find(element => element.type === "input")!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "https://new.example.com/mcp" } });
  render();
  (all(tree).find(element => element.type === "form")!.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault: () => {} });
  await settle();
  expect(all(tree).some(element => element.type === "dialog")).toBe(false);
  feed(snap({}, [...SERVERS, { name: "doan-new-example-com", label: "new.example.com", url: "https://new.example.com/mcp", preset: false, removable: true, removeFailed: false }]));
  render();
  const group = nodes.get('[data-mcp-row="claude:doan-new-example-com"]')!;
  expect(group.focus).toHaveBeenCalled();
  expect(group.scrollIntoView).toHaveBeenCalled();
  expect(words(all(tree).find(element => element.props.className === "ob-live")?.props.children)).toBe("new.example.com added");
});

test("Remove asks first and locks the page; Cancel returns to the … button, Remove sends and later focuses the next item", async () => {
  await settle();
  expect(byLabel("mcp.example.com menu for Codex")).toBeDefined();
  // Presets have no menu.
  expect(byLabel("Notion menu for Codex")).toBeUndefined();
  const item = all(tree).find(element => element.type === DropdownMenu.Item && element.props["data-mcp-remove"] === "codex:doan-mcp-example-com")!;
  expect(words(item.props.children)).toBe("Remove");
  (item.props.onSelect as () => void)();
  render();
  expect(props.onLock).toHaveBeenLastCalledWith(true);
  const alert = () => all(tree).find(element => element.props.role === "alertdialog")!;
  expect(words(all(tree).find(element => element.props.className === "doan-dialog-title")?.props.children)).toBe("Remove mcp.example.com from Doan’s agents?");
  expect(words(all(tree).find(element => element.props.className === "doan-dialog-description")?.props.children)).toBe("Claude Code and Codex disconnect from it. Your terminal setup is not changed.");
  (alert().props.onCancel as (event: { preventDefault(): void }) => void)({ preventDefault: () => {} });
  render();
  expect(props.onLock).toHaveBeenLastCalledWith(false);
  expect(nodes.get('[data-mcp-more="codex:doan-mcp-example-com"]')?.focus).toHaveBeenCalled();
  (item.props.onSelect as () => void)();
  render();
  click(all(tree).find(element => element.props["data-consent"] === "" && words(element.props.children) === "Remove"));
  render();
  expect(api.removeMcpServer).toHaveBeenCalledWith("doan-mcp-example-com");
  expect(props.onLock).toHaveBeenLastCalledWith(false);
  feed(snap({ claude: { "doan-mcp-example-com": "removing" }, codex: { "doan-mcp-example-com": "removing" } }));
  render();
  feed(snap({}, SERVERS.filter(server => server.name !== "doan-mcp-example-com")));
  render();
  expect(nodes.get('[data-mcp-row="codex:doan-mcp-two-com"]')?.focus).toHaveBeenCalled();
});

test("a signed-in agent that can't run says why in its header, with a way to Agents", async () => {
  signIn.state.auth = { revision: 2, providers: [dto("claude", true, { ready: false, cause: "reauth_required", action: "reauth" }), dto("codex", false)] };
  await settle();
  expect(all(tree).filter(element => element.type === "section")).toHaveLength(1);
  expect(all(tree).some(element => words(element.props.children) === "Claude Code’s sign-in expired. Sign in again to connect or disconnect its servers.")).toBe(true);
  click(byLabel("Open Agents settings for Claude Code"));
  expect(props.openAgents).toHaveBeenCalledWith("claude");
});

test("a change while the agent runs a turn shows the notice under that item; no toast", async () => {
  running.add("claude");
  feed(snap({ claude: { "doan-notion": "connecting" } }));
  feed(snap({ claude: { "doan-notion": "connected" } }, SERVERS, { claude: { lastChanged: "doan-notion", generation: 1 } }));
  await settle();
  const group = byLabel("Notion for Claude Code")!;
  const notice = all(group.props.children as ReactNode).find(element => element.type === NoticeView);
  expect((notice?.props.notice as { body: string }).body).toBe("Applies from Claude Code’s next turn. The running turn keeps its current tools.");
  expect(all(tree).filter(element => element.type === NoticeView && (element.props.notice as { body?: string }).body?.startsWith("Applies from"))).toHaveLength(1);
});

test("an unreadable connectors file disables Add server by URL and shows the storage notice", async () => {
  feed({ ...snap({}, SERVERS.slice(0, 3)), file: "broken" });
  await settle();
  const add = all(tree).find(element => words(element.props.children).endsWith("Add server by URL") && element.type === "button")!;
  expect(add.props.disabled).toBe(true);
  expect(all(tree).some(element => element.type === NoticeView && (element.props.notice as { body?: string }).body === "Doan couldn’t read its saved servers, so you can’t add or remove servers by URL.")).toBe(true);
});
