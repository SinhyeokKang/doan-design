import { describe, expect, test } from "vitest";
import type { ConversationEvent } from "../main/conversation/types";
import { threadItems, withSending } from "./threadItems";
import { combineQueued } from "../main/conversation/queue";
import { FINISH_MS, FOLLOW_START, MAX_LAG_MS, TAU_MS, WHEEL_HOLD_MS, entering, followResize, followStep, nextFollow, revealBoundary, revealStep, timeMs, type FollowState } from "./threadMotion";
import { FOLLOW_DISTANCE } from "./threadItems";

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

  test("queued messages going out together enter once, as the one combined message main sends", () => {
    seq = 0;
    const before = [message("t1", "First"), ev("t1", { type: "turn.started" }), ev("t1", { type: "turn.done" })];
    const queued = [{ text: "Make {{1}} blue", anchors: [{ element: { selector: "#a" } }], attachments: [] }, { text: "And {{1}} red", anchors: [{ element: { selector: "#b" } }], attachments: [] }];
    const combined = combineQueued(queued);
    if (!combined.ok) throw new Error("combine");
    expect(combined.text).toBe("Make {{1}} blue\n\nAnd {{2}} red");
    const after = [...before, message("t2", combined.text, { anchors: combined.anchors })];
    expect(entering(items(before), items(after), [{ text: combined.text, after: 3 }])).toEqual(new Set(["u4"]));
    // A mark per queued message never matches the combined message.
    expect(entering(items(before), items(after), queued.map(q => ({ text: q.text, after: 3 })))).toEqual(new Set());
  });

  test("identical messages each need their own mark", () => {
    seq = 0;
    const after = [message("t1", "Again"), message("t1", "Again")];
    expect(entering([], items(after), [{ text: "Again", after: 0 }])).toEqual(new Set(["u1"]));
    expect(entering([], items(after), [{ text: "Again", after: 0 }, { text: "Again", after: 0 }])).toEqual(new Set(["u1", "u2"]));
  });

  test("a render that opens the conversation (empty prev) never enters a Send now item: it is already on screen", () => {
    seq = 0;
    const running = [message("t1", "First"), ev("t1", { type: "turn.started" })];
    const send = { id: "s1", text: "Also the footer", anchors: [], attachments: [] };
    expect(entering([], withSending(items(running), [send]), [{ text: "Also the footer", after: 2 }])).toEqual(new Set());
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
    expect(r2.filter(i => i.kind === "user").map(i => i.key)).toEqual(["u1", "u4", "qs1"]);
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
    expect(revealBoundary(text, 0, 6, false)).toBe(11);
    expect(text.slice(0, revealBoundary(text, 0, 6, false))).toBe("The action ");
    expect(revealBoundary(text, 0, 4, false)).toBe(4);
    expect(revealBoundary(text, 0, text.length, false)).toBe(text.length);
  });

  test("never below from nor past the text", () => {
    expect(revealBoundary("one two", 5, 2, false)).toBe(5);
    expect(revealBoundary("one two", 0, 99, false)).toBe(7);
  });

  test("the received text's last word shows even if more of it may come", () => {
    expect(revealBoundary("Add a ca", 0, 7, false)).toBe(8);
  });

  test("inside a code block it reveals whole lines", () => {
    const text = "Here:\n\n```html\n<button>\n  Add a card\n</button>\n```\n\nDone.";
    const open = text.indexOf("```html");
    // Within the fence line: the whole fence line.
    expect(text.slice(0, revealBoundary(text, 0, open + 2, false))).toBe("Here:\n\n```html\n");
    const inside = text.indexOf("Add");
    expect(text.slice(0, revealBoundary(text, 0, inside + 1, false))).toBe("Here:\n\n```html\n<button>\n  Add a card\n");
    // After the closing fence, words again.
    expect(text.slice(0, revealBoundary(text, 0, text.indexOf("Done") + 1, false))).toBe(text);
  });

  test("a code line that has not ended yet is held", () => {
    const text = "```\nconst a = 1;\nconst b";
    expect(revealBoundary(text, 0, text.length, false)).toBe(text.indexOf("const b"));
    expect(revealBoundary(text, text.length - 2, text.length, false)).toBe(text.length - 2);
  });

  test("an unfinished link at the end is held, a doan: chip link too", () => {
    for (const text of ["See [the payment", "See [the payment screen]", "See [the payment screen](https://exa", "See [Payment](doan:canvas/payment.html#fr"]) {
      expect(revealBoundary(text, 0, text.length, false)).toBe(4);
    }
    expect(revealBoundary("See [Payment](doan:canvas/payment.html#frame) now", 0, 6, false)).toBe("See [Payment](doan:canvas/payment.html#frame) ".length);
  });

  test("a finished link shows whole, never part of its label", () => {
    const text = "See [the payment screen](https://example.com) and more";
    expect(text.slice(0, revealBoundary(text, 0, 7, false))).toBe("See [the payment screen](https://example.com)");
  });

  test("a bracket that is not a link does not hold", () => {
    const text = "Items [a] and [b] then more";
    expect(revealBoundary(text, 0, text.length, false)).toBe(text.length);
  });

  test("a chip link right after a CJK letter, or with parentheses in its label, is held once its ]( has arrived", () => {
    for (const [text, at] of [["请看[支付页面](doan:canvas/pay.html#fr", 2], ["次は[決済画面](doan:canvas/pay.html#", 2], ["See [Payment (new)](doan:canvas/p.html#f", 4]] as const) {
      expect(revealBoundary(text, 0, text.length, false)).toBe(at);
    }
    // Before ]( arrives, a label after a CJK letter is held too; after a Latin letter it is not.
    expect(revealBoundary("请看[支付", 0, 5, false)).toBe(2);
    expect(revealBoundary("a[i", 0, 3, false)).toBe(3);
  });

  test("a cut inside punctuation never leaves an opening mark alone: it takes the word the mark opens", () => {
    const cases = [["Make it **really** blue", 9, "Make it **really** "], ["Done!!! (soon) ok", 9, "Done!!! (soon) "], ["Say 'hi' now", 5, "Say 'hi' "], ["Then `code` here", 6, "Then `code` "]] as const;
    for (const [text, to, shown] of cases) expect(text.slice(0, revealBoundary(text, 0, to, false))).toBe(shown);
  });

  test("a bracket that cannot start a link does not hold", () => {
    for (const text of ["Values in [0, 1) are valid, and this sentence keeps going", "Use `arr[` to read the item and keep going", "The array is a[i and more words"]) {
      expect(revealBoundary(text, 0, text.length, false)).toBe(text.length);
    }
  });

  test("a titled link is held while unfinished and never cut once finished", () => {
    const open = 'See [a](https://x.com "Ti';
    expect(revealBoundary(open, 0, open.length, false)).toBe(4);
    const done = 'See [a](https://x.com "Title") more';
    expect(done.slice(0, revealBoundary(done, 0, 6, false))).toBe('See [a](https://x.com "Title")');
  });

  test("once message.done has the whole text, nothing is held", () => {
    for (const text of ["See [the payment", "Sizes:\n\n| Screen | Width |", "```\nconst a = 1;\nconst b"]) {
      expect(revealBoundary(text, 0, text.length, true)).toBe(text.length);
    }
  });

  test("text without spaces reveals by word, never splitting a surrogate pair", () => {
    const cjk = "这是一个测试句子，我们来看看。";
    const cut = revealBoundary(cjk, 0, 3, false);
    expect(cut).toBe(4);
    const emoji = "😀😀😀😀😀😀";
    for (let to = 1; to < emoji.length; to++) expect(revealBoundary(emoji, 0, to, false) % 2).toBe(0);
  });

  test("a fence closes only with the same character, at least as long, and nothing after it", () => {
    const tilde = "~~~\n```\n~~~\nprose after a tilde fence that keeps going";
    expect(revealBoundary(tilde, 0, tilde.length, false)).toBe(tilde.length);
    const nested = "````md\n```js\nx\n```\nstill code";
    expect(revealBoundary(nested, 0, nested.length, false)).toBe(nested.indexOf("still"));
    const info = "```\na\n``` not a close\nstill code";
    expect(revealBoundary(info, 0, info.length, false)).toBe(info.indexOf("still"));
  });

  test("a table with CRLF line ends shows row by row", () => {
    const rows = "| a | b |\r\n| --- | --- |\r\n| x | 1 |\r\n| y | 2";
    expect(rows.slice(0, revealBoundary(rows, 0, rows.length, false))).toBe("| a | b |\r\n| --- | --- |\r\n| x | 1 |\r\n");
  });

  test("a table at the end is held until its header and delimiter rows arrive, then shows row by row", () => {
    const head = "Sizes:\n\n";
    expect(revealBoundary(`${head}| Screen | Width |`, 0, 40, false)).toBe(head.length);
    expect(revealBoundary(`${head}| Screen | Width |\n| --- |`, 0, 40, false)).toBe(head.length);
    const ready = `${head}| Screen | Width |\n| --- | ---: |\n`;
    expect(revealBoundary(ready, 0, ready.length, false)).toBe(ready.length);
    const rows = `${ready}| Panel | 347 |\n| Narrow | 2`;
    expect(rows.slice(0, revealBoundary(rows, 0, rows.length, false))).toBe(`${ready}| Panel | 347 |\n`);
    expect(rows.slice(0, revealBoundary(rows, ready.length, ready.length + 3, false))).toBe(`${ready}| Panel | 347 |\n`);
  });

  test("a line starting with a pipe that is not followed by a delimiter row is ordinary text", () => {
    const text = "| not a table\nJust words here";
    expect(revealBoundary(text, 0, text.length, false)).toBe(text.length);
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

  test("a scroll the loop did not write leaves it unpinned until the bottom is reached again", () => {
    const scrolled = nextFollow(FOLLOW_START, { type: "scroll" });
    expect(settle(scrolled, 5000, 30).pinned).toBe(false);
    expect(settle(scrolled, 5000, 0).pinned).toBe(true);
  });

  test("Jump to latest follows again at once, also while the person is scrolled away", () => {
    const away = nextFollow(FOLLOW_START, { type: "input", kind: "pointer", at: 0 });
    expect(nextFollow(away, { type: "jump" }).pinned).toBe(true);
    expect(settle(nextFollow(nextFollow(away, { type: "jump" }), { type: "scroll" }), 0, 0).pinned).toBe(true);
  });

  test("the follow has no hold: a state is only pinned, selecting and the last wheel", () => {
    expect(Object.keys(FOLLOW_START).sort()).toEqual(["pinned", "selecting", "wheelAt"]);
  });

  test("a frame changes nothing while pinned or far from the bottom", () => {
    expect(settle(FOLLOW_START, 0, 500)).toBe(FOLLOW_START);
  });
});

