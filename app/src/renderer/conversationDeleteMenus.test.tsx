import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";

// conversation-delete spec 1–3 and design §3.3 in both title menus (the Overview's Conversation menu, the canvas
// panel's Title menu), and N1 (orch decisions 1–2): the header's New conversation is unavailable on the new
// conversation state. Radix menus render nothing closed under static markup, so the menu parts are drawn inline here
// and record their props for the test to press; Tooltip stays real.
const menu = vi.hoisted(() => ({ items: [] as Record<string, unknown>[], roots: [] as Record<string, unknown>[], contents: [] as Record<string, unknown>[] }));
vi.mock("radix-ui", async original => {
  const actual = await original<typeof import("radix-ui")>();
  const { createElement, forwardRef } = await import("react");
  const part = (tag: string, role?: string, record?: Record<string, unknown>[]) => forwardRef<HTMLElement, Record<string, unknown>>(({ children, asChild, textValue: _t, onSelect: _s, onCloseAutoFocus: _c, value: _v, onValueChange: _o, sideOffset: _so, collisionPadding: _cp, align: _a, ...props }, ref) => {
    record?.push({ ...props, children, asChild, textValue: _t, onSelect: _s, onCloseAutoFocus: _c, value: _v });
    if (asChild) return children as ReactElement;
    return createElement(tag, { ...props, ...(role ? { role } : {}), ref }, children as ReactNode);
  });
  const Root = ({ children, ...props }: Record<string, unknown>) => { menu.roots.push(props); return children as ReactElement; };
  return { ...actual, DropdownMenu: {
    Root, Portal: ({ children }: { children: ReactNode }) => children, Trigger: part("button"), Content: part("div", "menu", menu.contents), RadioGroup: part("div", "group"),
    RadioItem: part("div", "menuitemradio", menu.items), Item: part("div", "menuitem", menu.items), Separator: part("div", "separator"), Label: part("div"),
  } };
});
const focused = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("./chipField", async original => ({ ...await original<typeof import("./chipField")>(), focusFieldEnd: (field: unknown) => { focused.calls.push(field); } }));
// The New conversation button's props, recorded by its tooltip trigger.
const triggers = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("./components/ui/tooltip", async original => {
  const actual = await original<typeof import("./components/ui/tooltip")>();
  return { ...actual, TooltipTrigger: ({ children }: { children: ReactElement }) => {
    if (isValidElement(children)) triggers.push(children.props as Record<string, unknown>);
    return cloneElement(children);
  } };
});
const { TooltipProvider } = await import("./components/ui/tooltip");
const { ProjectOverview } = await import("./ProjectOverview");
const { CanvasConversationTitle } = await import("./CanvasConversationPanel");
const { OverviewRun } = await import("./overviewRun");
const { CanvasRun } = await import("./canvasRun");
const { ConversationStore } = await import("./conversationStore");
const { DockedSupport } = await import("./dockedSupport");
type ListView = import("./conversationStore").ListView;

