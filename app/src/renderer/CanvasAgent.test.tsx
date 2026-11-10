import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { FolderEntry } from "../main/view";
import { CanvasAgent } from "./CanvasAgent";
import { crossesBoundary, NoticeTyping, typesOn, type TypedText } from "./noticeTyping";
import { TooltipProvider } from "./components/ui/tooltip";

// The board's agent indicator (.doan/canvases/doan-canvas.html 'agent-working', 'agent-waiting'), drawn
// from main's conversation list for the open canvas.
const canvas = { path: ".doan/canvases/billing.html", id: "billing" };
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", state: "current", owner: "doan", provider: "codex", fromHome: true,
  phase: "running", unseen: false, queued: 0, working: true, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "",
  canvas, ...patch,
});
const markup = (list: readonly ConversationSummary[] | "loading" | "error" | undefined, over: Partial<Parameters<typeof CanvasAgent>[0]> = {}) =>
  renderToStaticMarkup(<TooltipProvider><CanvasAgent list={list} canvas={{ root: "/w/a", canvas }} buddy="doany" running={true} work={[]} entries={[]} onOpen={vi.fn()} onOpenSibling={vi.fn()} onStopFailed={vi.fn()} {...over} /></TooltipProvider>);
// The working notice's visible line (aria-hidden, the text and its caret) and its measuring node.
const LINE = (text: string, caret = '<span class="doan-agent-caret"></span>') => `<span class="doan-agent-line" aria-hidden="true" data-state="closed" data-slot="tooltip-trigger"><span class="doan-agent-row"><span class="doan-agent-text">${text}</span>${caret}</span></span>`;
const MEASURE = '<span class="doan-agent-measure" aria-hidden="true"></span>';
// Without an indicator the column stays, empty, for the canvas notices.
const COLUMN = '<div class="doan-canvas-top"></div>';
// Doany in the notice's mark slot (.doan/canvases/doany-family.html): one of three variants, picked when the notice
// mounts. Its GIF while the agent works, its first frame when still (waiting, a hidden workspace) and, through the
// picture source, under reduced motion. Math.random is pinned to the painter unless a test picks another.
const VARIANTS = { painting: ["artist-painting.gif", "artist-rest.png"], typing: ["artist-typing.gif", "artist-typing-rest.png"], reading: ["artist-reading.gif", "artist-reading-rest.png"] } as const;
type Variant = keyof typeof VARIANTS;
// Math.random values that land on each variant with equal thirds.
const PICK: Record<Variant, number> = { painting: 0, typing: 0.34, reading: 0.99 };
const artist = (variant: Variant, still: boolean) => {
  const [gif, rest] = VARIANTS[variant];
  return `<span class="doan-agent-artist" aria-hidden="true"><picture><source srcSet="doany/${rest}" media="(prefers-reduced-motion: reduce)"/><img src="doany/${still ? rest : gif}" alt=""/></picture></span>`;
};
const ARTIST = artist("painting", false);
const ARTIST_STILL = artist("painting", true);
beforeEach(() => { vi.spyOn(Math, "random").mockReturnValue(PICK.painting); });
afterEach(() => { vi.restoreAllMocks(); });
const tag = (html: string, pattern: string) => html.match(new RegExp(`<[a-z0-9]+[^>]*${pattern}[^>]*>`))?.[0] ?? "";

