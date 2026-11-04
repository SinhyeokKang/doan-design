import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { AuthStatusDto } from "../main/agentAuth/types";
import type { McpAddReply, McpFailure, McpRowDto, McpServerDto, McpSnapshot } from "../main/mcpConnectors/service";
import type { ConnectorAction, ConnectorStatus } from "../main/mcpConnectors/state";
import { MCP_PROVIDERS, type McpProvider } from "../main/mcpConnectors/presets";
import { PROVIDER_NAMES, type Button, type Notice } from "./agentAuthView";

// Settings > MCP Connectors (mcp-connectors design 'renderer'): main's snapshot and agent-auth as the page draws them.
// States come from main (service.ts, state.ts connectorState), never re-judged here; this only words them. Rows reuse
// the first-run Agent step's provider row and Settings > Agents' notices and copy forms.

export type McpCommand = "connect" | "disconnect" | "cancel" | "openLink" | "check" | "remove";
// tooltip: why an aria-disabled button can't act now; it stays focusable so the reason can be read.
export type McpButton = Button<McpCommand> & { tooltip?: string };
export interface McpRowView {
  provider: McpProvider; name: string; label: string;
  // url: a URL server's full address under its status line; presets show none. logo: a preset's local mark.
  url: string | null; logo: string | null;
  group: string; status: string;
  button: McpButton | null; helper: string | null; notice: Notice<McpCommand> | null;
  // A URL server's … menu (Remove); disabled while the server is being removed. removeDisabled: an agent connects it.
  menu: { label: string; disabled: boolean; removeDisabled: boolean } | null;
}
export interface McpSectionView { provider: McpProvider; title: string; header: { reason: string; action: Button<"openAgents"> } | null; rows: McpRowView[] }
export interface McpPageView { notice: Notice<never> | null; addDisabled: boolean; sections: McpSectionView[] }

// Local copies of the draft's marks; sources are in public/mcp-logos/README.md. Relative, as the provider marks.
const LOGOS: Record<string, string> = { "doan-notion": "mcp-logos/notion.png", "doan-atlassian": "mcp-logos/atlassian.svg", "doan-figma": "mcp-logos/figma.svg" };
const STATUS: Record<ConnectorStatus, string> = {
  checking: "Checking", not_connected: "Not connected", connecting: "Connecting", connected: "Connected",
  disconnecting: "Disconnecting", removing: "Removing", reconnect_needed: "Reconnect needed", check_failed: "Couldn’t check",
};
export const BLOCKED_LINE = "Doan is still disconnecting the previous account. Try again later.";
// URL servers are one list for every agent, so what happens to one is said for both (spec 2 '읽어 주기').
const BOTH = "Claude Code and Codex";
export const MCP_HIDDEN_ANNOUNCEMENT = "MCP Connectors is available while Claude Code or Codex is signed in.";

// null: agent-auth not read yet. An unreadable account store (null) has nobody signed in.
export function mcpAvailable(auth: AuthSnapshot | null | undefined): boolean | null {
  if (auth === undefined) return null;
  return (auth?.providers ?? []).some(status => MCP_PROVIDERS.includes(status.provider as McpProvider) && status.account !== null);
}

function button(command: McpCommand, label: string, variant: Button["variant"], ariaLabel: string, disabled = false): McpButton {
  return { command, label, variant, disabled, ariaLabel };
}
const alert = (body: string, actions: McpButton[]): Notice<McpCommand> => ({ role: "alert", spinner: false, body, actions });

export function mcpFailureText(failure: McpFailure, provider: McpProvider, label: string): string {
  const agent = PROVIDER_NAMES[provider];
  switch (failure) {
    case "busy": return `${agent} is busy signing in or out. Try again in a moment.`;
    case "not_ready": return `${agent} can’t run right now. Check it in Agents, then try again.`;
    case "pending_logout": return BLOCKED_LINE;
    case "no_link": return `${agent} didn’t send a sign-in link. If a browser is set in ${agent}’s settings, remove it, then try again.`;
    case "approval_timeout": return `${agent} stopped waiting for ${label} to allow access. Try again, and allow access in the browser tab that opens.`;
    case "storage_failed": return `Couldn’t save this connection securely. Allow ${agent} to use your Keychain, then try again.`;
    case "disconnect_failed": return `Couldn’t disconnect ${label} from ${agent}. Try again.`;
    case "failed": return `${agent} couldn’t connect to ${label}. Check your connection and try again.`;
  }
}

