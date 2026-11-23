import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { CanvasRow } from "../main/view";
import { CanvasConversationList, heldOrder, observedRows, RowDelete, RowFocusMemory, type CanvasList } from "./CanvasConversationList";
import { canvasConversationRows } from "./canvasConversationRows";
import { CanvasConversations } from "./RightPanel";
import { TooltipContent, TooltipProvider } from "./components/ui/tooltip";
import type { ThumbnailState } from "./thumbnails";

// PRODUCT §5 item 3 'Project Overview', 'Canvas conversations'.
const NOW = Date.parse("2026-11-01T12:00:00.000Z");
const MIN = 60_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", owner: "doan", provider: "claude", fromHome: true,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: ago(MIN), preview: "Done", ...patch,
});
const row = (patch: Partial<CanvasRow> & { path: string }): CanvasRow => ({ url: `doan://${patch.path}`, width: 1280, ...patch });

const billing = row({ path: ".doan/canvases/billing.html", id: "billing" });
const receipt = row({ path: ".doan/canvases/receipt.html" });
const refunds = row({ path: ".doan/canvases/refunds.html" });
const legacy = row({ path: ".doan/canvases/legacy.html", error: { code: "unreadable", message: "bad" } });
const taxA = row({ path: ".doan/canvases/tax.html", id: "tax" });
const taxB = row({ path: ".doan/canvases/tax-copy.html", id: "tax" });

const rows = canvasConversationRows([
  summary({ conversationId: "b", title: "Ask about the header", provider: "codex", phase: "waiting", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(0), preview: "Needs your answer: Run doan check" }),
  summary({ conversationId: "r", canvas: { path: receipt.path }, lastActivityAt: ago(3 * MIN), preview: "Receipts now show the tax line separately." }),
  summary({ conversationId: "f", canvas: { path: refunds.path }, lastActivityAt: ago(4 * MIN) }),
  summary({ conversationId: "l", canvas: { path: legacy.path }, lastActivityAt: ago(5 * MIN) }),
  summary({ conversationId: "g", phase: "running", canvas: { path: ".doan/canvases/invoice.html" }, lastActivityAt: ago(6 * MIN) }),
  summary({ conversationId: "t", canvas: { path: taxA.path, id: "tax" }, lastActivityAt: ago(7 * MIN) }),
], [billing, receipt, refunds, legacy, taxA, taxB], NOW);

const thumbnails = new Map<string, ThumbnailState>([[billing.path, { kind: "ready", url: "blob:billing" }], [refunds.path, { kind: "failed" }]]);
const noop = () => {};
// React's static render hoists a preload link for each image; the markup under test follows it.
const markup = (node: ReactNode) => renderToStaticMarkup(node).replace(/<link [^>]*\/>/g, "");
const render = (list: CanvasList, thumbs: ReadonlyMap<string, ThumbnailState> = thumbnails, current: string | null = null) => markup(
  <TooltipProvider><CanvasConversationList list={list} current={current} project="acme-web" thumbnails={thumbs} open={noop} retry={noop} onVisible={noop} onDelete={noop} scroller={{ current: null }} title={{ current: null }} /></TooltipProvider>);
const item = (html: string, key: string) => {
  const at = html.indexOf(`data-key="${key}"`);
  return html.slice(html.lastIndexOf("<li", at), html.indexOf("</li>", at));
};