describe("CanvasAgent", () => {
  test("a hidden workspace keeps Doany on the first frame, as the dot field pauses, in every notice", () => {
    expect(markup([summary({})], { running: false })).toContain('<div class="doan-agent">' + ARTIST_STILL);
    const work = [{ touched: 0, turn: "none:t", session: "s1", provider: "codex" as const, root: "/w/a", path: canvas.path }];
    expect(markup([], { work, running: false })).toContain('<div class="doan-agent doan-agent-terminal">' + ARTIST_STILL);
  });

  test("working: the edge glow with the dot field, and the notice with Doany painting, the label and Stop", () => {
    const html = markup([summary({})]);
    const glow = tag(html, 'class="doan-agent-glow"');
    expect(glow).toContain('aria-hidden="true"');
    expect(html).toMatch(/<div class="doan-agent-glow"[^>]*><canvas class="doan-agent-dots"><\/canvas><\/div>/);
    expect(html).toContain('class="doan-canvas-top"');
    expect(tag(html, 'class="doan-agent"')).toBeTruthy();
    expect(html).toContain('<div class="doan-agent">' + ARTIST);
    expect(html).not.toContain("doan-agent-dot\"");
    // Only the wording is the live region: the button's name is not announced with it.
    expect(html).toContain('<span class="sr-only" role="status">Agent is working</span>');
    expect(html.match(/role="status"/g)).toHaveLength(1);
    const stop = tag(html, 'class="doan-button doan-agent-action"');
    expect(stop).toMatch(/^<button/);
    // The notice's first size: a 32px action with body-sm wording (dogfooding found the 40px one too large).
    expect(stop).toContain('data-ui-size="sm"');
    expect(stop).not.toContain("disabled");
    // The composer's Stop glyph, a filled square, leads the word.
    const glyph = html.match(/<button[^>]*doan-agent-action[^>]*>(<svg[^>]*>).*?<\/svg>Stop<\/button>/)?.[1] ?? "";
    expect(glyph).toContain("lucide-square");
    expect(glyph).toContain('fill="currentColor"');
  });

  test("waiting: Doany still on the first frame, 'needs your answer' and Open named for the request; no Stop", () => {
    const html = markup([summary({ phase: "waiting" })]);
    expect(html).toContain('<div class="doan-agent">' + ARTIST_STILL);
    expect(html).toContain("Agent needs your answer");
    expect(tag(html, 'aria-label="Open the request"')).toMatch(/^<button/);
    // Open has no glyph.
    expect(html).toMatch(/aria-label="Open the request">Open<\/button>/);
    expect(html).not.toMatch(/>Stop</);
  });

  test("nothing shows for an ended turn, another canvas's or a project conversation", () => {
    const { canvas: _c, ...project } = summary({});
    for (const list of [[summary({ phase: "ended" })], [summary({ canvas: { path: ".doan/canvases/other.html", id: "other" } })], [project]]) {
      expect(markup(list)).toBe(COLUMN);
    }
  });

  test("nothing shows on an unlisted page or a project problem (no canvas)", () => {
    expect(markup([summary({})], { canvas: null })).toBe(COLUMN);
  });

  test("nothing shows before the first list read", () => {
    expect(markup("loading")).toBe(COLUMN);
    expect(markup("error")).toBe(COLUMN);
  });

  // Draft terminal-notice: a terminal session shows the glow, the dot field
  // and the app notice's text with no button; the text is the status itself.
  test("a terminal session: the glow and the notice with Doany painting and text, and no button", () => {
    const work = [{ touched: 0, turn: "none:t", session: "s1", provider: "codex" as const, root: "/w/a", path: canvas.path }];
    const html = markup([], { work });
    expect(html).toMatch(/<div class="doan-agent-glow"[^>]*><canvas class="doan-agent-dots"><\/canvas><\/div>/);
    expect(html).toContain('<div class="doan-agent doan-agent-terminal">' + ARTIST + LINE("Agent is working") + MEASURE + '<span class="sr-only" role="status">Agent is working</span></div>');
    expect(html).not.toContain("<button");
    // Another worktree's session on the same path shows nothing here.
    expect(markup([], { work: [{ ...work[0]!, root: "/w/b" }] })).toBe(COLUMN);
  });

  test("an app conversation on the canvas keeps its Stop over a terminal session", () => {
    const html = markup([summary({})], { work: [{ touched: 0, turn: "none:t", session: null, provider: null, root: "/w/a", path: canvas.path }] });
    expect(html).toContain('<div class="doan-agent">');
    expect(html).toMatch(/>Stop<\/button>/);
  });

  // DESIGN 'Terminal work in another worktree' (draft frame sibling-notice): another worktree of this project works on this
  // canvas's path while this checkout has nothing on it. One notice, no glow or dot field, Open named for the worktree.
  describe("another worktree's work on this path", () => {
    const COMMON = "/repo/.git";
    const git = (branch?: string) => ({ common: COMMON, main: "/w/a", worktrees: ["/w/a", "/w/b"], ...(branch === undefined ? {} : { branch }) });
    const row = { path: canvas.path, id: canvas.id, url: "u" };
    const entries = (branch?: string): FolderEntry[] => [
      { path: "/w/a", kind: "list", servedRev: 0, canvases: [row], git: git("main") },
      { path: "/w/b", kind: "list", servedRev: 0, canvases: [row], git: git(branch) },
    ];
    const there = [{ touched: 0, turn: "none:t", session: "s1", provider: "claude" as const, root: "/w/b", path: canvas.path }];
    test("the notice says where the agent works, with Open named for that worktree, and takes no focus", () => {
      const html = markup([], { work: there, entries: entries("feat/checkout-copy") });
      expect(html).not.toContain("doan-agent-glow");
      const notice = tag(html, 'class="doan-agent doan-agent-sibling"');
      expect(notice).toMatch(/^<div/);
      expect(html).toContain('<div class="doan-agent doan-agent-sibling">' + ARTIST);
      expect(tag(html, 'class="doan-agent-text"')).toContain('role="status"');
      expect(html).toMatch(/class="doan-agent-text"[^>]*>Agent is working in feat\/checkout-copy<\/span>/);
      expect(html.match(/role="status"/g)).toHaveLength(1);
      const open = tag(html, 'aria-label="Open this canvas in feat/checkout-copy"');
      expect(open).toMatch(/^<button type="button" class="doan-button doan-agent-action" data-ui-size="sm"/);
      expect(html).toMatch(/aria-label="Open this canvas in feat\/checkout-copy"[^>]*>Open<\/button>/);
      expect(html).not.toMatch(/autofocus/i);
    });
    test("a worktree without a branch is named by its folder", () => {
      const html = markup([], { work: there, entries: entries() });
      expect(html).toContain("Agent is working in b<");
      expect(html).toContain('aria-label="Open this canvas in b"');
    });
    test("this checkout's own terminal session or app conversation wins, with no sibling notice", () => {
      const own = markup([], { work: [...there, { ...there[0]!, root: "/w/a" }], entries: entries("feat/x") });
      expect(own).toContain('<div class="doan-agent doan-agent-terminal">');
      expect(own).not.toContain("doan-agent-sibling");
      const app = markup([summary({})], { work: there, entries: entries("feat/x") });
      expect(app).toMatch(/>Stop<\/button>/);
      expect(app).not.toContain("doan-agent-sibling");
    });
    test("the canvas notices still follow it in the column", () => {
      const notice = <div className="doan-notice doan-panel" role="status">x</div>;
      const html = renderToStaticMarkup(<TooltipProvider><CanvasAgent list={[]} canvas={{ root: "/w/a", canvas }} buddy="doany" running={true} work={there} entries={entries("feat/x")} onOpen={vi.fn()} onOpenSibling={vi.fn()} onStopFailed={vi.fn()}>{notice}</CanvasAgent></TooltipProvider>);
      expect(html.indexOf("doan-agent-sibling")).toBeGreaterThan(-1);
      expect(html.indexOf("doan-agent-sibling")).toBeLessThan(html.indexOf('class="doan-notice doan-panel"'));
    });
  });

  // The canvas notices stack in the same top-centre column, the agent notice first.
  test("the canvas notices App puts in the column lead with the alert icon, like every shared notice", () => {
    // App's CanvasPane is not rendered without a DOM; its markup is read from the source (DESIGN 'Notices': every
    // notice has the 16px icon on its first line).
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const column = source.slice(source.indexOf("<CanvasAgent {...agent}>"), source.indexOf("</CanvasAgent>"));
    const notices = column.match(/<div className="doan-notice[^"]*"[^>]*>.*?<\/div>/g) ?? [];
    // The selection-lost notice left the column for a toast (dogfooding); the error and unlisted notices stay.
    expect(notices).toHaveLength(2);
    for (const notice of notices) expect(notice).toMatch(/^<div className="doan-notice doan-panel" role="status"><AlertIcon \/><span className="grow-text( selectable)?">.*<\/span><\/div>$/);
  });

  test("the canvas notices come after the agent notice in the column, and alone when no indicator shows", () => {
    const notice = <div className="doan-notice doan-panel" role="status">The selection is no longer in the canvas.</div>;
    const html = renderToStaticMarkup(<TooltipProvider><CanvasAgent list={[summary({})]} canvas={{ root: "/w/a", canvas }} buddy="doany" running={true} work={[]} entries={[]} onOpen={vi.fn()} onOpenSibling={vi.fn()} onStopFailed={vi.fn()}>{notice}</CanvasAgent></TooltipProvider>);
    expect(html.indexOf('class="doan-agent"')).toBeGreaterThan(-1);
    expect(html.indexOf('class="doan-agent"')).toBeLessThan(html.indexOf('class="doan-notice doan-panel"'));
    expect(html.match(/class="doan-canvas-top"/g)).toHaveLength(1);
    const alone = renderToStaticMarkup(<CanvasAgent list={undefined} canvas={null} buddy="doany" running={true} work={[]} entries={[]} onOpen={vi.fn()} onOpenSibling={vi.fn()} onStopFailed={vi.fn()}>{notice}</CanvasAgent>);
    expect(alone).toBe(`<div class="doan-canvas-top">${renderToStaticMarkup(notice)}</div>`);
  });
});

