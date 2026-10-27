import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, CircleMinus, Ellipsis, FolderOpen, GitBranch, LayoutGrid, Palette, Search, Settings } from "lucide-react";
import type { CanvasRow } from "../main/view";
import type { ShellProject } from "../restore/uiState";
import { cardRow, type HomeCard, type RowAction } from "./homeCards";
import { projectExpanded, projectHue } from "./shellNavigation";
import { rowProblem } from "./Sidebar";
import { typeaheadNext } from "./canvasTree";
import { ErrorDetails } from "./ErrorDetails";
import { displayPath } from "./projectDisplay";

interface Props {
  cards: HomeCard[];
  projects: Record<string, ShellProject>;
  loaded: string | null;
  canvas: string | undefined;
  unlisted?: boolean;
  homeDirectory: string | null;
  search(): void;
  toggle(key: string): void;
  worktree(root: string): void;
  open(root: string, row: CanvasRow): void;
  overview(root: string): void;
  action(action: RowAction, root: string): void;
  remove(roots: string[]): Promise<void>;
}
const canvasOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const sortedCanvases = (rows: CanvasRow[]) => [...rows].sort((a, b) => {
  const name = (row: CanvasRow) => row.path.split("/").at(-1)!.replace(/\.html$/, "");
  return canvasOrder.compare(name(a), name(b)) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
});
const labels: Record<RowAction, string> = { setUp: "Set Up…", locate: "Locate…", remove: "Remove from doan", showInFinder: "Show in Finder", retry: "Retry", details: "Details" };
export function ShellSidebar(props: Props) {
  const { cards, projects, loaded, canvas } = props;
  const descriptionPrefix = useId();
  const host = useRef<HTMLElement>(null);
  const search = useRef<HTMLButtonElement>(null);
  const [focused, setFocused] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [repairRoot, setRepairRoot] = useState<string | null>(null);
  const menuIndex = useRef(0);
  const menuRoot = useRef<string | null>(null);
  const ownedFocus = useRef<string | null>(null);
  const previousKeys = useRef<string[]>([]);
  const previousProjects = useRef<string[]>([]);
  const elements = useRef(new Map<string, HTMLElement>());
  const buffer = useRef({ text: "", at: 0 });
  const live = useRef(props); live.current = props;
  const rows: { key: string; parent?: string; name: string; activate(): void; right(): void; left(): void }[] = [];
  const focus = (key: string | undefined) => {
    if (!key) { search.current?.focus(); return; }
    setFocused(key);
    Array.from(host.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []).find(row => row.dataset.key === key)?.focus();
  };
  const fallback = () => {
    const next = live.current.cards[Math.min(menuIndex.current, live.current.cards.length - 1)];
    focus(next?.key);
  };
  useLayoutEffect(() => {
    if (menu && !cards.some(card => card.key === menu && card.rows.some(row => row.path === menuRoot.current))) {
      setMenu(null);
      if (document.activeElement === document.body || document.activeElement?.closest(".shell-project-menu")) fallback();
    }
  }, [cards, menu]);
  const keyboard = (event: KeyboardEvent, key: string) => {
    if (event.target !== event.currentTarget) return;
    const index = rows.findIndex(row => row.key === key), row = rows[index];
    if (!row) return;
    const next = event.key === "ArrowDown" ? rows[Math.min(index + 1, rows.length - 1)] : event.key === "ArrowUp" ? rows[Math.max(index - 1, 0)] : event.key === "Home" ? rows[0] : event.key === "End" ? rows.at(-1) : undefined;
    if (next) { event.preventDefault(); focus(next.key); }
    else if (event.key === "ArrowRight") { event.preventDefault(); row.right(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); row.left(); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); row.activate(); }
    else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now(); buffer.current = { text: (now - buffer.current.at < 500 ? buffer.current.text : "") + event.key.toLowerCase(), at: now };
      const match = typeaheadNext(rows.map(row => row.name), index, buffer.current.text);
      if (match !== null) { event.preventDefault(); focus(rows[match]?.key); }
    }
  };
  for (const card of cards) {
    const project: ShellProject = { ...(projects[card.key] ?? { expanded: false }), roots: card.rows.map(row => row.path) };
    const root = (card.rows.some(row => row.path === loaded) ? loaded : card.rows.some(row => row.path === project.selectedRoot) ? project.selectedRoot : undefined) ?? card.rows[0]?.path;
    const entry = card.rows.find(row => row.path === root);
    const expanded = projectExpanded(project, loaded);
    const canvases = expanded && entry?.kind === "list" ? sortedCanvases(entry.canvases) : [];
    rows.push({ key: card.key, name: card.name, activate: () => props.toggle(card.key), right: () => expanded ? focus(canvases[0] ? `${root}\n${canvases[0].path}` : card.key) : props.toggle(card.key), left: () => { if (expanded && !card.rows.some(row => row.path === loaded)) props.toggle(card.key); } });
    for (const row of canvases) rows.push({ key: `${root}\n${row.path}`, parent: card.key, name: row.path.split("/").at(-1)!.replace(/\.html$/, ""), activate: () => props.open(entry!.path, row), right: () => {}, left: () => focus(card.key) });
  }
  useLayoutEffect(() => {
    const lost = ownedFocus.current;
    if (lost && !rows.some(row => row.key === lost) && !document.querySelector('[role="dialog"], dialog[open]')) {
      const projectIndex = previousProjects.current.indexOf(lost);
      const index = previousKeys.current.indexOf(lost);
      const target = projectIndex >= 0 ? cards[Math.min(projectIndex, cards.length - 1)]?.key : rows[Math.min(Math.max(0, index), rows.length - 1)]?.key;
      if (document.activeElement === document.body || !document.activeElement?.isConnected) focus(target);
      ownedFocus.current = null;
    }
    if (lost && rows.some(row => row.key === lost)) ownedFocus.current = null;
    previousKeys.current = rows.map(row => row.key);
    previousProjects.current = cards.map(card => card.key);
  });
  const rowRef = (key: string) => (node: HTMLDivElement | null) => {
    if (node) elements.current.set(key, node);
    else { if (elements.current.get(key)?.contains(document.activeElement)) ownedFocus.current = key; elements.current.delete(key); }
  };
  const active = rows.some(row => row.key === focused) ? focused : rows[0]?.key;
  return <aside className="side shell-side" ref={host} aria-label="Projects">
    <button ref={search} className="shell-search" onClick={props.search}><Search aria-hidden="true" />Search</button>
    <div className="shell-projects">
      <h2 className="shell-projects-heading">Projects</h2>
      <div role="tree" aria-label="Projects and canvases">
      {cards.map((card, index) => {
        const project: ShellProject = { ...(projects[card.key] ?? { expanded: false }), roots: card.rows.map(row => row.path) };
        const selected = (card.rows.some(row => row.path === loaded) ? loaded : card.rows.some(row => row.path === project.selectedRoot) ? project.selectedRoot : undefined) ?? card.rows[0]?.path;
        const entry = card.rows.find(row => row.path === selected) ?? card.rows[0]!;
        const expanded = projectExpanded(project, loaded), current = card.rows.some(row => row.path === loaded);
        const info = cardRow(entry, loaded, null);
        const menuEntry = (menu === card.key && card.rows.find(row => row.path === repairRoot)) || entry;
        const menuInfo = cardRow(menuEntry, loaded, null);
        const target = () => live.current.cards.find(item => item.key === card.key)?.rows.find(row => row.path === menuEntry.path);
        const run = (action: () => void) => { if (target()) action(); };
        return <div className="shell-project" key={card.key}>
          <div ref={rowRef(card.key)} className="shell-project-row row" role="treeitem" data-key={card.key} aria-label={card.name} aria-level={1} aria-expanded={expanded} aria-current={current && !canvas && !props.unlisted ? "location" : undefined} tabIndex={active === card.key ? 0 : -1} onFocus={event => { if (event.target === event.currentTarget) setFocused(card.key); }} onKeyDown={event => keyboard(event, card.key)} onClick={() => props.toggle(card.key)}>
            <span className={`shell-thumbnail hue-${projectHue(card.name)}`} aria-hidden="true">{Array.from(card.name.trim())[0]?.toUpperCase() ?? "?"}</span>
            <span className="shell-project-name">{card.name}</span>
            {info.summary?.branch && <span className="doan-chip shell-branch" data-ui-variant="translucent"><GitBranch aria-hidden="true" /><span>{info.summary.branch}</span></span>}
            {info.chip && <span className="shell-problem">{info.chip}</span>}
            <DropdownMenu.Root open={menu === card.key} onOpenChange={open => { setMenu(open ? card.key : null); if (open) { setRepairRoot(null); menuIndex.current = index; menuRoot.current = entry.path; } }}>
              <DropdownMenu.Trigger asChild><button className="doan-icon-button shell-more" aria-label={`${card.name} menu`} tabIndex={active === card.key ? 0 : -1} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><Ellipsis aria-hidden="true" /></button></DropdownMenu.Trigger>
              <DropdownMenu.Portal><DropdownMenu.Content className="menu doan-floating doan-menu shell-project-menu" sideOffset={4} collisionPadding={8} align="end" onClick={event => event.stopPropagation()} onCloseAutoFocus={event => {
                const active = document.activeElement;
                if (document.querySelector('[role="dialog"], dialog[open], .ob-overlay') || (active instanceof HTMLElement && active !== document.body && !active.closest(".shell-project-menu, .shell-more"))) event.preventDefault();
                else if (!live.current.cards.some(item => item.key === card.key)) { event.preventDefault(); if (document.activeElement === document.body || document.activeElement?.closest(".shell-project-menu")) fallback(); }
              }}>
                <DropdownMenu.Label className="doan-menu-head">Worktrees</DropdownMenu.Label>
                {card.rows.map(row => <DropdownMenu.Item className="doan-menu-item shell-worktree" aria-current={row.path === menuEntry.path ? "true" : undefined} key={row.path} onSelect={event => {
                  const current = live.current.cards.find(item => item.key === card.key)?.rows.find(item => item.path === row.path);
                  if (!current) return;
                  if (current.kind === "list" || current.kind === "loading") props.worktree(current.path);
                  else { event.preventDefault(); setRepairRoot(current.path); menuRoot.current = current.path; }
                }}><GitBranch aria-hidden="true" /><span><span>{cardRow(row, null, null).summary?.branch ?? row.path.split("/").at(-1)}</span><small>{displayPath(row.path, props.homeDirectory)}</small></span>{row.path === menuEntry.path && <Check aria-hidden="true" />}</DropdownMenu.Item>)}
                <DropdownMenu.Separator className="doan-menu-sep" />
                <DropdownMenu.Item className="doan-menu-item" disabled={menuEntry.kind !== "list"} onSelect={() => run(() => props.overview(menuEntry.path))}><LayoutGrid />Overview</DropdownMenu.Item>
                <DropdownMenu.Item className="doan-menu-item" onSelect={() => run(() => props.action("showInFinder", menuEntry.path))}><FolderOpen />Show in Finder</DropdownMenu.Item>
                <DropdownMenu.Item className="doan-menu-item" onSelect={() => run(() => { void window.doan.openSettings({ tab: "projects", project: menuEntry.path }); })}><Settings />Project Settings</DropdownMenu.Item>
                {menuInfo.actions.filter(action => action !== "remove" && action !== "showInFinder").map(action => <DropdownMenu.Item className="doan-menu-item" key={action} onSelect={() => run(() => props.action(action, menuEntry.path))}>{labels[action]}</DropdownMenu.Item>)}
                <DropdownMenu.Item className="doan-menu-item" onSelect={() => {
                  const current = live.current.cards.find(item => item.key === card.key);
                  if (current) void props.remove(current.rows.map(row => row.path));
                }}><CircleMinus />Remove from doan</DropdownMenu.Item>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
          {expanded && <div role="group">
            {entry.kind === "list" ? entry.canvases.length ? sortedCanvases(entry.canvases).map((row, canvasIndex) => {
              const descriptionId = `${descriptionPrefix}-${index}-${canvasIndex}`;
              const key = `${entry.path}\n${row.path}`, problem = rowProblem(row);
              return <div key={key}><div ref={rowRef(key)} className="shell-canvas-row row" aria-describedby={problem || row.open > 0 ? descriptionId : undefined} aria-label={row.path.split("/").at(-1)?.replace(/\.html$/, "")} data-key={key} role="treeitem" aria-level={2} aria-current={entry.path === loaded && row.path === canvas && !props.unlisted ? "location" : undefined} tabIndex={active === key ? 0 : -1} onFocus={() => setFocused(key)} onKeyDown={event => keyboard(event, key)} onClick={() => props.open(entry.path, row)}><Palette aria-hidden="true" /><span>{row.path.split("/").at(-1)?.replace(/\.html$/, "")}</span>{!problem && row.open > 0 && <span id={descriptionId} className="sr-only">{row.open} open {row.open === 1 ? "comment" : "comments"}</span>}</div>{problem && <div id={descriptionId} className="shell-canvas-error">{problem.sentence}<ErrorDetails className="btn ghost" detail={problem.detail}>{(button, detail) => <>{button}{detail && <pre>{detail}</pre>}</>}</ErrorDetails></div>}</div>;
            }) : <p className="shell-empty">No canvases yet</p> : <p className="shell-empty">{info.chip}</p>}
          </div>}
        </div>;
      })}
      </div>
    </div>
  </aside>;
}
