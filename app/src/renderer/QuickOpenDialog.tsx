import { useEffect, useId, useMemo, useRef, useState, type Ref } from "react";
import { Hash, Layers, PanelsTopLeft, Search, SwatchBook } from "lucide-react";
import { canvasDir } from "../formats/canvasPath";
import type { FolderEntry } from "../main/view";
import { tabKey } from "./ComposerParts";
import { cardRow, groupProjects } from "./homeCards";
import { countMatches, emptyText, groupResults, markRuns, matchPositions, outsideDialog, resultKey, resultParts, searchIndex, searchMatch, type RenderedSearchFrames, type ResultGroup, type SearchFolder, type SearchKind, type SearchResult } from "./quickOpen";
import { projectHue, projectInitial } from "./shellNavigation";

// The repository name, which picks the thumbnail as in the sidebar, and the title
// "<repository> · <branch>", or the folder name outside git, as Home names them.
export function projectWhere(entries: readonly FolderEntry[]): Map<string, { name: string; title: string }> {
  const where = new Map<string, { name: string; title: string }>();
  for (const card of groupProjects(entries, new Map(entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])))) {
    for (const entry of card.rows) {
      const branch = cardRow(entry, null, null).summary?.branch;
      where.set(entry.path, { name: card.name, title: branch === undefined ? card.name : `${card.name} · ${branch}` });
    }
  }
  return where;
}

// Ids built from paths would need escaping, so a short hash of the key stands in for it.
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 0x01000193);
  return (value >>> 0).toString(36);
}

// Keyed by the result, not its place, so aria-activedescendant and the highlight stay on
// the same row when the results are recomputed.
export function optionId(id: string, result: SearchResult): string {
  return `${id}-${hash(resultKey(result))}`;
}

export function activeIndex(rows: readonly SearchResult[], key: string | null): number {
  return Math.max(0, key === null ? 0 : rows.findIndex(row => resultKey(row) === key));
}

// A row click closes the dialog before the event bubbles to it, and a closed dialog measures as an empty box at 0,0,
// so only a click on the open dialog itself (its backdrop or padding) is judged by geometry.
export function closesOnClick(
  target: unknown, dialog: { open: boolean; getBoundingClientRect(): Pick<DOMRect, "left" | "top" | "right" | "bottom"> },
  down: { x: number; y: number; button: number } | null, up: { x: number; y: number },
  strip: Pick<DOMRect, "left" | "top" | "right" | "bottom"> | null = null,
): boolean {
  return down !== null && target === dialog && dialog.open && outsideDialog(dialog.getBoundingClientRect(), down, up, strip);
}

export function quickOpenKey(key: string, active: number, count: number): { kind: "move"; active: number } | { kind: "pick" } | { kind: "close" } | null {
  if (key === "Escape") return { kind: "close" };
  if (count === 0) return null;
  if (key === "ArrowDown") return { kind: "move", active: (active + 1) % count };
  if (key === "ArrowUp") return { kind: "move", active: (active - 1 + count) % count };
  if (key === "Enter") return { kind: "pick" };
  return null;
}

const TABS: readonly { kind: SearchKind; label: string; Icon: typeof Layers }[] = [
  { kind: "all", label: "All", Icon: Layers },
  // The tab holds both kinds of canvas, so it takes the plain canvas icon (design-system-canvases Q8).
  { kind: "canvas", label: "Canvases", Icon: PanelsTopLeft },
  { kind: "frame", label: "Frames", Icon: Hash },
];

// Leaving the tab list by Tab keeps the row the person was on; only ↓ asks for the first row again.
export function quickOpenTabKey(key: string, current: SearchKind): { kind: "input"; first: boolean } | { kind: "select"; tab: SearchKind } | null {
  if (key === "Tab") return { kind: "input", first: false };
  if (key === "ArrowDown") return { kind: "input", first: true };
  const tab = tabKey(TABS.map(item => item.kind), current, key) as SearchKind | null;
  return tab ? { kind: "select", tab } : null;
}