// The indicator was hard to notice; the edge band is three times its earlier size (12/36px → 36/108px).
test("the glow is a 36px and a 108px accent band at 85% and 50%, pulsing between .7 and 1", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain("box-shadow: inset 0 0 calc(var(--space-3) * 3) color-mix(in srgb, var(--affordance-accent) 85%, transparent), inset 0 0 calc(var(--space-6) * 4.5) color-mix(in srgb, var(--affordance-accent) 50%, transparent);");
  expect(css).toContain("@keyframes doan-agent-glow { 0%, 100% { opacity: .7; } 50% { opacity: 1; } }");
});

// Dogfooding: the tools were small and tight to the board's edges, so they grew (40px controls) and both sit 8px further
// in: the tools 20px above the bottom, the notice 28px under the top. The notice itself went back to its first size.
test("the tools are larger and both overlays sit further from the board's edges", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.doan-canvas-bottom \{[^}]*bottom: var\(--space-5\);/);
  expect(css).toMatch(/\.doan-canvas-top \{[^}]*top: calc\(var\(--space-5\) \+ var\(--space-2\)\);/);
  const tools = readFileSync(new URL("./CanvasTools.tsx", import.meta.url), "utf8");
  // Select and Hand (one mapped button), the Picker, Capture area and Export.
  expect(tools.match(/className="doan-icon-button doan-canvas-tool" data-ui-size="md"/g)).toHaveLength(4);
  const agent = readFileSync(new URL("./CanvasAgent.tsx", import.meta.url), "utf8");
  // Stop, the request's Open and the other worktree's Open.
  expect(agent.match(/doan-agent-action" data-ui-size="sm"/g)).toHaveLength(3);
  expect(css).toMatch(/\.doan-agent-text \{[^}]*font-size: var\(--type-body-sm-size\);/);
});

