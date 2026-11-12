import { describe, expect, it } from "vitest";
import { BIND_GRACE_MS, PROMOTION_SETTLE_MS, promotionDeadline } from "./project";
import { backgroundTasks, endPromptWait, endSteerWait, initialTransport, normalizeClaude, promptTransport, steerTransport } from "./transport";
import { afterTurnCleanup } from "./process";
import type { EventPayload, TransportState } from "./types";

// A project turn's judgement waits for the watcher only once the turn's process group is gone: it cannot write any more.
describe("promotionDeadline", () => {
  const settle = PROMOTION_SETTLE_MS, grace = BIND_GRACE_MS;
  it("waits the whole window while the group is still there", () => {
    expect(promotionDeadline({ endedAt: 1000, settle, grace })).toBe(1000 + grace);
  });
  it("judges a settle time after the group went", () => {
    expect(promotionDeadline({ endedAt: 1000, exitedAt: 1500, settle, grace })).toBe(1500 + settle);
  });
  it("counts the settle time from the end when the process was gone before it", () => {
    expect(promotionDeadline({ endedAt: 1000, exitedAt: 900, settle, grace })).toBe(1000 + settle);
    expect(promotionDeadline({ endedAt: 1000, exitedAt: 1000, settle, grace })).toBe(1000 + settle);
  });
  it("never goes past the window", () => {
    expect(promotionDeadline({ endedAt: 1000, exitedAt: 1000 + grace, settle, grace })).toBe(1000 + grace);
  });
  it("uses the PoC's watcher maximum with a margin", () => {
    expect(PROMOTION_SETTLE_MS).toBe(5572);
    expect(PROMOTION_SETTLE_MS).toBeLessThan(BIND_GRACE_MS);
  });
});

// A Claude turn's own prompt carries a uuid; a success result counts only once the CLI read that prompt. A turn the CLI
// opened by itself (a background task's notice) closes with a success result first (PoC, 2.1.322 and 2.1.284).
describe("a Claude turn's prompt read", () => {
  const PROMPT = "00000000-0000-4000-8000-000000000001";
  const STEER = "00000000-0000-4000-8000-000000000002";
  const meta = { type: "result", subtype: "success", is_error: false, num_turns: 0, result: "" };
  const own = { type: "result", subtype: "success", is_error: false, num_turns: 1, result: "4", user_message_uuids: [PROMPT] };
  function run(frames: unknown[], state: TransportState = promptTransport(initialTransport(), PROMPT)) {
    const events: EventPayload[] = []; let awaiting = false;
    for (const raw of frames) { const r = normalizeClaude(state, raw, "/repo"); state = r.state; events.push(...r.events); awaiting = r.awaitingRead === true; }
    return { state, events, awaiting };
  }
  it("holds a success result that comes before the prompt was read, and waits", () => {
    const r = run([meta]);
    expect(r.state.terminal).toBe(false); expect(r.awaiting).toBe(true);
    expect(r.events.some(e => e.type === "turn.done")).toBe(false);
  });
  it("ends at the prompt's own result after a meta turn's", () => {
    const r = run([meta, { type: "system", subtype: "init", user_message_uuids: [PROMPT] }, own]);
    expect(r.events.filter(e => e.type === "turn.done")).toHaveLength(1);
    expect(r.state.terminal).toBe(true);
  });
  it("reads the prompt from user_message_uuid alone too (2.1.284 stream frames)", () => {
    const r = run([meta, { type: "stream_event", event: { type: "message_start", message: { id: "m" } }, user_message_uuid: PROMPT }, { ...own, user_message_uuids: undefined }]);
    expect(r.events).toContainEqual({ type: "turn.done" });
  });
  it("passes the meta turn's frames on as this turn's events", () => {
    const r = run([{ type: "assistant", message: { id: "meta-m", content: [{ type: "text", text: "The task finished." }] } }, meta]);
    expect(r.events).toContainEqual({ type: "message.done", messageId: "meta-m", text: "The task finished." });
  });
  it("ends at once on a failed or aborted result before the prompt was read", () => {
    expect(run([{ type: "result", subtype: "error_during_execution", is_error: true, errors: ["boom"] }]).events).toContainEqual(expect.objectContaining({ type: "turn.failed" }));
    expect(run([{ type: "result", subtype: "success", is_error: false, terminal_reason: "aborted_tools" }]).events).toContainEqual({ type: "turn.failed", code: "process_exited" });
  });
  it("reads the prompt and a steer in the same frame", () => {
    const state = steerTransport(promptTransport(initialTransport(), PROMPT), STEER);
    const r = normalizeClaude(state, { type: "system", subtype: "init", user_message_uuids: [PROMPT, STEER] }, "/repo");
    expect(r.consumed).toEqual([STEER]); expect(r.state.prompt).toBeUndefined();
  });
  it("keeps waiting for a steer once the prompt is read", () => {
    const state = steerTransport(promptTransport(initialTransport(), PROMPT), STEER);
    const r = run([own], state);
    expect(r.awaiting).toBe(true); expect(r.state.terminal).toBe(false);
  });
  it("fails the turn with prompt_unread when the wait for the prompt runs out", () => {
    const held = run([meta]).state;
    const ended = endPromptWait(held);
    expect(ended.events.at(-1)).toEqual({ type: "turn.failed", code: "prompt_unread" });
    expect(ended.state.terminal).toBe(true);
  });
  it("still ends done when only a steer stayed unread", () => {
    const state = steerTransport(initialTransport(), STEER);
    expect(endSteerWait(run([own], state).state).events.at(-1)).toEqual({ type: "turn.done" });
  });
  it("leaves a turn without a prompt uuid (other callers, older tests) as it was", () => {
    const r = run([meta], initialTransport());
    expect(r.events).toContainEqual({ type: "turn.done" });
  });
});

