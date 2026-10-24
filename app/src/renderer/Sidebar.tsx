import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { CanvasState } from "./CanvasController";
import { canvasName, projectRow } from "./projectRow";
import { frameLabel } from "./canvasView";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { copyLabel, COPY_FAILED, type CopyState } from "./onboardingView";
import type { Reroot } from "./Onboarding";
import { ProjectSetupDialog } from "./ProjectSetupDialog";

interface SidebarProps {
  entries: FolderEntry[];
  names: Map<string, string>;
  state: CanvasState;
  open: (folder: string, row: CanvasRow) => void;
  jump: (index: number) => void;
  // The last re-root main reported, and whether focus was on the old row then.
  reroot?: (Reroot & { hadFocus: boolean }) | null;
}

export function Sidebar(props: SidebarProps) {
  return <aside className="side native-scroll">
    <div className="sec">Projects <button className="section-action" onClick={() => void window.doan.openFolder()}>Open Project…</button></div>
    <ProjectTree {...props} />
    <FrameList state={props.state} jump={props.jump} />
  </aside>;
}

function ProjectTree({ entries, names, state, open, reroot }: SidebarProps) {
  const tree = useRef<HTMLDivElement>(null);
  const commentPrefix = useId();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [setup, setSetup] = useState<string | null>(null);
  // Shown under the root row after the setup dialog closed on a re-root, until
  // the next read of that row. `seen` is the entry it was shown with (a read
  // still loading then does not count).
  const [rerootHint, setRerootHint] = useState<{ root: string; message: string; seen?: FolderEntry } | null>(null);
  const focusRow = (path: string) => {
    const node = Array.from(tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"][aria-level="1"]') ?? []).find(item => item.dataset.path === path);
    if (node) { setFocused(path); node.focus(); }
  };
  useEffect(() => {
    if (!reroot) return;
    if (setup === reroot.from) setSetup(null);
    if (reroot.hadFocus || setup === reroot.from) focusRow(reroot.root);
  }, [reroot?.seq]);
  // A setup form closes when its row stops being Not initialized (re-root,
  // terminal init, folder gone); focus goes to that row.
  useEffect(() => {
    if (setup === null || entries.some(entry => entry.path === setup && entry.kind === "uninitialized")) return;
    const path = setup;
    setSetup(null);
    focusRow(path);
  }, [entries, setup]);
  useEffect(() => {
    if (!rerootHint) return;
    const entry = entries.find(candidate => candidate.path === rerootHint.root);
    if (!entry) setRerootHint(null);
    else if (!rerootHint.seen || rerootHint.seen.kind === "loading") { if (entry !== rerootHint.seen) setRerootHint({ ...rerootHint, seen: entry }); }
    else if (entry !== rerootHint.seen) setRerootHint(null);
  }, [entries, rerootHint]);
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
  return <><div role="tree" aria-label="Projects" ref={tree}>
    {entries.map(entry => {
      const name = names.get(entry.path) ?? entry.path;
      const display = projectRow(entry);
      const expanded = entry.kind !== "list" || !collapsed.has(entry.path);
      return <div role="treeitem" aria-label={name} aria-level={1} aria-expanded={expanded} tabIndex={active === entry.path ? 0 : -1} key={entry.path} data-path={entry.path} onFocus={event => { if (event.target === event.currentTarget) setFocused(entry.path); }} onKeyDown={event => keys(event, entry)}>
        <div className="row project-row" onClick={() => { setFocused(entry.path); if (entry.kind === "list") toggle(entry.path); }}>
          <span className="glyph" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          <Tooltip><TooltipTrigger asChild><span className="g">{name}</span></TooltipTrigger><TooltipContent>{entry.path}</TooltipContent></Tooltip>
          {display.status && <span className={display.status === "Not initialized" ? "cnt" : "err"}>{display.status}</span>}
          {!display.actions.includes("reopen") && <button className="close-project" aria-label={`Close project ${name}`} onClick={event => { event.stopPropagation(); close(entry.path); }}>×</button>}
        </div>
        {expanded && <div role="group">
          {display.hint && !display.actions.includes("copyPrompt") && <p className="hint">{display.hint}</p>}
          {display.actions.includes("copyPrompt") && <FirstPrompt root={entry.path} />}
          {(display.detail || display.actions.includes("reopen")) && <div className="hint">
            {display.detail && <p>{display.detail.map((part, index) => typeof part === "string" ? part : <code key={index}>{part.code}</code>)}</p>}
            {display.actions.includes("reopen") && <div className="recovery"><button className="btn" onClick={() => void window.doan.reopenFolder(entry.path)}>Reopen</button><button className="btn ghost" aria-label={`Close project ${name}`} onClick={() => close(entry.path)}>Close</button></div>}
            {display.actions.includes("setup") && <div className="recovery"><button type="button" className="btn" onClick={() => { setRerootHint(null); setSetup(entry.path); }}>Set Up…</button></div>}
          </div>}
          {entry.kind === "list" && entry.canvases.map(row => {
            const key = `${entry.path}\n${row.path}`;
            const commentId = `${commentPrefix}-${encodeURIComponent(key)}`;
            const current = state.open?.folder === entry.path && state.shown === row.path;
            return <Tooltip key={row.path}><TooltipTrigger asChild><div role="treeitem" aria-label={canvasName(row.path)} aria-describedby={commentId} aria-level={2} aria-current={current ? "true" : undefined} tabIndex={active === key ? 0 : -1} className="row ind" key={row.path} onFocus={event => { if (event.target === event.currentTarget) setFocused(key); }} onClick={event => { event.currentTarget.focus(); open(entry.path, row); }} onKeyDown={event => keys(event, entry, row)}>
              <span className="glyph" aria-hidden="true">◧</span><span className="g">{canvasName(row.path)}</span><span className="d">{row.title}</span><span id={commentId} role="img" className={`cnt${row.open ? " hot" : ""}`} aria-label={`${row.open} open comments`}>{row.open}</span>
            </div></TooltipTrigger><TooltipContent>{`${entry.path}/${row.path}`}</TooltipContent></Tooltip>;
          })}
          {rerootHint?.root === entry.path && <p className="hint reroot-hint" role="status">{rerootHint.message}</p>}
        </div>}
      </div>;
    })}
  </div>
    {setup !== null && <ProjectSetupDialog root={setup} name={names.get(setup) ?? setup} onClose={() => { const path = setup; setSetup(null); focusRow(path); }}
      onRerooted={(root, message) => { setSetup(null); setRerootHint({ root, message }); focusRow(root); }} />}
  </>;
}

// "No canvases" row: main builds the sentence; the tooltip shows all of it.
function FirstPrompt({ root }: { root: string }) {
  const [sentence, setSentence] = useState<string | null>(null);
  const [copy, setCopy] = useState<CopyState>("idle");
  useEffect(() => {
    let live = true;
    void window.doan.firstPrompt(root).then(text => { if (live) setSentence(text); }, () => undefined);
    return () => { live = false; };
  }, [root]);
  async function copyPrompt() {
    setCopy("copying");
    let ok = false;
    try { ok = (await window.doan.copyFirstPrompt(root)).kind === "success"; } catch { /* Shown as Retry copy. */ }
    setCopy(ok ? "copied" : "failed");
  }
  const button = <button type="button" className="btn" disabled={copy === "copying"} onClick={() => void copyPrompt()}>{copy === "idle" ? "Copy first prompt" : copyLabel(copy)}</button>;
  return <div className="hint">
    <p>No canvases</p>
    {/* Always inside the Tooltip, so the sentence arriving does not remount a focused button. */}
    <div className="recovery"><Tooltip><TooltipTrigger asChild>{button}</TooltipTrigger>{sentence !== null && <TooltipContent className="prompt-tooltip" align="start" collisionPadding={8}>{sentence}</TooltipContent>}</Tooltip></div>
    {copy === "failed" ? <p role="alert">{COPY_FAILED}</p> : <p>Replace &lt;what you want to design&gt; before sending.</p>}
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
        {current && selection?.element && <div className="row element-row"><span className="glyph" aria-hidden="true">↳</span><span className="g">{selection.element.doanId === undefined ? selection.tag : `${selection.tag} · ${selection.element.doanId}`}</span></div>}
      </li>;
    })}</ol>
    {layout.truncated && <p className="hint frames-hint">Showing the first 1,000</p>}
  </section>;
}
