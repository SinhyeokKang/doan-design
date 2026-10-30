import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { ConfigKind, ConfigReply } from "../main/configBridge";
import type { FolderFocus } from "../main/shell";
import type { FolderEntry } from "../main/view";
import type { ConfigWrite } from "../preload";
import { cardRow, groupProjects, type RowAction } from "./homeCards";
import { NO_TOKEN_HELPER } from "./onboardingView";
import { displayPath } from "./projectDisplay";
import { canCloseProjectSettings, closedFocus, followProjectSettings, problemActionCloses, projectSettingsView, type ProblemAction, type ProjectSettingsView } from "./projectSettingsRules";
import { SettingsDialog } from "./SettingsDialog";
import { AlertIcon } from "./AlertIcon";

const chipClass = (entry: FolderEntry) => `ob-chip${entry.kind === "error" ? " err" : entry.kind === "notFound" || entry.kind === "cliError" ? " warn" : ""}`;
const LABELS: Record<RowAction, string> = { setUp: "Set Up…", locate: "Locate…", remove: "Remove from Doan", showInFinder: "Show in Finder", retry: "Retry", details: "Details" };
const PROBLEM_ACTION: Record<RowAction, ProblemAction> = { setUp: "setUp", locate: "locate", remove: "remove", showInFinder: "reveal", retry: "retry", details: "details" };
// The problem said once, in the description (design 'Project Settings 다이얼로그').
const PROBLEMS: Partial<Record<FolderEntry["kind"], string>> = {
  notFound: "Doan can’t find this folder, so its settings can’t be read or changed.",
  uninitialized: "This folder isn’t set up for Doan yet, so it has no settings to change.",
  error: "Doan couldn’t read this folder’s configuration, so its settings can’t be changed.",
  cliError: "Doan couldn’t read this folder, so its settings can’t be read or changed.",
  loading: "Doan is still reading this folder.",
};
type Config = Extract<ConfigReply, { kind: "config" }>;

// Visible, enabled and not under an inert screen: the sidebar is drawn once per screen.
function shown(selector: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(node => node.isConnected && node.getClientRects().length > 0
    && !node.closest('[inert], [hidden], [aria-hidden="true"]') && getComputedStyle(node).visibility === "visible") ?? null;
}

