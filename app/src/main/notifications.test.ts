import { describe, expect, test } from "vitest";
import type { ConversationEvent, EventPayload } from "./conversation/types";
import { closesNotification, notificationFor, notificationTarget, TEST_NOTIFICATION, type WindowVisibility } from "./notifications";
import { DEFAULT_PREFERENCES } from "./preferences";

const ON = DEFAULT_PREFERENCES.notifications;
const event = (payload: EventPayload): ConversationEvent => ({ ...payload, v: 1, conversationId: "c1", seq: 3, turnId: "t1", at: "2026-10-30T10:00:00.000Z" }) as ConversationEvent;
const APPROVAL = event({ type: "permission.request", requestId: "r1", tool: "Edit", summary: "Edit tokens.css", options: [] });
const DONE = event({ type: "turn.done" });
const FAILED = event({ type: "turn.failed", code: "unknown" });
const NAMES = { provider: "Codex", root: "/repo", project: "acme-web", branch: "main" };
// Visible, focused and in front: the only case that does not notify.
const ACTIVE: WindowVisibility = { focused: true, shown: true, minimized: false, appHidden: false };
const BEHIND: WindowVisibility = { ...ACTIVE, focused: false };

describe("notificationFor", () => {
  test("names the provider in the title and the project and branch in the body, never the request", () => {
    expect(notificationFor(APPROVAL, ON, BEHIND, NAMES)).toEqual({ kind: "approval", title: "Codex needs your approval", body: "acme-web · main", target: { conversationId: "c1", root: "/repo" }, requestId: "r1" });
    expect(notificationFor(DONE, ON, BEHIND, NAMES)).toEqual({ kind: "finished", title: "Codex finished", body: "acme-web · main", target: { conversationId: "c1", root: "/repo" } });
    expect(notificationFor(FAILED, ON, BEHIND, NAMES)).toEqual({ kind: "failed", title: "Codex couldn’t finish", body: "acme-web · main", target: { conversationId: "c1", root: "/repo" } });
    expect(notificationFor(DONE, ON, BEHIND, { ...NAMES, branch: null })?.body).toBe("acme-web");
    expect(JSON.stringify(notificationFor(APPROVAL, ON, BEHIND, NAMES))).not.toContain("tokens.css");
  });

  test("the main window being focused and in front shows nothing; every other way of not seeing it notifies", () => {
    expect(notificationFor(DONE, ON, ACTIVE, NAMES)).toBeNull();
    for (const visibility of [BEHIND, { ...ACTIVE, shown: false }, { ...ACTIVE, minimized: true }, { ...ACTIVE, appHidden: true }, { focused: false, shown: false, minimized: false, appHidden: true }]) {
      expect(notificationFor(DONE, ON, visibility, NAMES), JSON.stringify(visibility)).not.toBeNull();
    }
  });

  test("Desktop notifications off silences every event whatever its own switch says", () => {
    for (const e of [APPROVAL, DONE, FAILED]) expect(notificationFor(e, { ...ON, enabled: false }, BEHIND, NAMES)).toBeNull();
  });

  test("each event follows its own switch", () => {
    expect(notificationFor(APPROVAL, { ...ON, approval: false }, BEHIND, NAMES)).toBeNull();
    expect(notificationFor(DONE, { ...ON, finished: false }, BEHIND, NAMES)).toBeNull();
    expect(notificationFor(FAILED, { ...ON, failed: false }, BEHIND, NAMES)).toBeNull();
    expect(notificationFor(DONE, { ...ON, approval: false, failed: false }, BEHIND, NAMES)).not.toBeNull();
  });

  test("a turn the person stopped, and every other event, never notifies", () => {
    for (const payload of [{ type: "interrupted", reason: "user" }, { type: "interrupted", reason: "appQuit" }, { type: "interrupted", reason: "crashed" }, { type: "turn.started" },
      { type: "message.done", messageId: "m", text: "hi" }, { type: "permission.resolved", requestId: "r1", optionId: "o" }, { type: "conversation.archived" }] as EventPayload[]) {
      expect(notificationFor(event(payload), ON, BEHIND, NAMES), payload.type).toBeNull();
    }
  });

  test("a conversation main cannot name is not notified", () => {
    expect(notificationFor(DONE, ON, BEHIND, null)).toBeNull();
  });
});