// Why the section's buttons are off while the agent is signed in but can't run (draft frame 2 tile).
function headerReason(status: AuthStatusDto | undefined): string | null {
  if (!status || status.readiness.ready || status.readiness.cause === "busy") return null;
  const agent = PROVIDER_NAMES[status.provider], cause = status.readiness.cause;
  if (cause === "reauth_required" && status.phase === "reauthRequired") return `${agent}’s sign-in expired. Sign in again to connect or disconnect its servers.`;
  if (cause === "version_unsupported" || cause === "version_incompatible") return `${agent} needs an update. Update it to connect or disconnect its servers.`;
  if (cause === "unverified") return `Doan hasn’t checked ${agent}’s connection yet. Check it in Agents to connect or disconnect its servers.`;
  return `${agent} can’t run right now. Check it in Agents to connect or disconnect its servers.`;
}

// Why a busy section's Connect waits: the one attempt the agent runs.
function busyReason(rows: readonly McpRowDto[], labels: ReadonlyMap<string, string>): string {
  const running = rows.find(row => row.view.status === "connecting" || row.view.status === "disconnecting" || row.view.status === "removing");
  const label = running ? labels.get(running.name) ?? running.name : "other";
  if (running?.view.status === "disconnecting") return `Wait until ${label} is disconnected.`;
  if (running?.view.status === "removing") return `Wait until ${label} is removed.`;
  return `Finish or cancel the ${label} connection first.`;
}

function rowView(provider: McpProvider, server: McpServerDto, row: McpRowDto, busy: string, remembered: ConnectorAction | null): McpRowView {
  const agent = PROVIDER_NAMES[provider], label = server.label, of = `${label} for ${agent}`, { view } = row;
  const off = view.disabled !== null;
  const settled = (action: ConnectorAction | null, disabled: boolean): McpButton | null => {
    if (action === "connect") return button("connect", "Connect", "prominent", `Connect ${of}`, disabled);
    if (action === "reconnect") return button("connect", "Reconnect", "prominent", `Reconnect ${of}`, disabled);
    if (action === "disconnect") return button("disconnect", "Disconnect", "subtle", `Disconnect ${of}`, disabled);
    return null;
  };
  let rowButton: McpButton | null = null, notice: Notice<McpCommand> | null = null, helper: string | null = null;
  switch (view.status) {
    case "checking": rowButton = settled("connect", true); break;
    case "disconnecting": rowButton = settled("disconnect", true); break;
    case "removing": rowButton = settled(remembered ?? "connect", true); break;
    case "connecting": {
      const cancel = button("cancel", "Cancel", "subtle", `Cancel connecting ${of}`);
      notice = provider === "claude"
        ? { role: "status", spinner: true, title: `Finish connecting to ${label}`, body: `Allow access to ${label} in your browser, then return here.`, actions: [cancel, button("openLink", "Open again", "subtle", `Open ${label}’s sign-in again for ${agent}`, !row.link)] }
        // Codex opens the default browser itself; Doan has no link to open again (POSTMORTEM 2026-10-30).
        : { role: "status", spinner: true, title: `Finish connecting to ${label}`, body: `Codex opened your default browser. Allow access to ${label} there, then return here.`, actions: [cancel] };
      break;
    }
    case "check_failed":
      if (view.action === "retry") notice = alert("The status check failed or took too long. Try again.", [button("check", "Retry", "prominent", `Check ${of} again`, off)]);
      else rowButton = settled(view.action, off);
      break;
    default: rowButton = settled(view.action, off);
  }
  if (view.status === "reconnect_needed" && !view.blocked) helper = `${agent} was connected to ${label} before, and that access has ended. Reconnect to use it again.`;
  if (view.blocked) helper = BLOCKED_LINE;
  // A failed Remove shows its own alert over an earlier Connect failure; while a Remove runs, an earlier failure's alert
  // stays (it lasts until the row's next Connect, Retry or Cancel, spec 3) with its Retry disabled (BU review Y3).
  if (server.removeFailed && view.status !== "removing") notice = alert(`Couldn’t remove ${label} from Doan’s agents. Try again.`, [button("remove", "Retry", "prominent", `Retry removing ${label} from ${BOTH}`)]);
  // A failed attempt keeps the row it returned to and puts the reason and Retry in place of the row's button.
  else if (row.failure) {
    rowButton = null;
    const retry = row.failure === "disconnect_failed" ? "disconnect" : "connect";
    notice = alert(mcpFailureText(row.failure, provider, label), [button(retry, "Retry", "prominent", `Retry ${of}`, off || view.status === "removing")]);
  }
  if (rowButton && view.disabled === "busy") rowButton = { ...rowButton, tooltip: busy };
  return {
    provider, name: server.name, label, url: server.preset ? null : server.url, logo: LOGOS[server.name] ?? null, group: of,
    status: STATUS[view.status], button: rowButton, helper, notice,
    menu: server.preset ? null : { label: `${label} menu for ${agent}`, disabled: view.status === "removing", removeDisabled: !server.removable },
  };
}

