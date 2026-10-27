import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ProjectRow, SettingsTarget } from "../main/settings";
import type { FolderEntry } from "../main/view";
import type { ConfigReply, ConfigKind } from "../main/configBridge";
import type { ConfigWrite } from "../preload/settings";
import { cardRow, groupProjects, type RowAction } from "./homeCards";
import { NO_TOKEN_HELPER } from "./onboardingView";
import { SettingsDialog } from "./SettingsDialog";
import { AlertIcon } from "./AlertIcon";

const chipClass = (entry: FolderEntry) => `ob-chip${entry.kind === "error" ? " err" : entry.kind === "notFound" || entry.kind === "cliError" ? " warn" : ""}`;
const baseName = (path: string) => path.split("/").filter(Boolean).at(-1) ?? path;
// Fill only the fields Home's grouping/chip helpers require; Settings receives no canvases.
function homeEntry(row: ProjectRow): FolderEntry {
  const common = { path: row.path, ...(row.lastCommon ? { lastCommon: row.lastCommon } : {}) };
  if (row.kind === "list") return { ...common, kind: "list", canvases: [], servedRev: 0, ...(row.git ? { git: { ...row.git, worktrees: [] } } : {}) };
  if (row.kind === "error") return { ...common, kind: "error", message: "" };
  if (row.kind === "cliError") return { ...common, kind: "cliError", reason: "" };
  return { ...common, kind: row.kind };
}
export function SettingsProjects({ target, onBusy }: { target: Extract<SettingsTarget, { tab: "projects" }> | null; onBusy: (busy: boolean) => void }) {
  const [locked, setLocked] = useState(false);
  const reportBusy = useCallback((busy: boolean) => { setLocked(busy); onBusy(busy); }, [onBusy]);
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [selected, setSelected] = useState<string | null>(target?.project ?? null);
  const [loaded, setLoaded] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const focusTarget = useRef<string | null>(null);
  useEffect(() => window.doanSettings.onProjects(next => { setRows(next); setLoaded(true); }), []);
  useEffect(() => { if (target?.project) { setSelected(target.project); focusTarget.current = target.project; } }, [target]);
  const entries = rows.map(homeEntry);
  const paths = new Map(rows.map(row => [row.path, row.displayPath ?? row.path]));
  const cards = groupProjects(entries, new Map(rows.flatMap(row => row.lastCommon ? [[row.path, row.lastCommon]] : [])));
  const active = entries.find(row => row.path === selected) ?? entries[0];
  useEffect(() => {
    if (!active || focusTarget.current !== active.path) return;
    const button = Array.from(list.current?.querySelectorAll<HTMLButtonElement>(".pj-row") ?? []).find(button => button.dataset.path === active.path);
    button?.focus(); button?.scrollIntoView({ block: "nearest" }); focusTarget.current = null;
  }, [active?.path, rows]);
  return <section className="st-body pj" role="tabpanel" aria-label="Projects">{!entries.length ? <div className="pj-empty"><b>{loaded ? "No projects yet" : "Reading…"}</b>{loaded && <p>Projects you add on Home appear here, with their token CSS and serve settings.</p>}</div> : <>
    <div className="pj-list" role="listbox" aria-label="Projects" ref={list}>{cards.map(card => <Fragment key={card.key}><div className="pj-group">{card.name}<span className="r">{card.rows.length}</span></div>{card.rows.map(entry => {
      const row = cardRow(entry, null, null);
      return <button key={entry.path} data-path={entry.path} className="pj-row" role="option" disabled={locked} aria-selected={active?.path === entry.path} tabIndex={active?.path === entry.path ? 0 : -1} onClick={() => { if (!locked) setSelected(entry.path); }} onKeyDown={event => {
        if (locked) return;
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>(".pj-row") ?? []);
        const index = buttons.indexOf(event.currentTarget); const next = event.key === "Home" ? buttons[0] : event.key === "End" ? buttons.at(-1) : buttons[index + (event.key === "ArrowDown" ? 1 : -1)];
        if (next?.dataset.path) { setSelected(next.dataset.path); next.focus(); }
      }}><span className="wt-label"><span className="glyph" aria-hidden="true">{row.summary?.branch ? "⎇" : "◌"}</span><span title={row.summary?.branch ?? paths.get(entry.path)} className={`name${row.summary?.branch ? "" : " path"}`}>{row.summary?.branch ?? paths.get(entry.path)}</span></span>{row.chip ? <span className={chipClass(entry)}>{row.chip}</span> : <span />}{row.summary?.branch && <span className="wt-path" title={entry.path}>{paths.get(entry.path)}</span>}</button>;
    })}</Fragment>)}</div>
    {active && <ProjectDetail key={active.path} onBusy={reportBusy} entry={active} displayPath={paths.get(active.path) ?? active.path} name={cards.find(card => card.rows.some(row => row.path === active.path))?.name ?? baseName(active.path)} />}
  </>}</section>;
}
function ProjectDetail({ entry, name, displayPath, onBusy }: { entry: FolderEntry; name: string; displayPath: string; onBusy: (busy: boolean) => void }) {
  const [config, setConfig] = useState<Extract<ConfigReply, { kind: "config" }> | null>(null);
  const [reading, setReading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const readInFlight = useRef(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<ConfigKind | null>(null);
  const [saved, setSaved] = useState<ConfigKind | null>(null);
  const [error, setError] = useState<{ section: ConfigKind | null; message: string } | null>(null);
  const [choice, setChoice] = useState<{ choiceId: string; path: string } | null>(null);
  const live = useRef(true), epoch = useRef(0);
  const detail = useRef<HTMLDivElement>(null);
  const tokenButton = useRef<HTMLButtonElement>(null), serveButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<{ button: HTMLButtonElement; section: ConfigKind } | null>(null);
  useLayoutEffect(() => { onBusy(!!busy || picking || !!choice); return () => onBusy(false); }, [busy, picking, choice, onBusy]);
  useEffect(() => {
    const moved = (event: FocusEvent) => {
      const target = event.target;
      if (returnFocus.current && target instanceof Element && target !== document.body && target !== returnFocus.current.button && !detail.current?.querySelector("dialog")?.contains(target)) returnFocus.current = null;
    };
    document.addEventListener("focusin", moved);
    return () => document.removeEventListener("focusin", moved);
  }, []);
  function rememberFocus(section: ConfigKind) {
    const button = document.activeElement;
    if (button instanceof HTMLButtonElement && detail.current?.contains(button) && !button.closest("dialog")) returnFocus.current = { button, section };
  }
  const row = cardRow(entry, null, null);
  async function read() {
    if (readInFlight.current) return;
    readInFlight.current = true;
    const request = ++epoch.current; setReading(true);
    try {
      const reply = await window.doanSettings.readConfig(entry.path);
      if (!live.current || request !== epoch.current) return;
      if (reply.kind === "config") { setConfig(reply); setReadError(null); }
      else setReadError(reply.kind === "error" ? reply.message : "Couldn’t read this project’s settings. Retry or choose another project.");
    } catch (error) { if (live.current && request === epoch.current) setReadError(error instanceof Error ? error.message : String(error)); }
    finally { if (live.current && request === epoch.current) { readInFlight.current = false; setReading(false); } }
  }
  useEffect(() => { live.current = true; if (entry.kind === "list") void read(); else { setReading(false); setReadError(null); } return () => { live.current = false; epoch.current++; readInFlight.current = false; }; }, [entry.kind]);
  async function write(request: ConfigWrite, section: ConfigKind) {
    rememberFocus(section);
    setBusy(section); setError(null); setSaved(null);
    try {
      const reply = await window.doanSettings.writeConfig(request);
      if (!live.current) return;
      if (reply.kind === "config") { setConfig(reply); setSaved(section); await read(); }
      else {
        const message = reply.kind === "error" ? reply.message : "This project changed. Choose the file again.";
        const guidance = /outside|CSS|not found|does not exist/i.test(message) ? section === "tokenCss" ? ` Choose a CSS file inside ${name}.` : ` Choose a file or folder inside ${name}.` : "";
        setError({ section, message: guidance ? message.replace(/\.?$/, ".") + guidance : message });
      }
    } catch (error) { if (live.current) setError({ section, message: error instanceof Error ? error.message : String(error) }); }
    finally { if (live.current) setBusy(null); }
  }
  async function choose(kind: ConfigKind) {
    if (busy || picking || reading) return;
    rememberFocus(kind);
    setPicking(true); setSaved(null); setError(null);
    try {
      const selected = await window.doanSettings.chooseConfigPath(entry.path, kind);
      if (!live.current) return;
      if (selected.kind === "selected") {
        if (kind === "serve") setChoice(selected);
        else await write({ root: entry.path, op: "setTokenCss", choiceId: selected.choiceId }, kind);
      } else if (selected.kind === "unavailable") setError({ section: kind, message: "This project changed. Try again on Home." });
    } catch (error) { if (live.current) setError({ section: kind, message: error instanceof Error ? error.message : String(error) }); }
    finally { if (live.current) setPicking(false); }
  }
  const labels: Record<RowAction, string> = { setUp: "Set Up…", locate: "Locate…", remove: "Remove", showInFinder: "Show in Finder", retry: "Retry", details: "Open Details in Main" };
  function action(action: RowAction) {
    const promise = action === "showInFinder" ? window.doanSettings.revealProject(entry.path) : window.doanSettings.forwardProjectAction(entry.path, action).then(ok => { if (!ok) throw new Error("Couldn’t open this action. Return to the main window, close any open dialog, and try again on Home."); });
    void promise.catch(error => setError({ section: null, message: error instanceof Error ? error.message : String(error) }));
  }
  const notice = (section: ConfigKind) => busy === section ? <span className="saved pending" role="status">Saving…</span> : saved === section ? <span className="saved" role="status">✓ Saved</span> : null;
  const message = (section: ConfigKind | null) => error?.section === section ? <p className="pj-msg" role="alert"><AlertIcon /><span>{error.message}</span></p> : null;
  const disabled = !!busy || picking || reading || !!choice;
  useEffect(() => {
    if (disabled || !returnFocus.current) return;
    // Wait for controls to re-enable and queued targets to establish their own focus.
    const frame = requestAnimationFrame(() => {
      const origin = returnFocus.current; returnFocus.current = null;
      if (!origin || !live.current || document.querySelector("dialog[open]") || (document.activeElement !== document.body && document.activeElement !== origin.button)) return;
      const next = origin.button.isConnected && !origin.button.disabled ? origin.button : origin.section === "tokenCss" ? tokenButton.current : serveButton.current;
      next?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [disabled]);
  const branch = row.summary?.branch;
  return <div ref={detail} className="pj-detail" role="region" aria-label={`${name}${branch ? ` (${branch})` : ""} settings`}><p className="pj-name">{name}{branch && <> <span className="meta">{branch}</span></>}</p>
    {reading && !config && entry.kind === "list" ? <p className="pj-helper">Reading…</p> : <div className="pj-sec"><p className="ihead">Root {row.chip && <span className={chipClass(entry)}>{row.chip}</span>}</p><p className="pj-val"><span className="v">{entry.kind === "notFound" ? <><code>{displayPath}</code> is gone or moved.</> : entry.path}</span></p>
    {entry.kind !== "list" && <div className="wt-actions">{row.actions.map(value => <button className={`btn doan-button${value === "remove" || value === "details" ? " ghost" : ""}`} data-ui-variant={value === "remove" || value === "details" ? undefined : "subtle"} data-ui-size="sm" key={value} onClick={() => action(value)}>{labels[value]}</button>)}</div>}</div>}
    {message(null)}
    {entry.kind === "list" && readError && <div><p className="pj-msg" role="alert"><AlertIcon /><span>{readError}</span></p><button className="btn doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={disabled} onClick={() => { rememberFocus("tokenCss"); void read(); }}>Retry</button></div>}
    {entry.kind === "list" && config && <><div className="pj-sec"><p className="ihead">Token CSS {notice("tokenCss")}</p><p className="pj-val"><span className={`v${config.tokenCss ? "" : " none"}`}>{config.tokenCss ?? "None"}</span><button ref={tokenButton} className="btn doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={disabled} onClick={() => void choose("tokenCss")}>Change…</button>{config.tokenCss && <button className="btn ghost doan-button" data-ui-size="sm" disabled={disabled} onClick={() => void write({ root: entry.path, op: "clearTokenCss" }, "tokenCss")}>Clear</button>}</p>{!config.tokenCss && <p className="pj-helper">{NO_TOKEN_HELPER}</p>}{message("tokenCss")}</div>
      <div className="pj-sec"><p className="ihead">Serve {notice("serve")}</p>{config.serve.length > 0 && <ul className="pj-serve">{config.serve.map(path => <li key={path}><span className="v">{path}</span><button className="btn ghost doan-button" data-ui-size="sm" disabled={disabled} onClick={() => void write({ root: entry.path, op: "removeServe", path }, "serve")}>Remove</button></li>)}</ul>}<p className="pj-val">{config.serve.length === 0 && <span className="v none">Nothing else is served.</span>}<button ref={serveButton} className="btn doan-button" data-ui-variant="subtle" data-ui-size="sm" disabled={disabled} onClick={() => void choose("serve")}>Add…</button></p><p className="pj-helper">Canvases can read files in doan/, the token CSS and these paths.</p>{message("serve")}</div></>}
    {choice && <SettingsDialog title="Add to serve?" verb="Add to Serve" answer={allow => { const selected = choice; setChoice(null); if (allow) void write({ root: entry.path, op: "addServe", choiceId: selected.choiceId }, "serve"); }}><p>Canvases in this project will be able to read <code>{choice.path}</code>. Add it to serve?</p></SettingsDialog>}
  </div>;
}
