import { expect, test } from "vitest";
import type { ConversationEvent, EventPayload, FailureCode } from "../main/conversation/types";
import { focusAfterStop, mergeConversationEvents, stripState, stripView, type StripContext, type StripState } from "./conversationStrip";

function events(...payloads: (EventPayload & { turnId?: string })[]): ConversationEvent[] {
  return payloads.map(({ turnId, ...payload }, i) => ({ ...payload, v: 1, conversationId: "c1", seq: i + 1, turnId: turnId ?? "t1", at: "2026-10-29T00:00:00Z" }) as ConversationEvent);
}
const started: EventPayload[] = [{ type: "user.message", text: "Draw it.", anchors: [] }, { type: "turn.started" }];
const ASK: EventPayload = {
  type: "permission.request", requestId: "r1", tool: "Edit", summary: "Edit .doan/canvases/design-system.html",
  options: [{ id: "d", label: "Deny", kind: "deny" }, { id: "aa", label: "Always allow", kind: "allowAlways" }, { id: "a", label: "Allow", kind: "allow" }],
};
const CTX: StripContext = { provider: "claude", project: "doan-design", branch: "main", canvas: null };

test("an accepted conversation starts before its first event, and stays starting until output", () => {
  expect(stripState([])).toEqual({ kind: "starting" });
  expect(stripState(events(...started))).toEqual({ kind: "starting" });
  expect(stripView({ kind: "starting" }, CTX)).toEqual({
    title: "Starting Claude Code", body: "doan-design · main", live: "status", alertKey: null, actions: [{ command: "stop", label: "Stop" }],
  });
  expect(stripView({ kind: "starting" }, { ...CTX, branch: null }).body).toBe("doan-design");
});

test("working shows the last activity line and Stop; message output alone keeps the previous line", () => {
  const state = stripState(events(...started, { type: "activity", kind: "read", summary: "Reading tokens.css" }, { type: "activity", kind: "edit", summary: "Editing .doan/canvases/design-system.html" }, { type: "message.delta", messageId: "m", text: "…" }));
  expect(state).toEqual({ kind: "working", activity: "Editing .doan/canvases/design-system.html" });
  expect(stripView(state, CTX)).toEqual({
    title: "Claude Code is working", body: "Editing .doan/canvases/design-system.html", live: "status", alertKey: null, actions: [{ command: "stop", label: "Stop" }],
  });
  expect(stripState(events(...started, { type: "message.delta", messageId: "m", text: "Hi" }))).toEqual({ kind: "working", activity: null });
  expect(stripView({ kind: "working", activity: null }, CTX).body).toBeNull();
});

test("a permission request shows its summary and the provider's own choices in their order, then Stop, announced once", () => {
  const state = stripState(events(...started, ASK));
  expect(state).toEqual({ kind: "permission", requestId: "r1", summary: "Edit .doan/canvases/design-system.html", options: [{ id: "d", label: "Deny", kind: "deny" }, { id: "aa", label: "Always allow", kind: "allowAlways" }, { id: "a", label: "Allow", kind: "allow" }] });
  expect(stripView(state, CTX)).toEqual({
    title: "Claude Code needs your answer", body: "Edit .doan/canvases/design-system.html", live: "alert", alertKey: "r1",
    actions: [{ command: "answer", label: "Deny", optionId: "d", kind: "deny" }, { command: "answer", label: "Always allow", optionId: "aa", kind: "allowAlways" }, { command: "answer", label: "Allow", optionId: "a", kind: "allow" }, { command: "stop", label: "Stop" }],
  });
});

test("an answered request returns to working; a second open request is shown after the first is answered", () => {
  expect(stripState(events(...started, { type: "activity", kind: "edit", summary: "Editing a" }, ASK, { type: "permission.resolved", requestId: "r1", optionId: "a" }))).toEqual({ kind: "working", activity: "Editing a" });
  const second: EventPayload = { ...ASK, requestId: "r2", summary: "Run npm test" } as EventPayload;
  expect(stripState(events(...started, ASK, second))).toMatchObject({ kind: "permission", requestId: "r1" });
  expect(stripState(events(...started, ASK, second, { type: "permission.resolved", requestId: "r1", optionId: "a" }))).toMatchObject({ kind: "permission", requestId: "r2", summary: "Run npm test" });
});

const failure = (code: FailureCode) => stripView(stripState(events(...started, { type: "turn.failed", code })), CTX);
const recover = [{ command: "editOnHome", label: "Edit on Home" }, { command: "dismiss", label: "Dismiss" }];