// The Project Settings dialog edits one worktree's .doan/config.json and follows it while open
// (projectSettingsRules). Recovery stays in place, and a pending picker, confirmation or write holds the dialog open.
export function ProjectSettingsDialog({ root: opened, projectKey, entries, reroot, homeDirectory, onClose, onAction }: {
  root: string; projectKey: string; entries: readonly FolderEntry[]; reroot: (FolderFocus & { seq: number }) | null; homeDirectory: string | null;
  // notice: where a recovery's own feedback goes (a refused Locate…), since a toast behind the modal can't be read.
  onClose(): void; onAction(action: RowAction, root: string, notice: (text: string) => void): void;
}) {
  const initial = entries.find(item => item.path === opened);
  // A worktree still loading opens on the problem view, so becoming a list reads it (rule 2).
  const [view, setView] = useState<{ root: string; view: ProjectSettingsView }>(() => ({ root: opened, view: initial ? projectSettingsView(initial) ?? "problem" : "problem" }));
  const [config, setConfig] = useState<Config | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<ConfigKind | null>(null);
  const [saved, setSaved] = useState<ConfigKind | null>(null);
  const [error, setError] = useState<{ section: ConfigKind; message: string } | null>(null);
  const [choice, setChoice] = useState<{ choiceId: string; path: string } | null>(null);
  // The problem view's Details expands the error in place (Home's ProblemActions), and a recovery's feedback shows here.
  const [details, setDetails] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const live = useRef(true), epoch = useRef(0), started = useRef<Promise<void> | null>(null), seenReroot = useRef(reroot?.seq ?? 0), closed = useRef(false);
  const tokenButton = useRef<HTMLButtonElement | null>(null), serveButton = useRef<HTMLButtonElement | null>(null), done = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef<{ button: HTMLButtonElement; section: ConfigKind } | null>(null);
  const root = view.root;
  const entry = entries.find(item => item.path === root) ?? initial;
  const canClose = canCloseProjectSettings({ picking, confirming: !!choice, writing: !!busy });

  async function read(target: string) {
    const request = ++epoch.current;
    setReading(true); setReadError(null);
    try {
      // A read sent before the session starts would answer from the previous session (configBridge), so it waits.
      await started.current;
      const reply = await window.doan.readConfig(target);
      if (!live.current || request !== epoch.current) return;
      if (reply.kind === "config") setConfig(reply);
      else setReadError(reply.kind === "error" ? reply.message : "Couldn’t read this project’s settings.");
    } catch (failure) { if (live.current && request === epoch.current) setReadError(failure instanceof Error ? failure.message : String(failure)); }
    finally { if (live.current && request === epoch.current) setReading(false); }
  }
  useEffect(() => {
    live.current = true;
    started.current = window.doan.startConfigSession().catch(console.error);
    if (view.view === "settings") void read(root);
    requestAnimationFrame(() => done.current?.focus());
    return () => { live.current = false; epoch.current++; void window.doan.endConfigSession().catch(console.error); };
  }, []);
  function close(force = false) {
    if (closed.current || (!force && !canClose)) return;
    closed.current = true;
    onClose();
    // The project menu button, else its row, else Search (closedFocus); the menu that opened this has gone.
    requestAnimationFrame(() => {
      const key = projectKey.replace(/["\\]/g, "\\$&");
      const menu = shown(`.shell-project-row[data-key="${key}"] .shell-more`), row = shown(`.shell-project-row[data-key="${key}"]`);
      const to = closedFocus({ menuButton: !!menu, row: !!row });
      (to === "menuButton" ? menu : to === "row" ? row : shown(".shell-search"))?.focus();
    });
  }
  // After each folder list or reroot (rules 1–3).
  useEffect(() => {
    const focus = reroot && reroot.seq !== seenReroot.current ? reroot : undefined;
    if (reroot) seenReroot.current = reroot.seq;
    const next = followProjectSettings(view, entries, focus);
    if (next.kind === "close") { close(true); return; }
    if (next.kind === "stay") return;
    epoch.current++;
    setView({ root: next.root, view: next.view });
    setDetails(false); setNotice(null);
    if (next.root !== root) { setConfig(null); setError(null); setSaved(null); setChoice(null); }
    if (next.reread) void read(next.root);
  }, [entries, reroot?.seq]);

  function rememberFocus(section: ConfigKind) {
    const button = document.activeElement;
    if (button instanceof HTMLButtonElement && !button.closest('dialog[role="alertdialog"]')) returnFocus.current = { button, section };
  }
  async function write(request: ConfigWrite, section: ConfigKind) {
    rememberFocus(section);
    setBusy(section); setError(null); setSaved(null);
    const name = title;
    try {
      const reply = await window.doan.writeConfig(request);
      if (!live.current) return;
      if (reply.kind === "config") { setConfig(reply); setSaved(section); await read(request.root); }
      else {
        const message = reply.kind === "error" ? reply.message : "This project changed. Choose the file again.";
        const guidance = /outside|CSS|not found|does not exist/i.test(message) ? section === "tokenCss" ? ` Choose a CSS file inside ${name}.` : ` Choose a file or folder inside ${name}.` : "";
        setError({ section, message: guidance ? message.replace(/\.?$/, ".") + guidance : message });
      }
    } catch (failure) { if (live.current) setError({ section, message: failure instanceof Error ? failure.message : String(failure) }); }
    finally { if (live.current) setBusy(null); }
  }
  async function choose(kind: ConfigKind) {
    if (busy || picking || reading) return;
    rememberFocus(kind);
    setPicking(true); setSaved(null); setError(null);
    try {
      const selected = await window.doan.chooseConfigPath(root, kind);
      if (!live.current) return;
      if (selected.kind === "selected") {
        if (kind === "serve") setChoice(selected);
        else await write({ root, op: "setTokenCss", choiceId: selected.choiceId }, kind);
      } else if (selected.kind === "unavailable") setError({ section: kind, message: "This project changed. Try again on Home." });
    } catch (failure) { if (live.current) setError({ section: kind, message: failure instanceof Error ? failure.message : String(failure) }); }
    finally { if (live.current) setPicking(false); }
  }
  const disabled = !!busy || picking || reading || !!choice;
  // The used button comes back once the controls re-enable, else its section's Change… or Add….
  useEffect(() => {
    if (disabled || !returnFocus.current) return;
    const frame = requestAnimationFrame(() => {
      const origin = returnFocus.current; returnFocus.current = null;
      if (!origin || !live.current || document.querySelector('dialog[role="alertdialog"][open]') || (document.activeElement !== document.body && document.activeElement !== origin.button && document.activeElement !== null)) return;
      const next = origin.button.isConnected && !origin.button.disabled ? origin.button : origin.section === "tokenCss" ? tokenButton.current : serveButton.current;
      next?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [disabled]);
  function recover(action: RowAction) {
    if (problemActionCloses(PROBLEM_ACTION[action])) { close(true); onAction(action, root, () => {}); return; }
    if (action === "details") { setDetails(open => !open); return; }
    setNotice(null);
    if (action === "showInFinder") { void window.doan.revealProject(root).catch(console.error); return; }
    onAction(action, root, text => { if (live.current) setNotice(text); });
  }
  // A recovery that changes the view removes the button that had focus; focus stays in the dialog, on Done.
  const drawnView = useRef(view.view);
  useEffect(() => {
    if (drawnView.current === view.view) return;
    drawnView.current = view.view;
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) done.current?.focus();
    });
  }, [view.view]);

  const lastCommon = new Map(entries.flatMap(item => item.lastCommon ? [[item.path, item.lastCommon] as const] : []));
  const title = groupProjects(entries, lastCommon).find(card => card.rows.some(row => row.path === root))?.name ?? root.split("/").filter(Boolean).at(-1) ?? root;
  const row = entry ? cardRow(entry, null, null) : null;
  const branch = row?.summary?.branch;
  const status = (section: ConfigKind) => busy === section ? <span className="settings-saved pending" role="status">Saving…</span>
    : saved === section ? <span className="settings-saved" role="status"><Check aria-hidden="true" />Saved</span> : null;
  const message = (section: ConfigKind) => error?.section === section && <div className="doan-preference-row-extra settings-msg-row"><p className="settings-msg error" role="alert"><AlertIcon /><span>{error.message}</span></p></div>;
  const problem = view.view === "problem" && entry;
  return <dialog className="doan-dialog settings-dialog" aria-labelledby="project-settings-title" ref={node => { if (node && !node.open) node.showModal(); }}
    onCancel={event => { event.preventDefault(); close(); }}>
    <div className="doan-dialog-header"><div className="doan-dialog-heading">
      <h3 className="doan-dialog-title" id="project-settings-title">{title} settings{branch && <span className="settings-dialog-branch">{branch}</span>}</h3>
      <p className="doan-dialog-description">{problem ? PROBLEMS[entry.kind] : <>Saved in <code>.doan/config.json</code> in this worktree. Commit it to share these with your team.</>}</p>
    </div></div>
    {problem ? <div className="doan-settings-group" data-layout="rows">
      <div className="doan-preference-row">
        <div className="doan-preference-row-content"><span className="doan-preference-row-label">Folder</span><span className="doan-preference-row-description"><code>{displayPath(entry.path, homeDirectory)}</code></span></div>
        {row?.chip && <div className="doan-preference-row-trailing"><span className={chipClass(entry)}>{row.chip}</span></div>}
      </div>
      {row && row.actions.length > 0 && <div className="doan-preference-row-extra settings-inline-actions settings-recovery">{row.actions.map(action => <button key={action} type="button" className="doan-button"
        data-ui-variant={action === "remove" || action === "details" ? "ghost" : "subtle"} data-ui-size="sm" aria-expanded={action === "details" ? details : undefined} onClick={() => recover(action)}>{LABELS[action]}</button>)}</div>}
      {details && row?.detail && <div className="doan-preference-row-extra settings-msg-row"><p className="settings-msg error"><AlertIcon /><span>{row.detail}</span></p></div>}
      {notice && <div className="doan-preference-row-extra settings-msg-row"><p className="settings-msg error" role="alert"><AlertIcon /><span>{notice}</span></p></div>}
    </div> : <div className="doan-settings-group" data-layout="rows">
      <div className="doan-preference-row">
        <div className="doan-preference-row-content"><span className="doan-preference-row-label">Root</span><span className="doan-preference-row-description"><code>{root}</code></span></div>
      </div>
      {reading && !config && <p className="doan-preference-row-extra settings-loading" role="status"><span className="doan-spinner" aria-hidden="true" />Reading…</p>}
      {readError && <div className="doan-preference-row-extra settings-msg-row"><p className="settings-msg error" role="alert"><AlertIcon /><span>{readError}</span></p>
        <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={disabled} onClick={() => { rememberFocus("tokenCss"); void read(root); }}>Retry</button></div>}
      {config && <>
        <div className="doan-preference-row">
          <div className="doan-preference-row-content"><span className="doan-preference-row-label">Token CSS</span>
            <span className="doan-preference-row-description">{config.tokenCss ? <code>{config.tokenCss}</code> : `None. ${NO_TOKEN_HELPER}`}</span></div>
          <div className="doan-preference-row-trailing">{status("tokenCss")}
            <button ref={tokenButton} type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={disabled} onClick={() => void choose("tokenCss")}>Change…</button>
            {config.tokenCss && <button type="button" className="doan-button" data-ui-variant="ghost" data-ui-size="sm" disabled={disabled} onClick={() => void write({ root, op: "clearTokenCss" }, "tokenCss")}>Clear</button>}</div>
          {message("tokenCss")}
        </div>
        <div className="doan-preference-row">
          <div className="doan-preference-row-content"><span className="doan-preference-row-label">Serve</span>
            <span className="doan-preference-row-description">{config.serve.length ? "Canvases can read files in .doan/canvases/, the token CSS and these paths." : "Nothing else is served. Canvases can read files in .doan/canvases/ and the token CSS."}</span></div>
          <div className="doan-preference-row-trailing">{status("serve")}
            <button ref={serveButton} type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={disabled} onClick={() => void choose("serve")}>Add…</button></div>
          {config.serve.length > 0 && <div className="doan-preference-row-extra"><ul className="settings-serve">{config.serve.map(path => <li key={path}><code>{path}</code>
            <button type="button" className="doan-button" data-ui-variant="ghost" data-ui-size="sm" aria-label={`Remove ${path} from serve`} disabled={disabled} onClick={() => void write({ root, op: "removeServe", path }, "serve")}>Remove</button></li>)}</ul></div>}
          {message("serve")}
        </div>
      </>}
    </div>}
    <div className="doan-dialog-actions"><button ref={done} type="button" className="doan-button" data-ui-variant="prominent" disabled={!canClose} onClick={() => close()}>Done</button></div>
    {choice && <SettingsDialog title="Add to serve?" verb="Add to Serve" description={<>Canvases in this project will be able to read <code>{choice.path}</code>. Add it to serve?</>}
      answer={allow => { const selected = choice; setChoice(null); if (allow) void write({ root, op: "addServe", choiceId: selected.choiceId }, "serve"); }} />}
  </dialog>;
}
