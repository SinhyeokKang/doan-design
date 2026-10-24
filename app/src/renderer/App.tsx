import { useEffect, useRef, useState, type RefObject } from "react";
import type { Selection } from "../formats/types";
import type { FolderEntry } from "../main/view";
import type { ViewCommand } from "../main/index";
import { CanvasController, initialCanvasState, type CanvasState } from "./CanvasController";
import { projectNames } from "./projectRow";
import { groupProjects, cardRow } from "./homeCards";
import { Sidebar } from "./Sidebar";
import { useComments } from "./useComments";
import { RightPanel } from "./RightPanel";
import { updatedText } from "./canvasView";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { Wizard, type Reroot } from "./Onboarding";

export function App() {
  const [screen, setScreen] = useState<"home" | "workspace">("home");
  const [loadedRoot, setLoadedRoot] = useState<string | null>(null);
  const workspaceFocus = useRef<HTMLElement | null>(null);
  const currentScreen = useRef(screen);
  currentScreen.current = screen;
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [state, setState] = useState(initialCanvasState);
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const controller = useRef<CanvasController | null>(null);
  const [reroot, setReroot] = useState<(Reroot & { hadFocus: boolean }) | null>(null);
  const [wizard, setWizard] = useState<string | null>(null);
  const beforeWizard = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!viewport.current || !board.current || !overlay.current) return;
    const sendSelection = (selection: Selection | null) => {
      window.doan.setSelection(selection).catch((error: unknown) => console.error("selection:set failed", error));
    };
    const instance = new CanvasController(viewport.current, board.current, overlay.current, setState, sendSelection, selector => window.doan.inspect(selector));
    controller.current = instance;
    const stopFolders = window.doan.onFolders((next, focus) => {
      if (focus) {
        setLoadedRoot(root => root === focus.from ? focus.root : root);
        // Read before React replaces the old row, which takes the focus with it.
        const row = document.activeElement?.closest<HTMLElement>('[role="treeitem"][aria-level="1"]');
        setReroot(previous => ({ ...focus, seq: (previous?.seq ?? 0) + 1, hadFocus: row?.dataset.path === focus.from }));
      }
      setEntries(next); instance.updateEntries(next);
    });
    const stopCommands = window.doan.onViewCommand(name => { if (currentScreen.current === "workspace") instance.command(name); });
    return () => { stopFolders(); stopCommands(); instance.dispose(); controller.current = null; };
  }, []);
  useEffect(() => window.doan.onOnboardingOpen(opened => {
    const active = document.activeElement;
    // A reopen while the wizard is up keeps the focus it came from.
    if (!(active instanceof HTMLElement && active.closest(".ob-overlay"))) beforeWizard.current = active instanceof HTMLElement && active !== document.body ? active : null;
    setWizard(opened.session);
  }), []);
  useEffect(() => {
    if (wizard !== null || !restoreFocus.current) return;
    restoreFocus.current = false;
    const previous = beforeWizard.current;
    beforeWizard.current = null;
    // On first run nothing had focus, so it goes to the sidebar.
    const fallback = document.querySelector<HTMLElement>('.side [role="treeitem"][tabindex="0"]') ?? document.querySelector<HTMLElement>(".side .section-action");
    (previous?.isConnected ? previous : fallback)?.focus();
  }, [wizard]);
  const comments = useComments(state, controller, () => setScreen("workspace"));
  const home = () => {
    workspaceFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setScreen("home");
  };
  useEffect(() => window.doan.onMenuCommand(name => { if (name === "home") home(); }), []);
  useEffect(() => {
    controller.current?.setWorkspaceActive(screen === "workspace");
    if (screen === "home") {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(".home-body [data-path]"));
      (rows.find(row => row.dataset.path === loadedRoot) ?? rows[0])?.focus();
    } else {
      const previous = workspaceFocus.current;
      (previous?.isConnected && previous.closest(".workspace") ? previous : document.querySelector<HTMLElement>('.side [role="treeitem"][tabindex="0"]'))?.focus();
    }
  }, [screen, loadedRoot]);
  useEffect(() => {
    if (loadedRoot && !entries.some(entry => entry.path === loadedRoot)) { setLoadedRoot(null); setScreen("home"); }
  }, [entries, loadedRoot]);
  useEffect(() => { void window.doan.setMenuState({ screen: screen === "home" ? "home" : state.open ? "canvas" : "workspace", modal: wizard !== null || !!comments.dialog, toast: false }); }, [screen, state.open, wizard, !!comments.dialog]);
  const enter = (root: string, sameCanvas = false) => {
    if (root === loadedRoot) { setScreen("workspace"); return; }
    controller.current?.openWorkspace(root, next => { workspaceFocus.current = null; setLoadedRoot(next); setScreen("workspace"); }, sameCanvas);
  };
  const cards = groupProjects(entries, new Map(entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])));
  const card = cards.find(card => card.rows.some(row => row.path === loadedRoot));
  const entry = entries.find(entry => entry.path === loadedRoot);

  const command = (name: ViewCommand) => controller.current?.command(name);
  const names = projectNames(entries.map(entry => entry.path));
  const name = names.get(state.open?.folder ?? entries[0]?.path ?? "") ?? "";
  return <TooltipProvider>
  {screen === "home" && <main className="home-shell">
    <header className="top"><span className="traffic-space" aria-hidden="true" /><span className="logo"><i />doan</span><span className="spacer" /><button className="btn primary" onClick={() => void window.doan.addProjects()}>+ Add Project</button></header>
    <section className="home-body" aria-label="Projects home"><div className="sec">Projects</div>
      {!entries.length && <div className="empty"><b>No projects yet</b><p>Add a project to see its design canvases.</p><button className="btn primary" onClick={() => void window.doan.addProjects()}>Add Project…</button><p>Or drop folders anywhere in this window.</p></div>}
      <div className="cards">{cards.map(card => <section className="card" key={card.key} aria-label={card.name}><div className="card-head"><b className="card-name">{card.name}</b></div>{card.rows.map(row => <button className="wt" key={row.path} data-path={row.path} aria-label={`Open project ${row.path}`} aria-current={row.path === loadedRoot ? "true" : undefined} onClick={() => enter(row.path)}><span>{cardRow(row, loadedRoot, state.selection).summary?.branch ?? names.get(row.path)}</span><span>{cardRow(row, loadedRoot, state.selection).chip}</span><span className="wt-path">{row.path}</span></button>)}</section>)}</div>
    </section>
  </main>}
  <main className="app-shell workspace" style={{ visibility: screen === "home" ? "hidden" : "visible" }} inert={screen === "home"} aria-hidden={screen === "home"}>
    <TopBar state={state} name={card?.name ?? name} reload={() => command("reload")} home={home} entry={entry} rows={card?.rows ?? []} enter={root => enter(root, true)} />
    <Sidebar entries={entries.filter(entry => entry.path === loadedRoot)} names={names} state={state} reroot={reroot} open={(folder, row) => controller.current?.openCanvas(folder, row)} jump={index => controller.current?.jump(index)} />
    <CanvasPane viewport={viewport} board={board} overlay={overlay} state={state} noProjects={entries.length === 0} command={command} />
    <div className="right-stack"><RightPanel state={state} selectPath={item => controller.current?.selectPath(item)} />{comments.panel}</div>
  </main>
  {comments.dialog}
  {wizard !== null && <Wizard key={wizard} session={wizard} entries={entries} reroot={reroot} onClose={() => { restoreFocus.current = true; setWizard(null); }} />}
  </TooltipProvider>;
}

