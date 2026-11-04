import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { FolderEntry } from "../main/view";
import { CanvasAgent } from "./CanvasAgent";
import { TooltipProvider } from "./components/ui/tooltip";

// buzz-canvas R5: the board's agent indicator (.doan/canvases/buzz-canvas.html 'agent-working', 'agent-waiting'), drawn
// from main's conversation list for the open canvas.
const canvas = { path: ".doan/canvases/billing.html", id: "billing" };
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", state: "current", owner: "doan", provider: "codex", fromHome: true,
  phase: "running", unseen: false, queued: 0, working: true, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "",
  canvas, ...patch,
});
const markup = (list: readonly ConversationSummary[] | "loading" | "error" | undefined, over: Partial<Parameters<typeof CanvasAgent>[0]> = {}) =>
  renderToStaticMarkup(<TooltipProvider><CanvasAgent list={list} canvas={{ root: "/w/a", canvas }} running={true} work={[]} entries={[]} onOpen={vi.fn()} onOpenSibling={vi.fn()} onStopFailed={vi.fn()} {...over} /></TooltipProvider>);
// Without an indicator the column stays, empty, for the canvas notices.
const COLUMN = '<div class="doan-canvas-top"></div>';
const tag = (html: string, pattern: string) => html.match(new RegExp(`<[a-z0-9]+[^>]*${pattern}[^>]*>`))?.[0] ?? "";

