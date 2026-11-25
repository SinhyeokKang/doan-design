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
import { addError, mcpPageView, removeFailedText, removeFocus, type McpButton, type McpCommand, type McpRowView } from "./mcpConnectorsView";
import type { McpConnectorsWatch } from "./mcpConnectorsWatch";
import { retryButton, useRetry } from "./ListRetryButton";
import { announcedAgain } from "./listRetry";
import { dialogKeys, NoticeView, openModal } from "./Onboarding";
import { useActivationFocus } from "./activationFocus";

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
// remove: busy while main removes the server; failed once it answered that it could not (the alert stays open).
type Dialog = { kind: "add"; value: string; error: string | null; busy: boolean } | { kind: "remove"; provider: McpProvider; name: string; label: string; busy: boolean; failed: boolean };

const rowKey = (provider: McpProvider, name: string) => `${provider}:${name}`;
const rowGroup = (provider: McpProvider, name: string) => document.querySelector<HTMLElement>(`[data-mcp-row="${rowKey(provider, name)}"]`);
// A control that can't act: gone, natively disabled, or aria-disabled (a busy section's Connect keeps focus that way).
const unusable = (node: HTMLElement) => !node.isConnected || node.matches(":disabled") || node.getAttribute("aria-disabled") === "true";
const snapshotReply = (value: unknown): value is McpSnapshot => typeof value === "object" && value !== null && "revision" in value;

