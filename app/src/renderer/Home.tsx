import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ContextMenu, DropdownMenu } from "radix-ui";
import type { ProjectCanvasComments } from "../main/projectComments";
import type { FolderEntry } from "../main/view";
import { pluralComments } from "../comments/panelText";
import { displayPath } from "./projectDisplay";
import { cardRow, groupProjects, measureNarrow, ProjectCommentReads, type HomeCard, type RowAction } from "./homeCards";
import type { SelectionView } from "./selection";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

import type { SetupStatus } from "../main/setupBroker";
import { homeAlerts } from "../setup/homeAlerts";
import { CONNECTION_LABELS, CONNECTION_NAMES, connectionBanner } from "./connectionRowView";
import { ConnectionParts } from "./ConnectionRows";

interface HomeProps {
  homeDirectory: string | null;
  entries: FolderEntry[];
  loaded: string | null;
  selection: SelectionView | null;
  highlight: string[];
  rerootHint?: { root: string; message: string } | null;
  // `comments:project` counts by root; a root without one shows no review count.
  comments?: ReadonlyMap<string, readonly ProjectCanvasComments[]>;
  enter: (root: string) => void;
  action: (action: RowAction, root: string) => void;
  remove: (roots: string[]) => void;
}
export function Home(props: HomeProps) {
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  useEffect(() => window.doan.onSetupStatus(setSetup), []);
  const alerts = setup?.summary ? homeAlerts(setup.summary, props.entries, setup.onboardingClosed) : {};
  const cards = groupProjects(props.entries, new Map(props.entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])));
  const bannerLines = (alerts.banner ?? []).map(row => {
    const cause = setup?.causes?.[row];
    return cause ? connectionBanner({ ...cause, ...(cause.path ? { path: displayPath(cause.path, props.homeDirectory) } : {}) }, row) : [`${CONNECTION_NAMES[row]} needs attention. Open Settings to fix the connection.`];
  }).filter((parts, index, lines) => lines.findIndex(line => JSON.stringify(line) === JSON.stringify(parts)) === index);
  return <main className={`home-shell${alerts.banner ? " with-setup-banner" : ""}`}>
    <header className="top"><span className="traffic-space" aria-hidden="true" /><span className="logo"><i />doan</span><span className="spacer" /><div className="conns" role="group" aria-label="Connections">{(["cli", "claude", "codex"] as const).map(row => {
      const state = setup?.summary?.[row]; const label = state ? CONNECTION_LABELS[state] : "Checking…";
      return <button className="conn" key={row} aria-label={`${CONNECTION_NAMES[row]}: ${label}`} onClick={() => void window.doan.openSettings({ tab: "connections" })}><span className={`conn-dot${state === "connected" ? "" : state === "needs-attention" ? " warn" : state === "couldnt-check" ? " unknown" : " off"}`} aria-hidden="true" />{CONNECTION_NAMES[row]} <span className="st">{label}</span></button>;
    })}</div><button className="btn" aria-label="Add Project…" onClick={() => void window.doan.addProjects()}>+ Add Project… <span className="kbd">⌘O</span></button></header>
    {alerts.banner && <div className="ws-status banner" role="status" aria-label="Connection problem"><span className="ob-chip warn">Needs attention</span><span className="text">{bannerLines.map(parts => <span className="line" key={JSON.stringify(parts)}><ConnectionParts parts={parts} /></span>)}</span><button className="btn" onClick={() => void window.doan.openSettings({ tab: "connections", connection: alerts.banner![0]! })}>Fix…</button><button className="btn ghost" disabled={setup?.checking || setup?.busy} onClick={() => void window.doan.checkSetupAgain()}>{setup?.checking ? "Checking…" : "Check Again"}</button>{setup?.busy && <span role="status">Another window is running a setup step. These buttons work again when it finishes.</span>}</div>}
    <section className={`home-body${alerts.finishCard ? " with-finish" : ""}`} aria-label="Home" style={cards.length || alerts.finishCard ? undefined : { padding: 0 }}>
      {alerts.finishCard && <section className={`finish${cards.length ? "" : " empty-home"}`} aria-labelledby="finish-heading"><div className="finish-head"><h2 id="finish-heading">Finish setting up doan</h2><span className="meta">{alerts.finishCard.length} left</span></div>{alerts.finishCard.map(item => <div className="finish-item" key={item}><span className="glyph" aria-hidden="true">○</span><b>{item === "cli" ? "Connect the doan command" : item === "agents" ? "Connect Claude Code or Codex" : "Add a project"}</b><p>{item === "cli" ? "Agents run doan through it." : item === "agents" ? "Your agent makes the canvases you review here." : "Canvases live in a repository’s design/ folder."}</p><button className="btn" onClick={() => item === "project" ? void window.doan.addProjects() : void window.doan.openSettings({ tab: "connections" })}>{item === "project" ? "Add Project…" : "Settings › Connections"}</button></div>)}</section>}
      {cards.length ? <><div className="sec">Projects <span className="r">{cards.length}</span></div><div className="cards">{cards.map(card => <ProjectCard key={card.key} card={card} {...props} />)}</div></>
        : <div className="empty"><b>No projects yet</b><p>Add a project to see its design canvases.</p><button className="btn primary" onClick={() => void window.doan.addProjects()}>Add Project… <span className="kbd">⌘O</span></button><p className="meta">Or drop folders anywhere in this window.</p></div>}
    </section>
  </main>;
}

