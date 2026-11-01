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
  renderToStaticMarkup(<CanvasAgent list={list} canvas={canvas} running={true} onOpen={vi.fn()} onStopFailed={vi.fn()} {...over} />);
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
    expect(html).toMatch(/<span class="doan-agent-text" role="status">Codex is working<\/span>/);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    const stop = tag(html, 'class="doan-button doan-agent-action"');
    expect(stop).toMatch(/^<button/);
    expect(stop).toContain('data-ui-size="sm"');
    expect(stop).not.toContain("disabled");
    expect(html).toMatch(/>Stop<\/button>/);
  });

  test("waiting: a still dot, 'needs your answer' and Open named for the request; no Stop", () => {
    const html = markup([summary({ phase: "waiting" })]);
    expect(html).toContain('class="doan-agent-dot" data-steady=""');
    expect(html).toContain("Codex needs your answer");
    expect(tag(html, 'aria-label="Open the request"')).toMatch(/^<button/);
    expect(html).toMatch(/>Open<\/button>/);
    expect(html).not.toMatch(/>Stop</);
  });

  test("nothing shows for an ended turn, another canvas's or a project conversation", () => {
    const { canvas: _c, ...project } = summary({});
    for (const list of [[summary({ phase: "ended" })], [summary({ canvas: { path: ".doan/canvases/other.html", id: "other" } })], [project]]) {
      expect(markup(list)).toBe("");
    }
  });

  test("nothing shows on an unlisted page or a project problem (no canvas)", () => {
    expect(markup([summary({})], { canvas: null })).toBe("");
  });

  test("nothing shows before the first list read", () => {
    expect(markup("loading")).toBe("");
    expect(markup("error")).toBe("");
  });
});
