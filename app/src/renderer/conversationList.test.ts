import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import { slotsFromList, stripFromList } from "./conversationList";
import { slotKey } from "./homeConversations";

const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", state: "current", owner: "doan", provider: "claude", fromHome: true,
  phase: "ended", unseen: false, queued: 0, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "", ...patch,
});
const rows = new Map([["/r/doan", [{ path: ".doan/canvases/a.html", id: "a" }, { path: ".doan/canvases/plain.html" }]]]);
const canvases = (root: string) => rows.get(root) ?? [];
const none = new Set<string>();

describe("slotsFromList", () => {
  test("running, waiting for an answer and unseen endings show; seen endings and read errors do not", () => {
    const lists = new Map([
      ["/r/doan", [summary({ conversationId: "w", phase: "running" })]],
      ["/r/b", [summary({ conversationId: "p", phase: "waiting", provider: "codex" })]],
      ["/r/c", [summary({ conversationId: "u", unseen: true }), summary({ conversationId: "s" })]],
      ["/r/d", [summary({ conversationId: "e", phase: "running", readError: true })]],
    ]);
    expect(slotsFromList(lists, none, canvases)).toEqual(new Map([
      ["/r/doan", { kind: "working", label: "Claude Code is working" }],
      ["/r/b", { kind: "permission", label: "Codex needs your answer" }],
      ["/r/c", { kind: "unseen", label: "New changes from Claude Code" }],
    ]));
  });

  test("the strongest state wins on a row", () => {
    const lists = new Map([["/r/doan", [summary({ conversationId: "u", unseen: true }), summary({ conversationId: "p", phase: "waiting" }), summary({ conversationId: "w", phase: "running" })]]]);
    expect(slotsFromList(lists, none, canvases).get("/r/doan")?.kind).toBe("permission");
  });

  test("a conversation marked seen whose list refresh has not arrived shows nothing", () => {
    const lists = new Map([["/r/doan", [summary({ conversationId: "u", unseen: true })]]]);
    expect(slotsFromList(lists, new Set(["u"]), canvases).size).toBe(0);
  });

  test("a bound canvas shows on its row, found by ID; a canvas no longer listed falls back to the project row", () => {
    const lists = new Map([["/r/doan", [
      summary({ conversationId: "moved", phase: "running", canvas: { path: ".doan/canvases/old-name.html", id: "a" } }),
      summary({ conversationId: "plain", unseen: true, canvas: { path: ".doan/canvases/plain.html" } }),
      summary({ conversationId: "gone", phase: "waiting", canvas: { path: ".doan/canvases/gone.html", id: "gone" } }),
    ]]]);
    expect(slotsFromList(lists, none, canvases)).toEqual(new Map([
      [slotKey("/r/doan", ".doan/canvases/a.html"), { kind: "working", label: "Claude Code is working" }],
      [slotKey("/r/doan", ".doan/canvases/plain.html"), { kind: "unseen", label: "New changes from Claude Code" }],
      ["/r/doan", { kind: "permission", label: "Claude Code needs your answer" }],
    ]));
  });

  test("only Home conversations count, as before the list existed", () => {
    const lists = new Map([["/r/doan", [summary({ phase: "running", fromHome: false })]]]);
    expect(slotsFromList(lists, none, canvases).size).toBe(0);
  });
});

describe("stripFromList", () => {
  test("the strongest state first, then the latest activity; nothing when no work is left", () => {
    const older = summary({ conversationId: "old", unseen: true, lastActivityAt: "2026-11-01T00:00:00.000Z" });
    const newer = summary({ conversationId: "new", unseen: true, lastActivityAt: "2026-11-01T00:05:00.000Z" });
    const running = summary({ conversationId: "run", phase: "running", lastActivityAt: "2026-10-31T00:00:00.000Z" });
    expect(stripFromList([older, newer], none)?.conversationId).toBe("new");
    expect(stripFromList([older, running, newer], none)?.conversationId).toBe("run");
    expect(stripFromList([summary({}), summary({ phase: "running", fromHome: false })], none)).toBeNull();
    expect(stripFromList([newer], new Set(["new"]))).toBeNull();
  });
});
