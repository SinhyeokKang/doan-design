import { type ReactElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { CanvasRow } from "../main/view";

// ↑/↓, Home and End from a focused row Delete move between rows only; the list's hooks run as plain state, so its own
// key handling runs without a DOM.
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, layouts: [] as (() => void)[] }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next; }];
    },
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: () => {}, useLayoutEffect: (effect: () => void) => { hooks.layouts.push(effect); },
    useId: () => "id",
  };
});

const { CanvasConversationList, RowDelete } = await import("./CanvasConversationList");
const { canvasConversationRows } = await import("./canvasConversationRows");

const NOW = Date.parse("2026-11-01T12:00:00.000Z");
const summary = (conversationId: string, path: string, minutes: number): ConversationSummary => ({
  conversationId, title: `Title ${conversationId}`, owner: "doan", provider: "claude", fromHome: false, phase: "ended", unseen: false,
  queued: 0, working: false, lastActivityAt: new Date(NOW - minutes * 60_000).toISOString(), preview: "", canvas: { path },
});
const canvas = (path: string): CanvasRow => ({ path, url: `doan://${path}` });
const paths = ["a", "b", "c", "d"].map(name => `.doan/canvases/${name}.html`);
const rows = canvasConversationRows(paths.map((path, index) => summary(`c${index + 1}`, path, index)), paths.map(canvas), NOW);
const noop = () => {};
let focused: string[];
let tree: ReactElement<Record<string, unknown>>;

