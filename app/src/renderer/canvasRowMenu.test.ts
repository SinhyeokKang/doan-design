import { describe, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { WorkItem } from "../main/workState";
import { trashBlock } from "./canvasRowMenu";

const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", state: "current", owner: "doan", provider: "claude", fromHome: false,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "Done",
  canvas: { path: ".doan/canvases/billing.html", id: "billing" }, ...patch,
});
const target = { root: "/repo", path: ".doan/canvases/billing.html", id: "billing" };
const none = () => null;
const work = (root: string, path = target.path): WorkItem => ({ root, path, session: "s1", provider: "claude" });

describe("trashBlock", () => {
  test("nothing working on the canvas leaves Move to Trash enabled", () => {
    expect(trashBlock(target, [summary({})], [], none)).toBeNull();
    expect(trashBlock(target, null, [], none)).toBeNull();
  });

  test("an app conversation working or waiting for an answer on the canvas blocks it", () => {
    expect(trashBlock(target, [summary({ phase: "running" })], [], none)).toBe("conversation");
    expect(trashBlock(target, [summary({ phase: "waiting" })], [], none)).toBe("conversation");
  });

  test("a conversation main still counts as working (preparing, a queue about to go out) blocks it, as main does", () => {
    expect(trashBlock(target, [summary({ working: true })], [], none)).toBe("conversation");
    expect(trashBlock(target, [summary({ working: true, readError: true })], [], none)).toBe("conversation");
    expect(trashBlock(target, [summary({ working: true, state: "archived" })], [], none)).toBeNull();
    expect(trashBlock(target, [summary({ working: true, canvas: { path: target.path, id: "other" } })], [], none)).toBeNull();
  });

  test("an unseen ending or an archived conversation does not block it", () => {
    expect(trashBlock(target, [summary({ unseen: true })], [], none)).toBeNull();
    expect(trashBlock(target, [summary({ phase: "running", state: "archived" })], [], none)).toBeNull();
  });

  test("conversations match by id when either side has one, else by path", () => {
    expect(trashBlock(target, [summary({ phase: "running", canvas: { path: ".doan/canvases/moved.html", id: "billing" } })], [], none)).toBe("conversation");
    expect(trashBlock(target, [summary({ phase: "running", canvas: { path: target.path, id: "other" } })], [], none)).toBeNull();
    const plain = { root: "/repo", path: ".doan/canvases/plain.html" };
    expect(trashBlock(plain, [summary({ phase: "running", canvas: { path: plain.path } })], [], none)).toBe("conversation");
    // An empty id is no id.
    expect(trashBlock({ ...plain, id: "" }, [summary({ phase: "running", canvas: { path: plain.path } })], [], none)).toBe("conversation");
  });

  test("a project conversation still drawing the canvas blocks it, asked with the row's root and canvas", () => {
    const drawing = vi.fn(() => "p1");
    expect(trashBlock(target, [], [], drawing)).toBe("drawing");
    expect(drawing).toHaveBeenCalledWith("/repo", { path: target.path, id: "billing" });
  });

  test("a terminal session's work on the same root and path blocks it", () => {
    expect(trashBlock(target, [], [work("/repo")], none)).toBe("terminal");
    expect(trashBlock(target, [], [work("/repo", ".doan/canvases/other.html")], none)).toBeNull();
  });

  test("another worktree working on the same path does not block this row", () => {
    // POSTMORTEM 2026-11-01: worktrees share canvas ids and paths, so the root must match too. The conversation list is
    // per root, so another worktree's conversation never reaches it; the work list and drawing carry their root.
    expect(trashBlock(target, [], [work("/repo-wt")], none)).toBeNull();
    const drawing = (root: string) => root === "/repo-wt" ? "p1" : null;
    expect(trashBlock(target, [], [], drawing)).toBeNull();
  });
});
