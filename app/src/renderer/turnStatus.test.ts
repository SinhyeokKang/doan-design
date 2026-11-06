import { describe, expect, test } from "vitest";
import type { ConversationEvent, StageSignal, TurnStage } from "../main/conversation/types";
import { threadItems, withSending } from "./threadItems";
import { elapsedText, newerStage, settle, SETTLE_MS, turnAnnouncement, turnOf, turnStatus, turnText, type Settled, type TurnStatus } from "./turnStatus";

const ROOT = "/Users/ada/code/doan";
let seq = 0;
const ev = (turnId: string, payload: Record<string, unknown>, at = "2026-11-06T10:00:00.000Z"): ConversationEvent =>
  ({ v: 1, conversationId: "c1", seq: ++seq, turnId, at, ...payload } as ConversationEvent);
const turn = (id: string, at = "2026-11-06T10:00:00.000Z") => [ev(id, { type: "user.message", text: "Draw it", anchors: [] }, at), ev(id, { type: "turn.started" }, at)];
const options = [{ id: "a", label: "Allow once", kind: "allow" }, { id: "d", label: "Deny", kind: "deny" }];
const signal = (turnId: string, stage: TurnStage, at: number, rev = at): StageSignal => ({ conversationId: "c1", turnId, seq: at, rev, stage });
// The status of the history's last turn, as the hosts compute it.
const statusOf = (events: ConversationEvent[], stage: StageSignal | null = null, live = true) =>
  turnStatus(threadItems(events, ROOT, live), turnOf(events, live), stage, ROOT);

