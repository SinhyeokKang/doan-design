import { describe, expect, test } from "vitest";
import type { ConversationEvent } from "../main/conversation/types";
import { threadItems, withSending } from "./threadItems";
import { FINISH_MS, FOLLOW_START, MAX_LAG_MS, TAU_MS, WHEEL_HOLD_MS, entering, followStep, nextFollow, revealBoundary, revealStep, type FollowState } from "./threadMotion";

const ROOT = "/Users/ada/code/doan";
let seq = 0;
const ev = (turnId: string, payload: Record<string, unknown>): ConversationEvent => ({ v: 1, conversationId: "c1", seq: ++seq, turnId, at: "2026-11-01T00:00:00Z", ...payload } as ConversationEvent);
const message = (turnId: string, text: string, extra: Record<string, unknown> = {}) => ev(turnId, { type: "user.message", text, anchors: [], ...extra });
const items = (events: ConversationEvent[]) => threadItems(events, ROOT, true);

describe("entering", () => {
  test("only a new user item that matches a local send enters; history and other windows' messages do not", () => {
    seq = 0;
    const history = [message("t1", "Older"), ev("t1", { type: "turn.started" }), ev("t1", { type: "turn.done" })];
    const opened = items(history);
    // Opening a conversation draws its history: nothing enters.
    expect(entering([], opened, [])).toEqual(new Set());
    const fromTerminal = [...history, message("t2", "From the terminal")];
    expect(entering(opened, items(fromTerminal), [])).toEqual(new Set());
    const sent = [...fromTerminal, ev("t2", { type: "turn.started" }), ev("t2", { type: "turn.done" }), message("t3", "Make it blue")];
    expect(entering(items(fromTerminal), items(sent), [{ text: "Make it blue", after: 4 }])).toEqual(new Set(["u7"]));
    // A mark with different text does not match, and an item already drawn never enters again.
    expect(entering(items(fromTerminal), items(sent), [{ text: "Make it red", after: 4 }])).toEqual(new Set());
    expect(entering(items(sent), items(sent), [{ text: "Make it blue", after: 4 }])).toEqual(new Set());
  });

  test("a message at or before the mark's last seq is history, even with the same text", () => {
    seq = 0;
    const events = [message("t1", "Again")];
    expect(entering([], items(events), [{ text: "Again", after: 1 }])).toEqual(new Set());
    expect(entering([], items(events), [{ text: "Again", after: 0 }])).toEqual(new Set(["u1"]));
  });

  test("the mark is compared with the message as the thread splits it: preset line, markers, attachments", () => {
    seq = 0;
    const text = "Use {{1}} here";
    const events = [message("t1", text, { anchors: [{ element: { selector: "#x" } }] })];
    expect(entering([], items(events), [{ text, after: 0 }])).toEqual(new Set(["u1"]));
  });

  test("a handoff card never enters", () => {
    seq = 0;
    const events = [message("t1", "Earlier agent's text", { origin: { kind: "handoff", conversationId: "c0", canvas: { path: ".doan/canvases/drafts.html", id: "drafts" } } })];
    expect(items(events)[0]!.kind).toBe("handoffCard");
    expect(entering([], items(events), [{ text: "Earlier agent's text", after: 0 }])).toEqual(new Set());
  });

  test("a new conversation's first message enters on the render that opens the conversation", () => {
    seq = 0;
    expect(entering([], items([message("t1", "Draw a login screen")]), [{ text: "Draw a login screen", after: 0 }])).toEqual(new Set(["u1"]));
  });

  test("several queued messages going out together all enter, each mark used once", () => {
    seq = 0;
    const before = [message("t1", "First"), ev("t1", { type: "turn.started" }), ev("t1", { type: "turn.done" })];
    const after = [...before, message("t2", "Second"), message("t2", "Third"), message("t2", "Third")];
    expect(entering(items(before), items(after), [{ text: "Second", after: 3 }, { text: "Third", after: 3 }, { text: "Third", after: 3 }])).toEqual(new Set(["u4", "u5", "u6"]));
    // One mark for two identical messages: only the first enters.
    expect(entering(items(before), items(after), [{ text: "Third", after: 3 }])).toEqual(new Set(["u5"]));
  });

  test("Send now enters once: on its q item, not again when the history's item shows beside it or after it", () => {
    seq = 0;
    const running = [message("t1", "First"), ev("t1", { type: "turn.started" }), ev("t1", { type: "message.delta", messageId: "m1", text: "Working" })];
    const send = { id: "s1", text: "Also the footer", anchors: [], attachments: [] };
    const marks = [{ text: "Also the footer", after: 3 }];
    const r0 = items(running);
    const r1 = withSending(items(running), [send]);
    expect(entering(r0, r1, marks)).toEqual(new Set(["qs1"]));
    // The frame where both the q item and the history's item show.
    const pushed = [...running, message("t1", "Also the footer")];
    const r2 = withSending(items(pushed), [send]);
    expect(r2.filter(i => i.kind === "user").map(i => i.key)).toEqual(["u1", "qs1", "u4"]);
    expect(entering(r1, r2, marks)).toEqual(new Set());
    // The next frame: the q item is gone.
    const r3 = items(pushed);
    expect(entering(r2, r3, marks)).toEqual(new Set());
    // Without an overlapping frame: the q item of the previous render alone keeps it from entering.
    expect(entering(r1, r3, marks)).toEqual(new Set());
  });
});