// Scrolling to the first row itself would leave its group title and the list's top padding hidden.
export function activeScroll(index: number): "top" | "nearest" {
  return index === 0 ? "top" : "nearest";
}

interface QuickOpenProps {
  // Every saved project; reading and problem rows are left out of the index.
  entries: readonly FolderEntry[];
  // The loaded workspace, or null on Home.
  currentRoot: string | null;
  // The open canvas's rendered frames, which replace its static ones.
  rendered?: RenderedSearchFrames | undefined;
  pick: (result: SearchResult) => void;
  // Escape; focus has already gone back to where Quick Open was opened.
  close: () => void;
}

export function QuickOpen({ entries, currentRoot, rendered, pick, close }: QuickOpenProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const press = useRef<{ x: number; y: number; button: number } | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SearchKind>("all");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const index = useMemo(() => searchIndex(entries as readonly SearchFolder[], rendered), [entries, rendered]);
  const commons = useMemo(() => new Map(entries.flatMap(entry => entry.kind === "list" && entry.git ? [[entry.path, entry.git.common]] : [])), [entries]);
  const results = useMemo(() => searchMatch(index, query, currentRoot, root => commons.get(root), kind, rendered), [index, query, currentRoot, commons, kind, rendered]);
  const where = useMemo(() => projectWhere(entries), [entries]);
  const groups = useMemo(() => groupResults(results, where), [results, where]);
  const rows = useMemo(() => groups.flatMap(group => group.rows), [groups]);
  const current = activeIndex(rows, activeKey);
  const scope = entries.filter(entry => currentRoot === null || entry.path === currentRoot);
  // Counted only when the chosen kind hid everything, so the person learns the other tab has results.
  const otherCount = kind !== "all" && query.trim() && rows.length === 0 ? countMatches(index, query, kind === "canvas" ? "frame" : "canvas") : 0;
  const dismiss = () => {
    dialog.current?.close();
    // Focus goes back only after the dialog closes: behind an open modal everything is inert.
    if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
    close();
  };
  const choose = (result: SearchResult | undefined) => {
    if (!result) return;
    dialog.current?.close();
    pick(result);
  };
  const activate = (at: number) => { const row = rows[at]; if (row) setActiveKey(resultKey(row)); };
  const filter = (next: SearchKind) => { setKind(next); setActiveKey(null); };
  const focusTab = () => dialog.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  const activeId = rows[current] ? optionId(id, rows[current]) : undefined;
  useEffect(() => {
    if (!activeId) return;
    if (activeScroll(current) === "top") { if (list.current) list.current.scrollTop = 0; }
    else document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId, current]);
  useEffect(() => { if (list.current) list.current.scrollTop = 0; }, [query, kind]);
  return <dialog className="doan-dialog qo" data-ui-presentation="search" aria-label="Quick Open" ref={node => {
    dialog.current = node;
    if (node && !node.open) { opener.current = document.activeElement; node.showModal(); }
  }} onCancel={event => { event.preventDefault(); dismiss(); }}
    // Keys are handled in the input, so a click on a row, a tab or an empty part must not take focus from it.
    onMouseDown={event => { if (event.target !== input.current) event.preventDefault(); }}
    onPointerDown={event => { press.current = { x: event.clientX, y: event.clientY, button: event.button }; }}
    onClick={event => {
      const down = press.current;
      press.current = null;
      // The strip is measured now: the header is the same element on Home and in a workspace, but its size is not ours.
      const strip = document.querySelector(".top")?.getBoundingClientRect() ?? null;
      if (closesOnClick(event.target, event.currentTarget, down, { x: event.clientX, y: event.clientY }, strip)) dismiss();
    }}>
    <label className="qo-search">
      <Search aria-hidden="true" />
      <input ref={input} className="doan-input q" role="combobox" aria-label="Search canvases and frames" placeholder="Search canvases and frames" autoFocus spellCheck={false} autoComplete="off"
        aria-expanded="true" aria-controls={id} aria-autocomplete="list" aria-activedescendant={activeId}
        value={query} onChange={event => { setQuery(event.target.value); setActiveKey(null); }}
        onKeyDown={event => {
          // An IME composing Hangul or kana owns Enter and the arrows.
          if (event.nativeEvent.isComposing) return;
          // The input and the tab list are the only two Tab stops, so Shift+Tab cycles back to the tabs.
          if (event.key === "Tab" && event.shiftKey) { event.preventDefault(); focusTab(); return; }
          const step = quickOpenKey(event.key, current, rows.length);
          if (!step) return;
          event.preventDefault();
          event.stopPropagation();
          if (step.kind === "move") activate(step.active);
          else if (step.kind === "pick") choose(rows[current]);
          else dismiss();
        }} />
    </label>
    <div className="qo-tabs group-tabs shell-modes" role="tablist" aria-label="Result types">
      {TABS.map(tab => <button key={tab.kind} type="button" role="tab" className={tab.kind === kind ? "current" : ""} aria-selected={tab.kind === kind} tabIndex={tab.kind === kind ? 0 : -1} aria-controls={id}
        onClick={() => { filter(tab.kind); input.current?.focus(); }}
        onKeyDown={event => {
          const step = quickOpenTabKey(event.key, tab.kind);
          if (!step) return;
          event.preventDefault();
          if (step.kind === "input") {
            if (step.first) setActiveKey(null);
            input.current?.focus();
            return;
          }
          filter(step.tab);
          // The tab that becomes the Tab stop is drawn on the next render.
          requestAnimationFrame(focusTab);
        }}><tab.Icon aria-hidden="true" />{tab.label}</button>)}
    </div>
    <QuickOpenList emptyText={emptyText(kind, query, scope, otherCount)} id={id} listRef={list} query={query} groups={groups} active={current} pick={choose} activate={activate} />
  </dialog>;
}