describe("turnStatus", () => {
  test("none after each kind of terminal, for a folded turn and before any turn", () => {
    seq = 0;
    for (const end of [{ type: "turn.done" }, { type: "turn.failed", code: "unknown" }, { type: "interrupted", reason: "user" }]) {
      const events = [...turn("t1"), ev("t1", end)];
      expect(statusOf(events, signal("t1", { kind: "thinking" }, seq))).toEqual({ kind: "none" });
    }
    expect(statusOf(turn("t2"), null, false)).toEqual({ kind: "none" });
    expect(statusOf([])).toEqual({ kind: "none" });
  });

  test("general from the message's entry, waiting while a card asks, replying while text streams", () => {
    seq = 0;
    const events = turn("t1");
    expect(statusOf(events)).toEqual({ kind: "general" });
    events.push(ev("t1", { type: "permission.request", requestId: "r1", tool: "Bash", summary: "Run doan check", options }));
    expect(statusOf(events, signal("t1", { kind: "thinking" }, seq))).toEqual({ kind: "waiting" });
    seq = 0;
    const asked = [...turn("t1"), ev("t1", { type: "question.request", requestId: "q1", questions: [{ id: "0", header: "", question: "Which?", options: [{ label: "A" }], multiSelect: false, other: false }] })];
    expect(statusOf(asked)).toEqual({ kind: "waiting" });
    seq = 0;
    const replying = [...turn("t1"), ev("t1", { type: "message.delta", messageId: "m1", text: "I made" })];
    // The reply wins over a stage sent before its text (and after, as the text streams on).
    expect(statusOf(replying, signal("t1", { kind: "thinking" }, seq))).toEqual({ kind: "reply" });
    replying.push(ev("t1", { type: "message.done", messageId: "m1", text: "I made it." }));
    expect(statusOf(replying)).toEqual({ kind: "general" });
  });

  test("a stage counts only for this turn and only while no event came after it", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "activity", kind: "read", path: `${ROOT}/src/App.tsx`, summary: "src/App.tsx" })];
    expect(statusOf(events, signal("t1", { kind: "thinking" }, seq))).toEqual({ kind: "thinking" });
    expect(statusOf(events, signal("t1", { kind: "general" }, seq))).toEqual({ kind: "general" });
    // Older than the activity: the event rule decides.
    expect(statusOf(events, signal("t1", { kind: "thinking" }, seq - 1))).toEqual({ kind: "tool", activity: "read", text: "Reading src/App.tsx" });
    // Another turn's stage.
    expect(statusOf(events, signal("t0", { kind: "thinking" }, seq + 5))).toEqual({ kind: "tool", activity: "read", text: "Reading src/App.tsx" });
  });

  test("tool stages read as the activity rows do; Codex listFiles and search read as Reading files", () => {
    seq = 0;
    const events = turn("t1");
    const tool = (stage: Omit<Extract<TurnStage, { kind: "tool" }>, "kind">) => statusOf(events, signal("t1", { kind: "tool", ...stage }, seq));
    expect(tool({ activity: "read", path: `${ROOT}/src/App.tsx`, summary: "src/App.tsx" })).toEqual({ kind: "tool", activity: "read", text: "Reading src/App.tsx" });
    expect(tool({ activity: "read", path: "/etc/hosts", summary: "/etc/hosts" })).toEqual({ kind: "tool", activity: "read", text: "Reading /etc/hosts" });
    expect(tool({ activity: "read", path: "src", summary: "Reading files" })).toEqual({ kind: "tool", activity: "read", text: "Reading files" });
    expect(tool({ activity: "read", summary: "Reading files" })).toEqual({ kind: "tool", activity: "read", text: "Reading files" });
    expect(tool({ activity: "edit", path: "src/a.ts", summary: "Edit a.ts" })).toEqual({ kind: "tool", activity: "edit", text: "Editing src/a.ts" });
    expect(tool({ activity: "command", summary: "Running a command" })).toEqual({ kind: "tool", activity: "command", text: "Running a command" });
    expect(tool({ activity: "other", summary: "Fetch the page" })).toEqual({ kind: "tool", activity: "other", text: "Fetch the page" });
  });

  test("without a stage: the last activity, the tool before an Allow, general after a Deny and over MCP startup lines", () => {
    seq = 0;
    const command = [...turn("t1"), ev("t1", { type: "activity", kind: "command", summary: "Running a command" })];
    expect(statusOf(command)).toEqual({ kind: "tool", activity: "command", text: "Running a command" });
    const asked = [...command, ev("t1", { type: "permission.request", requestId: "r1", tool: "Bash", summary: "Run doan check", options })];
    expect(statusOf([...asked, ev("t1", { type: "permission.resolved", requestId: "r1", optionId: "a" })])).toEqual({ kind: "tool", activity: "command", text: "Running a command" });
    expect(statusOf([...asked, ev("t1", { type: "permission.resolved", requestId: "r1", optionId: "d" })])).toEqual({ kind: "general" });
    seq = 0;
    const waiting = [...turn("t1"), ev("t1", { type: "activity", kind: "other", summary: "Waiting for Notion" })];
    expect(statusOf(waiting)).toEqual({ kind: "general" });
    waiting.push(ev("t1", { type: "activity", kind: "other", summary: "Notion wasn’t ready, so this turn started without it." }));
    expect(statusOf(waiting)).toEqual({ kind: "general" });
  });

  test("a general stage leaves the activity row spinning with its running head (decision 4)", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "activity", kind: "command", summary: "Running a command" })];
    const items = threadItems(events, ROOT, true);
    expect(turnStatus(items, turnOf(events, true), signal("t1", { kind: "general" }, seq), ROOT)).toEqual({ kind: "general" });
    expect(items.at(-1)).toMatchObject({ kind: "activity", running: true, head: "Running a command" });
  });

  test("Send now's message in flight and a steered message mid-turn: event rule, time from the turn's start", () => {
    seq = 0;
    const events = [...turn("t1", "2026-11-06T10:00:00.000Z"), ev("t1", { type: "message.done", messageId: "m1", text: "Done." })];
    const sending = withSending(threadItems(events, ROOT, true), [{ id: "q1", text: "Also this", anchors: [], attachments: [] }]);
    expect(turnStatus(sending, turnOf(events, true), null, ROOT)).toEqual({ kind: "general" });
    const thinking = signal("t1", { kind: "thinking" }, seq);
    events.push(ev("t1", { type: "user.message", text: "Also this", anchors: [] }, "2026-11-06T10:00:30.000Z"));
    expect(turnOf(events, true)).toMatchObject({ turnId: "t1", at: "2026-11-06T10:00:00.000Z", lastSeq: seq });
    expect(statusOf(events, thinking)).toEqual({ kind: "general" });
  });

  test("a queue starting the next turn at once: the earlier turn's stage is ignored", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "message.done", messageId: "m1", text: "Done." }), ev("t1", { type: "turn.done" }), ...turn("t2")];
    expect(statusOf(events, signal("t1", { kind: "thinking" }, seq + 1))).toEqual({ kind: "general" });
    expect(statusOf(events, signal("t2", { kind: "thinking" }, seq))).toEqual({ kind: "thinking" });
  });
});

