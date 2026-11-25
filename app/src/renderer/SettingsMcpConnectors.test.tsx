import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DropdownMenu } from "radix-ui";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { AuthStatusDto, Provider, Readiness } from "../main/agentAuth/types";
import type { McpSnapshot } from "../main/mcpConnectors/service";
import type { McpProvider } from "../main/mcpConnectors/presets";

// Settings > MCP Connectors with hooks as plain state so its own handlers and effects run; the watch is the real one over a
// fake snapshot feed.
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
      const states = hooks.states;
      const index = hooks.cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(states[index]) : next; }];
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
  ({ provider, revision: 1, generation: 1, phase: readiness.ready ? "connected" : "reauthRequired", account: signedIn ? { email: "ada@example.com" } : null, attempt: null, readiness, error: null, actions: [] });

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
      const created = { focus: vi.fn(() => { doc.activeElement = created; }), scrollIntoView: vi.fn(), isConnected: true, matches: () => false, getAttribute: () => null };
      nodes.set(selector, created);
    }
    return nodes.get(selector)!;
  };
  doc = { activeElement: null, body: {}, hasFocus: () => true, querySelector: (selector: string) => node(selector) };
  vi.stubGlobal("window", { doan: api, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
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
  // Settings' shared preference row in a settings group.
  expect(group.props).toMatchObject({ role: "group", tabIndex: -1, className: "doan-preference-row", "data-has-icon": "" });
  expect(all(tree).filter(element => element.props.className === "doan-settings-group" && element.props["data-layout"] === "rows")).toHaveLength(2);
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
  click(byLabel("Retry checking Atlassian for Codex"));
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
  expect(renderToStaticMarkup(input())).toMatch(/<input[^>]*spellCheck="false"/);
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
  // The field and its error are one group (8px apart), so no negative margin pulls the line up.
  const group = all(all(tree).find(element => element.props.className === "field-group")!);
  expect(group.some(element => element.type === "input" && element.props["aria-label"] === "Server URL")).toBe(true);
  expect(group.some(element => element.props.role === "alert" && element.props.id === error.props.id)).toBe(true);
  expect(error.props.className).toBe("settings-msg error selectable");
  (dialog().props.onCancel as (event: { preventDefault(): void }) => void)({ preventDefault: () => {} });
  render();
  expect(all(tree).some(element => element.type === "dialog")).toBe(false);
  expect(props.onLock).toHaveBeenLastCalledWith(false);
  expect(nodes.get("[data-mcp-add]")?.focus).toHaveBeenCalled();
});

// While main adds the server, Add keeps its fill and focus, busy with the spinner inside; a second press does nothing.
test("while Add's request is out, Add is busy and aria-disabled with the spinner inside, not natively disabled", async () => {
  await settle();
  click(all(tree).find(element => words(element.props.children).endsWith("Add server by URL") && element.type === "button"));
  render();
  const input = () => all(tree).find(element => element.type === "input")!;
  (input().props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "https://mcp.example.com/mcp" } });
  render();
  let answer: (reply: { ok: false; reason: "not_https" }) => void = () => {};
  api.addMcpServer!.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  const submitForm = () => (all(tree).find(element => element.type === "form")!.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault: () => {} });
  submitForm();
  render();
  const submit = all(tree).find(element => element.props.type === "submit")!;
  expect(submit.props.disabled).toBeFalsy();
  expect(submit.props).toMatchObject({ "aria-disabled": true, "aria-busy": true, "data-ui-variant": "prominent" });
  expect(renderToStaticMarkup(submit)).toMatch(/^<button[^>]*><span class="doan-spinner" aria-hidden="true"><\/span>Add<\/button>$/);
  submitForm();
  expect(api.addMcpServer).toHaveBeenCalledTimes(1);
  expect(input().props.readOnly).toBe(true);
  const cancel = all(tree).find(element => element.type === "button" && words(element.props.children) === "Cancel")!;
  expect(cancel.props["aria-disabled"]).toBe(true);
  click(cancel);
  const dialog = all(tree).find(element => element.type === "dialog")!;
  const escape = { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn(), nativeEvent: { isComposing: false } };
  (dialog.props.onKeyDown as (event: typeof escape) => void)(escape);
  (dialog.props.onCancel as (event: typeof escape) => void)(escape);
  render();
  expect(escape.stopPropagation).toHaveBeenCalled();
  expect(input().props.value).toBe("https://mcp.example.com/mcp");
  expect(props.onLock).toHaveBeenLastCalledWith(true);
  answer({ ok: false, reason: "not_https" });
  await settle();
  const after = all(tree).find(element => element.props.type === "submit")!;
  expect(after.props["aria-busy"]).toBeUndefined();
  expect(renderToStaticMarkup(after)).not.toContain("doan-spinner");
  expect(input().props.readOnly).toBeFalsy();
  expect(input().props.value).toBe("https://mcp.example.com/mcp");
  (input().props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "https://new.example.com" } });
  render(); submitForm(); await settle();
  expect(api.addMcpServer).toHaveBeenLastCalledWith("https://new.example.com");
  expect(all(tree).some(element => element.type === "dialog")).toBe(false);
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
  expect(words(all(tree).find(element => element.props.className === "ob-live")?.props.children).replace(/\u200b/g, "")).toBe("new.example.com added for Claude Code and Codex");
});

