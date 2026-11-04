import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DropdownMenu } from "radix-ui";
import { Ellipsis, Plus, Server } from "lucide-react";
import type { McpSnapshot } from "../main/mcpConnectors/service";
import type { McpProvider } from "../main/mcpConnectors/presets";
import type { AgentSignIn } from "./agentSignIn";
import { AlertIcon } from "./AlertIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { providerLogo } from "./homeComposer";
import { addError, mcpPageView, removeFocus, type McpButton, type McpCommand, type McpRowView } from "./mcpConnectorsView";
import type { McpConnectorsWatch } from "./mcpConnectorsWatch";
import { dialogKeys, NoticeView, openModal } from "./Onboarding";

export interface SettingsMcpConnectorsProps {
  // App's reader of main's snapshots: attempts and their notices outlive this page.
  watch: McpConnectorsWatch;
  signIn: Pick<AgentSignIn, "state" | "subscribe">;
  // The URL dialog and the Remove alert own the page until they close (as Settings > Agents' stop dialog).
  onLock(locked: boolean): void;
  openAgents(provider: McpProvider): void;
  // The page header's actions slot, where Add server by URL sits.
  actions: HTMLElement | null;
}
type Dialog = { kind: "add"; value: string; error: string | null; busy: boolean } | { kind: "remove"; provider: McpProvider; name: string; label: string };

const rowKey = (provider: McpProvider, name: string) => `${provider}:${name}`;
const rowGroup = (provider: McpProvider, name: string) => document.querySelector<HTMLElement>(`[data-mcp-row="${rowKey(provider, name)}"]`);
// A control that can't act: gone, natively disabled, or aria-disabled (a busy section's Connect keeps focus that way).
const unusable = (node: HTMLElement) => !node.isConnected || node.matches(":disabled") || node.getAttribute?.("aria-disabled") === "true";
const snapshotReply = (value: unknown): value is McpSnapshot => typeof value === "object" && value !== null && "revision" in value;