describe("newerStage", () => {
  test("keeps the higher rev within a turn, so a late read reply never overwrites a newer push", () => {
    const pushed = signal("t1", { kind: "thinking" }, 5, 7), read = signal("t1", { kind: "general" }, 5, 6);
    expect(newerStage(null, read, "t1")).toBe(read);
    expect(newerStage(read, pushed, "t1")).toBe(pushed);
    expect(newerStage(pushed, read, "t1")).toBe(pushed);
    expect(newerStage(pushed, { ...pushed }, "t1")).toBe(pushed);
  });

  test("drops a stage of another turn than the history's current one, and takes a new turn's while unread", () => {
    const old = signal("t1", { kind: "thinking" }, 5, 9), next = signal("t2", { kind: "general" }, 8, 1);
    expect(newerStage(next, old, "t2")).toBe(next);
    expect(newerStage(old, next, "t2")).toBe(next);
    expect(newerStage(old, next, null)).toBe(next);
  });
});

describe("settle", () => {
  const general: TurnStatus = { kind: "general" }, thinking: TurnStatus = { kind: "thinking" };
  const reading: TurnStatus = { kind: "tool", activity: "read", text: "Reading a.ts" };
  const run = (steps: [TurnStatus, number][]) => steps.reduce<Settled | null>((held, [status, at]) => settle(held, status, at), null)!;

  test("a new stage shows once it held for 300 ms; one replaced sooner never shows", () => {
    expect(run([[general, 0], [reading, 100]]).shown).toEqual(general);
    expect(run([[general, 0], [reading, 100], [reading, 100 + SETTLE_MS - 1]]).shown).toEqual(general);
    expect(run([[general, 0], [reading, 100], [reading, 100 + SETTLE_MS]]).shown).toEqual(reading);
    expect(run([[general, 0], [reading, 100], [thinking, 200], [thinking, 400]]).shown).toEqual(general);
    expect(run([[general, 0], [reading, 100], [thinking, 200], [thinking, 200 + SETTLE_MS]]).shown).toEqual(thinking);
    // Back to the shown stage: nothing waits any more.
    expect(run([[general, 0], [reading, 100], [general, 200]])).toEqual({ shown: general, pending: null, since: 200 });
    // Another path is another stage.
    expect(run([[reading, 0], [{ ...reading, text: "Reading b.ts" }, 10]]).shown).toEqual(reading);
  });

  test("replying, waiting and none show at once, and so does the first stage after nothing showed", () => {
    expect(run([[general, 0], [{ kind: "reply" }, 1]]).shown).toEqual({ kind: "reply" });
    expect(run([[general, 0], [{ kind: "waiting" }, 1]]).shown).toEqual({ kind: "waiting" });
    expect(run([[general, 0], [{ kind: "none" }, 1]]).shown).toEqual({ kind: "none" });
    expect(run([[{ kind: "none" }, 0], [general, 1]]).shown).toEqual(general);
    expect(run([[{ kind: "waiting" }, 0], [reading, 1]]).shown).toEqual(reading);
  });
});

test("elapsedText: seconds, then minutes and seconds, then hours with both; unreadable or negative is 0s", () => {
  const s = 1000;
  expect([0, 999, 59 * s, 60 * s, 725 * s, 3599 * s, 3600 * s, 3852 * s, 3600 * 25 * s].map(elapsedText))
    .toEqual(["0s", "0s", "59s", "1m 0s", "12m 5s", "59m 59s", "1h 0m 0s", "1h 4m 12s", "25h 0m 0s"]);
  expect([NaN, -5 * s, Infinity].map(elapsedText)).toEqual(["0s", "0s", "0s"]);
});

test("the words and the screen reader's status: the provider only without a tool, the kind only when read aloud", () => {
  const p = "Claude Code";
  const read: TurnStatus = { kind: "tool", activity: "read", text: "Reading src/App.tsx" };
  expect([{ kind: "general" }, { kind: "thinking" }, { kind: "reply" }, read].map(status => turnText(status as TurnStatus, p)))
    .toEqual(["Claude Code is working", "Claude Code is thinking", "Claude Code is replying", "Reading src/App.tsx"]);
  expect((["read", "edit", "command", "other"] as const).map(activity => turnAnnouncement({ kind: "tool", activity, text: "x" }, p)))
    .toEqual(["Claude Code is reading files", "Claude Code is editing files", "Claude Code is running a command", "Claude Code is using a tool"]);
  expect(turnAnnouncement({ kind: "general" }, p)).toBe("Claude Code is working");
  expect(turnAnnouncement({ kind: "none" }, p)).toBe("");
  expect(turnAnnouncement({ kind: "waiting" }, p)).toBe("");
});