// Main reads the new server's status after Add (McpService.add); the page shows Checking until that read publishes, then the
// item's Connect, without a read of its own or a second focus move.
test("after Add, the new item shows Checking until main's read arrives, then its Connect", async () => {
  await settle();
  click(all(tree).find(element => words(element.props.children).endsWith("Add server by URL") && element.type === "button"));
  render();
  (all(tree).find(element => element.type === "input")!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "https://new.example.com/mcp" } });
  render();
  (all(tree).find(element => element.type === "form")!.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault: () => {} });
  await settle();
  const servers = [...SERVERS, { name: "doan-new-example-com", label: "new.example.com", url: "https://new.example.com/mcp", preset: false, removable: true, removeFailed: false }];
  feed(snap({ claude: { "doan-new-example-com": "checking" }, codex: { "doan-new-example-com": "checking" } }, servers));
  render();
  for (const agent of ["Claude Code", "Codex"]) expect(byLabel(`Connect new.example.com for ${agent}`)!.props.disabled).toBe(true);
  feed(snap({}, servers));
  render();
  const connect = byLabel("Connect new.example.com for Codex")!;
  expect(connect.props.disabled).toBeFalsy(); expect(connect.props["aria-disabled"]).toBeFalsy();
  click(connect);
  expect(api.connectMcpServer).toHaveBeenCalledWith("codex", "doan-new-example-com");
  expect(api.readMcpConnectors).toHaveBeenCalledTimes(1);
  expect(nodes.get('[data-mcp-row="claude:doan-new-example-com"]')!.focus).toHaveBeenCalledTimes(1);
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
  // DESIGN 'Busy action': the alert stays, busy, until the server is gone.
  expect(alert()).toBeDefined();
  expect(props.onLock).toHaveBeenLastCalledWith(true);
  feed(snap({ claude: { "doan-mcp-example-com": "removing" }, codex: { "doan-mcp-example-com": "removing" } }));
  render();
  expect(alert()).toBeDefined();
  feed(snap({}, SERVERS.filter(server => server.name !== "doan-mcp-example-com")));
  // The snapshot's effect closes the alert; the next render draws that.
  render(); render();
  expect(all(tree).some(element => element.props.role === "alertdialog")).toBe(false);
  expect(props.onLock).toHaveBeenLastCalledWith(false);
  expect(nodes.get('[data-mcp-row="codex:doan-mcp-two-com"]')?.focus).toHaveBeenCalled();
});

