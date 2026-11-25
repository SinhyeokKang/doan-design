import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import { boardPresence, type BoardInput } from "./agentPresence";

const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", owner: "doan", provider: "claude", fromHome: true,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "Done",
  canvas: { path: ".doan/canvases/billing.html", id: "billing" }, ...patch,
});

const project = (patch: Partial<ConversationSummary>): ConversationSummary => {
  const { canvas: _canvas, ...rest } = summary(patch);
  return rest;
};

const open = { path: ".doan/canvases/billing.html", id: "billing" };

describe("boardPresence", () => {
  const ROOT = "/code/acme";
  const board = (patch: Partial<BoardInput>) => boardPresence({ list: [], root: ROOT, canvas: open, shown: null, previous: null, ...patch });
  const a = summary({ conversationId: "a" }), b = summary({ conversationId: "b" }), c = summary({ conversationId: "c" });

  test("the shown conversation while it works or waits", () => {
    expect(board({ list: [{ ...a, phase: "running" }, { ...b, phase: "waiting" }], shown: "a" })).toEqual({
      root: ROOT, conversationId: "a", kind: "working", label: "Claude Code is working", canvas: open,
    });
    expect(board({ list: [{ ...a, phase: "running" }, { ...b, phase: "waiting" }], shown: "b" })).toMatchObject({ conversationId: "b", kind: "waiting", label: "Claude Code needs your answer" });
  });

  test("an idle shown conversation or the new conversation state: another waiting one, else another working one", () => {
    const list = [a, { ...b, phase: "running" as const }, { ...c, phase: "waiting" as const }];
    expect(board({ list, shown: "a" })?.conversationId).toBe("c");
    expect(board({ list, shown: null })?.conversationId).toBe("c");
    expect(board({ list: [a, { ...b, phase: "running" }], shown: "a" })?.conversationId).toBe("b");
    expect(board({ list: [a, b], shown: "a" })).toBeNull();
  });

  test("of the same rank, the conversation started first (main lists them in start order)", () => {
    const list = [a, { ...b, phase: "running" as const, lastActivityAt: "2026-11-01T12:05:00.000Z" }, { ...c, phase: "running" as const }];
    expect(board({ list, shown: "a" })?.conversationId).toBe("b");
  });

  test("keeps following a conversation while it holds its rank, also when one started earlier works", () => {
    const first = board({ list: [a, { ...c, phase: "running" }], shown: "a" });
    expect(first?.conversationId).toBe("c");
    expect(board({ list: [a, { ...b, phase: "running" }, { ...c, phase: "running" }], shown: "a", previous: first })?.conversationId).toBe("c");
  });

  test("a waiting conversation outranks the one followed while it works", () => {
    const first = board({ list: [a, { ...c, phase: "running" }], shown: "a" });
    expect(board({ list: [a, { ...b, phase: "waiting" }, { ...c, phase: "running" }], shown: "a", previous: first })?.conversationId).toBe("b");
  });

  test("a followed conversation whose rank changes is picked again: answered, it no longer outranks one started earlier", () => {
    const first = board({ list: [a, { ...b, phase: "running" }, { ...c, phase: "waiting" }], shown: "a" });
    expect(first?.conversationId).toBe("c");
    expect(board({ list: [a, { ...b, phase: "running" }, { ...c, phase: "running" }], shown: "a", previous: first })).toMatchObject({ conversationId: "b", kind: "working" });
  });

  test("main's working flag between a turn's end and the queue's next turn keeps the notice from blinking", () => {
    const first = board({ list: [a, { ...b, phase: "running" }], shown: "a" });
    expect(board({ list: [a, { ...b, phase: "ended", working: true }], shown: "a", previous: first })).toMatchObject({ conversationId: "b", kind: "working" });
    expect(board({ list: [{ ...a, phase: "ended", working: true }], shown: "a" })).toMatchObject({ conversationId: "a", kind: "working" });
  });

  test("no conversation working or waiting shows nothing; an unseen ending is not work", () => {
    expect(board({ list: [] })).toBeNull();
    expect(board({ list: [{ ...a, unseen: true }, project({ conversationId: "p", phase: "running" })] })).toBeNull();
    expect(board({ list: [{ ...a, phase: "running", canvas: { path: ".doan/canvases/other.html", id: "other" } }] })).toBeNull();
  });

  test("a failed read keeps the previous presence of the same root and canvas only", () => {
    const held = board({ list: [{ ...a, phase: "running" }] });
    expect(board({ list: null, previous: held })).toBe(held);
    expect(board({ list: null, previous: held, root: "/code/acme-wt" })).toBeNull();
    expect(board({ list: null, previous: held, canvas: { path: ".doan/canvases/other.html", id: "other" } })).toBeNull();
    expect(board({ list: null, previous: null })).toBeNull();
    expect(board({ list: [{ ...a, phase: "running" }], canvas: null })).toBeNull();
  });

  test("a previous presence of another root is not kept as followed", () => {
    const elsewhere = boardPresence({ list: [{ ...c, phase: "running" }], root: "/code/acme-wt", canvas: open, shown: null, previous: null });
    expect(board({ list: [{ ...b, phase: "running" }, { ...c, phase: "running" }], previous: elsewhere })?.conversationId).toBe("b");
  });

  test("a conversation whose history could not be read is not followed", () => {
    expect(board({ list: [{ ...a, readError: true, working: true }] })).toBeNull();
  });
});
