import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { codeToCopy, ConversationThread, entryTimes, FADE_MS, fadeOpacity, flushesReply, replyStart, revealFrame, revealMode, revealStart, type ConversationThreadProps, type RevealState } from "./ConversationThread";
import { TooltipProvider } from "./components/ui/tooltip";
import type { ThreadItem } from "./threadItems";
import { FINISH_MS, MAX_LAG_MS } from "./threadMotion";

const noop = () => {};
const props = (items: ConversationThreadProps["items"], patch: Partial<ConversationThreadProps> = {}): ConversationThreadProps => ({
  items, conversationId: "c1", provider: "claude", project: "doan-design", liveAfter: 0, canvasListed: () => true, visibility: { onWindowVisible: () => () => {} }, now: 0,
  onAnswer: noop, onStop: noop, onEditAndResend: noop, onSignIn: noop, onRetry: noop, onOpenCanvas: noop, onOpenHandoff: noop, onOpenLink: noop, onCopy: async () => true, ...patch,
});
const html = (items: ConversationThreadProps["items"], patch: Partial<ConversationThreadProps> = {}) => renderToStaticMarkup(<TooltipProvider><ConversationThread {...props(items, patch)} /></TooltipProvider>);
const user = (key: string, seq: number | null, text: string, sending = false): ThreadItem =>
  ({ kind: "user", key, seq, parts: [{ text }], anchors: [], preset: null, attachments: [], ...(sending ? { sending: true as const } : {}) });
const css = readFileSync(new URL("styles.css", import.meta.url), "utf8");

describe("entry", () => {
  test("only a message this window sent enters: not the history, a terminal's message or a handoff card", () => {
    const items: ThreadItem[] = [
      { kind: "handoffCard", key: "h1", seq: 1, origin: { kind: "handoff", conversationId: "c0" }, text: "Earlier work", at: "2026-11-25T00:00:00Z" },
      user("u2", 2, "Older"),
      { kind: "agent", key: "m3", messageId: "m3", text: "Done.", streaming: false },
      user("u4", 4, "Make the action say Add a card"),
      user("u5", 5, "From the terminal"),
    ];
    const out = html(items, { localSends: [{ text: "Make the action say Add a card", after: 3 }] });
    expect(out.match(/class="msg-user thread-enter"/g)).toHaveLength(1);
    expect(out).toMatch(/<div class="msg-user thread-enter"><div class="bubble">Make the action say Add a card/);
    expect(html(items)).not.toContain("thread-enter");
  });

  test("the history's message that replaces an entering Send now or sending message carries on its entry, not a new one", () => {
    const sending = user("qs1", null, "Use the 12 px gap", true);
    const history = user("u5", 5, "Use the 12 px gap");
    const before = [user("u1", 1, "Older")];
    const first = entryTimes(before, [...before, sending], [], new Map(), 100);
    expect([...first]).toEqual([["qs1", 100]]);
    // Both drawn for a moment, then the history's alone: it takes the Sending message's start.
    const both = entryTimes([...before, sending], [...before, history, sending], [{ text: "Use the 12 px gap", after: 4 }], first, 133);
    expect(both.get("u5")).toBe(100);
    const after = entryTimes([...before, history, sending], [...before, history], [], both, 150);
    expect(after.get("u5")).toBe(100);
    // A message from elsewhere with the same words never takes it.
    expect(entryTimes([...before], [...before, user("u6", 6, "Use the 12 px gap")], [], new Map([["qs1", 100]]), 200).has("u6")).toBe(false);
  });

  test("the rise is translate and opacity over time-thread-enter with ease-enter; reduced motion fades in place", () => {
    expect(css).toMatch(/@keyframes thread-enter \{ from \{ opacity: 0; transform: translateY\(var\(--space-4\)\); \} \}/);
    expect(css).toContain(".conversation-thread .msg-user.thread-enter { animation: thread-enter var(--time-thread-enter) var(--ease-enter) both; }");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.conversation-thread \.msg-user\.thread-enter \{ animation-name: thread-enter-fade; animation-duration: var\(--time-state\); animation-timing-function: var\(--ease-state\); \} \}/);
    expect(css).toContain("@keyframes thread-enter-fade { from { opacity: 0; } }");
  });
});