describe("canvas conversation list", () => {
  const html = render(rows);

  test("is one list without its own name; only the panel region is named", () => {
    expect(html.match(/role="list"/g)).toHaveLength(1);
    expect(html).toMatch(/^<ul class="rp-list" role="list">/);
    const panel = markup(<TooltipProvider><CanvasConversations list={rows} current={null} project="acme-web" thumbnails={thumbnails} open={noop} retry={noop} onVisible={noop} onDelete={noop} /></TooltipProvider>);
    expect(panel.match(/aria-label="Conversations"/g)).toHaveLength(1);
    expect(panel).toContain('<aside class="right doan-scroll ov-right" role="region" aria-label="Conversations"><h2 class="phead rp-head" tabindex="-1">Conversations</h2><ul class="rp-list"');
  });

  // Draft frame overview-rows: the head is the conversation's title, the caption line under it the canvas name.
  test("a row draws the provider logo, conversation title, status mark, short time, canvas caption and preview", () => {
    const b = item(html, "b");
    expect(b).toContain('alt="Codex"');
    expect(b).toContain("<b data-state=\"closed\" data-slot=\"tooltip-trigger\">Ask about the header</b>");
    expect(b).toContain('aria-label="Needs your answer"');
    expect(b).toContain('<span aria-hidden="true">now</span><span class="sr-only">Just now</span>');
    expect(b).toMatch(/<\/span><small class="cv-canvas">billing<\/small><span class="cv-preview">Needs your answer: Run doan check<\/span>/);
    // The thumbnail is at the row's end, after the text, so every row's text starts at the same x.
    expect(b).toMatch(/<button type="button" class="cv-row"[^>]*><span class="cv-text">.*<\/span><span class="cv-thumb" aria-hidden="true"><img src="blob:billing" alt=""\/><\/span><\/button>/);
    expect(item(html, "r")).toContain('<span aria-hidden="true">3m</span><span class="sr-only">3 minutes ago</span>');
  });

  test("each conversation of one canvas is its own row with its own title; an empty title reads Conversation", () => {
    const three = render(canvasConversationRows([
      summary({ conversationId: "x1", title: "Tighten the checkout summary spacing", phase: "running", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(0) }),
      summary({ conversationId: "x2", title: "Add an empty state", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(2 * MIN) }),
      summary({ conversationId: "x3", title: "  ", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(3 * MIN) }),
    ], [billing], NOW));
    expect(three.match(/class="cv-row"/g)).toHaveLength(3);
    expect(item(three, "x1")).toContain("<b data-state=\"closed\" data-slot=\"tooltip-trigger\">Tighten the checkout summary spacing</b>");
    expect(item(three, "x2")).toContain("<b data-state=\"closed\" data-slot=\"tooltip-trigger\">Add an empty state</b>");
    expect(item(three, "x3")).toContain("<b data-state=\"closed\" data-slot=\"tooltip-trigger\">Conversation</b>");
    for (const key of ["x1", "x2", "x3"]) expect(item(three, key)).toContain('<small class="cv-canvas">billing</small>');
    expect(three.indexOf('data-key="x1"')).toBeLessThan(three.indexOf('data-key="x2"'));
    expect(three.indexOf('data-key="x2"')).toBeLessThan(three.indexOf('data-key="x3"'));
  });

  test("one Tab stop: the first row (with its Delete), the others reached with the arrow keys", () => {
    expect(html.match(/tabindex="0"/g)).toHaveLength(2);
    expect(item(html, "b").match(/tabindex="0"/g)).toHaveLength(2);
    for (const key of ["r", "f", "l", "g", "t"]) expect(item(html, key)).toContain('tabindex="-1"');
  });

  test("a ready preview is an image; without one the empty style is named Preview loading or Preview unavailable", () => {
    expect(item(html, "b")).toContain('<span class="cv-thumb" aria-hidden="true"><img src="blob:billing" alt=""/></span>');
    expect(item(html, "r")).toContain('<span class="cv-thumb empty"><span class="sr-only">Preview loading</span></span>');
    expect(item(html, "f")).toContain('<span class="cv-thumb empty"><span class="sr-only">Preview unavailable</span></span>');
    for (const key of ["l", "g", "t"]) expect(item(html, key)).toContain('<span class="cv-thumb empty"><span class="sr-only">Preview unavailable</span></span>');
    const noWidth = canvasConversationRows([summary({ conversationId: "w", canvas: { path: ".doan/canvases/w.html" } })], [{ path: ".doan/canvases/w.html", url: "doan://w" }], NOW);
    expect(render(noWidth)).toContain('<span class="sr-only">Preview unavailable</span>');
    // A pending reply after a ready image keeps the image (ThumbnailRequests); a pending state alone is loading.
    expect(render(rows, new Map([[receipt.path, { kind: "pending" }]]))).toContain('<span class="sr-only">Preview loading</span>');
  });

  test("the thumbnail observer finds only rows with a listed canvas", () => {
    expect(html.match(/data-path="/g)).toHaveLength(4);
    expect(item(html, "g")).not.toContain("data-path");
    expect(item(html, "t")).not.toContain("data-path");
  });

  test("a deleted canvas and a shared id are disabled, their reason the description", () => {
    // Draft frame overview-rows: the head is the conversation's title; the caption line carries the canvas name and
    // the reason.
    for (const [key, name, reason] of [["g", "invoice", "No longer in acme-web"], ["t", "tax", "2 canvases use this ID. Run doan check in a terminal."]] as const) {
      const li = item(html, key);
      expect(li).toContain('aria-disabled="true"');
      const why = /aria-describedby="([^"]+)"/.exec(li)![1]!;
      expect(li).toContain(`<small id="${why}" class="cv-canvas err">${name} · ${reason}</small>`);
      const label = /aria-labelledby="([^"]+)"/.exec(li)![1]!;
      expect(li).toContain(`<b id="${label}" data-state="closed" data-slot="tooltip-trigger">Draw it</b>`);
    }
  });

  test("an unreadable canvas opens, with the sidebar's sentence", () => {
    const li = item(html, "l");
    expect(li).not.toContain("aria-disabled");
    expect(li).toContain('class="cv-canvas note">legacy · Can’t read this canvas. Run doan check in a terminal.</small>');
  });

  // Draft frames cv-delete, cv-special: the title menu's Delete on every row.
  test("every row, special rows included, has a Delete beside its row button, named by the conversation", () => {
    for (const key of ["b", "r", "f", "l", "g", "t"]) {
      const li = item(html, key);
      expect(li, key).toMatch(/<\/button><button type="button" class="doan-icon-button cv-delete"[^>]*aria-label="Delete “[^"]*”"/);
    }
    expect(item(html, "b")).toContain('aria-label="Delete “Ask about the header”"');
    expect(item(html, "r")).toContain('aria-label="Delete “Draw it”"');
  });

  test("Delete follows its row's Tab stop, so Tab moves between the row and its Delete", () => {
    expect(item(html, "b").match(/tabindex="0"/g)).toHaveLength(2);
    for (const key of ["r", "f", "l", "g", "t"]) expect(item(html, key)).not.toContain('tabindex="0"');
  });

  test("a working or waiting conversation's Delete is unavailable and reads its reason", () => {
    for (const [key, reason] of [["b", "The agent is waiting for your answer."], ["g", "The agent is working on this conversation."]] as const) {
      const li = item(html, key);
      const button = /<button type="button" class="doan-icon-button cv-delete"[^>]*>/.exec(li)![0];
      expect(button).toContain('aria-disabled="true"');
      const why = /aria-describedby="([^"]+)"/.exec(button)![1]!;
      expect(li).toContain(`<span class="sr-only" id="${why}">${reason}</span>`);
    }
    expect(/<button type="button" class="doan-icon-button cv-delete"[^>]*>/.exec(item(html, "r"))![0]).not.toContain("aria-disabled");
  });

  test("the row button itself is unchanged: Delete is a sibling, never inside it", () => {
    for (const key of ["b", "g"]) {
      const li = item(html, key);
      const rowButton = li.slice(li.indexOf('<button type="button" class="cv-row"'), li.indexOf("</button>") + "</button>".length);
      expect(rowButton).not.toContain("cv-delete");
    }
  });

  test("no conversations: the empty state", () => {
    expect(render([])).toBe('<div class="rp-empty"><p>No conversations yet.</p><p>Conversations you start in the Overview or on a canvas show here.</p></div>');
  });

  test("the empty state is a dashed box, as the sidebar's empty groups are", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.rp-empty \{[^}]*border: 1px dashed var\(--border-standard\);[^}]*border-radius: var\(--radius-chip\);/);
  });

  test("the loading status mounts empty before its content appears", () => {
    expect(render("loading")).toBe('<p class="rp-loading" role="status"></p>');
  });

  // U39: the panel is white, where a panel button has no fill; subtle keeps one.
  test("a failed read offers Retry", () => {
    // DESIGN 'No coloured edge stripes': an error leads with the alert icon, so colour is not its only signal.
    expect(render("error")).toMatch(/^<div class="rp-error" role="status"><svg[^>]*class="[^"]*\bdoan-alert-icon\b[^"]*"[^>]*>.*?<\/svg><span>Couldn’t read conversations<\/span><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="subtle">Retry<\/button><\/div>$/);
  });

  // D11: busy while the list is read again; the same failure again changes the line by a no-break space.
  test("Retry runs while the list is read again, and a repeated failure is announced again", () => {
    const html = (listRetry: { running: boolean; failures: number }) => markup(<TooltipProvider><CanvasConversationList list="error" listRetry={listRetry} current={null} project="acme-web" thumbnails={thumbnails}
      open={noop} retry={noop} onVisible={noop} onDelete={noop} scroller={{ current: null }} title={{ current: null }} /></TooltipProvider>);
    expect(html({ running: true, failures: 0 }).replace(/<svg.*?<\/svg>/, "<svg/>")).toBe('<div class="rp-error" role="status"><svg/><span>Couldn’t read conversations</span><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="subtle" aria-disabled="true" aria-busy="true"><span class="doan-spinner" aria-hidden="true"></span>Retry</button></div>');
    expect(html({ running: false, failures: 1 })).toContain("<span>Couldn’t read conversations\u00a0</span>");
  });
});