function TopBar({ state, name, reload, home, entry, rows, enter }: { state: CanvasState; name: string; reload: () => void; home: () => void; entry: FolderEntry | undefined; rows: FolderEntry[]; enter: (root: string) => void }) {
  const [switcher, setSwitcher] = useState(false);
  const branch = entry?.kind === "list" ? cardRow(entry, null, null).summary?.branch : undefined;
  return <header className="top">
    <span className="traffic-space" aria-hidden="true" />
    <button className="back" aria-label="Go Home" onClick={home}>←</button><span className="divider" />
    <div className="crumbs"><span className="repo">{name}</span>{branch && <><span className="sep">›</span><button className="branch" aria-label="Switch worktree" aria-expanded={switcher} disabled={rows.length < 2} onClick={() => setSwitcher(!switcher)}><span className="bn">{branch}</span><span className="caret">▾</span></button></>}{state.open && <><span className="sep">›</span><span className="canvas">{state.open.canvas.replace(/^design\//, "")}</span></>}</div>
    {switcher && <div className="menu worktree-menu" role="menu" aria-label="Worktrees" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setSwitcher(false); } }}>{rows.map(row => <button className="mi" role="menuitem" key={row.path} disabled={row.kind !== "list"} onClick={() => { setSwitcher(false); enter(row.path); }}>{cardRow(row, null, null).summary?.branch ?? row.path.split("/").at(-1)} {cardRow(row, null, null).chip}</button>)}</div>}
    <span className="chip">{state.open?.row.width === undefined ? "—" : `${state.open.row.width} px`}</span>
    <span className="spacer" />
    <button className="btn ghost" aria-label="Reload canvas" disabled={!state.open} onClick={reload}>Reload <span className="kbd">⌘R</span></button>
  </header>;
}