// The level signal is the whole live set each time (SDK 0.3.312); a subagent counts, an ambient entry does not.
describe("backgroundTasks", () => {
  const changed = (tasks: unknown[]) => ({ type: "system", subtype: "background_tasks_changed", tasks });
  it("replaces the set with each signal", () => {
    expect(backgroundTasks([], changed([{ task_id: "b1", task_type: "local_bash" }]))).toEqual(["b1"]);
    expect(backgroundTasks(["b1"], changed([{ task_id: "a1", task_type: "local_agent", subagent_type: "general-purpose" }]))).toEqual(["a1"]);
    expect(backgroundTasks(["b1"], changed([]))).toEqual([]);
  });
  it("leaves out ambient entries", () => {
    expect(backgroundTasks([], changed([{ task_id: "m1", task_type: "local_bash", ambient: true }, { task_id: "b2", task_type: "local_bash" }]))).toEqual(["b2"]);
  });
  it("answers null for any other frame and ignores malformed entries", () => {
    expect(backgroundTasks(["b1"], { type: "system", subtype: "task_started", task_id: "b3" })).toBeNull();
    expect(backgroundTasks(["b1"], null)).toBeNull();
    expect(backgroundTasks([], changed([{ task_type: "local_bash" }, "x", { task_id: 3 }]))).toEqual([]);
    expect(backgroundTasks([], { type: "system", subtype: "background_tasks_changed" })).toEqual([]);
  });
});

// How the next send (or a queue at the turn's end) ends a finished turn's process. Background work runs in process
// groups of its own, which only the CLI's SIGTERM handling stops (PoC): a SIGKILL first would orphan it.
describe("afterTurnCleanup", () => {
  const done = { finished: false, inputClosed: true, background: 0, doneTurn: true, promptRead: true };
  it("kills at once a done turn whose process only has its suggestion left", () => {
    expect(afterTurnCleanup(done)).toBe("kill");
  });
  it("never kills while background work runs", () => {
    expect(afterTurnCleanup({ ...done, background: 1 })).toBe("term");
    expect(afterTurnCleanup({ ...done, background: 2, doneTurn: false })).toBe("term");
  });
  it("takes the SIGTERM path for a turn that did not end done with its prompt read", () => {
    expect(afterTurnCleanup({ ...done, doneTurn: false })).toBe("term");
    expect(afterTurnCleanup({ ...done, promptRead: false })).toBe("term");
  });
  it("waits for the input to close (the usage read) before deciding", () => {
    expect(afterTurnCleanup({ ...done, inputClosed: false })).toBe("later");
    expect(afterTurnCleanup({ ...done, inputClosed: false, background: 1 })).toBe("later");
  });
  it("does nothing for a process that already ended", () => {
    expect(afterTurnCleanup({ ...done, finished: true })).toBe("none");
    expect(afterTurnCleanup({ ...done, finished: true, background: 1 })).toBe("none");
  });
});