// Draft terminal-notice: every capsule in the column, the button-less terminal
// notice and the picking hint included, takes the app notice's 40px height; the terminal notice has an even inline inset.
test("the agent notices and the picking hint are 40px tall; the terminal notice's inset is even", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.doan-agent \{[^}]*min-height: var\(--size-control\);/);
  expect(css).toMatch(/\.doan-agent\.doan-agent-terminal \{[^}]*padding: var\(--space-1\) var\(--space-4\);/);
});

// DESIGN 'Terminal work in another worktree' (draft frame picking-hint): the picking hint left the top column for the bottom
// one, 8px (its gap) above the Canvas tools, so agent notices coming and going never move it. It leads with the
// composer pick button's Crosshair at the icon size; the rest is unchanged. App's CanvasPane needs a DOM, so its markup
// is read from the source as the canvas-notice test does.
test("the picking hint sits in the bottom column before the Canvas tools, led by the Crosshair; the top column has none", () => {
  const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const top = source.slice(source.indexOf("<CanvasAgent {...agent}>"), source.indexOf("</CanvasAgent>"));
  expect(top).not.toContain("doan-picking");
  const bottom = source.slice(source.indexOf('<div className="doan-canvas-bottom">'));
  const hint = bottom.indexOf('className="doan-agent doan-picking"'), tools = bottom.indexOf("<CanvasTools");
  expect(hint).toBeGreaterThan(-1);
  expect(hint).toBeLessThan(tools);
  expect(bottom.slice(hint, tools)).toMatch(/role="status"><Crosshair className="doan-picking-icon" aria-hidden="true" \/><span className="doan-agent-text">Click a frame or an element, or Shift-click a spot<\/span>/);
  expect(bottom.slice(hint, tools)).toContain('<span className="doan-kbd" data-ui-variant="on-prominent" aria-hidden="true">Esc</span><span className="sr-only">Press Escape to cancel</span>');
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  // Centred from left: 50%, the column would shrink to the board's right half and squeeze the hint.
  expect(css).toMatch(/\.doan-canvas-bottom \{[^}]*gap: var\(--space-2\);[^}]*width: max-content; max-width: calc\(100% - 2 \* var\(--space-3\)\);/);
  // The widened column is click-through like the top one, so the strips beside Canvas tools still reach the board.
  expect(css).toMatch(/\.doan-canvas-bottom \{[^}]*pointer-events: none;/);
  expect(css).toContain(".doan-canvas-bottom > * { pointer-events: auto; }");
  expect(css).toMatch(/\.doan-picking-icon \{ flex: none; width: var\(--size-icon-sm\); height: var\(--size-icon-sm\); \}/);
});

