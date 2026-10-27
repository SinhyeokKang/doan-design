import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FolderEntry } from "../main/view";
import { cardRow, groupProjects } from "./homeCards";
import { searchIndex, searchMatch, type RenderedSearchFrames, type SearchFolder, type SearchResult } from "./quickOpen";

// "<repository> · <branch>", or the folder name outside git, as Home names them.
export function projectWhere(entries: readonly FolderEntry[]): Map<string, string> {
  const where = new Map<string, string>();
  for (const card of groupProjects(entries, new Map(entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])))) {
    for (const entry of card.rows) {
      const branch = cardRow(entry, null, null).summary?.branch;
      where.set(entry.path, branch === undefined ? card.name : `${card.name} · ${branch}`);
    }
  }
  return where;
}

export function resultParts(result: SearchResult, where: ReadonlyMap<string, string>): { glyph: string; name: string; context: string; where: string } {
  const project = where.get(result.root);
  return {
    glyph: result.kind === "frame" ? "#" : "◧",
    name: result.label,
    context: result.kind === "frame" ? ` — ${result.canvasLabel} › ${result.frameIndex + 1}` : ` — ${result.path.replace(/^doan\//, "")}`,
    where: project ? ` · ${project}` : "",
  };
}

export function quickOpenKey(key: string, active: number, count: number): { kind: "move"; active: number } | { kind: "pick" } | { kind: "close" } | null {
  if (key === "Escape") return { kind: "close" };
  if (count === 0) return null;
  if (key === "ArrowDown") return { kind: "move", active: (active + 1) % count };
  if (key === "ArrowUp") return { kind: "move", active: (active - 1 + count) % count };
  if (key === "Enter") return { kind: "pick" };
  return null;
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
  const opener = useRef<Element | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const index = useMemo(() => searchIndex(entries as readonly SearchFolder[], rendered), [entries, rendered]);
  const commons = useMemo(() => new Map(entries.flatMap(entry => entry.kind === "list" && entry.git ? [[entry.path, entry.git.common]] : [])), [entries]);
  const results = useMemo(() => searchMatch(index, query, currentRoot, root => commons.get(root)), [index, query, currentRoot, commons]);
  const where = useMemo(() => projectWhere(entries), [entries]);
  const current = Math.min(active, Math.max(results.length - 1, 0));
  const scope = entries.filter(entry => currentRoot === null || entry.path === currentRoot);
  const emptyText = query.trim() ? "No canvases or frames match"
    : scope.some(entry => entry.kind === "loading") ? "Project is still being read. Try again shortly."
    : scope.some(entry => entry.kind !== "list") ? "Project is unavailable. Check its status on Home."
    : "No canvases to show";
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
  useEffect(() => { document.getElementById(`${id}-${current}`)?.scrollIntoView({ block: "nearest" }); }, [id, current]);
  return <dialog className="qo" aria-label="Quick Open" ref={node => {
    dialog.current = node;
    if (node && !node.open) { opener.current = document.activeElement; node.showModal(); }
  }} onCancel={event => { event.preventDefault(); dismiss(); }}>
    <div className="qo-input">
      <span className="glyph" aria-hidden="true">⌕</span>
      <input className="q" role="combobox" aria-label="Search canvases and frames" placeholder="Search canvases and frames" autoFocus spellCheck={false} autoComplete="off"
        aria-expanded="true" aria-controls={id} aria-autocomplete="list" aria-activedescendant={results.length ? `${id}-${current}` : undefined}
        value={query} onChange={event => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={event => {
          // An IME composing Hangul or kana owns Enter and the arrows.
          if (event.nativeEvent.isComposing) return;
          const step = quickOpenKey(event.key, current, results.length);
          if (!step) return;
          event.preventDefault();
          event.stopPropagation();
          if (step.kind === "move") setActive(step.active);
          else if (step.kind === "pick") choose(results[current]);
          else dismiss();
        }} />
      <span className="kbd doan-kbd">esc</span>
    </div>
    <QuickOpenList emptyText={emptyText} id={id} results={results} active={current} where={where} pick={choose} activate={setActive} />
    <div className="qo-foot">↑↓ to move · ↩ to open · esc to close</div>
  </dialog>;
}

export function QuickOpenList({ emptyText = "No canvases or frames match", id, results, active, where, pick, activate }: { emptyText?: string; id: string; results: readonly SearchResult[]; active: number; where: ReadonlyMap<string, string>; pick: (result: SearchResult) => void; activate: (index: number) => void }) {
  return <div className="qo-list native-scroll" role="listbox" id={id} aria-label="Results">
    {results.length === 0 ? <p className="qo-none" role="status">{emptyText}</p> : results.map((result, index) => {
      const parts = resultParts(result, where);
      return <div className="qo-item" role="option" id={`${id}-${index}`} aria-selected={index === active} key={`${result.root}\n${result.path}\n${result.kind === "frame" ? result.frameIndex : ""}`}
        // Keep focus in the input so the keys keep working after a click.
        onMouseDown={event => event.preventDefault()} onMouseMove={() => { if (index !== active) activate(index); }} onClick={() => pick(result)}>
        <span className="glyph" aria-hidden="true">{parts.glyph}</span><span className="t" title={parts.name}>{parts.name}</span><span className="c" title={parts.context}>{parts.context}</span><span className="w" title={parts.where}>{parts.where}</span>
      </div>;
    })}
  </div>;
}
