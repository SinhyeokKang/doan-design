import { describe, expect, it } from "vitest";
import { foldConversation, mergeEvents, turnState, bindFirstCanvas, archiveForStart } from "./state";
import { reserveSession, promoteReservation, releaseReservation } from "./ownership";
import type { ConversationEvent, EventPayload, ConversationBinding, Reservation, SessionKey } from "./types";
const event = (seq: number, payload: EventPayload, turnId = "turn-1", conversationId = "a"): ConversationEvent => ({ v: 1, seq, conversationId, turnId, at: "2026-10-27T00:00:00.000Z", ...payload });
const permission: EventPayload = { type: "permission.request", requestId: "r", tool: "Write", summary: "Write file", options: [{ id: "allow", label: "Allow", kind: "allow" }, { id: "deny", label: "Deny", kind: "deny" }] };
describe("conversation recovery and event merge", () => {
  it("folds unfinished turns as crashed and pending permissions as expired on restart", () => {
    const events = [event(1, { type: "turn.started" }), event(2, permission), event(3, { type: "message.delta", messageId: "m", text: "partial" })];
    const state = foldConversation(events, "a", true);
    expect(state.turn).toBe("interrupted");
    expect(state.interruption).toBe("crashed");
    expect(state.permissions.r).toBe("expired");
    expect(state.messages).toEqual([{ id: "m", text: "partial", done: false }]);
    expect(foldConversation(events, "a", false).turn).toBe("waitingPermission");
  });
  it("uses done text as replacement, expires outstanding requests and ignores duplicate terminal events", () => {
    const state = foldConversation([event(1, { type: "turn.started" }), event(2, { type: "message.delta", messageId: "m", text: "Hello" }), event(3, { type: "message.done", messageId: "m", text: "Hello!" }), event(4, permission), event(5, { type: "turn.done" }), event(6, { type: "turn.failed", code: "unknown" })], "a", true);
    expect(state.turn).toBe("idle");
    expect(state.messages).toEqual([{ id: "m", text: "Hello!", done: true }]);
    expect(state.permissions.r).toBe("expired");
  });
  it("keeps archives and resolved decisions across restart", () => {
    const state = foldConversation([event(1, { type: "turn.started" }), event(2, permission), event(3, { type: "permission.resolved", requestId: "r", optionId: "deny" }), event(4, { type: "turn.done" }), event(5, { type: "conversation.archived" })], "a", true);
    expect(state.archived).toBe(true);
    expect(state.permissions.r).toBe("deny");
  });
  it("merges the final buffered event without requiring another event, partitions identities and deduplicates", () => {
    const start = event(1, { type: "turn.started" });
    const done = event(2, { type: "turn.done" });
    const snapshot = [start];
    const buffer = [event(2, { type: "turn.failed", code: "unknown" }, "turn-1", "b"), done, start];
    const merged = mergeEvents(snapshot, buffer, "a");
    expect(merged).toEqual([start, done]);
    expect(foldConversation(merged, "a", false).turn).toBe("idle");
    expect(mergeEvents(merged, [event(3, { type: "conversation.archived" })], "a")).toHaveLength(3);
  });
  it("fences delayed events from an older turn", () => {
    const state = foldConversation([event(1, { type: "turn.started" }), event(2, { type: "turn.done" }), event(3, { type: "turn.started" }, "turn-2"), event(4, { type: "turn.failed", code: "unknown" })], "a", false);
    expect(state.turn).toBe("starting");
  });
  it("binds only the first same-root canvas and archives the previous identity only after acceptance", () => {
    const binding: ConversationBinding = { conversationId: "a", root: "/repo", origin: "newDesign", state: "current" };
    const canvas = { id: "home", path: "design/a.html" };
    expect(bindFirstCanvas(binding, "/other", canvas)).toEqual(binding);
    const bound = bindFirstCanvas(binding, "/repo", canvas);
    expect(bound.canvas).toEqual(canvas);
    expect(bindFirstCanvas(bound, "/repo", { id: "other", path: "design/b.html" })).toEqual(bound);
    expect(archiveForStart([bound], { ...bound, conversationId: "b", canvas: { ...canvas, path: "design/moved.html" } }, false)).toEqual([bound]);
    expect(archiveForStart([bound], { ...bound, conversationId: "b" }, true)[0]?.state).toBe("archived");
  });
});
describe("turn state", () => {
  it.each(["starting", "streaming", "waitingPermission"] as const)("rejects send while %s", state => {
    expect(turnState(state, "send")).toEqual({ state, error: "busy" });
  });
  it("supports permission wait, failure, stop and a later turn", () => {
    expect(turnState("idle", "send")).toEqual({ state: "starting" });
    expect(turnState("starting", "output")).toEqual({ state: "streaming" });
    expect(turnState("streaming", "permission")).toEqual({ state: "waitingPermission" });
    expect(turnState("waitingPermission", "resolved")).toEqual({ state: "streaming" });
    expect(turnState("waitingPermission", "interrupt")).toEqual({ state: "interrupted" });
    expect(turnState("waitingPermission", "exit")).toEqual({ state: "failed" });
    expect(turnState("failed", "send")).toEqual({ state: "starting" });
  });
});
describe("app-owned reservations", () => {
  const key: SessionKey = { runtime: "codex", configDir: "/profile", sessionId: "s1" };
  const owned: Reservation = { owner: "a", key };
  it("blocks same session across canvases even before launch and while Codex is idle", () => {
    expect(reserveSession([owned], "b", key)).toEqual({ ok: false, code: "session_in_use" });
    expect(reserveSession([owned], "a", key, true)).toEqual({ ok: true, reservations: [owned] });
    expect(reserveSession([owned], "b", { ...key, sessionId: "s2" }).ok).toBe(true);
    expect(reserveSession([owned], "b", { ...key, configDir: "/another" }).ok).toBe(true);
  });
  it("keeps temporary requests independent and promotes only without collision", () => {
    const a: Reservation = { owner: "a", key: null };
    const b: Reservation = { owner: "b", key: null };
    expect(reserveSession([a], "b", null)).toEqual({ ok: true, reservations: [a, b] });
    expect(reserveSession([a], "a", null)).toEqual({ ok: false, code: "busy" });
    expect(promoteReservation([a, b], "a", key)).toEqual({ ok: true, reservations: [owned, b] });
    expect(promoteReservation([owned, b], "b", key)).toEqual({ ok: false, code: "session_in_use" });
  });
  it.each(["turn_done", "kill_requested", "timeout", "cleanup_failed", "unknown"] as const)("retains ownership on %s", evidence => {
    expect(releaseReservation([owned], "a", evidence)).toEqual([owned]);
    expect(releaseReservation([{ owner: "a", key: null }], "a", evidence)).toHaveLength(1);
  });
  it.each(["process_exited", "not_spawned"] as const)("releases only confirmed %s", evidence => {
    expect(releaseReservation([owned], "a", evidence)).toEqual([]);
    expect(releaseReservation([owned], "b", evidence)).toEqual([owned]);
  });
});
it("does not reuse an unconfirmed Claude process or a Codex server without explicit reuse facts", () => {
  const key: SessionKey = { runtime: "claude", configDir: "/profile", sessionId: "s" };
  expect(reserveSession([{ owner: "a", key }], "a", key)).toEqual({ ok: false, code: "busy" });
  const codex: SessionKey = { ...key, runtime: "codex" };
  expect(reserveSession([{ owner: "a", key: codex }], "a", codex)).toEqual({ ok: false, code: "busy" });
  expect(reserveSession([{ owner: "a", key: codex }], "a", codex, true).ok).toBe(true);
});
it("does not revive an archived conversation from later buffered events", () => {
  expect(foldConversation([event(1, { type: "turn.started" }), event(2, { type: "conversation.archived" }), event(3, { type: "message.delta", messageId: "m", text: "late" })], "a", false).messages).toEqual([]);
});
