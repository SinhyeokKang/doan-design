import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ProjectCanvasComments } from "../main/projectComments";
import type { FolderEntry } from "../main/view";
import { displayPath } from "./projectDisplay";
import { cardRow, ProjectCommentReads, type ProjectRead, type RowAction } from "./homeCards";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { AlertIcon } from "./AlertIcon";
import { HomeComposer, type HomeComposerProps } from "./HomeComposerView";
import { groupProjects } from "./homeCards";
import { pickGreeting } from "./homeComposer";

interface HomeProps extends Omit<HomeComposerProps, "greeting"> {
  header: ReactNode;
  sidebar: ReactNode;
}
// Home is the workspace's shell with the composer as its body (buzz-home design §3): the project cards, the setup
// checklist and the connection banner are gone; projects live in the sidebar, connections in Settings.
export function Home({ header, sidebar, ...composer }: HomeProps) {
  // One greeting per visit, never the previous one; it does not animate (design §5).
  const [greeting] = useState(() => {
    const hasProject = groupProjects(composer.entries, new Map()).length > 0;
    const picked = pickGreeting(composer.memory.current.greeting, Math.random, hasProject);
    composer.memory.current = { ...composer.memory.current, greeting: picked };
    return picked;
  });
  return <main className="app-shell home-shell">
    {header}
    {sidebar}
    <section className="home-panel" aria-label="Home">
      <div className="home-atmosphere" aria-hidden="true" />
      <HomeComposer {...composer} greeting={greeting} />
    </section>
  </main>;
}

// Counts for `roots` (list rows only), read again when a root's ls row
// changes or main invalidates its comments. `refresh` is for a change main
// does not announce, such as a review-state raise.
// `reads`: each root's whole last read, for the Feedback panel; `comments`:
// the counts of the list ones, for the Overview cards.
export function useProjectComments(entries: readonly FolderEntry[], roots: readonly string[]): { comments: ReadonlyMap<string, readonly ProjectCanvasComments[]>; reads: ReadonlyMap<string, ProjectRead>; refresh: (root: string) => void } {
  const [items, setItems] = useState<ReadonlyMap<string, ProjectRead>>(new Map());
  const comments = useMemo(() => new Map([...items].flatMap(([root, read]) => read.kind === "list" ? [[root, read.canvases] as const] : [])), [items]);
  const reads = useRef<ProjectCommentReads | null>(null);
  useEffect(() => {
    const current = new ProjectCommentReads((root, revision) => window.doan.projectComments(root, revision), setItems);
    reads.current = current;
    const stop = window.doan.onCommentsInvalidated(change => current.invalidated(change.root));
    return () => { stop(); current.dispose(); reads.current = null; };
  }, []);
  const rootsKey = roots.join("\0");
  const tracked = useMemo(() => new Map(entries.flatMap(entry => entry.kind === "list" && roots.includes(entry.path) ? [[entry.path, JSON.stringify(entry)] as const] : [])), [entries, rootsKey]);
  // After the effect above, so the first roots reach a live reader.
  useEffect(() => { reads.current?.track(tracked); }, [tracked]);
  const refresh = useCallback((root: string) => reads.current?.refresh(root), []);
  return { comments, reads: items, refresh };
}

export function PathTip({ text, children }: { text: string; children: ReactNode }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{text}</TooltipContent></Tooltip>;
}
const labels: Record<RowAction, string> = { setUp: "Set Up…", locate: "Locate…", remove: "Remove", showInFinder: "Show in Finder", retry: "Retry", details: "Details" };
export function ProblemActions({ entry, action, workspace }: { entry: FolderEntry; action: (action: RowAction, root: string) => void; workspace: { name: string; homeDirectory: string | null; home: () => void } }) {
  const [details, setDetails] = useState(false);
  const row = cardRow(entry, null, null);
  const actions = <div className="wt-actions">{row.actions.map(name => <button className={`btn doan-button${name === "remove" || name === "details" ? " ghost" : ""}`} data-ui-variant={name === "remove" || name === "details" ? undefined : "subtle"} data-ui-size="sm" key={name} aria-label={labels[name]} aria-expanded={name === "details" ? details : undefined} onClick={() => name === "details" ? setDetails(!details) : action(name, entry.path)}>{labels[name]}{name === "details" && (details ? " ▾" : " ▸")}</button>)}</div>;
  const message = details && row.detail && <span className="ob-msg error"><AlertIcon /><span>{row.detail}</span></span>;
  return <div className="ws-recovery" role="region" aria-label="Project status"><div className="ws-status" role="status">
    <span className={`ob-chip${entry.kind === "error" ? " err" : entry.kind === "cliError" || entry.kind === "notFound" ? " warn" : ""}`}>{row.chip}</span>
    {entry.kind === "notFound" ? <span className="text" title={`${displayPath(entry.path, workspace.homeDirectory)} is gone or moved.`}><code>{displayPath(entry.path, workspace.homeDirectory)}</code> is gone or moved.</span> : entry.kind === "uninitialized" ? <span className="text" title={`${workspace.name} is not set up.`}>{workspace.name} is not set up.</span> : <span className="spacer" />}
    {actions}<button className="btn ghost doan-button" data-ui-size="sm" onClick={workspace.home}>Go Home</button>
  </div>{message && <div className="ws-detail">{message}</div>}</div>;
}

export function ChangedTime({ at }: { at: number | undefined }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  if (at === undefined) return <>—</>;
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  const text = minutes < 1 ? "Just now" : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : minutes < 2880 ? "Yesterday" : new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return <PathTip text={new Date(at).toLocaleString()}><time dateTime={new Date(at).toISOString()}>{text}</time></PathTip>;
}