// Frames 16 ms apart from `at`, while `text` streams in as `chunks` (length, arrival ms).
function play(text: string, chunks: [number, number][], frames: number, mode = (_: number) => "streaming" as const as "streaming" | "done" | "flush", start = revealStart(0)) {
  let state: RevealState = start;
  const log: { now: number; shown: number; received: number }[] = [];
  for (let f = 1; f <= frames; f++) {
    const now = f * 16;
    const received = Math.max(0, ...chunks.filter(([, at]) => at <= now).map(([length]) => length));
    state = revealFrame(state, text.slice(0, received), mode(now), now, false);
    log.push({ now, shown: state.shown, received });
  }
  return { state, log };
}
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("reveal", () => {
  test("a reply mounted mid-stream starts at the text it already has", () => {
    expect(revealStart(42).shown).toBe(42);
    const out = html([{ kind: "agent", key: "m1", messageId: "m1", text: "Half of the reply", streaming: true }]);
    expect(out).toContain("Half of the reply");
  });

  test("a whole reply in one chunk catches up within MAX_LAG_MS, never ahead of what arrived", () => {
    const text = words(1500);
    const { log } = play(text, [[text.length, 16]], 40);
    for (const frame of log) expect(frame.shown).toBeLessThanOrEqual(frame.received);
    expect(log.find(frame => frame.now === 16)!.shown).toBeLessThan(text.length);
    expect(log.find(frame => frame.now >= 16 + MAX_LAG_MS)!.shown).toBe(text.length);
  });

  test("small chunks show as they come, cut at word ends", () => {
    const text = "One two three four five";
    const { log } = play(text, [[4, 16], [8, 32], [14, 48]], 40);
    for (const frame of log) if (frame.shown > 0 && frame.shown < text.length) expect(text[frame.shown - 1]).toMatch(/\s/);
    expect(log.at(-1)!.shown).toBe(14);
  });

  test("message.done finishes the tail within FINISH_MS; a flush shows it at once", () => {
    const text = words(400);
    const done = play(text, [[text.length, 16]], 12, now => now >= 32 ? "done" : "streaming");
    expect(done.log.find(frame => frame.now >= 32 + FINISH_MS)!.shown).toBe(text.length);
    const flushed = play(text, [[text.length, 16]], 3, now => now >= 48 ? "flush" : "streaming");
    expect(flushed.log.at(-1)!.shown).toBe(text.length);
  });

  test("a window coming back after hidden frames shows what arrived meanwhile", () => {
    const text = words(300);
    let state = revealFrame(revealStart(0), text, "streaming", 16, false);
    state = revealFrame(state, text, "streaming", 16 + 5000, false);
    expect(state.shown).toBe(text.length);
  });

  test("turning reduced motion on mid-stream shows everything at the next frame, with no fade", () => {
    const text = words(300);
    let state = revealFrame(revealStart(0), text, "streaming", 16, false);
    expect(state.shown).toBeLessThan(text.length);
    state = revealFrame(state, text, "streaming", 32, true);
    expect(state.shown).toBe(text.length);
    expect(state.runs).toEqual([]);
  });

  test("each revealed run fades by its own age; a re-render at the same time gives the same opacity", () => {
    const text = words(300);
    const state = revealFrame(revealStart(0), text, "streaming", 16, false);
    expect(state.runs).toEqual([{ from: 0, to: state.shown, at: 16 }]);
    expect(fadeOpacity(0)).toBe(0);
    expect(fadeOpacity(FADE_MS / 2)).toBeCloseTo(1 - 0.5 ** 3);
    expect(fadeOpacity(FADE_MS)).toBe(1);
    expect(fadeOpacity(200)).toBe(fadeOpacity(200));
    // The fade runs over --time-thread-enter.
    expect(readFileSync(new URL("tokens.css", import.meta.url), "utf8")).toContain(`--time-thread-enter: ${FADE_MS}ms;`);
  });

  test("a stop, a failure, the turn's end or an item after the reply flushes it; message.done finishes it", () => {
    expect(revealMode(true, false)).toBe("streaming");
    expect(revealMode(false, false)).toBe("done");
    expect(revealMode(true, true)).toBe("flush");
    expect(revealMode(false, true)).toBe("flush");
  });

  test("a remount starts at the text the reply has; a reply that first appears while the thread is open starts at 0", () => {
    const reply: ThreadItem = { kind: "agent", key: "m2", messageId: "m2", text: "Half of it", streaming: true };
    // Opening, a folded panel unfolding, a switch back: nothing drawn before.
    expect(replyStart([], reply)).toBe(10);
    // Drawn in the previous render already (a history read again keeps the key).
    expect(replyStart([user("u1", 1, "Go"), reply], reply)).toBe(10);
    // New while the thread is open.
    expect(replyStart([user("u1", 1, "Go")], reply)).toBe(0);
  });

  test("an item after the reply, a notice under the thread or a Stop flushes it; the last reply alone does not", () => {
    const reply: ThreadItem = { kind: "agent", key: "m2", messageId: "m2", text: "Half", streaming: true };
    const drawn = [user("u1", 1, "Go"), reply];
    expect(flushesReply(reply, drawn, { stopping: false, notice: false })).toBe(false);
    expect(flushesReply(reply, [...drawn, { kind: "fast", key: "f3", seq: 3, text: "Fast was off", turnedOff: false }], { stopping: false, notice: false })).toBe(true);
    expect(flushesReply(reply, drawn, { stopping: false, notice: true })).toBe(true);
    expect(flushesReply(reply, drawn, { stopping: true, notice: false })).toBe(true);
  });

  test("a stop flushes the reply in the render it shows", () => {
    const text = "I changed the empty state in Payment. The action now reads Add a card.";
    const out = html([user("u1", 1, "Go"), { kind: "agent", key: "m2", messageId: "m2", text, streaming: true }], { stopping: true });
    expect(out).toContain(text);
  });
});