// DESIGN 'Busy action': while Remove's request is out the alert refuses its cancel; a failure shows inside it, where Remove is
// the retry, and the row's own Remove-failed notice waits until the alert closes.
test("while Remove is out the alert is busy and refuses Cancel and Escape; a failure shows inside it and Remove retries", async () => {
  await settle();
  (all(tree).find(element => element.props["data-mcp-remove"] === "codex:doan-mcp-example-com")!.props.onSelect as () => void)();
  render();
  const alert = () => all(tree).find(element => element.props.role === "alertdialog");
  const confirm = () => all(tree).find(element => element.props["data-consent"] === "" && words(element.props.children) === "Remove")!;
  const cancel = () => all(tree).find(element => element.type === "button" && words(element.props.children) === "Cancel" && element.props.autoFocus === true)!;
  click(confirm());
  await settle();
  expect(confirm().props).toMatchObject({ "aria-busy": true, "aria-disabled": true });
  expect(cancel().props).toMatchObject({ "aria-disabled": true, "data-disabled": "" });
  click(cancel());
  (alert()!.props.onCancel as (event: { preventDefault(): void }) => void)({ preventDefault: () => {} });
  click(confirm());
  render();
  expect(alert()).toBeDefined();
  expect(api.removeMcpServer).toHaveBeenCalledOnce();
  feed(snap({}, SERVERS.map(server => server.name === "doan-mcp-example-com" ? { ...server, removeFailed: true } : server)));
  // The snapshot's effect marks the alert failed; the next render draws that.
  render(); render();
  expect(alert()).toBeDefined();
  const error = all(tree).find(element => element.props.id === "mcp-remove-error")!;
  expect(error.props).toMatchObject({ className: "doan-notice error", role: "alert" });
  expect(words(error.props.children)).toBe("Couldn’t remove mcp.example.com from Doan’s agents. Try again.");
  expect(confirm().props["aria-busy"]).toBeUndefined();
  expect(confirm().props["aria-describedby"]).toBe("mcp-remove-error");
  // Not twice: the row's own failure notice is behind the alert that already says it.
  expect(all(tree).filter(element => element.props.children === "Couldn’t remove mcp.example.com from Doan’s agents. Try again.")).toHaveLength(1);
  click(confirm());
  render();
  expect(api.removeMcpServer).toHaveBeenCalledTimes(2);
  expect(all(tree).some(element => element.props.id === "mcp-remove-error")).toBe(false);
  // Main clears the earlier failure as the new attempt starts; the alert stays busy until this one answers.
  feed(snap({ claude: { "doan-mcp-example-com": "removing" }, codex: { "doan-mcp-example-com": "removing" } }));
  await settle();
  expect(confirm().props["aria-busy"]).toBe(true);
  feed(snap({}, SERVERS.map(server => server.name === "doan-mcp-example-com" ? { ...server, removeFailed: true } : server)));
  render(); render();
  expect(confirm().props["aria-busy"]).toBeUndefined();
  // A refusal main answers at once is a failure too.
  api.removeMcpServer!.mockResolvedValueOnce({ ok: false, reason: "busy" });
  feed(snap({}, SERVERS));
  render();
  click(confirm());
  await settle();
  expect(words(all(tree).find(element => element.props.id === "mcp-remove-error")?.props.children)).toBe("Couldn’t remove mcp.example.com from Doan’s agents. Try again.");
  click(cancel());
  render();
  expect(alert()).toBeUndefined();
  expect(nodes.get('[data-mcp-more="codex:doan-mcp-example-com"]')?.focus).toHaveBeenCalled();
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

// Rows with a failure, as main sends them.
const failing = (snapshot: McpSnapshot, provider: McpProvider, name: string, failure: McpSnapshot["providers"][number]["rows"][number]["failure"]): McpSnapshot =>
  ({ ...snapshot, providers: snapshot.providers.map(p => p.provider !== provider ? p : { ...p, rows: p.rows.map(r => r.name === name ? { ...r, failure } : r) }) });
const live = () => all(tree).filter(element => element.props.className === "ob-live");
const liveRoles = () => all(tree).filter(element => element.props.role === "status" || element.props.role === "alert" || element.props["aria-live"] !== undefined);

// The page live region is the only announcement channel.
test("row notices, the running notice and the file notice keep their look but carry no live role", async () => {
  running.add("claude");
  feed(snap({ claude: { "doan-notion": "connecting" } }));
  feed(snap({ claude: { "doan-notion": "connected", "doan-figma": "connecting" }, codex: { "doan-atlassian": "check_failed" } }, SERVERS.map(s => s.name === "doan-mcp-two-com" ? { ...s, removeFailed: true } : s), { claude: { lastChanged: "doan-notion", generation: 1 } }));
  feed(failing(snap({ claude: { "doan-notion": "connected", "doan-figma": "connecting" }, codex: { "doan-atlassian": "check_failed" } }, SERVERS.map(s => s.name === "doan-mcp-two-com" ? { ...s, removeFailed: true } : s), { claude: { lastChanged: "doan-notion", generation: 1 } }), "codex", "doan-figma", "failed"));
  await settle();
  const notices = all(tree).filter(element => typeof element.props.className === "string" && (element.props.className as string).startsWith("doan-notice"));
  expect(notices.length).toBeGreaterThanOrEqual(5);
  expect(notices.some(element => element.props.className === "doan-notice error")).toBe(true);
  expect(liveRoles()).toEqual(live());
  feed({ ...snap({}, SERVERS.slice(0, 3)), file: "broken" });
  render();
  expect(all(tree).some(element => element.props.className === "doan-notice error")).toBe(true);
  expect(liveRoles()).toEqual(live());
});

// A repeated identical message changes the live region each time and is read once each time.
test("two identical failures in a row each change the page live region once", async () => {
  await settle();
  feed(snap({ codex: { "doan-notion": "connecting" } }));
  feed(failing(snap(), "codex", "doan-notion", "failed"));
  render();
  const first = words(live()[0]!.props.children);
  feed(snap({ codex: { "doan-notion": "connecting" } }));
  render();
  expect(words(live()[0]!.props.children)).toBe(first);
  feed(failing(snap(), "codex", "doan-notion", "failed"));
  render();
  const second = words(live()[0]!.props.children);
  expect(second).not.toBe(first);
  for (const text of [first, second]) expect(text.replace(/​/g, "")).toBe("Codex couldn’t connect to Notion");
});

// Focus entered by keyboard is watched too; native and aria disabled are alike; focus moved away is kept.
function focusable() {
  const state = { disabled: false, aria: false };
  const node = { state, isConnected: true, focus: vi.fn(), matches: (selector: string) => selector === ":disabled" && state.disabled, getAttribute: (name: string) => name === "aria-disabled" && state.aria ? "true" : null };
  return node;
}
test("a button focused by keyboard that becomes disabled or aria-disabled hands focus to its row group", async () => {
  for (const key of ["disabled", "aria"] as const) {
    hooks.states = []; hooks.refs = []; hooks.effects = []; nodes.clear();
    await settle();
    const button = focusable();
    doc.activeElement = button;
    (byLabel("Notion for Codex")!.props.onFocus as (event: { target: unknown }) => void)({ target: button });
    render();
    expect(nodes.get('[data-mcp-row="codex:doan-notion"]')?.focus).toBeUndefined();
    button.state[key] = true;
    render();
    expect(nodes.get('[data-mcp-row="codex:doan-notion"]')?.focus, key).toHaveBeenCalledTimes(1);
  }
});

test("focus the person moved elsewhere is not taken back when the watched button is disabled", async () => {
  await settle();
  const button = focusable(), elsewhere = focusable();
  doc.activeElement = button;
  (byLabel("Notion for Codex")!.props.onFocus as (event: { target: unknown }) => void)({ target: button });
  render();
  doc.activeElement = elsewhere;
  button.state.disabled = true;
  render();
  expect(nodes.get('[data-mcp-row="codex:doan-notion"]')?.focus).toBeUndefined();
});

test("a failure stays on its row when the page is opened again", async () => {
  feed(failing(snap(), "codex", "doan-notion", "approval_timeout"));
  await settle();
  for (const slot of hooks.effects) slot?.cleanup?.();
  hooks.states = []; hooks.refs = []; hooks.effects = [];
  await settle();
  expect(all(tree).some(element => element.props.className === "doan-notice error" && words(element.props.children).startsWith("Codex stopped waiting for Notion"))).toBe(true);
});

test("leaving the page before the Remove alert's frame runs cancels it, so no ownerless lock stays", async () => {
  await settle();
  const frames = new Map<number, () => void>();
  let next = 0;
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { frames.set(++next, run); return next; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
  const item = all(tree).find(element => element.type === DropdownMenu.Item && element.props["data-mcp-remove"] === "codex:doan-mcp-example-com")!;
  (item.props.onSelect as () => void)();
  for (const effect of hooks.effects) effect?.cleanup?.();
  for (const run of frames.values()) run();
  expect(props.onLock).not.toHaveBeenCalled();
});

test("Cancel in the URL dialog and in the Remove alert returns focus to the button that opened it", async () => {
  await settle();
  click(all(tree).find(element => element.props["data-mcp-add"] === ""));
  render();
  click(all(tree).find(element => element.type === "button" && words(element.props.children) === "Cancel" && all(tree).some(d => d.type === "dialog")));
  render();
  expect(nodes.get("[data-mcp-add]")?.focus).toHaveBeenCalled();
  expect(props.onLock).toHaveBeenLastCalledWith(false);
  (all(tree).find(element => element.props["data-mcp-remove"] === "claude:doan-mcp-two-com")!.props.onSelect as () => void)();
  render();
  click(all(tree).find(element => element.type === "button" && words(element.props.children) === "Cancel" && element.props.autoFocus === true));
  render();
  expect(nodes.get('[data-mcp-more="claude:doan-mcp-two-com"]')?.focus).toHaveBeenCalled();
});

test("removing the last item of a section focuses the item before it", async () => {
  await settle();
  (all(tree).find(element => element.props["data-mcp-remove"] === "claude:doan-mcp-two-com")!.props.onSelect as () => void)();
  render();
  click(all(tree).find(element => element.props["data-consent"] === "" && words(element.props.children) === "Remove"));
  render();
  feed(snap({}, SERVERS.filter(server => server.name !== "doan-mcp-two-com")));
  render();
  expect(nodes.get('[data-mcp-row="claude:doan-mcp-example-com"]')?.focus).toHaveBeenCalled();
});

// Escape that closes the … menu must not also reach App's window handler, which leaves Settings
// (the menu is already gone from the DOM when that handler runs).
test("Escape on a server's menu closes only the menu", async () => {
  await settle();
  const content = all(tree).find(element => element.type === DropdownMenu.Content)!;
  const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
  (content.props.onEscapeKeyDown as ((event: unknown) => void) | undefined)?.(event);
  expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  expect(event.preventDefault).not.toHaveBeenCalled();
});

// The dialogs' actions are default-size buttons (40px).
test("the URL dialog and the Remove alert use default-size actions", async () => {
  await settle();
  click(all(tree).find(element => element.props["data-mcp-add"] === ""));
  render();
  const actions = () => all(all(tree).find(element => element.type === "dialog")!.props.children as ReactNode).filter(element => element.type === "button");
  expect(actions().map(button => [words(button.props.children), button.props["data-ui-size"]])).toEqual([["Cancel", undefined], ["Add", undefined]]);
  click(actions()[0]);
  render();
  (all(tree).find(element => element.props["data-mcp-remove"] === "claude:doan-mcp-two-com")!.props.onSelect as () => void)();
  render();
  expect(actions().map(button => [words(button.props.children), button.props["data-ui-size"]])).toEqual([["Cancel", undefined], ["Remove", undefined]]);
});

// Read-only text is selectable (the `selectable` class); buttons are not.
const hasSelectable = (element: ReactElement<Record<string, unknown>>) => String(element.props.className ?? "").split(" ").includes("selectable");

test("selectable: a row's status and URL lines, but not its buttons", async () => {
  await settle();
  const group = all(byLabel("mcp.example.com for Codex")!);
  const lines = group.filter(element => String(element.props.className).includes("doan-preference-row-description"));
  expect(lines.some(element => String(element.props.className).includes("mcp-url"))).toBe(true);
  expect(lines.length).toBeGreaterThanOrEqual(2);
  for (const line of lines) expect(hasSelectable(line)).toBe(true);
  const buttons = group.filter(element => element.type === "button");
  expect(buttons.length).toBeGreaterThan(0);
  for (const button of buttons) expect(hasSelectable(button)).toBe(false);
});

test("selectable: the Add server dialog's field error, but not its buttons", async () => {
  await settle();
  click(all(tree).find(element => words(element.props.children).endsWith("Add server by URL") && element.type === "button"));
  render();
  const input = all(tree).find(element => element.type === "input")!;
  (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "http://mcp.internal.example.com/mcp" } });
  render();
  api.addMcpServer!.mockResolvedValueOnce({ ok: false, reason: "not_https" });
  (all(tree).find(element => element.type === "form")!.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault: () => {} });
  await settle();
  const error = all(tree).find(element => element.props.role === "alert" && words(element.props.children) === "Enter a URL that starts with https://.")!;
  expect(hasSelectable(error)).toBe(true);
  for (const button of all(tree).filter(element => element.type === "dialog").flatMap(dialog => all(dialog)).filter(element => element.type === "button")) expect(hasSelectable(button)).toBe(false);
});

