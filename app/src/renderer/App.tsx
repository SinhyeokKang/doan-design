import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { canvasLabel } from "./canvasTree";
import type { Selection } from "../formats/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { ViewCommand } from "../main/index";
import { CanvasController, initialCanvasState, type CanvasState } from "./CanvasController";
import { projectNames } from "./projectRow";
import { DropdownMenu } from "radix-ui";
import { displayPath } from "./projectDisplay";
import { Home, ProblemActions, PathTip } from "./Home";
import { AddProjectsDialog, SetUpFolderConfirm } from "./AddProjectsDialog";
import { ProjectSetupDialog } from "./ProjectSetupDialog";
import { useToast } from "./Toast";
import { DropOverlay } from "./DropOverlay";
import type { AddOutcome } from "../main/addProjects";
import type { RowAction } from "./homeCards";
import { groupProjects, cardRow } from "./homeCards";
import { Sidebar } from "./Sidebar";
import { useComments } from "./useComments";
import { RightPanel } from "./RightPanel";
import { updatedText } from "./canvasView";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { Wizard, type Reroot } from "./Onboarding";
import { FirstPromptContext, useFirstPromptWait } from "./FirstPrompt";
import { ProjectOverview, useThumbnails } from "./ProjectOverview";
import { QuickOpen } from "./QuickOpenDialog";
import { pickTarget, type SearchResult } from "./quickOpen";
import { restorePlan, RESTORE_LOADING_WAIT_MS } from "../restore/restorePlan";
import type { UiState } from "../restore/uiState";