describe("CanvasAgent", () => {
  test("working: the edge glow with the dot field, and the notice with the moving dot, the label and Stop", () => {
    const html = markup([summary({})]);
    const glow = tag(html, 'class="doan-agent-glow"');
    expect(glow).toContain('aria-hidden="true"');
    expect(html).toMatch(/<div class="doan-agent-glow"[^>]*><canvas class="doan-agent-dots"><\/canvas><\/div>/);
    expect(html).toContain('class="doan-canvas-top"');
    expect(tag(html, 'class="doan-agent"')).toBeTruthy();
    expect(html).toMatch(/<span class="doan-agent-dot" aria-hidden="true"><\/span>/);
    // Only the wording is the live region: the button's name is not announced with it.
    expect(html).toMatch(/<span class="doan-agent-text" role="status">Agent is working<\/span>/);
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

  test("waiting: a still dot, 'needs your answer' and Open named for the request; no Stop", () => {
    const html = markup([summary({ phase: "waiting" })]);
    expect(html).toContain('class="doan-agent-dot" data-steady=""');
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

  // terminal-agent-activity (draft terminal-notice, user decision D1): a terminal session shows the glow, the dot field
  // and the app notice's text with no button; the text is the status itself.
  test("a terminal session: the glow and the notice with its moving dot and text, and no button", () => {
    const work = [{ session: "s1", provider: "codex" as const, root: "/w/a", path: canvas.path }];
    const html = markup([], { work });
    expect(html).toMatch(/<div class="doan-agent-glow"[^>]*><canvas class="doan-agent-dots"><\/canvas><\/div>/);
    expect(html).toContain('<div class="doan-agent doan-agent-terminal"><span class="doan-agent-dot" aria-hidden="true"></span><span class="doan-agent-text" role="status">Agent is working</span></div>');
    expect(html).not.toContain("<button");
    // Another worktree's session on the same path shows nothing here.
    expect(markup([], { work: [{ ...work[0]!, root: "/w/b" }] })).toBe(COLUMN);
  });

  test("an app conversation on the canvas keeps its Stop over a terminal session", () => {
    const html = markup([summary({})], { work: [{ session: null, provider: null, root: "/w/a", path: canvas.path }] });
    expect(html).toContain('<div class="doan-agent">');
    expect(html).toMatch(/>Stop<\/button>/);
  });

  // terminal-work-worktrees design §3.1 (draft frame sibling-notice): another worktree of this project works on this
  // canvas's path while this checkout has nothing on it. One notice, no glow or dot field, Open named for the worktree.
  describe("another worktree's work on this path", () => {
    const COMMON = "/repo/.git";
    const git = (branch?: string) => ({ common: COMMON, main: "/w/a", worktrees: ["/w/a", "/w/b"], ...(branch === undefined ? {} : { branch }) });
    const row = { path: canvas.path, id: canvas.id, url: "u" };
    const entries = (branch?: string): FolderEntry[] => [
      { path: "/w/a", kind: "list", servedRev: 0, canvases: [row], git: git("main") },
      { path: "/w/b", kind: "list", servedRev: 0, canvases: [row], git: git(branch) },
    ];
    const there = [{ session: "s1", provider: "claude" as const, root: "/w/b", path: canvas.path }];
    test("the notice says where the agent works, with Open named for that worktree, and takes no focus", () => {
      const html = markup([], { work: there, entries: entries("feat/checkout-copy") });
      expect(html).not.toContain("doan-agent-glow");
      const notice = tag(html, 'class="doan-agent doan-agent-sibling"');
      expect(notice).toMatch(/^<div/);
      expect(html).toMatch(/<span class="doan-agent-dot" aria-hidden="true"><\/span>/);
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
      const html = renderToStaticMarkup(<TooltipProvider><CanvasAgent list={[]} canvas={{ root: "/w/a", canvas }} running={true} work={there} entries={entries("feat/x")} onOpen={vi.fn()} onOpenSibling={vi.fn()} onStopFailed={vi.fn()}>{notice}</CanvasAgent></TooltipProvider>);
      expect(html.indexOf("doan-agent-sibling")).toBeGreaterThan(-1);
      expect(html.indexOf("doan-agent-sibling")).toBeLessThan(html.indexOf('class="doan-notice doan-panel"'));
    });
  });

  // buzz-canvas R6: the canvas notices stack in the same top-centre column, the agent notice first.
  test("the canvas notices App puts in the column lead with the alert icon, like every shared notice", () => {
    // App's CanvasPane is not rendered without a DOM; its markup is read from the source (DESIGN 'Notices': every
    // notice has the 16px icon on its first line).
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const column = source.slice(source.indexOf("<CanvasAgent {...agent}>"), source.indexOf("</CanvasAgent>"));
    const notices = column.match(/<div className="doan-notice[^"]*"[^>]*>.*?<\/div>/g) ?? [];
    // The selection-lost notice left the column for a toast (dogfooding); the error and unlisted notices stay.
    expect(notices).toHaveLength(2);
    for (const notice of notices) expect(notice).toMatch(/^<div className="doan-notice doan-panel" role="status"><AlertIcon \/><span className="grow-text">.*<\/span><\/div>$/);
  });

  test("the canvas notices come after the agent notice in the column, and alone when no indicator shows", () => {
    const notice = <div className="doan-notice doan-panel" role="status">The selection is no longer in the canvas.</div>;
    const html = renderToStaticMarkup(<CanvasAgent list={[summary({})]} canvas={{ root: "/w/a", canvas }} running={true} work={[]} entries={[]} onOpen={vi.fn()} onOpenSibling={vi.fn()} onStopFailed={vi.fn()}>{notice}</CanvasAgent>);
    expect(html.indexOf('class="doan-agent"')).toBeGreaterThan(-1);
    expect(html.indexOf('class="doan-agent"')).toBeLessThan(html.indexOf('class="doan-notice doan-panel"'));
    expect(html.match(/class="doan-canvas-top"/g)).toHaveLength(1);
    const alone = renderToStaticMarkup(<CanvasAgent list={undefined} canvas={null} running={true} work={[]} entries={[]} onOpen={vi.fn()} onOpenSibling={vi.fn()} onStopFailed={vi.fn()}>{notice}</CanvasAgent>);
    expect(alone).toBe(`<div class="doan-canvas-top">${renderToStaticMarkup(notice)}</div>`);
  });
});

// Dogfooding #4: the indicator was hard to notice; the edge band grows by half (8/24px → 12/36px) and reads stronger.
test("the glow is a 12px and a 36px accent band at 85% and 50%, pulsing between .7 and 1", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain("box-shadow: inset 0 0 var(--space-3) color-mix(in srgb, var(--affordance-accent) 85%, transparent), inset 0 0 calc(var(--space-6) * 1.5) color-mix(in srgb, var(--affordance-accent) 50%, transparent);");
  expect(css).toContain("@keyframes doan-agent-glow { 0%, 100% { opacity: .7; } 50% { opacity: 1; } }");
});

// Dogfooding: the tools were small and tight to the board's edges, so they grew (40px controls) and both sit 8px further
// in: the tools 20px above the bottom, the notice 28px under the top. The notice itself went back to its first size.
test("the tools are larger and both overlays sit further from the board's edges", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.doan-canvas-bottom \{[^}]*bottom: var\(--space-5\);/);
  expect(css).toMatch(/\.doan-canvas-top \{[^}]*top: calc\(var\(--space-5\) \+ var\(--space-2\)\);/);
  const tools = readFileSync(new URL("./CanvasTools.tsx", import.meta.url), "utf8");
  expect(tools.match(/className="doan-icon-button doan-canvas-tool" data-ui-size="md"/g)).toHaveLength(2);
  const agent = readFileSync(new URL("./CanvasAgent.tsx", import.meta.url), "utf8");
  // Stop, the request's Open and the other worktree's Open.
  expect(agent.match(/doan-agent-action" data-ui-size="sm"/g)).toHaveLength(3);
  expect(css).toMatch(/\.doan-agent-text \{[^}]*font-size: var\(--type-body-sm-size\);/);
});

// terminal-agent-activity user decision D2 (draft terminal-notice): every capsule in the column, the button-less terminal
// notice and the picking hint included, takes the app notice's 40px height; the terminal notice has an even inline inset.
test("the agent notices and the picking hint are 40px tall; the terminal notice's inset is even", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.doan-agent \{[^}]*min-height: var\(--size-control\);/);
  expect(css).toMatch(/\.doan-agent\.doan-agent-terminal \{[^}]*padding: var\(--space-1\) var\(--space-4\);/);
});

// terminal-work-worktrees design §3.6 (draft frame picking-hint): the picking hint left the top column for the bottom
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