// Settings > MCP Connectors (mcp-connectors spec 2–4, 8, 10; draft frames 1–9): one section per signed-in agent,
// listing the presets and the URL servers as the first-run Agent step's provider rows. Focus follows Settings > Agents'
// rule (a control that goes away or is disabled hands focus to its row group) and the page has one live region.
export function SettingsMcpConnectors({ watch, signIn, onLock, openAgents, actions }: SettingsMcpConnectorsProps) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [dialog, setDialogState] = useState<Dialog | null>(null);
  const current = useRef<Dialog | null>(dialog);
  current.current = dialog;
  const live = useRef({ onLock });
  live.current = { onLock };
  const locked = useRef(false);
  // Reported as the dialog changes, not after a render: a move between the two must already see the lock.
  const setDialog = (next: Dialog | null) => {
    current.current = next;
    setDialogState(next);
    if ((next !== null) !== locked.current) { locked.current = next !== null; live.current.onLock(locked.current); }
    redraw();
  };
  // Announcements made before the page opened are not read again.
  const since = useRef<number | null>(null);
  if (since.current === null) since.current = watch.announcementSeq();
  useEffect(() => {
    const offWatch = watch.subscribe(redraw), offAuth = signIn.subscribe(redraw);
    // Status commands use the network, so they run on entering the page, never on a timer (design '상태 판정').
    void window.doan.readMcpConnectors({ refresh: true }).then(reply => { if (snapshotReply(reply)) watch.receive(reply); }, () => {});
    return () => {
      offWatch(); offAuth();
      if (locked.current) { locked.current = false; live.current.onLock(false); }
    };
  }, []);

  const view = mcpPageView(watch.snapshot, signIn.state.auth, (provider, name) => watch.remembered(provider, name));

  // The row control focus is on, entered by keyboard or used: when it goes away or becomes disabled (natively or by
  // aria-disabled), its row group takes focus. wasUnusable: it was already off when focused, so only a removal moves it.
  const focusWatch = useRef<{ provider: McpProvider; name: string; node: HTMLElement; wasUnusable: boolean } | null>(null);
  const watchFocus = (row: McpRowView, node: HTMLElement) => { focusWatch.current = { provider: row.provider, name: row.name, node, wasUnusable: unusable(node) }; };
  // Focus that waits for a snapshot: the new item after Add, the next item after Remove.
  const pending = useRef<{ kind: "added"; name: string } | { kind: "removed"; provider: McpProvider; name: string; names: string[] } | null>(null);
  useEffect(() => {
    const waiting = pending.current;
    if (waiting?.kind === "added") {
      const first = view.sections[0];
      if (first?.rows.some(row => row.name === waiting.name)) {
        pending.current = null;
        requestAnimationFrame(() => { const group = rowGroup(first.provider, waiting.name); group?.scrollIntoView({ block: "nearest" }); group?.focus(); });
      }
    } else if (waiting?.kind === "removed") {
      const server = watch.snapshot?.servers.find(item => item.name === waiting.name);
      if (!server) {
        pending.current = null; focusWatch.current = null;
        const target = removeFocus(waiting.names, waiting.name);
        if (target) requestAnimationFrame(() => rowGroup(waiting.provider, target)?.focus());
      } else if (server.removeFailed) pending.current = null;
    }
    const watched = focusWatch.current;
    if (!watched || current.current) return;
    requestAnimationFrame(() => {
      if (focusWatch.current !== watched) return;
      const active = document.activeElement === document.body ? null : document.activeElement as HTMLElement | null;
      // Focus the person moved elsewhere is theirs.
      if (active !== null && active !== watched.node) { focusWatch.current = null; return; }
      const node = watched.node, lost = !node.isConnected || (unusable(node) && !watched.wasUnusable);
      if (!lost) {
        if (active === null) focusWatch.current = null;
        else watched.wasUnusable = unusable(node);
        return;
      }
      const group = rowGroup(watched.provider, watched.name);
      if (!group) return;
      group.focus();
      focusWatch.current = { ...watched, node: group, wasUnusable: false };
    });
  });

  const run = (row: McpRowView) => (command: McpCommand) => {
    const active = document.activeElement;
    if (active && active !== document.body) watchFocus(row, active as HTMLElement);
    const api = window.doan;
    switch (command) {
      case "connect": void api.connectMcpServer(row.provider, row.name); break;
      case "disconnect": void api.disconnectMcpServer(row.provider, row.name); break;
      case "cancel": void api.cancelMcpConnect(row.provider, row.name); break;
      case "openLink": void api.openMcpLink(row.provider, row.name); break;
      case "check": void api.readMcpConnectors({ refresh: true }).then(reply => { if (snapshotReply(reply)) watch.receive(reply); }, () => {}); break;
      case "remove": startRemove(row); break;
    }
  };
  const startRemove = (row: McpRowView) => {
    const names = view.sections.find(section => section.provider === row.provider)?.rows.map(item => item.name) ?? [];
    pending.current = { kind: "removed", provider: row.provider, name: row.name, names };
    void window.doan.removeMcpServer(row.name);
  };

  const openAdd = () => setDialog({ kind: "add", value: "", error: null, busy: false });
  const closeAdd = () => { setDialog(null); requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-mcp-add]")?.focus()); };
  const submitAdd = async () => {
    const open = current.current;
    if (open?.kind !== "add" || open.busy || !open.value.trim()) return;
    setDialog({ ...open, busy: true });
    const reply = await window.doan.addMcpServer(open.value).catch(() => ({ ok: false as const, reason: "write_failed" as const }));
    if (current.current?.kind !== "add") return;
    if (reply.ok) { pending.current = { kind: "added", name: reply.name }; setDialog(null); return; }
    setDialog({ kind: "add", value: open.value, error: addError(reply), busy: false });
  };
  // Remove asks first; the alert opens a frame later so the closing menu's focus return does not land after it.
  const askRemove = (row: McpRowView) => requestAnimationFrame(() => setDialog({ kind: "remove", provider: row.provider, name: row.name, label: row.label }));
  const closeRemove = () => {
    const open = current.current;
    setDialog(null);
    if (open?.kind === "remove") requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-mcp-more="${rowKey(open.provider, open.name)}"]`)?.focus());
  };
  const confirmRemove = () => {
    const open = current.current;
    if (open?.kind !== "remove") return;
    setDialog(null);
    const row = view.sections.find(section => section.provider === open.provider)?.rows.find(item => item.name === open.name);
    if (!row) return;
    // The … button is disabled while the server is removed, so its row group holds focus meanwhile.
    requestAnimationFrame(() => {
      const group = rowGroup(open.provider, open.name);
      group?.focus();
      if (group) focusWatch.current = { provider: open.provider, name: open.name, node: group, wasUnusable: false };
    });
    startRemove(row);
  };

  // The page live region is the only announcement channel (spec 2): notices keep their look without live roles. Every
  // other announcement ends in a zero-width space, so a message repeated word for word still changes the region.
  const announcement = watch.announcement && watch.announcement.seq > since.current ? watch.announcement : null;
  const announced = announcement ? `${announcement.text}${announcement.seq % 2 === 0 ? "\u200b" : ""}` : "";
  return <>
    {actions && createPortal(<button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" data-mcp-add="" disabled={view.addDisabled} onClick={openAdd}>
      <Plus aria-hidden="true" />Add server by URL</button>, actions)}
    {view.notice && <div className="settings-notice"><NoticeView notice={view.notice} run={() => {}} live={false} /></div>}
    {view.sections.map(section => {
      const titleId = `mcp-agent-${section.provider}`;
      const noticeAt = watch.notices[section.provider];
      const orphan = noticeAt !== undefined && !section.rows.some(row => row.name === noticeAt);
      return <section key={section.provider} className="settings-section mcp-agent" role="group" aria-labelledby={titleId}>
        <div className="settings-section-header">
          <div className="settings-header-copy">
            <h2 className="settings-section-title mcp-agent-title" id={titleId}><img className="logo" src={providerLogo(section.provider)} alt="" />{section.title}</h2>
            {section.header && <p className="settings-section-description">{section.header.reason}</p>}
          </div>
          {section.header && <div className="settings-header-actions"><button type="button" className="doan-button" data-ui-variant={section.header.action.variant} data-ui-size="sm"
            aria-label={section.header.action.ariaLabel} onClick={() => openAgents(section.provider)}>{section.header.action.label}</button></div>}
        </div>
        <div className="doan-panel ob-provider-list">
          {section.rows.map(row => <McpRow key={row.name} row={row} run={run(row)} askRemove={() => askRemove(row)} focused={node => watchFocus(row, node)}
            runningNotice={noticeAt === row.name ? watch.noticeText(section.provider) : null} />)}
        </div>
        {/* A removed server's notice stays in its section, under the list it left. */}
        {orphan && <div className="mcp-section-notice"><NoticeView notice={{ role: "status", spinner: false, body: watch.noticeText(section.provider), actions: [] }} run={() => {}} live={false} /></div>}
      </section>;
    })}
    <p className="ob-live" role="status">{announced}</p>
    {dialog?.kind === "add" && <AddServerDialog dialog={dialog} change={value => setDialog({ ...dialog, value, error: null })} submit={() => void submitAdd()} close={closeAdd} />}
    {dialog?.kind === "remove" && <RemoveAlert label={dialog.label} confirm={confirmRemove} close={closeRemove} />}
  </>;
}

function RowButton({ button, run, describedBy }: { button: McpButton; run: (command: McpCommand) => void; describedBy: string }) {
  const element = <button type="button" className="doan-button" data-ui-variant={button.variant} data-ui-size="sm" data-command={button.command} aria-label={button.ariaLabel}
    disabled={button.disabled && !button.tooltip}
    // A busy section's button keeps focus and hover so its tooltip can say why it waits (ConversationDeleteItem's rule).
    {...(button.tooltip ? { "aria-disabled": true, "data-disabled": "", "aria-describedby": describedBy } : {})}
    onClick={() => { if (!button.tooltip && !button.disabled) run(button.command); }}>{button.label}</button>;
  if (!button.tooltip) return element;
  return <>
    <Tooltip><TooltipTrigger asChild>{element}</TooltipTrigger><TooltipContent>{button.tooltip}</TooltipContent></Tooltip>
    <span className="sr-only" id={describedBy}>{button.tooltip}</span>
  </>;
}

function McpRow({ row, run, askRemove, focused, runningNotice }: { row: McpRowView; run: (command: McpCommand) => void; askRemove(): void; focused(node: HTMLElement): void; runningNotice: string | null }) {
  const key = rowKey(row.provider, row.name);
  return <div className="ob-provider" role="group" tabIndex={-1} aria-label={row.group} data-mcp-row={key} onFocus={event => focused(event.target)}>
    <div className="ob-provider-row">
      <span className="ob-provider-mark" aria-hidden="true">{row.logo ? <img src={row.logo} alt="" /> : <Server className="mcp-generic-mark" />}</span>
      <div className="ob-provider-label"><strong>{row.label}</strong><span>{row.status}</span>{row.url && <span className="mcp-url">{row.url}</span>}</div>
      {row.button && <RowButton button={row.button} run={run} describedBy={`mcp-busy-${row.provider}-${row.name}`} />}
      {row.menu && <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild disabled={row.menu.disabled}><button type="button" className="doan-icon-button mcp-more" aria-label={row.menu.label} data-mcp-more={key} disabled={row.menu.disabled}>
          <Ellipsis aria-hidden="true" /></button></DropdownMenu.Trigger>
        <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu" aria-label={row.label} side="bottom" align="end" sideOffset={4} collisionPadding={8}>
          <DropdownMenu.Item className="doan-menu-item" data-mcp-remove={key} disabled={row.menu.removeDisabled} onSelect={askRemove}>Remove</DropdownMenu.Item>
        </DropdownMenu.Content></DropdownMenu.Portal>
      </DropdownMenu.Root>}
    </div>
    {row.helper && <p className="ob-provider-help">{row.helper}</p>}
    {row.notice && <NoticeView notice={row.notice} run={run} live={false} />}
    {runningNotice && <NoticeView notice={{ role: "status", spinner: false, body: runningNotice, actions: [] }} run={() => {}} live={false} />}
  </div>;
}

function AddServerDialog({ dialog, change, submit, close }: { dialog: Extract<Dialog, { kind: "add" }>; change(value: string): void; submit(): void; close(): void }) {
  return <dialog className="doan-dialog" data-ui-size="compact" aria-labelledby="mcp-add-title" aria-busy={dialog.busy || undefined} ref={openModal}
    onCancel={event => { event.preventDefault(); close(); }} onKeyDown={dialogKeys(close)}>
    <form className="ob-dialog-form" onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="mcp-add-title">Add server by URL</h3>
        <p className="doan-dialog-description">Enter the address of a remote MCP server. It must start with https://.</p></div></div>
      <input className="doan-input" aria-label="Server URL" placeholder="https://mcp.example.com/mcp" value={dialog.value} autoFocus
        aria-invalid={dialog.error ? true : undefined} aria-describedby={dialog.error ? "mcp-add-error" : undefined} onChange={event => change(event.target.value)} />
      {dialog.error && <p className="settings-msg error mcp-field-error" role="alert" id="mcp-add-error"><AlertIcon /><span>{dialog.error}</span></p>}
      <div className="doan-dialog-actions">
        <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={close}>Cancel</button>
        <button type="submit" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled={!dialog.value.trim() || dialog.busy}>Add</button>
      </div>
    </form>
  </dialog>;
}

// Remove can't be undone, so it asks first (spec 8); Cancel is focused, Escape cancels.
function RemoveAlert({ label, confirm, close }: { label: string; confirm(): void; close(): void }) {
  return <dialog className="doan-dialog" data-ui-size="compact" role="alertdialog" aria-labelledby="mcp-remove-title" aria-describedby="mcp-remove-body" ref={openModal}
    onCancel={event => { event.preventDefault(); close(); }} onKeyDown={dialogKeys(close)}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="mcp-remove-title">{`Remove ${label} from Doan’s agents?`}</h3>
      <p className="doan-dialog-description" id="mcp-remove-body">Claude Code and Codex disconnect from it. Your terminal setup is not changed.</p></div></div>
    <div className="doan-dialog-actions">
      <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" autoFocus onClick={close}>Cancel</button>
      <button type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" data-consent="" onClick={confirm}>Remove</button>
    </div>
  </dialog>;
}