export function App() {
  const [homeDirectory, setHomeDirectory] = useState<string | null>(null);
  const [screen, setScreen] = useState<"home" | "workspace">("home");
  const [locating, setLocating] = useState<{ from: string; root: string | null } | null>(null);
  const [loadedRoot, setLoadedRoot] = useState<string | null>(null);
  const [rerootHint, setRerootHint] = useState<{ root: string; message: string; seen?: FolderEntry } | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [scan, setScan] = useState<string | null>(null);
  const [confirms, setConfirms] = useState<AddOutcome["confirms"]>([]);
  const [setup, setSetup] = useState<string | null>(null);
  const beforeModal = useRef<HTMLElement | null>(null);
  const focusAfterModal = useRef(false);
  const focusModalPath = useRef<string | null>(null);
  const toast = useToast();
  const workspaceFocus = useRef<HTMLElement | null>(null);
  const currentScreen = useRef(screen);
  currentScreen.current = screen;
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [state, setState] = useState(initialCanvasState);
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const controller = useRef<CanvasController | null>(null);
  const [reroot, setReroot] = useState<Reroot | null>(null);
  const [wizard, setWizard] = useState<string | null>(null);
  const beforeWizard = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, string[]>>({});
  // The saved ui state until the restore is applied, then "done"; null while it is read.
  const [restore, setRestore] = useState<{ state: UiState | null; started: number } | "done" | null>(null);
  const [foldersSeen, setFoldersSeen] = useState(false);
  const [restoreTick, setRestoreTick] = useState(0);
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
        setReroot(previous => ({ ...focus, seq: (previous?.seq ?? 0) + 1 }));
      }
      setEntries(next); instance.updateEntries(next); setFoldersSeen(true);
    });
    instance.canvasRemoved = row => live.current.toast.show(`${canvasLabel(row)} was removed from design/`);
    instance.viewChanged = () => live.current.save();
    const stopCommands = window.doan.onViewCommand(name => { if (currentScreen.current === "workspace") instance.command(name); });
    return () => { stopFolders(); stopCommands(); instance.dispose(); controller.current = null; };
  }, []);
  useEffect(() => { void window.doan.homeDirectory().then(setHomeDirectory).catch(console.error); }, []);
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
    const fallback = document.querySelector<HTMLElement>('.side [role="treeitem"][tabindex="0"]') ?? document.querySelector<HTMLElement>('.home-body [data-path][tabindex="0"], .home-shell button');
    (previous?.isConnected ? previous : fallback)?.focus();
  }, [wizard]);
  const comments = useComments(state, controller, () => setScreen("workspace"), entries);
  const home = () => {
    if (currentScreen.current === "workspace") workspaceFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setScreen("home");
  };
  useEffect(() => {
    controller.current?.setWorkspaceActive(screen === "workspace");
    if (screen === "home") {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(".home-body [data-path]"));
      (rows.find(row => row.dataset.path === loadedRoot) ?? rows[0])?.focus();
    } else {
      if (comments.session.draft.draft) { document.querySelector<HTMLTextAreaElement>(".comments-panel textarea")?.focus(); return; }
      const previous = workspaceFocus.current;
      (previous?.isConnected && previous.closest(".workspace") ? previous : document.querySelector<HTMLElement>('.side [role="treeitem"][tabindex="0"]'))?.focus();
    }
  }, [screen, loadedRoot]);
  useEffect(() => {
    if (loadedRoot && loadedRoot !== locating?.from && !entries.some(entry => entry.path === loadedRoot)) { setLoadedRoot(null); setScreen("home"); }
  }, [entries, loadedRoot, locating]);
  useEffect(() => {
    const root = locating?.root;
    if (!root) return;
    const next = entries.find(entry => entry.path === root);
    if (!next || next.kind === "loading") return;
    if (next.kind === "list") controller.current?.openWorkspace(root, setLoadedRoot);
    setLocating(null);
  }, [entries, locating]);
  useEffect(() => {
    void window.doan.readUiState().then(state => state, () => null).then(state => setRestore({ state, started: performance.now() }));
  }, []);
  useEffect(() => {
    if (restore === null || restore === "done" || !foldersSeen) return;
    const elapsed = performance.now() - restore.started;
    const plan = restorePlan(restore.state, entries, elapsed);
    if (plan.kind === "wait") {
      const timer = setTimeout(() => setRestoreTick(tick => tick + 1), RESTORE_LOADING_WAIT_MS - elapsed + 10);
      return () => clearTimeout(timer);
    }
    setRestore("done");
    if (!restore.state) return;
    setExpanded(restore.state.expanded);
    for (const [root, item] of Object.entries(restore.state.lastByRoot)) controller.current?.remember(root, item);
    if (plan.kind === "home") return;
    // The workspace opens its remembered canvas and view, as a worktree switch does.
    controller.current?.remember(plan.root, plan.canvas?.view ? { canvas: plan.canvas.path, view: plan.canvas.view } : null);
    const listed = entries.find(entry => entry.path === plan.root);
    const row = plan.canvas && !plan.canvas.view && listed?.kind === "list" ? listed.canvases.find(row => row.path === plan.canvas?.path) : undefined;
    controller.current?.openWorkspace(plan.root, next => {
      setLoadedRoot(next); setScreen("workspace");
      if (row) controller.current?.openCanvas(next, row);
    });
    if (plan.missingCanvas) toast.show(`${canvasLabel({ path: plan.missingCanvas, open: 0, resolved: 0, url: "" })} is no longer in design/`);
  }, [restore, foldersSeen, entries, restoreTick]);
  // Sent at once, pans included: main debounces the write and flushes it on
  // quit, while a value still waiting here would be lost to a quick ⌘Q.
  const save = () => {
    if (restore !== "done") return;
    const { screen, loadedRoot, open, expanded } = persisted.current;
    const instance = controller.current;
    if (!instance) return;
    const canvas = open && open.folder === loadedRoot ? open.canvas : undefined;
    const view = instance.currentView();
    // The loaded root's canvas is in `lastByRoot` too, so a restart on Home still reopens it on entry.
    const lastByRoot = { ...instance.memory(), ...(loadedRoot && canvas ? { [loadedRoot]: { canvas, view } } : {}) };
    const state: UiState = { screen, expanded, lastByRoot, ...(loadedRoot ? { root: loadedRoot } : {}), ...(canvas ? { canvas, view } : {}) };
    void window.doan.saveUiState(state).catch(console.error);
  };
  const persisted = useRef({ screen, loadedRoot, open: state.open, expanded });
  persisted.current = { screen, loadedRoot, open: state.open, expanded };
  // At commit, so a change already on screen has been sent.
  useLayoutEffect(save, [restore, screen, loadedRoot, state.open, expanded]);
  const enter = (root: string, sameCanvas = false) => {
    if (root === loadedRoot) { setScreen("workspace"); return; }
    controller.current?.openWorkspace(root, next => { workspaceFocus.current = null; setLoadedRoot(next); setScreen("workspace"); }, sameCanvas);
  };
  const cards = groupProjects(entries, new Map(entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])));
  const card = cards.find(card => card.rows.some(row => row.path === loadedRoot));
  const entry = entries.find(entry => entry.path === loadedRoot);

  const modal = wizard !== null || !!comments.dialog || setup !== null || scan !== null || confirms.length > 0 || quickOpen;
  const live = useRef({ home, enter, toast, modal, save });
  live.current = { home, enter, toast, modal, save };
  const rememberFocus = () => { beforeModal.current = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>(".home-body [data-path]") ?? document.activeElement : null; };
  const modalClosed = () => { focusAfterModal.current = true; };
  useEffect(() => {
    if (modal || !focusAfterModal.current) return;
    focusAfterModal.current = false;
    const previous = (focusModalPath.current ? Array.from(document.querySelectorAll<HTMLElement>(".home-body [data-path]")).find(row => row.dataset.path === focusModalPath.current) : null) ?? beforeModal.current;
    focusModalPath.current = null;
    (previous?.isConnected ? previous : document.querySelector<HTMLElement>('.home-body [data-path][tabindex="0"], .home-shell button'))?.focus();
  }, [modal, entries]);
  useEffect(() => {
    if (setup && !entries.some(entry => entry.path === setup && (entry.kind === "uninitialized" || entry.kind === "loading"))) {
      const root = reroot?.from === setup ? reroot.root : setup;
      focusModalPath.current = root;
      beforeModal.current = Array.from(document.querySelectorAll<HTMLElement>(".home-body [data-path]")).find(row => row.dataset.path === root) ?? null;
      setSetup(null); modalClosed();
    }
  }, [setup, entries, reroot]);
  useEffect(() => {
    if (!rerootHint) return;
    const entry = entries.find(entry => entry.path === rerootHint.root);
    if (!entry) setRerootHint(null);
    else if (!rerootHint.seen || rerootHint.seen.kind === "loading") { if (entry !== rerootHint.seen) setRerootHint({ ...rerootHint, seen: entry }); }
    else if (entry !== rerootHint.seen) setRerootHint(null);
  }, [entries, rerootHint]);
  useEffect(() => { if (!highlight.length) return; const timer = setTimeout(() => setHighlight([]), 2400); return () => clearTimeout(timer); }, [highlight]);
  const added = (paths: string[]) => {
    const root = paths.at(-1);
    if (!root) return;
    if (currentScreen.current === "home") setHighlight(paths);
    else live.current.toast.show(`Added ${root.split("/").at(-1)}`, "Open", () => live.current.enter(root));
  };
  useEffect(() => window.doan.onAddOutcome(outcome => {
    added(outcome.added);
    if (outcome.duplicate) { live.current.home(); setHighlight([...outcome.added, outcome.duplicate]); }
    if (outcome.messages.length) live.current.toast.show(outcome.messages.join("\n"));
    if (outcome.scanId || outcome.confirms.length) rememberFocus();
    setScan(outcome.scanId); setConfirms(outcome.confirms);
  }), []);
  async function remove(paths: string[]) {
    const result = await window.doan.removeProjects(paths);
    if (result.kind === "removed") toast.show(`${result.label} removed. Files stay on disk.`, "Undo", () => { void window.doan.restoreProjects(result.removalId).catch(console.error); }, () => { void window.doan.forgetRemoval(result.removalId).catch(console.error); });
  }
  function action(name: RowAction, root: string) {
    if (name === "setUp") { rememberFocus(); setSetup(root); }
    else if (name === "remove") void remove([root]);
    else if (name === "showInFinder") void window.doan.revealProject(root).catch(console.error);
    else if (name === "retry") void window.doan.reopenFolder(root).catch(console.error);
    else if (name === "locate") {
      const workspace = loadedRoot === root && currentScreen.current === "workspace";
      if (workspace) setLocating({ from: root, root: null });
      void window.doan.locateProject(root).then(result => {
        if (result.kind === "refused") toast.show(result.message);
        if (workspace && result.kind === "located") { setLoadedRoot(result.root); setLocating({ from: root, root: result.root }); }
        else if (workspace) setLocating(null);
      }).catch(error => { if (workspace) setLocating(null); console.error(error); });
    }
  }
  useEffect(() => window.doan.onProjectAction(request => {
    if (live.current.modal) return;
    if (request.action === "details") {
      const entry = entries.find(entry => entry.path === request.path);
      if (entry?.kind === "error") toast.show(entry.message);
    } else action(request.action, request.path);
  }), [entries, loadedRoot]);
  useEffect(() => window.doan.onMenuCommand(name => {
    if (live.current.modal) return;
    if (name === "home") live.current.home();
    else if (name === "quickOpen") setQuickOpen(true);
    else if (live.current.toast.toast?.action === "Undo") live.current.toast.action();
  }), []);
  useEffect(() => { void window.doan.setMenuState({ screen: screen === "home" ? "home" : state.open ? "canvas" : "workspace", modal, toast: toast.toast?.action === "Undo" }); }, [screen, state.open, modal, toast.toast?.action]);
  const command = (name: ViewCommand) => controller.current?.command(name);
  function pick(result: SearchResult) {
    setQuickOpen(false);
    const target = entries.find(entry => entry.path === result.root);
    const row = target?.kind === "list" ? target.canvases.find(row => row.path === result.path) : undefined;
    if (!row) return;
    const frameId = result.kind === "frame" ? result.frameId : undefined;
    const found = (ok: boolean) => { if (!ok) live.current.toast.show("This frame is not in the rendered canvas"); };
    const openIt = (root: string) => controller.current?.openCanvas(root, row, frameId, frameId === undefined ? undefined : { found });
    if (pickTarget(result, loadedRoot, state.open?.canvas ?? null) === "switch") controller.current?.openWorkspace(result.root, next => { workspaceFocus.current = null; setLoadedRoot(next); setScreen("workspace"); openIt(next); });
    else { setScreen("workspace"); openIt(result.root); }
  }
  const thumbs = useThumbnails(entry?.kind === "list" ? entry.path : null, entry?.kind === "list" ? entry.canvases : []);
  const overview = screen === "workspace" && entry?.kind === "list" && !state.open ? entry : null;
  const rendered = useMemo(() => state.open && state.layout ? { root: state.open.folder, path: state.open.canvas, frames: state.layout.frames } : undefined, [state.open?.folder, state.open?.canvas, state.layout]);
  const names = projectNames(entries.map(entry => entry.path));
  const name = names.get(state.open?.folder ?? entries[0]?.path ?? "") ?? "";
  const firstPrompt = useFirstPromptWait({
    entries, wizardOpen: wizard !== null, workspaceRoot: screen === "workspace" ? loadedRoot : null,
    toast: (message, label, run) => toast.show(message, label, run),
    projectName: root => cards.find(card => card.rows.some(row => row.path === root))?.name ?? names.get(root) ?? root,
    openCanvas: (root: string, row: CanvasRow) => {
      if (root === loadedRoot) { setScreen("workspace"); controller.current?.openCanvas(root, row); }
      else controller.current?.openWorkspace(root, next => { workspaceFocus.current = null; setLoadedRoot(next); setScreen("workspace"); controller.current?.openCanvas(next, row); });
    },
  });
  return <TooltipProvider><FirstPromptContext.Provider value={firstPrompt}>
  {screen === "home" && <Home homeDirectory={homeDirectory} entries={entries} loaded={loadedRoot} selection={state.selection} highlight={highlight} rerootHint={rerootHint} enter={enter} action={action} remove={paths => void remove(paths)} />}
  <main className={`app-shell workspace${entry && entry.kind !== "list" ? " with-status" : ""}`} style={{ visibility: screen === "home" ? "hidden" : "visible" }} inert={screen === "home"} aria-hidden={screen === "home"}>
    <TopBar homeDirectory={homeDirectory} state={state} name={card?.name ?? name} reload={() => command("reload")} overview={() => controller.current?.showOverview()} home={home} entry={entry} rows={card?.rows ?? []} enter={root => enter(root, true)} />
    {entry && entry.kind !== "list" && <ProblemActions entry={entry} action={action} workspace={{ name: card?.name ?? name, homeDirectory, home }} />}
    <Sidebar entries={entries.filter(entry => entry.path === loadedRoot)} state={state} expanded={expanded} onExpandedChange={(root, paths) => setExpanded(previous => ({ ...previous, [root]: paths }))} open={(folder, row, frameId, index) => controller.current?.openCanvas(folder, row, frameId, index === undefined ? undefined : { index })} jump={index => controller.current?.jump(index)} select={index => controller.current?.selectFrame(index)} overview={() => controller.current?.showOverview()} />
    <CanvasPane viewport={viewport} board={board} overlay={overlay} state={state} command={command} covered={overview !== null} />
    {overview && <ProjectOverview key={overview.path} root={overview.path} rows={overview.canvases} thumbnails={thumbs.thumbnails} onVisible={thumbs.onVisible} open={row => controller.current?.openCanvas(overview.path, row)} />}
    <div className="right-stack"><RightPanel state={state} selectPath={item => controller.current?.selectPath(item)} />{comments.panel}</div>
  </main>
  {comments.dialog}
  {scan && <AddProjectsDialog homeDirectory={homeDirectory} key={scan} scanId={scan} close={() => { setScan(null); modalClosed(); }} added={added} />}
  {!scan && !setup && confirms[0] && <SetUpFolderConfirm key={confirms[0].confirmId} name={confirms[0].name} path={confirms[0].path} cancel={() => { setConfirms(items => items.slice(1)); modalClosed(); }} confirm={async () => { const first = confirms[0]; if (!first) return; const result = await window.doan.confirmFolder(first.confirmId); if (result.kind !== "added") throw new Error("This confirmation is no longer available. Add the folder again."); setConfirms(items => items.slice(1)); setSetup(result.added[0] ?? first.path); focusModalPath.current = result.added[0] ?? first.path; added(result.added); }} />}
  {setup && <ProjectSetupDialog key={setup} root={setup} name={names.get(setup) ?? setup.split("/").at(-1) ?? setup} onClose={() => { setSetup(null); modalClosed(); }} onRerooted={(root, message) => { focusModalPath.current = root; setSetup(null); setHighlight([root]); setRerootHint({ root, message }); modalClosed(); }} />}
  {quickOpen && <QuickOpen entries={entries} currentRoot={screen === "workspace" ? loadedRoot : null} rendered={rendered} pick={pick} close={() => setQuickOpen(false)} />}
  {toast.element}
  <DropOverlay blocked={modal} />
  {wizard !== null && <Wizard key={wizard} session={wizard} entries={entries} reroot={reroot} homeDirectory={homeDirectory} onClose={() => { restoreFocus.current = true; setWizard(null); }} />}
  </FirstPromptContext.Provider></TooltipProvider>;
}