describe("agent questions", () => {
  const QUESTION = event({ type: "question.request", requestId: "q1", questions: [{ id: "0", header: "Layout", question: "Which layout should the secret-project header use?", options: [{ label: "Compact" }], multiSelect: false, other: true }] });
  test("a question notifies as an approval request: its switch, the answer title, project and branch only", () => {
    const planned = notificationFor(QUESTION, ON, BEHIND, NAMES);
    expect(planned).toEqual({ kind: "approval", title: "Codex needs your answer", body: "acme-web · main", target: { conversationId: "c1", root: "/repo" }, requestId: "q1" });
    expect(JSON.stringify(planned)).not.toContain("secret-project");
    expect(notificationFor(QUESTION, { ...ON, approval: false }, BEHIND, NAMES)).toBeNull();
    expect(notificationFor(QUESTION, { ...ON, enabled: false }, BEHIND, NAMES)).toBeNull();
  });
  test("the question's own resolution closes its notification, whatever the outcome", () => {
    const shown = { kind: "approval" as const, requestId: "q1" };
    for (const outcome of ["answered", "skipped", "expired"] as const) expect(closesNotification(event({ type: "question.resolved", requestId: "q1", outcome }), shown)).toBe(true);
    expect(closesNotification(event({ type: "question.resolved", requestId: "q2", outcome: "skipped" }), shown)).toBe(false);
    expect(closesNotification(event({ type: "question.resolved", requestId: "q1", outcome: "skipped" }), { kind: "finished" })).toBe(false);
  });
});

describe("closesNotification", () => {
  test("the approval request's own resolution closes its notification", () => {
    const shown = { kind: "approval" as const, requestId: "r1" };
    expect(closesNotification(event({ type: "permission.resolved", requestId: "r1", optionId: "allow" }), shown)).toBe(true);
    expect(closesNotification(event({ type: "permission.resolved", requestId: "r2", optionId: "allow" }), shown)).toBe(false);
    expect(closesNotification(DONE, shown)).toBe(false);
  });

  test("a finished or failed notification is left for the person", () => {
    expect(closesNotification(event({ type: "permission.resolved", requestId: "r1", optionId: "allow" }), { kind: "finished" })).toBe(false);
    expect(closesNotification(event({ type: "permission.resolved", requestId: "r1", optionId: "allow" }), { kind: "failed" })).toBe(false);
  });
});

describe("notificationTarget", () => {
  const click = { conversationId: "c1", root: "/repo" };
  test("a conversation the renderer knows opens where the permission toast's Open goes", () => {
    expect(notificationTarget(click, true, true, false)).toEqual({ kind: "conversation", conversationId: "c1", root: "/repo" });
  });
  test("an unknown conversation of a registered project opens that project's Overview", () => {
    expect(notificationTarget(click, false, true, false)).toEqual({ kind: "overview", root: "/repo" });
  });
  test("an unknown conversation of a project no longer registered only shows the window", () => {
    expect(notificationTarget(click, false, false, false)).toEqual({ kind: "window" });
  });
  test("a page lock or a modal only shows the window", () => {
    for (const [known, registered] of [[true, true], [false, true], [false, false]] as const) {
      expect(notificationTarget(click, known, registered, true)).toEqual({ kind: "window" });
    }
  });
});

test("the test notification has fixed copy of its own", () => {
  expect(TEST_NOTIFICATION).toEqual({ title: "Test notification", body: "Doan notifies you like this when an agent needs you." });
});