describe("revealStep", () => {
  // Frames of `dt` from one chunk of `target` characters arriving at 0.
  const run = (target: number, dt: number, phase: (t: number) => Parameters<typeof revealStep>[4] = () => "streaming") => {
    let shown = 0, t = 0;
    const frames: number[] = [];
    while (shown < target && t < 5000) {
      t += dt;
      shown = revealStep(shown, target, t, dt, phase(t));
      frames.push(shown);
    }
    return { t, frames };
  };

  test("a whole reply in one chunk (0 to 10,000 characters) is caught up within MAX_LAG_MS, not in one frame", () => {
    expect(MAX_LAG_MS).toBe(400);
    const { t, frames } = run(10_000, 16);
    expect(t).toBeLessThanOrEqual(MAX_LAG_MS);
    expect(frames[0]).toBeGreaterThan(0);
    expect(frames[0]).toBeLessThan(1000);
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
  });

  test("a small chunk shows only what arrived", () => {
    let shown = 0;
    for (let t = 16; t <= 400; t += 16) {
      shown = revealStep(shown, 5, t, 16, "streaming");
      expect(shown).toBeLessThanOrEqual(5);
    }
    expect(shown).toBe(5);
  });

  test("a large dtMs (a hidden window coming back) catches up at once", () => {
    expect(revealStep(10, 5000, 30, 2000, "streaming")).toBe(5000);
  });

  test("a hidden character already MAX_LAG_MS old shows at once", () => {
    expect(revealStep(10, 900, MAX_LAG_MS, 16, "streaming")).toBe(900);
  });

  test("finishing shows the rest within FINISH_MS of message.done", () => {
    expect(FINISH_MS).toBe(150);
    // The oldest hidden character is young, so only the finish bounds the pace.
    let shown = 0, since = 0;
    const frames: number[] = [];
    while (shown < 3000) { since += 16; shown = revealStep(shown, 3000, 0, 16, { finishing: since }); frames.push(shown); }
    expect(since).toBeLessThanOrEqual(FINISH_MS + 16);
    expect(frames[0]).toBeLessThan(3000);
  });

  test("flush shows everything at once", () => {
    expect(revealStep(0, 10_000, 0, 16, "flush")).toBe(10_000);
  });

  test("never longer than what arrived, including when message.done's text is shorter", () => {
    for (const phase of ["streaming", "flush", { finishing: 40 }] as const) {
      for (const [shown, target, age, dt] of [[0, 1, 0, 16], [3, 4, 399, 16], [0, 7, 0, 10_000], [50, 20, 0, 16]] as const) {
        expect(revealStep(shown, target, age, dt, phase)).toBeLessThanOrEqual(target);
      }
    }
    expect(revealStep(50, 20, 0, 16, "streaming")).toBe(20);
  });

  test("never goes backwards while more is hidden", () => {
    expect(revealStep(100, 200, 0, 0, "streaming")).toBeGreaterThanOrEqual(100);
  });
});

