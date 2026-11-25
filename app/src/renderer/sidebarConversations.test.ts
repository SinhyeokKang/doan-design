import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { SidebarSlot } from "./canvasNotice";
import { slotKey } from "./homeConversations";
import {
  canvasArrow, canvasDisclosure, canvasRowMark, conversationArrow, conversationRowKey, deleteFocus, listPlace, viewedCanvasConversations,
} from "./sidebarConversations";

// Pure, so ShellSidebar and App only wire it.

const ROOT = "/w/a";
const NOW = Date.parse("2026-11-14T12:00:00.000Z");
const at = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const A = { path: ".doan/canvases/a.html", id: "a" };
const B = { path: ".doan/canvases/b.html", id: "b" };
const PLAIN = { path: ".doan/canvases/plain.html" };
const ROWS = [A, B, PLAIN];
const none = new Set<string>();
const summary = (conversationId: string, patch: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId, canvas: A, title: `Title ${conversationId}`, owner: "doan", provider: "claude", fromHome: false,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: at(60), preview: "", ...patch,
});
const ids = (rows: readonly { conversationId: string }[]) => rows.map(row => row.conversationId);

describe("viewedCanvasConversations", () => {
  test("two or more conversations of the viewed canvas, by latest activity", () => {
    const list = [summary("old", { lastActivityAt: at(30) }), summary("new", { lastActivityAt: at(1) }), summary("mid", { lastActivityAt: at(10) }), summary("b", { canvas: B })];
    expect(ids(viewedCanvasConversations(list, ROOT, A.path, ROWS, none, NOW))).toEqual(["new", "mid", "old"]);
  });

  test("none or one conversation shows no list", () => {
    expect(viewedCanvasConversations([], ROOT, A.path, ROWS, none, NOW)).toEqual([]);
    expect(viewedCanvasConversations([summary("one"), summary("b", { canvas: B })], ROOT, A.path, ROWS, none, NOW)).toEqual([]);
  });

  test("a list still loading or that failed shows no list", () => {
    expect(viewedCanvasConversations("loading", ROOT, A.path, ROWS, none, NOW)).toEqual([]);
    expect(viewedCanvasConversations("error", ROOT, A.path, ROWS, none, NOW)).toEqual([]);
  });

  test("no viewed canvas, or one that is not listed, shows no list", () => {
    const list = [summary("x"), summary("y")];
    expect(viewedCanvasConversations(list, ROOT, null, ROWS, none, NOW)).toEqual([]);
    expect(viewedCanvasConversations(list, ROOT, A.path, [B, PLAIN], none, NOW)).toEqual([]);
  });

  test("membership by canvas ID first, so a moved canvas keeps its conversations; a canvas without an ID matches by path", () => {
    const list = [summary("moved", { canvas: { path: ".doan/canvases/old-name.html", id: "a" } }), summary("here")];
    expect(ids(viewedCanvasConversations(list, ROOT, A.path, ROWS, none, NOW)).sort()).toEqual(["here", "moved"]);
    const plain = [summary("p1", { canvas: PLAIN }), summary("p2", { canvas: PLAIN, lastActivityAt: at(1) })];
    expect(ids(viewedCanvasConversations(plain, ROOT, PLAIN.path, ROWS, none, NOW))).toEqual(["p2", "p1"]);
  });

  test("two listed rows sharing the canvas ID show no list", () => {
    const twins = [A, { path: ".doan/canvases/copy.html", id: "a" }];
    expect(viewedCanvasConversations([summary("x"), summary("y")], ROOT, A.path, twins, none, NOW)).toEqual([]);
  });

  test("lists are per root: another worktree's conversations on a canvas with the same ID never join", () => {
    const lists = new Map([["/w/a", [summary("a1"), summary("a2")]], ["/w/b", [summary("b1")]]]);
    expect(viewedCanvasConversations(lists.get("/w/b")!, "/w/b", A.path, ROWS, none, NOW)).toEqual([]);
    expect(ids(viewedCanvasConversations(lists.get("/w/a")!, "/w/a", A.path, ROWS, none, NOW)).sort()).toEqual(["a1", "a2"]);
  });

  test("project conversations and Home conversations on the canvas both count; ones bound to no canvas never do", () => {
    const { canvas: _bound, ...project } = summary("project", { fromHome: true });
    const list = [summary("panel"), summary("home", { fromHome: true }), project];
    expect(ids(viewedCanvasConversations(list, ROOT, A.path, ROWS, none, NOW)).sort()).toEqual(["home", "panel"]);
  });

  test("a frozen order keeps its places and a new conversation goes last", () => {
    const list = [summary("x", { lastActivityAt: at(30) }), summary("y", { lastActivityAt: at(1) }), summary("new", { lastActivityAt: at(0) })];
    expect(ids(viewedCanvasConversations(list, ROOT, A.path, ROWS, none, NOW, ["x", "y"]))).toEqual(["x", "y", "new"]);
    // A frozen id that left the list is dropped.
    expect(ids(viewedCanvasConversations(list.slice(1), ROOT, A.path, ROWS, none, NOW, ["x", "y"]))).toEqual(["y", "new"]);
  });

  test("each row carries its own sidebar signal, the usage limit's clock by `now`", () => {
    const list = [
      summary("p", { phase: "waiting", provider: "codex" }), summary("w", { phase: "running" }), summary("u", { unseen: true }),
      summary("s", { scheduledAt: at(-30), queued: 1 }), summary("seen", { unseen: true }), summary("quiet"),
    ];
    const rows = viewedCanvasConversations(list, ROOT, A.path, ROWS, new Set(["seen"]), NOW);
    const slot = (id: string) => rows.find(row => row.conversationId === id)!.slot;
    expect(slot("p")).toEqual({ kind: "permission", label: "Codex needs your answer" });
    expect(slot("w")).toEqual({ kind: "working", label: "Claude Code is working" });
    expect(slot("u")).toEqual({ kind: "unseen", label: "Conversation finished — unread" });
    expect(slot("s")?.kind).toBe("scheduled");
    expect(slot("seen")).toBeNull();
    expect(slot("quiet")).toBeNull();
  });

  test("an empty title reads as Conversation; the raw title stays for Delete", () => {
    const rows = viewedCanvasConversations([summary("e", { title: "", fromHome: true }), summary("t", { title: "  Two\nlines  " })], ROOT, A.path, ROWS, none, NOW);
    const row = (id: string) => rows.find(item => item.conversationId === id)!;
    expect(row("e")).toMatchObject({ heading: "Conversation", title: "" });
    expect(row("t")).toMatchObject({ heading: "Two lines", title: "  Two\nlines  " });
  });

  test("Delete is unavailable while the conversation works or waits for an answer, with the title menu's reason", () => {
    const rows = viewedCanvasConversations([summary("w", { working: true }), summary("q", { phase: "waiting" }), summary("e")], ROOT, A.path, ROWS, none, NOW);
    const row = (id: string) => rows.find(item => item.conversationId === id)!;
    expect(row("w").deletable).toEqual({ available: false, reason: "The agent is working on this conversation." });
    expect(row("q").deletable).toEqual({ available: false, reason: "The agent is waiting for your answer." });
    expect(row("e").deletable).toEqual({ available: true });
  });
});

