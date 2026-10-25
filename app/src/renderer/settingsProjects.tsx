import { Fragment, useEffect, useRef, useState } from "react";
import type { ProjectRow, SettingsTarget } from "../main/settings";
import type { FolderEntry } from "../main/view";
import type { ConfigReply, ConfigKind } from "../main/configBridge";
import type { ConfigWrite } from "../preload/settings";
import { cardRow, groupProjects, type RowAction } from "./homeCards";
import { NO_TOKEN_HELPER } from "./onboardingView";
import { SettingsDialog } from "./SettingsDialog";

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
export function SettingsProjects({ target }: { target: Extract<SettingsTarget, { tab: "projects" }> | null }) {
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
      return <button key={entry.path} data-path={entry.path} className="pj-row" role="option" aria-selected={active?.path === entry.path} tabIndex={active?.path === entry.path ? 0 : -1} onClick={() => setSelected(entry.path)} onKeyDown={event => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>(".pj-row") ?? []);
        const index = buttons.indexOf(event.currentTarget); const next = event.key === "Home" ? buttons[0] : event.key === "End" ? buttons.at(-1) : buttons[index + (event.key === "ArrowDown" ? 1 : -1)];
        if (next?.dataset.path) { setSelected(next.dataset.path); next.focus(); }
      }}><span className="wt-label"><span className="glyph" aria-hidden="true">{row.summary?.branch ? "⎇" : "◌"}</span><span className={`name${row.summary?.branch ? "" : " path"}`}>{row.summary?.branch ?? paths.get(entry.path)}</span></span>{row.chip ? <span className={chipClass(entry)}>{row.chip}</span> : <span />}{row.summary?.branch && <span className="wt-path">{paths.get(entry.path)}</span>}</button>;
    })}</Fragment>)}</div>
    {active && <ProjectDetail key={active.path} entry={active} displayPath={paths.get(active.path) ?? active.path} name={cards.find(card => card.rows.some(row => row.path === active.path))?.name ?? baseName(active.path)} />}
  </>}</section>;
}
function ProjectDetail({ entry, name, displayPath }: { entry: FolderEntry; name: string; displayPath: string }) {
  const [config, setConfig] = useState<Extract<ConfigReply, { kind: "config" }> | null>(null);
  const [reading, setReading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<ConfigKind | null>(null);
  const [saved, setSaved] = useState<ConfigKind | null>(null);
  const [error, setError] = useState<{ section: ConfigKind | null; message: string } | null>(null);
  const [choice, setChoice] = useState<{ choiceId: string; path: string } | null>(null);
  const live = useRef(true), epoch = useRef(0);
  const dialogFocus = useRef<HTMLButtonElement | null>(null);
  const row = cardRow(entry, null, null);
  async function read() {
    const request = ++epoch.current; setReading(true);
    try {
      const reply = await window.doanSettings.readConfig(entry.path);
      if (!live.current || request !== epoch.current) return;
      if (reply.kind === "config") setConfig(reply);
      else setError({ section: null, message: reply.kind === "error" ? reply.message : "This project is no longer available. Choose another project or try again on Home." });
    } catch (error) { if (live.current && request === epoch.current) setError({ section: null, message: error instanceof Error ? error.message : String(error) }); }
    finally { if (live.current && request === epoch.current) setReading(false); }
  }
  useEffect(() => { live.current = true; if (entry.kind === "list") void read(); else setReading(false); return () => { live.current = false; epoch.current++; }; }, [entry.kind]);
  async function write(request: ConfigWrite, section: ConfigKind) {
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
    dialogFocus.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
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
  const labels: Record<RowAction, string> = { setUp: "Set Up…", locate: "Locate…", remove: "Remove", showInFinder: "Show in Finder", retry: "Retry", details: "Details ▸" };
  function action(action: RowAction) {
    const promise = action === "showInFinder" ? window.doanSettings.revealProject(entry.path) : window.doanSettings.forwardProjectAction(entry.path, action).then(ok => { if (!ok) throw new Error("This project changed. Try again on Home."); });
    void promise.catch(error => setError({ section: null, message: error instanceof Error ? error.message : String(error) }));
  }
  const notice = (section: ConfigKind) => busy === section ? <span className="saved pending" role="status">Saving…</span> : saved === section ? <span className="saved" role="status">✓ Saved</span> : null;
  const message = (section: ConfigKind | null) => error?.section === section ? <p className="pj-msg" role="alert">{error.message}</p> : null;
  const disabled = !!busy || picking || reading || !!choice;
  return <div className="pj-detail" role="region" aria-label={`${name} settings`}><p className="pj-name">{name}{row.summary?.branch && <span className="meta">{row.summary.branch}</span>}</p>
    {reading && !config && entry.kind === "list" ? <p className="pj-helper">Reading…</p> : <div className="pj-sec"><p className="ihead">Root {row.chip && <span className={chipClass(entry)}>{row.chip}</span>}</p><p className="pj-val"><span className="v">{entry.kind === "notFound" ? <><code>{displayPath}</code> is gone or moved.</> : entry.path}</span></p>
    {entry.kind !== "list" && <div className="wt-actions">{row.actions.map(value => <button className={`btn${value === "remove" || value === "details" ? " ghost" : ""}`} key={value} onClick={() => action(value)}>{labels[value]}</button>)}</div>}</div>}
    {message(null)}
    {entry.kind === "list" && config && <><div className="pj-sec"><p className="ihead">Token CSS {notice("tokenCss")}</p><p className="pj-val"><span className={`v${config.tokenCss ? "" : " none"}`}>{config.tokenCss ?? "None"}</span><button className="btn" disabled={disabled} onClick={() => void choose("tokenCss")}>Change…</button>{config.tokenCss && <button className="btn ghost" disabled={disabled} onClick={() => void write({ root: entry.path, op: "clearTokenCss" }, "tokenCss")}>Clear</button>}</p>{!config.tokenCss && <p className="pj-helper">{NO_TOKEN_HELPER}</p>}{message("tokenCss")}</div>
      <div className="pj-sec"><p className="ihead">Serve {notice("serve")}</p>{config.serve.length > 0 && <ul className="pj-serve">{config.serve.map(path => <li key={path}><span className="v">{path}</span><button className="btn ghost" disabled={disabled} onClick={() => void write({ root: entry.path, op: "removeServe", path }, "serve")}>Remove</button></li>)}</ul>}<p className="pj-val">{config.serve.length === 0 && <span className="v none">Nothing else is served.</span>}<button className="btn" disabled={disabled} onClick={() => void choose("serve")}>Add…</button></p><p className="pj-helper">Canvases can read files in design/, the token CSS and these paths.</p>{message("serve")}</div></>}
    {choice && <SettingsDialog title="Add to serve?" verb="Add to Serve" answer={allow => { const selected = choice; setChoice(null); if (allow) void write({ root: entry.path, op: "addServe", choiceId: selected.choiceId }, "serve"); else requestAnimationFrame(() => dialogFocus.current?.focus()); }}><p>Canvases in this project will be able to read <code>{choice.path}</code>. Add it to serve?</p></SettingsDialog>}
  </div>;
}