// Open again answered open_failed: the row shows the sign-in row's alert in place of the progress notice, the page's
// live region reads it, and a later open that works, or Cancel, brings the row back.
const shown = () => all(tree).filter(element => element.type === NoticeView).map(element => { const notice = element.props.notice as { title?: string; body?: string }; return `${notice.title ?? ""} ${notice.body ?? ""}`; }).join("\n");
test("a failed Open again shows the alert with Open browser and reads it; a working open brings the progress back", async () => {
  const linked = (rows: Partial<Record<McpProvider, Record<string, Status>>>) => {
    const next = snap(rows);
    return { ...next, providers: next.providers.map(p => ({ ...p, rows: p.rows.map(r => p.provider === "claude" && r.name === "doan-notion" ? { ...r, link: true } : r) })) };
  };
  feed(linked({ claude: { "doan-notion": "connecting" } }));
  await settle();
  api.openMcpLink!.mockResolvedValueOnce({ ok: false, reason: "open_failed" });
  click(byLabel("Open Notion’s sign-in again for Claude Code"));
  await settle();
  const text = shown();
  expect(text).toContain("Couldn’t open your browser. Try again.");
  expect(text).not.toContain("Finish connecting to Notion");
  expect(words(live()[0]?.props.children).replace(/​/g, "")).toBe("Couldn’t open your browser. Try again.");
  const again = byLabel("Open browser to connect Notion for Claude Code");
  expect(again).toBeDefined();
  // A second failure is read again: the live region changes for it.
  const said = watch.announcementSeq();
  api.openMcpLink!.mockResolvedValueOnce({ ok: false, reason: "open_failed" });
  click(again);
  await settle();
  expect(watch.announcementSeq()).toBe(said + 1);
  click(byLabel("Open browser to connect Notion for Claude Code"));
  expect(api.openMcpLink).toHaveBeenLastCalledWith("claude", "doan-notion");
  await settle();
  expect(shown()).toContain("Finish connecting to Notion");
  expect(shown()).not.toContain("Couldn’t open your browser.");
  // A new failure, then Cancel: the next attempt starts without the old alert.
  api.openMcpLink!.mockResolvedValueOnce({ ok: false, reason: "open_failed" });
  click(byLabel("Open Notion’s sign-in again for Claude Code"));
  await settle();
  click(byLabel("Cancel connecting Notion for Claude Code"));
  feed(linked({ claude: { "doan-notion": "not_connected" } }));
  await settle();
  feed(linked({ claude: { "doan-notion": "connecting" } }));
  await settle();
  expect(shown()).toContain("Finish connecting to Notion");
});

