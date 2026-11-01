import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import { agentPresence } from "./agentPresence";

const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", state: "current", owner: "doan", provider: "claude", fromHome: true,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "Done",
  canvas: { path: ".doan/canvases/billing.html", id: "billing" }, ...patch,
});

// A project conversation has no canvas key at all (exactOptionalPropertyTypes).
const project = (patch: Partial<ConversationSummary>): ConversationSummary => {
  const { canvas: _canvas, ...rest } = summary(patch);
  return rest;
};

const open = { path: ".doan/canvases/billing.html", id: "billing" };

describe("agentPresence", () => {
  test("no current conversation on the canvas shows nothing", () => {
    expect(agentPresence([], open, null)).toBeNull();
    expect(agentPresence([project({ phase: "running" })], open, null)).toBeNull();
  });

  test("a running conversation shows '<Provider> is working'", () => {
    expect(agentPresence([summary({ phase: "running" })], open, null)).toEqual({
      conversationId: "c1", kind: "working", label: "Claude Code is working", canvas: open,
    });
  });

  test("a waiting conversation shows '<Provider> needs your answer'", () => {
    expect(agentPresence([summary({ phase: "waiting" })], open, null)).toMatchObject({ kind: "waiting", label: "Claude Code needs your answer" });
  });

  test("the wording uses the conversation's provider display name", () => {
    expect(agentPresence([summary({ phase: "running", provider: "codex" })], open, null)?.label).toBe("Codex is working");
    expect(agentPresence([summary({ phase: "waiting", provider: "copilot" })], open, null)?.label).toBe("GitHub Copilot needs your answer");
  });

  test("an ended turn shows nothing, even with unseen changes", () => {
    expect(agentPresence([summary({ phase: "ended" })], open, null)).toBeNull();
    expect(agentPresence([summary({ phase: "ended", unseen: true })], open, null)).toBeNull();
  });

  test("a conversation about another canvas shows nothing", () => {
    expect(agentPresence([summary({ phase: "running", canvas: { path: ".doan/canvases/other.html", id: "other" } })], open, null)).toBeNull();
  });

  test("a project conversation (no canvas) shows nothing, whatever it is doing", () => {
    expect(agentPresence([project({ phase: "running" }), project({ conversationId: "c2", phase: "waiting" })], open, null)).toBeNull();
  });

  test("an archived conversation on the canvas shows nothing", () => {
    expect(agentPresence([summary({ phase: "running", state: "archived" })], open, null)).toBeNull();
  });

  test("a canvas without an id matches by path", () => {
    const bare = { path: ".doan/canvases/plain.html" };
    const list = [summary({ phase: "running", canvas: bare })];
    expect(agentPresence(list, bare, null)?.kind).toBe("working");
    expect(agentPresence(list, { path: ".doan/canvases/elsewhere.html" }, null)).toBeNull();
  });

  test("a path match does not cross an id: a different id at the same path is another canvas", () => {
    const list = [summary({ phase: "running", canvas: { path: open.path, id: "old" } })];
    expect(agentPresence(list, open, null)).toBeNull();
    expect(agentPresence([summary({ phase: "running", canvas: { path: open.path } })], open, null)).toBeNull();
  });

  test("a moved canvas keeps its conversation: the id matches although the path differs", () => {
    const moved = { path: ".doan/canvases/archive/billing.html", id: "billing" };
    expect(agentPresence([summary({ phase: "running" })], moved, null)?.kind).toBe("working");
  });

  test("a moved canvas without an id loses it: only the path matched", () => {
    const list = [summary({ phase: "running", canvas: { path: ".doan/canvases/plain.html" } })];
    expect(agentPresence(list, { path: ".doan/canvases/moved/plain.html" }, null)).toBeNull();
  });

  test("an unlisted page or a project problem has no canvas, so nothing shows", () => {
    expect(agentPresence([summary({ phase: "running" })], null, null)).toBeNull();
    const held = agentPresence([summary({ phase: "running" })], open, null);
    expect(agentPresence([summary({ phase: "running" })], null, held)).toBeNull();
    expect(agentPresence(null, null, held)).toBeNull();
  });

  test("a failed list read keeps the previous presence", () => {
    const held = agentPresence([summary({ phase: "running" })], open, null);
    expect(held).not.toBeNull();
    expect(agentPresence(null, open, held)).toBe(held);
  });

  test("a failed list read before any read has succeeded shows nothing", () => {
    expect(agentPresence(null, open, null)).toBeNull();
  });

  test("a failed list read after a read that showed nothing still shows nothing", () => {
    const none = agentPresence([summary({ phase: "ended" })], open, null);
    expect(none).toBeNull();
    expect(agentPresence(null, open, none)).toBeNull();
  });

  test("the next successful read replaces what a failed read kept", () => {
    const held = agentPresence([summary({ phase: "running" })], open, null);
    expect(agentPresence([summary({ phase: "ended" })], open, held)).toBeNull();
    expect(agentPresence([summary({ phase: "waiting" })], open, held)?.kind).toBe("waiting");
  });

  test("an empty list is a successful read: it clears the previous presence", () => {
    const held = agentPresence([summary({ phase: "running" })], open, null);
    expect(agentPresence([], open, held)).toBeNull();
  });

  test("a kept presence follows a moved canvas but never crosses to another canvas", () => {
    const held = agentPresence([summary({ phase: "running" })], open, null);
    const moved = { path: ".doan/canvases/archive/billing.html", id: "billing" };
    expect(agentPresence(null, moved, held)).toBe(held);
    expect(agentPresence(null, { path: ".doan/canvases/other.html", id: "other" }, held)).toBeNull();
  });

  test("a conversation that stays on the canvas but has no work is skipped for one that works", () => {
    const list = [summary({ conversationId: "idle", phase: "ended" }), summary({ conversationId: "busy", phase: "running" })];
    expect(agentPresence(list, open, null)?.conversationId).toBe("busy");
  });

  test("a conversation whose history could not be read shows nothing", () => {
    expect(agentPresence([summary({ phase: "ended", readError: true })], open, null)).toBeNull();
  });
});