describe("canvasRowMark", () => {
  const key = slotKey(ROOT, A.path);
  const full = new Map<string, SidebarSlot>([[key, { kind: "permission", label: "Claude Code needs your answer" }]]);

  test("while the list shows, the conversation signal leaves the canvas row; a terminal spinner or a canvas notice stays", () => {
    expect(canvasRowMark(full, new Map(), key, true)).toBeUndefined();
    const terminal: SidebarSlot = { kind: "working", label: "Codex is working in a terminal", source: "terminal" };
    expect(canvasRowMark(full, new Map([[key, terminal]]), key, true)).toEqual(terminal);
    const notice: SidebarSlot = { kind: "canvas", label: "a changed since you last opened it" };
    expect(canvasRowMark(full, new Map([[key, notice]]), key, true)).toEqual(notice);
  });

  test("folded, with fewer than two, off screen or while the list reads, the row keeps the full set's value", () => {
    expect(canvasRowMark(full, new Map(), key, false)).toEqual(full.get(key));
    const scheduled: SidebarSlot = { kind: "scheduled", label: "Waiting for the usage limit" };
    expect(canvasRowMark(new Map([[key, scheduled]]), new Map(), key, false)).toEqual(scheduled);
  });
});

test("canvasDisclosure: a chevron only on the viewed canvas with two or more conversations", () => {
  expect(canvasDisclosure(true, 2)).toBe(true);
  expect(canvasDisclosure(true, 12)).toBe(true);
  expect(canvasDisclosure(true, 1)).toBe(false);
  expect(canvasDisclosure(true, 0)).toBe(false);
  expect(canvasDisclosure(false, 3)).toBe(false);
});

