import { expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { AuthStatusDto, Provider, Readiness } from "../main/agentAuth/types";
import type { ConnectorStatus, ConnectorView } from "../main/mcpConnectors/state";
import type { McpFailure, McpRowDto, McpServerDto, McpSnapshot } from "../main/mcpConnectors/service";
import type { McpProvider } from "../main/mcpConnectors/presets";
import { addError, mcpAvailable, mcpChanges, mcpChangeText, mcpFailureText, mcpPageView, removeFocus, type McpRowView } from "./mcpConnectorsView";
import { McpConnectorsWatch } from "./mcpConnectorsWatch";

// mcp-connectors task D2: the page's pure view over main's snapshot (service.ts McpSnapshot) and agent-auth, and the
// App-level watch that tells changes, failures elsewhere and the running-turn notice.

const URL_SERVER: McpServerDto = { name: "doan-mcp-example-com", label: "mcp.example.com", url: "https://mcp.example.com/v2/mcp", preset: false, removable: true, removeFailed: false };
const PRESET_SERVERS: McpServerDto[] = [
  { name: "doan-notion", label: "Notion", url: "https://mcp.notion.com/mcp", preset: true, removable: false, removeFailed: false },
  { name: "doan-atlassian", label: "Atlassian", url: "https://mcp.atlassian.com/v1/mcp", preset: true, removable: false, removeFailed: false },
  { name: "doan-figma", label: "Figma", url: "https://mcp.figma.com/mcp", preset: true, removable: false, removeFailed: false },
];
const ACTIONS: Record<ConnectorStatus, ConnectorView["action"]> = {
  checking: null, not_connected: "connect", connecting: "cancel", connected: "disconnect", disconnecting: null, removing: null, reconnect_needed: "reconnect", check_failed: "retry",
};
type RowSpec = Partial<Omit<McpRowDto, "view">> & { view?: Partial<ConnectorView> };
function rowDto(name: string, status: ConnectorStatus, spec: RowSpec = {}): McpRowDto {
  return { name, failure: null, link: false, ...spec, view: { status, action: ACTIONS[status], disabled: null, blocked: false, ...spec.view } };
}
function snapshot(rows: Partial<Record<McpProvider, Record<string, ConnectorStatus | [ConnectorStatus, RowSpec]>>>, extra: Partial<McpSnapshot> = {}, meta: Partial<Record<McpProvider, { lastChanged?: string | null; generation?: number }>> = {}): McpSnapshot {
  const servers = extra.servers ?? [...PRESET_SERVERS, URL_SERVER];
  return {
    revision: 1, file: "ok", servers, ...extra,
    providers: (["claude", "codex"] as const).map(provider => ({
      provider, lastChanged: meta[provider]?.lastChanged ?? null, generation: meta[provider]?.generation ?? 0,
      rows: servers.map(server => {
        const spec = rows[provider]?.[server.name] ?? "not_connected";
        return Array.isArray(spec) ? rowDto(server.name, spec[0], spec[1]) : rowDto(server.name, spec);
      }),
    })),
  };
}
function status(provider: Provider, signedIn = true, readiness: Readiness = { ready: true }, phase: AuthStatusDto["phase"] = "connected"): AuthStatusDto {
  return { provider, revision: 1, phase, account: signedIn ? { email: "ada@example.com" } : null, attempt: null, readiness, error: null, actions: [] };
}
const AUTH: AuthSnapshot = { revision: 1, providers: [status("claude"), status("codex"), status("cursor"), status("copilot", false), status("antigravity", false)] };
const auth = (claude: boolean, codex: boolean, extra: Partial<Record<"claude" | "codex", AuthStatusDto>> = {}): AuthSnapshot =>
  ({ revision: 1, providers: [extra.claude ?? status("claude", claude), extra.codex ?? status("codex", codex), status("cursor")] });
const find = (view: ReturnType<typeof mcpPageView>, provider: McpProvider, name: string): McpRowView =>
  view.sections.find(section => section.provider === provider)!.rows.find(row => row.name === name)!;

test("the category exists while Claude Code or Codex is signed in; unknown until agent-auth is read", () => {
  expect(mcpAvailable(auth(true, false))).toBe(true);
  expect(mcpAvailable(auth(false, true))).toBe(true);
  // Cursor's sign-in does not count: it can't use these servers yet.
  expect(mcpAvailable(auth(false, false))).toBe(false);
  // An unreadable account store signs nobody in.
  expect(mcpAvailable(null)).toBe(false);
  expect(mcpAvailable(undefined)).toBeNull();
});

test("one section per signed-in agent, Claude Code then Codex; unsupported providers and signed-out agents get none", () => {
  expect(mcpPageView(snapshot({}), AUTH).sections.map(section => [section.provider, section.title])).toEqual([["claude", "Claude Code"], ["codex", "Codex"]]);
  expect(mcpPageView(snapshot({}), auth(false, true)).sections.map(section => section.provider)).toEqual(["codex"]);
  expect(mcpPageView(snapshot({}), undefined).sections).toEqual([]);
});

test("presets are listed even when no server was added, URL servers follow in every section with their URL and a menu", () => {
  const presetsOnly = mcpPageView(snapshot({}, { servers: PRESET_SERVERS }), AUTH);
  expect(presetsOnly.sections[0]!.rows.map(row => row.label)).toEqual(["Notion", "Atlassian", "Figma"]);
  const view = mcpPageView(snapshot({}), AUTH);
  for (const section of view.sections) expect(section.rows.map(row => row.label)).toEqual(["Notion", "Atlassian", "Figma", "mcp.example.com"]);
  const notion = find(view, "codex", "doan-notion"), custom = find(view, "codex", URL_SERVER.name);
  expect(notion).toMatchObject({ group: "Notion for Codex", logo: "mcp-logos/notion.png", url: null, menu: null });
  expect(custom).toMatchObject({ group: "mcp.example.com for Codex", logo: null, url: "https://mcp.example.com/v2/mcp", menu: { label: "mcp.example.com menu for Codex", disabled: false, removeDisabled: false } });
  // The internal doan- name is never shown or read out.
  const shown = view.sections.flatMap(section => section.rows).map(row => JSON.stringify([row.label, row.group, row.status, row.url, row.menu?.label, row.button?.ariaLabel, row.helper]));
  expect(shown.some(text => text.includes("doan-"))).toBe(false);
});

test("buttons are named with the server and the agent", () => {
  const view = mcpPageView(snapshot({ codex: { "doan-notion": "not_connected", "doan-figma": "connected", "doan-atlassian": "reconnect_needed" } }), AUTH);
  expect(find(view, "codex", "doan-notion").button).toMatchObject({ command: "connect", label: "Connect", variant: "prominent", disabled: false, ariaLabel: "Connect Notion for Codex" });
  expect(find(view, "codex", "doan-figma").button).toMatchObject({ command: "disconnect", label: "Disconnect", variant: "subtle", ariaLabel: "Disconnect Figma for Codex" });
  expect(find(view, "codex", "doan-atlassian").button).toMatchObject({ command: "connect", label: "Reconnect", variant: "prominent", ariaLabel: "Reconnect Atlassian for Codex" });
  expect(find(view, "codex", "doan-atlassian").helper).toBe("Codex was connected to Atlassian before, and that access has ended. Reconnect to use it again.");
});

test("status lines are present participles without an ellipsis; Checking, Disconnecting and Removing disable the row's action", () => {
  const view = mcpPageView(snapshot({ claude: { "doan-notion": "checking", "doan-figma": "disconnecting", [URL_SERVER.name]: "removing" } }), AUTH, (provider, name) => provider === "claude" && name === URL_SERVER.name ? "disconnect" : null);
  expect(find(view, "claude", "doan-notion")).toMatchObject({ status: "Checking", button: { command: "connect", disabled: true } });
  expect(find(view, "claude", "doan-figma")).toMatchObject({ status: "Disconnecting", button: { command: "disconnect", label: "Disconnect", disabled: true } });
  // Removing keeps the button the row had before, disabled, and its menu is disabled too (draft frame 7).
  expect(find(view, "claude", URL_SERVER.name)).toMatchObject({ status: "Removing", button: { command: "disconnect", disabled: true }, menu: { disabled: true } });
  const labels = ["not_connected", "connected", "reconnect_needed", "connecting"] as const;
  const all = mcpPageView(snapshot({ codex: Object.fromEntries(labels.map((value, i) => [[...PRESET_SERVERS, URL_SERVER][i]!.name, value])) }), AUTH).sections[1]!.rows.map(row => row.status);
  expect(all).toEqual(["Not connected", "Connected", "Reconnect needed", "Connecting"]);
});

test("Connecting shows the waiting notice: Claude Code with Cancel and Open again, Codex with Cancel only", () => {
  const view = mcpPageView(snapshot({ claude: { "doan-notion": ["connecting", { link: false }], "doan-figma": ["not_connected", { view: { disabled: "busy" } }] }, codex: { "doan-notion": "connecting" } }), AUTH);
  const claude = find(view, "claude", "doan-notion"), codex = find(view, "codex", "doan-notion");
  expect(claude.button).toBeNull();
  expect(claude.notice).toMatchObject({ role: "status", spinner: true, title: "Finish connecting to Notion", body: "Allow access to Notion in your browser, then return here." });
  expect(claude.notice!.actions.map(action => [action.command, action.label, action.disabled, action.ariaLabel])).toEqual([
    ["cancel", "Cancel", false, "Cancel connecting Notion for Claude Code"], ["openLink", "Open again", true, "Open Notion’s sign-in again for Claude Code"]]);
  const linked = find(mcpPageView(snapshot({ claude: { "doan-notion": ["connecting", { link: true }] } }), AUTH), "claude", "doan-notion");
  expect(linked.notice!.actions[1]!.disabled).toBe(false);
  expect(codex.notice).toMatchObject({ title: "Finish connecting to Notion", body: "Codex opened your default browser. Allow access to Notion there, then return here." });
  expect(codex.notice!.actions.map(action => action.command)).toEqual(["cancel"]);
  // While one attempt runs in a section, its other Connect buttons are disabled with the reason as a tooltip.
  expect(find(view, "claude", "doan-figma").button).toMatchObject({ command: "connect", disabled: true, tooltip: "Finish or cancel the Notion connection first." });
});

test("Couldn’t check shows the Agents alert with Retry that reads the statuses again", () => {
  const row = find(mcpPageView(snapshot({ codex: { "doan-atlassian": "check_failed" } }), AUTH), "codex", "doan-atlassian");
  expect(row.button).toBeNull();
  expect(row.notice).toMatchObject({ role: "alert", body: "The status check failed or took too long. Try again." });
  expect(row.notice!.actions).toEqual([{ command: "check", label: "Retry", variant: "prominent", disabled: false, ariaLabel: "Check Atlassian for Codex again" }]);
});

test("a failed attempt shows its reason with Retry on the row it returned to", () => {
  const failing = (provider: McpProvider, failure: McpFailure, base: ConnectorStatus = "not_connected") => find(mcpPageView(snapshot({ [provider]: { "doan-notion": [base, { failure }] } }), AUTH), provider, "doan-notion");
  const text = (provider: McpProvider, failure: McpFailure) => failing(provider, failure).notice?.body;
  expect(text("claude", "no_link")).toBe("Claude Code didn’t send a sign-in link. If a browser is set in Claude Code’s settings, remove it, then try again.");
  expect(text("claude", "approval_timeout")).toBe("Claude Code stopped waiting for Notion to allow access. Try again, and allow access in the browser tab that opens.");
  expect(text("codex", "approval_timeout")).toBe("Codex stopped waiting for Notion to allow access. Try again, and allow access in the browser tab that opens.");
  expect(text("claude", "storage_failed")).toBe("Couldn’t save this connection securely. Allow Claude Code to use your Keychain, then try again.");
  expect(text("codex", "failed")).toBe("Codex couldn’t connect to Notion. Check your connection and try again.");
  expect(text("codex", "busy")).toBe("Codex is busy signing in or out. Try again in a moment.");
  expect(text("codex", "pending_logout")).toBe("Doan is still disconnecting the previous account. Try again later.");
  const row = failing("codex", "failed");
  expect(row.button).toBeNull();
  expect(row.notice).toMatchObject({ role: "alert", actions: [{ command: "connect", label: "Retry", variant: "prominent", ariaLabel: "Retry Notion for Codex" }] });
  const disconnect = failing("codex", "disconnect_failed", "connected");
  expect(disconnect).toMatchObject({ status: "Connected", notice: { body: "Couldn’t disconnect Notion from Codex. Try again.", actions: [{ command: "disconnect", label: "Retry" }] } });
  expect(mcpFailureText("not_ready", "claude", "Figma")).toBe("Claude Code can’t run right now. Check it in Agents, then try again.");
});

test("a server whose previous account is still being logged out shows that line under Connect", () => {
  const row = find(mcpPageView(snapshot({ codex: { "doan-notion": ["not_connected", { view: { blocked: true } }] } }), AUTH), "codex", "doan-notion");
  expect(row).toMatchObject({ status: "Not connected", button: { command: "connect", disabled: false }, helper: "Doan is still disconnecting the previous account. Try again later." });
});

test("Remove is disabled while any agent connects the server; a failed Remove keeps the item with an alert and Retry", () => {
  const busy = mcpPageView(snapshot({ codex: { [URL_SERVER.name]: "connecting" } }, { servers: [...PRESET_SERVERS, { ...URL_SERVER, removable: false }] }), AUTH);
  expect(find(busy, "claude", URL_SERVER.name).menu).toMatchObject({ disabled: false, removeDisabled: true });
  const failed = mcpPageView(snapshot({}, { servers: [...PRESET_SERVERS, { ...URL_SERVER, removeFailed: true }] }), AUTH);
  for (const provider of ["claude", "codex"] as const) expect(find(failed, provider, URL_SERVER.name).notice).toMatchObject({
    role: "alert", body: "Couldn’t remove mcp.example.com from Doan’s agents. Try again.", actions: [{ command: "remove", label: "Retry", ariaLabel: "Retry removing mcp.example.com from Claude Code and Codex" }] });
});

test("an agent that is signed in but can't run gives the reason in its section header and disables every button", () => {
  const expired = status("claude", true, { ready: false, cause: "reauth_required", action: "reauth" }, "reauthRequired");
  const view = mcpPageView(snapshot({ claude: { "doan-notion": ["connected", { view: { disabled: "not_ready" } }], "doan-figma": ["not_connected", { view: { disabled: "not_ready" } }] } }), auth(true, true, { claude: expired }));
  const section = view.sections[0]!;
  expect(section.header).toEqual({ reason: "Claude Code’s sign-in expired. Sign in again to connect or disconnect its servers.", action: { command: "openAgents", label: "Open Agents settings", variant: "prominent", disabled: false, ariaLabel: "Open Agents settings for Claude Code" } });
  expect(find(view, "claude", "doan-notion")).toMatchObject({ status: "Connected", button: { command: "disconnect", disabled: true } });
  expect(find(view, "claude", "doan-figma").button).toMatchObject({ disabled: true });
  const update = mcpPageView(snapshot({}), auth(true, true, { codex: status("codex", true, { ready: false, cause: "version_unsupported", action: "update" }) }));
  expect(update.sections[1]!.header?.reason).toBe("Codex needs an update. Update it to connect or disconnect its servers.");
  expect(view.sections[1]!.header).toBeNull();
});

test("an unreadable connectors file shows the storage notice and blocks only adding and removing URL servers", () => {
  const broken = mcpPageView(snapshot({}, { file: "broken", servers: PRESET_SERVERS }), AUTH);
  expect(broken.notice).toMatchObject({ role: "alert", body: "Doan couldn’t read its saved servers, so you can’t add or remove servers by URL." });
  expect(broken.addDisabled).toBe(true);
  expect(find(broken, "codex", "doan-figma").button).toMatchObject({ command: "connect", disabled: false });
  const newer = mcpPageView(snapshot({}, { file: "newer", servers: PRESET_SERVERS }), AUTH);
  expect(newer.notice).toMatchObject({ role: "status", title: "These servers were saved by a newer version of Doan", body: "You can’t add or remove servers by URL here. Update Doan to change them." });
  expect(newer.addDisabled).toBe(true);
  expect(newer.sections[0]!.rows.map(row => row.label)).toEqual(["Notion", "Atlassian", "Figma"]);
  expect(mcpPageView(snapshot({}), AUTH)).toMatchObject({ notice: null, addDisabled: false });
});

test("the URL dialog's errors are inline sentences; a duplicate names the server that has the URL", () => {
  expect(addError({ ok: false, reason: "not_https" })).toBe("Enter a URL that starts with https://.");
  expect(addError({ ok: false, reason: "duplicate", name: "Notion" })).toBe("Already added as Notion.");
  for (const reason of ["empty", "too_long", "invalid", "credentials", "fragment", "file_unreadable", "write_failed"] as const) expect(addError({ ok: false, reason })).toMatch(/\.$/);
  expect(addError({ ok: true, name: "doan-x" })).toBeNull();
});

test("after Remove, focus goes to the next item in the section, or the previous one when it was last", () => {
  const names = ["doan-notion", "doan-atlassian", "doan-figma", "doan-a", "doan-b"];
  expect(removeFocus(names, "doan-a")).toBe("doan-b");
  expect(removeFocus(names, "doan-b")).toBe("doan-a");
  expect(removeFocus(["doan-x"], "doan-x")).toBeNull();
});

test("changes worth reading: person-made and background changes, never a first Checking result", () => {
  const before = snapshot({ claude: { "doan-notion": "checking", "doan-figma": "connecting" }, codex: { "doan-notion": "disconnecting", "doan-atlassian": "connected", "doan-figma": "connected" } });
  const after = snapshot(
    { claude: { "doan-notion": "connected", "doan-figma": "connected" }, codex: { "doan-notion": "not_connected", "doan-atlassian": "reconnect_needed", "doan-figma": "check_failed" } },
    {}, { claude: { lastChanged: "doan-figma", generation: 1 }, codex: { lastChanged: "doan-notion", generation: 3 } });
  const changes = mcpChanges(before, after);
  expect(changes.map(mcpChangeText).filter(Boolean)).toEqual([
    "Figma connected for Claude Code", "Notion disconnected for Codex", "Atlassian needs reconnecting for Codex", "Couldn’t check Figma for Codex",
  ]);
  expect(changes.flatMap(change => change.kind === "succeeded" ? [[change.provider, change.name]] : [])).toEqual([["claude", "doan-figma"], ["codex", "doan-notion"]]);
  expect(mcpChanges(null, after)).toEqual([]);
});

test("a cancelled Connect says nothing; a failure, an added and a removed server are read", () => {
  const before = snapshot({ codex: { "doan-notion": "connecting", "doan-figma": "connecting" } }, {}, { codex: { generation: 2 } });
  const cancelled = snapshot({ codex: { "doan-notion": "not_connected", "doan-figma": "connecting" } }, {}, { codex: { generation: 2 } });
  expect(mcpChanges(before, cancelled)).toEqual([]);
  const failed = snapshot({ codex: { "doan-figma": ["not_connected", { failure: "failed" }] } }, { servers: PRESET_SERVERS }, { codex: { generation: 2 } });
  expect(mcpChanges(before, failed).map(mcpChangeText).filter(Boolean)).toEqual(["Codex couldn’t connect to Figma", "mcp.example.com removed from Claude Code and Codex"]);
  expect(mcpChanges(failed, snapshot({})).map(mcpChangeText).filter(Boolean)).toEqual(["mcp.example.com added for Claude Code and Codex"]);
});

function watchHarness(running: McpProvider[] = [], shown = false) {
  let listener: ((snapshot: McpSnapshot) => void) | null = null;
  const toast = vi.fn(), open = vi.fn();
  const state = { running: new Set<McpProvider>(running), shown };
  const watch = new McpConnectorsWatch({
    api: { onMcpConnectors: (next: (snapshot: McpSnapshot) => void) => { listener = next; return () => { listener = null; }; } },
    running: provider => state.running.has(provider), pageShown: () => state.shown, toast, openPage: open,
  });
  const stop = watch.start();
  return { watch, toast, open, state, stop, send: (next: McpSnapshot) => listener!(next) };
}

test("a success while that agent runs a turn puts one notice per section under the item changed last, until the turn ends", () => {
  const h = watchHarness(["claude"]);
  h.send({ ...snapshot({ claude: { "doan-notion": "connecting" } }), revision: 1 });
  h.send({ ...snapshot({ claude: { "doan-notion": "connected" } }, {}, { claude: { lastChanged: "doan-notion", generation: 1 } }), revision: 2 });
  expect(h.watch.notices).toEqual({ claude: "doan-notion" });
  expect(h.watch.noticeText("claude")).toBe("Applies from Claude Code’s next turn. The running turn keeps its current tools.");
  h.send({ ...snapshot({ claude: { "doan-notion": "connected", "doan-figma": "connecting" } }, {}, { claude: { lastChanged: "doan-notion", generation: 1 } }), revision: 3 });
  h.send({ ...snapshot({ claude: { "doan-notion": "connected", "doan-figma": "connected" } }, {}, { claude: { lastChanged: "doan-figma", generation: 2 } }), revision: 4 });
  expect(h.watch.notices).toEqual({ claude: "doan-figma" });
  // A success of an agent without a running turn has no notice; an older revision is ignored.
  h.send({ ...snapshot({ codex: { "doan-notion": "connecting" } }), revision: 5 });
  h.send({ ...snapshot({ codex: { "doan-notion": "connected" } }, {}, { codex: { lastChanged: "doan-notion", generation: 1 } }), revision: 6 });
  h.send({ ...snapshot({}), revision: 1 });
  expect(h.watch.snapshot?.revision).toBe(6);
  expect(h.watch.notices).toEqual({ claude: "doan-figma" });
  h.state.running.delete("claude");
  h.watch.runningChanged();
  expect(h.watch.notices).toEqual({});
  expect(h.toast).not.toHaveBeenCalled();
});

test("a connection that fails while MCP Connectors isn't shown is told by a toast that opens the category; a cancel is not", () => {
  const h = watchHarness();
  h.send({ ...snapshot({ codex: { "doan-notion": "connecting", "doan-figma": "connecting" } }), revision: 1 });
  h.send({ ...snapshot({ codex: { "doan-notion": "not_connected" } }), revision: 2 });
  expect(h.toast).not.toHaveBeenCalled();
  h.send({ ...snapshot({ codex: { "doan-figma": ["not_connected", { failure: "approval_timeout" }] } }), revision: 3 });
  expect(h.toast).toHaveBeenCalledWith("Codex couldn’t connect to Figma.", "Open MCP Connectors", expect.any(Function));
  (h.toast.mock.calls[0]![2] as () => void)();
  expect(h.open).toHaveBeenCalledTimes(1);
  // On the page itself the row's alert tells it.
  h.state.shown = true;
  h.send({ ...snapshot({ codex: { "doan-figma": "connecting" } }), revision: 4 });
  h.send({ ...snapshot({ codex: { "doan-figma": ["not_connected", { failure: "failed" }] } }), revision: 5 });
  expect(h.toast).toHaveBeenCalledTimes(1);
});

test("announcements carry a sequence so a page opened later reads only newer ones", () => {
  const h = watchHarness();
  h.send({ ...snapshot({ codex: { "doan-notion": "connecting" } }), revision: 1 });
  h.send({ ...snapshot({ codex: { "doan-notion": "connected" } }, {}, { codex: { lastChanged: "doan-notion", generation: 1 } }), revision: 2 });
  expect(h.watch.announcement).toEqual({ seq: 1, text: "Notion connected for Codex" });
  h.stop();
});

// BU review Y3 (.scratch/review-bu/view.test.ts): the Remove in progress and its own failure win over an earlier Connect failure.
test("Removing disables the Retry an earlier Connect failure left, which stays until the next Connect, Retry or Cancel", () => {
  const view = mcpPageView(snapshot({ codex: { [URL_SERVER.name]: ["removing", { failure: "failed" }] }, claude: { [URL_SERVER.name]: "removing" } }), AUTH, () => "connect");
  const codex = find(view, "codex", URL_SERVER.name), claude = find(view, "claude", URL_SERVER.name);
  expect(codex).toMatchObject({ status: "Removing", button: null, notice: { body: "Codex couldn’t connect to mcp.example.com. Check your connection and try again." } });
  expect(codex.notice!.actions.every(action => action.disabled)).toBe(true);
  expect(claude).toMatchObject({ status: "Removing", notice: null, button: { disabled: true } });
});

test("a Remove failure shows its own alert and Retry Remove in every section, over an earlier Connect failure", () => {
  const view = mcpPageView(snapshot({ codex: { [URL_SERVER.name]: ["not_connected", { failure: "failed" }] } }, { servers: [...PRESET_SERVERS, { ...URL_SERVER, removeFailed: true }] }), AUTH);
  for (const provider of ["claude", "codex"] as const) expect(find(view, provider, URL_SERVER.name).notice).toMatchObject({
    body: "Couldn’t remove mcp.example.com from Doan’s agents. Try again.", actions: [{ command: "remove", label: "Retry", disabled: false }] });
});

// BU review Y5: later changes are read, a first Checking result and a cancel are not.
test("a later change to Connected or Not connected is read, also without an attempt; the first Checking result is not", () => {
  const text = (before: Parameters<typeof snapshot>[0], after: Parameters<typeof snapshot>[0]) => mcpChanges(snapshot(before), snapshot(after)).map(mcpChangeText).filter(Boolean);
  expect(text({ codex: { "doan-notion": "check_failed" } }, { codex: { "doan-notion": "connected" } })).toEqual(["Notion connected for Codex"]);
  expect(text({ codex: { "doan-notion": "connected" } }, { codex: { "doan-notion": "not_connected" } })).toEqual(["Notion disconnected for Codex"]);
  expect(text({ codex: { "doan-notion": "reconnect_needed" } }, { codex: { "doan-notion": "connected" } })).toEqual(["Notion connected for Codex"]);
  expect(text({ codex: { "doan-notion": "checking" } }, { codex: { "doan-notion": "connected" } })).toEqual([]);
  expect(text({ codex: { "doan-notion": "checking" } }, { codex: { "doan-notion": "check_failed" } })).toEqual([]);
  expect(text({ codex: { "doan-notion": "connecting" } }, { codex: { "doan-notion": "not_connected" } })).toEqual([]);
  expect(text({ codex: { "doan-notion": "removing" } }, { codex: { "doan-notion": "not_connected" } })).toEqual([]);
});

// review C1: the unverified cause gets its own header.
test("an agent whose connection Doan hasn't checked yet says so in its header", () => {
  const view = mcpPageView(snapshot({}), auth(true, true, { codex: status("codex", true, { ready: false, cause: "unverified", action: "retry" }) }));
  expect(view.sections[1]!.header?.reason).toBe("Doan hasn’t checked Codex’s connection yet. Check it in Agents to connect or disconnect its servers.");
});

test("the watch reads two identical messages as two announcements", () => {
  const h = watchHarness();
  h.send({ ...snapshot({ codex: { "doan-notion": "connecting" } }), revision: 1 });
  h.send({ ...snapshot({ codex: { "doan-notion": ["not_connected", { failure: "failed" }] } }), revision: 2 });
  h.send({ ...snapshot({ codex: { "doan-notion": "connecting" } }), revision: 3 });
  h.send({ ...snapshot({ codex: { "doan-notion": ["not_connected", { failure: "failed" }] } }), revision: 4 });
  expect(h.watch.announcement).toEqual({ seq: 2, text: "Codex couldn’t connect to Notion" });
});
