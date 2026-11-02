import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import { CanvasAgent } from "./CanvasAgent";

// buzz-canvas R5: the board's agent indicator (.doan/canvases/buzz-canvas.html 'agent-working', 'agent-waiting'), drawn
// from main's conversation list for the open canvas.
const canvas = { path: ".doan/canvases/billing.html", id: "billing" };
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", state: "current", owner: "doan", provider: "codex", fromHome: true,
  phase: "running", unseen: false, queued: 0, working: true, lastActivityAt: "2026-11-01T12:00:00.000Z", preview: "",
  canvas, ...patch,
});
const markup = (list: readonly ConversationSummary[] | "loading" | "error" | undefined, over: Partial<Parameters<typeof CanvasAgent>[0]> = {}) =>
  renderToStaticMarkup(<CanvasAgent list={list} canvas={{ root: "/w/a", canvas }} running={true} onOpen={vi.fn()} onStopFailed={vi.fn()} {...over} />);
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
    const html = renderToStaticMarkup(<CanvasAgent list={[summary({})]} canvas={{ root: "/w/a", canvas }} running={true} onOpen={vi.fn()} onStopFailed={vi.fn()}>{notice}</CanvasAgent>);
    expect(html.indexOf('class="doan-agent"')).toBeGreaterThan(-1);
    expect(html.indexOf('class="doan-agent"')).toBeLessThan(html.indexOf('class="doan-notice doan-panel"'));
    expect(html.match(/class="doan-canvas-top"/g)).toHaveLength(1);
    const alone = renderToStaticMarkup(<CanvasAgent list={undefined} canvas={null} running={true} onOpen={vi.fn()} onStopFailed={vi.fn()}>{notice}</CanvasAgent>);
    expect(alone).toBe(`<div class="doan-canvas-top">${renderToStaticMarkup(notice)}</div>`);
  });
});

// Dogfooding #4: the indicator was hard to notice; the edge band grows by half (8/24px → 12/36px) and reads stronger.
test("the glow is a 12px and a 36px accent band at 85% and 50%, pulsing between .7 and 1", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain("box-shadow: inset 0 0 var(--space-3) color-mix(in srgb, var(--affordance-accent) 85%, transparent), inset 0 0 calc(var(--space-6) * 1.5) color-mix(in srgb, var(--affordance-accent) 50%, transparent);");
  expect(css).toContain("@keyframes doan-agent-glow { 0%, 100% { opacity: .7; } 50% { opacity: 1; } }");
});

// Dogfooding: the tools and the agent notice were small and tight to the board's edges. Both grow (40px controls)
// and sit 8px further in: the tools 20px above the bottom, the notice 28px under the top.
test("the tools and the agent notice are larger and further from the board's edges", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.doan-canvas-bottom \{[^}]*bottom: var\(--space-5\);/);
  expect(css).toMatch(/\.doan-canvas-top \{[^}]*top: calc\(var\(--space-5\) \+ var\(--space-2\)\);/);
  const tools = readFileSync(new URL("./CanvasTools.tsx", import.meta.url), "utf8");
  expect(tools.match(/className="doan-icon-button doan-canvas-tool" data-ui-size="md"/g)).toHaveLength(2);
  const agent = readFileSync(new URL("./CanvasAgent.tsx", import.meta.url), "utf8");
  expect(agent).not.toContain('doan-agent-action" data-ui-size="sm"');
  expect(css).toMatch(/\.doan-agent-text \{[^}]*font-size: var\(--type-label-size\);/);
});