describe("arrows", () => {
  test("canvas row →: unfolds a folded list, else moves to its first conversation; without a list it does nothing", () => {
    expect(canvasArrow(true, true, "ArrowRight")).toBe("unfold");
    expect(canvasArrow(true, false, "ArrowRight")).toBe("firstConversation");
    expect(canvasArrow(false, false, "ArrowRight")).toBeNull();
  });

  test("canvas row ←: folds an unfolded list, else moves to the group head", () => {
    expect(canvasArrow(true, false, "ArrowLeft")).toBe("fold");
    expect(canvasArrow(true, true, "ArrowLeft")).toBe("head");
    expect(canvasArrow(false, false, "ArrowLeft")).toBe("head");
  });

  test("conversation row ←: the canvas row; →: nothing", () => {
    expect(conversationArrow("ArrowLeft")).toBe("canvas");
    expect(conversationArrow("ArrowRight")).toBeNull();
  });
});

test("a conversation row's tree key sits under its canvas row's key and never equals a canvas or group head key", () => {
  const key = conversationRowKey(ROOT, A.path, "c1");
  expect(key.startsWith(`${slotKey(ROOT, A.path)}\n`)).toBe(true);
  expect(key).not.toBe(slotKey(ROOT, A.path));
  expect(conversationRowKey(ROOT, A.path, "c2")).not.toBe(key);
});

describe("deleteFocus", () => {
  const canvas = slotKey(ROOT, A.path);
  const keys = ["c1", "c2", "c3"].map(id => conversationRowKey(ROOT, A.path, id));

  test("after a confirmed Delete focus goes to the next conversation row, else the previous one, else the canvas row", () => {
    expect(deleteFocus(keys, keys[1]!, canvas)).toBe(keys[2]);
    expect(deleteFocus(keys, keys[2]!, canvas)).toBe(keys[1]);
    expect(deleteFocus(keys.slice(0, 1), keys[0]!, canvas)).toBe(canvas);
  });
});

// POSTMORTEM 2026-11-06: a line moving under the pointer turns a second press into a different pick, so the list
// holds only when it was unfolded and the pointer pressed a canvas row below it.
describe("listPlace", () => {
  const order = ["/w/a", `${ROOT}\n${A.path}`, `${ROOT}\n${B.path}`, `${ROOT}\n${PLAIN.path}`];
  const a = order[1]!, b = order[2]!, plain = order[3]!;

  test("with no press in the sidebar the list follows the viewed canvas", () => {
    expect(listPlace(a, b, order, null)).toBe(b);
    expect(listPlace(null, a, order, null)).toBe(a);
    expect(listPlace(a, null, order, null)).toBeNull();
  });

  test("after a press on a canvas row below a shown list, the list stays where it was", () => {
    expect(listPlace(a, b, order, b)).toBe(a);
    expect(listPlace(a, plain, order, plain)).toBe(a);
  });

  test("with no list shown (folded, or fewer than two conversations) a press below follows at once", () => {
    expect(listPlace(null, b, order, b)).toBe(b);
  });

  test("a viewed canvas the pointer did not press (keyboard, Back, a pointer only resting) follows at once", () => {
    expect(listPlace(a, b, order, null)).toBe(b);
    expect(listPlace(a, b, order, plain)).toBe(b);
  });

  test("a row above, or leaving the canvas page, moves nothing under the pointer, so the list follows at once", () => {
    expect(listPlace(b, a, order, a)).toBe(a);
    expect(listPlace(b, null, order, null)).toBeNull();
  });

  test("a held place whose row left the tree gives way", () => {
    expect(listPlace(a, b, order.filter(key => key !== a), b)).toBe(b);
  });
});