function CanvasPane({ viewport, board, overlay, state, noProjects, command }: {
  viewport: RefObject<HTMLDivElement | null>; board: RefObject<HTMLDivElement | null>; overlay: RefObject<HTMLDivElement | null>;
  state: CanvasState; noProjects: boolean; command: (name: ViewCommand) => void;
}) {
  return <section className="area" role="region" aria-label="Canvas" ref={viewport}>
    <div className="board" ref={board} hidden />
    <div className="overlay" ref={overlay} />
    <div className="canvas-notices">
      {state.error && <div className="canvas-notice" role="status">{state.error}</div>}
      {state.unlisted && <div className="canvas-notice" role="status">This page is not a listed canvas</div>}
      {state.notice && <div className="canvas-notice" role="status">{state.notice}</div>}
    </div>
    {state.status && <div className="canvas-status" role="status">
      {state.status === "empty" && noProjects ? <div className="empty"><b>No projects yet</b><p>Open a repo with Open Project… A repo without <code>.doan/</code> shows how to set it up.</p><button className="btn primary" onClick={() => void window.doan.openFolder()}>Open Project… <span className="kbd">⌘O</span></button></div>
        : state.status === "loading" ? <p><span className="spinner" aria-hidden="true" />Loading…</p>
        : state.status === "failed" ? <div><b>Couldn’t load the canvas</b><br />Run doan check in a terminal<br /><br /><button className="btn" onClick={() => command("reload")}>Reload</button></div>
        : state.status === "noWidth" ? <p><b>Missing or invalid board width.</b>{state.message.slice("Missing or invalid board width.".length)}</p>
        : <p>{state.message}</p>}
    </div>}
    {state.updated && state.open && <output className="updated meta" aria-label={updatedText(state.updated)}><span className="dot" /> {updatedText(state.updated)}</output>}
    <div className={`zctl${state.hasFrame ? "" : " disabled"}`}>
      <div className="zoom">
        <button aria-label="Zoom out" disabled={!state.hasFrame} onClick={() => command("zoomOut")}>−</button>
        <output aria-label={state.hasFrame ? `Zoom ${state.zoom}%` : "Zoom"}>{state.hasFrame ? `${state.zoom}%` : "—"}</output>
        <button aria-label="Zoom in" disabled={!state.hasFrame} onClick={() => command("zoomIn")}>+</button>
      </div>
      <Tooltip><TooltipTrigger asChild><button className="btn" aria-label="Fit" disabled={!state.hasFrame} onClick={() => command("fit")}>Fit <span className="kbd">⌘1</span></button></TooltipTrigger><TooltipContent>Fit to width</TooltipContent></Tooltip>
    </div>
  </section>;
}
