import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { WorkItem } from "../main/workState";
import {
  canvasConversationError, canvasConversationMenu, DRAWING_TEXT, DUPLICATE_CANVAS_TEXT, newConversationMode, pickCanvasConversation, PROMOTED_TEXT, resumeHeld, shouldMarkSeen,
} from "./canvasConversation";
import { dockedRefusal, type DockedMode } from "./dockedRules";
import { startErrorView } from "./homeComposer";

const NOW = Date.parse("2026-11-01T12:00:00.000Z");
const at = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const billing = { path: ".doan/canvases/billing.html", id: "billing" };
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", canvas: billing, title: "Ideas", state: "current", owner: "doan", provider: "claude", fromHome: false,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: at(60), preview: "Last reply", ...patch,
});
const current = summary({ conversationId: "cur", lastActivityAt: at(30) });
const archived = summary({ conversationId: "old", state: "archived", lastActivityAt: at(5) });
const other = summary({ conversationId: "elsewhere", canvas: { path: ".doan/canvases/home.html", id: "home" } });
const { canvas: _bound, ...project } = summary({ conversationId: "proj" });
const LIST = [archived, current, other, project];

describe("pickCanvasConversation", () => {
  test("waits for the first list read", () => {
    expect(pickCanvasConversation("loading", billing, null)).toEqual({ kind: "wait" });
  });

  test("a failed list read shows a new conversation the composer can still start", () => {
    expect(pickCanvasConversation("error", billing, null)).toEqual({ kind: "new", listError: true, notice: null });
  });

  test("the requested conversation first, an archived one included", () => {
    expect(pickCanvasConversation(LIST, billing, "old")).toEqual({ kind: "conversation", conversationId: "old", archived: true, notice: null });
    expect(pickCanvasConversation(LIST, billing, "cur", { shown: "old" })).toMatchObject({ conversationId: "cur", archived: false });
  });

  test("a requested conversation not listed yet is read again; one of another canvas falls back", () => {
    expect(pickCanvasConversation(LIST, billing, "late")).toEqual({ kind: "reread", conversationId: "late" });
    expect(pickCanvasConversation(LIST, billing, "elsewhere")).toMatchObject({ kind: "conversation", conversationId: "cur" });
  });

  test("the current conversation, else a new one; an archived one is never the default", () => {
    expect(pickCanvasConversation(LIST, billing, null)).toEqual({ kind: "conversation", conversationId: "cur", archived: false, notice: null });
    expect(pickCanvasConversation([archived, other], billing, null)).toEqual({ kind: "new", listError: false, notice: null });
    expect(pickCanvasConversation([], billing, null)).toEqual({ kind: "new", listError: false, notice: null });
  });

  test("a moved canvas keeps its conversations by id", () => {
    const moved = { path: ".doan/canvases/pay/billing.html", id: "billing" };
    expect(pickCanvasConversation(LIST, moved, null)).toMatchObject({ kind: "conversation", conversationId: "cur" });
  });

  test("what shows stays shown across list changes", () => {
    expect(pickCanvasConversation(LIST, billing, null, { shown: "old" })).toMatchObject({ conversationId: "old", archived: true });
    expect(pickCanvasConversation(LIST, billing, null, { shown: null })).toEqual({ kind: "new", listError: false, notice: null });
    // Gone from this canvas: back to the default.
    expect(pickCanvasConversation(LIST, billing, null, { shown: "deleted" })).toMatchObject({ conversationId: "cur" });
  });

  test("a promotion while the panel is open keeps what shows and announces the promoted conversation", () => {
    const promoted = summary({ conversationId: "proj", lastActivityAt: at(1) });
    const before = [archived, project], after = [{ ...archived }, promoted];
    const notice = { kind: "promoted", text: PROMOTED_TEXT, open: "proj" };
    expect(pickCanvasConversation(after, billing, null, { shown: null, previous: before })).toEqual({ kind: "new", listError: false, notice });
    expect(pickCanvasConversation(after, billing, null, { shown: "old", previous: before })).toEqual({ kind: "conversation", conversationId: "old", archived: true, notice });
    // A conversation this panel started was never a project conversation: no notice.
    expect(pickCanvasConversation([current], billing, null, { shown: null, previous: [] })).toEqual({ kind: "new", listError: false, notice: null });
    // Before anything shows, the promoted conversation is simply the current one.
    expect(pickCanvasConversation(after, billing, null, { previous: before })).toEqual({ kind: "conversation", conversationId: "proj", archived: false, notice: null });
  });

  test("an announced promotion stays while its conversation is still current here", () => {
    const promoted = summary({ conversationId: "proj", lastActivityAt: at(1) });
    const after = [archived, promoted];
    const notice = { kind: "promoted", text: PROMOTED_TEXT, open: "proj" };
    // The read after the bind no longer differs from the one before it.
    expect(pickCanvasConversation(after, billing, null, { shown: null, previous: after, promoted: "proj" })).toEqual({ kind: "new", listError: false, notice });
    expect(pickCanvasConversation(after, billing, null, { shown: "old", previous: after, promoted: "proj" })).toEqual({ kind: "conversation", conversationId: "old", archived: true, notice });
    expect(pickCanvasConversation([archived, { ...promoted, state: "archived" }, current], billing, null, { shown: "old", previous: after, promoted: "proj" }))
      .toEqual({ kind: "conversation", conversationId: "old", archived: true, notice: null });
    expect(pickCanvasConversation(after, billing, null, { shown: "proj", previous: after, promoted: "proj" })).toEqual({ kind: "conversation", conversationId: "proj", archived: false, notice: null });
  });

  test("a project conversation drawing this canvas is announced over the new conversation", () => {
    const notice = { kind: "drawing", text: DRAWING_TEXT, open: "proj" };
    expect(pickCanvasConversation([project], billing, null, { drawing: "proj" })).toEqual({ kind: "new", listError: false, notice });
    expect(pickCanvasConversation(LIST, billing, null, { shown: null, drawing: "proj" })).toEqual({ kind: "new", listError: false, notice });
    expect(pickCanvasConversation(LIST, billing, null, { drawing: "proj" })).toMatchObject({ conversationId: "cur", notice: null });
  });
});