// Settings > MCP Connectors (PRODUCT §5 item 0 'MCP Connectors'). A control that goes away or is disabled hands focus to its row
// group, as in Settings > Agents, and the page has one live region.
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
  // The entry read is the page's only source until main publishes: one that rejects with no snapshot yet shows the read
  // failure with a Retry instead of a blank page. With a snapshot shown, the page stays as it is.
  const [readFailed, setReadFailed] = useState(false);
  const readRetry = useRetry();
  const readEntry = () => window.doan.readMcpConnectors({ refresh: true }).then(reply => { if (snapshotReply(reply)) { watch.receive(reply); setReadFailed(false); } return true; },
    () => { if (watch.snapshot === null) setReadFailed(true); return false; });
  useEffect(() => {
    const offWatch = watch.subscribe(redraw), offAuth = signIn.subscribe(redraw);
    // Status commands use the network, so they run on entering the page, never on a timer.
    void readEntry();
    return () => {
      offWatch(); offAuth();
      current.current = null;
      if (locked.current) { locked.current = false; live.current.onLock(false); }
    };
  }, []);

  const view = mcpPageView(watch.snapshot, signIn.state.auth, (provider, name) => watch.remembered(provider, name), (provider, name) => watch.openFailed(provider, name));

  // The row control focus is on, entered by keyboard or used: when it goes away or becomes disabled (natively or by
  // aria-disabled), its row group takes focus. wasUnusable: it was already off when focused, so only a removal moves it.
  const focusWatch = useRef<{ provider: McpProvider; name: string; node: HTMLElement; wasUnusable: boolean } | null>(null);
  const watchFocus = (row: McpRowView, node: HTMLElement) => { focusWatch.current = { provider: row.provider, name: row.name, node, wasUnusable: unusable(node) }; };
  // Focus that waits for a snapshot: the new item after Add, the next item after Remove. `alert`: the Remove alert waits
  // too; `replied` once main took the request, since a snapshot before that may still carry the last attempt's failure.
  const pending = useRef<{ kind: "added"; name: string } | { kind: "removed"; provider: McpProvider; name: string; names: string[]; alert: boolean; replied: boolean } | null>(null);
  // A Connect finished in the browser lands with the window in the background, so these hand-offs are made again on
  // activation (POSTMORTEM 2026-11-17).
  const handFocus = useActivationFocus();
  useEffect(() => {
    const waiting = pending.current;
    if (waiting?.kind === "added") {
      const first = view.sections[0];
      if (first?.rows.some(row => row.name === waiting.name)) {
        pending.current = null;
        requestAnimationFrame(() => { const group = rowGroup(first.provider, waiting.name); group?.scrollIntoView({ block: "nearest" }); handFocus(() => rowGroup(first.provider, waiting.name)?.focus()); });
      }
    } else if (waiting?.kind === "removed") {
      const server = watch.snapshot?.servers.find(item => item.name === waiting.name);
      if (!server) {
        pending.current = null; focusWatch.current = null;
        if (waiting.alert && current.current?.kind === "remove") setDialog(null);
        const target = removeFocus(waiting.names, waiting.name);
        if (target) requestAnimationFrame(() => handFocus(() => rowGroup(waiting.provider, target)?.focus()));
      } else if (server.removeFailed && (!waiting.alert || waiting.replied)) {
        pending.current = null;
        if (waiting.alert) removeFailed();
      }
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
      handFocus(() => rowGroup(watched.provider, watched.name)?.focus());
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
      case "openLink": void api.openMcpLink(row.provider, row.name).then(reply => watch.openAnswered(row.provider, row.name, !reply.ok && reply.reason === "open_failed"), console.error); break;
      case "check": void api.readMcpConnectors({ refresh: true }).then(reply => { if (snapshotReply(reply)) watch.receive(reply); }, () => {}); break;
      case "remove": startRemove(row); break;
    }
  };
  const startRemove = (row: McpRowView, alert = false) => {
    const names = view.sections.find(section => section.provider === row.provider)?.rows.map(item => item.name) ?? [];
    const waiting = { kind: "removed" as const, provider: row.provider, name: row.name, names, alert, replied: false };
    pending.current = waiting;
    const answered = window.doan.removeMcpServer(row.name);
    if (!alert) { void answered; return; }
    void answered.catch(() => ({ ok: false as const })).then(reply => {
      if (pending.current !== waiting) return;
      if (!reply.ok) { pending.current = null; removeFailed(); return; }
      waiting.replied = true;
      redraw();
    });
  };
  // The open Remove alert's request failed: it stays, with the failure inside it and Remove as the retry.
  const removeFailed = () => { const open = current.current; if (open?.kind === "remove") setDialog({ ...open, busy: false, failed: true }); };

  const openAdd = () => setDialog({ kind: "add", value: "", error: null, busy: false });
  const closeAdd = () => {
    const open = current.current;
    if (open?.kind !== "add" || open.busy) return;
    setDialog(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-mcp-add]")?.focus());
  };
  const submitAdd = async () => {
    const open = current.current;
    if (open?.kind !== "add" || open.busy || !open.value.trim()) return;
    const submission = { ...open, busy: true };
    setDialog(submission);
    const reply = await window.doan.addMcpServer(open.value).catch(() => ({ ok: false as const, reason: "write_failed" as const }));
    if (current.current !== submission) return;
    if (reply.ok) { pending.current = { kind: "added", name: reply.name }; setDialog(null); return; }
    setDialog({ kind: "add", value: open.value, error: addError(reply), busy: false });
  };
  // Remove asks first; the alert opens a frame later so the closing menu's focus return does not land after it.
  const askRemove = (row: McpRowView) => requestAnimationFrame(() => setDialog({ kind: "remove", provider: row.provider, name: row.name, label: row.label, busy: false, failed: false }));
  // Refused while the request is out: cancelling would stop nothing (as conversation Delete's alert).
  const closeRemove = () => {
    const open = current.current;
    if (open?.kind === "remove" && open.busy) return;
    setDialog(null);
    if (open?.kind === "remove") requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-mcp-more="${rowKey(open.provider, open.name)}"]`)?.focus());
  };
  // The alert stays open, busy, until main answers (DESIGN 'Busy action'): the server gone closes it and focus goes to
  // the next item; a failure stays inside it.
  const confirmRemove = () => {
    const open = current.current;
    if (open?.kind !== "remove" || open.busy) return;
    const row = view.sections.find(section => section.provider === open.provider)?.rows.find(item => item.name === open.name);
    if (!row) { setDialog({ ...open, failed: true }); return; }
    setDialog({ ...open, busy: true, failed: false });
    startRemove(row, true);
  };

  // The page live region is the only announcement channel: notices keep their look without live roles. Every other announcement
  // ends in a zero-width space, so a message repeated word for word still changes the region.
  const announcement = watch.announcement && watch.announcement.seq > since.current ? watch.announcement : null;
  const announced = announcement ? `${announcement.text}${announcement.seq % 2 === 0 ? "\u200b" : ""}` : "";
  return <>
    {actions && createPortal(<button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" data-mcp-add="" disabled={view.addDisabled} onClick={openAdd}>
      <Plus aria-hidden="true" />Add server by URL</button>, actions)}
    {readFailed && watch.snapshot === null && <div className="settings-msg-row"><p className="settings-msg error selectable" role="alert"><AlertIcon /><span id="settings-mcp-read-error">{announcedAgain("Couldn’t read the MCP connectors.", readRetry.failures)}</span></p>
      {retryButton({ running: readRetry.running, variant: "subtle", describedBy: "settings-mcp-read-error", onRetry: pressed => readRetry.run(readEntry, pressed) })}</div>}
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
        <div className="doan-settings-group" data-layout="rows">
          {/* The open Remove alert already says its failure, so the row behind it does not say it again. */}
          {section.rows.map(row => <McpRow key={row.name} row={dialog?.kind === "remove" && dialog.failed && dialog.name === row.name ? { ...row, notice: null } : row} run={run(row)} askRemove={() => askRemove(row)} focused={node => watchFocus(row, node)}
            runningNotice={noticeAt === row.name ? watch.noticeText(section.provider) : null} />)}
        </div>
        {/* A removed server's notice stays in its section, under the list it left. */}
        {orphan && <div className="mcp-section-notice"><NoticeView notice={{ role: "status", spinner: false, body: watch.noticeText(section.provider), actions: [] }} run={() => {}} live={false} /></div>}
      </section>;
    })}
    <p className="ob-live" role="status">{announced}</p>
    {dialog?.kind === "add" && <AddServerDialog dialog={dialog} change={value => { if (current.current === dialog && !dialog.busy) setDialog({ ...dialog, value, error: null }); }} submit={() => void submitAdd()} close={closeAdd} />}
    {dialog?.kind === "remove" && <RemoveAlert label={dialog.label} busy={dialog.busy} failed={dialog.failed} confirm={confirmRemove} close={closeRemove} />}
  </>;
}

export function RowButton({ button, run, describedBy }: { button: McpButton; run: (command: McpCommand) => void; describedBy: string }) {
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

export function McpRow({ row, run, askRemove, focused, runningNotice }: { row: McpRowView; run: (command: McpCommand) => void; askRemove(): void; focused(node: HTMLElement): void; runningNotice: string | null }) {
  const key = rowKey(row.provider, row.name);
  // Settings' shared preference row, as Settings > Agents builds its provider rows: icon, content (name, status and URL lines),
  // trailing actions, and the lines under the row.
  return <div className="doan-preference-row" data-has-icon="" role="group" tabIndex={-1} aria-label={row.group} data-mcp-row={key} onFocus={event => focused(event.target)}>
    <span className="doan-preference-row-icon" aria-hidden="true">{row.logo ? <img className="logo" src={row.logo} alt="" /> : <Server />}</span>
    <div className="doan-preference-row-content"><span className="doan-preference-row-label">{row.label}</span><span className="doan-preference-row-description selectable">{row.status}</span>
      {row.url && <span className="doan-preference-row-description mcp-url selectable">{row.url}</span>}</div>
    {(row.button || row.menu) && <div className="doan-preference-row-trailing">
      {row.button && <RowButton button={row.button} run={run} describedBy={`mcp-busy-${row.provider}-${row.name}`} />}
      {row.menu && <DropdownMenu.Root>
        <Tooltip><TooltipTrigger asChild><DropdownMenu.Trigger asChild disabled={row.menu.disabled}><button type="button" className="doan-icon-button mcp-more" aria-label={row.menu.label} data-mcp-more={key} disabled={row.menu.disabled}>
          <Ellipsis aria-hidden="true" /></button></DropdownMenu.Trigger></TooltipTrigger><TooltipContent>Server menu</TooltipContent></Tooltip>
        {/* Radix closes the menu before App's window Escape handler runs, which then sees no menu and leaves Settings;
            the Escape that closes this menu stops here and focus returns to the … button. */}
        <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu" aria-label={row.label} side="bottom" align="end" sideOffset={4} collisionPadding={8}
          onEscapeKeyDown={event => event.stopPropagation()}>
          <DropdownMenu.Item className="doan-menu-item" data-mcp-remove={key} disabled={row.menu.removeDisabled} onSelect={askRemove}>Remove</DropdownMenu.Item>
        </DropdownMenu.Content></DropdownMenu.Portal>
      </DropdownMenu.Root>}
    </div>}
    {row.helper && <p className="doan-preference-row-extra settings-help">{row.helper}</p>}
    {(row.notice || runningNotice) && <div className="doan-preference-row-extra">
      {row.notice && <NoticeView notice={row.notice} run={run} live={false} />}
      {runningNotice && <NoticeView notice={{ role: "status", spinner: false, body: runningNotice, actions: [] }} run={() => {}} live={false} />}
    </div>}
  </div>;
}

function AddServerDialog({ dialog, change, submit, close }: { dialog: Extract<Dialog, { kind: "add" }>; change(value: string): void; submit(): void; close(): void }) {
  return <dialog className="doan-dialog doan-scroll" data-ui-size="compact" aria-labelledby="mcp-add-title" aria-busy={dialog.busy || undefined} ref={openModal}
    onCancel={event => { event.preventDefault(); close(); }} onKeyDown={dialogKeys(close)}>
    <form className="ob-dialog-form" onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="mcp-add-title">Add server by URL</h3>
        <p className="doan-dialog-description">Enter the address of a remote MCP server. It must start with https://.</p></div></div>
      <div className="field-group">
        <input className="doan-input" aria-label="Server URL" placeholder="https://mcp.example.com/mcp" spellCheck={false} readOnly={dialog.busy} value={dialog.value} autoFocus
          aria-invalid={dialog.error ? true : undefined} aria-describedby={dialog.error ? "mcp-add-error" : undefined} onChange={event => change(event.target.value)} />
        {dialog.error && <p className="settings-msg error selectable" role="alert" id="mcp-add-error"><AlertIcon /><span>{dialog.error}</span></p>}
      </div>
      <div className="doan-dialog-actions">
        {/* Default-size actions, as the compact dialogs are drawn (40px); Settings' row buttons stay sm. */}
        <button type="button" className="doan-button" data-ui-variant="subtle" aria-disabled={dialog.busy || undefined} data-disabled={dialog.busy ? "" : undefined} onClick={close}>Cancel</button>
        {/* Busy keeps Add focusable (aria-disabled) with the spinner inside; only an empty field disables it. submitAdd
            ignores a press while busy. */}
        <button type="submit" className="doan-button" data-ui-variant="prominent" disabled={!dialog.busy && !dialog.value.trim()} aria-disabled={dialog.busy || undefined} aria-busy={dialog.busy || undefined}>
          {dialog.busy && <span className="doan-spinner" aria-hidden="true" />}Add</button>
      </div>
    </form>
  </dialog>;
}

// Remove can't be undone, so it asks first; Cancel is focused, Escape cancels. While the request is out Remove is busy and Cancel
// takes the disabled look; a failure reads the row's sentence above the actions.
function RemoveAlert({ label, busy, failed, confirm, close }: { label: string; busy: boolean; failed: boolean; confirm(): void; close(): void }) {
  return <dialog className="doan-dialog doan-scroll" data-ui-size="compact" role="alertdialog" aria-labelledby="mcp-remove-title" aria-describedby="mcp-remove-body" ref={openModal}
    onCancel={event => { event.preventDefault(); close(); }} onKeyDown={dialogKeys(close)}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading"><h3 className="doan-dialog-title" id="mcp-remove-title">{`Remove ${label} from Doan’s agents?`}</h3>
      <p className="doan-dialog-description" id="mcp-remove-body">Claude Code and Codex disconnect from it. Your terminal setup is not changed.</p></div></div>
    {failed && <p className="doan-notice error" role="alert" id="mcp-remove-error"><AlertIcon /><span className="selectable">{removeFailedText(label)}</span></p>}
    <div className="doan-dialog-actions">
      <button type="button" className="doan-button" data-ui-variant="subtle" autoFocus aria-disabled={busy || undefined} data-disabled={busy ? "" : undefined} onClick={close}>Cancel</button>
      <button type="button" className="doan-button" data-ui-variant="prominent" data-consent="" aria-disabled={busy || undefined} aria-busy={busy || undefined}
        aria-describedby={failed ? "mcp-remove-error" : undefined} onClick={confirm}>{busy ? <><span className="doan-spinner" aria-hidden="true" />Remove</> : "Remove"}</button>
    </div>
  </dialog>;
}