function TopBar({ state, name, reload, overview, home, entry, rows, enter, homeDirectory }: { homeDirectory: string | null; state: CanvasState; name: string; reload: () => void; overview: () => void; home: () => void; entry: FolderEntry | undefined; rows: FolderEntry[]; enter: (root: string) => void }) {
  const branch = entry?.kind === "list" ? cardRow(entry, null, null).summary?.branch : undefined;
  return <header className="top">
    <span className="traffic-space" aria-hidden="true" />
    <button className="back" aria-label="Go Home" onClick={home}>←</button><span className="divider" />
    <div className="crumbs"><PathTip text="Overview"><button className="repo" aria-label={`${name} overview`} onClick={overview}>{name}</button></PathTip>{branch && <><span className="sep">›</span>
      <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="branch" aria-label="Switch worktree" disabled={rows.length < 2}><span className="glyph" aria-hidden="true">⎇</span><span className="bn">{branch}</span><span className="caret">▾</span></button></DropdownMenu.Trigger>
        <DropdownMenu.Portal><DropdownMenu.Content className="menu" aria-label="Worktrees" sideOffset={5} align="start"><div className="menu-head">Worktrees</div><DropdownMenu.RadioGroup value={entry?.path} onValueChange={enter}>{rows.map(row => <DropdownMenu.RadioItem value={row.path} className="mi" key={row.path} disabled={row.kind !== "list"}><span className="check" aria-hidden="true">{row.path === entry?.path ? "✓" : ""}</span><span className="label">{cardRow(row, null, null).summary?.branch ?? row.path.split("/").at(-1)}</span><span className="sub">{displayPath(row.path, homeDirectory)}</span>{cardRow(row, null, null).chip && <span className="ob-chip">{cardRow(row, null, null).chip}</span>}</DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal>
      </DropdownMenu.Root></>}{state.open && <><span className="sep">›</span><PathTip text={state.open.canvas.replace(/^design\//, "")}><span className="canvas">{canvasLabel(state.open.row)}</span></PathTip></>}</div>
    <span className="chip">{state.open?.row.width === undefined ? "—" : `${state.open.row.width} px`}</span>
    <span className="spacer" />
    <button className="btn ghost" aria-label="Reload canvas" disabled={!state.open} onClick={reload}>Reload <span className="kbd">⌘R</span></button>
  </header>;
}

function CanvasPane({ viewport, board, overlay, state, command, covered }: {
  viewport: RefObject<HTMLDivElement | null>; board: RefObject<HTMLDivElement | null>; overlay: RefObject<HTMLDivElement | null>;
  state: CanvasState; command: (name: ViewCommand) => void; covered: boolean;
}) {
  // Stays laid out under the Overview: opening a canvas fits it to this size at once.
  return <section className="area" role="region" aria-label="Canvas" ref={viewport} inert={covered}>
    <div className="board" ref={board} hidden />
    <div className="overlay" ref={overlay} />
    <div className="canvas-notices">
      {state.error && <div className="canvas-notice" role="status">{state.error}</div>}
      {state.unlisted && <div className="canvas-notice" role="status">This page is not a listed canvas</div>}
      {state.notice && <div className="canvas-notice" role="status">{state.notice}</div>}
    </div>
    {state.status && <div className="canvas-status" role="status">
      {state.status === "loading" ? <p><span className="spinner" aria-hidden="true" />Loading…</p>
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