describe("code Copy", () => {
  test("copies the block's whole received code, not only the lines shown", () => {
    const full = "Here:\n\n```ts\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```\n\nDone.";
    expect(codeToCopy(full, full.indexOf("```"))).toBe("const a = 1;\nconst b = 2;\nconst c = 3;");
    // Still open: everything received so far.
    const open = "Here:\n\n~~~\nline 1\nline 2\n";
    expect(codeToCopy(open, open.indexOf("~~~"))).toBe("line 1\nline 2");
    expect(codeToCopy("    indented", 0)).toBeNull();
  });
});

describe("follow", () => {
  test("the thread's scroller has no scroll anchoring, which would move a followed view as a reply grows", () => {
    expect(css).toContain(".conversation-thread .thread-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-anchor: none; }");
  });

  // The popover overlays the scroller's bottom; its height comes back as the end inset (--ap-inset, set by the follow's
  // observer), so the last item clears it and Jump to latest sits above it.
  test("the end inset pads the thread's end and lifts Jump to latest above the popover", () => {
    expect(css).toContain(".doan-conv-panel .thread-scroll { padding: var(--space-2) var(--space-4) calc(var(--space-8) + var(--ap-inset, 0px)); }");
    expect(css).toContain(".ov-main .thread-scroll { padding: var(--space-2) var(--space-6) calc(var(--space-8) + var(--ap-inset, 0px)); }");
    expect(css).toMatch(/\.conversation-thread \.jump-latest \{[^}]*bottom: calc\(var\(--ap-inset, 0px\) \+ var\(--space-3\)\);/);
  });

  // Below the composer's / list (z 2), at the thread area's bottom, capped against the thread area.
  test("the popover sits on the thread area's bottom edge under a cap relative to it", () => {
    expect(css).toMatch(/\.conversation-thread \.ap \{ position: absolute; z-index: 1; inset-inline: 0; bottom: 0;[^}]*max-height: min\(70%, calc\(100% - var\(--space-10\)\)\);/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.conversation-thread \.ap \{ animation: none; \}/);
  });
});