describe("canvasConversationMenu", () => {
  test("this canvas's conversations, the current one first, then by latest activity", () => {
    const older = summary({ conversationId: "older", state: "archived", lastActivityAt: at(600) });
    const items = canvasConversationMenu([older, ...LIST], billing, "old", NOW);
    expect(items.map(i => [i.conversationId, i.archived, i.selected])).toEqual([["cur", false, false], ["old", true, true], ["older", true, false]]);
    expect(items[0]).toMatchObject({ title: "Ideas", provider: "claude", preview: "Last reply", time: { text: "30m" }, readError: false });
  });

  test("statuses read as the sidebar slot's", () => {
    const rows = canvasConversationMenu([
      summary({ conversationId: "w", phase: "waiting" }),
      summary({ conversationId: "r", state: "archived", phase: "running", lastActivityAt: at(1) }),
      summary({ conversationId: "u", state: "archived", unseen: true, lastActivityAt: at(2) }),
    ], billing, null, NOW);
    expect(rows.map(r => r.status?.label ?? null)).toEqual(["Needs your answer", "Working", "Finished, not seen"]);
    expect(canvasConversationMenu([summary({ unseen: true })], billing, null, NOW, new Set(["c1"]))[0]!.status).toBeNull();
  });

  test("an empty list has no rows", () => {
    expect(canvasConversationMenu([], billing, null, NOW)).toEqual([]);
    expect(canvasConversationMenu([other, project], billing, null, NOW)).toEqual([]);
  });
});

describe("shouldMarkSeen", () => {
  const seq = { end: 12, seen: 4 };
  test("only while the panel is open, focused and shows the conversation", () => {
    expect(shouldMarkSeen(true, true, "cur", current, seq)).toBe(true);
    expect(shouldMarkSeen(false, true, "cur", current, seq)).toBe(false);
    expect(shouldMarkSeen(true, false, "cur", current, seq)).toBe(false);
    expect(shouldMarkSeen(true, true, "old", current, seq)).toBe(false);
    expect(shouldMarkSeen(true, true, null, current, seq)).toBe(false);
  });

  test("not an archived conversation, nor an end already seen", () => {
    expect(shouldMarkSeen(true, true, "old", archived, seq)).toBe(false);
    expect(shouldMarkSeen(true, true, "cur", current, { end: 4, seen: 4 })).toBe(false);
    expect(shouldMarkSeen(true, true, "cur", current, { end: null, seen: 0 })).toBe(false);
    expect(shouldMarkSeen(true, true, "cur", undefined, seq)).toBe(false);
  });
});

