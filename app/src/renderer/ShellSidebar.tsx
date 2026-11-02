import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { DropdownMenu } from "radix-ui";
import { Bell, Bot, Check, ChevronDown, CircleMinus, Ellipsis, FolderOpen, GitBranch, Hand, House, Info, LayoutGrid, PanelsTopLeft, Search, Settings, SwatchBook } from "lucide-react";
import type { CanvasRow } from "../main/view";
import type { ShellProject } from "../restore/uiState";
import { cardRow, type HomeCard, type RowAction } from "./homeCards";
import { projectExpanded, projectHue, projectInitial } from "./shellNavigation";
import { sortedCanvases } from "./canvasOrder";
import { rowProblem, typeaheadNext } from "./canvasTree";
import { ErrorDetails } from "./ErrorDetails";
import { displayPath } from "./projectDisplay";
import { slotKey } from "./homeConversations";
import type { SidebarSlot as Slot } from "./canvasNotice";
import { SETTINGS_SECTIONS, type SettingsSection } from "./settingsSections";
import { countDescription, headArrow, sidebarGroups, visibleItems, type GroupId, type SidebarGroup, type SidebarItem } from "./sidebarGroups";

interface Props {
  cards: HomeCard[];
  projects: Record<string, ShellProject>;
  loaded: string | null;
  canvas: string | undefined;
  unlisted?: boolean;
  homeDirectory: string | null;
  search(): void;
  // `notice`: the canvas the project row's canvas notice stands for, which the activation opens (canvas-viewport-units
  // D10); passed only when the row shows one.
  toggle(key: string, notice?: { root: string; path: string }): void;
  // Opens or closes a project's group; allowed while the page is locked, as project disclosure is.
  toggleGroup(key: string, group: GroupId): void;
  worktree(root: string): void;
  open(root: string, row: CanvasRow): void;
  overview(root: string): void;
  action(action: RowAction, root: string): void;
  remove(roots: string[]): Promise<void>;
  // The project menu's Project Settings: a dialog for the worktree the menu shows, not a move, so a locked page allows
  // it (buzz-settings design '잠금').
  projectSettings(root: string, projectKey: string): void;
  // On Home the sidebar marks no current project or canvas (buzz-home design §3).
  home?: boolean;
  // The Home row above the projects (dogfooding #2: Home had no visible way back).
  goHome?(): void;
  // Home-conversation states by slotKey (design §7.2) and roots to flash after an add (design §6).
  slots?: ReadonlyMap<string, Slot>;
  highlight?: readonly string[];
  // The Add Projects page is selecting or cloning: moves away are shown unavailable and App ignores them
  // (buzz-add-projects design '잠금'). aria-disabled keeps them in the focus order.
  locked?: boolean;
  // The Settings page: the project tree gives way to its categories, a plain list of buttons (buzz-settings design
  // 'LNB'). Choosing one leaves focus on its row.
  settings?: { section: SettingsSection; select(section: SettingsSection): void };
}
const SECTION_ICONS: Record<SettingsSection, typeof Bot> = { agents: Bot, notifications: Bell, about: Info };
const RANK: Record<Slot["kind"], number> = { permission: 3, working: 2, unseen: 1, canvas: 0 };
// A project row shows its roots' own slots, and a bound canvas's slot while that canvas row is not on screen, so a
// permission request in a collapsed project is never hidden. Among equals the first in `slots` wins.
export function projectSlotEntry(slots: ReadonlyMap<string, Slot>, roots: readonly string[], shownCanvases: readonly string[]): { key: string; slot: Slot } | undefined {
  let best: { key: string; slot: Slot } | undefined;
  for (const [key, slot] of slots) {
    const root = key.split("\n")[0]!;
    if (!roots.includes(root) || shownCanvases.includes(key)) continue;
    if (!best || RANK[slot.kind] > RANK[best.slot.kind]) best = { key, slot };
  }
  return best;
}
// The canvas a project row's canvas notice stands for; a canvas notice's key is always `root\npath`.
function noticeTarget(entry: { key: string; slot: Slot } | undefined): { root: string; path: string } | undefined {
  if (entry?.slot.kind !== "canvas") return undefined;
  const [root, path] = entry.key.split("\n");
  return { root: root!, path: path! };
}
function SlotMark({ slot }: { slot: Slot | undefined }) {
  if (!slot) return null;
  // A canvas notice is the unseen dot itself (canvas-viewport-units D9); only its label differs.
  return <span className={`row-slot ${slot.kind === "canvas" ? "unseen" : slot.kind}`} role="img" aria-label={slot.label}>{slot.kind === "permission" ? <Hand aria-hidden="true" /> : slot.kind === "working" ? <span className="doan-spinner" aria-hidden="true" /> : <i />}</span>;
}
// Canvas paths start with `.doan/`, so a head's key never equals a canvas row's.
const headKey = (root: string, group: GroupId) => `${root}\n#${group}`;
const labels: Record<RowAction, string> = { setUp: "Set Up…", locate: "Locate…", remove: "Remove from Doan", showInFinder: "Show in Finder", retry: "Retry", details: "Details" };
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
  // Each listed, expanded project's groups and visible rows, built once for both the keyboard order and the render.
  const layouts = new Map<string, { groups: SidebarGroup[]; items: SidebarItem[]; slot: { key: string; slot: Slot } | undefined }>();
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
    const groups = expanded && entry?.kind === "list" ? sidebarGroups(sortedCanvases(entry.canvases), project.groups) : [];
    const items = visibleItems(groups);
    const shown = items.flatMap(item => item.kind === "canvas" ? [slotKey(root!, item.row.path)] : []);
    const slot = props.slots && projectSlotEntry(props.slots, card.rows.map(row => row.path), shown);
    const notice = noticeTarget(slot);
    layouts.set(card.key, { groups, items, slot });
    rows.push({ key: card.key, name: card.name, activate: () => notice ? props.toggle(card.key, notice) : props.toggle(card.key), right: () => expanded ? focus(groups[0] ? headKey(root!, groups[0].id) : card.key) : props.toggle(card.key), left: () => { if (expanded && !card.rows.some(row => row.path === loaded)) props.toggle(card.key); } });
    for (const item of items) {
      const group = item.group, head = headKey(root!, group.id);
      if (item.kind === "head") {
        const step = (key: "ArrowLeft" | "ArrowRight") => {
          const target = headArrow(group, key);
          if (target === "toggle") props.toggleGroup(card.key, group.id);
          else if (target === "firstRow") focus(`${root}\n${group.rows[0]!.path}`);
          else if (target === "project") focus(card.key);
        };
        rows.push({ key: head, parent: card.key, name: group.label, activate: () => props.toggleGroup(card.key, group.id), right: () => step("ArrowRight"), left: () => step("ArrowLeft") });
      } else {
        const row = item.row;
        rows.push({ key: `${root}\n${row.path}`, parent: head, name: row.path.split("/").at(-1)!.replace(/\.html$/, ""), activate: () => props.open(entry!.path, row), right: () => {}, left: () => focus(head) });
      }
    }
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
  // Radix spreads props over the aria-disabled it derives from `disabled`, so Overview repeats its own disabled state.
  const locked = props.locked || undefined;
  if (props.settings) {
    const { section, select } = props.settings;
    return <aside className="side shell-side" ref={host} aria-label="Settings">
      <button ref={search} className="shell-search" aria-disabled={locked} onClick={props.search}><Search aria-hidden="true" />Search</button>
      <div className="shell-projects doan-scroll">
        <h2 className="shell-projects-heading">Settings</h2>
        <nav className="shell-settings-nav" aria-label="Settings">{SETTINGS_SECTIONS.map(item => {
          const Icon = SECTION_ICONS[item.id], current = item.id === section;
          return <button key={item.id} type="button" className="shell-settings-row row" aria-current={current ? "page" : undefined} aria-disabled={locked && !current ? true : undefined} onClick={() => select(item.id)}><Icon aria-hidden="true" /><span>{item.title}</span></button>;
        })}</nav>
      </div>
    </aside>;
  }
  return <aside className="side shell-side" ref={host} aria-label="Projects">
    <button ref={search} className="shell-search" aria-disabled={locked} onClick={props.search}><Search aria-hidden="true" />Search</button>
    <button type="button" className="shell-home-row row" aria-current={props.home ? "page" : undefined} aria-disabled={locked} onClick={() => props.goHome?.()}><House aria-hidden="true" /><span>Home</span></button>
    <div className="shell-projects doan-scroll">
      <h2 className="shell-projects-heading">Projects</h2>
      <div role="tree" aria-label="Projects and canvases">
      {cards.map((card, index) => {
        const project: ShellProject = { ...(projects[card.key] ?? { expanded: false }), roots: card.rows.map(row => row.path) };
        const selected = (card.rows.some(row => row.path === loaded) ? loaded : card.rows.some(row => row.path === project.selectedRoot) ? project.selectedRoot : undefined) ?? card.rows[0]?.path;
        const entry = card.rows.find(row => row.path === selected) ?? card.rows[0]!;
        const expanded = projectExpanded(project, loaded), current = !props.home && card.rows.some(row => row.path === loaded);
        const layout = layouts.get(card.key) ?? { groups: [], items: [], slot: undefined };
        const notice = noticeTarget(layout.slot);
        const info = cardRow(entry, loaded, null);
        const menuEntry = (menu === card.key && card.rows.find(row => row.path === repairRoot)) || entry;
        const menuInfo = cardRow(menuEntry, loaded, null);
        const target = () => live.current.cards.find(item => item.key === card.key)?.rows.find(row => row.path === menuEntry.path);
        const run = (action: () => void) => { if (target()) action(); };
        return <div className="shell-project" key={card.key}>
          <div ref={rowRef(card.key)} className={`shell-project-row row${card.rows.some(row => props.highlight?.includes(row.path)) ? " flash" : ""}`} role="treeitem" data-key={card.key} aria-label={card.name} aria-disabled={locked} aria-level={1} aria-expanded={expanded} aria-current={current && !canvas && !props.unlisted ? "location" : undefined} tabIndex={active === card.key ? 0 : -1} onFocus={event => { if (event.target === event.currentTarget) setFocused(card.key); }} onKeyDown={event => keyboard(event, card.key)} onClick={() => notice ? props.toggle(card.key, notice) : props.toggle(card.key)}>
            <span className={`shell-thumbnail hue-${projectHue(card.name)}`} aria-hidden="true">{projectInitial(card.name)}</span>
            <span className="shell-project-name">{card.name}</span>
            {info.summary?.branch && <span className="doan-chip shell-branch" data-ui-variant="translucent"><GitBranch aria-hidden="true" /><span>{info.summary.branch}</span></span>}
            {info.chip && <span className="shell-problem">{info.chip}</span>}
            <SlotMark slot={layout.slot?.slot} />
            <DropdownMenu.Root open={menu === card.key} onOpenChange={open => { setMenu(open ? card.key : null); if (open) { setRepairRoot(null); menuIndex.current = index; menuRoot.current = entry.path; } }}>
              <DropdownMenu.Trigger asChild><button className="doan-icon-button shell-more" aria-label={`${card.name} menu`} tabIndex={active === card.key ? 0 : -1} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><Ellipsis aria-hidden="true" /></button></DropdownMenu.Trigger>
              <DropdownMenu.Portal><DropdownMenu.Content className="menu doan-floating doan-menu shell-project-menu" sideOffset={4} collisionPadding={8} align="end" onClick={event => event.stopPropagation()} onCloseAutoFocus={event => {
                const active = document.activeElement;
                if (document.querySelector('[role="dialog"], dialog[open], .ob-overlay') || (active instanceof HTMLElement && active !== document.body && !active.closest(".shell-project-menu, .shell-more"))) event.preventDefault();
                else if (!live.current.cards.some(item => item.key === card.key)) { event.preventDefault(); if (document.activeElement === document.body || document.activeElement?.closest(".shell-project-menu")) fallback(); }
              }}>
                <DropdownMenu.Label className="doan-menu-head">Worktrees</DropdownMenu.Label>
                {card.rows.map(row => <DropdownMenu.Item className="doan-menu-item shell-worktree" aria-current={row.path === menuEntry.path ? "true" : undefined} aria-disabled={locked} key={row.path} onSelect={event => {
                  const current = live.current.cards.find(item => item.key === card.key)?.rows.find(item => item.path === row.path);
                  if (!current) return;
                  if (current.kind === "list" || current.kind === "loading") props.worktree(current.path);
                  else { event.preventDefault(); setRepairRoot(current.path); menuRoot.current = current.path; }
                }}><GitBranch aria-hidden="true" /><span><span>{cardRow(row, null, null).summary?.branch ?? row.path.split("/").at(-1)}</span><small>{displayPath(row.path, props.homeDirectory)}</small></span>{row.path === menuEntry.path && <Check aria-hidden="true" />}</DropdownMenu.Item>)}
                <DropdownMenu.Separator className="doan-menu-sep" />
                <DropdownMenu.Item className="doan-menu-item" disabled={menuEntry.kind !== "list"} aria-disabled={locked ?? (menuEntry.kind !== "list" || undefined)} onSelect={() => run(() => props.overview(menuEntry.path))}><LayoutGrid />Overview</DropdownMenu.Item>
                <DropdownMenu.Item className="doan-menu-item" onSelect={() => run(() => props.action("showInFinder", menuEntry.path))}><FolderOpen />Show in Finder</DropdownMenu.Item>
                <DropdownMenu.Item className="doan-menu-item" onSelect={() => run(() => props.projectSettings(menuEntry.path, card.key))}><Settings />Project Settings</DropdownMenu.Item>
                {menuInfo.actions.filter(action => action !== "remove" && action !== "showInFinder").map(action => <DropdownMenu.Item className="doan-menu-item" key={action} onSelect={() => run(() => props.action(action, menuEntry.path))}>{labels[action]}</DropdownMenu.Item>)}
                <DropdownMenu.Item className="doan-menu-item" onSelect={() => {
                  const current = live.current.cards.find(item => item.key === card.key);
                  if (current) void props.remove(current.rows.map(row => row.path));
                }}><CircleMinus />Remove from Doan</DropdownMenu.Item>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
          {expanded && <div role="group">
            {entry.kind === "list" ? layout.groups.map(group => {
              const key = headKey(entry.path, group.id), countId = `${descriptionPrefix}-${index}-${group.id}`;
              const Icon = group.id === "ds" ? SwatchBook : PanelsTopLeft;
              return <div className="shell-group" key={group.id}>
                <div ref={rowRef(key)} className="shell-group-head row" role="treeitem" data-key={key} aria-label={group.label} aria-describedby={countId} aria-disabled={locked} aria-level={2} aria-expanded={group.open} tabIndex={active === key ? 0 : -1} onFocus={event => { if (event.target === event.currentTarget) setFocused(key); }} onKeyDown={event => keyboard(event, key)} onClick={() => props.toggleGroup(card.key, group.id)}><ChevronDown aria-hidden="true" /><span className="shell-group-label">{group.label}</span><span className="doan-chip shell-group-count" data-ui-variant="translucent" aria-hidden="true">{group.rows.length}</span><span id={countId} className="sr-only">{countDescription(group.rows.length)}</span></div>
                {group.open && <div role="group">{group.rows.length ? group.rows.map((row, canvasIndex) => {
                  const descriptionId = `${countId}-${canvasIndex}`;
                  const key = `${entry.path}\n${row.path}`, problem = rowProblem(row);
                  return <div key={key}><div ref={rowRef(key)} className="shell-canvas-row row" aria-describedby={problem ? descriptionId : undefined} aria-label={row.path.split("/").at(-1)?.replace(/\.html$/, "")} data-key={key} role="treeitem" aria-disabled={locked} aria-level={3} aria-current={!props.home && entry.path === loaded && row.path === canvas && !props.unlisted ? "location" : undefined} tabIndex={active === key ? 0 : -1} onFocus={() => setFocused(key)} onKeyDown={event => keyboard(event, key)} onClick={() => props.open(entry.path, row)}><Icon aria-hidden="true" /><span>{row.path.split("/").at(-1)?.replace(/\.html$/, "")}</span><SlotMark slot={props.slots?.get(slotKey(entry.path, row.path))} /></div>{problem && <div id={descriptionId} className="shell-canvas-error">{problem.sentence}<ErrorDetails className="btn ghost" detail={problem.detail}>{(button, detail) => <>{button}{detail && <pre>{detail}</pre>}</>}</ErrorDetails></div>}</div>;
                }) : <p className="shell-empty">{group.empty}</p>}</div>}
              </div>;
            }) : <p className="shell-empty">{info.chip}</p>}
          </div>}
        </div>;
      })}
      </div>
    </div>
  </aside>;
}