// Draft frames notice-states and notice-typing: the working notice's words
// from `doan work update`, its caret, its live region and its erase-and-type change.
describe("the working notice's words", () => {
  const term = (patch: Record<string, unknown> = {}) => [{ session: "s1", provider: "claude" as const, root: "/w/a", path: canvas.path, touched: 10, turn: "t1", ...patch }];
  test("a terminal note is the visible text and the status; the caret follows it, out of the status", () => {
    const html = markup([], { work: term({ note: "요금제 빈 상태를 그리는 중" }) });
    expect(html).toContain(LINE("요금제 빈 상태를 그리는 중"));
    expect(html).toContain('<span class="sr-only" role="status">요금제 빈 상태를 그리는 중</span>');
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).not.toContain("<button");
  });
  test("a note with a frame: the status adds the frame's title; the visible text is the note", () => {
    const frames = [{ id: "plans-empty", title: "Plans · empty", x: 0, y: 0, width: 10, height: 10 }];
    const html = markup([], { work: term({ note: "Drawing", frame: "plans-empty" }), frames });
    expect(html).toContain(LINE("Drawing"));
    expect(html).toContain('<span class="sr-only" role="status">Drawing — Plans · empty</span>');
  });
  test("a frame without a note: 'Working on <title>', its id before a layout", () => {
    expect(markup([], { work: term({ frame: "plans" }), frames: [{ id: "plans", title: "Plans", x: 0, y: 0, width: 1, height: 1 }] })).toContain(LINE("Working on Plans"));
    expect(markup([], { work: term({ frame: "plans" }) })).toContain(LINE("Working on plans"));
  });
  test("a project conversation naming this canvas: the glow and the notice without Stop", () => {
    const html = markup([], { conversationWork: [{ conversationId: "p1", root: "/w/a", path: canvas.path, note: "Drawing", touched: 3, turnId: "u1" }] });
    expect(html).toContain("doan-agent-glow");
    expect(html).toContain('<div class="doan-agent doan-agent-terminal">');
    expect(html).toContain(LINE("Drawing"));
    expect(html).not.toContain("<button");
    // Another worktree's conversation on the same path shows nothing here.
    expect(markup([], { conversationWork: [{ conversationId: "p1", root: "/w/b", path: canvas.path, touched: 3, turnId: "u1" }] })).toBe(COLUMN);
  });
  test("the canvas's own conversation keeps Stop with its note", () => {
    const html = markup([summary({})], { conversationWork: [{ conversationId: "c1", root: "/w/a", path: canvas.path, note: "Drawing", touched: 3, turnId: "u1" }] });
    expect(html).toContain(LINE("Drawing"));
    expect(html).toMatch(/>Stop<\/button>/);
  });
  test("waiting: 'Agent needs your answer' and no caret", () => {
    const html = markup([summary({ phase: "waiting" })], { conversationWork: [{ conversationId: "c1", root: "/w/a", path: canvas.path, note: "Drawing", touched: 3, turnId: "u1" }] });
    expect(html).toContain(LINE("Agent needs your answer", ""));
    expect(html).not.toContain("doan-agent-caret");
  });
});

