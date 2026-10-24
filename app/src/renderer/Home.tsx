import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ContextMenu, DropdownMenu } from "radix-ui";
import type { FolderEntry } from "../main/view";
import { displayPath } from "./projectDisplay";
import { cardRow, groupProjects, type HomeCard, type RowAction } from "./homeCards";
import type { SelectionView } from "./selection";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

interface HomeProps {
  homeDirectory: string | null;
  entries: FolderEntry[];
  loaded: string | null;
  selection: SelectionView | null;
  highlight: string[];
  rerootHint?: { root: string; message: string } | null;
  enter: (root: string) => void;
  action: (action: RowAction, root: string) => void;
  remove: (roots: string[]) => void;
}
export function Home(props: HomeProps) {
  const cards = groupProjects(props.entries, new Map(props.entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])));
  return <main className="home-shell">
    <header className="top"><span className="traffic-space" aria-hidden="true" /><span className="logo"><i />doan</span><span className="spacer" /><button className="btn" aria-label="Add Project…" onClick={() => void window.doan.addProjects()}>+ Add Project… <span className="kbd">⌘O</span></button></header>
    <section className="home-body" aria-label="Home" style={cards.length ? undefined : { padding: 0 }}>
      {cards.length ? <><div className="sec">Projects <span className="r">{cards.length}</span></div><div className="cards">{cards.map(card => <ProjectCard key={card.key} card={card} {...props} />)}</div></>
        : <div className="empty"><b>No projects yet</b><p>Add a project to see its design canvases.</p><button className="btn primary" onClick={() => void window.doan.addProjects()}>Add Project… <span className="kbd">⌘O</span></button><p className="meta">Or drop folders anywhere in this window.</p></div>}
    </section>
  </main>;
}

export function PathTip({ text, children }: { text: string; children: ReactNode }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent className="project-tooltip">{text}</TooltipContent></Tooltip>;
}
const labels: Record<RowAction, string> = { setUp: "Set Up…", locate: "Locate…", remove: "Remove", showInFinder: "Show in Finder", retry: "Retry", details: "Details" };
export function ProblemActions({ entry, action, workspace }: { entry: FolderEntry; action: HomeProps["action"]; workspace?: { name: string; homeDirectory: string | null; home: () => void } }) {
  const [details, setDetails] = useState(false);
  const row = cardRow(entry, null, null);
  const actions = <div className="wt-actions">{row.actions.map(name => <button className={`btn${name === "remove" || name === "details" ? " ghost" : ""}`} key={name} aria-label={labels[name]} aria-expanded={name === "details" ? details : undefined} onClick={() => name === "details" ? setDetails(!details) : action(name, entry.path)}>{labels[name]}{name === "details" && (details ? " ▾" : " ▸")}</button>)}</div>;
  const message = details && row.detail && (workspace ? <span className="ob-msg error">{row.detail}</span> : <p className="wt-detail ob-msg error">{row.detail}</p>);
  if (!workspace) return <>{actions}{message}</>;
  return <div className="ws-recovery" role="region" aria-label="Project status"><div className="ws-status" role="status">
    <span className={`ob-chip${entry.kind === "error" ? " err" : entry.kind === "cliError" || entry.kind === "notFound" ? " warn" : ""}`}>{row.chip}</span>
    {entry.kind === "notFound" ? <span className="text"><code>{displayPath(entry.path, workspace.homeDirectory)}</code> is gone or moved.</span> : entry.kind === "uninitialized" ? <span className="text">{workspace.name} is not set up.</span> : <span className="spacer" />}
    {actions}<button className="btn ghost" onClick={workspace.home}>Go Home</button>
  </div>{message && <div className="ws-detail">{message}</div>}</div>;
}

