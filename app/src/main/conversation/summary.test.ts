import { describe, expect, it } from "vitest";
import { clampSeen, conversationSummary, PREVIEW_CHARS } from "./summary";
import type { ConversationMetadata } from "./store";
import type { ConversationEvent, EventPayload } from "./types";
const at = (seq: number) => `2026-10-31T00:00:${String(seq).padStart(2, "0")}.000Z`;
function history(...payloads: (EventPayload | [EventPayload, string])[]): ConversationEvent[] {
  return payloads.map((p, i) => { const [body, turnId] = Array.isArray(p) ? p : [p, "t1"]; return { ...body, v: 1, conversationId: "c", seq: i + 1, turnId, at: at(i + 1) }; });
}
const doan: ConversationMetadata = { conversationId: "c", root: "/repo", title: "Make a pricing page", state: "current", model: "opus", effort: "high", fromHome: true, seenSeq: 0,
  owner: { kind: "doan", provider: "claude", connectionId: "conn", accountId: "acct", workspaceId: "org", profile: "claude" },
  session: { runtime: "claude", origin: "newDesign", sessionId: "s", configDir: "/profiles/claude", cwd: "/repo" } };
const legacy: ConversationMetadata = { conversationId: "c", root: "/repo", canvas: { path: ".doan/canvases/a.html", id: "a" }, title: "Fix the header", state: "archived",
  owner: { kind: "legacy-external" }, session: { runtime: "codex", origin: "resumed", sessionId: "s", configDir: "/home/.codex", cwd: "/repo" } };
