import { EventEmitter } from "node:events";
import { beforeEach, expect, test, vi } from "vitest";
import type { ConversationEvent, EventPayload } from "./conversation/types";
import type { WindowVisibility } from "./notifications";
import { conversationNames, createNotifyService } from "./notifyService";
import type { ConversationMetadata } from "./conversation/store";
import type { FolderEntry } from "./view";
import { DEFAULT_PREFERENCES, type NotificationPreferences } from "./preferences";

class FakeNotification extends EventEmitter {
  show = vi.fn();
  close = vi.fn();
  constructor(readonly content: { title: string; body: string }) { super(); }
}

const event = (conversationId: string, payload: EventPayload): ConversationEvent => ({ ...payload, v: 1, conversationId, seq: 1, turnId: "t", at: "2026-10-30T10:00:00.000Z" }) as ConversationEvent;
const approval = (conversationId: string, requestId: string) => event(conversationId, { type: "permission.request", requestId, tool: "Edit", summary: "s", options: [] });
const resolved = (conversationId: string, requestId: string) => event(conversationId, { type: "permission.resolved", requestId, optionId: "allow" });
const done = (conversationId: string) => event(conversationId, { type: "turn.done" });

let created: FakeNotification[];
let preferences: NotificationPreferences;
let visibility: WindowVisibility;
const clicked = vi.fn();
const log = vi.fn();
let service: ReturnType<typeof createNotifyService>;
beforeEach(() => {
  vi.useRealTimers();
  created = [];
  preferences = { ...DEFAULT_PREFERENCES.notifications };
  visibility = { focused: false, shown: true, minimized: false, appHidden: false };
  clicked.mockClear();
  log.mockClear();
  service = createNotifyService({
    preferences: () => preferences, visibility: () => visibility,
    names: id => id === "unknown" ? null : { provider: "Codex", root: `/repo-${id}`, project: "acme-web", branch: "main" },
    create: content => { const n = new FakeNotification(content); created.push(n); return n; },
    clicked, log, testTimeoutMs: 1000,
  });
});
const last = () => { const n = created.at(-1); if (!n) throw new Error("no notification"); return n; };

test("shows a notification for an event the rules allow, and its click shows the conversation", () => {
  service.event(done("c1"));
  expect(created).toHaveLength(1);
  expect(last().content).toEqual({ title: "Codex finished", body: "acme-web · main" });
  expect(last().show).toHaveBeenCalledOnce();
  last().emit("click");
  expect(clicked).toHaveBeenCalledExactlyOnceWith({ conversationId: "c1", root: "/repo-c1" });
});

test("nothing is shown while the main window is focused, turned off, or for a stopped turn", () => {
  visibility = { focused: true, shown: true, minimized: false, appHidden: false };
  service.event(done("c1"));
  visibility = { ...visibility, focused: false };
  preferences = { ...preferences, enabled: false };
  service.event(approval("c1", "r1"));
  preferences = { ...preferences, enabled: true };
  service.event(event("c1", { type: "interrupted", reason: "user" }));
  service.event(done("unknown"));
  expect(created).toEqual([]);
});

test("each conversation's notification is held, so a click on an older one still arrives", () => {
  service.event(done("c1"));
  service.event(done("c2"));
  created[0]!.emit("click");
  created[1]!.emit("click");
  expect(clicked.mock.calls).toEqual([[{ conversationId: "c1", root: "/repo-c1" }], [{ conversationId: "c2", root: "/repo-c2" }]]);
});

test("an approval request's notification closes when that request is resolved", () => {
  service.event(approval("c1", "r1"));
  service.event(resolved("c1", "r2"));
  service.event(resolved("c2", "r1"));
  expect(last().close).not.toHaveBeenCalled();
  service.event(resolved("c1", "r1"));
  expect(last().close).toHaveBeenCalledOnce();
  service.event(resolved("c1", "r1"));
  expect(last().close).toHaveBeenCalledOnce();
});

test("a question's notification says it needs an answer, and closes when it is answered or skipped", () => {
  const ask = (requestId: string) => event("c1", { type: "question.request", requestId, questions: [{ id: "0", header: "Layout", question: "Which layout?", options: [], multiSelect: false, other: true }] });
  service.event(ask("q1"));
  expect(last().content).toEqual({ title: "Codex needs your answer", body: "acme-web · main" });
  expect(last().show).toHaveBeenCalledOnce();
  service.event(event("c1", { type: "question.resolved", requestId: "q2", outcome: "skipped" }));
  expect(last().close).not.toHaveBeenCalled();
  service.event(event("c1", { type: "question.resolved", requestId: "q1", outcome: "answered", answers: { "0": { selected: [], other: "Two rows" } } }));
  expect(last().close).toHaveBeenCalledOnce();
  preferences = { ...preferences, approval: false };
  service.event(ask("q3"));
  expect(created).toHaveLength(1);
});