describe("newConversationMode", () => {
  const target = { available: true as const, runtime: "codex" as const };
  test("a terminal session is offered and continued by default; the person may start a new conversation", () => {
    expect(newConversationMode(target, {})).toEqual({ mode: "resume", offer: "codex", pending: false, busy: null });
    expect(newConversationMode(target, { choice: "new" })).toEqual({ mode: "new", offer: "codex", pending: false, busy: null });
  });

  test("without a session, only a new conversation", () => {
    expect(newConversationMode({ available: false, reason: "no_record" }, {})).toEqual({ mode: "new", offer: null, pending: false, busy: null });
    expect(newConversationMode({ error: "project_not_open" }, { choice: "resume" })).toEqual({ mode: "new", offer: null, pending: false, busy: null });
  });

  test("before the resume target answers, a new conversation shows and Send waits", () => {
    expect(newConversationMode(undefined, {})).toEqual({ mode: "new", offer: null, pending: true, busy: null });
  });

  test("a refused terminal session's Start a new conversation switches to new", () => {
    expect(newConversationMode(target, { choice: "new" }).mode).toBe("new");
  });

  test("while the canvas's current conversation works, Send waits with the busy line", () => {
    const busy = { kind: "restore", open: "cur" };
    expect(newConversationMode(target, { current: { ...current, phase: "running" } }).busy).toEqual(busy);
    expect(newConversationMode(undefined, { current: { ...current, phase: "waiting" } }).busy).toEqual(busy);
    expect(newConversationMode(target, { current: { ...current, working: true } }).busy).toEqual(busy);
    expect(newConversationMode(target, { current }).busy).toBeNull();
  });
});

describe("canvasConversationError", () => {
  const NEW: DockedMode = { kind: "new", root: "/code/acme", canvas: billing };
  const EXISTING: DockedMode = { kind: "existing", conversationId: "cur", provider: "claude" };
  const ARCHIVED: DockedMode = { kind: "archived", conversationId: "old", provider: "claude" };
  const RESUME: DockedMode = { kind: "resume", root: "/code/acme", canvas: billing, provider: "codex" };

  test.each(["not_logged_in", "cli_missing", "runtime_unsupported", "credential_override", "rate_limited", "session_unavailable", "session_in_use", "process_exited", "cli_install_failed", "bad_request", "unknown"])(
    "a refused start (%s) reads as on the Overview", code => {
      const view = startErrorView(code, "claude", "acme-web");
      expect(canvasConversationError(code, NEW, "claude", "acme-web")).toEqual({ kind: "notice", text: view.text, retry: view.retry, startNew: false });
    });

  test.each(["busy", "not_logged_in", "rate_limited", "queue_limit", "unknown"])("a refused send (%s) reads as on the Overview", code => {
    const refusal = dockedRefusal(code, EXISTING, "claude", "acme-web");
    expect(refusal.kind).toBe("notice");
    expect(canvasConversationError(code, EXISTING, "claude", "acme-web")).toEqual({ kind: "notice", text: (refusal as { text: string }).text, retry: false, startNew: false });
  });

  test("restoring while the current conversation runs is the restore busy line", () => {
    expect(canvasConversationError("busy", ARCHIVED, "claude", "acme-web")).toEqual({ kind: "busy", busy: { kind: "restore", open: null } });
  });

  test("a canvas not in the list, or sharing its id, blocks the composer with the draft kept", () => {
    const unlisted = { kind: "blocked", text: "This canvas isn’t listed in acme-web, so its conversation can’t continue." };
    for (const mode of [NEW, EXISTING, ARCHIVED, RESUME]) expect(canvasConversationError("canvas_not_found", mode, "claude", "acme-web")).toEqual(unlisted);
    expect(canvasConversationError("canvas_duplicate", EXISTING, "claude", "acme-web")).toEqual({ kind: "blocked", text: DUPLICATE_CANVAS_TEXT });
  });

  test("a project problem and no ready agent block the composer with their reason", () => {
    expect(canvasConversationError("project_not_open", EXISTING, "claude", "acme-web")).toEqual({ kind: "blocked", text: "acme-web isn’t available. Fix it from its menu in the sidebar." });
    expect(canvasConversationError("no_agent", NEW, "claude", "acme-web")).toEqual({
      kind: "blocked", text: "No agent is ready to run.", action: { label: "Sign in to an agent…", target: { section: "agents" } },
    });
  });

  test("a moved attachment marks its chips; too many files ask to remove some; nothing to queue behind sends instead", () => {
    for (const mode of [NEW, EXISTING, ARCHIVED, RESUME]) {
      expect(canvasConversationError("attachment_missing", mode, "claude", "acme-web", ["a1", "a2"])).toEqual({ kind: "attachments", missing: ["a1", "a2"] });
      expect(canvasConversationError("not_running", mode, "claude", "acme-web")).toEqual({ kind: "resend" });
      expect(canvasConversationError("attachment_limit", mode, "claude", "acme-web")).toEqual({
        kind: "notice", text: "Only 10 files can be attached to a message. Remove some, then send again.", retry: false, startNew: false,
      });
    }
    expect(canvasConversationError("attachment_missing", EXISTING, "claude", "acme-web")).toEqual({ kind: "attachments", missing: [] });
  });

  test.each([
    ["session_in_use", "Couldn’t continue the terminal session: it’s in use in another terminal."],
    ["no_session", "Couldn’t continue the terminal session: it’s no longer available."],
    ["session_unavailable", "Couldn’t continue the terminal session: it isn’t available right now."],
    ["not_logged_in", "Couldn’t continue the terminal session: sign in to Codex in Settings > Agents, then send again."],
    ["cli_missing", "Couldn’t continue the terminal session: Codex isn’t installed on this Mac."],
    ["runtime_unsupported", "Couldn’t continue the terminal session: Doan doesn’t support this version of Codex."],
    ["process_exited", "Couldn’t continue the terminal session: Codex stopped before it could continue."],
    ["rate_limited", "Couldn’t continue the terminal session: Codex is rate limited."],
    ["busy", "Couldn’t continue the terminal session: Codex is finishing a previous run."],
    ["unknown", "Couldn’t continue the terminal session."],
    ["constructor", "Couldn’t continue the terminal session."],
  ])("every terminal session refusal (%s) offers a new conversation, never another agent", (code, text) => {
    const view = canvasConversationError(code, RESUME, "codex", "acme-web");
    expect(view).toEqual({ kind: "notice", text, retry: false, startNew: true });
    expect((view as { text: string }).text).not.toContain("Choose another agent");
  });
});