function render(list: Parameters<typeof CanvasConversationList>[0]["list"] = rows, retryButton: object | null = null) {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.layouts = [];
  tree = CanvasConversationList({ list, current: null, project: "acme", thumbnails: new Map(), open: noop, retry: noop, onVisible: noop, onDelete: noop, scroller: { current: null }, title: { current: { focus: () => { focused.push("heading"); } } as HTMLElement } }) as ReactElement<Record<string, unknown>>;
  if (tree.props.ref) (tree.props.ref as { current: unknown }).current = {
    contains: (node: unknown) => node !== null && node === retryButton,
    querySelector: (selector: string) => ({ focus: () => focused.push(/data-key="([^"]+)"/.exec(selector)![1]!) }),
  };
}
type RowProps = { item: { key: string }; tabbable: boolean; focus(): void; blur(to: unknown): void; children: ReactElement<Parameters<typeof RowDelete>[0]> };
const rowOf = (key: string) => (tree.props.children as ReactElement<RowProps>[]).find(row => row.props.item.key === key)!.props;
const tabStop = () => (tree.props.children as ReactElement<RowProps>[]).find(row => row.props.tabbable)!.props.item.key;
const press = (key: string) => { (tree.props.onKeyDown as (event: unknown) => void)({ key, preventDefault: noop }); render(); };

beforeEach(() => {
  hooks.states = []; hooks.refs = []; focused = [];
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  vi.stubGlobal("document", { activeElement: null, body: {}, addEventListener: noop, removeEventListener: noop });
});
afterEach(() => vi.unstubAllGlobals());

test("Tab from a row to its Delete, then ↑/↓, Home and End move between rows from that row", () => {
  render();
  expect(rows.map(row => row.key)).toEqual(["c1", "c2", "c3", "c4"]);
  // Tab: the row takes focus, then its Delete; the row's blur names the Delete, which ends the row's focus memory.
  rowOf("c2").focus(); render();
  const remove = { name: "Delete c2" };
  rowOf("c2").blur(remove);
  rowOf("c2").children.props.onFocus(); render();
  expect(tabStop()).toBe("c2");
  press("ArrowDown");
  expect(focused).toEqual(["c3"]);
  expect(tabStop()).toBe("c3");
  rowOf("c3").children.props.onFocus(); render();
  press("ArrowUp");
  expect(focused).toEqual(["c3", "c2"]);
  rowOf("c4").children.props.onFocus(); render();
  press("Home");
  rowOf("c1").children.props.onFocus(); render();
  press("End");
  expect(focused).toEqual(["c3", "c2", "c1", "c4"]);
});

test("a Delete focused by itself (a click) moves from its own row, not the list's earlier Tab stop", () => {
  render();
  expect(tabStop()).toBe("c1");
  rowOf("c3").children.props.onFocus(); render();
  press("ArrowDown");
  expect(focused).toEqual(["c4"]);
});

test.each([true, false])("removing the focused Retry moves to the first row or, if empty, the heading (empty %s)", empty => {
  const button = { isConnected: true }, body = {};
  const doc = { body, activeElement: button as object, hasFocus: () => true };
  vi.stubGlobal("document", doc);
  render("error", button);
  for (const effect of hooks.layouts) effect();
  render(empty ? [] : rows);
  doc.activeElement = body;
  button.isConnected = false;
  for (const effect of hooks.layouts) effect();
  expect(focused).toEqual([empty ? "heading" : "c1"]);
});

test("a person who leaves Retry before the empty list arrives keeps focus", () => {
  const button = { isConnected: true }, elsewhere = { isConnected: true };
  const doc = { body: {}, activeElement: button, hasFocus: () => true };
  vi.stubGlobal("document", doc);
  render("error", button);
  for (const effect of hooks.layouts) effect();
  doc.activeElement = elsewhere;
  render([]);
  button.isConnected = false;
  for (const effect of hooks.layouts) effect();
  expect(focused).toEqual([]);
});

// The Overview's Conversations list mixes project rows (no canvas) with canvas rows.
const project = (conversationId: string, minutes: number): ConversationSummary => { const { canvas: _bound, ...unbound } = summary(conversationId, "", minutes); return unbound; };
const mixed = canvasConversationRows([project("p1", 0), summary("c1", paths[0]!, 1), project("p2", 2), summary("c2", paths[1]!, 3)], paths.map(canvas), NOW);
function renderWith(list: Parameters<typeof CanvasConversationList>[0]["list"], current: string | null) {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.layouts = [];
  tree = CanvasConversationList({ list, current, project: "acme", thumbnails: new Map(), open: noop, retry: noop, onVisible: noop, onDelete: noop, scroller: { current: null }, title: { current: { focus: () => { focused.push("heading"); } } as HTMLElement } }) as ReactElement<Record<string, unknown>>;
  if (tree.props.ref) (tree.props.ref as { current: unknown }).current = {
    contains: () => false,
    querySelector: (selector: string) => ({ focus: () => focused.push(/data-key="([^"]+)"/.exec(selector)![1]!) }),
  };
}
const order = () => (tree.props.children as ReactElement<RowProps>[]).map(row => row.props.item.key);
// The focused row's own focus handler runs, as the browser's focus event would.
const pressWith = (key: string, current: string | null) => {
  (tree.props.onKeyDown as (event: unknown) => void)({ key, preventDefault: noop }); renderWith(mixed, current);
  rowOf(focused.at(-1)!).focus(); renderWith(mixed, current);
};

test("↑/↓, Home and End move between project and canvas rows alike, without opening any", () => {
  renderWith(mixed, null);
  expect(order()).toEqual(["p1", "c1", "p2", "c2"]);
  rowOf("p1").focus(); renderWith(mixed, null);
  pressWith("ArrowDown", null);
  pressWith("ArrowDown", null);
  pressWith("End", null);
  pressWith("ArrowUp", null);
  pressWith("Home", null);
  expect(focused).toEqual(["c1", "p2", "c2", "p2", "p1"]);
});

test("Tab moves from a project row to its Delete: both share the row's Tab stop", () => {
  renderWith(mixed, null);
  rowOf("p2").focus(); renderWith(mixed, null);
  rowOf("p2").children.props.onFocus(); renderWith(mixed, null);
  expect(tabStop()).toBe("p2");
  expect(rowOf("p2").children.props.tabbable).toBe(true);
});

test("entering with Tab: the last focused row, else the current row, else the first row", () => {
  renderWith(mixed, null);
  expect(tabStop()).toBe("p1");
  hooks.states = []; hooks.refs = [];
  renderWith(mixed, "p2");
  expect(tabStop()).toBe("p2");
  rowOf("c2").focus(); renderWith(mixed, "p2");
  rowOf("c2").blur({ elsewhere: true }); renderWith(mixed, "p2");
  expect(tabStop()).toBe("c2");
  // A shown conversation the list does not have yet, or a canvas row under its key, is no Tab stop of its own.
  hooks.states = []; hooks.refs = [];
  renderWith(mixed, "p9");
  expect(tabStop()).toBe("p1");
  hooks.states = []; hooks.refs = [];
  renderWith(mixed, "c1");
  expect(tabStop()).toBe("p1");
});

test("while the pointer is in the list the order holds and a new row joins at the end; leaving sorts again", () => {
  renderWith(mixed, null);
  (tree.props.onPointerEnter as () => void)(); renderWith(mixed, null);
  const moved = canvasConversationRows([project("p1", 4), summary("c1", paths[0]!, 1), project("p2", 0), summary("c2", paths[1]!, 3), project("p3", 0)], paths.map(canvas), NOW);
  renderWith(moved, null);
  expect(order()).toEqual(["p1", "c1", "p2", "c2", "p3"]);
  // Status and time still follow the new list.
  expect((tree.props.children as ReactElement<RowProps>[])[0]!.props.item).toBe(moved.find(row => row.key === "p1"));
  (tree.props.onPointerLeave as () => void)(); renderWith(moved, null);
  expect(order()).toEqual(["p2", "p3", "c1", "c2", "p1"]);
});

test("while keyboard focus is in the list the order holds; it sorts again once focus and pointer have both left", () => {
  renderWith(mixed, null);
  const list = () => tree.props as { onFocus(): void; onBlur(event: unknown): void; onPointerEnter(): void; onPointerLeave(): void };
  list().onFocus(); renderWith(mixed, null);
  list().onPointerEnter(); renderWith(mixed, null);
  const moved = canvasConversationRows([project("p1", 4), summary("c1", paths[0]!, 1), project("p2", 0), summary("c2", paths[1]!, 3)], paths.map(canvas), NOW);
  renderWith(moved, null);
  list().onPointerLeave(); renderWith(moved, null);
  expect(order()).toEqual(["p1", "c1", "p2", "c2"]);
  // Focus moving between rows stays in the list.
  list().onBlur({ relatedTarget: { inside: true }, currentTarget: { contains: (node: unknown) => (node as { inside?: boolean }).inside === true } }); renderWith(moved, null);
  expect(order()).toEqual(["p1", "c1", "p2", "c2"]);
  list().onBlur({ relatedTarget: { inside: false }, currentTarget: { contains: (node: unknown) => (node as { inside?: boolean }).inside === true } }); renderWith(moved, null);
  expect(order()).toEqual(["p2", "c1", "c2", "p1"]);
});

// A list that left (emptied, read again, failed) takes no pointerleave or blur with it.
test.each(["empty", "loading", "error"] as const)("a list that leaves under the pointer or focus holds no order when rows come back (%s)", gone => {
  renderWith(mixed, null);
  const list = () => tree.props as { onFocus(): void; onPointerEnter(): void };
  list().onPointerEnter(); list().onFocus(); renderWith(mixed, null);
  renderWith(gone === "empty" ? [] : gone, null);
  renderWith(gone === "empty" ? [] : gone, null);
  // The rows come back in the list's order; a later activity change sorts them again.
  renderWith(mixed, null);
  const moved = canvasConversationRows([project("p1", 4), summary("c1", paths[0]!, 1), project("p2", 0), summary("c2", paths[1]!, 3)], paths.map(canvas), NOW);
  renderWith(moved, null);
  renderWith(moved, null);
  expect(order()).toEqual(["p2", "c1", "c2", "p1"]);
});

test("the loading line names the list", () => {
  renderWith("loading", null);
  const loading = tree.type as () => ReactElement<{ children: ReactElement<{ children: unknown }> }>;
  hooks.cursor = 0; hooks.states = [true];
  const text = JSON.stringify(loading().props.children);
  expect(text).toContain("Loading conversations");
  expect(text).not.toContain("canvas");
});