// content: the thread's own height (.thread), apart from the scroller's end inset and its viewport; inset: the end inset;
// distance: from the bottom, before the change and after it (the view not moved).
describe("followResize", () => {
  const pinned = FOLLOW_START, at = 1000;
  const away = nextFollow(pinned, { type: "input", kind: "wheel", at: at - 500 });
  const size = (content: number, inset = 0, distance = 0) => ({ content, inset, distance });
  const change = (patch: Partial<Parameters<typeof followResize>[1]>) =>
    ({ reduced: false, revealing: false, now: at, before: size(1000), after: size(1100), ...patch });

  test("while a reply reveals, the view sticks to the bottom; a one-time growth eases", () => {
    expect(followResize(pinned, change({ revealing: true }))).toEqual({ state: pinned, move: "snap", behind: false });
    expect(followResize(pinned, change({})).move).toBe("ease");
  });

  test("reduced motion jumps", () => {
    expect(followResize(pinned, change({ reduced: true })).move).toBe("snap");
  });

  test("scrolled away by the person, growth leaves the view and shows Jump to latest", () => {
    expect(followResize(away, change({ revealing: true, before: size(1000, 0, 300), after: size(1100, 0, 400) }))).toEqual({ state: away, move: "none", behind: true });
  });

  // Near the bottom but not following (the wheel's inertia): growth that leaves the view far from the bottom shows it too.
  test("growth that takes the view past the follow band shows Jump to latest even from near the bottom", () => {
    const wheeled = nextFollow(pinned, { type: "input", kind: "wheel", at: at - 50 });
    expect(followResize(wheeled, change({ before: size(1000, 0, 10), after: size(1100, 0, 110) })).behind).toBe(true);
    expect(followResize(wheeled, change({ before: size(1000, 0, 10), after: size(1010, 0, 20) })).behind).toBeNull();
  });

  test("scrolled away, a row folding or unfolding or the viewport resizing without new content leaves Jump to latest as it was", () => {
    expect(followResize(away, change({ before: size(1000, 0, 300), after: size(900, 0, 200) })).behind).toBeNull();
    expect(followResize(away, change({ before: size(1000, 0, 300), after: size(1000, 0, 280) })).behind).toBeNull();
  });

  test("back near the bottom once the wheel's inertia is over, it follows again", () => {
    const wheeled = nextFollow(pinned, { type: "input", kind: "wheel", at: at - 50 });
    expect(followResize(wheeled, change({ before: size(1000, 0, 10) })).move).toBe("none");
    expect(followResize(wheeled, change({ before: size(1000, 0, 10), now: at + 200 })).move).toBe("ease");
    expect(FOLLOW_DISTANCE).toBeGreaterThan(10);
  });

  // The popover appears whole at once, so an eased follow would leave the last item under it for a moment.
  test("at the bottom, an end inset that grows or shrinks keeps the bottom at once, without ease, and never shows Jump to latest", () => {
    expect(followResize(pinned, change({ before: size(1000), after: size(1000, 180, 180) }))).toEqual({ state: pinned, move: "snap", behind: false });
    expect(followResize(pinned, change({ before: size(1000, 180), after: size(1000, 40) }))).toEqual({ state: pinned, move: "snap", behind: false });
  });

  test("at the bottom, new content that comes with an inset change also lands at once", () => {
    expect(followResize(pinned, change({ before: size(1000), after: size(1300, 180, 480) })).move).toBe("snap");
  });

  test("scrolled away, an inset change alone is not new content: Jump to latest stays as it was", () => {
    expect(followResize(away, change({ before: size(1000, 0, 300), after: size(1000, 180, 480) }))).toEqual({ state: away, move: "none", behind: null });
    expect(followResize(away, change({ before: size(1000, 180, 480), after: size(1000, 40, 340) })).behind).toBeNull();
  });

  // Border-box heights are fractional; the content is measured apart from the inset, so only its own change counts.
  test("a fractional inset-only change is not new content", () => {
    expect(followResize(away, change({ before: size(1000.25, 40, 300), after: size(1000.25, 180.5, 440.5) })).behind).toBeNull();
  });

  // The scroll height has the viewport as its floor, so it says nothing about the content once the thread stops overflowing.
  test("an inset shrinking until the thread no longer overflows is not new content", () => {
    expect(followResize(away, change({ before: size(200, 400, 50), after: size(200, 40, 0) })).behind).toBeNull();
  });

  test("scrolled away, new content that comes with an inset change still shows Jump to latest", () => {
    expect(followResize(away, change({ before: size(1000, 0, 300), after: size(1300, 180, 780) }))).toEqual({ state: away, move: "none", behind: true });
    // The inset shrank by more than the content grew: the content still grew.
    expect(followResize(away, change({ before: size(1000, 180, 480), after: size(1060, 40, 400) })).behind).toBe(true);
  });
});

// A registered time token computes in seconds ("0.12s"), so a plain number would read it as milliseconds.
describe("timeMs", () => {
  test("reads a CSS time in either unit as milliseconds; anything else is 0", () => {
    expect(timeMs("120ms")).toBe(120);
    expect(timeMs("0.12s")).toBe(120);
    expect(timeMs(" 0.4s ")).toBe(400);
    expect(timeMs("")).toBe(0);
    expect(timeMs("fast")).toBe(0);
  });
});