// The Overview's Conversations list: project conversations beside canvas conversations (draft overview-conversation-list).
describe("project rows", () => {
  const mixed = canvasConversationRows([
    summary({ conversationId: "p1", title: "Pricing page copy", phase: "running", working: true, lastActivityAt: ago(0), preview: "Writing three options" }),
    summary({ conversationId: "b", title: "Ask about the header", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(MIN) }),
    summary({ conversationId: "p2", title: "Audit the onboarding copy", lastActivityAt: ago(2 * MIN), preview: "Done" }),
    summary({ conversationId: "p3", title: "", readError: true, lastActivityAt: "", preview: "" }),
  ], [billing], NOW);
  const html = render(mixed);

  test("a project row draws the head and preview without a thumbnail or a visible caption; screen readers hear Overview", () => {
    const p2 = item(html, "p2");
    expect(p2).not.toContain("cv-thumb");
    expect(p2).not.toContain("Preview unavailable");
    expect(p2).not.toContain('class="cv-canvas"');
    expect(p2).toMatch(/<button type="button" class="cv-row" data-key="p2"[^>]*><span class="cv-text"><span class="cv-head"><img class="logo"[^>]*alt="Claude Code"\/>.*Audit the onboarding copy.*<\/span><small class="sr-only">Overview<\/small><span class="cv-preview">Done<\/span><\/span><\/button>/);
  });

  test("an unreadable project conversation reads Conversation and the unreadable preview, without a time, and stays enabled", () => {
    const p3 = item(html, "p3");
    expect(p3).toContain(">Conversation</b>");
    expect(p3).toContain('<span class="cv-preview">Can’t read this conversation</span>');
    expect(p3).not.toContain("cv-when");
    expect(p3).not.toContain("aria-disabled=\"true\" aria-labelledby");
    expect(/<button type="button" class="cv-row"[^>]*>/.exec(p3)![0]).not.toContain("aria-disabled");
  });

  test("a project row shows its status mark and has the row Delete, unavailable while its agent works", () => {
    const p1 = item(html, "p1");
    expect(p1).toContain('aria-label="Working"');
    const button = /<button type="button" class="doan-icon-button cv-delete"[^>]*>/.exec(p1)![0];
    expect(button).toContain('aria-label="Delete “Pricing page copy”"');
    expect(button).toContain('aria-disabled="true"');
    expect(/<button type="button" class="doan-icon-button cv-delete"[^>]*>/.exec(item(html, "p2"))![0]).not.toContain("aria-disabled");
  });

  test("project rows take no part in thumbnails: no data-path, nothing observed", () => {
    for (const key of ["p1", "p2", "p3"]) expect(item(html, key)).not.toContain("data-path");
    expect(observedRows(mixed)).toBe(`b\0${billing.path}`);
    expect(observedRows(mixed.filter(r => r.kind === "project"))).toBe("");
  });

  test("the shown project conversation's row is current: aria-current, and the list's Tab stop", () => {
    const shown = render(mixed, thumbnails, "p2");
    expect(/<button type="button" class="cv-row"[^>]*>/.exec(item(shown, "p2"))![0]).toContain('aria-current="true"');
    expect(shown.match(/aria-current/g)).toHaveLength(1);
    expect(item(shown, "p2").match(/tabindex="0"/g)).toHaveLength(2);
    expect(item(shown, "p1")).not.toContain('tabindex="0"');
  });

  test("no current row in the new conversation state, nor for a shown conversation the list does not have yet; the first row is the Tab stop", () => {
    for (const current of [null, "p9"]) {
      const shown = render(mixed, thumbnails, current);
      expect(shown).not.toContain("aria-current");
      expect(item(shown, "p1").match(/tabindex="0"/g)).toHaveLength(2);
    }
  });

  // POSTMORTEM 2026-11-23: the list read and the Overview's view arrive apart. A promoted conversation's row is a canvas
  // row under the same key, whichever of the two came first.
  test("a canvas row is never current, even under the shown conversation's key", () => {
    const promoted = canvasConversationRows([summary({ conversationId: "p1", canvas: { path: billing.path, id: "billing" }, startedBy: "promotion" })], [billing], NOW);
    expect(promoted[0]!.kind).toBe("canvas");
    for (const current of ["p1", null]) expect(render(promoted, thumbnails, current)).not.toContain("aria-current");
  });

  test("the current row keeps the pressed fill under the pointer and beside Delete's hover, and hides the hairlines beside it", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.cv-row\[aria-current="true"\][^{]*\{[^}]*background: var\(--affordance-backdrop-pressed\);/);
    expect(css).toMatch(/\.cv-row\[aria-current="true"\]:not\(\[aria-disabled="true"\]\):hover/);
    expect(css).toMatch(/\.cv-item:has\(> \.cv-delete:hover\) > \.cv-row\[aria-current="true"\]/);
    expect(css).toMatch(/\.cv-item:has\(> \.cv-row\[aria-current="true"\]\)::before/);
  });

  test("rows have no minimum height, so a project row is as tall as its text", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    const rule = /\n\.cv-row \{[^}]*\}/.exec(css)![0];
    expect(rule).not.toContain("min-height");
  });
});