// remembered: the action a row offered before it started Removing, which it keeps disabled meanwhile (draft frame 7).
export function mcpPageView(snapshot: McpSnapshot | null, auth: AuthSnapshot | null | undefined, remembered: (provider: McpProvider, name: string) => ConnectorAction | null = () => null): McpPageView {
  if (!snapshot) return { notice: null, addDisabled: true, sections: [] };
  const labels = new Map(snapshot.servers.map(server => [server.name, server.label]));
  const sections = MCP_PROVIDERS.flatMap(provider => {
    const status = auth?.providers.find(item => item.provider === provider);
    const dto = snapshot.providers.find(item => item.provider === provider);
    if (!status || status.account === null || !dto) return [];
    const reason = headerReason(status), busy = busyReason(dto.rows, labels);
    const rows = snapshot.servers.flatMap(server => {
      const row = dto.rows.find(item => item.name === server.name);
      return row ? [rowView(provider, server, row, busy, remembered(provider, server.name))] : [];
    });
    const header = reason ? { reason, action: { command: "openAgents" as const, label: "Open Agents settings", variant: "prominent" as const, disabled: false, ariaLabel: `Open Agents settings for ${PROVIDER_NAMES[provider]}` } } : null;
    return [{ provider, title: PROVIDER_NAMES[provider], header, rows }];
  });
  // The Settings storage notice form: an unreadable file is not read as empty, and a newer one is never written.
  const notice: Notice<never> | null = snapshot.file === "broken"
    ? { role: "alert", spinner: false, body: "Doan couldn’t read its saved servers, so you can’t add or remove servers by URL.", actions: [] }
    : snapshot.file === "newer" ? { role: "status", spinner: false, title: "These servers were saved by a newer version of Doan", body: "You can’t add or remove servers by URL here. Update Doan to change them.", actions: [] } : null;
  return { notice, addDisabled: snapshot.file !== "ok", sections };
}

export function addError(reply: McpAddReply): string | null {
  if (reply.ok) return null;
  switch (reply.reason) {
    case "duplicate": return `Already added as ${reply.name ?? "another server"}.`;
    case "empty": return "Enter the server’s URL.";
    case "too_long": return "This URL is too long.";
    case "not_https": return "Enter a URL that starts with https://.";
    case "credentials": return "Remove the user name and password from the URL.";
    case "fragment": return "Remove the part after # from the URL.";
    case "file_unreadable": return "Doan couldn’t read its saved servers, so it can’t add this one.";
    case "write_failed": return "Couldn’t save this server. Try again.";
    default: return "Enter a valid URL, such as https://mcp.example.com/mcp.";
  }
}