export function QuickOpenList({ emptyText = "No canvases or frames match", id, listRef, query, groups, active, pick, activate }: { emptyText?: string; id: string; listRef?: Ref<HTMLDivElement>; query: string; groups: readonly ResultGroup[]; active: number; pick: (result: SearchResult) => void; activate: (index: number) => void }) {
  let at = 0;
  return <div className="qo-height">
    <div className="qo-list doan-scroll" role="listbox" id={id} aria-label="Results" tabIndex={-1} ref={listRef}>
      {groups.length === 0 ? <p className="qo-none" role="status">{emptyText}</p> : groups.map(group => {
        const titleId = `${id}-g-${hash(group.root)}`;
        return <div className="qo-group" role="group" aria-labelledby={titleId} key={group.root}>
          <div className="qo-group-title" id={titleId}><span className={`shell-thumbnail hue-${projectHue(group.name)}`} aria-hidden="true">{projectInitial(group.name)}</span><span className="qo-group-name">{group.title}</span></div>
          {group.rows.map(result => {
            const index = at++;
            const parts = resultParts(result, group.title);
            const Icon = parts.icon === "frame" ? Hash : canvasDir(result.path) === "ds" ? SwatchBook : PanelsTopLeft;
            return <div className="qo-item" role="option" id={optionId(id, result)} aria-selected={index === active} aria-label={parts.accessibleName} key={resultKey(result)}
              onMouseMove={() => { if (index !== active) activate(index); }} onClick={() => pick(result)}>
              <span className="qo-icon" aria-hidden="true"><Icon /></span>
              <span className="qo-text">
                <span className="qo-name" title={parts.name}>{markRuns(parts.name, matchPositions(parts.name, query)).map((run, i) => run.match ? <mark className="qo-match" key={i}>{run.text}</mark> : run.text)}</span>
                <span className="qo-detail"><span className="qo-context" title={parts.detail}>{parts.detail}</span></span>
              </span>
            </div>;
          })}
        </div>;
      })}
    </div>
  </div>;
}