const ROOT = "/code/doan";
const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000002", C = "cccccccc-0000-4000-8000-000000000003";
const CANVAS: Canvas = { path: ".doan/canvases/checkout.html", id: "checkout" };
const entry = { kind: "list", path: ROOT, servedRev: 0, canvases: [{ path: CANVAS.path, id: "checkout", url: "u" }], git: { branch: "main", common: "/code/doan/.git" } } as unknown as FolderEntry;
const summary = (conversationId: string, title: string, extra: Partial<ConversationSummary> = {}): ConversationSummary => ({ conversationId, title, state: "current", owner: "doan", provider: "claude",
  fromHome: true, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-10-30T00:00:00.000Z", preview: "p", ...extra });
const FIELD = { field: true };

beforeEach(() => {
  menu.items.length = 0; menu.roots.length = 0; menu.contents.length = 0; triggers.length = 0; focused.calls.length = 0;
  vi.stubGlobal("window", { doan: { readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null), conversationResumeTarget: vi.fn(async () => ({ available: false, reason: "no_record" })) } });
  vi.stubGlobal("document", { querySelector: (selector: string) => selector.endsWith(".composer-input") ? FIELD : null });
});
afterEach(() => vi.unstubAllGlobals());

// current undefined: nothing picked yet, so a list being read shows nothing (wait).
function overview(list: ListView, current: string | null | undefined) {
  const run = new OverviewRun({
    list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "doan", changed: () => {},
  });
  run.show(ROOT);
  if (current !== undefined) run.select(ROOT, current);
  const onDeleteConversation = vi.fn();
  const html = renderToStaticMarkup(<TooltipProvider><ProjectOverview run={run} support={new DockedSupport(() => {})} root={ROOT} project="doan" entry={entry} worktrees={[entry]} homeDirectory="/code"
    notice={null} unavailable={null} list={list} seen={new Set()} holder={null} prefs={{}} defaults={null} now={Date.parse("2026-10-30T00:03:00.000Z")}
    onWorktree={() => {}} onOpenCanvas={() => {}} onRetryList={() => {}} onStart={async () => ({ ok: true })} onSettings={() => {}}
    onSendConversation={async () => {}} onAction={() => {}} onProjectSettings={() => {}} onDeleteConversation={onDeleteConversation} /></TooltipProvider>);
  return { run, html, onDeleteConversation };
}
function canvas(list: ListView, current: string | null) {
  const lists = new Map<string, ListView>([[ROOT, list]]);
  const store = new ConversationStore({ list: root => lists.get(root) ?? "loading", readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() });
  const run = new CanvasRun({ list: root => lists.get(root) ?? "loading", readsStarted: () => 1, readsApplied: () => 1, reread: vi.fn(), markSeen: vi.fn(), focused: () => true, drawing: () => null, changed: vi.fn() }, store);
  run.show({ root: ROOT, canvas: CANVAS });
  run.sync();
  run.select(current);
  const onDelete = vi.fn(), onPicked = vi.fn();
  const html = renderToStaticMarkup(<TooltipProvider><CanvasConversationTitle run={run} list={list} canvasName="checkout" now={Date.parse("2026-10-30T00:03:00.000Z")} seen={new Set()}
    title={current ? "t" : "New conversation"} current={current} onPicked={onPicked} onDelete={onDelete} /></TooltipProvider>);
  return { run, html, onDelete, onPicked };
}
const deleteItem = (title: string) => menu.items.find(props => props["aria-label"] === `Delete “${title}”`);
const press = (props: Record<string, unknown> | undefined) => { const event = { preventDefault: vi.fn() }; (props!["onSelect"] as (event: unknown) => void)(event); return event; };
const projectList = () => [summary(A, "Checkout copy"), summary(B, "Running one", { working: true, phase: "running" }), summary(C, "Asking one", { phase: "waiting", working: true })];
const canvasList = () => projectList().map(c => ({ ...c, canvas: CANVAS, fromHome: false }));

const screens = [
  ["Overview Conversation menu", () => overview(projectList(), A)],
  ["canvas panel Title menu", () => canvas(canvasList(), A)],
] as const;

test.each(screens)("%s: each conversation row is a wrapper holding its radio item, then its Delete; New conversation has none", (_name, draw) => {
  const { html } = draw();
  const rows = html.split('<div class="conv-row">').slice(1);
  expect(rows).toHaveLength(3);
  for (const [row, title] of rows.map((row, i) => [row, ["Checkout copy", "Running one", "Asking one"][i]!] as const)) {
    expect(row.indexOf('role="menuitemradio"')).toBeLessThan(row.indexOf(`aria-label="Delete “${title}”"`));
    expect(row).toMatch(/^<div class="doan-menu-item conv-item[^"]*" role="menuitemradio"/);
    // The Delete is a sibling of the radio item, not nested in it.
    const radio = row.slice(row.indexOf('role="menuitemradio"'));
    expect(radio.slice(0, radio.indexOf('class="doan-icon-button conv-delete"'))).toContain("</div>");
  }
  const newRow = html.slice(html.indexOf("conv-new"), html.indexOf('<div class="conv-list">'));
  expect(newRow).not.toContain("conv-delete");
  // Typeahead reaches rows only.
  expect(menu.items.filter(props => props["className"] === "doan-icon-button conv-delete").every(props => props["textValue"] === "")).toBe(true);
});

test.each(screens)("%s: Delete on a working or waiting conversation is unavailable, reachable and reads its reason", (_name, draw) => {
  const { html } = draw();
  expect(deleteItem("Checkout copy")!["aria-disabled"]).toBeUndefined();
  for (const [title, reason] of [["Running one", "The agent is working on this conversation."], ["Asking one", "The agent is waiting for your answer."]] as const) {
    const item = deleteItem(title)!;
    expect(item["aria-disabled"]).toBe(true);
    expect(item["disabled"]).toBeUndefined();
    expect(html).toContain(`<span class="sr-only" id="${item["aria-describedby"]}">${reason}</span>`);
  }
});

test("Overview: Delete asks the host about that conversation and its trigger, and the row's own pick is not made", () => {
  const { run, onDeleteConversation } = overview(projectList(), A);
  const select = vi.spyOn(run, "select");
  const event = press(deleteItem("Checkout copy"));
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(onDeleteConversation).toHaveBeenCalledWith({ conversationId: A, root: ROOT, title: "Checkout copy", provider: "claude", from: "overview" }, null);
  expect(select).not.toHaveBeenCalled();
  // The closing menu leaves focus to the alert; a later close returns it as before.
  const close = menu.contents.find(props => props["className"] === "doan-floating doan-menu conv-menu")!["onCloseAutoFocus"] as (event: { preventDefault(): void }) => void;
  const first = { preventDefault: vi.fn() }, second = { preventDefault: vi.fn() };
  close(first); close(second);
  expect(first.preventDefault).toHaveBeenCalledOnce();
  expect(second.preventDefault).not.toHaveBeenCalled();
});

test("canvas panel: Delete asks the host about that conversation and its trigger, and the row's own pick is not made", () => {
  const { run, onDelete, onPicked } = canvas(canvasList(), A);
  const select = vi.spyOn(run, "select");
  press(deleteItem("Checkout copy"));
  expect(onDelete).toHaveBeenCalledWith({ conversationId: A, root: ROOT, title: "Checkout copy", provider: "claude", from: "canvas" }, null);
  expect(select).not.toHaveBeenCalled();
  const close = menu.contents.find(props => props["className"] === "doan-floating doan-menu conv-menu")!["onCloseAutoFocus"] as (event: { preventDefault(): void }) => void;
  const first = { preventDefault: vi.fn() };
  close(first);
  expect(first.preventDefault).toHaveBeenCalledOnce();
  expect(onPicked).not.toHaveBeenCalled();
});

test.each(screens)("%s: an unavailable Delete does nothing when pressed", (_name, draw) => {
  const { run, ...rest } = draw();
  const host = "onDeleteConversation" in rest ? rest.onDeleteConversation : rest.onDelete;
  const event = press(deleteItem("Running one"));
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(host).not.toHaveBeenCalled();
  void run;
});

// Runtime probe (T4 step 0): the title menus are controlled so the Delete tooltip's Escape closes them.
test.each(screens)("%s: the title menu is controlled, so a closing Escape can come from the Delete's tooltip", (_name, draw) => {
  draw();
  const root = menu.roots.find(props => "open" in props)!;
  expect(root["open"]).toBe(false);
  expect(typeof root["onOpenChange"]).toBe("function");
});

test.each([
  ["Overview, list read error", () => overview("error", null)],
  ["Overview, list loading", () => overview("loading", null)],
  ["canvas panel, list read error", () => canvas("error", null)],
  ["canvas panel, list loading", () => canvas("loading", null)],
])("%s: no row and no Delete", (_name, draw) => {
  const { html } = draw();
  expect(html).not.toContain("conv-delete");
  expect(html).not.toContain("conv-row");
});

// N1: on the new conversation state the header's New conversation keeps its tooltip and focus order but does nothing.
const newButton = () => triggers.find(props => props["aria-label"] === "New conversation")!;
test("Overview: New conversation is unavailable on the new conversation state and does nothing", async () => {
  const { run } = overview(projectList(), null);
  expect(run.view(ROOT).kind).toBe("new");
  const select = vi.spyOn(run, "select");
  expect(newButton()["aria-disabled"]).toBe(true);
  expect(newButton()["disabled"]).toBeUndefined();
  (newButton()["onClick"] as () => void)();
  await Promise.resolve();
  expect(select).not.toHaveBeenCalled();
  expect(focused.calls).toEqual([]);
});
test("Overview: New conversation stays available on a shown conversation and while the list is read", async () => {
  overview(projectList(), A);
  expect(newButton()["aria-disabled"]).toBeUndefined();
  triggers.length = 0;
  const { run } = overview("loading", undefined);
  expect(run.view(ROOT).kind).toBe("wait");
  expect(newButton()["aria-disabled"]).toBeUndefined();
  (newButton()["onClick"] as () => void)();
  await Promise.resolve();
  expect(focused.calls).toEqual([FIELD]);
});
test("canvas panel: New conversation is unavailable on the new conversation state and does nothing", () => {
  const { run, onPicked } = canvas(canvasList(), null);
  expect(run.view()?.kind).toBe("new");
  const select = vi.spyOn(run, "select");
  expect(newButton()["aria-disabled"]).toBe(true);
  (newButton()["onClick"] as () => void)();
  expect(select).not.toHaveBeenCalled();
  expect(onPicked).not.toHaveBeenCalled();
});
test("canvas panel: New conversation stays available on a shown conversation", () => {
  const { run, onPicked } = canvas(canvasList(), A);
  expect(run.view()?.kind).toBe("conversation");
  const select = vi.spyOn(run, "select");
  expect(newButton()["aria-disabled"]).toBeUndefined();
  (newButton()["onClick"] as () => void)();
  expect(select).toHaveBeenCalledWith(null);
  expect(onPicked).toHaveBeenCalledOnce();
});
