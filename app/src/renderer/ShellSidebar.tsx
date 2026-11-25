import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { DropdownMenu } from "radix-ui";
import { Bell, Bot, Check, ChevronDown, CircleMinus, Clock, Download, Ellipsis, FolderOpen, GitBranch, Hand, House, Info, LayoutGrid, MessageCircle, PanelsTopLeft, Plug, Search, Settings, SlidersHorizontal, SwatchBook, Trash2 } from "lucide-react";
import type { ConversationSummary } from "../main/conversation/summary";
import type { CanvasRow } from "../main/view";
import type { ShellProject } from "../restore/uiState";
import { AlertIcon } from "./AlertIcon";
import { cardRow, ROW_ACTION_ICONS as icons, ROW_ACTION_LABELS as labels, type HomeCard, type RowAction } from "./homeCards";
import { worktreeLabel, worktreeSwitchModel } from "./worktreeSwitchModel";
import { WorktreeSwitch } from "./WorktreeSwitch";
import { projectExpanded, projectHue, projectInitial } from "./shellNavigation";
import { sortedCanvases } from "./canvasOrder";
import { rowProblem, typeaheadNext } from "./canvasTree";
import { ErrorDetails } from "./ErrorDetails";
import { ResizeHandle } from "./ConversationPanel";
import type { PanelBounds } from "./rightPanelSize";
import { displayPath } from "./projectDisplay";
import { slotKey } from "./homeConversations";
import { canvasStem } from "./canvasRowMessages";
import { canvasExportReason } from "./canvasRowMenu";
import type { SidebarSlot as Slot } from "./canvasNotice";
import { settingsSectionsShown, type SettingsSection } from "./settingsSections";
import { LOADING_DELAY_MS } from "./ConversationThread";
import { sidebarSlot, type RowSlot } from "./problemView";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { NameTip } from "./NameTip";
import { countDescription, headArrow, sidebarGroups, visibleItems, type GroupId, type SidebarGroup, type SidebarItem } from "./sidebarGroups";
import { DELETE_TOOLTIP, deleteItemLabel } from "./conversationDelete";
import type { DeleteTarget } from "./ConversationDeleteDialog";
import { refocusOnActivation } from "./activationFocus";
import { canvasArrow, canvasDisclosure, canvasRowMark, conversationArrow, conversationRowKey, deleteFocus, listPlace, viewedCanvasConversations, type SidebarConversation } from "./sidebarConversations";