describe("typesOn", () => {
  const at = (patch: Partial<Parameters<typeof typesOn>[1]> = {}) => ({ canvas: "/w/a\0x", visible: true, content: "terminal:s1@1", waiting: false, ...patch });
  test("a new update while the canvas is in view types", () => {
    expect(typesOn(at(), at({ content: "terminal:s1@2" }))).toBe(true);
  });
  test("the card coming with work that started in view types; opening the canvas mid-turn does not", () => {
    expect(typesOn(at({ content: null }), at())).toBe(true);
    expect(typesOn(null, at())).toBe(false);
    expect(typesOn(at({ canvas: "/w/a\0other" }), at({ content: "terminal:s1@2" }))).toBe(false);
  });
  test("coming back to the canvas (hidden, then shown) does not type", () => {
    expect(typesOn(at({ visible: false }), at({ content: "terminal:s1@2" }))).toBe(false);
  });
  test("the same update (a layout turning the id into a title) does not type", () => {
    expect(typesOn(at(), at())).toBe(false);
  });
  test("waiting changes at once", () => {
    expect(typesOn(at(), at({ content: "presence:c1", waiting: true }))).toBe(false);
  });
});

describe("NoticeTyping", () => {
  afterEach(() => vi.useRealTimers());
  const host = (reduced = false) => {
    const shown: TypedText[] = [];
    const measure = vi.fn((_from: string, _to: string) => ({ from: 140, to: 180 }));
    const typing = new NoticeTyping({ show: state => shown.push(state), measure, reducedMotion: () => reduced });
    return { typing, shown, measure };
  };
  test("erases the old end and types the new one on a fake clock, with the floor set then cleared", () => {
    vi.useFakeTimers();
    const { typing, shown, measure } = host();
    typing.set("Working on Plans", false);
    expect(shown.at(-1)).toEqual({ text: "Working on Plans", minWidth: null, typing: false });
    typing.set("Working on Cart", true);
    expect(measure).toHaveBeenCalledOnce();
    expect(measure).toHaveBeenCalledWith("Working on Plans", "Working on Cart");
    expect(shown.at(-1)).toEqual({ text: "Working on Plans", minWidth: 140, typing: true });
    vi.advanceTimersByTime(20);
    expect(shown.at(-1)).toEqual({ text: "Working on Plan", minWidth: 140, typing: true });
    vi.advanceTimersByTime(80);
    expect(shown.at(-1)?.text).toBe("Working on ");
    vi.advanceTimersByTime(35);
    expect(shown.at(-1)?.text).toBe("Working on C");
    vi.advanceTimersByTime(105);
    expect(shown.at(-1)).toEqual({ text: "Working on Cart", minWidth: null, typing: false });
    expect(measure).toHaveBeenCalledOnce();
    typing.dispose();
  });
  test("a replacement midway restarts from the text on screen toward the newest text, measured once more", () => {
    vi.useFakeTimers();
    const { typing, shown, measure } = host();
    typing.set("Working on Plans", false);
    typing.set("Working on Checkout", true);
    vi.advanceTimersByTime(100 + 35 * 2);
    expect(shown.at(-1)?.text).toBe("Working on Ch");
    typing.set("Working on Cart", true);
    expect(measure).toHaveBeenCalledTimes(2);
    expect(measure).toHaveBeenLastCalledWith("Working on Ch", "Working on Cart");
    vi.advanceTimersByTime(1000);
    expect(shown.at(-1)).toEqual({ text: "Working on Cart", minWidth: null, typing: false });
    // The steps toward the replaced text never ran after the replacement.
    expect(shown.map(state => state.text)).not.toContain("Working on Che");
    typing.dispose();
  });
  test("reduced motion and a change not from an update place the text at once, without measuring", () => {
    vi.useFakeTimers();
    const reduced = host(true);
    reduced.typing.set("Agent is working", false);
    reduced.typing.set("Drawing", true);
    expect(reduced.shown.at(-1)).toEqual({ text: "Drawing", minWidth: null, typing: false });
    expect(reduced.measure).not.toHaveBeenCalled();
    const plain = host();
    plain.typing.set("Working on plans", false);
    plain.typing.set("Working on Plans", false);
    expect(plain.shown.at(-1)).toEqual({ text: "Working on Plans", minWidth: null, typing: false });
    expect(plain.measure).not.toHaveBeenCalled();
  });
  test("an immediate change stops a running one", () => {
    vi.useFakeTimers();
    const { typing, shown } = host();
    typing.set("Working on Plans", false);
    typing.set("Working on Checkout", true);
    vi.advanceTimersByTime(40);
    typing.set("Agent needs your answer", false);
    vi.advanceTimersByTime(1000);
    expect(shown.at(-1)).toEqual({ text: "Agent needs your answer", minWidth: null, typing: false });
  });
});

