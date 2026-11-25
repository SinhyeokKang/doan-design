import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { WorkItem } from "../main/workState";
import {
  canvasConversationError, canvasConversationMenu, DUPLICATE_CANVAS_TEXT, newConversationMode,
  earliestWaiting, pickShownConversation, resumeHeld, shouldMarkSeen, sidebarRowRequest, titleMenuOrder, type ShownInput,
} from "./canvasConversation";
import { dockedRefusal, type DockedMode } from "./dockedRules";
import { startErrorView } from "./homeComposer";
import { projectConversationMenu } from "./overviewConversation";

const NOW = Date.parse("2026-11-01T12:00:00.000Z");
const at = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const billing = { path: ".doan/canvases/billing.html", id: "billing" };
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", canvas: billing, title: "Ideas", owner: "doan", provider: "claude", fromHome: false,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: at(60), preview: "Last reply", ...patch,
});
const current = summary({ conversationId: "cur", lastActivityAt: at(30) });
const other = summary({ conversationId: "elsewhere", canvas: { path: ".doan/canvases/home.html", id: "home" } });
const { canvas: _bound, ...project } = summary({ conversationId: "proj" });

describe("canvasConversationMenu", () => {
  test("this canvas's conversations by latest activity, the shown one selected; none is pinned first", () => {
    const older = summary({ conversationId: "older", lastActivityAt: at(600) });
    const recent = summary({ conversationId: "recent", lastActivityAt: at(5) });
    const items = canvasConversationMenu([older, current, recent, other, project], billing, "older", NOW);
    expect(items.map(i => [i.conversationId, i.selected])).toEqual([["recent", false], ["cur", false], ["older", true]]);
    expect(items[1]).toMatchObject({ title: "Ideas", provider: "claude", preview: "Last reply", time: { text: "30m" }, readError: false });
  });

  test("while the menu is open its order stays as opened, and a new conversation is added at the end", () => {
    const older = summary({ conversationId: "older", lastActivityAt: at(600) });
    const fresh = summary({ conversationId: "fresh", lastActivityAt: at(0) });
    const items = canvasConversationMenu([{ ...older, lastActivityAt: at(1) }, current, fresh], billing, "cur", NOW, new Set(), ["cur", "older"]);
    expect(items.map(i => i.conversationId)).toEqual(["cur", "older", "fresh"]);
  });

  test("statuses read as the sidebar slot's", () => {
    const rows = canvasConversationMenu([
      summary({ conversationId: "w", phase: "waiting" }),
      summary({ conversationId: "r", phase: "running", lastActivityAt: at(1) }),
      summary({ conversationId: "u", unseen: true, lastActivityAt: at(2) }),
    ], billing, null, NOW);
    expect(rows.map(r => r.status?.label ?? null)).toEqual(["Working", "Conversation finished — unread", "Needs your answer"]);
    expect(canvasConversationMenu([summary({ unseen: true })], billing, null, NOW, new Set(["c1"]))[0]!.status).toBeNull();
  });

  // Both menus build their rows with menuItem, so Delete reads the same in each.
  test("each row says whether it can be deleted, as the Overview's menu does", () => {
    const list = [
      summary({ conversationId: "w", phase: "waiting", working: true, lastActivityAt: at(1) }),
      summary({ conversationId: "r", phase: "running", working: true, lastActivityAt: at(2) }),
      summary({ conversationId: "e", lastActivityAt: at(3) }),
    ];
    const rows = canvasConversationMenu(list, billing, null, NOW);
    expect(rows.map(r => [r.conversationId, r.deletable])).toEqual([
      ["w", { available: false, reason: "The agent is waiting for your answer." }],
      ["r", { available: false, reason: "The agent is working on this conversation." }],
      ["e", { available: true }],
    ]);
    const { canvas: _w, ...asProject } = list[0]!;
    expect(projectConversationMenu([asProject], NOW)[0]!.deletable).toEqual(rows[0]!.deletable);
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

  test("not an end already seen", () => {
    expect(shouldMarkSeen(true, true, "cur", current, { end: 4, seen: 4 })).toBe(false);
    expect(shouldMarkSeen(true, true, "cur", current, { end: null, seen: 0 })).toBe(false);
    expect(shouldMarkSeen(true, true, "cur", undefined, seq)).toBe(false);
  });
});

describe("newConversationMode", () => {
  const target = { available: true as const, runtime: "codex" as const };
  test("a terminal session is offered and continued by default; the person may start a new conversation", () => {
    expect(newConversationMode(target, {})).toEqual({ mode: "resume", offer: "codex", pending: false });
    expect(newConversationMode(target, { choice: "new" })).toEqual({ mode: "new", offer: "codex", pending: false });
  });

  test("without a session, only a new conversation", () => {
    expect(newConversationMode({ available: false, reason: "no_record" }, {})).toEqual({ mode: "new", offer: null, pending: false });
    expect(newConversationMode({ error: "project_not_open" }, { choice: "resume" })).toEqual({ mode: "new", offer: null, pending: false });
  });

  test("a terminal session Doan could not check is not offered, and the line says why", () => {
    expect(newConversationMode({ available: false, reason: "session_unverified", runtime: "claude" }, {})).toEqual({
      mode: "new", offer: null, pending: false,
      reason: "Can’t continue the Claude Code session from your terminal: Doan couldn’t check whether it’s still in use. Sending starts a new conversation.",
    });
    // Other refusals stay silent: a reason only when the session may still be in use.
    expect(newConversationMode({ available: false, reason: "session_unavailable" }, {})).toEqual({ mode: "new", offer: null, pending: false });
  });

  test("before the resume target answers, a new conversation shows and Send waits", () => {
    expect(newConversationMode(undefined, {})).toEqual({ mode: "new", offer: null, pending: true });
  });

  test("a refused terminal session's Start a new conversation switches to new", () => {
    expect(newConversationMode(target, { choice: "new" }).mode).toBe("new");
  });

  test("a conversation working on the canvas never holds a new one: they run side by side", () => {
    expect(newConversationMode(target, {})).not.toHaveProperty("busy");
  });
});

describe("canvasConversationError", () => {
  const NEW: DockedMode = { kind: "new", root: "/code/acme", canvas: billing };
  const EXISTING: DockedMode = { kind: "existing", conversationId: "cur", provider: "claude" };
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

  test("a send refused while a terminal holds the session says so", () => {
    expect(canvasConversationError("session_in_use", EXISTING, "claude", "acme-web")).toEqual({ kind: "notice", text: "Claude Code is still using this session. Try again when it finishes.", retry: false, startNew: false });
  });
  test("a Cursor send refused on its usage limit says the conversation can't continue, without an action", () => {
    expect(canvasConversationError("rate_limited", { ...EXISTING, provider: "cursor" }, "cursor", "acme-web")).toEqual({ kind: "notice", text: "Cursor reached a usage limit, so this conversation can’t continue. Start a new conversation after the limit resets.", retry: false, startNew: false });
  });

  test("a send to a conversation of another account or an earlier sign-in offers a new conversation, not Retry", () => {
    const other = "This conversation’s session belongs to another Claude Code account, so it can’t continue here. To continue it, sign out, then sign in to that account in Settings > Agents.";
    const earlier = "This conversation’s session belongs to an earlier Claude Code sign-in, so it can’t continue here.";
    for (const mode of [EXISTING]) {
      expect(canvasConversationError("account_changed", mode, "claude", "acme-web")).toEqual({ kind: "notice", text: other, retry: false, startNew: true });
      expect(canvasConversationError("sign_in_changed", mode, "claude", "acme-web")).toEqual({ kind: "notice", text: earlier, retry: false, startNew: true });
    }
  });

  test("a send to a conversation of another organization of the account offers a new conversation, not Retry", () => {
    const text = "This conversation’s session belongs to another organization of your Claude Code account, so it can’t continue here. To continue it, sign in to the organization this conversation started in.";
    for (const mode of [EXISTING]) expect(canvasConversationError("workspace_changed", mode, "claude", "acme-web")).toEqual({ kind: "notice", text, retry: false, startNew: true });
  });


  test("a canvas not in the list, or sharing its id, blocks the composer with the draft kept", () => {
    const unlisted = { kind: "blocked", text: "This canvas isn’t listed in acme-web, so its conversation can’t continue." };
    for (const mode of [NEW, EXISTING, RESUME]) expect(canvasConversationError("canvas_not_found", mode, "claude", "acme-web")).toEqual(unlisted);
    expect(canvasConversationError("canvas_duplicate", EXISTING, "claude", "acme-web")).toEqual({ kind: "blocked", text: DUPLICATE_CANVAS_TEXT });
  });

  test("a project problem and no ready agent block the composer with their reason", () => {
    expect(canvasConversationError("project_not_open", EXISTING, "claude", "acme-web")).toEqual({ kind: "blocked", text: "acme-web isn’t available. Fix it from its menu in the sidebar." });
    expect(canvasConversationError("no_agent", NEW, "claude", "acme-web")).toEqual({
      kind: "blocked", text: "No agent is ready to run.", action: { label: "Sign in to an agent", target: { section: "agents" } },
    });
  });

  test("a moved attachment marks its chips; too many files ask to remove some; nothing to queue behind sends instead", () => {
    for (const mode of [NEW, EXISTING, RESUME]) {
      expect(canvasConversationError("attachment_missing", mode, "claude", "acme-web", ["a1", "a2"])).toEqual({ kind: "attachments", missing: ["a1", "a2"] });
      expect(canvasConversationError("not_running", mode, "claude", "acme-web")).toEqual({ kind: "resend" });
      expect(canvasConversationError("attachment_limit", mode, "claude", "acme-web")).toEqual({
        kind: "notice", text: "Only 10 attachments can be added to a message. Remove some, then send again.", retry: false, startNew: false,
      });
    }
    expect(canvasConversationError("attachment_missing", EXISTING, "claude", "acme-web")).toEqual({ kind: "attachments", missing: [] });
  });

  test.each([
    ["session_in_use", "Couldn’t continue the terminal session: Codex is still using it."],
    ["no_session", "Couldn’t continue the terminal session: it’s no longer available."],
    ["session_unavailable", "Couldn’t continue the terminal session: it isn’t available right now."],
    ["not_logged_in", "Couldn’t continue the terminal session: sign in to Codex in Settings > Agents, then send again."],
    ["cli_missing", "Couldn’t continue the terminal session: Codex isn’t installed on this Mac."],
    ["runtime_unsupported", "Couldn’t continue the terminal session: Doan doesn’t support this version of Codex."],
    ["process_exited", "Couldn’t continue the terminal session: Codex stopped before it could continue."],
    ["rate_limited", "Couldn’t continue the terminal session: Codex reached a usage limit."],
    ["busy", "Couldn’t continue the terminal session: Codex is finishing a previous run."],
    ["unknown", "Couldn’t continue the terminal session."],
    ["constructor", "Couldn’t continue the terminal session."],
  ])("every terminal session refusal (%s) offers a new conversation, never another agent", (code, text) => {
    const view = canvasConversationError(code, RESUME, "codex", "acme-web");
    expect(view).toEqual({ kind: "notice", text, retry: false, startNew: true });
    expect((view as { text: string }).text).not.toContain("Choose another agent");
  });
});

// Identified sessions span roots; an anonymous one matches nothing.
describe("resumeHeld", () => {
  const reply = { available: true as const, runtime: "codex" as const, session: "s1" };
  const item = (patch: Partial<WorkItem>): WorkItem => ({ session: "s1", provider: "codex", root: "/w/a", path: ".doan/canvases/a.html", touched: 0, turn: "none:t", ...patch });
  test("the session working in a terminal holds the choice, whatever root or canvas it works on", () => {
    expect(resumeHeld(reply, [item({})])).toBe(true);
    expect(resumeHeld(reply, [item({ root: "/w/other", path: ".doan/ds/b.html" })])).toBe(true);
  });
  test("another session, another provider or an anonymous session does not hold it", () => {
    expect(resumeHeld(reply, [item({ session: "s2" }), item({ provider: "claude" }), item({ touched: 0, turn: "none:t", session: null, provider: null })])).toBe(false);
  });
  test("the choice comes back when the session leaves the list", () => {
    expect(resumeHeld(reply, [])).toBe(false);
  });
  // Main names a session a live terminal process holds (session_in_use), so it holds while it works.
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

test("a start refused by the usage limit names the reset time in the canvas panel", () => {
  const NEW: DockedMode = { kind: "new", root: "/code/acme", canvas: billing };
  expect(canvasConversationError("rate_limited", NEW, "claude", "acme-web", [], "at 3:00\u202fPM"))
    .toEqual({ kind: "notice", text: "Claude Code reached a usage limit. Send again after it resets at 3:00\u202fPM.", retry: false, startNew: false });
});

describe("pickShownConversation", () => {
  const a = summary({ conversationId: "a", lastActivityAt: at(30) });
  const b = summary({ conversationId: "b", lastActivityAt: at(10) });
  const pick = (patch: Partial<ShownInput>) =>
    pickShownConversation({ list: [a, b, other, project], canvas: billing, requested: null, shown: undefined, remembered: null, ...patch });

  test("waits for the first list read; a failed first read shows a new conversation the composer can still start", () => {
    expect(pick({ list: "loading" })).toEqual({ kind: "wait" });
    expect(pick({ list: "error" })).toEqual({ kind: "new", listError: true });
  });

  test("waits for the ui-state read before choosing the default, but not for a request", () => {
    expect(pick({ remembered: undefined })).toEqual({ kind: "wait" });
    expect(pick({ remembered: undefined, requested: "a" })).toEqual({ kind: "conversation", conversationId: "a" });
  });

  test("the requested conversation first; one not listed yet is read again; another canvas's falls back to the default", () => {
    expect(pick({ requested: "a", shown: "b" })).toEqual({ kind: "conversation", conversationId: "a" });
    expect(pick({ requested: "late" })).toEqual({ kind: "reread", conversationId: "late" });
    expect(pick({ requested: "elsewhere" })).toEqual({ kind: "conversation", conversationId: "b" });
    expect(pick({ requested: "proj" })).toEqual({ kind: "conversation", conversationId: "b" });
  });

  test("a conversation waiting for an answer comes before the remembered and the most recent one", () => {
    const waiting = summary({ conversationId: "w", phase: "waiting", lastActivityAt: at(50) });
    expect(pick({ list: [a, b, waiting], remembered: "a" })).toEqual({ kind: "conversation", conversationId: "w" });
  });

  test("of several waiting, the one that started waiting first", () => {
    const w1 = summary({ conversationId: "w1", phase: "waiting", waitingSince: at(3), lastActivityAt: at(3) });
    const w2 = summary({ conversationId: "w2", phase: "waiting", waitingSince: at(8), lastActivityAt: at(8) });
    const w3 = summary({ conversationId: "w3", phase: "waiting", waitingSince: at(8), lastActivityAt: at(8) });
    expect(pick({ list: [w1, w3, w2, a] })).toEqual({ kind: "conversation", conversationId: "w3" });
  });

  test("of several waiting, the order main says they started waiting in, whatever output came later", () => {
    const w1 = summary({ conversationId: "w1", phase: "waiting", waitingSince: at(9), lastActivityAt: at(0) });
    const w2 = summary({ conversationId: "w2", phase: "waiting", waitingSince: at(5), lastActivityAt: at(5) });
    expect(pick({ list: [w2, w1, a] })).toEqual({ kind: "conversation", conversationId: "w1" });
    expect(earliestWaiting([w2, { ...w1, waitingSince: at(5) }])?.conversationId).toBe("w2");
  });

  test("the remembered conversation, else the most recent activity", () => {
    expect(pick({ remembered: "a" })).toEqual({ kind: "conversation", conversationId: "a" });
    expect(pick({ remembered: null })).toEqual({ kind: "conversation", conversationId: "b" });
    expect(pick({ remembered: "deleted" })).toEqual({ kind: "conversation", conversationId: "b" });
    expect(pick({ remembered: "elsewhere" })).toEqual({ kind: "conversation", conversationId: "b" });
  });

  test("a canvas with no conversation shows the new conversation state", () => {
    expect(pick({ list: [other, project] })).toEqual({ kind: "new", listError: false });
  });

  test("a list read again keeps what shows, also when another conversation starts waiting", () => {
    const waiting = summary({ conversationId: "w", phase: "waiting", lastActivityAt: at(0) });
    expect(pick({ list: [a, b, waiting], shown: "a" })).toEqual({ kind: "conversation", conversationId: "a" });
    expect(pick({ list: [a, b, waiting], shown: null })).toEqual({ kind: "new", listError: false });
  });

  test("while the list is read or failed, what shows stays", () => {
    expect(pick({ list: "loading", shown: "a" })).toEqual({ kind: "conversation", conversationId: "a" });
    expect(pick({ list: "error", shown: "a" })).toEqual({ kind: "conversation", conversationId: "a" });
    expect(pick({ list: "loading", shown: null })).toEqual({ kind: "new", listError: false });
    expect(pick({ list: "error", shown: null })).toEqual({ kind: "new", listError: true });
  });

  test("after the shown conversation is deleted, the next one by the same order, else the new conversation state", () => {
    const waiting = summary({ conversationId: "w", phase: "waiting", lastActivityAt: at(50) });
    expect(pick({ list: [b, waiting], shown: "a", remembered: "a" })).toEqual({ kind: "conversation", conversationId: "w" });
    expect(pick({ list: [a], shown: "b" })).toEqual({ kind: "conversation", conversationId: "a" });
    expect(pick({ list: [other], shown: "b" })).toEqual({ kind: "new", listError: false });
  });

  test("a canvas that left the project or shares its id with another blocks the panel, before anything else", () => {
    expect(pick({ blocked: "gone", requested: "a" })).toEqual({ kind: "blocked", reason: "gone" });
    expect(pick({ blocked: "duplicate", list: "loading" })).toEqual({ kind: "blocked", reason: "duplicate" });
  });

  test("a canvas without an id matches by path", () => {
    const bare = { path: ".doan/canvases/plain.html" };
    const c = summary({ conversationId: "p", canvas: bare });
    expect(pickShownConversation({ list: [a, c], canvas: bare, requested: null, shown: undefined, remembered: null })).toEqual({ kind: "conversation", conversationId: "p" });
  });
});

describe("sidebarRowRequest", () => {
  const SEEN = new Set<string>();
  const home = (patch: Partial<ConversationSummary>) => summary({ fromHome: true, ...patch });

  test("a slot that opens the panel asks for the conversation the slot stands for", () => {
    const list = [home({ conversationId: "r", phase: "running" }), home({ conversationId: "w", phase: "waiting" }), home({ conversationId: "u", unseen: true })];
    expect(sidebarRowRequest(list, billing, "permission", SEEN)).toBe("w");
    expect(sidebarRowRequest(list, billing, "unseen", SEEN)).toBe("u");
  });

  test("a working, scheduled or empty slot asks for nothing, so the shared order picks", () => {
    const list = [home({ conversationId: "r", phase: "running" })];
    expect(sidebarRowRequest(list, billing, "working", SEEN)).toBeNull();
    expect(sidebarRowRequest(list, billing, "scheduled", SEEN)).toBeNull();
    expect(sidebarRowRequest(list, billing, null, SEEN)).toBeNull();
  });

  test("the slot's own rule: the first listed of its kind, a seen ending not unseen", () => {
    const list = [home({ conversationId: "u1", unseen: true }), home({ conversationId: "u2", unseen: true, lastActivityAt: at(0) })];
    expect(sidebarRowRequest(list, billing, "unseen", SEEN)).toBe("u1");
    expect(sidebarRowRequest(list, billing, "unseen", new Set(["u1"]))).toBe("u2");
    expect(sidebarRowRequest(list, billing, "permission", SEEN)).toBeNull();
    expect(sidebarRowRequest(list, { path: ".doan/canvases/home.html", id: "home" }, "unseen", SEEN)).toBeNull();
  });

  // The canvas row's slot counts every conversation bound to the canvas, panel-started ones included, so the row's
  // press opens the conversation whose signal it shows.
  test("a conversation started in the canvas panel answers its row's slot too", () => {
    const list = [summary({ conversationId: "x", phase: "waiting" }), summary({ conversationId: "y", unseen: true }), home({ conversationId: "h", phase: "waiting" })];
    expect(sidebarRowRequest(list, billing, "permission", SEEN)).toBe("x");
    expect(sidebarRowRequest(list, billing, "unseen", SEEN)).toBe("y");
  });
});

describe("titleMenuOrder", () => {
  const a = summary({ conversationId: "a", lastActivityAt: at(30) });
  const b = summary({ conversationId: "b", lastActivityAt: at(10) });
  test("this canvas's conversations by latest activity", () => {
    expect(titleMenuOrder([a, b, other, project], billing, null)).toEqual(["b", "a"]);
  });

  test("an open menu keeps its order; new conversations go at the end, gone ones leave", () => {
    const c = summary({ conversationId: "c", lastActivityAt: at(0) });
    const d = summary({ conversationId: "d", lastActivityAt: at(1) });
    expect(titleMenuOrder([{ ...a, lastActivityAt: at(0) }, b, c, d], billing, ["b", "a"])).toEqual(["b", "a", "c", "d"]);
    expect(titleMenuOrder([a, c], billing, ["b", "a"])).toEqual(["a", "c"]);
  });
});