// Counts for `roots` (list rows only), read again when a root's ls row
// changes or main invalidates its comments. `refresh` is for a change main
// does not announce, such as a review-state raise.
export function useProjectComments(entries: readonly FolderEntry[], roots: readonly string[]): { comments: ReadonlyMap<string, readonly ProjectCanvasComments[]>; refresh: (root: string) => void } {
  const [comments, setComments] = useState<ReadonlyMap<string, readonly ProjectCanvasComments[]>>(new Map());
  const reads = useRef<ProjectCommentReads | null>(null);
  useEffect(() => {
    const current = new ProjectCommentReads((root, revision) => window.doan.projectComments(root, revision), setComments);
    reads.current = current;
    const stop = window.doan.onCommentsInvalidated(change => current.refresh(change.root));
    return () => { stop(); current.dispose(); reads.current = null; };
  }, []);
  const rootsKey = roots.join("\0");
  const tracked = useMemo(() => new Map(entries.flatMap(entry => entry.kind === "list" && roots.includes(entry.path) ? [[entry.path, JSON.stringify(entry)] as const] : [])), [entries, rootsKey]);
  // After the effect above, so the first roots reach a live reader.
  useEffect(() => { reads.current?.track(tracked); }, [tracked]);
  const refresh = useCallback((root: string) => reads.current?.refresh(root), []);
  return { comments, refresh };
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
    {entry.kind === "notFound" ? <span className="text" title={`${displayPath(entry.path, workspace.homeDirectory)} is gone or moved.`}><code>{displayPath(entry.path, workspace.homeDirectory)}</code> is gone or moved.</span> : entry.kind === "uninitialized" ? <span className="text" title={`${workspace.name} is not set up.`}>{workspace.name} is not set up.</span> : <span className="spacer" />}
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
  const narrow = useNarrowRows(element);
  useEffect(() => { if (flash) element.current?.scrollIntoView({ block: "nearest" }); }, [flash]);
  const actions = [{ label: "Remove all", run: () => props.remove(card.rows.map(row => row.path)) }];
  return <Context actions={actions}><section ref={element} className={`card${flash ? " flash" : ""}`} aria-label={card.name}>
    <div className="card-head"><PathTip text={card.name}><span className="card-name">{card.name}</span></PathTip>{card.rows.length > 1 && <span className="meta">{card.rows.length} worktrees</span>}<span className="spacer" /><More label={`Project menu ${card.name}`} actions={actions} /></div>
    {card.rows.map((entry, index) => {
      const row = cardRow(entry, props.loaded, props.selection, props.comments?.get(entry.path));
      const review = row.summary?.toReview ? `${row.summary.toReview} resolved to review` : undefined;
      const actions = [{ label: "Show in Finder", run: () => props.action("showInFinder", entry.path) }, { label: "Project Settings…", run: () => { void window.doan.openSettings({ tab: "projects", project: entry.path }); } }, { label: "Remove from doan", run: () => props.remove([entry.path]) }];
      const activate = (node: HTMLElement) => entry.kind === "list" ? props.enter(entry.path) : node.querySelector<HTMLButtonElement>(".wt-actions button")?.focus();
      return <Context key={entry.path} actions={actions}><div className={`wt${row.chip ? " problem" : ""}${narrow.has(entry.path) ? " narrow" : ""}`} data-path={entry.path} role={row.chip ? "group" : "button"} aria-label={`Project ${row.summary?.branch ?? displayPath(entry.path, props.homeDirectory)} · ${row.chip ?? `${row.summary?.canvases ?? 0} ${row.summary?.canvases === 1 ? "canvas" : "canvases"} · ${pluralComments(row.summary?.openComments ?? 0)}${review ? ` · ${review}` : ""}`} · ${entry.path}`} aria-current={row.current ? "true" : undefined} tabIndex={active === entry.path ? 0 : -1}
        onFocus={event => { if (event.target === event.currentTarget) setFocused(entry.path); }} onClick={event => { if (!(event.target instanceof Element && event.target.closest("button"))) activate(event.currentTarget); }}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(event.currentTarget); }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); const next = element.current?.querySelectorAll<HTMLElement>(".wt")[index + (event.key === "ArrowUp" ? -1 : 1)]; next?.focus(); }
        }}>
        <span className="wt-label"><span className="glyph" aria-hidden="true">{row.summary?.branch ? "⎇" : "◌"}</span><PathTip text={row.summary?.branch ?? entry.path}><span className={`name${row.summary?.branch ? "" : " path"}`}>{row.summary?.branch ?? displayPath(entry.path, props.homeDirectory)}</span></PathTip>{row.current && <span className="open-tag">Open</span>}</span>
        <span className="wt-end">{row.chip ? <span className={`ob-chip${row.chip === "Config error" ? " err" : row.chip === "Missing" || row.chip === "CLI error" ? " warn" : ""}`}>{row.chip}</span> : row.summary && <span className="wt-sum"><span>{row.summary.canvases} {row.summary.canvases === 1 ? "canvas" : "canvases"}</span>{row.summary.openComments > 0 && <> · <span className="hot">{row.summary.openComments} open</span></>}{review && <> · <span className="review">{review}</span></>} · <span><ChangedTime at={row.summary.changedAt} /></span></span>}<More row label={`Row menu ${entry.path}`} actions={actions} /></span>
        {row.summary?.branch && <PathTip text={entry.path}><span className="wt-path">{displayPath(entry.path, props.homeDirectory)}</span></PathTip>}
        {row.selected && <PathTip text={`Selected: ${row.selected}`}><span className="wt-sel">Selected: <b>{row.selected}</b></span></PathTip>}
        {row.chip && <ProblemActions entry={entry} action={props.action} />}
        {props.rerootHint?.root === entry.path && <p className="wt-sel" role="status">{props.rerootHint.message}</p>}
      </div></Context>;
    })}
  </section></Context>;
}
// Paths of the card's rows that show their summary on its own line,
// measured again on every render and whenever the card's width changes.
function useNarrowRows(card: RefObject<HTMLElement | null>): ReadonlySet<string> {
  const [narrow, setNarrow] = useState<ReadonlySet<string>>(new Set());
  const measure = useCallback(() => {
    if (!card.current) return;
    const next = measureNarrow(card.current);
    setNarrow(previous => previous.size === next.size && [...next].every(path => previous.has(path)) ? previous : next);
  }, [card]);
  useLayoutEffect(measure);
  useEffect(() => {
    if (!card.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [measure]);
  return narrow;
}

export function ChangedTime({ at }: { at: number | undefined }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  if (at === undefined) return <>—</>;
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  const text = minutes < 1 ? "Just now" : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : minutes < 2880 ? "Yesterday" : new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return <PathTip text={new Date(at).toLocaleString()}><time dateTime={new Date(at).toISOString()}>{text}</time></PathTip>;
}