// The entry read is the page's only source until main publishes: when it rejects with no snapshot yet, the page says
// so with a Retry (DESIGN 'Busy action') instead of staying blank with Add unavailable.
const readFailed = () => all(tree).filter(element => typeof element.type === "string").some(element => words(element.props.children) === "Couldn’t read the MCP connectors." || words(element.props.children) === "Couldn’t read the MCP connectors. ");
const retryButtons = () => all(tree).filter(element => element.type === "button" && words(element.props.children) === "Retry");
test("an entry read that rejects before any snapshot shows the read failure with Retry; Retry is busy, and a read clears it", async () => {
  watch = new McpConnectorsWatch({ api: api as never, running: provider => running.has(provider), pageShown: () => true, toast: vi.fn(), openPage: vi.fn() });
  watch.start();
  props = { ...props, watch };
  api.readMcpConnectors!.mockRejectedValueOnce(new Error("ipc"));
  await settle();
  expect(readFailed()).toBe(true);
  const retry = retryButtons()[0]!;
  expect(all(tree).find(element => element.props.id === retry.props["aria-describedby"])).toBeDefined();
  let answer!: (value: McpSnapshot) => void;
  api.readMcpConnectors!.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  click(retry);
  render();
  expect(readFailed()).toBe(true);
  expect(retryButtons()[0]!.props).toMatchObject({ "aria-busy": true, "aria-disabled": true });
  click(retryButtons()[0]);
  expect(api.readMcpConnectors).toHaveBeenCalledTimes(2);
  answer(snap());
  await settle();
  expect(readFailed()).toBe(false);
  expect(all(tree).filter(element => element.type === "section")).toHaveLength(2);
});