// The caret's look and the marker's; the draft's always-on slide
// is only on a frame change.
test("the caret blinks in two steps once a second, not while typing or under reduced motion, and is CanvasText in forced colours", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.doan-agent-caret \{[^}]*width: calc\(var\(--space-1\) \/ 2\); height: var\(--type-body-sm-size\); background: currentColor; animation: doan-agent-blink 1s step-end infinite;/);
  expect(css).toMatch(/\.doan-agent-row \{[^}]*gap: calc\(var\(--space-1\) \/ 2\);/);
  expect(css).toContain(".doan-agent-caret[data-typing] { animation: none; }");
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.doan-agent-caret \{ animation: none; \}/);
  expect(css).toMatch(/@media \(forced-colors: active\) \{ \.doan-agent-caret \{ forced-color-adjust: none; background: CanvasText; \} \}/);
});

// Moving to another canvas or out of view ends a running change at once, even toward the same words;
// ordinary re-renders while it runs do not.
describe("typing across a canvas or visibility boundary", () => {
  afterEach(() => vi.useRealTimers());
  const at = (patch: Partial<Parameters<typeof crossesBoundary>[1]> = {}) => ({ canvas: "/w/a\0x", visible: true, content: "terminal:s1@1", waiting: false, ...patch });
  test("another canvas or a change of visibility crosses it; a re-render or a new update does not", () => {
    expect(crossesBoundary(at(), at({ canvas: "/w/b\0x" }))).toBe(true);
    expect(crossesBoundary(at(), at({ visible: false }))).toBe(true);
    expect(crossesBoundary(at({ visible: false }), at())).toBe(true);
    expect(crossesBoundary(at(), at())).toBe(false);
    expect(crossesBoundary(at(), at({ content: "terminal:s1@2" }))).toBe(false);
    expect(crossesBoundary(null, at())).toBe(false);
  });
  test("settle ends a running change on its final words, also when they are the same target", () => {
    vi.useFakeTimers();
    const shown: TypedText[] = [];
    const typing = new NoticeTyping({ show: state => shown.push(state), measure: () => ({ from: 100, to: 120 }), reducedMotion: () => false });
    typing.set("Old text", false);
    typing.set("New text", true);
    vi.advanceTimersByTime(20);
    typing.settle("New text");
    expect(shown.at(-1)).toEqual({ text: "New text", minWidth: null, typing: false });
    const count = shown.length;
    vi.advanceTimersByTime(1000);
    expect(shown).toHaveLength(count);
    // An ordinary re-render with the same words while a change runs leaves it running.
    typing.set("Other", true);
    typing.set("Other", false);
    vi.advanceTimersByTime(1000);
    expect(shown.at(-1)).toEqual({ text: "Other", minWidth: null, typing: false });
    expect(shown.filter(state => state.typing).length).toBeGreaterThan(1);
  });
});

