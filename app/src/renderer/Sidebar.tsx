import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { CanvasState } from "./CanvasController";
import { canvasName, projectRow } from "./projectRow";
import { frameLabel } from "./canvasView";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

interface SidebarProps {
  entries: FolderEntry[];
  names: Map<string, string>;
  state: CanvasState;
  open: (folder: string, row: CanvasRow) => void;
  jump: (index: number) => void;
}

export function Sidebar(props: SidebarProps) {
  return <aside className="side native-scroll">
    <div className="sec">Projects <button className="section-action" onClick={() => void window.doan.openFolder()}>Open Project…</button></div>
    <ProjectTree {...props} />
    <FrameList state={props.state} jump={props.jump} />
  </aside>;
}

function ProjectTree({ entries, names, state, open }: SidebarProps) {
  const tree = useRef<HTMLDivElement>(null);
  const commentPrefix = useId();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const toggle = (path: string) => setCollapsed(prev => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  const rows = () => Array.from(tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []);
  const focus = (node: HTMLElement | undefined) => node?.focus();
  function keys(event: KeyboardEvent<HTMLElement>, entry: FolderEntry, row?: CanvasRow) {
    if (event.target !== event.currentTarget) return;
    const items = rows();
    const index = items.indexOf(event.currentTarget);
    const parent = event.currentTarget.parentElement?.closest<HTMLElement>('[role="treeitem"][aria-level="1"]') ?? undefined;
    switch (event.key) {
      case "ArrowDown": focus(items[index + 1]); break;
      case "ArrowUp": focus(items[index - 1]); break;
      case "Home": focus(items[0]); break;
      case "End": focus(items.at(-1)); break;
      case "ArrowLeft":
        if (row) focus(parent);
        else if (entry.kind === "list" && !collapsed.has(entry.path)) toggle(entry.path);
        break;
      case "ArrowRight":
        if (!row && entry.kind === "list") { if (collapsed.has(entry.path)) toggle(entry.path); else focus(items[index + 1]); }
        break;
      case "Enter": case " ": if (row) open(entry.path, row); else if (entry.kind === "list") toggle(entry.path); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  }
  const close = (path: string) => {
    const projects = rows().filter(node => node.getAttribute("aria-level") === "1");
    const index = entries.findIndex(entry => entry.path === path);
    focus(projects[index + 1] ?? projects[index - 1]);
    void window.doan.closeFolder(path);
  };
  const available = entries.flatMap(entry => [entry.path, ...(entry.kind === "list" && !collapsed.has(entry.path) ? entry.canvases.map(row => `${entry.path}\n${row.path}`) : [])]);
  const active = focused && available.includes(focused) ? focused : available[0];
  return <div role="tree" aria-label="Projects" ref={tree}>
    {entries.map(entry => {
      const name = names.get(entry.path) ?? entry.path;
      const display = projectRow(entry);
      const expanded = entry.kind !== "list" || !collapsed.has(entry.path);
      return <div role="treeitem" aria-label={name} aria-level={1} aria-expanded={expanded} tabIndex={active === entry.path ? 0 : -1} key={entry.path} onFocus={event => { if (event.target === event.currentTarget) setFocused(entry.path); }} onKeyDown={event => keys(event, entry)}>
        <div className="row project-row" onClick={() => { setFocused(entry.path); if (entry.kind === "list") toggle(entry.path); }}>
          <span className="glyph" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          <Tooltip><TooltipTrigger asChild><span className="g">{name}</span></TooltipTrigger><TooltipContent>{entry.path}</TooltipContent></Tooltip>
          {display.status && <span className={display.status === "Not initialized" ? "cnt" : "err"}>{display.status}</span>}
          {!display.actions.includes("reopen") && <button className="close-project" aria-label={`Close project ${name}`} onClick={event => { event.stopPropagation(); close(entry.path); }}>×</button>}
        </div>
        {expanded && <div role="group">
          {display.hint && <p className="hint">{display.hint}</p>}
          {(display.detail || display.actions.includes("reopen")) && <div className="hint">
            {display.detail && <p>{display.detail.map((part, index) => typeof part === "string" ? part : <code key={index}>{part.code}</code>)}</p>}
            {display.actions.includes("reopen") && <div className="recovery"><button className="btn" onClick={() => void window.doan.reopenFolder(entry.path)}>Reopen</button><button className="btn ghost" aria-label={`Close project ${name}`} onClick={() => close(entry.path)}>Close</button></div>}
          </div>}
          {entry.kind === "list" && entry.canvases.map(row => {
            const key = `${entry.path}\n${row.path}`;
            const commentId = `${commentPrefix}-${encodeURIComponent(key)}`;
            const current = state.open?.folder === entry.path && state.shown === row.path;
            return <Tooltip key={row.path}><TooltipTrigger asChild><div role="treeitem" aria-label={canvasName(row.path)} aria-describedby={commentId} aria-level={2} aria-current={current ? "true" : undefined} tabIndex={active === key ? 0 : -1} className="row ind" key={row.path} onFocus={event => { if (event.target === event.currentTarget) setFocused(key); }} onClick={event => { event.currentTarget.focus(); open(entry.path, row); }} onKeyDown={event => keys(event, entry, row)}>
              <span className="glyph" aria-hidden="true">◧</span><span className="g">{canvasName(row.path)}</span><span className="d">{row.title}</span><span id={commentId} role="img" className={`cnt${row.open ? " hot" : ""}`} aria-label={`${row.open} open comments`}>{row.open}</span>
            </div></TooltipTrigger><TooltipContent>{`${entry.path}/${row.path}`}</TooltipContent></Tooltip>;
          })}
        </div>}
      </div>;
    })}
  </div>;
}

function FrameList({ state, jump }: { state: CanvasState; jump: (index: number) => void }) {
  const layout = state.unlisted ? null : state.layout;
  if (!layout) return null;
  const selection = state.selection;
  return <section aria-label="Frames">
    <div className="sec">Frames <span className="r">{layout.truncated ? "1,000+" : layout.frames.length}</span></div>
    {!layout.frames.length && <p className="hint frames-hint">This canvas has no data-doan-frame</p>}
    <ol>{layout.frames.map((frame, index) => {
      const label = frameLabel(frame);
      // Current is the selected frame or the frame around the selected element.
      const current = selection?.frameIndex === index;
      return <li key={index}>
        <button className="row frame-row" aria-current={current ? "true" : undefined} onClick={() => jump(index)}><span className="glyph">#</span><span className={frame.id ? "g" : "g no-id"}>{label.id}</span><span className="d">{label.title}</span></button>
        {current && selection?.element && <div className="row ind frame-sub"><span className="glyph" aria-hidden="true">↳</span><span className="g">{selection.path.at(-1)?.label ?? selection.tag}</span></div>}
      </li>;
    })}</ol>
    {layout.truncated && <p className="hint frames-hint">Showing the first 1,000</p>}
  </section>;
}
