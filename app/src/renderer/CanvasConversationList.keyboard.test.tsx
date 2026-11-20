import { type ReactElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { CanvasRow } from "../main/view";

// ↑/↓, Home and End from a focused row Delete move between rows only.
// The list's hooks run as plain state (App.conversationPanel.test.tsx), so its own key handling runs without a DOM.
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
  tree = CanvasConversationList({ list, project: "acme", thumbnails: new Map(), open: noop, retry: noop, onVisible: noop, onDelete: noop, scroller: { current: null }, title: { current: { focus: () => { focused.push("heading"); } } as HTMLElement } }) as ReactElement<Record<string, unknown>>;
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
