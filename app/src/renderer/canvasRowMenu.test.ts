import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { WorkItem } from "../main/workState";
import { trashBusy } from "../main/canvasTrash";
import { canvasExportReason, trashBlock } from "./canvasRowMenu";

const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", owner: "doan", provider: "claude", fromHome: false,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "Done",
  canvas: { path: ".doan/canvases/billing.html", id: "billing" }, ...patch,
});
const target = { root: "/repo", path: ".doan/canvases/billing.html", id: "billing" };
const work = (root: string, path = target.path): WorkItem => ({ touched: 0, turn: "none:t", root, path, session: "s1", provider: "claude" });

describe("trashBlock", () => {
  test("nothing working on the canvas leaves Move to Trash enabled", () => {
    expect(trashBlock(target, [summary({})], [])).toBeNull();
    expect(trashBlock(target, null, [])).toBeNull();
  });

  test("an app conversation working or waiting for an answer on the canvas blocks it", () => {
    expect(trashBlock(target, [summary({ phase: "running" })], [])).toBe("conversation");
    expect(trashBlock(target, [summary({ phase: "waiting" })], [])).toBe("conversation");
  });

  test("a conversation main still counts as working (preparing, a queue about to go out) blocks it, as main does", () => {
    expect(trashBlock(target, [summary({ working: true })], [])).toBe("conversation");
    expect(trashBlock(target, [summary({ working: true, readError: true })], [])).toBe("conversation");
    expect(trashBlock(target, [summary({ working: true, canvas: { path: target.path, id: "other" } })], [])).toBeNull();
  });

  // The first conversation of a canvas is in main's list only once main accepted it, but it is already preparing.
  test("a start from the canvas panel main has not answered blocks it, before any list names the conversation", () => {
    const starting = (root: string, canvas: { path: string; id?: string }) => root === target.root && canvas.id === target.id;
    expect(trashBlock(target, [], [], starting)).toBe("conversation");
    expect(trashBlock(target, null, [], starting)).toBe("conversation");
    expect(trashBlock({ ...target, root: "/other" }, [], [], starting)).toBeNull();
    expect(trashBlock({ root: "/repo", path: ".doan/canvases/cart.html", id: "cart" }, [], [], starting)).toBeNull();
  });

  test("an unseen ending does not block it", () => {
    expect(trashBlock(target, [summary({ unseen: true })], [])).toBeNull();
  });

  test("any one of the canvas's conversations working, preparing or waiting blocks it, not only the first", () => {
    const idle = summary({ conversationId: "idle" });
    expect(trashBlock(target, [idle, summary({ conversationId: "r", phase: "running" })], [])).toBe("conversation");
    expect(trashBlock(target, [idle, summary({ conversationId: "p", working: true })], [])).toBe("conversation");
    expect(trashBlock(target, [idle, summary({ conversationId: "w", phase: "waiting" })], [])).toBe("conversation");
  });

  test("counts the same conversations as main's trashBusy, so an enabled item is never refused as busy", () => {
    const cases: Partial<ConversationSummary>[] = [
      {}, { phase: "running" }, { phase: "waiting" }, { working: true }, { unseen: true }, { working: true, readError: true }, { readError: true },
      { queued: 2, scheduledAt: "2026-11-01T13:00:00.000Z" }, { phase: "running", canvas: { path: target.path, id: "other" } },
      { phase: "running", canvas: { path: ".doan/canvases/moved.html", id: "billing" } },
    ];
    for (const patch of cases) {
      const list = [summary({ conversationId: "idle" }), summary({ conversationId: "x", ...patch })];
      expect(trashBlock(target, list, []) === "conversation", JSON.stringify(patch)).toBe(trashBusy(target, list, [], []));
    }
  });

  test("conversations match by id when either side has one, else by path", () => {
    expect(trashBlock(target, [summary({ phase: "running", canvas: { path: ".doan/canvases/moved.html", id: "billing" } })], [])).toBe("conversation");
    expect(trashBlock(target, [summary({ phase: "running", canvas: { path: target.path, id: "other" } })], [])).toBeNull();
    const plain = { root: "/repo", path: ".doan/canvases/plain.html" };
    expect(trashBlock(plain, [summary({ phase: "running", canvas: { path: plain.path } })], [])).toBe("conversation");
    // An empty id is no id.
    expect(trashBlock({ ...plain, id: "" }, [summary({ phase: "running", canvas: { path: plain.path } })], [])).toBe("conversation");
  });

  // A project conversation's new canvas is a handoff target like a canvas conversation's: nothing holds it.
  test("a canvas a project conversation is drawing is not blocked for that", () => {
    const { canvas: _canvas, ...project } = summary({ conversationId: "p", phase: "running", working: true });
    expect(trashBlock(target, [project], [])).toBeNull();
  });

  test("a terminal session's work on the same root and path blocks it", () => {
    expect(trashBlock(target, [], [work("/repo")])).toBe("terminal");
    expect(trashBlock(target, [], [work("/repo", ".doan/canvases/other.html")])).toBeNull();
  });

  test("another worktree working on the same path does not block this row", () => {
    // POSTMORTEM 2026-11-01: worktrees share canvas ids and paths, so the root must match too. The conversation list is
    // per root, so another worktree's conversation never reaches it; the work list carries its root.
    expect(trashBlock(target, [], [work("/repo-wt")])).toBeNull();
  });
});

// The row menu's Export… and the toolbar's Export share their reasons.
describe("canvasExportReason", () => {
  const row = { path: ".doan/canvases/a.html", url: "u-a" };
  test("a readable, listed canvas that is not exporting can export, also while another canvas exports", () => {
    expect(canvasExportReason(row, false, false)).toBeNull();
  });
  test("a row read error, this canvas exporting, an unlisted page and no open canvas each say why", () => {
    expect(canvasExportReason({ ...row, error: { code: "unreadable", message: "x" } }, false, false)).toBe("Can’t read this canvas.");
    expect(canvasExportReason(row, true, false)).toBe("Exporting");
    expect(canvasExportReason(row, false, true)).toBe("This page is not a listed canvas.");
    expect(canvasExportReason(null, false, false)).toBe("Export isn’t available while the canvas can’t be shown.");
  });
  test("an unlisted page wins over the listed canvas's own state", () => {
    expect(canvasExportReason({ ...row, error: { code: "unreadable", message: "x" } }, true, true)).toBe("This page is not a listed canvas.");
  });
});