// .doan/canvases/doany-artist.html: a 32px window in the 40px card, the card's start inset 8px beside it;
// .doan/canvases/doany-family.html: the three variants in that window.
describe("Doany the artist", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  test("the artist window is 32px, the notice starts 8px from it, and no dot rule is left", () => {
    expect(css).toMatch(/\.doan-agent-artist \{[^}]*width: var\(--size-control-sm\); height: var\(--size-control-sm\);/);
    expect(css).toMatch(/\.doan-agent:has\(> \.doan-agent-artist\) \{ padding-left: var\(--space-2\); \}/);
    expect(css).not.toMatch(/\.doan-agent-dot(?!s)/);
    // A capture leaves the notice out, Doany included.
    expect(css).toMatch(/\[data-capture-snapshot\] :is\([^)]*\.doan-agent-artist/);
  });

  test("each variant shows its own GIF while working and its own first frame while waiting or under reduced motion", () => {
    for (const variant of Object.keys(VARIANTS) as Variant[]) {
      vi.spyOn(Math, "random").mockReturnValue(PICK[variant]);
      expect(markup([summary({})])).toContain('<div class="doan-agent">' + artist(variant, false));
      expect(markup([summary({ phase: "waiting" })])).toContain('<div class="doan-agent">' + artist(variant, true));
      const work = [{ touched: 0, turn: "none:t", session: "s1", provider: "codex" as const, root: "/w/a", path: canvas.path }];
      expect(markup([], { work, running: false })).toContain('<div class="doan-agent doan-agent-terminal">' + artist(variant, true));
    }
  });

  test("a friend's notice shows its one painter, still while waiting, whatever the random pick", () => {
    vi.spyOn(Math, "random").mockReturnValue(PICK.reading);
    for (const id of ["puri", "dungdung", "popo", "dori"] as const) {
      const painter = (still: boolean) => `<span class="doan-agent-artist" aria-hidden="true"><picture><source srcSet="buddies/${id}/artist-rest.png" media="(prefers-reduced-motion: reduce)"/><img src="buddies/${id}/${still ? "artist-rest.png" : "artist.gif"}" alt=""/></picture></span>`;
      expect(markup([summary({})], { buddy: id })).toContain('<div class="doan-agent">' + painter(false));
      expect(markup([summary({ phase: "waiting" })], { buddy: id })).toContain('<div class="doan-agent">' + painter(true));
    }
  });

  test("a notice that mounts again picks again", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(PICK.typing);
    expect(markup([summary({})])).toContain(artist("typing", false));
    random.mockReturnValue(PICK.reading);
    expect(markup([summary({})])).toContain(artist("reading", false));
  });

  test("the artwork is 128 x 128, four times the window, for every variant", () => {
    for (const [gifName, pngName] of Object.values(VARIANTS)) {
      const png = readFileSync(new URL(`./public/doany/${pngName}`, import.meta.url));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([128, 128]);
      const gif = readFileSync(new URL(`./public/doany/${gifName}`, import.meta.url));
      expect(gif.subarray(0, 6).toString("ascii")).toBe("GIF89a");
      expect([gif.readUInt16LE(6), gif.readUInt16LE(8)]).toEqual([128, 128]);
    }
  });
});