// The order to draw while the pointer or keyboard focus is in the list: kept rows keep their places, new rows join at
// the end in the list's own order, rows that left go (the sidebar's viewed-canvas list, titleMenuOrder).
describe("heldOrder", () => {
  test("no hold: the list's own order", () => {
    expect(heldOrder(["a", "b", "c"], null)).toEqual(["a", "b", "c"]);
  });

  test("held: the drawn order stays, a new row joins at the end, a row that left goes", () => {
    expect(heldOrder(["c", "a", "b"], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(heldOrder(["d", "c", "a"], ["a", "b", "c"])).toEqual(["a", "c", "d"]);
    expect(heldOrder(["e", "d"], ["a", "b"])).toEqual(["e", "d"]);
  });
});

// Only the row that still holds focus hands it on when it leaves; a row the person moved away from takes none.
describe("RowFocusMemory", () => {
  test("a focused row that leaves hands focus to the next row, else the previous, else the title", () => {
    const memory = new RowFocusMemory();
    memory.focus("a");
    expect(memory.left(["a", "b"], ["b"], false)).toEqual({ kind: "row", key: "b" });
    memory.focus("b");
    expect(memory.left(["a", "b"], ["a"], false)).toEqual({ kind: "row", key: "a" });
    memory.focus("a");
    expect(memory.left(["a"], [], false)).toEqual({ kind: "title" });
  });

  test("a row still listed keeps focus, and the memory stays", () => {
    const memory = new RowFocusMemory();
    memory.focus("a");
    expect(memory.left(["a", "b"], ["b", "a"], false)).toBeNull();
    expect(memory.left(["b", "a"], ["b"], false)).toEqual({ kind: "row", key: "b" });
  });

  test("a click in empty space ends the memory: the row's later removal moves no focus", () => {
    const memory = new RowFocusMemory();
    memory.focus("a");
    memory.blur("a", null);
    memory.pointer(false);
    expect(memory.left(["a", "b"], ["b"], false)).toBeNull();
  });

  test("a pointer press on a row, or a window blur, keeps it", () => {
    const memory = new RowFocusMemory();
    memory.focus("a");
    memory.pointer(true);
    memory.blur("a", null);
    expect(memory.left(["a", "b"], ["b"], false)).toEqual({ kind: "row", key: "b" });
  });

  test("focus moved to another element ends it, and so does focus found elsewhere at removal", () => {
    const memory = new RowFocusMemory();
    memory.focus("a");
    memory.blur("a", {});
    expect(memory.left(["a", "b"], ["b"], false)).toBeNull();
    memory.focus("b");
    expect(memory.left(["a", "b"], ["a"], true)).toBeNull();
    expect(memory.left(["a"], [], false)).toBeNull();
  });
});

// Another conversation's row on the same canvas keeps the path but is a new button to observe.
describe("observedRows", () => {
  test("changes when a row's conversation changes on the same canvas", () => {
    const [first] = canvasConversationRows([summary({ conversationId: "c1", canvas: { path: billing.path, id: "billing" } })], [billing], NOW);
    const [second] = canvasConversationRows([summary({ conversationId: "c2", canvas: { path: billing.path, id: "billing" } })], [billing], NOW);
    expect(observedRows([first!])).not.toBe(observedRows([second!]));
    expect(observedRows([first!])).toBe(observedRows([{ ...first! }]));
  });

  test("leaves out rows without a listed canvas, and is empty without any", () => {
    expect(observedRows(rows.filter(r => r.kind === "canvas" && r.row === null))).toBe("");
    expect(observedRows(rows)).toContain(billing.path);
  });
});

// The Delete's press. Where focus goes after the delete is computed before the
// confirmation opens, since the alert takes focus from the list.
function tree(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(tree);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...tree(node.props.children as ReactNode)];
}
const text = (node: ReactNode): string => Array.isArray(node) ? node.map(text).join("") : typeof node === "string" ? node : isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : "";
describe("RowDelete", () => {
  const listed = canvasConversationRows([
    summary({ conversationId: "a", canvas: { path: billing.path, id: "billing" }, lastActivityAt: ago(0) }),
    summary({ conversationId: "b", canvas: { path: receipt.path }, lastActivityAt: ago(MIN) }),
    summary({ conversationId: "c", canvas: { path: refunds.path }, lastActivityAt: ago(2 * MIN) }),
    summary({ conversationId: "w", phase: "running", working: true, canvas: { path: legacy.path }, lastActivityAt: ago(3 * MIN) }),
  ], [billing, receipt, refunds, legacy], NOW);
  const of = (key: string) => listed.find(row => row.key === key)!;
  const press = (key: string, keys: readonly string[]) => {
    const onDelete = vi.fn();
    const nodes = tree(RowDelete({ item: of(key), keys, tabbable: false, onDelete, onFocus: noop }));
    const button = nodes.find(element => element.type === "button")!;
    const element = { name: `Delete ${key}` };
    (button.props.onClick as (event: { currentTarget: unknown }) => void)({ currentTarget: element });
    return { onDelete, element, nodes };
  };

  test("asks to delete with its button and the next row as focus target, else the previous row, else the panel title", () => {
    const next = press("a", ["a", "b", "c"]);
    expect(next.onDelete).toHaveBeenCalledWith(of("a"), next.element, { kind: "row", key: "b" });
    const last = press("c", ["a", "b", "c"]);
    expect(last.onDelete).toHaveBeenCalledWith(of("c"), last.element, { kind: "row", key: "b" });
    const only = press("a", ["a"]);
    expect(only.onDelete).toHaveBeenCalledWith(of("a"), only.element, { kind: "title" });
  });

  test("an unavailable Delete does nothing; its tooltip gives the reason, an available one says Delete conversation", () => {
    const working = press("w", ["a", "w"]);
    expect(working.onDelete).not.toHaveBeenCalled();
    expect(text(working.nodes.find(element => element.type === TooltipContent)!.props.children as ReactNode)).toBe("The agent is working on this conversation.");
    expect(text(press("a", ["a"]).nodes.find(element => element.type === TooltipContent)!.props.children as ReactNode)).toBe("Delete conversation");
  });
});