interface MenuAction { label: string; run: () => void }
function More({ label, actions, row = false }: { label: string; actions: MenuAction[]; row?: boolean }) {
  return <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="more" tabIndex={row ? -1 : undefined} aria-label={label} onClick={event => event.stopPropagation()}>···</button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="menu" sideOffset={4} align="end" onClick={event => event.stopPropagation()}>{actions.map((action, index) => <Fragment key={action.label}>{index > 0 && <DropdownMenu.Separator className="menu-sep" />}<DropdownMenu.Item className="mi" key={action.label} onSelect={action.run}>{action.label}</DropdownMenu.Item></Fragment>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}
function Context({ actions, children }: { actions: MenuAction[]; children: ReactNode }) {
  const trigger = useRef<HTMLSpanElement>(null);
  return <ContextMenu.Root><ContextMenu.Trigger ref={trigger} asChild onKeyDown={event => {
    if (event.target !== event.currentTarget || !(event.key === "ContextMenu" || event.key === "F10" && event.shiftKey)) return;
    event.preventDefault(); event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: rect.left + 10, clientY: rect.top + 10 }));
  }}>{children}</ContextMenu.Trigger><ContextMenu.Portal><ContextMenu.Content className="menu" onCloseAutoFocus={event => {
    if (trigger.current?.matches("[tabindex]") && !document.querySelector("dialog[open]")) { event.preventDefault(); trigger.current.focus(); }
  }} onClick={event => event.stopPropagation()}>{actions.map((action, index) => <Fragment key={action.label}>{index > 0 && <ContextMenu.Separator className="menu-sep" />}<ContextMenu.Item key={action.label} className="mi" onSelect={action.run}>{action.label}</ContextMenu.Item></Fragment>)}</ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>;
}
function ProjectCard({ card, ...props }: HomeProps & { card: HomeCard }) {
  const element = useRef<HTMLElement>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const active = card.rows.some(row => row.path === focused) ? focused : card.rows[0]?.path;
  const flash = card.rows.some(row => props.highlight.includes(row.path));
  useEffect(() => { if (flash) element.current?.scrollIntoView({ block: "nearest" }); }, [flash]);
  const actions = [{ label: "Remove all", run: () => props.remove(card.rows.map(row => row.path)) }];
  return <Context actions={actions}><section ref={element} className={`card${flash ? " flash" : ""}`} aria-label={card.name}>
    <div className="card-head"><PathTip text={card.name}><span className="card-name">{card.name}</span></PathTip>{card.rows.length > 1 && <span className="meta">{card.rows.length} worktrees</span>}<span className="spacer" /><More label={`Project menu ${card.name}`} actions={actions} /></div>
    {card.rows.map((entry, index) => {
      const row = cardRow(entry, props.loaded, props.selection);
      const actions = [{ label: "Show in Finder", run: () => props.action("showInFinder", entry.path) }, { label: "Remove from doan", run: () => props.remove([entry.path]) }];
      const activate = (node: HTMLElement) => entry.kind === "list" ? props.enter(entry.path) : node.querySelector<HTMLButtonElement>(".wt-actions button")?.focus();
      return <Context key={entry.path} actions={actions}><div className={`wt${row.chip ? " problem" : ""}`} data-path={entry.path} role={row.chip ? "group" : "button"} aria-label={`Project ${row.summary?.branch ?? displayPath(entry.path, props.homeDirectory)} · ${row.chip ?? `${row.summary?.canvases ?? 0} ${row.summary?.canvases === 1 ? "canvas" : "canvases"} · ${row.summary?.openComments ?? 0} open comments`} · ${entry.path}`} aria-current={row.current ? "true" : undefined} tabIndex={active === entry.path ? 0 : -1}
        onFocus={event => { if (event.target === event.currentTarget) setFocused(entry.path); }} onClick={event => { if (!(event.target instanceof Element && event.target.closest("button"))) activate(event.currentTarget); }}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(event.currentTarget); }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); const next = element.current?.querySelectorAll<HTMLElement>(".wt")[index + (event.key === "ArrowUp" ? -1 : 1)]; next?.focus(); }
        }}>
        <span className="wt-label"><span className="glyph" aria-hidden="true">{row.summary?.branch ? "⎇" : "◌"}</span><PathTip text={row.summary?.branch ?? entry.path}><span className={`name${row.summary?.branch ? "" : " path"}`}>{row.summary?.branch ?? displayPath(entry.path, props.homeDirectory)}</span></PathTip>{row.current && <span className="open-tag">Open</span>}</span>
        <span className="wt-end">{row.chip ? <span className={`ob-chip${row.chip === "Config error" ? " err" : row.chip === "Missing" || row.chip === "CLI error" ? " warn" : ""}`}>{row.chip}</span> : row.summary && <span className="wt-sum">{row.summary.canvases} {row.summary.canvases === 1 ? "canvas" : "canvases"}{row.summary.openComments > 0 && <> · <span className="hot">{row.summary.openComments} open</span></>} · <ChangedTime at={row.summary.changedAt} /></span>}<More row label={`Row menu ${entry.path}`} actions={actions} /></span>
        {row.summary?.branch && <PathTip text={entry.path}><span className="wt-path">{displayPath(entry.path, props.homeDirectory)}</span></PathTip>}
        {row.selected && <PathTip text={`Selected: ${row.selected}`}><span className="wt-sel">Selected: <b>{row.selected}</b></span></PathTip>}
        {row.chip && <ProblemActions entry={entry} action={props.action} />}
        {props.rerootHint?.root === entry.path && <p className="wt-sel" role="status">{props.rerootHint.message}</p>}
      </div></Context>;
    })}
  </section></Context>;
}
export function ChangedTime({ at }: { at: number | undefined }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  if (at === undefined) return <>—</>;
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  const text = minutes < 1 ? "Just now" : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : minutes < 2880 ? "Yesterday" : new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return <PathTip text={new Date(at).toLocaleString()}><time dateTime={new Date(at).toISOString()}>{text}</time></PathTip>;
}