interface Props {
  // What the header's sidebar button points at with aria-controls.
  id?: string;
  // The sidebar's width handle, drawn after the sidebar as a sibling in the shell grid (see .doan-sidebar-handle).
  resize?: { width: number; bounds: PanelBounds; onResize(width: number | undefined): void; preview(width: number): void };
  cards: HomeCard[];
  projects: Record<string, ShellProject>;
  loaded: string | null;
  canvas: string | undefined;
  unlisted?: boolean;
  homeDirectory: string | null;
  search(): void;
  toggle(key: string): void;
  // The project row's chevron and ←/→: fold or unfold without moving.
  disclose(key: string): void;
  // Opens or closes a project's group; allowed while the page is locked, as project disclosure is.
  toggleGroup(key: string, group: GroupId): void;
  worktree(root: string): void;
  // `listed`: the row's conversation list shows under it, so the row carries no conversation signal and its press must
  // act as an empty slot's. Only the sidebar knows where the list shows (it can hold it under a previous canvas).
  open(root: string, row: CanvasRow, listed?: boolean): void;
  overview(root: string): void;
  action(action: RowAction, root: string): void | Promise<void>;
  remove(roots: string[]): Promise<void>;
  // The project menu's Project Settings: the page for the worktree the menu shows. It is a move, so a locked page shows
  // it unavailable.
  projectSettings(root: string): void;
  // On Home and the pages the sidebar marks no current project or canvas.
  home?: boolean;
  // The Home row is current only on Home itself, not on a page that shows Home's sidebar (PRODUCT §5 item 3).
  homeCurrent?: boolean;
  // The Home row above the projects.
  goHome?(): void;
  // Home-conversation states by slotKey and roots to flash after an add.
  slots?: ReadonlyMap<string, Slot>;
  highlight?: readonly string[];
  // A page holds work (Add Projects selecting or cloning; Settings or Project Settings a confirmation or a write): moves away are
  // shown unavailable (aria-disabled, kept in the focus order) and App ignores them.
  locked?: boolean;
  // Why, while locked: the unavailable menu and delete buttons give it in their tooltip and description.
  lockReason?: string | null;
  // The Settings page: the project tree gives way to its categories, a plain list of buttons; choosing one leaves focus on its row.
  // mcp: MCP Connectors is listed only while Claude Code or Codex is signed in.
  settings?: { section: SettingsSection; select(section: SettingsSection): void; mcp?: boolean };
  canvasMenu: CanvasMenu;
  // The viewed canvas's conversations under its row (PRODUCT §5 item 1).
  conversations?: SidebarConversations;
}
// `shown`: the panel's conversation, or the one it would show. `bare`: slots without conversation states, for a row whose list
// carries them. `folded` is device-wide. `remove`'s `target.after`: focus after the delete, computed before the alert.
export interface SidebarConversations {
  list(root: string): readonly ConversationSummary[] | "loading" | "error";
  shown: string | null;
  seen: ReadonlySet<string>;
  now: number;
  folded: boolean;
  bare: ReadonlyMap<string, Slot>;
  fold(folded: boolean): void;
  open(root: string, row: CanvasRow, conversationId: string): void;
  remove(target: Extract<DeleteTarget, { from: "sidebar" }>, trash: HTMLElement | null): void;
}
// `blocked`: an agent works on the canvas (trashBlock), so Move to Trash is unavailable; `exporting`: that canvas's export is
// running. `trash` gets the row's button, where focus goes back when the dialog closes.
export interface CanvasMenu {
  blocked(root: string, row: CanvasRow): boolean;
  exporting(root: string, path: string): boolean;
  exportCanvas(root: string, row: CanvasRow): void;
  trash(root: string, row: CanvasRow, button: HTMLElement | null): void;
}
// One open menu at a time; a canvas menu's key is its row's `root\npath`.
export type OpenMenu = { kind: "project" | "canvas"; key: string };
// `canvas` and `conversation` rows hand a lost focus to their siblings, then their parent (recoveryKey).
export interface TreeRow { key: string; parent?: string; canvas?: boolean; conversation?: boolean }
// A menu closes when, by kind: the project menu's root left its card; the canvas menu's row left the tree or the page
// locked (POSTMORTEM 2026-11-01). A canvas menu is never judged by the project rule, which would close it at once.
export function staleMenu(menu: OpenMenu | null, cards: readonly HomeCard[], menuRoot: string | null, rows: readonly TreeRow[], locked: boolean): boolean {
  if (menu?.kind === "project") return !cards.some(card => card.key === menu.key && card.rows.some(row => row.path === menuRoot));
  if (menu?.kind === "canvas") return locked || !rows.some(row => row.key === menu.key);
  return false;
}
// When the focused row leaves the tree: a canvas row hands focus to the next row of its group, else the previous, else its
// head; a conversation row does the same within its list, else goes to its canvas row. Any other row: the row now at its place.
export function recoveryKey(previous: readonly TreeRow[], current: readonly TreeRow[], lost: string): string | undefined {
  const index = previous.findIndex(row => row.key === lost);
  const parent = previous[index]?.parent;
  const kept = (row: TreeRow) => row.parent === parent && current.some(item => item.key === row.key);
  if ((previous[index]?.canvas || previous[index]?.conversation) && parent !== undefined) {
    const target = previous.slice(index + 1).find(kept) ?? previous.slice(0, index).reverse().find(kept);
    if (target) return target.key;
    if (current.some(row => row.key === parent)) return parent;
  }
  return current[Math.min(Math.max(0, index), current.length - 1)]?.key;
}
const SECTION_ICONS: Record<SettingsSection, typeof Bot> = { general: SlidersHorizontal, agents: Bot, mcp: Plug, notifications: Bell, about: Info };
const RANK: Record<Slot["kind"], number> = { permission: 4, working: 3, scheduled: 2, unseen: 1, canvas: 0 };
// A project row shows its roots' own slots and every bound canvas slot no row or head below carries (`covered`), so a permission
// request in a collapsed project is never hidden (PRODUCT §5 item 1). Among equals the first in `slots` wins.
export function projectSlot(slots: ReadonlyMap<string, Slot>, roots: readonly string[], covered: readonly string[]): Slot | undefined {
  let best: Slot | undefined;
  for (const [key, slot] of slots) {
    const root = key.split("\n")[0]!;
    if (!roots.includes(root) || covered.includes(key)) continue;
    if (!best || RANK[slot.kind] > RANK[best.kind]) best = slot;
  }
  return best;
}
// A closed group's head stands for its canvas rows, ranked as on the project row.
export function groupSlot(slots: ReadonlyMap<string, Slot>, root: string, group: SidebarGroup): Slot | undefined {
  if (group.open) return undefined;
  const keys = group.rows.map(row => slotKey(root, row.path));
  return projectSlot(new Map([...slots].filter(([key]) => keys.includes(key))), [root], []);
}
// `described`: a conversation row names its state through its own description, so the mark is decorative.
function SlotMark({ slot, described = false }: { slot: Slot | undefined; described?: boolean }) {
  if (!slot) return null;
  // A canvas notice is the accent dot; an unread finished conversation is a speech bubble, so the two never read alike.
  const cls = slot.kind === "canvas" ? "unseen" : slot.kind === "unseen" ? "ended" : slot.kind;
  return <span className={`row-slot ${cls}`} {...(described ? { "aria-hidden": true } : { role: "img", "aria-label": slot.label })}>{slot.kind === "permission" ? <Hand aria-hidden="true" /> : slot.kind === "working" ? <span className="doan-spinner" aria-hidden="true" /> : slot.kind === "scheduled" ? <Clock aria-hidden="true" /> : slot.kind === "unseen" ? <MessageCircle aria-hidden="true" /> : <i />}</span>;
}
// A project row's slot: a problem icon or the reading spinner, which are hidden from assistive technology and named by
// the row's own description instead (PRODUCT §5 item 1), or a conversation state as on a canvas row.
export function RowSlotMark({ slot }: { slot: RowSlot | null }) {
  if (slot?.kind === "problem") {
    const Icon = slot.icon;
    return <Tooltip><TooltipTrigger asChild><span className="row-slot problem" aria-hidden="true"><Icon aria-hidden="true" /></span></TooltipTrigger><TooltipContent>{slot.label}</TooltipContent></Tooltip>;
  }
  if (slot?.kind === "reading") return <Tooltip><TooltipTrigger asChild><span className="row-slot reading" aria-hidden="true"><span className="doan-spinner" aria-hidden="true" /></span></TooltipTrigger><TooltipContent>{slot.label}</TooltipContent></Tooltip>;
  return <SlotMark slot={slot ?? undefined} />;
}
// The roots that have been `loading` for LOADING_DELAY_MS, each timed from its own start so a root that starts later
// does not restart the others'. A root that stops loading leaves the set, so its next read waits again.
function useSlowRoots(loading: readonly string[]): ReadonlySet<string> {
  const [slow, setSlow] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const key = loading.join("\n");
  useEffect(() => {
    const roots = new Set(key ? key.split("\n") : []);
    for (const [root, timer] of timers.current) if (!roots.has(root)) { clearTimeout(timer); timers.current.delete(root); }
    for (const root of roots) if (!timers.current.has(root)) timers.current.set(root, setTimeout(() => setSlow(previous => new Set(previous).add(root)), LOADING_DELAY_MS));
    setSlow(previous => { const kept = [...previous].filter(root => roots.has(root)); return kept.length === previous.size ? previous : new Set(kept); });
  }, [key]);
  // Emptied too, so an effect run again after this cleanup (React's strict-mode remount) starts the timers again.
  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); timers.current.clear(); }, []);
  return slow;
}
interface RowMenu {
  menu: CanvasMenu; root: string; row: CanvasRow; name: string; reasonId: string; open: boolean; locked: boolean; tabIndex: number;
  // The page lock's reason and its sr-only line, for the button's tooltip and description while locked.
  lock: { reason: string; id: string } | null;
  setOpen(open: boolean): void;
  rowNode(): HTMLElement | undefined;
  // The row as the list holds it now: an item chosen for a row that left the list does nothing.
  current(): CanvasRow | undefined;
  // Focus for a menu whose row left the tree while it was open.
  lostFocus(): void;
}
// Canvas row menu: unavailable items keep `aria-disabled`, not Radix `disabled`, so arrows reach them and their reason is read
// (docs/design/onboarding.md 'Locked Back'). While locked its button is unavailable too, unlike the project menu's.
function canvasRowMenu(args: RowMenu): ReactElement {
  const { menu, root, row, locked } = args;
  const exportReason = canvasExportReason(row, menu.exporting(root, row.path), false);
  const trashReason = menu.blocked(root, row) ? "An agent is working on this canvas." : null;
  const item = (label: string, Icon: typeof Download, reason: string | null, id: string, act: (current: CanvasRow) => void) =>
    <DropdownMenu.Item className={`doan-menu-item${reason ? " shell-menu-reasoned" : ""}`} aria-label={reason ? label : undefined} aria-disabled={reason ? true : undefined} aria-describedby={reason ? id : undefined} onSelect={event => {
      if (reason) { event.preventDefault(); return; }
      const current = args.current();
      if (current) act(current);
    }}><Icon aria-hidden="true" />{reason ? <span className="shell-menu-text"><span>{label}</span><small id={id} className="shell-menu-reason">{reason}</small></span> : label}</DropdownMenu.Item>;
  return <DropdownMenu.Root open={args.open} onOpenChange={open => { if (!open || !locked) args.setOpen(open); }}>
    {/* The unavailable state sits on Radix's trigger, the tooltip trigger's direct child, so the tooltip keeps the
        reason as the button's only description (components/ui/tooltip.tsx 'OwnDescription'). */}
    <Tooltip><TooltipTrigger asChild><DropdownMenu.Trigger asChild aria-disabled={locked || undefined} aria-describedby={locked && args.lock ? args.lock.id : undefined}><button className="doan-icon-button shell-more" aria-label={`${args.name} menu`} tabIndex={args.tabIndex} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><Ellipsis aria-hidden="true" /></button></DropdownMenu.Trigger></TooltipTrigger>
      <TooltipContent>{locked && args.lock ? args.lock.reason : "Canvas menu"}</TooltipContent></Tooltip>
    <DropdownMenu.Portal><DropdownMenu.Content className="menu doan-floating doan-menu shell-canvas-menu shell-side-menu" data-ui-size="compact" sideOffset={4} collisionPadding={8} align="end" onClick={event => event.stopPropagation()} onCloseAutoFocus={event => {
      // A dialog the menu opened owns focus (App returns it to this button when it closes), as does a control focus
      // already moved to (POSTMORTEM 2026-10-30: a dialog is found by its rendered element, not a styling class).
      const active = document.activeElement;
      if (document.querySelector('[role="dialog"], dialog[open], .ob-overlay') || (active instanceof HTMLElement && active !== document.body && !active.closest(".shell-canvas-menu, .shell-more"))) event.preventDefault();
      else if (!args.rowNode()) { event.preventDefault(); if (document.activeElement === document.body || document.activeElement?.closest(".shell-canvas-menu")) args.lostFocus(); }
    }}>
      {item("Export…", Download, exportReason, `${args.reasonId}-export`, current => menu.exportCanvas(root, current))}
      {item("Move to Trash", Trash2, trashReason, `${args.reasonId}-trash`, current => menu.trash(root, current, args.rowNode()?.querySelector<HTMLElement>(".shell-more") ?? null))}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
// Canvas paths start with `.doan/`, so a head's key never equals a canvas row's.
const headKey = (root: string, group: GroupId) => `${root}\n#${group}`;
export function ShellSidebar(props: Props) {
  const { cards, projects, loaded, canvas } = props;
  const descriptionPrefix = useId();
  const host = useRef<HTMLElement>(null);
  const search = useRef<HTMLButtonElement>(null);
  const [focused, setFocused] = useState("");
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [repairRoot, setRepairRoot] = useState<string | null>(null);
  const menuIndex = useRef(0);
  const menuRoot = useRef<string | null>(null);
  // Where a canvas menu's focus goes when its row left the tree while it was open.
  const canvasMenuFocus = useRef<string | undefined>(undefined);
  const ownedFocus = useRef<string | null>(null);
  // Cancels the wait for the window's activation after a recovery made in the background.
  const activationFocus = useRef<() => void>(() => {});
  useEffect(() => () => activationFocus.current(), []);
  const previousRows = useRef<TreeRow[]>([]);
  const previousProjects = useRef<string[]>([]);
  const elements = useRef(new Map<string, HTMLElement>());
  const chevrons = useRef(new Map<string, HTMLElement>());
  const buffer = useRef({ text: "", at: 0 });
  const live = useRef(props); live.current = props;
  // The conversation list's place and order. While the pointer or focus is in the list its rows hold their order; after a
  // press on a canvas row below, the list holds its place until the pointer leaves the sidebar (POSTMORTEM 2026-11-06).
  const [sidebarPointer, setSidebarPointer] = useState(false);
  // Each hold names the canvas row whose list the pointer or focus is in, so it never passes to another canvas's list.
  const [listPointer, setListPointer] = useState<string | null>(null);
  const [listFocus, setListFocus] = useState<string | null>(null);
  // Where an unfolded list showed last, and the canvas row the pointer pressed while it stays in the sidebar.
  const placed = useRef<string | null>(null);
  // `arrived`: the press's move reached its canvas; leaving that canvas (keyboard, Back/Forward) ends the press, so a
  // later move to the same canvas never reuses it.
  const pressedRow = useRef<{ key: string; arrived: boolean } | null>(null);
  const drawn = useRef<string[] | null>(null);
  const rows: { key: string; parent?: string; canvas?: boolean; conversation?: boolean; name: string; activate(): void; right(): void; left(): void }[] = [];
  // Each listed canvas row on screen, for the conversation list placed under one of them.
  const canvasRows = new Map<string, { root: string; row: CanvasRow; canvases: readonly CanvasRow[] }>();
  // Set once the rows are built: the canvas row the list sits under, whether it has a list, and the list's first row.
  let listAt: string | null = null, listFirst: string | undefined;
  // Each listed, expanded project's groups and visible rows, built once for the keyboard order and the render. `state`: the root's
  // own problem or reading state, which describes the row even while a conversation state wins the slot.
  const layouts = new Map<string, { groups: SidebarGroup[]; items: SidebarItem[]; mark: RowSlot | null; state: RowSlot | null }>();
  const slowRoots = useSlowRoots(cards.flatMap(card => card.rows.filter(row => row.kind === "loading").map(row => row.path)));
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
    if (menu?.kind === "project" && staleMenu(menu, cards, menuRoot.current, [], false)) {
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
    // Every listed canvas of an expanded project is carried by its own row or its closed group's head.
    const covered = groups.flatMap(group => group.rows.map(row => slotKey(root!, row.path)));
    const slot = props.slots && projectSlot(props.slots, card.rows.map(row => row.path), covered);
    const slow = slowRoots.has(entry!.path);
    const mark = sidebarSlot(entry!, card.name, slot ?? null, slow);
    layouts.set(card.key, { groups, items, mark, state: sidebarSlot(entry!, card.name, null, slow) });
    // A project that is not listed has no groups to fold, so its row is not expandable (no aria-expanded).
    const listed = entry!.kind === "list";
    rows.push({ key: card.key, name: card.name, activate: () => props.toggle(card.key), right: () => { if (!listed) return; if (expanded) focus(groups[0] ? headKey(root!, groups[0].id) : card.key); else props.disclose(card.key); }, left: () => { if (listed && expanded) props.disclose(card.key); } });
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
        const key = `${root}\n${row.path}`;
        if (entry!.kind === "list") canvasRows.set(key, { root: entry!.path, row, canvases: entry!.canvases });
        const step = (arrow: "ArrowLeft" | "ArrowRight") => {
          const action = canvasArrow(key === listAt, !!props.conversations?.folded, arrow);
          if (action === "unfold" || action === "fold") props.conversations?.fold(action === "fold");
          else if (action === "firstConversation") focus(listFirst);
          else if (action === "head") focus(head);
        };
        rows.push({ key, parent: head, canvas: true, name: canvasStem(row.path), activate: () => { pressedRow.current = null; openCanvasRow(entry!.path, row, key); }, right: () => step("ArrowRight"), left: () => step("ArrowLeft") });
      }
    }
  }
  const conversations = props.conversations;
  const viewedKey = conversations && !props.home && !props.unlisted && loaded && canvas !== undefined && canvasRows.has(`${loaded}\n${canvas}`) ? `${loaded}\n${canvas}` : null;
  const press = pressedRow.current;
  if (press && viewedKey === press.key) press.arrived = true;
  else if (press?.arrived) pressedRow.current = null;
  const at = conversations ? listPlace(placed.current, viewedKey, rows.map(row => row.key), sidebarPointer ? pressedRow.current?.key ?? null : null) : null;
  const placedRow = at === null ? undefined : canvasRows.get(at);
  const holding = at !== null && (listPointer === at || listFocus === at);
  const listItems: SidebarConversation[] = conversations && placedRow
    ? viewedCanvasConversations(conversations.list(placedRow.root), placedRow.root, placedRow.row.path, placedRow.canvases, conversations.seen, conversations.now, holding ? drawn.current : null) : [];
  drawn.current = listItems.length ? listItems.map(c => c.conversationId) : null;
  if (at !== null && canvasDisclosure(true, listItems.length)) listAt = at;
  const listShown = listAt !== null && !conversations?.folded;
  placed.current = listShown ? listAt : null;
  // A list that left (folded, emptied, moved to another canvas) takes no pointerleave or blur with it.
  const owner = listShown ? listAt : null;
  if (listPointer !== null && listPointer !== owner) setListPointer(null);
  if (listFocus !== null && listFocus !== owner) setListFocus(null);
  const conversationKeys = placedRow && listShown ? listItems.map(c => conversationRowKey(placedRow.root, placedRow.row.path, c.conversationId)) : [];
  listFirst = conversationKeys[0];
  // Read at press time, when the list's place is settled; `listed` goes only to a row whose list shows.
  function openCanvasRow(root: string, row: CanvasRow, key: string) { if (key === listAt && listShown) props.open(root, row, true); else props.open(root, row); }
  const openConversation = (c: SidebarConversation) => { if (!props.locked && placedRow) conversations?.open(placedRow.root, placedRow.row, c.conversationId); };
  if (listAt !== null && conversationKeys.length) {
    const canvasKey = listAt;
    const arrow = (key: "ArrowLeft" | "ArrowRight") => { if (conversationArrow(key) === "canvas") focus(canvasKey); };
    rows.splice(rows.findIndex(row => row.key === canvasKey) + 1, 0, ...listItems.map((c, index) => ({
      key: conversationKeys[index]!, parent: canvasKey, conversation: true, name: c.heading, activate: () => openConversation(c), right: () => arrow("ArrowRight"), left: () => arrow("ArrowLeft"),
    })));
  }
  // Before the recovery below, which moves `previousRows` on: the place the vanished row had is read from them.
  useLayoutEffect(() => {
    if (menu?.kind !== "canvas" || !staleMenu(menu, cards, null, rows, !!props.locked)) return;
    canvasMenuFocus.current = rows.some(row => row.key === menu.key) ? undefined : recoveryKey(previousRows.current, rows, menu.key);
    setMenu(null);
  });
  useLayoutEffect(() => {
    const lost = ownedFocus.current;
    if (lost && !rows.some(row => row.key === lost) && !document.querySelector('[role="dialog"], dialog[open]')) {
      const projectIndex = previousProjects.current.indexOf(lost);
      const target = projectIndex >= 0 ? cards[Math.min(projectIndex, cards.length - 1)]?.key : recoveryKey(previousRows.current, rows, lost);
      if (document.activeElement === document.body || !document.activeElement?.isConnected) {
        focus(target);
        // In the background (`doan open` from a terminal), the window's activation would restore focus to the row
        // that went, and with that row gone to the first header control.
        activationFocus.current();
        activationFocus.current = refocusOnActivation(window, () => document.hasFocus(), () => {
          const element = target === undefined ? undefined : Array.from(host.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []).find(row => row.dataset.key === target);
          if (element?.isConnected && document.activeElement !== element && !document.querySelector('[role="dialog"], dialog[open]')) element.focus();
        });
      }
      ownedFocus.current = null;
    }
    if (lost && rows.some(row => row.key === lost)) ownedFocus.current = null;
    previousRows.current = rows.map(row => ({ key: row.key, ...(row.parent !== undefined ? { parent: row.parent } : {}), ...(row.canvas ? { canvas: true } : {}), ...(row.conversation ? { conversation: true } : {}) }));
    previousProjects.current = cards.map(card => card.key);
  });
  // The chevron sits inside its canvas row, which stays when the chevron goes, so the row recovery never sees it; with focus on it,
  // focus would fall to the page body (POSTMORTEM 2026-11-03). Checked after the commit, when nothing else took focus.
  const chevronRef = (key: string) => (node: HTMLButtonElement | null) => {
    if (node) { chevrons.current.set(key, node); return; }
    const gone = chevrons.current.get(key);
    chevrons.current.delete(key);
    if (!gone || gone !== document.activeElement) return;
    queueMicrotask(() => {
      const now = document.activeElement;
      // A re-render replaces the ref callback too (null, then the same node): a chevron still on the page keeps focus.
      if (!now || now === document.body || !now.isConnected) elements.current.get(key)?.focus();
    });
  };
  const rowRef = (key: string) => (node: HTMLDivElement | null) => {
    if (node) elements.current.set(key, node);
    else { if (elements.current.get(key)?.contains(document.activeElement)) ownedFocus.current = key; elements.current.delete(key); }
  };
  const active = rows.some(row => row.key === focused) ? focused : rows[0]?.key;
  // Radix spreads props over the aria-disabled it derives from `disabled`, so Overview repeats its own disabled state.
  const locked = props.locked || undefined;
  const lock = props.locked && props.lockReason ? { reason: props.lockReason, id: `${descriptionPrefix}-lock` } : null;
  const withHandle = (aside: ReactElement) => props.resize ? <>{aside}<ResizeHandle edge="end" className="doan-sidebar-handle" label="Resize sidebar" {...props.resize} /></> : aside;
  if (props.settings) {
    const { section, select, mcp = false } = props.settings;
    return withHandle(<aside className="side shell-side" id={props.id} ref={host} aria-label="Settings">
      <button ref={search} className="shell-search" aria-disabled={locked} onClick={props.search}><Search aria-hidden="true" />Search</button>
      <div className="shell-projects doan-scroll">
        <h2 className="shell-projects-heading">Settings</h2>
        <nav className="shell-settings-nav" aria-label="Settings">{settingsSectionsShown(mcp).map(item => {
          const Icon = SECTION_ICONS[item.id], current = item.id === section;
          return <button key={item.id} type="button" className="shell-settings-row row" aria-current={current ? "page" : undefined} aria-disabled={locked && !current ? true : undefined} onClick={() => select(item.id)}><Icon aria-hidden="true" /><span>{item.title}</span></button>;
        })}</nav>
      </div>
    </aside>);
  }
  // A conversation row: the panel shows it on press. Its Delete sits on the row's tab stop only, as the canvas row menu
  // button does, and is hidden visually at rest (POSTMORTEM 2026-11-03); an unavailable one stays reachable and reads why.
  const conversationRow = (c: SidebarConversation, index: number) => {
    const key = conversationKeys[index]!, stateId = `${descriptionPrefix}-conv-${c.conversationId}`, reasonId = `${stateId}-reason`;
    const reason = c.deletable.available ? null : c.deletable.reason, current = c.conversationId === conversations?.shown;
    return <div key={key} ref={rowRef(key)} className="shell-conv-row row" role="treeitem" aria-level={4} aria-label={c.heading} aria-describedby={c.slot ? stateId : undefined} aria-current={current ? "true" : undefined}
      aria-disabled={locked} tabIndex={active === key ? 0 : -1} data-key={key} onFocus={() => setFocused(key)} onKeyDown={event => keyboard(event, key)} onClick={() => openConversation(c)}>
      {current && <span className="shell-conv-check" aria-hidden="true"><Check aria-hidden="true" /></span>}
      <NameTip text={c.heading}><span className="shell-conv-title">{c.heading}</span></NameTip>
      <SlotMark slot={c.slot ?? undefined} described />
      {c.slot && <span className="sr-only" id={stateId}>{c.slot.label}</span>}
      <Tooltip><TooltipTrigger asChild><button type="button" className="doan-icon-button shell-more conv-trash" aria-label={deleteItemLabel(c.title)} tabIndex={active === key ? 0 : -1}
        aria-disabled={reason || locked ? true : undefined} aria-describedby={reason ? reasonId : locked && lock ? lock.id : undefined} onKeyDown={event => event.stopPropagation()} onClick={event => {
          event.stopPropagation();
          if (reason || props.locked || !placedRow || listAt === null) return;
          conversations?.remove({ conversationId: c.conversationId, root: placedRow.root, title: c.title, provider: c.provider, from: "sidebar", after: deleteFocus(conversationKeys, key, listAt), canvasRow: listAt }, event.currentTarget);
        }}><Trash2 aria-hidden="true" /></button></TooltipTrigger><TooltipContent>{reason ?? (locked && lock ? lock.reason : DELETE_TOOLTIP)}</TooltipContent></Tooltip>
      {reason && <span className="sr-only" id={reasonId}>{reason}</span>}
    </div>;
  };
  return withHandle(<aside className="side shell-side" id={props.id} ref={host} aria-label="Projects" onPointerEnter={() => setSidebarPointer(true)} onPointerLeave={() => { pressedRow.current = null; setSidebarPointer(false); }}>
    <button ref={search} className="shell-search" aria-disabled={locked} onClick={props.search}><Search aria-hidden="true" />Search</button>
    <button type="button" className="shell-home-row row" aria-current={props.homeCurrent ? "page" : undefined} aria-disabled={locked} onClick={() => props.goHome?.()}><House aria-hidden="true" /><span>Home</span></button>
    {lock && <span className="sr-only" id={lock.id}>{lock.reason}</span>}
    <div className="shell-projects doan-scroll">
      <h2 className="shell-projects-heading">Projects</h2>
      <div role="tree" aria-label="Projects and canvases">
      {cards.map((card, index) => {
        const project: ShellProject = { ...(projects[card.key] ?? { expanded: false }), roots: card.rows.map(row => row.path) };
        const selected = (card.rows.some(row => row.path === loaded) ? loaded : card.rows.some(row => row.path === project.selectedRoot) ? project.selectedRoot : undefined) ?? card.rows[0]?.path;
        const entry = card.rows.find(row => row.path === selected) ?? card.rows[0]!;
        const expanded = projectExpanded(project, loaded), current = !props.home && card.rows.some(row => row.path === loaded);
        const layout = layouts.get(card.key) ?? { groups: [], items: [], mark: null, state: null };
        const listed = entry.kind === "list", stateId = `${descriptionPrefix}-${index}-state`;
        const worktrees = worktreeSwitchModel(card.rows, entry.path, props.homeDirectory);
        const projectMenu = menu?.kind === "project" && menu.key === card.key;
        const menuEntry = (projectMenu && card.rows.find(row => row.path === repairRoot)) || entry;
        const menuInfo = cardRow(menuEntry, loaded, null);
        const target = () => live.current.cards.find(item => item.key === card.key)?.rows.find(row => row.path === menuEntry.path);
        const run = (action: () => void) => { if (target()) action(); };
        return <div className="shell-project" key={card.key}>
          <div ref={rowRef(card.key)} className={`shell-project-row row${card.rows.some(row => props.highlight?.includes(row.path)) ? " flash" : ""}`} role="treeitem" data-key={card.key} aria-label={card.name} aria-describedby={layout.state ? stateId : undefined} aria-disabled={locked} aria-level={1} aria-expanded={listed ? expanded : undefined} aria-current={current && !canvas && !props.unlisted ? "location" : undefined} tabIndex={active === card.key ? 0 : -1} onFocus={event => { if (event.target === event.currentTarget) setFocused(card.key); }} onKeyDown={event => keyboard(event, card.key)} onClick={() => props.toggle(card.key)}>
            {/* The chevron takes the thumbnail's place on hover and focus; tabIndex -1 because the row is the tree's stop and ←/→ fold it. */}
            <span className="shell-lead"><span className={`shell-thumbnail hue-${projectHue(card.name)}`} aria-hidden="true">{projectInitial(card.name)}</span>
              {listed && <button type="button" className="shell-disclosure" aria-label={`${expanded ? "Collapse" : "Expand"} ${card.name}`} tabIndex={-1} onClick={event => { event.stopPropagation(); props.disclose(card.key); }}><ChevronDown aria-hidden="true" /></button>}</span>
            <NameTip text={card.name}><span className="shell-project-name">{card.name}</span></NameTip>
            {worktrees && <WorktreeSwitch sidebar model={worktrees} reason={lock?.reason ?? null}
              tabIndex={active === card.key ? 0 : -1} onWorktree={props.worktree} recovery={{ action: props.action, projectSettings: props.projectSettings }} />}
            <RowSlotMark slot={layout.mark} />
            {layout.state && <span id={stateId} className="sr-only">{layout.state.label}</span>}
            <DropdownMenu.Root open={projectMenu} onOpenChange={open => { setMenu(open ? { kind: "project", key: card.key } : null); if (open) { setRepairRoot(null); menuIndex.current = index; menuRoot.current = entry.path; } }}>
              <Tooltip><TooltipTrigger asChild><DropdownMenu.Trigger asChild><button className="doan-icon-button shell-more" aria-label={`${card.name} menu`} tabIndex={active === card.key ? 0 : -1} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><Ellipsis aria-hidden="true" /></button></DropdownMenu.Trigger></TooltipTrigger>
                <TooltipContent>Project menu</TooltipContent></Tooltip>
              <DropdownMenu.Portal><DropdownMenu.Content className="menu doan-floating doan-menu shell-project-menu shell-side-menu" sideOffset={4} collisionPadding={8} align="end" onClick={event => event.stopPropagation()} onCloseAutoFocus={event => {
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
                }}><GitBranch aria-hidden="true" /><span><span>{worktreeLabel(row)}</span><small>{displayPath(row.path, props.homeDirectory)}</small></span>{row.path === menuEntry.path && <Check aria-hidden="true" />}</DropdownMenu.Item>)}
                <DropdownMenu.Separator className="doan-menu-sep" />
                <DropdownMenu.Item className="doan-menu-item" aria-disabled={locked} onSelect={() => run(() => props.overview(menuEntry.path))}><LayoutGrid />Overview</DropdownMenu.Item>
                <DropdownMenu.Item className="doan-menu-item" onSelect={() => run(() => void props.action("showInFinder", menuEntry.path))}><FolderOpen />Show in Finder</DropdownMenu.Item>
                <DropdownMenu.Item className="doan-menu-item" aria-disabled={locked} onSelect={() => run(() => props.projectSettings(menuEntry.path))}><Settings />Project Settings</DropdownMenu.Item>
                {menuInfo.actions.filter(action => action !== "remove" && action !== "showInFinder").map(action => {
                  const Icon = icons[action];
                  return <DropdownMenu.Item className="doan-menu-item" key={action} onSelect={() => run(() => void props.action(action, menuEntry.path))}>{Icon && <Icon />}{labels[action]}</DropdownMenu.Item>;
                })}
                <DropdownMenu.Item className="doan-menu-item" onSelect={() => {
                  const current = live.current.cards.find(item => item.key === card.key);
                  if (current) void props.remove(current.rows.map(row => row.path));
                }}><CircleMinus />Remove from Doan</DropdownMenu.Item>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
          {expanded && listed && <div role="group">
            {layout.groups.map(group => {
              const key = headKey(entry.path, group.id), countId = `${descriptionPrefix}-${index}-${group.id}`;
              const Icon = group.id === "ds" ? SwatchBook : PanelsTopLeft;
              return <div className="shell-group" key={group.id}>
                <div ref={rowRef(key)} className="shell-group-head row" role="treeitem" data-key={key} aria-label={group.label} aria-describedby={countId} aria-disabled={locked} aria-level={2} aria-expanded={group.open} tabIndex={active === key ? 0 : -1} onFocus={event => { if (event.target === event.currentTarget) setFocused(key); }} onKeyDown={event => keyboard(event, key)} onClick={() => props.toggleGroup(card.key, group.id)}><ChevronDown aria-hidden="true" /><span className="shell-group-label">{group.label}</span><span className="doan-chip shell-group-count" data-ui-variant="translucent" aria-hidden="true">{group.rows.length}</span>{props.slots && <SlotMark slot={groupSlot(props.slots, entry.path, group)} />}<span id={countId} className="sr-only">{countDescription(group.rows.length)}</span></div>
                {group.open && <div role="group">{group.rows.length ? group.rows.map((row, canvasIndex) => {
                  const descriptionId = `${countId}-${canvasIndex}`;
                  const key = `${entry.path}\n${row.path}`, problem = rowProblem(row), name = canvasStem(row.path);
                  // The canvas row the conversation list sits under: its icon gives way to the chevron on hover or keyboard focus, and its slot drops
                  // the signals the list's rows carry. The chevron never takes focus, so it cannot drop it to the page.
                  const here = key === listAt, folded = !!conversations?.folded;
                  const slot = here && conversations ? canvasRowMark(props.slots ?? new Map(), conversations.bare, key, !folded) : props.slots?.get(slotKey(entry.path, row.path));
                  return <Fragment key={key}><div><div ref={rowRef(key)} className="shell-canvas-row row" aria-describedby={problem ? descriptionId : undefined} aria-label={name} data-key={key} role="treeitem" aria-disabled={locked} aria-level={3} aria-current={!props.home && entry.path === loaded && row.path === canvas && !props.unlisted ? "location" : undefined} aria-expanded={here ? !folded : undefined} tabIndex={active === key ? 0 : -1} onFocus={() => setFocused(key)} onKeyDown={event => keyboard(event, key)} onClick={() => { pressedRow.current = { key, arrived: false }; openCanvasRow(entry.path, row, key); }}>
                    {here ? <span className="shell-lead canvas-lead"><Icon className="canvas-icon" aria-hidden="true" /><button ref={chevronRef(key)} type="button" className="shell-disclosure" aria-label={`${folded ? "Expand" : "Collapse"} ${name}`} tabIndex={-1}
                      onMouseDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); conversations?.fold(!folded); }}><ChevronDown aria-hidden="true" /></button></span> : <Icon aria-hidden="true" />}
                    <NameTip text={name}><span>{name}</span></NameTip><SlotMark slot={slot} />
                    {canvasRowMenu({ menu: props.canvasMenu, root: entry.path, row, name, reasonId: descriptionId, open: menu?.kind === "canvas" && menu.key === key, locked: !!locked, lock, tabIndex: active === key ? 0 : -1,
                      setOpen: open => setMenu(open ? { kind: "canvas", key } : null), rowNode: () => elements.current.get(key),
                      current: () => { const listed = live.current.cards.flatMap(item => item.rows).find(item => item.path === entry.path); return listed?.kind === "list" ? listed.canvases.find(item => item.path === row.path) : undefined; },
                      lostFocus: () => focus(canvasMenuFocus.current) })}</div>{problem && <div id={descriptionId} className="shell-canvas-error"><AlertIcon /><div>{problem.sentence}<ErrorDetails detail={problem.detail}>{(button, detail) => <>{button}{detail && <pre className="selectable">{detail}</pre>}</>}</ErrorDetails></div></div>}</div>
                    {/* The list is the canvas row's sibling, so the row's own focus rules and press never reach it. */}
                    {here && listShown && <div role="group" className="shell-conv-list" aria-label="Conversations" onPointerEnter={() => setListPointer(key)} onPointerLeave={() => setListPointer(null)}
                      onFocus={() => setListFocus(key)} onBlur={event => { if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) setListFocus(null); }}>{listItems.map(conversationRow)}</div>}
                  </Fragment>;
                }) : <p className="shell-empty">{group.empty}</p>}</div>}
              </div>;
            })}
          </div>}
        </div>;
      })}
      </div>
    </div>
  </aside>);
}