const started: EventPayload[] = [{ type: "user.message", text: "Make a pricing page", anchors: [] }, { type: "turn.started" }];
const permission: EventPayload = { type: "permission.request", requestId: "r", tool: "Bash", summary: "Run npm test", options: [{ id: "allow", label: "Allow", kind: "allow" }] };
const live = { live: true, queued: 0, working: false };
const restarted = { live: false, queued: 0, working: false };
describe("conversationSummary", () => {
  it("summarizes a doan conversation without leaking account details", () => {
    const s = conversationSummary(doan, { ok: true, events: history(...started, { type: "message.done", messageId: "m", text: "Done." }, { type: "turn.done" }) }, { live: true, queued: 2, working: true });
    expect(s).toEqual({ conversationId: "c", title: "Make a pricing page", state: "current", owner: "doan", provider: "claude", model: "opus", effort: "high", fromHome: true,
      phase: "ended", unseen: true, queued: 2, working: true, lastActivityAt: at(4), preview: "Done." });
  });
  it("includes a legacy external conversation with its canvas and no choice", () => {
    const s = conversationSummary(legacy, { ok: true, events: history(...started, { type: "turn.done" }) }, restarted);
    expect(s).toMatchObject({ owner: "legacy-external", provider: "codex", canvas: { path: ".doan/canvases/a.html", id: "a" }, state: "archived", fromHome: false, phase: "ended" });
    expect(s).not.toHaveProperty("model");
  });
  it("carries the conversation's chosen permission mode, and none for Default", () => {
    const events = { ok: true as const, events: history(...started, { type: "turn.done" }) };
    expect(conversationSummary({ ...doan, permissionMode: "plan" }, events, live)).toMatchObject({ permissionMode: "plan" });
    expect(conversationSummary(doan, events, live)).not.toHaveProperty("permissionMode");
    expect(conversationSummary({ ...doan, permissionMode: "bypass" }, { ok: false }, live)).toMatchObject({ permissionMode: "bypass", readError: true });
  });
  it("reports running and waiting from the live fold", () => {
    expect(conversationSummary(doan, { ok: true, events: history(...started, { type: "activity", kind: "read", summary: "Read a.html" }) }, live).phase).toBe("running");
    expect(conversationSummary(doan, { ok: true, events: history(...started, permission) }, live).phase).toBe("waiting");
    const asked: EventPayload = { type: "question.request", requestId: "q", questions: [{ id: "0", header: "Color", question: "Which color?", options: [], multiSelect: false, other: true }] };
    expect(conversationSummary(doan, { ok: true, events: history(...started, asked) }, live).phase).toBe("waiting");
    expect(conversationSummary(doan, { ok: true, events: history(...started, asked, { type: "question.resolved", requestId: "q", outcome: "answered" }) }, live).phase).toBe("running");
    expect(conversationSummary(doan, { ok: true, events: history(...started, asked) }, restarted).phase).toBe("ended");
  });
  it("folds an unfinished turn after a restart into an unseen end", () => {
    const s = conversationSummary(doan, { ok: true, events: history(...started, permission) }, restarted);
    expect(s).toMatchObject({ phase: "ended", unseen: true });
  });
  it("treats a missing seenSeq as seen and a seen last seq as seen", () => {
    const { seenSeq: _seen, ...unmarked } = doan;
    const events = history(...started, { type: "turn.done" });
    expect(conversationSummary(unmarked, { ok: true, events }, restarted).unseen).toBe(false);
    expect(conversationSummary({ ...doan, seenSeq: 3 }, { ok: true, events }, restarted).unseen).toBe(false);
    expect(conversationSummary({ ...doan, seenSeq: 2 }, { ok: true, events }, restarted).unseen).toBe(true);
    expect(conversationSummary({ ...doan, seenSeq: 0 }, { ok: true, events: history(...started) }, live).unseen).toBe(false);
  });
  it("does not count binding, archiving or restoring markers as something to see", () => {
    const seenEnd = history(...started, { type: "turn.done" });
    const bound = history(...started, { type: "turn.done" }, { type: "conversation.bound", canvas: { path: ".doan/canvases/a.html", id: "a" } });
    expect(conversationSummary({ ...doan, seenSeq: 3 }, { ok: true, events: seenEnd }, restarted).unseen).toBe(false);
    expect(conversationSummary({ ...doan, seenSeq: 3 }, { ok: true, events: bound }, restarted).unseen).toBe(false);
    expect(conversationSummary({ ...doan, seenSeq: 2 }, { ok: true, events: bound }, restarted).unseen).toBe(true);
  });
  it("never counts an archived conversation as unseen, even one replaced while it ran", () => {
    const replaced = history(...started, { type: "interrupted", reason: "user" }, { type: "conversation.archived" });
    expect(conversationSummary({ ...doan, state: "archived", seenSeq: 0 }, { ok: true, events: replaced }, restarted).unseen).toBe(false);
  });
  it("returns only a read error for an unreadable history", () => {
    expect(conversationSummary(doan, { ok: false }, live)).toMatchObject({ conversationId: "c", readError: true, phase: "ended", unseen: false, preview: "", lastActivityAt: "" });
  });
  describe("preview", () => {
    const preview = (events: ConversationEvent[], state = live) => conversationSummary(doan, { ok: true, events }, state).preview;
    it("asks for the pending permission while waiting", () => {
      expect(preview(history(...started, permission))).toBe("Needs your answer: Run npm test");
    });
    it("asks with the first question of the newest unanswered request, whatever its kind", () => {
      const asked: EventPayload = { type: "question.request", requestId: "q", questions: [{ id: "0", header: "Color", question: "Which\ncolor?", options: [], multiSelect: false, other: true }, { id: "1", header: "Size", question: "Which size?", options: [], multiSelect: false, other: true }] };
      expect(preview(history(...started, asked))).toBe("Needs your answer: Which color?");
      expect(preview(history(...started, permission, asked))).toBe("Needs your answer: Which color?");
      expect(preview(history(...started, asked, permission))).toBe("Needs your answer: Run npm test");
      expect(preview(history(...started, permission, asked, { type: "question.resolved", requestId: "q", outcome: "skipped" }))).toBe("Needs your answer: Run npm test");
      expect(preview(history(...started, asked, permission, { type: "permission.resolved", requestId: "r", optionId: "allow" }))).toBe("Needs your answer: Which color?");
    });
    it("shows the last activity of the running turn and never a command", () => {
      expect(preview(history(...started, { type: "activity", kind: "read", summary: "Read a.html" }, { type: "activity", kind: "edit", path: "a.html", summary: "Edited a.html" }))).toBe("Edited a.html");
      expect(preview(history(...started, { type: "activity", kind: "command", summary: "rm -rf /tmp/x" }))).toBe("Running a command");
    });
    it("strips Markdown from the last agent message and keeps raw HTML as text", () => {
      const text = "# Pricing\n\n**Three** tiers, see [the canvas](https://example.com) and `a.html`:\n\n- one\n  - two\n1. three\n\n> quoted\n\n```css\n.a { color: red }\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<b>raw</b> snake_case_name ![logo](x.png)";
      expect(preview(history(...started, { type: "message.done", messageId: "m", text }, { type: "turn.done" }))).toBe("Pricing Three tiers, see the canvas and a.html: one two three quoted .a { color: red } a b 1 2 <b>raw</b> snake_case_name logo");
    });
    it("collapses whitespace and caps the length", () => {
      const text = `${"word ".repeat(100)}\n\nend`;
      const shown = preview(history(...started, { type: "message.done", messageId: "m", text }, { type: "turn.done" }));
      expect([...shown].length).toBeLessThanOrEqual(PREVIEW_CHARS); expect([...shown].length).toBeGreaterThan(PREVIEW_CHARS - 3);
      expect(shown.endsWith("…")).toBe(true); expect(shown).not.toMatch(/\s{2}/);
    });
    it("reads only the start of a long hostile message", () => {
      const text = "a **b ".repeat(200_000);
      const began = performance.now();
      const shown = preview(history(...started, { type: "message.done", messageId: "m", text }, { type: "turn.done" }));
      expect(performance.now() - began).toBeLessThan(2_000);
      expect([...shown].length).toBeLessThanOrEqual(PREVIEW_CHARS); expect(shown.startsWith("a ")).toBe(true);
    });
    it("is empty without an agent message", () => {
      expect(preview(history(...started, { type: "turn.failed", code: "unknown" }))).toBe("");
    });
  });
});
describe("suggestion and returned draft", () => {
  const ended = { ok: true as const, events: history(...started, { type: "message.done", messageId: "m", text: "Done." }, { type: "turn.done" }) };
  const shown = { ...live, returned: false, suggestion: "Run the tests" };
  it("carries the suggestion only for a current, ended conversation that is not working, has nothing queued and no returned draft", () => {
    expect(conversationSummary(doan, ended, shown)).toMatchObject({ suggestion: "Run the tests" });
    expect(conversationSummary(doan, ended, shown)).not.toHaveProperty("returnedDraft");
    const hidden: [string, ReturnType<typeof conversationSummary>][] = [
      ["archived", conversationSummary({ ...doan, state: "archived" }, ended, shown)],
      ["running", conversationSummary(doan, { ok: true, events: history(...started, { type: "activity", kind: "read", summary: "Read a.html" }) }, shown)],
      ["waiting", conversationSummary(doan, { ok: true, events: history(...started, permission) }, shown)],
      ["working", conversationSummary(doan, ended, { ...shown, working: true })],
      ["queued", conversationSummary(doan, ended, { ...shown, queued: 1 })],
      ["returned draft", conversationSummary(doan, ended, { ...shown, returned: true })],
      ["read error", conversationSummary(doan, { ok: false }, shown)],
    ];
    for (const [name, summary] of hidden) expect(summary, name).not.toHaveProperty("suggestion");
  });
  it("carries no suggestion when there is none", () => {
    expect(conversationSummary(doan, ended, { ...live, returned: false })).not.toHaveProperty("suggestion");
  });
  it("marks a returned draft, also on an unreadable history", () => {
    expect(conversationSummary(doan, ended, { ...live, returned: true })).toMatchObject({ returnedDraft: true });
    expect(conversationSummary(doan, { ok: false }, { ...live, returned: true })).toMatchObject({ returnedDraft: true, readError: true });
    expect(conversationSummary(doan, ended, { ...live, returned: false })).not.toHaveProperty("returnedDraft");
  });
});
describe("clampSeen", () => {
  it("cuts a seq past the last one and never goes back", () => {
    expect(clampSeen(10, 4, undefined)).toBe(4);
    expect(clampSeen(2, 4, 3)).toBe(3);
    expect(clampSeen(4, 4, 3)).toBe(4);
    expect(clampSeen(0, 0, undefined)).toBe(0);
  });
});

describe("a turn with two user.message events (queue-send-now)", () => {
  const pushed: EventPayload = { type: "user.message", text: "pushed in", anchors: [] };
  it("keeps the title and shows the turn as running with its activity as the preview", () => {
    const s = conversationSummary(doan, { ok: true, events: history(...started, pushed, { type: "activity", kind: "read", summary: "Reading index.html" }) }, live);
    expect(s).toMatchObject({ title: "Make a pricing page", phase: "running", unseen: false, preview: "Reading index.html" });
  });
  it("ends as one unseen turn whose preview is the last answer", () => {
    const s = conversationSummary(doan, { ok: true, events: history(...started, pushed, { type: "message.done", messageId: "m", text: "Both done." }, { type: "turn.done" }) }, live);
    expect(s).toMatchObject({ title: "Make a pricing page", phase: "ended", unseen: true, preview: "Both done." });
  });
});