test("an entry read that rejects while a snapshot is shown keeps the page as it is, with no failure line", async () => {
  api.readMcpConnectors!.mockRejectedValueOnce(new Error("ipc"));
  await settle();
  expect(readFailed()).toBe(false);
  expect(all(tree).filter(element => element.type === "section")).toHaveLength(2);
});

test.each([{ ok: true, name: "old" }, { ok: false, reason: "write_failed" }])("an old add reply %j leaves the next page’s pending dialog alone", async reply => {
  let oldAnswer!: (value: typeof reply) => void;
  let newAnswer!: (value: { ok: true; name: string }) => void;
  api.addMcpServer!.mockImplementationOnce(() => new Promise(done => { oldAnswer = done; }))
    .mockImplementationOnce(() => new Promise(done => { newAnswer = done; }));
  const add = async (value: string) => {
    await settle();
    click(all(tree).find(element => element.props["data-mcp-add"] === ""));
    render();
    (byLabel("Server URL")!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    render();
    (all(tree).find(element => element.type === "form")!.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault: vi.fn() });
    render();
  };
  await add("https://old.example.com");
  for (const effect of hooks.effects) effect?.cleanup?.();
  hooks.states = []; hooks.refs = []; hooks.effects = [];
  await add("https://new.example.com");
  const onLock = vi.mocked(props.onLock);
  expect(onLock.mock.calls).toEqual([[true], [false], [true]]);
  oldAnswer(reply); await settle();
  expect(onLock).toHaveBeenCalledTimes(3);
  expect(byLabel("Server URL")?.props).toMatchObject({ value: "https://new.example.com", readOnly: true });
  expect(all(tree).find(element => element.type === "dialog")?.props["aria-busy"]).toBe(true);
  newAnswer({ ok: true, name: "new" }); await settle();
  expect(onLock.mock.calls).toEqual([[true], [false], [true], [false]]);
  expect(byLabel("Server URL")).toBeUndefined();
});