describe("revealBoundary", () => {
  test("cuts at a word's end, with its following space", () => {
    const text = "The action now reads Add a card.";
    expect(revealBoundary(text, 0, 6)).toBe(11);
    expect(text.slice(0, revealBoundary(text, 0, 6))).toBe("The action ");
    expect(revealBoundary(text, 0, 4)).toBe(4);
    expect(revealBoundary(text, 0, text.length)).toBe(text.length);
  });

  test("never below from nor past the text", () => {
    expect(revealBoundary("one two", 5, 2)).toBe(5);
    expect(revealBoundary("one two", 0, 99)).toBe(7);
  });

  test("the received text's last word shows even if more of it may come", () => {
    expect(revealBoundary("Add a ca", 0, 7)).toBe(8);
  });

  test("inside a code block it reveals whole lines", () => {
    const text = "Here:\n\n```html\n<button>\n  Add a card\n</button>\n```\n\nDone.";
    const open = text.indexOf("```html");
    // Within the fence line: the whole fence line.
    expect(text.slice(0, revealBoundary(text, 0, open + 2))).toBe("Here:\n\n```html\n");
    const inside = text.indexOf("Add");
    expect(text.slice(0, revealBoundary(text, 0, inside + 1))).toBe("Here:\n\n```html\n<button>\n  Add a card\n");
    // After the closing fence, words again.
    expect(text.slice(0, revealBoundary(text, 0, text.indexOf("Done") + 1))).toBe(text);
  });

  test("a code line that has not ended yet is held", () => {
    const text = "```\nconst a = 1;\nconst b";
    expect(revealBoundary(text, 0, text.length)).toBe(text.indexOf("const b"));
    expect(revealBoundary(text, text.length - 2, text.length)).toBe(text.length - 2);
  });

  test("an unfinished link at the end is held, a doan: chip link too", () => {
    for (const text of ["See [the payment", "See [the payment screen]", "See [the payment screen](https://exa", "See [Payment](doan:canvas/payment.html#fr"]) {
      expect(revealBoundary(text, 0, text.length)).toBe(4);
    }
    expect(revealBoundary("See [Payment](doan:canvas/payment.html#frame) now", 0, 6)).toBe("See [Payment](doan:canvas/payment.html#frame)".length);
  });

  test("a finished link shows whole, never part of its label", () => {
    const text = "See [the payment screen](https://example.com) and more";
    expect(text.slice(0, revealBoundary(text, 0, 7))).toBe("See [the payment screen](https://example.com)");
  });

  test("a bracket that is not a link does not hold", () => {
    const text = "Items [a] and [b] then more";
    expect(revealBoundary(text, 0, text.length)).toBe(text.length);
  });

  test("a table at the end is held until its header and delimiter rows arrive, then shows row by row", () => {
    const head = "Sizes:\n\n";
    expect(revealBoundary(`${head}| Screen | Width |`, 0, 40)).toBe(head.length);
    expect(revealBoundary(`${head}| Screen | Width |\n| --- |`, 0, 40)).toBe(head.length);
    const ready = `${head}| Screen | Width |\n| --- | ---: |\n`;
    expect(revealBoundary(ready, 0, ready.length)).toBe(ready.length);
    const rows = `${ready}| Panel | 347 |\n| Narrow | 2`;
    expect(rows.slice(0, revealBoundary(rows, 0, rows.length))).toBe(`${ready}| Panel | 347 |\n`);
    expect(rows.slice(0, revealBoundary(rows, ready.length, ready.length + 3))).toBe(`${ready}| Panel | 347 |\n`);
  });

  test("a line starting with a pipe that is not followed by a delimiter row is ordinary text", () => {
    const text = "| not a table\nJust words here";
    expect(revealBoundary(text, 0, text.length)).toBe(text.length);
  });
});

describe("followStep", () => {
  test("eases toward the target with TAU_MS and never passes it, also when the target moves", () => {
    expect(TAU_MS).toBe(40);
    let pos = 0, target = 100, frames = 0;
    for (;;) {
      frames++;
      if (frames === 5) target = 300;
      const next = followStep(pos, target, 16, 10_000);
      expect(next.pos).toBeGreaterThanOrEqual(pos);
      expect(next.pos).toBeLessThanOrEqual(target);
      pos = next.pos;
      if (next.done) break;
    }
    expect(pos).toBe(300);
  });

  test("ends within 0.5 px, landing exactly on the target", () => {
    const near = followStep(99.6, 100, 16, 1000);
    expect(near).toEqual({ pos: 100, done: true });
    const far = followStep(0, 100, 16, 1000);
    expect(far.done).toBe(false);
    expect(100 - far.pos).toBeGreaterThanOrEqual(0.5);
    // A 100 px jump settles in about the app's settle time.
    let pos = 0, t = 0;
    for (let s = followStep(pos, 100, 16, 1000); ; s = followStep(pos, 100, 16, 1000)) { t += 16; pos = s.pos; if (s.done) break; }
    expect(t).toBeLessThanOrEqual(240);
  });

  test("clamps the target to the live bottom", () => {
    let pos = 0, last = { pos: 0, done: false };
    while (!last.done) { last = followStep(pos, 500, 16, 200); pos = last.pos; expect(pos).toBeLessThanOrEqual(200); }
    expect(pos).toBe(200);
    // The bottom rose above the position (the composer shrank): it settles on the bottom.
    expect(followStep(300, 500, 16, 200).pos).toBeLessThanOrEqual(300);
  });
});

