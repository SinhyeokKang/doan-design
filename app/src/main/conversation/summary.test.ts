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
  it("reports running and waiting from the live fold", () => {
    expect(conversationSummary(doan, { ok: true, events: history(...started, { type: "activity", kind: "read", summary: "Read a.html" }) }, live).phase).toBe("running");
    expect(conversationSummary(doan, { ok: true, events: history(...started, permission) }, live).phase).toBe("waiting");
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
describe("clampSeen", () => {
  it("cuts a seq past the last one and never goes back", () => {
    expect(clampSeen(10, 4, undefined)).toBe(4);
    expect(clampSeen(2, 4, 3)).toBe(3);
    expect(clampSeen(4, 4, 3)).toBe(4);
    expect(clampSeen(0, 0, undefined)).toBe(0);
  });
});