test("a newer notification of the same conversation replaces the older one", () => {
  service.event(approval("c1", "r1"));
  service.event(done("c1"));
  expect(created[0]!.close).toHaveBeenCalledOnce();
  expect(created[1]!.close).not.toHaveBeenCalled();
  service.event(resolved("c1", "r1"));
  expect(created[1]!.close).not.toHaveBeenCalled();
});

test("a dismissed or clicked notification is let go", () => {
  service.event(approval("c1", "r1"));
  last().emit("close");
  service.event(resolved("c1", "r1"));
  expect(last().close).not.toHaveBeenCalled();
  service.event(approval("c2", "r2"));
  last().emit("click");
  service.event(resolved("c2", "r2"));
  expect(last().close).not.toHaveBeenCalled();
});

test("a real notification macOS refuses is only logged", () => {
  service.event(done("c1"));
  last().emit("failed", {}, "UNErrorDomain error 1");
  expect(log).toHaveBeenCalledOnce();
  expect(clicked).not.toHaveBeenCalled();
});

test("the test notification shows whatever the switches and focus say, and reports macOS's answer", async () => {
  preferences = { enabled: false, approval: false, finished: false, failed: false };
  visibility = { focused: true, shown: true, minimized: false, appHidden: false };
  const sending = service.test();
  expect(last().content).toEqual({ title: "Test notification", body: "Doan notifies you like this when an agent needs you." });
  expect(last().show).toHaveBeenCalledOnce();
  last().emit("show");
  expect(await sending).toEqual({ kind: "sent" });
  const refused = service.test();
  last().emit("failed", {}, "UNErrorDomain error 1");
  expect(await refused).toEqual({ kind: "failed" });
});

test("a test notification with no answer from macOS counts as sent", async () => {
  vi.useFakeTimers();
  const sending = service.test();
  await vi.advanceTimersByTimeAsync(1000);
  expect(await sending).toEqual({ kind: "sent" });
});

test("clicking the test notification only shows the window", () => {
  void service.test();
  last().emit("show");
  last().emit("click");
  expect(clicked).toHaveBeenCalledExactlyOnceWith(null);
});

test("names a conversation by its provider, its project as Home names it, and the worktree's branch", () => {
  const session = { origin: "new" as const, sessionId: "s", configDir: "/c", cwd: "/w" };
  const conversations = [
    { conversationId: "c1", root: "/src/acme-web-wt", title: "t", state: "current", owner: { kind: "doan", provider: "copilot", connectionId: "x", accountId: null, workspaceId: null, profile: "p" }, session: { ...session, runtime: "copilot" } },
    { conversationId: "c2", root: "/src/acme-web", title: "t", state: "current", owner: { kind: "legacy-external" }, session: { ...session, runtime: "claude" } },
    { conversationId: "c3", root: "/gone/site", title: "t", state: "current", owner: { kind: "legacy-external" }, session: { ...session, runtime: "codex" } },
  ] as ConversationMetadata[];
  const git = { common: "/src/acme-web/.git", main: "/src/acme-web", worktrees: ["/src/acme-web", "/src/acme-web-wt"] };
  const entries = [
    { path: "/src/acme-web", kind: "list", canvases: [], servedRev: 0, git: { ...git, branch: "main" } },
    { path: "/src/acme-web-wt", kind: "list", canvases: [], servedRev: 0, git: { ...git, detached: "0123456789abcdef" } },
  ] as unknown as FolderEntry[];
  expect(conversationNames(conversations, entries, "c1")).toEqual({ provider: "GitHub Copilot", root: "/src/acme-web-wt", project: "acme-web", branch: "detached 0123456" });
  expect(conversationNames(conversations, entries, "c2")).toEqual({ provider: "Claude Code", root: "/src/acme-web", project: "acme-web", branch: "main" });
  expect(conversationNames(conversations, entries, "c3")).toEqual({ provider: "Codex", root: "/gone/site", project: "site", branch: null });
  expect(conversationNames(conversations, entries, "missing")).toBeNull();
});

test("closing a deleted conversation's notification closes only that one and forgets it", () => {
  service.event(approval("c1", "r1"));
  service.event(done("c2"));
  const [first, second] = created;
  service.close("c1");
  expect(first!.close).toHaveBeenCalledOnce();
  expect(second!.close).not.toHaveBeenCalled();
  // Forgotten: a later event of that conversation has nothing of it left to close.
  service.event(resolved("c1", "r1"));
  expect(first!.close).toHaveBeenCalledOnce();
  service.close("c1");
  service.close("unknown");
  expect(first!.close).toHaveBeenCalledOnce();
});