// terminal-agent-activity design '표시' (canvas conversation panel): the terminal session choice waits while that
// session (provider:id) is in the working list. Identified sessions span roots; an anonymous one matches nothing.
describe("resumeHeld", () => {
  const reply = { available: true as const, runtime: "codex" as const, session: "s1" };
  const item = (patch: Partial<WorkItem>): WorkItem => ({ session: "s1", provider: "codex", root: "/w/a", path: ".doan/canvases/a.html", ...patch });
  test("the session working in a terminal holds the choice, whatever root or canvas it works on", () => {
    expect(resumeHeld(reply, [item({})])).toBe(true);
    expect(resumeHeld(reply, [item({ root: "/w/other", path: ".doan/ds/b.html" })])).toBe(true);
  });
  test("another session, another provider or an anonymous session does not hold it", () => {
    expect(resumeHeld(reply, [item({ session: "s2" }), item({ provider: "claude" }), item({ session: null, provider: null })])).toBe(false);
  });
  test("the choice comes back when the session leaves the list", () => {
    expect(resumeHeld(reply, [])).toBe(false);
  });
  // RD1: main names a session a live terminal process holds (session_in_use), so it holds while it works.
  test("a session a terminal process holds is held while it works, and only that refusal names one", () => {
    const occupied = { available: false as const, reason: "session_in_use", runtime: "claude" as const, session: "s1" };
    expect(resumeHeld(occupied, [item({ provider: "claude" })])).toBe(true);
    expect(resumeHeld(occupied, [])).toBe(false);
    expect(resumeHeld({ ...occupied, reason: "session_unavailable" }, [item({ provider: "claude" })])).toBe(false);
  });
  test("no answer yet, no terminal session, an error or an answer without a session never holds", () => {
    const work = [item({})];
    expect(resumeHeld(undefined, work)).toBe(false);
    expect(resumeHeld({ available: false, reason: "no_record" }, work)).toBe(false);
    expect(resumeHeld({ error: "project_not_open" }, work)).toBe(false);
    expect(resumeHeld({ available: true, runtime: "codex" }, work)).toBe(false);
  });
});