test("every turn.failed row has its draft wording and offers Edit on Home", () => {
  const rows: [FailureCode, string, string][] = [
    ["process_exited", "Claude Code stopped unexpectedly", "Edit your request on Home and send it again."],
    ["unknown", "Claude Code stopped unexpectedly", "Edit your request on Home and send it again."],
    ["not_logged_in", "Claude Code’s sign-in expired", "Edit your request on Home and choose another agent."],
    ["rate_limited", "Claude Code is rate limited", "Try again later from Home."],
    ["session_unavailable", "Claude Code couldn’t continue", "Edit your request on Home and send it again."],
    ["session_in_use", "Claude Code couldn’t continue", "Edit your request on Home and send it again."],
  ];
  for (const [code, title, body] of rows) expect(failure(code)).toEqual({ title, body, live: "status", alertKey: null, actions: recover });
});

test("failure codes without a row of their own read as an unexpected stop", () => {
  for (const code of ["runtime_unsupported", "cli_missing"] as const) expect(failure(code)).toMatchObject({ title: "Claude Code stopped unexpectedly", actions: recover });
});

test("stopped offers Edit on Home; a stop the person did not make says so", () => {
  const stopped = stripState(events(...started, { type: "activity", kind: "edit", summary: "x" }, { type: "interrupted", reason: "user" }));
  expect(stopped).toEqual({ kind: "interrupted", reason: "user" });
  expect(stripView(stopped, CTX)).toEqual({ title: "Stopped", body: "You stopped this conversation.", live: "status", alertKey: null, actions: recover });
  expect(stripView({ kind: "interrupted", reason: "crashed" }, CTX).body).toBe("This conversation stopped before it finished.");
});

test("done names the new canvas with Open; without one only Dismiss", () => {
  const done = stripState(events(...started, { type: "turn.done" }));
  expect(done).toEqual({ kind: "done" });
  expect(stripView(done, { ...CTX, canvas: "design-system" })).toEqual({
    title: "Done", body: "design-system is ready.", live: "status", alertKey: null, actions: [{ command: "open", label: "Open" }, { command: "dismiss", label: "Dismiss" }],
  });
  expect(stripView(done, CTX)).toEqual({ title: "Done", body: null, live: "status", alertKey: null, actions: [{ command: "dismiss", label: "Dismiss" }] });
});

test("events after a terminal event and from earlier turns do not change the state; a new turn restarts it", () => {
  expect(stripState(events(...started, { type: "turn.done" }, { type: "activity", kind: "edit", summary: "late" }))).toEqual({ kind: "done" });
  expect(stripState(events(...started, ASK, { type: "turn.failed", code: "process_exited" }))).toEqual({ kind: "failed", code: "process_exited" });
  const two = events(...started, { type: "turn.failed", code: "process_exited" }, { type: "turn.started", turnId: "t2" }, { type: "activity", kind: "read", summary: "Reading", turnId: "t2" }, { type: "activity", kind: "read", summary: "stale", turnId: "t1" });
  expect(stripState(two)).toEqual({ kind: "working", activity: "Reading" });
});

test("each provider names itself", () => {
  expect(stripView({ kind: "working", activity: null }, { ...CTX, provider: "copilot" }).title).toBe("GitHub Copilot is working");
});

// ARCHITECTURE §7: subscribe first, read, then merge by seq; the renderer cannot import main's state.ts (node:path).
test("the read snapshot and buffered events merge by seq, once each, for this conversation only", () => {
  const all = events(...started, { type: "activity", kind: "edit", summary: "a" }, { type: "activity", kind: "edit", summary: "b" });
  const other = { ...all[1]!, conversationId: "other", seq: 99 };
  const merged = mergeConversationEvents(all.slice(0, 2), [...all.slice(2).reverse(), all[1]!, other, { ...all[2]!, seq: 0 }], all[0]!.conversationId);
  expect(merged.map(e => e.seq)).toEqual(all.map(e => e.seq));
});

// BV1 defect (2026-10-30): a Copilot Deny ended the turn ~300 ms after the answer, Stop went away with focus on it and
// focus fell to the page. After an answer focus stays on Stop while the turn runs; once Stop is gone it goes to Dismiss.
test("focus stays on Stop while it is drawn; once a finished turn takes it away, focus goes to Dismiss", () => {
  const view = (state: StripState) => stripView(state, CTX).actions;
  expect(focusAfterStop(view({ kind: "working", activity: null }))).toBe("stop");
  expect(focusAfterStop(view({ kind: "permission", requestId: "r2", summary: "s", options: [{ id: "a", label: "Allow", kind: "allow" }] }))).toBe("stop");
  expect(focusAfterStop(view({ kind: "failed", code: "process_exited" }))).toBe("dismiss");
  expect(focusAfterStop(view({ kind: "interrupted", reason: "crashed" }))).toBe("dismiss");
  expect(focusAfterStop(stripView({ kind: "done" }, { ...CTX, canvas: "design-system" }).actions)).toBe("dismiss");
});
