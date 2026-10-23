import { useEffect, useRef, useState, type RefObject } from "react";
import type { Selection } from "../formats/types";
import type { FolderEntry } from "../main/view";
import type { ViewCommand } from "../main/index";
import { CanvasController, initialCanvasState, type CanvasState } from "./CanvasController";
import { projectNames } from "./projectRow";
import { Sidebar } from "./Sidebar";
import { useComments } from "./useComments";
import { RightPanel } from "./RightPanel";
import { updatedText } from "./canvasView";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";

export function App() {
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [state, setState] = useState(initialCanvasState);
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const controller = useRef<CanvasController | null>(null);
  useEffect(() => {
    if (!viewport.current || !board.current || !overlay.current) return;
    const sendSelection = (selection: Selection | null) => {
      window.doan.setSelection(selection).catch((error: unknown) => console.error("selection:set failed", error));
    };
    const instance = new CanvasController(viewport.current, board.current, overlay.current, setState, sendSelection, selector => window.doan.inspect(selector));
    controller.current = instance;
    const stopFolders = window.doan.onFolders(next => { setEntries(next); instance.updateEntries(next); });
    const stopCommands = window.doan.onViewCommand(name => instance.command(name));
    return () => { stopFolders(); stopCommands(); instance.dispose(); controller.current = null; };
  }, []);
  const comments = useComments(state, controller);
  const command = (name: ViewCommand) => controller.current?.command(name);
  const names = projectNames(entries.map(entry => entry.path));
  const name = names.get(state.open?.folder ?? entries[0]?.path ?? "") ?? "";
  return <TooltipProvider><main className="app-shell">
    <TopBar state={state} name={name} reload={() => command("reload")} />
    <Sidebar entries={entries} names={names} state={state} open={(folder, row) => controller.current?.openCanvas(folder, row)} jump={index => controller.current?.jump(index)} />
    <CanvasPane viewport={viewport} board={board} overlay={overlay} state={state} noProjects={entries.length === 0} command={command} />
    <div className="right-stack"><RightPanel state={state} selectPath={item => controller.current?.selectPath(item)} />{comments.panel}</div>
    {comments.dialog}
  </main></TooltipProvider>;
}

function TopBar({ state, name, reload }: { state: CanvasState; name: string; reload: () => void }) {
  return <header className="top">
    <span className="traffic-space" aria-hidden="true" />
    <span className="logo"><i />doan</span>
    <span className="meta breadcrumb">{name}{state.open && <> / <span>{state.open.canvas}</span></>}</span>
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
