import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, File as FileIcon, Folder as FolderIcon, GitBranch } from "lucide-react";
import type { ConfigKind, ConfigReply } from "../main/configBridge";
import type { FolderFocus } from "../main/shell";
import type { FolderEntry } from "../main/view";
import type { ConfigWrite } from "../preload";
import type { AddPageOrigin } from "./addProjectsNav";
import { AlertIcon } from "./AlertIcon";
import { cardRow, groupProjects, ROW_ACTION_LABELS as LABELS, type RowAction } from "./homeCards";
import { displayPath } from "./projectDisplay";
import {
  followProjectSettings, projectSettingsFocusAfter, projectSettingsLocked, projectSettingsPageView, projectSettingsView, sharedPathLabel, writeErrorMessage,
  type PageAction, type ProjectSettingsView, type ReadState,
} from "./projectSettingsRules";
import { SettingsDialog } from "./SettingsDialog";
import { projectHue, projectInitial } from "./shellNavigation";

type Config = Extract<ConfigReply, { kind: "config" }>;
type Recovery = Extract<RowAction, "setUp" | "locate" | "retry">;


// The Project Settings page edits one worktree's .doan/config.json in the white body, where Agents and Notifications
// already live (project-settings design '화면'), and follows that worktree while it is open (projectSettingsRules).
// App owns navigation, the lock and Remove from Doan; this component reports only whether it holds a picker, a
// confirmation or a write. `root` is the worktree opened: the page follows a reroot itself and reports it, so App
// remounts it (a new key) only to show another worktree. Config session lifetime is the page's: it starts on mount and
// ends on unmount.
export function ProjectSettingsPage({ header, sidebar, root: opened, entries, reroot, origin, homeDirectory, arrival, onState, onGone, onRerooted, onAction, onRemove }: {
  header: ReactNode; sidebar: ReactNode; root: string; entries: readonly FolderEntry[];
  reroot: (FolderFocus & { seq: number }) | null; origin: AddPageOrigin; homeDirectory: string | null;
  // Arrival and picking the same worktree again focus the title; seq makes a repeat distinct.
  arrival: { seq: number } | null;
  onState(report: { locked: boolean }): void;
  // The worktree left the list: App leaves the page through the `gone` event, whatever the lock.
  onGone(): void;
  // Locate or Set Up moved the worktree: App's root, and the origin if it was the old root's workspace, follow.
  onRerooted(root: string, origin: AddPageOrigin): void;
  // notice: where a recovery's own feedback goes (a refused Locate), shown under the page's notice.
  onAction(action: Recovery, root: string, notice: (text: string) => void): void;
  onRemove(): void;
}) {
  const initial = entries.find(item => item.path === opened);
  // A worktree still loading starts on the problem view, so becoming a list reads it.
  const [view, setView] = useState<{ root: string; view: ProjectSettingsView }>(() => ({ root: opened, view: initial ? projectSettingsView(initial) ?? "problem" : "problem" }));
  const [config, setConfig] = useState<Config | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<ConfigKind | null>(null);
  const [saved, setSaved] = useState<ConfigKind | null>(null);
  const [error, setError] = useState<{ section: ConfigKind; message: string } | null>(null);
  const [choice, setChoice] = useState<{ choiceId: string; path: string } | null>(null);
  // Details expands the config error in place, and a recovery's feedback shows under the notice.
  const [details, setDetails] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const live = useRef(true), epoch = useRef(0), started = useRef<Promise<void> | null>(null), seenReroot = useRef(reroot?.seq ?? 0);
  // Bumped when the page moves to another root or turns into a problem: a picker or write that began before it is stale.
  const generation = useRef(0), gone = useRef(false), lastEntry = useRef<FolderEntry | undefined>(initial);
  const heading = useRef<HTMLHeadingElement | null>(null), tokenButton = useRef<HTMLButtonElement | null>(null), addButton = useRef<HTMLButtonElement | null>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<{ button: HTMLButtonElement; section: ConfigKind; removed?: { path: string; before: readonly string[] } } | null>(null);
  const reported = useRef(false), arrived = useRef(0), config$ = useRef<Config | null>(null);
  config$.current = config;
  const root = view.root;
  const found = entries.find(item => item.path === root);
  if (found) lastEntry.current = found;
  const entry = found ?? lastEntry.current;
  const locked = projectSettingsLocked({ picking, confirming: !!choice, writing: !!busy });

  function focusTitle() { requestAnimationFrame(() => heading.current?.focus()); }
  async function read(target: string) {
    const request = ++epoch.current;
    setReading(true); setReadError(null);
    try {
      // A read sent before the session starts would answer from the previous session (configBridge), so it waits.
      await started.current;
      const reply = await window.doan.readConfig(target);
      if (!live.current || request !== epoch.current) return;
      if (reply.kind === "config") setConfig(reply);
      // A reply with no message of its own (unavailable) leaves the reason line empty: the notice already says it.
      else { setConfig(null); setReadError(reply.kind === "error" ? reply.message : ""); }
    } catch (failure) { if (live.current && request === epoch.current) { setConfig(null); setReadError(failure instanceof Error ? failure.message : String(failure)); } }
    finally { if (live.current && request === epoch.current) setReading(false); }
  }
  useEffect(() => {
    live.current = true;
    started.current = window.doan.startConfigSession().catch(console.error);
    if (view.view === "settings") void read(root);
    return () => { live.current = false; epoch.current++; void window.doan.endConfigSession().catch(console.error); };
  }, []);

  // Arrival focuses the title a frame later, after the menu that led here has returned its own focus.
  useEffect(() => {
    if (!arrival || arrival.seq === arrived.current) return;
    arrived.current = arrival.seq;
    focusTitle();
  });

  // The lock goes to App while a picker, a confirmation or a write is open, and is released when the page goes, through
  // the latest callback (the unmount cleanup is the first render's).
  const report = useRef(onState); report.current = onState;
  useEffect(() => {
    if (reported.current === locked) return;
    reported.current = locked;
    report.current({ locked });
  }, [locked]);
  useEffect(() => () => { if (reported.current) { reported.current = false; report.current({ locked: false }); } }, []);

  // After each folder list or reroot: the worktree gone leaves, a reroot moves the page, a new state switches the view.
  useEffect(() => {
    const focus = reroot && reroot.seq !== seenReroot.current ? reroot : undefined;
    if (reroot) seenReroot.current = reroot.seq;
    const next = followProjectSettings(view, entries, origin, focus);
    if (next.kind === "stay") return;
    if (next.kind === "leave") {
      // An open confirmation is cancelled by the page going; a picker or read answering before App unmounts the page is
      // for a worktree that is gone, so it opens nothing.
      if (!gone.current) { gone.current = true; epoch.current++; generation.current++; setChoice(null); onGone(); }
      return;
    }
    // The read in flight is dropped (its epoch is stale), so it can no longer end the reading state itself.
    epoch.current++; generation.current++; setReading(false);
    const rerooted = next.root !== root;
    setView({ root: next.root, view: next.view });
    setDetails(false); setNotice(null);
    if (rerooted) { setConfig(null); setError(null); setSaved(null); }
    // A problem shows no settings; ones kept from before would show again while the healthy worktree is read anew.
    else if (next.view === "problem") setConfig(null);
    if (next.cancelConfirm) {
      if (choice || picking) focusTitle();
      setChoice(null);
    }
    if (rerooted) onRerooted(next.root, next.origin);
    if (next.reread) void read(next.root);
  }, [entries, reroot?.seq]);

  function rememberFocus(section: ConfigKind, removed?: string) {
    const button = document.activeElement;
    if (button instanceof HTMLButtonElement && !button.closest('dialog[role="alertdialog"]'))
      returnFocus.current = { button, section, ...(removed === undefined ? {} : { removed: { path: removed, before: config$.current?.serve ?? [] } }) };
  }
  async function write(request: ConfigWrite, section: ConfigKind, removed?: string) {
    rememberFocus(section, removed);
    const stale = generation.current;
    setBusy(section); setError(null); setSaved(null);
    try {
      const reply = await window.doan.writeConfig(request);
      if (!live.current || stale !== generation.current) return;
      if (reply.kind === "config") { setConfig(reply); setSaved(section); await read(request.root); }
      else setError({ section, message: writeErrorMessage(section, reply, title) });
    } catch (failure) { if (live.current && stale === generation.current) setError({ section, message: failure instanceof Error ? failure.message : String(failure) }); }
    finally { if (live.current) setBusy(null); }
  }
  async function choose(kind: ConfigKind) {
    if (busy || picking || reading) return;
    rememberFocus(kind);
    const stale = generation.current;
    setPicking(true); setSaved(null); setError(null);
    try {
      const selected = await window.doan.chooseConfigPath(root, kind);
      // The worktree moved or turned into a problem while the sheet was open: its answer is for another page.
      if (!live.current || stale !== generation.current) return;
      if (selected.kind === "selected") {
        if (kind === "serve") setChoice(selected);
        else await write({ root, op: "setTokenCss", choiceId: selected.choiceId }, kind);
      } else if (selected.kind === "unavailable") setError({ section: kind, message: writeErrorMessage(kind, selected, title) });
    } catch (failure) { if (live.current && stale === generation.current) setError({ section: kind, message: failure instanceof Error ? failure.message : String(failure) }); }
    finally { if (live.current) setPicking(false); }
  }
  const disabled = !!busy || picking || reading || !!choice;
  // Once the controls re-enable, focus returns (projectSettingsFocusAfter) unless a confirmation owns the modal layer or
  // the user moved it on purpose.
  useEffect(() => {
    if (disabled || !returnFocus.current) return;
    const frame = requestAnimationFrame(() => {
      const origin = returnFocus.current; returnFocus.current = null;
      if (!origin || !live.current || document.querySelector('dialog[role="alertdialog"][open]') || (document.activeElement !== document.body && document.activeElement !== origin.button && document.activeElement !== null)) return;
      const target = projectSettingsFocusAfter({
        section: origin.section, pressedAlive: origin.button.isConnected && !origin.button.disabled,
        ...(origin.removed ? { removed: { path: origin.removed.path, before: origin.removed.before, after: config$.current?.serve ?? [] } } : {}),
      });
      (target.kind === "pressed" ? origin.button : target.kind === "tokenPrimary" ? tokenButton.current : target.kind === "sharedRemove" ? removeButtons.current.get(target.path) ?? addButton.current : addButton.current)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [disabled]);

  // A list with neither settings nor a failure has not been read yet, whether or not the read has started.
  const readState: ReadState = readError !== null ? { kind: "failed", message: readError } : config ? { kind: "ready" } : { kind: "reading" };
  const page = entry ? projectSettingsPageView(entry, readState) : null;
  // A recovery that changes what the page draws removes the button that had focus; focus falls to the title.
  const drawn = useRef("");
  const shape = page ? `${page.body}:${page.notice?.actions.join(",") ?? ""}` : "";
  useEffect(() => {
    if (drawn.current === shape) return;
    const first = drawn.current === "";
    drawn.current = shape;
    if (first) return;
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) heading.current?.focus();
    });
  }, [shape]);

  function recover(action: PageAction) {
    if (action === "details") { setDetails(open => !open); return; }
    // A worktree that is fine but whose settings failed to read retries the read here; a problem worktree asks App to
    // read its folder again.
    if (action === "retry" && entry?.kind === "list") { void read(root); return; }
    setNotice(null);
    onAction(action, root, text => { if (live.current) setNotice(text); });
  }

  const lastCommon = new Map(entries.flatMap(item => item.lastCommon ? [[item.path, item.lastCommon] as const] : []));
  const title = groupProjects(entries, lastCommon).find(card => card.rows.some(row => row.path === root))?.name ?? root.split("/").filter(Boolean).at(-1) ?? root;
  const branch = entry ? cardRow(entry, null, null).summary?.branch : undefined;
  const status = (section: ConfigKind) => busy === section ? <span className="settings-saved pending" role="status">Saving</span>
    : saved === section ? <span className="settings-saved" role="status"><Check aria-hidden="true" />Saved</span> : null;
  const message = (section: ConfigKind) => error?.section === section && <div className="doan-preference-row-extra settings-msg-row project-settings-msg"><p className="settings-msg error" role="alert"><AlertIcon /><span>{error.message}</span></p></div>;
  const shared = choice && sharedPathLabel(root, choice.path);
  const removeSection = page?.removeSection && <section>
    <div className="settings-section-header"><div><h2 className="settings-section-title">Remove from Doan</h2></div></div>
    <div className="doan-settings-group" data-layout="rows"><div className="doan-preference-row">
      <div className="doan-preference-row-content"><span className="doan-preference-row-description">Doan stops listing {title} and its worktrees. Files and Git worktrees stay on disk.</span></div>
      <div className="doan-preference-row-trailing"><button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={() => onRemove()}>Remove from Doan</button></div>
    </div></div>
  </section>;
  return <div className="app-shell home-shell settings-shell">
    {header}
    {sidebar}
    <main className="home-panel settings-panel doan-scroll" aria-labelledby="project-settings-title">
      <div className="settings-page">
        <header className="settings-header">
          <div className="settings-header-copy">
            <h1 className="settings-title project-settings-title" id="project-settings-title" tabIndex={-1} ref={node => { heading.current = node; }}>
              <span className={`shell-thumbnail project-settings-thumbnail hue-${projectHue(title)}`} aria-hidden="true">{projectInitial(title)}</span>{title}
              {branch && <span className="doan-chip shell-branch" data-ui-variant="translucent"><GitBranch aria-hidden="true" /><span>{branch}</span></span>}
            </h1>
            {entry && <p className="settings-lead">{displayPath(entry.path, homeDirectory)}{page?.storedNote && <> · Stored in <code>.doan/config.json</code> in this worktree. Commit it so your team gets these settings.</>}</p>}
          </div>
          <div className="settings-header-actions">
            {page?.showInFinder && <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={() => void window.doan.revealProject(root).catch(console.error)}>Show in Finder</button>}
          </div>
        </header>
        {page?.body === "reading" && <p className="settings-loading project-settings-loading" role="status"><span className="doan-spinner" aria-hidden="true" />Reading settings</p>}
        {page?.notice && <>
          <div className={`doan-notice ${page.notice.tone}`} role="status">
            <AlertIcon />
            <span className="project-settings-grow">{page.notice.text}{page.notice.reason && <span className="project-settings-notice-reason">{page.notice.reason}</span>}</span>
            <div className="project-settings-notice-actions">{page.notice.actions.map(action => <button key={action} type="button" className="doan-button"
              data-ui-variant={action === "details" ? "ghost" : "panel"} data-ui-size="sm" aria-expanded={action === "details" ? details : undefined}
              disabled={disabled && action === "retry"} onClick={() => recover(action)}>{LABELS[action]}</button>)}</div>
          </div>
          {details && page.notice.detail && <pre className="project-settings-details">{page.notice.detail}</pre>}
          {notice && <p className="settings-msg error project-settings-msg" role="alert"><AlertIcon /><span>{notice}</span></p>}
        </>}
        {page && page.body !== "reading" && <div className="settings-sections">
          {page.body === "sections" && config && <>
            <section>
              <div className="settings-section-header"><div>
                <h2 className="settings-section-title">Token CSS</h2>
                <p className="settings-section-description">The stylesheet canvases link for tokens.</p>
              </div></div>
              <div className="doan-settings-group" data-layout="rows">
                <div className="project-settings-token">
                  {config.tokenCss ? <>
                    <FileIcon aria-hidden="true" /><span className="project-settings-token-name">{config.tokenCss}</span><span className="project-settings-grow" />
                    {status("tokenCss")}
                    <button ref={tokenButton} type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={disabled} onClick={() => void choose("tokenCss")}>Change</button>
                    <button type="button" className="doan-button" data-ui-variant="ghost" data-ui-size="sm" disabled={disabled} onClick={() => void write({ root, op: "clearTokenCss" }, "tokenCss")}>Clear</button>
                  </> : <>
                    <span className="project-settings-empty project-settings-grow">No token CSS. <code>doan check</code> won’t flag hardcoded colors.</span>
                    {status("tokenCss")}
                    <button ref={tokenButton} type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={disabled} onClick={() => void choose("tokenCss")}>Choose</button>
                  </>}
                </div>
                {message("tokenCss")}
              </div>
            </section>
            <section>
              <div className="settings-section-header"><div>
                <h2 className="settings-section-title">Shared with canvases</h2>
                <p className="settings-section-description">Files canvases in this worktree can read, besides .doan/canvases/, .doan/ds/, .doan/assets/ and the token CSS.</p>
              </div></div>
              <div className="doan-settings-group" data-layout="rows">
                {config.serve.map(path => <div className="doan-preference-row" key={path}>
                  <div className="doan-preference-row-content"><span className="doan-preference-row-label project-settings-path"><FolderIcon aria-hidden="true" />{path}</span></div>
                  <div className="doan-preference-row-trailing"><button type="button" className="doan-button" data-ui-variant="ghost" data-ui-size="sm" aria-label={`Remove ${path} from Shared with canvases`}
                    ref={node => { if (node) removeButtons.current.set(path, node); else removeButtons.current.delete(path); }}
                    disabled={disabled} onClick={() => void write({ root, op: "removeServe", path }, "serve", path)}>Remove</button></div>
                </div>)}
                <div className="doan-preference-row">
                  <div className="doan-preference-row-content" />
                  <div className="doan-preference-row-trailing">{status("serve")}
                    <button ref={addButton} type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={disabled} onClick={() => void choose("serve")}>Add File or Folder</button></div>
                </div>
                {message("serve")}
              </div>
            </section>
          </>}
          {removeSection}
        </div>}
        {choice && <SettingsDialog title={<>Share <code>{shared}</code> with canvases?</>} label={`Share ${shared} with canvases?`} verb="Share" description={<>Canvases in this worktree will be able to read <code>{shared}</code>.</>}
          answer={allow => { const selected = choice; setChoice(null); if (allow) void write({ root, op: "addServe", choiceId: selected.choiceId }, "serve"); }} />}
      </div>
    </main>
  </div>;
}
