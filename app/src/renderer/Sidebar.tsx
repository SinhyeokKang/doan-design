import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { CanvasState } from "./CanvasController";
import { buildCanvasTree, frameLabel, rowAction, typeaheadKey, typeaheadNext, type RowNode, type TreeNode } from "./canvasTree";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

interface SidebarProps {
  entries: FolderEntry[];
  state: CanvasState;
  open: (folder: string, row: CanvasRow, frameId?: string) => void;
  jump: (index: number) => void;
  select: (index: number) => void;
  overview: () => void;
  expanded?: Record<string, string[]>;
  onExpandedChange?: (root: string, paths: string[]) => void;
}
interface VisibleRow { key: string; node: RowNode; level: number; parent?: string | undefined; expanded?: boolean; }

function RowActions({ actions }: { actions: { name: string; label: string; disabled?: boolean; run: () => void }[] }) {
  return <span className="ra">{actions.map(action => <button key={action.name} type="button" className="btn" tabIndex={-1} aria-label={action.label} disabled={action.disabled} onClick={event => { event.stopPropagation(); action.run(); }} onDoubleClick={event => event.stopPropagation()}>{action.name}</button>)}</span>;
}

export function Sidebar({ entries, state, open, jump, select, overview, expanded: saved, onExpandedChange }: SidebarProps) {
  const tree = useRef<HTMLDivElement>(null);
  const pointer = useRef(false);
  const buffer = useRef({ text: "", at: 0 });
  const commentPrefix = useId();
  const [memory, setMemory] = useState<Record<string, string[]>>({});
  const [focused, setFocused] = useState("overview");
  const entry = entries[0];
  const root = entry?.path ?? "";
  const canvases = entry?.kind === "list" ? entry.canvases : [];
  const nodes = buildCanvasTree(canvases).flatMap(node => node.kind === "folder" && node.key === "design" ? node.children : [node]);
  const defaults: string[] = [];
  const folders = (nodes: TreeNode[]) => { for (const node of nodes) if (node.kind === "folder") { defaults.push(node.key); folders(node.children); } };
  folders(nodes);
  const opened = state.open?.folder === root ? state.shown : null;
  if (opened) defaults.push(opened);
  const expanded = new Set(saved?.[root] ?? memory[root] ?? defaults);
  const change = (next: Set<string>) => {
    const paths = [...next];
    setMemory(previous => ({ ...previous, [root]: paths }));
    onExpandedChange?.(root, paths);
  };
  const toggle = (key: string) => { const next = new Set(expanded); if (next.has(key)) next.delete(key); else next.add(key); change(next); };
  useEffect(() => {
    if (!opened) return;
    const next = new Set(saved?.[root] ?? memory[root] ?? defaults);
    const parts = opened.split("/");
    for (let i = 1; i <= parts.length; i++) next.add(parts.slice(0, i).join("/"));
    change(next);
  }, [root, opened]);

  const visible: VisibleRow[] = [{ key: "overview", node: { kind: "overview" }, level: 1 }];
  const append = (nodes: TreeNode[], level: number, parent?: string) => {
    for (const node of nodes) {
      const unfolded = expanded.has(node.key);
      visible.push({ key: node.key, node, level, parent, expanded: unfolded });
      if (!unfolded) continue;
      if (node.kind === "folder") append(node.children, level + 1, node.key);
      else {
        const frames = opened === node.key && !state.unlisted ? state.layout?.frames ?? [] : node.row.frames ?? [];
        frames.forEach((frame, index) => visible.push({ key: `${node.key}\n${index}`, node: { kind: "frame", key: `${node.key}\n${index}`, canvas: node.key, index, frame }, level: level + 1, parent: node.key }));
      }
    }
  };
  append(nodes, 1);
  const siblings = new Map<string | undefined, VisibleRow[]>();
  for (const row of visible) { const group = siblings.get(row.parent) ?? []; group.push(row); siblings.set(row.parent, group); }
  const active = visible.some(row => row.key === focused) ? focused : visible[0]!.key;
  const elements = () => Array.from(tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []);
  const currentVisible = visible.some(row => row.node.kind === "frame" && row.node.canvas === opened && row.node.index === state.currentFrame);
  useEffect(() => {
    if (pointer.current || tree.current?.contains(document.activeElement)) return;
    tree.current?.querySelector<HTMLElement>('[aria-current="location"]')?.scrollIntoView({ block: "nearest" });
  }, [root, opened, state.currentFrame, currentVisible]);

  const act = (row: VisibleRow, secondary = false) => {
    const node = row.node;
    const action = rowAction(node, opened)[secondary ? "secondary" : "primary"];
    if (action === "overview") overview();
    else if (action === "toggle") toggle(row.key);
    else if (action === "open" && node.kind === "canvas") open(root, node.row);
    else if (node.kind === "frame") {
      if (action === "jump") jump(node.index);
      else if (action === "select") select(node.index);
      else if (action === "open-jump") {
        const canvas = canvases.find(canvas => canvas.path === node.canvas);
        if (canvas) open(root, canvas, node.frame.id);
      }
    }
  };
  function keys(event: KeyboardEvent<HTMLElement>, row: VisibleRow, index: number) {
    if (event.target !== event.currentTarget || event.isDefaultPrevented() || event.nativeEvent.isComposing) return;
    const items = elements();
    let next: number | undefined;
    switch (event.key) {
      case "ArrowDown": next = Math.min(index + 1, visible.length - 1); break;
      case "ArrowUp": next = Math.max(index - 1, 0); break;
      case "Home": next = 0; break;
      case "End": next = visible.length - 1; break;
      case "ArrowRight":
        if (row.expanded === false) toggle(row.key);
        else if (row.expanded && visible[index + 1]?.parent === row.key) next = index + 1;
        break;
      case "ArrowLeft":
        if (row.expanded) toggle(row.key);
        else if (row.parent) next = visible.findIndex(item => item.key === row.parent);
        break;
      case "Enter": act(row); break;
      case " ": act(row, true); break;
      default: {
        if (event.ctrlKey || event.metaKey || event.altKey || [...event.key].length !== 1) return;
        const now = Date.now();
        buffer.current = { text: (now - buffer.current.at < 500 ? buffer.current.text : "") + event.key, at: now };
        next = typeaheadNext(visible.map(item => typeaheadKey(item.node)), index, buffer.current.text) ?? undefined;
      }
    }
    if (next !== undefined) items[next]?.focus();
    event.preventDefault();
    event.stopPropagation();
  }
  return <aside className="side native-scroll">
    <div className="sec">Canvases <span className="r">{canvases.length}</span></div>
    <div role="tree" aria-label="Canvases" ref={tree} onPointerEnter={() => { pointer.current = true; }} onPointerLeave={() => { pointer.current = false; }}>
      {visible.map((row, index) => {
        const node = row.node;
        const isFrame = node.kind === "frame";
        const selected = isFrame && node.canvas === opened && !state.unlisted && state.selection?.frameIndex === node.index;
        const current = node.kind === "overview" ? !state.open : isFrame && node.canvas === opened && state.currentFrame === node.index;
        const label = isFrame ? `${frameLabel(node.frame, node.index).number} ${frameLabel(node.frame, node.index).name}` : typeaheadKey(node);
        const truncated = node.kind === "canvas" && (node.key === opened ? state.layout?.frames.length === 1000 && (node.row.frames === undefined ? state.layout.truncated : node.row.framesTruncated) : node.row.framesTruncated);
        const comments = node.kind === "canvas" && node.row.open > 0;
        const commentId = `${commentPrefix}-${index}`;
        const content = <div role="treeitem" aria-label={`${label}${selected ? ", selected in canvas" : ""}`} aria-current={current ? "location" : undefined} aria-expanded={row.expanded} aria-level={row.level} aria-posinset={(siblings.get(row.parent) ?? []).findIndex(item => item.key === row.key) + 1} aria-setsize={siblings.get(row.parent)?.length} aria-describedby={comments ? commentId : undefined} tabIndex={active === row.key ? 0 : -1} className={`row${node.kind === "canvas" ? " cv" : ""}${node.kind === "canvas" && node.key === opened ? " is-open" : ""}`} style={{ paddingLeft: 12 + (row.level - 1) * 14 }} data-key={row.key} onFocus={event => { if (event.target === event.currentTarget) setFocused(row.key); }} onClick={event => { event.currentTarget.focus(); act(row); }} onDoubleClick={() => act(row, true)} onKeyDown={event => keys(event, row, index)}>
          {row.expanded !== undefined ? <button type="button" className="tw" tabIndex={-1} aria-label={`${row.expanded ? "Collapse" : "Expand"} ${label}`} onClick={event => { event.stopPropagation(); event.currentTarget.closest<HTMLElement>('[role="treeitem"]')?.focus(); toggle(row.key); }} onDoubleClick={event => event.stopPropagation()}>{row.expanded ? "▾" : "▸"}</button> : <span className="tw" aria-hidden="true" />}
          {node.kind === "canvas" ? <><span className="glyph" aria-hidden="true">◧</span><span className="two"><span className="g">{node.name}</span><span className="d">{node.fileName}</span></span>{comments && <span id={commentId} role="img" className="cnt hot" aria-label={`${node.row.open} open comments`}>{node.row.open}</span>}{truncated && <span className="cnt">1,000+</span>}</>
            : isFrame ? <><span className="num" aria-hidden="true">{node.index + 1}</span><span className="g">{frameLabel(node.frame, node.index).name}</span><RowActions actions={[{ name: "Select", label: `Select ${frameLabel(node.frame, node.index).name}`, disabled: node.canvas !== opened, run: () => select(node.index) }]} />{selected && <span className="sel-mark" aria-hidden="true" />}</>
            : <>{node.kind === "overview" && <span className="glyph" aria-hidden="true">▦</span>}<span className="g">{label}</span></>}
        </div>;
        const empty = node.kind === "canvas" && row.expanded && !(opened === node.key ? state.layout?.frames.length : node.row.frames?.length);
        return <div key={row.key} role="none">
          {node.kind === "canvas" ? <Tooltip><TooltipTrigger asChild>{content}</TooltipTrigger><TooltipContent>{node.row.path.replace(/^design\//, "")}</TooltipContent></Tooltip> : content}
          {selected && state.selection?.element && <div className="row element-row" style={{ paddingLeft: 12 + row.level * 14 }}><span className="glyph" aria-hidden="true">↳</span><span className="g">{state.selection.element.doanId === undefined ? state.selection.tag : `${state.selection.tag} · ${state.selection.element.doanId}`}</span></div>}
          {empty && <p className="tree-hint">This canvas has no data-doan-frame</p>}
          {node.kind === "canvas" && row.expanded && truncated && <p className="tree-hint">Showing the first 1,000</p>}
        </div>;
      })}
    </div>
  </aside>;
}