// Where focus goes after a Remove: the next item in the section, else the previous one.
export function removeFocus(names: readonly string[], removed: string): string | null {
  const at = names.indexOf(removed);
  if (at === -1) return null;
  return names[at + 1] ?? names[at - 1] ?? null;
}

// What changed between two snapshots that the page reads aloud, a toast tells or a notice follows (spec 2 '읽어 주기',
// 4, 10). A status settling from Checking is not a change; a success is told by its generation, not by a missing
// failure, so a cancel says nothing.
export type McpChange =
  | { kind: "connected" | "disconnected" | "failed" | "disconnectFailed" | "reconnectNeeded" | "checkFailed" | "succeeded"; provider: McpProvider; name: string; label: string }
  | { kind: "added" | "removed" | "removeFailed"; name: string; label: string };

export function mcpChanges(prev: McpSnapshot | null, next: McpSnapshot): McpChange[] {
  if (!prev) return [];
  const changes: McpChange[] = [];
  const label = (name: string) => next.servers.find(server => server.name === name)?.label ?? prev.servers.find(server => server.name === name)?.label ?? name;
  for (const dto of next.providers) {
    const { provider } = dto, before = prev.providers.find(item => item.provider === provider);
    if (!before) continue;
    const succeeded = dto.generation > before.generation ? dto.lastChanged : null;
    if (succeeded) changes.push({ kind: "succeeded", provider, name: succeeded, label: label(succeeded) });
    for (const row of dto.rows) {
      const old = before.rows.find(item => item.name === row.name);
      if (!old) continue;
      const was = old.view.status, now = row.view.status, change = (kind: Exclude<McpChange["kind"], "added" | "removed" | "removeFailed">) => changes.push({ kind, provider, name: row.name, label: label(row.name) });
      if (row.failure && row.failure !== old.failure) change(row.failure === "disconnect_failed" ? "disconnectFailed" : "failed");
      else if (succeeded === row.name && was === "connecting") change("connected");
      else if (succeeded === row.name && was === "disconnecting") change("disconnected");
      // An attempt that ended without a success was cancelled or failed (told by its failure); a first Checking result
      // is not read (spec 2 '읽어 주기').
      else if (was === "checking" || was === now || ["connecting", "disconnecting", "removing"].includes(was)) continue;
      else if (now === "connected") change("connected");
      else if (now === "not_connected" && was === "connected") change("disconnected");
      else if (now === "reconnect_needed") change("reconnectNeeded");
      else if (now === "check_failed") change("checkFailed");
    }
  }
  for (const server of next.servers) {
    const old = prev.servers.find(item => item.name === server.name);
    if (!old) changes.push({ kind: "added", name: server.name, label: server.label });
    else if (server.removeFailed && !old.removeFailed) changes.push({ kind: "removeFailed", name: server.name, label: server.label });
  }
  // A newer file hides URL servers; they are not removed.
  if (next.file !== "newer") for (const server of prev.servers) if (!next.servers.some(item => item.name === server.name)) changes.push({ kind: "removed", name: server.name, label: server.label });
  return changes;
}

export function mcpChangeText(change: McpChange): string | null {
  const agent = "provider" in change ? PROVIDER_NAMES[change.provider] : "";
  switch (change.kind) {
    case "connected": return `${change.label} connected for ${agent}`;
    case "disconnected": return `${change.label} disconnected for ${agent}`;
    case "failed": return `${agent} couldn’t connect to ${change.label}`;
    case "disconnectFailed": return `Couldn’t disconnect ${change.label} from ${agent}`;
    case "reconnectNeeded": return `${change.label} needs reconnecting for ${agent}`;
    case "checkFailed": return `Couldn’t check ${change.label} for ${agent}`;
    case "added": return `${change.label} added for ${BOTH}`;
    case "removed": return `${change.label} removed from ${BOTH}`;
    case "removeFailed": return `Couldn’t remove ${change.label} from ${BOTH}`;
    case "succeeded": return null;
  }
}

export function runningNoticeText(provider: McpProvider): string {
  return `Applies from ${PROVIDER_NAMES[provider]}’s next turn. The running turn keeps its current tools.`;
}