describe("nextFollow", () => {
  const settle = (state: FollowState, at: number, distance = 0) => nextFollow(state, { type: "frame", at, distance });

  test("starts pinned", () => {
    expect(FOLLOW_START.pinned).toBe(true);
  });

  test("a person's input turns following off; a scroll the loop did not write does too", () => {
    for (const event of [{ type: "input", kind: "wheel", at: 0 }, { type: "input", kind: "pointer", at: 0 }, { type: "input", kind: "key", key: "PageUp", at: 0 }, { type: "scroll" }] as const) {
      expect(nextFollow(FOLLOW_START, event).pinned).toBe(false);
    }
  });

  test("back at the bottom it follows again, but not within WHEEL_HOLD_MS of the last wheel (trackpad inertia)", () => {
    expect(WHEEL_HOLD_MS).toBe(100);
    const wheeled = nextFollow(FOLLOW_START, { type: "input", kind: "wheel", at: 1000 });
    expect(settle(wheeled, 1050).pinned).toBe(false);
    expect(settle(wheeled, 1099).pinned).toBe(false);
    expect(settle(wheeled, 1100).pinned).toBe(true);
    // Still away from the bottom: stays.
    expect(settle(wheeled, 1200, 25).pinned).toBe(false);
    const keyed = nextFollow(FOLLOW_START, { type: "input", kind: "key", key: "End", at: 1000 });
    expect(settle(keyed, 1001).pinned).toBe(true);
  });

  test("after scrollToItem it does not follow until the person comes back to the bottom", () => {
    const toCard = nextFollow(FOLLOW_START, { type: "scrollToItem" });
    expect(toCard.pinned).toBe(false);
    // The card is at the bottom, and the smooth scroll's own events arrive: still not following.
    expect(settle(nextFollow(toCard, { type: "scroll" }), 5000, 0).pinned).toBe(false);
    const back = nextFollow(toCard, { type: "input", kind: "pointer", at: 6000 });
    expect(settle(back, 6001, 30).pinned).toBe(false);
    expect(settle(back, 6002, 0).pinned).toBe(true);
  });

  test("a selection stops following until it ends", () => {
    const selecting = nextFollow(FOLLOW_START, { type: "selection", active: true });
    expect(selecting.pinned).toBe(false);
    expect(settle(selecting, 5000, 0).pinned).toBe(false);
    expect(settle(nextFollow(selecting, { type: "selection", active: false }), 5000, 0).pinned).toBe(true);
  });

  test("typing in the composer has no effect: keys that do not scroll the thread are ignored", () => {
    for (const key of ["a", "Enter", "Backspace", "ArrowLeft", "Shift"]) {
      expect(nextFollow(FOLLOW_START, { type: "input", kind: "key", key, at: 0 })).toBe(FOLLOW_START);
    }
    for (const key of ["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "]) {
      expect(nextFollow(FOLLOW_START, { type: "input", kind: "key", key, at: 0 }).pinned).toBe(false);
    }
  });

  test("Jump to latest follows again at once, also after scrollToItem", () => {
    const toCard = nextFollow(nextFollow(FOLLOW_START, { type: "scrollToItem" }), { type: "selection", active: false });
    expect(nextFollow(toCard, { type: "jump" }).pinned).toBe(true);
    expect(settle(nextFollow(nextFollow(toCard, { type: "jump" }), { type: "scroll" }), 0, 0).pinned).toBe(true);
  });

  test("a frame changes nothing while pinned or far from the bottom", () => {
    expect(settle(FOLLOW_START, 0, 500)).toBe(FOLLOW_START);
  });
});

